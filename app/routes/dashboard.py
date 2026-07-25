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
    fired_template_topics = set()
    for t in _filter_tasks_for_user(TaskTemplate.query.all(), user, on_date=today):
        if should_fire_with_override('TaskTemplate', t.name, '',
                                      t.recurrence, getattr(t, 'schedule_day', '') or '',
                                      today, override_index):
            fired_template_topics.add(t.name)
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

    # Ad-hoc tasks (stored in MasterLog but not template-derived)
    for r in today_rows:
        if r.entry_type == 'Task' and r.topic not in fired_template_topics:
            scheduled += 1
            if r.status == 'Done':
                done += 1
            elif r.status == 'Skip':
                skip += 1
            else:
                pending += 1

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
    if not user or not role_at_least(user.role, 'Teammate'):
        return jsonify({'success': False, 'message': 'Teammate+ required'}), 403

    today = date.today()

    if user.role == 'SuperAdmin':
        scoped_users = User.query.filter_by(active=True).all()
    else:
        scoped_users = User.query.filter_by(department=user.department, active=True).all()

    # Only include Teammates in the KPI tracking (exclude Managers, Leaders like Garima)
    scoped_users = [u for u in scoped_users if u.role == 'Teammate']

    emp_stats = {}
    for u in scoped_users:
        emp_stats[u.email] = {
            'email': u.email,
            'name': u.name,
            'role': u.role,
            'dept': u.department,
            'done': 0, 'pending': 0, 'skip': 0, 'late': 0, 'total': 0,
            'lastActive': '',
            # Per entry-type breakdown
            'breakdown': {
                'Task': {'done': 0, 'pending': 0, 'skip': 0},
                'MISReport': {'done': 0, 'pending': 0, 'skip': 0},
                'DataUpdate': {'done': 0, 'pending': 0, 'skip': 0},
                'ReportGroup': {'done': 0, 'pending': 0, 'skip': 0},
            },
            'tasks': [],  # individual task entries for today
            'score': 0,   # completion percentage
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
            etype = r.entry_type or 'Task'
            if r.status == 'Done':
                emp_stats[em]['done'] += 1
                if etype in emp_stats[em]['breakdown']:
                    emp_stats[em]['breakdown'][etype]['done'] += 1
            elif r.status == 'Pending':
                emp_stats[em]['pending'] += 1
                if etype in emp_stats[em]['breakdown']:
                    emp_stats[em]['breakdown'][etype]['pending'] += 1
            elif r.status == 'Skip':
                emp_stats[em]['skip'] += 1
                if etype in emp_stats[em]['breakdown']:
                    emp_stats[em]['breakdown'][etype]['skip'] += 1
            if r.is_late:
                emp_stats[em]['late'] += 1
            # Individual task entry
            emp_stats[em]['tasks'].append({
                'logId': r.log_id,
                'topic': r.topic,
                'subTopic': r.sub_topic or '',
                'entryType': etype,
                'status': r.status,
                'remarks': r.remarks or '',
                'timestamp': r.timestamp_submitted.isoformat() if r.timestamp_submitted else '',
            })
        if not emp_stats[em]['lastActive'] or ds > emp_stats[em]['lastActive']:
            emp_stats[em]['lastActive'] = ds

    # Compute score (percentage done of total)
    for em, st in emp_stats.items():
        if st['total'] > 0:
            st['score'] = round((st['done'] / st['total']) * 100)
        else:
            st['score'] = 0

    return jsonify({
        'success': True,
        'today': today.isoformat(),
        'team': list(emp_stats.values()),
    })


@dashboard_bp.route('/team/<email>/detail', methods=['GET'])
@jwt_required()
def get_team_detail(email):
    """Detailed task sheet for a specific teammate. Teammate+ only.
    Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: today)
    """
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Teammate'):
        return jsonify({'success': False, 'message': 'Teammate+ required'}), 403

    from flask import request as req
    from_date = date.today()
    to_date = date.today()
    try:
        if req.args.get('from'):
            from_date = date.fromisoformat(req.args['from'])
        if req.args.get('to'):
            to_date = date.fromisoformat(req.args['to'])
    except ValueError:
        pass

    target_user = User.query.filter_by(email=email.lower()).first()
    if not target_user:
        return jsonify({'success': False, 'message': 'User not found'}), 404

    primary_rows = MasterLog.query.filter(
        MasterLog.row_status != 'Amended',
        MasterLog.on_behalf_of_email == email.lower(),
        MasterLog.entry_date >= from_date,
        MasterLog.entry_date <= to_date,
    ).all()

    # Fetch MasterLog rows where they acted as backup
    backup_rows = MasterLog.query.filter(
        MasterLog.row_status != 'Amended',
        MasterLog.submitted_by_email == email.lower(),
        MasterLog.on_behalf_of_email != email.lower(),
        MasterLog.entry_date >= from_date,
        MasterLog.entry_date <= to_date,
    ).all()

    from app.routes.tasks import should_fire_with_override, _load_override_index
    from app.models import Report, RosterConfig, RosterLog, TaskTemplate, CommodityConfig

    all_reports = Report.query.all()
    primary_logs_map = {(l.entry_date, l.topic, l.sub_topic or ''): l for l in primary_rows}

    users_map = {}
    for u in User.query.all():
        users_map[u.email.lower()] = u.email.lower()
        users_map[u.name.lower()] = u.email.lower()

    user_commodities = [uc.strip().lower() for uc in (target_user.commodities or '').split(',') if uc.strip()]

    entries = []
    visited_log_ids = set()

    # Loop dates in range
    curr_date = from_date
    while curr_date <= to_date:
        override_index = _load_override_index(curr_date)
        for r in all_reports:
            primary_assignee = (r.primary_assignee or '').lower()
            if email.lower() not in primary_assignee and target_user.name.lower() not in primary_assignee:
                continue


            freq = r.frequency or 'Daily'
            sched_day = r.schedule_day or ''
            if not should_fire_with_override('Report', r.name, '', freq, sched_day, curr_date, override_index):
                continue

            log = primary_logs_map.get((curr_date, r.name, ''))
            if log:
                visited_log_ids.add(log.log_id)
                entries.append({
                    'logId': log.log_id,
                    'entryDate': log.entry_date.isoformat(),
                    'topic': log.topic,
                    'subTopic': log.sub_topic or '',
                    'entryType': log.entry_type or 'MISReport',
                    'status': log.status,
                    'remarks': log.remarks or '',
                    'timestamp': log.timestamp_submitted.isoformat() if log.timestamp_submitted else '',
                    'isLate': log.is_late,
                    'isUnfilled': False
                })
            else:
                entries.append({
                    'logId': f"UNFILLED_{curr_date.isoformat()}_{r.name}",
                    'entryDate': curr_date.isoformat(),
                    'topic': r.name,
                    'subTopic': '',
                    'entryType': 'MISReport',
                    'status': 'Pending',
                    'remarks': 'Report scheduled but not submitted (unfilled)',
                    'timestamp': '',
                })

        for t in TaskTemplate.query.all():
            assignee = (t.assignee or '').strip().lower()
            if not assignee or assignee in ('all', 'yes', 'no'):
                assignee_email = email.lower()
            else:
                assignee_email = users_map.get(assignee, email.lower())

            if assignee_email != email.lower():
                continue

            freq = t.recurrence or 'Daily'
            sched_day = t.schedule_day or ''
            if not should_fire_with_override('TaskTemplate', t.name, '', freq, sched_day, curr_date, override_index):
                continue

            log = primary_logs_map.get((curr_date, t.name, ''))
            if log:
                visited_log_ids.add(log.log_id)
                entries.append({
                    'logId': log.log_id,
                    'entryDate': log.entry_date.isoformat(),
                    'topic': log.topic,
                    'subTopic': log.sub_topic or '',
                    'entryType': log.entry_type or 'Task',
                    'status': log.status,
                    'remarks': log.remarks or '',
                    'timestamp': log.timestamp_submitted.isoformat() if log.timestamp_submitted else '',
                    'isLate': log.is_late,
                    'isUnfilled': False
                })
            else:
                entries.append({
                    'logId': f"TASK_UNFILLED_{curr_date.isoformat()}_{t.name}",
                    'entryDate': curr_date.isoformat(),
                    'topic': t.name,
                    'subTopic': '',
                    'entryType': 'Task',
                    'status': 'Pending',
                    'remarks': 'Task scheduled but not submitted (unfilled)',
                    'timestamp': '',
                    'isLate': curr_date < date.today(),
                    'isUnfilled': True
                })

        for c in CommodityConfig.query.all():
            matched = False
            for assignee in (c.mode, c.primary_assignee):
                if assignee:
                    a = assignee.strip().lower()
                    if a in (email.lower(), target_user.name.lower()) or a in ('all', 'yes', 'no'):
                        matched = True
                        break
                    if users_map.get(a) == email.lower():
                        matched = True
                        break

            if not matched and user_commodities:
                if any(uc in c.commodity.lower() for uc in user_commodities):
                    matched = True

            if not matched:
                continue

            freq = c.type or 'Daily'
            sched_day = c.schedule_day or ''
            if not should_fire_with_override('CommodityConfig', f"{c.commodity}::{c.type}", c.factor, freq, sched_day, curr_date, override_index):
                continue

            topic_name = f"{c.commodity}::{c.type}"
            log = primary_logs_map.get((curr_date, topic_name, c.factor))
            if log:
                visited_log_ids.add(log.log_id)
                entries.append({
                    'logId': log.log_id,
                    'entryDate': log.entry_date.isoformat(),
                    'topic': log.topic,
                    'subTopic': log.sub_topic or '',
                    'entryType': log.entry_type or 'DataUpdate',
                    'status': log.status,
                    'remarks': log.remarks or '',
                    'timestamp': log.timestamp_submitted.isoformat() if log.timestamp_submitted else '',
                    'isLate': log.is_late,
                    'isUnfilled': False
                })
            else:
                entries.append({
                    'logId': f"DU_UNFILLED_{curr_date.isoformat()}_{c.commodity}_{c.factor}",
                    'entryDate': curr_date.isoformat(),
                    'topic': topic_name,
                    'subTopic': c.factor,
                    'entryType': 'DataUpdate',
                    'status': 'Pending',
                    'remarks': 'Factor task scheduled but not submitted (unfilled)',
                    'timestamp': '',
                    'isLate': curr_date < date.today(),
                    'isUnfilled': True
                })

        # ── Roster entries for this date ──────────────────────────────────────
        roster_log_index = {l.role: l for l in RosterLog.query.filter_by(date=curr_date).all()}
        for rc in RosterConfig.query.all():
            # Check if this roster config belongs to the target user (email or name match)
            emp = (rc.employee or '').lower().strip()
            if emp != email.lower() and emp != target_user.name.lower():
                continue
            # Check if it should fire today
            if not should_fire_with_override('RosterConfig', rc.role, '',
                                              rc.frequency, rc.schedule_day or '',
                                              curr_date, override_index):
                continue
            rl = roster_log_index.get(rc.role)
            if rl:
                entries.append({
                    'logId': f"ROSTER_{curr_date.isoformat()}_{rc.role}",
                    'entryDate': curr_date.isoformat(),
                    'topic': rc.role,
                    'subTopic': '',
                    'entryType': 'Roster',
                    'status': rl.status,
                    'remarks': rc.remark or '',
                    'timestamp': rl.updated_at.isoformat() if rl.updated_at else '',
                    'isLate': curr_date < date.today() and rl.status != 'Done',
                    'isUnfilled': False
                })
            else:
                entries.append({
                    'logId': f"ROSTER_UNFILLED_{curr_date.isoformat()}_{rc.role}",
                    'entryDate': curr_date.isoformat(),
                    'topic': rc.role,
                    'subTopic': '',
                    'entryType': 'Roster',
                    'status': 'Pending',
                    'remarks': rc.remark or 'Roster not marked yet',
                    'timestamp': '',
                    'isLate': curr_date < date.today(),
                    'isUnfilled': True
                })

        curr_date += timedelta(days=1)

    # Append any ad-hoc submissions
    for l in primary_rows:
        if l.log_id not in visited_log_ids:
            entries.append({
                'logId': l.log_id,
                'entryDate': l.entry_date.isoformat(),
                'topic': l.topic,
                'subTopic': l.sub_topic or '',
                'entryType': l.entry_type or 'MISReport',
                'status': l.status,
                'remarks': l.remarks or '',
                'timestamp': l.timestamp_submitted.isoformat() if l.timestamp_submitted else '',
                'isLate': l.is_late,
                'isUnfilled': False
            })

    # Sort entries by entryDate desc, then timestamp desc
    entries.sort(key=lambda x: (x['entryDate'], x['timestamp'] or ''), reverse=True)

    # Process backup rows
    backup_entries = []
    for l in backup_rows:
        backup_entries.append({
            'logId': l.log_id,
            'entryDate': l.entry_date.isoformat(),
            'topic': l.topic,
            'subTopic': l.sub_topic or '',
            'entryType': l.entry_type or 'MISReport',
            'status': l.status,
            'remarks': l.remarks or '',
            'timestamp': l.timestamp_submitted.isoformat() if l.timestamp_submitted else '',
            'isLate': l.is_late,
            'onBehalfOfEmail': l.on_behalf_of_email,
            'onBehalfOfName': l.on_behalf_of_name or l.on_behalf_of_email
        })
    backup_entries.sort(key=lambda x: (x['entryDate'], x['timestamp'] or ''), reverse=True)

    done_count = sum(1 for e in entries if e['status'] == 'Done')
    total_count = len(entries)

    return jsonify({
        'success': True,
        'user': target_user.to_dict(),
        'fromDate': from_date.isoformat(),
        'toDate': to_date.isoformat(),
        'entries': entries,
        'backupEntries': backup_entries,
        'totalCount': total_count,
        'doneCount': done_count,
        'score': round((done_count / total_count) * 100) if total_count > 0 else 0,
    })


@dashboard_bp.route('/alerts', methods=['GET'])
@jwt_required()
def get_alerts():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401
    notifs = Notification.query.filter_by(user_email=user.email, read=False).order_by(Notification.created_at.desc()).limit(20).all()
    return jsonify({'success': True, 'alerts': [n.to_dict() for n in notifs]})
