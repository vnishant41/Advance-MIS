"""
Dashboard API — KPIs, trends, team stats, activity feed.
"""
from datetime import datetime, date, timedelta, timezone
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import (
    MasterLog, KanbanTask, User, MISReportUpload, Notification,
    Report, ReportGroup, CommodityConfig,
)
from app.auth import get_current_user, role_at_least

dashboard_bp = Blueprint('dashboard', __name__)


def _today_str():
    return date.today().isoformat()


def _filter_logs_by_role(query, user):
    """Apply role-based filtering to master log queries."""
    if user.role == 'SuperAdmin':
        return query.filter(MasterLog.row_status != 'Amended')
    elif user.role == 'Manager':
        dept_users = [u.email for u in User.query.filter_by(department=user.department).all()]
        return query.filter(MasterLog.row_status != 'Amended', MasterLog.on_behalf_of_email.in_(dept_users))
    else:
        return query.filter(MasterLog.row_status != 'Amended', MasterLog.on_behalf_of_email == user.email)


@dashboard_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_stats():
    """Today's KPI counters — all anchored to "scheduled today".

    All four numbers describe the SAME pool: the set of work items the user
    is supposed to handle today (per their personal schedule, overrides,
    handovers, role). For every such item we look up the matching MasterLog
    or RosterLog and bucket it:
        done    — log exists with status='Done'
        pending — no log yet, or log.status='Pending'
        skip    — log.status='Skip'
        late    — any log row for today flagged is_late (status-agnostic)
    This way Done + Pending + Skip = Total (= "scheduled today"), so the
    KPI cards are a coherent breakdown instead of mixing dataset shapes.
    """
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    from app.routes.tasks import (
        _get_mis_tasks, _get_du_tasks, _get_report_group_tasks,
        _filter_tasks_for_user, should_fire_with_override,
        _load_override_index,
        _active_handover_principals, _matches_any_principal, _build_name_lookup,
    )
    from app.models import TaskTemplate, RosterConfig, RosterLog

    today = date.today()

    # All of today's MasterLog rows for this user (own only — KPIs are personal,
    # not departmental, so the breakdown lines up with "what's on my plate").
    today_rows = MasterLog.query.filter(
        MasterLog.entry_date == today,
        MasterLog.row_status != 'Amended',
        MasterLog.on_behalf_of_email == user.email,
    ).all()
    log_index = {(l.entry_type, l.topic, l.sub_topic or ''): l for l in today_rows}
    late = sum(1 for r in today_rows if r.is_late)

    override_index = _load_override_index(today)

    scheduled = 0
    done = 0
    pending = 0
    skip = 0

    def _bump(entry_type, topic, sub_topic=''):
        """One scheduled item → bucket it by the matching log's status."""
        nonlocal scheduled, done, pending, skip
        scheduled += 1
        log = log_index.get((entry_type, topic, sub_topic or ''))
        status = (log.status if log else 'Pending')
        if status == 'Done':
            done += 1
        elif status == 'Skip':
            skip += 1
        else:
            pending += 1

    # Recurring TaskTemplates the user should handle today
    for t in _filter_tasks_for_user(TaskTemplate.query.all(), user, on_date=today):
        if should_fire_with_override('TaskTemplate', t.name, '',
                                      t.recurrence, getattr(t, 'schedule_day', '') or '',
                                      today, override_index):
            _bump('Task', t.name, '')

    # MIS reports scheduled today
    for m in _get_mis_tasks(user, today):
        _bump('MISReport', m.get('name', ''), '')

    # Factor (DU) tasks — one bucket per factor row
    for g in _get_du_tasks(user, today):
        base = f"{g.get('commodity', '')}::{g.get('type', '')}"
        for f in g.get('factors', []):
            _bump('DataUpdate', base, f.get('factor', ''))

    # Report Groups
    for gr in _get_report_group_tasks(user, today):
        _bump('ReportGroup', gr.get('name', ''), '')

    # Roster lives in RosterLog (not MasterLog) — bucket separately
    roster_principals = _active_handover_principals(user, today)
    roster_name_lookup = _build_name_lookup(roster_principals)
    is_mgr = role_at_least(user.role, 'Manager')
    roster_log_index = {l.role: l for l in RosterLog.query.filter_by(date=today).all()}
    for rc in RosterConfig.query.all():
        if not should_fire_with_override('RosterConfig', rc.role, '',
                                          rc.frequency, getattr(rc, 'schedule_day', '') or '',
                                          today, override_index):
            continue
        if not (is_mgr or _matches_any_principal(rc.employee, roster_principals, roster_name_lookup)):
            continue
        scheduled += 1
        rl = roster_log_index.get(rc.role)
        rstat = rl.status if rl else 'Pending'
        if rstat == 'Done':
            done += 1
        elif rstat == 'Skip':
            skip += 1
        else:
            pending += 1

    stats = {
        'done': done,
        'pending': pending,
        'skip': skip,
        'late': late,
        'total': scheduled,
    }
    return jsonify({'success': True, 'today': today.isoformat(), 'stats': stats})


@dashboard_bp.route('/week-trend', methods=['GET'])
@jwt_required()
def get_week_trend():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    trend = {}
    for d in range(6, -1, -1):
        dt = date.today() - timedelta(days=d)
        ds = dt.isoformat()
        trend[ds] = {'done': 0, 'pending': 0, 'total': 0}

    week_ago = date.today() - timedelta(days=7)
    query = _filter_logs_by_role(MasterLog.query, user)
    rows = query.filter(MasterLog.entry_date >= week_ago).all()

    for r in rows:
        ds = r.entry_date.isoformat() if r.entry_date else ''
        if ds in trend:
            trend[ds]['total'] += 1
            if r.status == 'Done':
                trend[ds]['done'] += 1
            elif r.status == 'Pending':
                trend[ds]['pending'] += 1

    return jsonify({'success': True, 'trend': trend})


@dashboard_bp.route('/report-progress', methods=['GET'])
@jwt_required()
def get_report_progress():
    """Reports scheduled to fire today with their submission progress.

    Previously this returned only reports that had a MasterLog row submitted
    today — so any pending-but-not-yet-touched report was invisible. We now
    enumerate today's actually-scheduled reports via the same logic the Tasks
    page uses, then overlay the user's submission status. Result: the card
    matches what the user sees on Today.
    """
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    from app.routes.tasks import _get_mis_tasks  # local import avoids cycle at module load
    today = date.today()
    mis_tasks = _get_mis_tasks(user, today)

    # Roll up: each scheduled report contributes one card; status drives done/pending.
    progress = []
    for t in mis_tasks:
        status = (t.get('status') or 'Pending')
        progress.append({
            'name': t.get('name', ''),
            'employee': t.get('assignee', ''),
            'frequency': t.get('frequency', ''),
            'done': 1 if status == 'Done' else 0,
            'pending': 1 if status == 'Pending' else 0,
            'skip': 1 if status == 'Skip' else 0,
            'late': False,
        })

    # Pending first, Done last so the user's eye lands on what's left.
    progress.sort(key=lambda p: (p['done'] == 1, p['name']))
    return jsonify({'success': True, 'progress': progress})


@dashboard_bp.route('/pending', methods=['GET'])
@jwt_required()
def get_pending():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    today = date.today()
    today_str = today.isoformat()

    # Kanban summary
    tasks = KanbanTask.query.all()
    if user.role not in ('SuperAdmin', 'Manager'):
        tasks = [t for t in tasks if user.email in (t.assigned_to or '') or t.created_by == user.email]

    kanban = {
        'total': len(tasks),
        'open': sum(1 for t in tasks if t.status != 'Done'),
        'done': sum(1 for t in tasks if t.status == 'Done'),
        'blocked': sum(1 for t in tasks if t.status == 'Blocked'),
        'overdue': [t.to_dict() for t in tasks if t.due_date and t.due_date < today and t.status != 'Done'],
        'dueToday': [t.to_dict() for t in tasks if t.due_date and t.due_date == today and t.status != 'Done'],
    }

    # Recent entries
    query = _filter_logs_by_role(MasterLog.query, user)
    recent = query.filter(MasterLog.entry_date == today).order_by(MasterLog.timestamp_submitted.desc()).limit(10).all()
    recent_entries = [r.to_dict() for r in recent]

    # MIS analysis summary
    analyses = MISReportUpload.query.filter_by(parsed=True).order_by(MISReportUpload.upload_date.desc()).limit(5).all()
    analysis_summary = [a.to_dict() for a in analyses]

    return jsonify({
        'success': True,
        'kanban': kanban,
        'recentEntries': recent_entries,
        'misAnalysis': analysis_summary,
    })


@dashboard_bp.route('/team', methods=['GET'])
@jwt_required()
def get_team():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'):
        return jsonify({'success': False, 'message': 'Manager+ required'}), 403

    today = date.today()

    if user.role == 'SuperAdmin':
        scoped_users = User.query.filter_by(active=True).all()
    else:
        scoped_users = User.query.filter_by(department=user.department, active=True).all()

    emp_stats = {}
    for u in scoped_users:
        emp_stats[u.email] = {
            'email': u.email,
            'name': u.name,
            'role': u.role,
            'dept': u.department,
            'done': 0, 'pending': 0, 'skip': 0, 'late': 0, 'total': 0,
            'lastActive': '',
        }

    rows = MasterLog.query.filter(
        MasterLog.row_status != 'Amended',
        MasterLog.on_behalf_of_email.in_([u.email for u in scoped_users]),
        MasterLog.entry_date >= today - timedelta(days=7)
    ).all()

    for r in rows:
        em = r.on_behalf_of_email
        if em not in emp_stats:
            continue
        ds = r.entry_date.isoformat() if r.entry_date else ''
        if r.entry_date == today:
            emp_stats[em]['total'] += 1
            if r.status == 'Done': emp_stats[em]['done'] += 1
            elif r.status == 'Pending': emp_stats[em]['pending'] += 1
            elif r.status == 'Skip': emp_stats[em]['skip'] += 1
            if r.is_late: emp_stats[em]['late'] += 1
        if not emp_stats[em]['lastActive'] or ds > emp_stats[em]['lastActive']:
            emp_stats[em]['lastActive'] = ds

    return jsonify({
        'success': True,
        'today': today.isoformat(),
        'team': list(emp_stats.values()),
    })


@dashboard_bp.route('/alerts', methods=['GET'])
@jwt_required()
def get_alerts():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401
    notifs = Notification.query.filter_by(user_email=user.email, read=False).order_by(Notification.created_at.desc()).limit(20).all()
    return jsonify({'success': True, 'alerts': [n.to_dict() for n in notifs]})
