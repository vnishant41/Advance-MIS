"""
Task Management — Daily/Weekly/Monthly tasks with roster integration.
"""
import time, random, json
from datetime import datetime, date, timedelta, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models import TaskTemplate, MasterLog, RosterConfig, RosterLog, User, CommodityConfig, Report, AppSetting, BackupActivation, ReportGroup, TaskOverride
from app.auth import get_current_user, role_at_least, log_audit

tasks_bp = Blueprint('tasks', __name__)

DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']


def _new_log_id():
    return f"LOG{int(time.time()*1000)}_{random.randint(100, 999)}"


def _get_week_number(d):
    return d.isocalendar()[1]


def _get_setting(key, default=''):
    s = AppSetting.query.filter_by(key=key).first()
    return s.value if s else default


def _is_holiday(d):
    """Saturday/Sunday are holidays when 'skipWeekends' setting is YES (default)."""
    skip = (_get_setting('skipWeekends', 'YES') or 'YES').upper()
    if skip != 'YES':
        return False
    return d.weekday() >= 5  # 5=Sat, 6=Sun


_FREQ_ALIASES = {
    '': 'daily', 'always': 'daily', 'yes': 'daily',
    'quaterly': 'quarterly', 'quaterley': 'quarterly',
    'fornightly': 'fortnightly', 'biweekly': 'fortnightly',
    'annually': 'yearly', 'annual': 'yearly',
    'half yearly': 'half-yearly', 'half-yearly': 'half-yearly', 'halfyearly': 'half-yearly',
    'mon-fri': 'mon-fri',
}

_DAY_NUM = {'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3, 'friday': 4, 'saturday': 5, 'sunday': 6}


def _normalize_freq(freq):
    return _FREQ_ALIASES.get((freq or '').lower().strip(), (freq or '').lower().strip())


def _period_key(frequency, on_date):
    """Identifier for the period that contains `on_date`. Returns '' for
    frequencies that don't support per-period overrides (daily/weekly etc.)."""
    f = _normalize_freq(frequency)
    if f == 'monthly':
        return on_date.strftime('%Y-%m')
    if f == 'quarterly':
        q = (on_date.month - 1) // 3 + 1
        return f"{on_date.year}-Q{q}"
    if f == 'half-yearly':
        h = 1 if on_date.month <= 6 else 2
        return f"{on_date.year}-H{h}"
    if f == 'yearly':
        return str(on_date.year)
    return ''


def should_fire_with_override(entity_type, entity_key, sub_key, frequency, schedule_day, today, override_index=None):
    """Same as should_run_today but honours per-period TaskOverride rows.

    If an override row exists for this entity in the period containing `today`,
    the task fires only on the override's new_date (replacing the default).
    Daily/weekly tasks ignore overrides — they use the normal schedule.

    `override_index` is an optional pre-fetched dict keyed by
    (entity_type, entity_key, sub_key, period_key) to avoid N+1 queries.
    """
    pk = _period_key(frequency, today)
    if not pk:
        return should_run_today(frequency, schedule_day, today)

    if override_index is None:
        override = TaskOverride.query.filter_by(
            entity_type=entity_type,
            entity_key=entity_key,
            sub_key=sub_key or '',
            period_key=pk,
        ).first()
    else:
        override = override_index.get((entity_type, entity_key, sub_key or '', pk))

    if override and override.new_date:
        return today == override.new_date
    return should_run_today(frequency, schedule_day, today)


def _load_override_index(today):
    """Pre-fetch all overrides whose period contains today, indexed for O(1) lookup."""
    candidates = [
        _period_key('monthly', today),
        _period_key('quarterly', today),
        _period_key('half-yearly', today),
        _period_key('yearly', today),
    ]
    candidates = [c for c in candidates if c]
    rows = TaskOverride.query.filter(TaskOverride.period_key.in_(candidates)).all()
    return {(r.entity_type, r.entity_key, r.sub_key or '', r.period_key): r for r in rows}


def should_run_today(frequency, schedule_day, today):
    """Return True if a task with this frequency + schedule_day should appear today.

    schedule_day interpretation per frequency:
      - daily / mon-fri / always : ignored
      - weekly                   : day name ('Monday'..'Sunday'); default Monday
      - fortnightly              : day name; default Monday; fires every other ISO week (even)
      - monthly                  : day of month '1'..'31' or 'last'; default '1'
      - quarterly                : day of month for Jan/Apr/Jul/Oct; default '1'
      - half-yearly              : day of month for Jan/Jul; default '1'
      - yearly                   : 'MM-DD' (e.g. '04-15'); default '01-01'
    """
    f = _normalize_freq(frequency)
    sd = (schedule_day or '').strip()

    if f in ('daily',):
        return True
    if f == 'mon-fri':
        return today.weekday() <= 4
    if f == 'weekly':
        target = _DAY_NUM.get((sd or 'monday').lower(), 0)
        return today.weekday() == target
    if f == 'fortnightly':
        target = _DAY_NUM.get((sd or 'monday').lower(), 0)
        return today.weekday() == target and (today.isocalendar()[1] % 2 == 0)
    if f == 'monthly':
        if sd.lower() == 'last':
            # last day of the month
            nm = today.replace(day=28) + timedelta(days=4)
            last = (nm - timedelta(days=nm.day)).day
            return today.day == last
        try:
            return today.day == int(sd or '1')
        except ValueError:
            return today.day == 1
    if f == 'quarterly':
        try:
            d = int(sd or '1')
        except ValueError:
            d = 1
        return today.month in (1, 4, 7, 10) and today.day == d
    if f == 'half-yearly':
        try:
            d = int(sd or '1')
        except ValueError:
            d = 1
        return today.month in (1, 7) and today.day == d
    if f == 'yearly':
        try:
            mm, dd = (sd or '01-01').split('-')
            return today.month == int(mm) and today.day == int(dd)
        except (ValueError, IndexError):
            return today.month == 1 and today.day == 1
    # Unknown frequency → conservative: don't show
    return False


def _user_owns(assignee_field, user):
    """Case-insensitive match against email or name."""
    if not assignee_field:
        return False
    a = assignee_field.lower().strip()
    return a == user.email.lower() or a == user.name.lower()


def _active_handover_principals(user, on_date):
    """Return the set of email addresses (lowercase) that `user` is currently
    authorized to act on behalf of via an active backup handover that covers
    `on_date`. Always includes the user's own email.

    A backup user only inherits a primary's tasks during a handover window
    explicitly granted by a manager.
    """
    principals = {user.email.lower()}
    rows = BackupActivation.query.filter(
        BackupActivation.backup_email == user.email.lower(),
        BackupActivation.active.is_(True),
        BackupActivation.start_date <= on_date,
        BackupActivation.end_date >= on_date,
    ).all()
    for r in rows:
        if r.primary_email:
            principals.add(r.primary_email.lower())
    return principals


def _matches_any_principal(value, principals, name_lookup=None):
    """value matches if it equals any principal email or the User.name of any principal."""
    if not value:
        return False
    v = value.lower().strip()
    if v in principals:
        return True
    if name_lookup:
        for email in principals:
            n = name_lookup.get(email)
            if n and n.lower() == v:
                return True
    return False


def _build_name_lookup(principals):
    """Map {email_lower: name} for a set of principal emails."""
    if not principals:
        return {}
    users = User.query.filter(User.email.in_(list(principals))).all()
    return {u.email.lower(): (u.name or '') for u in users}


def _filter_tasks_for_user(tasks, user, on_date=None):
    """Filter task templates by role/assignment. Backup users see a primary's
    tasks only when an active handover covers `on_date`.
    """
    if role_at_least(user.role, 'Manager'):
        return tasks
    if on_date is None:
        on_date = date.today()
    principals = _active_handover_principals(user, on_date)
    name_lookup = _build_name_lookup(principals)
    out = []
    for t in tasks:
        if not t.assignee:
            out.append(t)
            continue
        if _matches_any_principal(t.assignee, principals, name_lookup):
            out.append(t)
    return out


def _get_du_tasks(user, date_obj):
    """
    Factor Tasks (CommodityConfig rows) appear in Tasks & Roster based on the
    "User" field — stored in `mode` (renamed from Mode → User in the UI). The
    row's `type` (Task Timing) combined with `schedule_day` determines whether
    the task should appear today. Backups see a primary's Factor Tasks only
    during an active handover window.
    """
    def _du_fires(c):
        return should_fire_with_override(
            'CommodityConfig', f"{c.commodity}::{c.type}", c.factor,
            c.type, getattr(c, 'schedule_day', '') or '',
            date_obj, override_index)

    if role_at_least(user.role, 'Manager'):
        override_index = _load_override_index(date_obj)
        all_configs = CommodityConfig.query.all()
        configs = [c for c in all_configs if _du_fires(c)]
    else:
        principals = _active_handover_principals(user, date_obj)
        name_lookup = _build_name_lookup(principals)

        # Legacy: aggregate commodity-name strings for principals.
        principal_users = User.query.filter(User.email.in_(list(principals))).all()
        uc = []
        for pu in principal_users:
            for c in (pu.commodities or '').split(','):
                c = c.strip()
                if c and c not in uc:
                    uc.append(c)

        override_index = _load_override_index(date_obj)
        all_configs = CommodityConfig.query.all()
        configs = []
        for c in all_configs:
            if not _du_fires(c):
                continue
            if _matches_any_principal(getattr(c, 'mode', '') or '', principals, name_lookup):
                configs.append(c); continue
            if _matches_any_principal(getattr(c, 'primary_assignee', '') or '', principals, name_lookup):
                configs.append(c); continue
            if uc and any(u.lower() in c.commodity.lower() for u in uc):
                configs.append(c)
        if not configs:
            return []

    # Single batched lookup of today's DU logs, filtered globally if Manager, otherwise scoped.
    if role_at_least(user.role, 'Manager'):
        du_logs = MasterLog.query.filter_by(
            entry_date=date_obj,
            entry_type='DataUpdate',
            row_status='Active',
        ).all()
    else:
        principals = _active_handover_principals(user, date_obj)
        du_logs = MasterLog.query.filter(
            MasterLog.entry_date == date_obj,
            MasterLog.entry_type == 'DataUpdate',
            MasterLog.row_status == 'Active',
            MasterLog.on_behalf_of_email.in_(list(principals))
        ).all()

    # Index logs by (topic, sub_topic, on_behalf_of_email)
    du_log_index = {(l.topic, l.sub_topic or '', l.on_behalf_of_email.lower()): l for l in du_logs}

    # Pre-load user emails mapping
    users_map = {}
    for u in User.query.all():
        users_map[u.email.lower()] = u.email.lower()
        users_map[u.name.lower()] = u.email.lower()

    def _get_email(assignee):
        if not assignee:
            return user.email.lower()
        a = assignee.strip().lower()
        if a in ('all', 'yes', 'no'):
            return user.email.lower()
        return users_map.get(a, user.email.lower())

    def _get_du_email(c):
        for assignee in (getattr(c, 'mode', ''), getattr(c, 'primary_assignee', '')):
            if assignee:
                email = _get_email(assignee)
                if email:
                    return email
        return user.email.lower()

    # Group configs by (commodity, type) so the UI can show one heading per
    # combo with each factor as a sub-row below.
    groups = {}
    ordered_keys = []
    for c in configs:
        key = f"{c.commodity}::{c.type}"
        if key not in groups:
            groups[key] = {
                'task_type': 'DataUpdateGroup',
                'name': f"Data Update: {c.commodity} - {c.type}",
                'commodity': c.commodity,
                'type': c.type,
                'instructions': '',
                'factors': [],
            }
            ordered_keys.append(key)
        gi = groups[key]['instructions']
        ci = (getattr(c, 'instructions', '') or '').strip()
        if ci and len(ci) > len(gi):
            groups[key]['instructions'] = ci

        email = _get_du_email(c)
        log = du_log_index.get((key, c.factor, email))
        groups[key]['factors'].append({
            'factor': c.factor,
            'mode': c.mode or '',
            'source': c.source or '',
            'instructions': (getattr(c, 'instructions', '') or ''),
            'status': log.status if log else 'Pending',
        })

    # Roll up group-level status from its factors so the heading badge is accurate.
    # Also sort factors WITHIN each group: Pending first, Done at the bottom.
    out = []
    for k in ordered_keys:
        g = groups[k]
        # Sort factor sub-rows: Pending → Done (stable within bucket)
        g['factors'].sort(key=lambda f: (f.get('status') or '').lower() == 'done')

        statuses = [f['status'] for f in g['factors']]
        if statuses and all(s == 'Done' for s in statuses):
            g['status'] = 'Done'
        elif any(s == 'Done' for s in statuses):
            g['status'] = 'In Progress'
        else:
            g['status'] = 'Pending'
        # Use today's iso date as a sortable createdAt fallback
        g['createdAt'] = date_obj.isoformat()
        out.append(g)
    return out


def _get_mis_tasks(user, date_obj):
    if role_at_least(user.role, 'Manager'):
        reports = Report.query.all()
    else:
        principals = _active_handover_principals(user, date_obj)
        name_lookup = _build_name_lookup(principals)
        from sqlalchemy import or_
        clauses = []
        for email in principals:
            clauses.append(Report.primary_assignee.ilike(f"%{email}%"))
            n = name_lookup.get(email)
            if n:
                clauses.append(Report.primary_assignee.ilike(f"%{n}%"))
        reports = Report.query.filter(or_(*clauses)).all() if clauses else []
    
    # Batched lookup of today's MIS logs. Scoped to principals if teammate, else global.
    if role_at_least(user.role, 'Manager'):
        mis_logs = MasterLog.query.filter_by(
            entry_date=date_obj,
            entry_type='MISReport',
            row_status='Active',
        ).all()
    else:
        principals = _active_handover_principals(user, date_obj)
        mis_logs = MasterLog.query.filter(
            MasterLog.entry_date == date_obj,
            MasterLog.entry_type == 'MISReport',
            MasterLog.row_status == 'Active',
            MasterLog.on_behalf_of_email.in_(list(principals))
        ).all()

    # Index logs by (topic, on_behalf_of_email)
    mis_log_index = {(l.topic, l.on_behalf_of_email.lower()): l for l in mis_logs}

    # Pre-load user emails mapping
    users_map = {}
    for u in User.query.all():
        users_map[u.email.lower()] = u.email.lower()
        users_map[u.name.lower()] = u.email.lower()

    def _get_email(assignee):
        if not assignee:
            return user.email.lower()
        a = assignee.strip().lower()
        if a in ('all', 'yes', 'no'):
            return user.email.lower()
        return users_map.get(a, user.email.lower())

    override_index = _load_override_index(date_obj)
    mis_tasks = []
    for r in reports:
        if not should_fire_with_override('Report', r.name, '',
                                          r.frequency, getattr(r, 'schedule_day', '') or '',
                                          date_obj, override_index):
            continue
        
        email = _get_email(r.primary_assignee)
        log = mis_log_index.get((r.name, email))
        mis_tasks.append({
            'task_type': 'MISReport',
            'name': r.name,
            'reportName': r.name,
            'frequency': r.frequency,
            'assignee': r.primary_assignee or '',
            'instructions': getattr(r, 'instructions', '') or '',
            'logId': log.log_id if log else '',
            'status': log.status if log else 'Pending',
            'createdAt': (log.timestamp_submitted.isoformat()
                          if log and log.timestamp_submitted else date_obj.isoformat()),
        })
    return mis_tasks


def _get_report_group_tasks(user, date_obj):
    """Report-Merge groups that should appear today."""
    is_mgr = role_at_least(user.role, 'Manager')
    principals = _active_handover_principals(user, date_obj) if not is_mgr else set()
    name_lookup = _build_name_lookup(principals) if not is_mgr else {}
    override_index = _load_override_index(date_obj)
    out = []
    
    # Batched lookup of report group logs.
    if is_mgr:
        group_logs = MasterLog.query.filter_by(
            entry_date=date_obj,
            entry_type='ReportGroup',
            row_status='Active',
        ).all()
    else:
        group_logs = MasterLog.query.filter(
            MasterLog.entry_date == date_obj,
            MasterLog.entry_type == 'ReportGroup',
            MasterLog.row_status == 'Active',
            MasterLog.on_behalf_of_email.in_(list(principals))
        ).all()

    group_log_index = {(l.topic, l.on_behalf_of_email.lower()): l for l in group_logs}

    # Pre-load user emails mapping
    users_map = {}
    for u in User.query.all():
        users_map[u.email.lower()] = u.email.lower()
        users_map[u.name.lower()] = u.email.lower()

    def _get_email(assignee):
        if not assignee:
            return user.email.lower()
        a = assignee.strip().lower()
        if a in ('all', 'yes', 'no'):
            return user.email.lower()
        return users_map.get(a, user.email.lower())

    for g in ReportGroup.query.all():
        if not should_fire_with_override('ReportGroup', f"{g.parent_category}::{g.group_name}", '',
                                          g.frequency, getattr(g, 'schedule_day', '') or '',
                                          date_obj, override_index):
            continue
        if not is_mgr:
            if (g.visibility or 'managers') == 'managers':
                continue
            if not _matches_any_principal(g.primary_assignee or '', principals, name_lookup):
                continue
        
        email = _get_email(g.primary_assignee)
        log = group_log_index.get((g.group_name, email))
        out.append({
            'task_type': 'ReportGroup',
            'name': f"Merged Report: {g.parent_category} — {g.group_name}",
            'groupId': g.id,
            'groupName': g.group_name,
            'parentCategory': g.parent_category,
            'members': [m.strip() for m in (g.members or '').split(',') if m.strip()],
            'frequency': g.frequency,
            'assignee': g.primary_assignee or '',
            'instructions': g.remark or '',
            'status': log.status if log else 'Pending',
            'createdAt': (log.timestamp_submitted.isoformat() if log and log.timestamp_submitted else date_obj.isoformat()),
        })
    return out


@tasks_bp.route('/today', methods=['GET'])
@jwt_required()
def get_today_tasks():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    today = date.today()
    dow = today.weekday()  # 0=Mon, 6=Sun
    holiday = _is_holiday(today)

    # On Sat/Sun we skip recurring daily/MIS/DU tasks but still surface the previously
    # submitted entries (so users can view/audit anything filed on the weekend).
    daily_tasks, roster_tasks, du_tasks, mis_tasks, group_tasks = [], [], [], [], []

    def _sort_section(items):
        """Pending first (newest createdAt first), then Done at the bottom (newest first)."""
        def key(it):
            done = (it.get('status') or '').lower() == 'done'
            ts = it.get('createdAt') or ''
            # tuple: (done? 1:0 → done last, then negative timestamp so newer is first)
            return (1 if done else 0, -1 * (len(ts) and ord(ts[0]) or 0), ts)
        # Simpler: sort by done flag then by createdAt DESC string
        items.sort(key=lambda it: ((it.get('status') or '').lower() == 'done', it.get('createdAt') or ''),
                   reverse=False)
        # The above puts Done last. For createdAt DESC inside each bucket, do a stable second pass.
        items_pending = [i for i in items if (i.get('status') or '').lower() != 'done']
        items_done = [i for i in items if (i.get('status') or '').lower() == 'done']
        items_pending.sort(key=lambda i: i.get('createdAt') or '', reverse=True)
        items_done.sort(key=lambda i: i.get('createdAt') or '', reverse=True)
        return items_pending + items_done

    if not holiday:
        # Single batched lookup of today's logs. Scoped to principals if teammate, else global.
        if role_at_least(user.role, 'Manager'):
            todays_logs = MasterLog.query.filter_by(
                entry_date=today,
                row_status='Active',
            ).all()
        else:
            principals = _active_handover_principals(user, today)
            todays_logs = MasterLog.query.filter(
                MasterLog.entry_date == today,
                MasterLog.row_status == 'Active',
                MasterLog.on_behalf_of_email.in_(list(principals))
            ).all()

        # Index logs by (entry_type, topic, sub_topic, on_behalf_of_email)
        log_index = {(l.entry_type, l.topic, l.sub_topic or '', l.on_behalf_of_email.lower()): l for l in todays_logs}

        # Pre-load user emails mapping
        users_map = {}
        for u in User.query.all():
            users_map[u.email.lower()] = u.email.lower()
            users_map[u.name.lower()] = u.email.lower()

        def _get_email(assignee):
            if not assignee:
                return user.email.lower()
            a = assignee.strip().lower()
            if a in ('all', 'yes', 'no'):
                return user.email.lower()
            return users_map.get(a, user.email.lower())

        # Pre-fetch all overrides relevant to today's periods so we don't query
        # per-task. Passed into should_fire_with_override below.
        override_index = _load_override_index(today)

        templates = TaskTemplate.query.all()
        filtered = _filter_tasks_for_user(templates, user, on_date=today)
        fired_template_topics = set()
        for t in filtered:
            if should_fire_with_override('TaskTemplate', t.name, '',
                                          t.recurrence, getattr(t, 'schedule_day', '') or '',
                                          today, override_index):
                fired_template_topics.add(t.name)
                d = t.to_dict()
                
                email = _get_email(t.assignee)
                log = log_index.get(('Task', t.name, '', email))
                
                d['status'] = log.status if log else 'Pending'
                d['logId'] = log.log_id if log else ''
                d['remarks'] = log.remarks if log else ''
                d['createdAt'] = (log.timestamp_submitted.isoformat()
                                  if log and log.timestamp_submitted else today.isoformat())
                d['isAdhoc'] = False
                daily_tasks.append(d)

        # Merge ad-hoc daily tasks that exist in MasterLog today but are not template-derived
        for l in todays_logs:
            if l.entry_type == 'Task' and l.topic not in fired_template_topics:
                daily_tasks.append({
                    'id': None,
                    'name': l.topic,
                    'assignee': l.on_behalf_of_email,
                    'recurrence': 'adhoc',
                    'scheduleDay': '',
                    'instructions': '',
                    'status': l.status,
                    'logId': l.log_id,
                    'remarks': l.remarks or '',
                    'createdAt': l.timestamp_submitted.isoformat() if l.timestamp_submitted else today.isoformat(),
                    'isAdhoc': True
                })

        daily_tasks = _sort_section(daily_tasks)

        # Roster assignments for today — visible to self, manager, or active handover backup.
        roster_principals = _active_handover_principals(user, today)
        roster_name_lookup = _build_name_lookup(roster_principals)
        roster_configs = RosterConfig.query.all()
        # Batched lookup of today's roster logs.
        roster_logs = RosterLog.query.filter_by(date=today).all()
        roster_log_index = {l.role: l for l in roster_logs}
        for rc in roster_configs:
            if not should_fire_with_override('RosterConfig', rc.role, '',
                                              rc.frequency, getattr(rc, 'schedule_day', '') or '',
                                              today, override_index):
                continue
            if role_at_least(user.role, 'Manager') \
                    or _matches_any_principal(rc.employee, roster_principals, roster_name_lookup):
                log = roster_log_index.get(rc.role)
                roster_tasks.append({
                    'rosterId': rc.id,
                    'role': rc.role,
                    'employee': rc.employee,
                    'instructions': rc.remark or '',
                    'status': log.status if log else 'Pending',
                    'createdAt': (log.updated_at.isoformat()
                                  if log and log.updated_at else today.isoformat()),
                })
        roster_tasks = _sort_section(roster_tasks)

        du_tasks = _sort_section(_get_du_tasks(user, today))
        mis_tasks = _sort_section(_get_mis_tasks(user, today))
        group_tasks = _sort_section(_get_report_group_tasks(user, today))

    # ── Feature 7: Carry forward skipped tasks from PREVIOUS day only ──
    carried_forward = []
    # Look back exactly 1 day (the most recent working day)
    yesterday = today - timedelta(days=1)
    # Skip weekends — if yesterday was Sunday, look at Friday; if Saturday, look at Friday
    while yesterday.weekday() in (5, 6):  # Sat=5, Sun=6
        yesterday -= timedelta(days=1)

    skipped_rows = MasterLog.query.filter(
        MasterLog.on_behalf_of_email == user.email,
        MasterLog.status == 'Skip',
        MasterLog.row_status == 'Active',
        MasterLog.entry_date == yesterday,
    ).all()

    # Build set of today's topics (across all types) so we skip entries already addressed
    today_topics = set()
    for l in (todays_logs if not holiday else []):
        today_topics.add((l.entry_type, l.topic, l.sub_topic or ''))

    seen_skip_topics = set()
    for sk in skipped_rows:
        key = (sk.entry_type, sk.topic, sk.sub_topic or '')
        if key in today_topics:
            continue  # already addressed today
        if key in seen_skip_topics:
            continue  # only carry the most recent skip per topic
        seen_skip_topics.add(key)
        carried_forward.append({
            'logId': sk.log_id,
            'topic': sk.topic,
            'subTopic': sk.sub_topic or '',
            'entryType': sk.entry_type,
            'status': 'Pending',
            'originalStatus': 'Skip',
            'remarks': sk.remarks or '',
            'carriedFrom': sk.entry_date.isoformat() if hasattr(sk.entry_date, 'isoformat') else str(sk.entry_date or ''),
            'timestamp': sk.timestamp_submitted.isoformat() if hasattr(sk.timestamp_submitted, 'isoformat') else str(sk.timestamp_submitted or ''),
        })

    # Always show today's submitted task entries (even on holidays — for audit)
    query = MasterLog.query.filter(
        MasterLog.entry_date == today,
        MasterLog.entry_type == 'Task',
        MasterLog.row_status == 'Active',
    )
    if not role_at_least(user.role, 'Manager'):
        query = query.filter(MasterLog.on_behalf_of_email == user.email)
    submitted = [r.to_dict() for r in query.all()]

    return jsonify({
        'success': True,
        'today': today.isoformat(),
        'dayName': DAYS_OF_WEEK[dow],
        'holiday': holiday,
        'holidayReason': 'Weekend (Saturday / Sunday)' if holiday else '',
        'dailyTasks': daily_tasks,
        'rosterTasks': roster_tasks,
        'duTasks': du_tasks,
        'misTasks': mis_tasks,
        'groupTasks': group_tasks,
        'carriedForward': carried_forward,
        'submitted': submitted,
    })



@tasks_bp.route('/weekly', methods=['GET'])
@jwt_required()
def get_weekly_tasks():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    today = date.today()
    monday = today - timedelta(days=today.weekday())

    templates = TaskTemplate.query.all()
    filtered = _filter_tasks_for_user(templates, user)

    weekly_tasks = [t.to_dict() for t in filtered if (t.recurrence or '').lower() == 'weekly']

    # Build week grid
    week_grid = {}
    for i in range(7):
        day = monday + timedelta(days=i)
        day_name = DAYS_OF_WEEK[i]
        # Get entries for this day
        query = MasterLog.query.filter(
            MasterLog.entry_date == day,
            MasterLog.entry_type == 'Task',
            MasterLog.row_status == 'Active',
        )
        if not role_at_least(user.role, 'Manager'):
            query = query.filter(MasterLog.on_behalf_of_email == user.email)
        entries = [r.to_dict() for r in query.all()]
        week_grid[day_name] = {
            'date': day.isoformat(),
            'dayName': day_name,
            'isToday': day == today,
            'isHoliday': _is_holiday(day),
            'entries': entries,
        }

    return jsonify({
        'success': True,
        'weekStart': monday.isoformat(),
        'weekEnd': (monday + timedelta(days=6)).isoformat(),
        'weeklyTasks': weekly_tasks,
        'weekGrid': week_grid,
    })


def _compute_default_date_for_period(frequency, schedule_day, ref_date):
    """Given a period containing ref_date, return the date the task would
    fire by default (no override). Returns None if not applicable.
    """
    f = _normalize_freq(frequency)
    # Walk every day in the period and call should_run_today
    if f == 'monthly':
        start = ref_date.replace(day=1)
        nm = start.replace(day=28) + timedelta(days=4)
        end = nm - timedelta(days=nm.day)
    elif f == 'quarterly':
        q = (ref_date.month - 1) // 3
        start = ref_date.replace(month=q * 3 + 1, day=1)
        m_end = start.month + 2
        nm = start.replace(month=m_end, day=28) + timedelta(days=4)
        end = nm - timedelta(days=nm.day)
    elif f == 'half-yearly':
        start = ref_date.replace(month=1 if ref_date.month <= 6 else 7, day=1)
        nm = (start.replace(month=start.month + 5, day=28)) + timedelta(days=4)
        end = nm - timedelta(days=nm.day)
    elif f == 'yearly':
        start = ref_date.replace(month=1, day=1)
        end = ref_date.replace(month=12, day=31)
    else:
        return None
    d = start
    while d <= end:
        if should_run_today(frequency, schedule_day, d):
            return d
        d += timedelta(days=1)
    return None


@tasks_bp.route('/monthly', methods=['GET'])
@jwt_required()
def get_monthly_tasks():
    """Lists all monthly+ tasks (TaskTemplate, Report, Factor Task, Report Group,
    Roster) that fire some time this month, with their default vs. effective
    date and any active override. Managers see all; teammates see their own.
    """
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401
    is_mgr = role_at_least(user.role, 'Manager')

    today = date.today()
    month_start = today.replace(day=1)
    if today.month == 12:
        month_end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        month_end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)

    # Pre-load overrides covering any period that includes a day this month.
    candidate_periods = set()
    for d in (month_start, month_end):
        for fr in ('monthly', 'quarterly', 'half-yearly', 'yearly'):
            pk = _period_key(fr, d)
            if pk:
                candidate_periods.add(pk)
    overrides = TaskOverride.query.filter(
        TaskOverride.period_key.in_(list(candidate_periods))
    ).all() if candidate_periods else []
    ov_index = {(o.entity_type, o.entity_key, o.sub_key or '', o.period_key): o for o in overrides}

    # Personal per-user frequency overrides (Manager+ can set these for themselves).
    def _entry(entity_type, entity_key, name, frequency, schedule_day, assignee, sub_key=''):
        pk = _period_key(frequency, today)
        default_date = _compute_default_date_for_period(frequency, schedule_day, today)
        ov = ov_index.get((entity_type, entity_key, sub_key, pk)) if pk else None
        effective = ov.new_date if (ov and ov.new_date) else default_date
        return {
            'entityType': entity_type,
            'entityKey': entity_key,
            'subKey': sub_key,
            'name': name,
            'frequency': frequency,
            'scheduleDay': schedule_day or '',
            'periodKey': pk,
            'defaultDate': default_date.isoformat() if default_date else '',
            'effectiveDate': effective.isoformat() if effective else '',
            'overridden': bool(ov),
            'overrideId': ov.id if ov else None,
            'overrideReason': ov.reason if ov else '',
            'assignee': assignee or '',
        }

    monthly_items = []

    # Task Templates
    for t in _filter_tasks_for_user(TaskTemplate.query.all(), user, on_date=today):
        f = _normalize_freq(t.recurrence)
        if f in ('monthly', 'quarterly', 'half-yearly', 'yearly'):
            monthly_items.append(_entry(
                'TaskTemplate', t.name, t.name, t.recurrence,
                getattr(t, 'schedule_day', '') or '', t.assignee or ''))

    # Reports
    reports = Report.query.all()
    if not is_mgr:
        me = user.email.lower()
        nm = (user.name or '').lower()
        reports = [r for r in reports if me in (r.primary_assignee or '').lower()
                   or (nm and nm in (r.primary_assignee or '').lower())]
    for r in reports:
        f = _normalize_freq(r.frequency)
        if f in ('monthly', 'quarterly', 'half-yearly', 'yearly'):
            monthly_items.append(_entry(
                'Report', r.name, r.name, r.frequency,
                getattr(r, 'schedule_day', '') or '', r.primary_assignee or ''))

    # Factor Tasks (Commodity Configs)
    for c in CommodityConfig.query.all():
        f = _normalize_freq(c.type)
        if f not in ('monthly', 'quarterly', 'half-yearly', 'yearly'):
            continue
        owner = (c.mode or c.primary_assignee or '').lower()
        if not is_mgr and owner != user.email.lower() and owner != (user.name or '').lower():
            continue
        monthly_items.append(_entry(
            'CommodityConfig', f"{c.commodity}::{c.type}",
            f"{c.commodity} — {c.factor}", c.type,
            getattr(c, 'schedule_day', '') or '', c.mode or c.primary_assignee or '',
            sub_key=c.factor))

    # Report Groups
    for g in ReportGroup.query.all():
        f = _normalize_freq(g.frequency)
        if f not in ('monthly', 'quarterly', 'half-yearly', 'yearly'):
            continue
        if not is_mgr and (g.visibility or 'managers') == 'managers':
            continue
        monthly_items.append(_entry(
            'ReportGroup', f"{g.parent_category}::{g.group_name}",
            f"{g.parent_category} — {g.group_name}", g.frequency,
            getattr(g, 'schedule_day', '') or '', g.primary_assignee or ''))

    # Roster
    for rc in RosterConfig.query.all():
        f = _normalize_freq(rc.frequency)
        if f not in ('monthly', 'quarterly', 'half-yearly', 'yearly'):
            continue
        if not is_mgr and (rc.employee or '').lower() != user.email.lower() \
                and (rc.employee or '').lower() != (user.name or '').lower():
            continue
        monthly_items.append(_entry(
            'RosterConfig', rc.role, rc.role, rc.frequency,
            getattr(rc, 'schedule_day', '') or '', rc.employee or ''))

    # Sort by effective date so the manager scans the month chronologically.
    monthly_items.sort(key=lambda x: (x['effectiveDate'] or '9999-12-31', x['name']))

    # Existing entries for the month (kept for backward compatibility)
    query = MasterLog.query.filter(
        MasterLog.entry_date >= month_start,
        MasterLog.entry_date <= month_end,
        MasterLog.entry_type == 'Task',
        MasterLog.row_status == 'Active',
    )
    if not is_mgr:
        query = query.filter(MasterLog.on_behalf_of_email == user.email)
    entries_by_date = {}
    for r in query.all():
        ds = r.entry_date.isoformat() if hasattr(r.entry_date, 'isoformat') else str(r.entry_date or '')
        entries_by_date.setdefault(ds, []).append(r.to_dict())

    return jsonify({
        'success': True,
        'monthStart': month_start.isoformat(),
        'monthEnd': month_end.isoformat(),
        'canManage': is_mgr,
        'monthlyItems': monthly_items,
        'monthlyTasks': [],  # legacy field kept for older callers
        'entriesByDate': entries_by_date,
    })


@tasks_bp.route('/override', methods=['POST'])
@jwt_required()
def set_override():
    """Create or replace a per-period override. Managers only.
    Body: {entityType, entityKey, subKey?, periodKey, newDate (YYYY-MM-DD), reason?}
    """
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'):
        return jsonify({'success': False, 'message': 'Manager access required'}), 403
    data = request.get_json() or {}
    entity_type = (data.get('entityType') or '').strip()
    entity_key = (data.get('entityKey') or '').strip()
    sub_key = (data.get('subKey') or '').strip()
    period_key = (data.get('periodKey') or '').strip()
    if not entity_type or not entity_key or not period_key:
        return jsonify({'success': False, 'message': 'entityType, entityKey, periodKey required'}), 400
    try:
        new_date = date.fromisoformat(data.get('newDate', ''))
    except ValueError:
        return jsonify({'success': False, 'message': 'newDate must be YYYY-MM-DD'}), 400

    existing = TaskOverride.query.filter_by(
        entity_type=entity_type, entity_key=entity_key,
        sub_key=sub_key, period_key=period_key,
    ).first()
    if existing:
        existing.new_date = new_date
        existing.reason = data.get('reason', '')
        existing.created_by = user.email
        existing.created_at = datetime.now(timezone.utc)
        ov = existing
    else:
        ov = TaskOverride(
            entity_type=entity_type,
            entity_key=entity_key,
            sub_key=sub_key,
            period_key=period_key,
            new_date=new_date,
            reason=data.get('reason', ''),
            created_by=user.email,
        )
        db.session.add(ov)
    db.session.commit()
    log_audit(user.email, 'TASK_OVERRIDE_SET', entity_type, entity_key,
              after=ov.to_dict())
    return jsonify({'success': True, 'override': ov.to_dict()})


@tasks_bp.route('/override/<int:ov_id>', methods=['DELETE'])
@jwt_required()
def clear_override(ov_id):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'):
        return jsonify({'success': False, 'message': 'Manager access required'}), 403
    ov = TaskOverride.query.get(ov_id)
    if not ov:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    before = ov.to_dict()
    db.session.delete(ov)
    db.session.commit()
    log_audit(user.email, 'TASK_OVERRIDE_CLEAR', ov.entity_type, ov.entity_key, before=before)
    return jsonify({'success': True})


@tasks_bp.route('/remark', methods=['POST'])
@jwt_required()
def save_remark():
    """Upsert a remark / status for a single today-view element.

    Body: {entryType, topic, subTopic?, remark?, status?, date?}
      - entryType: 'Task' | 'DataUpdate' | 'MISReport' | 'ReportGroup' | 'Roster'
      - topic: the element identifier (task name, report name, group name, etc.)
      - subTopic (optional): used for DataUpdate to address a single factor
      - remark (optional): text
      - status (optional): Done | Pending | Skip (defaults to Pending)
    """
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    data = request.get_json() or {}
    entry_type = (data.get('entryType') or '').strip()
    topic = (data.get('topic') or '').strip()
    sub_topic = (data.get('subTopic') or '').strip()
    if not entry_type or not topic:
        return jsonify({'success': False, 'message': 'entryType and topic required'}), 400

    try:
        entry_date = date.fromisoformat(data.get('date') or date.today().isoformat())
    except ValueError:
        entry_date = date.today()

    remark = data.get('remark', '')
    status = data.get('status', 'Pending')

    # Roster has its own log table — handle separately
    if entry_type == 'Roster':
        log = RosterLog.query.filter_by(date=entry_date, role=topic).first()
        if log:
            log.status = status
            log.updated_at = datetime.now(timezone.utc)
        else:
            log = RosterLog(
                date=entry_date,
                role=topic,
                employee=user.email,
                status=status,
                updated_at=datetime.now(timezone.utc),
            )
            db.session.add(log)
        # remarks on roster live on RosterConfig.remark, but per-day notes are stored
        # by piggy-backing a MasterLog entry of type 'Task'/'Roster' if desired.
        if remark:
            existing = MasterLog.query.filter_by(
                on_behalf_of_email=user.email,
                entry_date=entry_date,
                topic=f"Roster: {topic}",
                row_status='Active',
            ).first()
            if existing:
                existing.remarks = remark
                existing.status = status
            else:
                db.session.add(MasterLog(
                    log_id=_new_log_id(),
                    timestamp_submitted=datetime.now(timezone.utc),
                    submitted_by_email=user.email,
                    on_behalf_of_email=user.email,
                    on_behalf_of_name=user.name,
                    entry_type='Task',
                    entry_date=entry_date,
                    week_number=_get_week_number(entry_date),
                    month_year=entry_date.strftime('%B %Y'),
                    topic=f"Roster: {topic}",
                    status=status,
                    remarks=remark,
                    row_status='Active',
                ))
        db.session.commit()
        return jsonify({'success': True})

    # All other types: upsert a MasterLog row (keyed by topic + sub_topic).
    q = MasterLog.query.filter_by(
        on_behalf_of_email=user.email,
        entry_date=entry_date,
        topic=topic,
        entry_type=entry_type,
        row_status='Active',
    )
    if sub_topic:
        q = q.filter(MasterLog.sub_topic == sub_topic)
    else:
        q = q.filter((MasterLog.sub_topic == '') | (MasterLog.sub_topic.is_(None)))
    existing = q.first()

    if existing:
        if 'remark' in data:
            existing.remarks = remark
        existing.status = status
        existing.timestamp_submitted = datetime.now(timezone.utc)
    else:
        db.session.add(MasterLog(
            log_id=_new_log_id(),
            timestamp_submitted=datetime.now(timezone.utc),
            submitted_by_email=user.email,
            on_behalf_of_email=user.email,
            on_behalf_of_name=user.name,
            entry_type=entry_type,
            entry_date=entry_date,
            week_number=_get_week_number(entry_date),
            month_year=entry_date.strftime('%B %Y'),
            topic=topic,
            sub_topic=sub_topic,
            status=status,
            remarks=remark,
            row_status='Active',
        ))
    db.session.commit()
    return jsonify({'success': True})


@tasks_bp.route('/submit', methods=['POST'])
@jwt_required()
def submit_tasks():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    data = request.get_json()
    tasks = data.get('tasks', [])
    if not tasks:
        return jsonify({'success': False, 'message': 'No tasks to submit'}), 400

    entry_date = date.fromisoformat(data.get('date', date.today().isoformat()))
    now = datetime.now(timezone.utc)
    log_ids = []

    for t in tasks:
        log_id = _new_log_id()
        entry = MasterLog(
            log_id=log_id,
            timestamp_submitted=now,
            submitted_by_email=user.email,
            on_behalf_of_email=data.get('onBehalfOf', user.email).lower(),
            on_behalf_of_name=user.name,
            entry_type='Task',
            entry_date=entry_date,
            week_number=_get_week_number(entry_date),
            month_year=entry_date.strftime('%B %Y'),
            topic=t.get('name', ''),
            sub_topic='',
            status=t.get('status', 'Pending'),
            mode_or_extra='',
            remarks=t.get('remarks', ''),
            row_status='Active',
        )
        db.session.add(entry)
        log_ids.append(log_id)

    db.session.commit()

    done = sum(1 for t in tasks if t.get('status') == 'Done')
    pending = sum(1 for t in tasks if t.get('status') == 'Pending')

    log_audit(user.email, 'TASK_SUBMIT', 'log', ','.join(log_ids),
              after={'count': len(tasks), 'done': done, 'pending': pending})

    return jsonify({
        'success': True,
        'message': f'Saved {len(tasks)} tasks. Done: {done} Pending: {pending}',
        'logIds': log_ids,
    })


@tasks_bp.route('/update/<log_id>', methods=['PUT'])
@jwt_required()
def update_task(log_id):
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    entry = MasterLog.query.filter_by(log_id=log_id, row_status='Active').first()
    if not entry:
        return jsonify({'success': False, 'message': 'Entry not found'}), 404

    if not role_at_least(user.role, 'Manager') and entry.on_behalf_of_email != user.email:
        return jsonify({'success': False, 'message': 'Not authorized'}), 403

    data = request.get_json()
    if 'status' in data:
        entry.status = data['status']
    if 'remarks' in data:
        entry.remarks = data['remarks']
    entry.timestamp_submitted = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({'success': True})


@tasks_bp.route('/add', methods=['POST'])
@jwt_required()
def add_task():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401
    # Teammates cannot create new task templates from the Tasks page.
    if not role_at_least(user.role, 'Leader'):
        return jsonify({'success': False, 'message': 'Only Leaders and above can add tasks'}), 403

    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Task name required'}), 400

    freq = data.get('freq', 'daily').lower()
    if freq not in ('daily', 'weekly', 'monthly'):
        freq = 'daily'

    template = TaskTemplate(
        name=name,
        assignee=data.get('assignee', user.name),
        recurrence=freq,
    )
    db.session.add(template)
    db.session.commit()

    return jsonify({'success': True, 'task': template.to_dict()})


@tasks_bp.route('/add-adhoc', methods=['POST'])
@jwt_required()
def add_adhoc_task():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Task name required'}), 400

    today = date.today()
    
    # Check if an ad-hoc task with the same topic/name already exists today for this user
    existing = MasterLog.query.filter_by(
        on_behalf_of_email=user.email,
        entry_date=today,
        topic=name,
        entry_type='Task',
        row_status='Active'
    ).first()
    if existing:
        return jsonify({'success': False, 'message': 'Task already exists for today'}), 400

    new_log = MasterLog(
        log_id=_new_log_id(),
        timestamp_submitted=datetime.now(timezone.utc),
        submitted_by_email=user.email,
        on_behalf_of_email=user.email,
        on_behalf_of_name=user.name,
        entry_type='Task',
        entry_date=today,
        week_number=_get_week_number(today),
        month_year=today.strftime('%B %Y'),
        topic=name,
        status='Pending',
        remarks='',
        row_status='Active',
    )
    db.session.add(new_log)
    db.session.commit()

    log_audit(user.email, 'ADD_ADHOC_TASK', 'task', name, after=new_log.to_dict())

    return jsonify({'success': True, 'task': new_log.to_dict()})


@tasks_bp.route('/snapshot', methods=['GET'])
@jwt_required()
def get_snapshot():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    today = date.today()
    query = MasterLog.query.filter(
        MasterLog.entry_date == today,
        MasterLog.entry_type == 'Task',
        MasterLog.row_status == 'Active',
    )
    if not role_at_least(user.role, 'Manager'):
        query = query.filter(MasterLog.on_behalf_of_email == user.email)

    entries = [r.to_dict() for r in query.all()]
    return jsonify({'success': True, 'snapshot': entries})


@tasks_bp.route('/history', methods=['GET'])
@jwt_required()
def get_task_history():
    """Return paginated MasterLog entries (all types) for the current user.

    Query params:
        from   YYYY-MM-DD  (default: 30 days ago)
        to     YYYY-MM-DD  (default: today)
        type   entry type filter: Task | MISReport | Roster | DataUpdate | ReportGroup | '' (all)
        status status filter: Done | Pending | Skip | '' (all)
        page   page number (1-indexed, default 1)
        per    items per page (default 50, max 200)
    """
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    today = date.today()
    default_from = today - timedelta(days=30)

    try:
        from_date = date.fromisoformat(request.args.get('from', default_from.isoformat()))
    except ValueError:
        from_date = default_from
    try:
        to_date = date.fromisoformat(request.args.get('to', today.isoformat()))
    except ValueError:
        to_date = today

    entry_type_filter = request.args.get('type', '').strip()
    status_filter = request.args.get('status', '').strip()

    try:
        page = max(1, int(request.args.get('page', 1)))
        per = min(200, max(1, int(request.args.get('per', 50))))
    except ValueError:
        page, per = 1, 50

    query = MasterLog.query.filter(
        MasterLog.row_status != 'Amended',
        MasterLog.entry_date >= from_date,
        MasterLog.entry_date <= to_date,
    )

    if not role_at_least(user.role, 'Manager'):
        query = query.filter(MasterLog.on_behalf_of_email == user.email)
    else:
        # Managers see their dept; SuperAdmin sees all
        if user.role != 'SuperAdmin':
            dept_emails = [u.email for u in User.query.filter_by(department=user.department).all()]
            query = query.filter(MasterLog.on_behalf_of_email.in_(dept_emails))

    if entry_type_filter:
        query = query.filter(MasterLog.entry_type == entry_type_filter)
    if status_filter:
        query = query.filter(MasterLog.status == status_filter)

    query = query.order_by(MasterLog.entry_date.desc(), MasterLog.timestamp_submitted.desc())

    total = query.count()
    rows = query.offset((page - 1) * per).limit(per).all()

    # Also pull Roster history from RosterLog for this user
    roster_entries = []
    if not entry_type_filter or entry_type_filter == 'Roster':
        rq = RosterLog.query.filter(
            RosterLog.date >= from_date,
            RosterLog.date <= to_date,
        )
        if not role_at_least(user.role, 'Manager'):
            rq = rq.filter(
                db.or_(
                    RosterLog.employee == user.email,
                    RosterLog.employee == user.name,
                )
            )
        if status_filter:
            rq = rq.filter(RosterLog.status == status_filter)
        for rl in rq.all():
            roster_entries.append({
                'logId': f'ROSTER_{rl.date}_{rl.role}',
                'entryDate': rl.date.isoformat() if hasattr(rl.date, 'isoformat') else str(rl.date or ''),
                'entryType': 'Roster',
                'topic': rl.role,
                'subTopic': '',
                'status': rl.status,
                'remarks': '',
                'onBehalfOfEmail': rl.employee,
                'onBehalfOfName': rl.employee,
                'timestampSubmitted': rl.updated_at.isoformat() if hasattr(rl.updated_at, 'isoformat') else str(rl.updated_at or ''),
                'isLate': False,
            })

    entries = [r.to_dict() for r in rows]

    return jsonify({
        'success': True,
        'entries': entries,
        'rosterEntries': roster_entries,
        'total': total,
        'page': page,
        'per': per,
        'pages': (total + per - 1) // per if per > 0 else 1,
        'fromDate': from_date.isoformat(),
        'toDate': to_date.isoformat(),
    })

