"""
Analytics — KPIs, SLA breaches, commodity comparison, exports.
"""
import csv, io
from datetime import datetime, date, timedelta, timezone
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required
from app import db
from app.models import MasterLog, User, Report
from app.auth import get_current_user, role_at_least
from app.routes.tasks import should_fire_with_override, _load_override_index

analytics_bp = Blueprint('analytics', __name__)

def _scoped_query(user, base_query=None, days=None):
    """Role-scoped MasterLog query.

    `days` (when provided) restricts to the last N days so analytics reflect
    recent performance rather than the cumulative all-time history (which made
    the rates static and useless once the table grew).
    """
    q = base_query if base_query is not None else MasterLog.query
    q = q.filter(MasterLog.row_status != 'Amended')
    if days and days > 0:
        cutoff = date.today() - timedelta(days=days - 1)
        q = q.filter(MasterLog.entry_date >= cutoff)
    if user.role == 'SuperAdmin': return q
    if user.role == 'Manager':
        dept_emails = [u.email for u in User.query.filter_by(department=user.department).all()]
        return q.filter(MasterLog.on_behalf_of_email.in_(dept_emails))
    return q.filter(MasterLog.on_behalf_of_email == user.email)

@analytics_bp.route('/kpi', methods=['GET'])
@jwt_required()
def kpi_breakdown():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    # Default window = last 30 days. Caller may pass ?days=N (N<=0 means all-time).
    try:
        days = int(request.args.get('days', 30))
    except ValueError:
        days = 30
    rows = _scoped_query(user, days=days if days > 0 else None).all()
    total = len(rows)
    done = sum(1 for r in rows if r.status == 'Done')
    pending = sum(1 for r in rows if r.status == 'Pending')
    skip = sum(1 for r in rows if r.status == 'Skip')
    late = sum(1 for r in rows if r.is_late)
    return jsonify({
        'success': True,
        'windowDays': days,
        'total': total,
        'doneRate': round(done/total*100) if total else 0,
        'pendingRate': round(pending/total*100) if total else 0,
        'skipRate': round(skip/total*100) if total else 0,
        'lateRate': round(late/total*100) if total else 0,
        'counts': {'total': total, 'done': done, 'pending': pending, 'skip': skip, 'late': late},
    })

@analytics_bp.route('/sla-breaches', methods=['GET'])
@jwt_required()
def sla_breaches():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    rows = _scoped_query(user).filter(MasterLog.is_late == True).all()
    grouped = {}
    for r in rows:
        key = f"{r.topic}||{r.sub_topic}"
        if key not in grouped: grouped[key] = {'topic': r.topic, 'subTopic': r.sub_topic, 'breaches': 0, 'lastBreach': '', 'employees': set()}
        grouped[key]['breaches'] += 1
        ds = (r.entry_date.isoformat() if hasattr(r.entry_date, 'isoformat') else str(r.entry_date)) if r.entry_date else ''
        if not grouped[key]['lastBreach'] or ds > grouped[key]['lastBreach']: grouped[key]['lastBreach'] = ds
        if r.on_behalf_of_name: grouped[key]['employees'].add(r.on_behalf_of_name)
    data = [{'topic': g['topic'], 'subTopic': g['subTopic'], 'breaches': g['breaches'], 'lastBreach': g['lastBreach'], 'employees': ', '.join(g['employees'])} for g in sorted(grouped.values(), key=lambda x: -x['breaches'])]
    return jsonify({'success': True, 'data': data})

@analytics_bp.route('/commodity-comparison', methods=['GET'])
@jwt_required()
def commodity_comparison():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    commodity = request.args.get('commodity', '')
    today = date.today()
    yesterday = today - timedelta(days=1)
    last_week = today - timedelta(days=7)
    def get_slice(d):
        rows = _scoped_query(user).filter(MasterLog.entry_date == d, MasterLog.entry_type == 'DataUpdate', MasterLog.topic.like(f'{commodity}::%')).all()
        return {'date': d.isoformat(), 'total': len(rows), 'done': sum(1 for r in rows if r.status == 'Done'), 'pending': sum(1 for r in rows if r.status == 'Pending'), 'skip': sum(1 for r in rows if r.status == 'Skip')}
    return jsonify({'success': True, 'commodity': commodity, 'today': get_slice(today), 'yesterday': get_slice(yesterday), 'lastWeek': get_slice(last_week)})

@analytics_bp.route('/export/csv', methods=['GET'])
@jwt_required()
def export_csv():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    rows = _scoped_query(user).order_by(MasterLog.entry_date.desc()).limit(2000).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['log_id','date','employee','entry_type','topic','sub_topic','status','remarks','is_late','submitted_by'])
    for r in rows:
        writer.writerow([r.log_id, r.entry_date.isoformat() if r.entry_date else '', r.on_behalf_of_name, r.entry_type, r.topic, r.sub_topic, r.status, r.remarks, 'Yes' if r.is_late else 'No', r.submitted_by_email])
    return Response(output.getvalue(), mimetype='text/csv', headers={'Content-Disposition': f'attachment; filename=erp-export-{date.today().isoformat()}.csv'})


@analytics_bp.route('/team-updates', methods=['GET'])
@jwt_required()
def get_team_updates():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Teammate'):
        return jsonify({'success': False, 'message': 'Teammate+ required'}), 403

    period = request.args.get('period', 'daily')
    ref_date_str = request.args.get('date')

    try:
        if ref_date_str:
            ref_date = date.fromisoformat(ref_date_str)
        else:
            ref_date = date.today()
    except ValueError:
        ref_date = date.today()
        
    raw_max_date = db.session.query(db.func.max(MasterLog.entry_date)).filter(MasterLog.row_status != 'Amended').scalar()
    max_log_date = None
    if raw_max_date:
        if isinstance(raw_max_date, date):
            max_log_date = raw_max_date
        elif isinstance(raw_max_date, str):
            try:
                max_log_date = date.fromisoformat(raw_max_date[:10])
            except ValueError:
                max_log_date = None

    # If ref_date is not specified and current period has 0 done logs, default to max_log_date
    if not ref_date_str:
        if max_log_date and max_log_date < ref_date:
            if period == 'weekly':
                s_check = ref_date - timedelta(days=ref_date.weekday())
                e_check = s_check + timedelta(days=6)
            elif period == 'monthly':
                s_check = ref_date.replace(day=1)
                e_check = (ref_date.replace(month=ref_date.month+1, day=1) if ref_date.month < 12 else ref_date.replace(year=ref_date.year+1, month=1, day=1)) - timedelta(days=1)
            else:
                s_check = ref_date
                e_check = ref_date
            
            cnt = MasterLog.query.filter(MasterLog.row_status != 'Amended', MasterLog.entry_date >= s_check, MasterLog.entry_date <= e_check, MasterLog.status == 'Done').count()
            if cnt == 0:
                ref_date = max_log_date

    # Calculate start and end date based on period
    if period == 'weekly':
        start_date = ref_date - timedelta(days=ref_date.weekday())
        end_date = start_date + timedelta(days=6)
    elif period == 'monthly':
        start_date = ref_date.replace(day=1)
        if ref_date.month == 12:
            next_month = ref_date.replace(year=ref_date.year + 1, month=1, day=1)
        else:
            next_month = ref_date.replace(month=ref_date.month + 1, day=1)
        end_date = next_month - timedelta(days=1)
    else:  # daily
        start_date = ref_date
        end_date = ref_date

    # Query scope
    if user.role == 'SuperAdmin':
        scoped_users = User.query.filter_by(active=True).all()
    elif user.role == 'Manager':
        dept_users = User.query.filter_by(department=user.department, active=True).all()
        scoped_users = list({u.email: u for u in ([user] + dept_users)}.values())
    else:
        scoped_users = [user]

    # Quick sum-up calculations for team top card
    all_scoped_emails = [u.email.lower() for u in scoped_users]

    # Map name -> list of alias emails
    user_name_to_emails = {}
    for u in User.query.filter_by(active=True).all():
        key = (u.name or '').strip().lower()
        if key:
            user_name_to_emails.setdefault(key, []).append(u.email.lower())

    logs = MasterLog.query.filter(
        MasterLog.row_status != 'Amended',
        MasterLog.entry_date >= start_date,
        MasterLog.entry_date <= end_date
    ).all()

    # Calculate aggregate team sumup
    total_logs = len(logs)
    done_logs = sum(1 for l in logs if l.status == 'Done')
    pending_logs = sum(1 for l in logs if (l.status == 'Pending' or getattr(l, 'is_unfilled', False)))
    skip_logs = sum(1 for l in logs if l.status == 'Skip')
    late_logs = sum(1 for l in logs if l.is_late)

    sumup_data = {
        'total': total_logs,
        'done': done_logs,
        'pending': pending_logs,
        'skip': skip_logs,
        'late': late_logs,
        'completionRate': round((done_logs / total_logs * 100), 1) if total_logs > 0 else 0
    }

    # Calculate individual teammate metrics
    team_stats = {}
    for u in scoped_users:
        aliases = user_name_to_emails.get((u.name or '').strip().lower(), [u.email.lower()])
        team_stats[u.email.lower()] = {
            'email': u.email,
            'name': u.name,
            'role': u.role,
            'dept': u.department,
            'done': 0,
            'pending': 0,
            'skip': 0,
            'late': 0,
            'total': 0,
            'score': 0,
            'lastActive': ''
        }

    # Fetch all reports for schedule matching
    all_reports = Report.query.all()

    # Fetch MasterLog rows within date range for all users
    logs = MasterLog.query.filter(
        MasterLog.row_status != 'Amended',
        MasterLog.entry_date >= start_date,
        MasterLog.entry_date <= end_date
    ).all()

    # Index logs by (on_behalf_of_email, entry_date, topic)
    logs_map = {}
    for l in logs:
        key = (l.on_behalf_of_email.lower(), l.entry_date, l.topic)
        logs_map[key] = l

    # Track which log IDs we've processed as part of the schedule
    visited_log_ids = set()

    # Loop through each date in the range to determine scheduled reports
    curr_date = start_date
    while curr_date <= end_date:
        override_index = _load_override_index(curr_date)
        for r in all_reports:
            freq = r.frequency or 'Daily'
            sched_day = r.schedule_day or ''
            if not should_fire_with_override('Report', r.name, '', freq, sched_day, curr_date, override_index):
                continue

            # Does this report match any of our scoped teammates?
            primary_assignee = (r.primary_assignee or '').lower()
            for u in scoped_users:
                email_lower = u.email.lower()
                name_lower = u.name.lower()
                matched = email_lower in primary_assignee or name_lower in primary_assignee
                if not matched and name_lower in user_name_to_emails:
                    matched = any(alias in primary_assignee for alias in user_name_to_emails[name_lower])
                
                if matched:
                    # This report is scheduled for teammate u on curr_date
                    team_stats[email_lower]['total'] += 1
                    
                    # Check if they submitted a log for it (checking aliases too)
                    log = None
                    aliases = user_name_to_emails.get(name_lower, [email_lower])
                    for alias_email in aliases:
                        log = logs_map.get((alias_email, curr_date, r.name))
                        if log:
                            break
                    
                    if log:
                        visited_log_ids.add(log.log_id)
                        if log.status == 'Done':
                            team_stats[email_lower]['done'] += 1
                        elif log.status == 'Pending':
                            team_stats[email_lower]['pending'] += 1
                        elif log.status == 'Skip':
                            team_stats[email_lower]['skip'] += 1
                        if log.is_late:
                            team_stats[email_lower]['late'] += 1
                    else:
                        # Report is scheduled but not filled (unfilled) -> counts as Pending
                        team_stats[email_lower]['pending'] += 1

        curr_date += timedelta(days=1)

    # Process any logs that were submitted but were NOT in the official schedule (ad-hoc entries)
    for log in logs:
        if log.log_id in visited_log_ids:
            continue
        em = log.on_behalf_of_email.lower()
        target_stat = team_stats.get(em)
        if not target_stat:
            # Check by user name alias
            for u in scoped_users:
                if u.email.lower() in user_name_to_emails.get((u.name or '').strip().lower(), []):
                    target_stat = team_stats.get(u.email.lower())
                    break
        if target_stat:
            target_stat['total'] += 1
            if log.status == 'Done':
                target_stat['done'] += 1
            elif log.status == 'Pending':
                target_stat['pending'] += 1
            elif log.status == 'Skip':
                target_stat['skip'] += 1
            if log.is_late:
                target_stat['late'] += 1

    # Get last active date overall for these users
    active_dates = db.session.query(
        MasterLog.on_behalf_of_email,
        db.func.max(MasterLog.entry_date)
    ).filter(
        MasterLog.row_status != 'Amended'
    ).group_by(MasterLog.on_behalf_of_email).all()
    active_map = {email.lower(): (mdate.isoformat() if hasattr(mdate, 'isoformat') else str(mdate or '')) for email, mdate in active_dates if mdate}

    for em, st in team_stats.items():
        # Check active date for alias emails too
        aliases = user_name_to_emails.get((st['name'] or '').strip().lower(), [em])
        latest_act = ''
        for a in aliases:
            act = active_map.get(a, '')
            if act and act > latest_act:
                latest_act = act
        st['lastActive'] = latest_act
        if st['total'] > 0:
            st['score'] = round((st['done'] / st['total']) * 100)
        else:
            st['score'] = 0

    # Calculate overall team sumup
    total_tasks = sum(st['total'] for st in team_stats.values())
    total_done = sum(st['done'] for st in team_stats.values())
    total_pending = sum(st['pending'] for st in team_stats.values())
    total_skip = sum(st['skip'] for st in team_stats.values())
    total_late = sum(st['late'] for st in team_stats.values())
    
    overall_score = round((total_done / total_tasks) * 100) if total_tasks > 0 else 0

    # Group by entry type for sumup breakdown
    type_breakdown = {}
    for r in logs:
        etype = r.entry_type or 'MISReport'
        if etype not in type_breakdown:
            type_breakdown[etype] = {'total': 0, 'done': 0, 'pending': 0, 'skip': 0}
        type_breakdown[etype]['total'] += 1
        if r.status == 'Done':
            type_breakdown[etype]['done'] += 1
        elif r.status == 'Pending':
            type_breakdown[etype]['pending'] += 1
        elif r.status == 'Skip':
            type_breakdown[etype]['skip'] += 1

    # Daily breakdown for weekly/monthly trends
    daily_trend = {}
    curr = start_date
    while curr <= end_date:
        daily_trend[curr.isoformat()] = {'date': curr.isoformat(), 'total': 0, 'done': 0, 'pending': 0, 'skip': 0}
        curr += timedelta(days=1)
        
    for r in logs:
        rdate = r.entry_date.isoformat() if hasattr(r.entry_date, 'isoformat') else str(r.entry_date or '')
        if rdate in daily_trend:
            daily_trend[rdate]['total'] += 1
            if r.status == 'Done':
                daily_trend[rdate]['done'] += 1
            elif r.status == 'Pending':
                daily_trend[rdate]['pending'] += 1
            elif r.status == 'Skip':
                daily_trend[rdate]['skip'] += 1

    # Get max log date in database
    max_log = db.session.query(db.func.max(MasterLog.entry_date)).filter(MasterLog.row_status != 'Amended').scalar()
    latest_log_date = (max_log.isoformat() if hasattr(max_log, 'isoformat') else str(max_log)) if max_log else None

    sumup = {
        'total': total_tasks,
        'done': total_done,
        'pending': total_pending,
        'skip': total_skip,
        'late': total_late,
        'score': overall_score,
        'byType': type_breakdown,
        'trend': sorted(list(daily_trend.values()), key=lambda x: x['date'])
    }

    return jsonify({
        'success': True,
        'period': period,
        'startDate': start_date.isoformat(),
        'endDate': end_date.isoformat(),
        'refDate': ref_date.isoformat(),
        'latestLogDate': latest_log_date,
        'sumup': sumup,
        'team': list(team_stats.values())
    })
