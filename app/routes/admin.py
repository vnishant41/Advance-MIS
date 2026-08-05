"""
Admin — User management, settings, audit trail, report merging, bulk CSV import.
"""
import csv
import io
import json
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required
from app import db
from app.models import (
    User, AppSetting, ModuleToggle, AuditLog, Report, CommodityConfig,
    TaskTemplate, RosterConfig, ReportGroup, BackupActivation,
)
from app.auth import get_current_user, role_at_least, log_audit

admin_bp = Blueprint('admin', __name__)


def _require_manager():
    """Return (user, error_response) — error_response is None when allowed."""
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'):
        return None, (jsonify({'success': False, 'message': 'Manager access required'}), 403)
    return user, None


def _parse_csv(file_storage):
    """Parse an uploaded CSV file into list of dict rows. Headers are normalised
    to a lowercase, alias-resolved canonical key so the import doesn't care
    whether the user uses `factor` or `Factor or Task` or `FactorOrTask`.
    """
    raw = file_storage.read()
    if not raw:
        return []
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('latin-1', errors='replace')
    reader = csv.DictReader(io.StringIO(text))

    # Header aliases — accept anything sensible from the user
    aliases = {
        'factor': 'factor', 'factor or task': 'factor', 'factortask': 'factor',
        'factor/task': 'factor', 'factor_or_task': 'factor', 'factorortask': 'factor',
        'task or factor': 'factor', 'task': 'factor',
        'scheduleday': 'scheduleDay', 'schedule day': 'scheduleDay',
        'schedule_day': 'scheduleDay',
        'primaryassignee': 'primaryAssignee', 'primary assignee': 'primaryAssignee',
        'primary_assignee': 'primaryAssignee', 'assignee': 'assignee',
        'backup1': 'backup1', 'backup 1': 'backup1', 'backup_1': 'backup1', 'backup1st': 'backup1',
        'backup2': 'backup2', 'backup 2': 'backup2', 'backup_2': 'backup2', 'backup2nd': 'backup2',
        'parentcategory': 'parentCategory', 'parent category': 'parentCategory',
        'parent_category': 'parentCategory',
        'groupname': 'groupName', 'group name': 'groupName', 'group_name': 'groupName',
    }

    def canonical(k):
        if not k:
            return ''
        kl = k.strip().lower().replace('-', ' ')
        return aliases.get(kl, k.strip())

    rows = []
    for row in reader:
        out = {}
        for k, v in row.items():
            if not k:
                continue
            ck = canonical(k)
            out[ck] = (v or '').strip()
        rows.append(out)
    return rows


def _csv_response(filename, headers, sample_rows):
    """Build a downloadable CSV with header + sample rows."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for r in sample_rows:
        writer.writerow(r)
    return Response(
        buf.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )

@admin_bp.route('/users', methods=['GET'])
@jwt_required()
def get_users():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    if user.role == 'SuperAdmin':
        users = User.query.all()
    else:
        users = User.query.filter((User.department == user.department) | (User.role == 'Teammate')).all()
    return jsonify({'success': True, 'data': [u.to_dict(include_password=(user.role == 'SuperAdmin')) for u in users]})

@admin_bp.route('/users', methods=['POST'])
@jwt_required()
def add_user():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    if not email: return jsonify({'success': False, 'message': 'Email required'}), 400
    if User.query.filter_by(email=email).first(): return jsonify({'success': False, 'message': 'User already exists'}), 400
    new_user = User(email=email, name=data.get('name', ''), role=data.get('role', 'Teammate'), department=data.get('department', user.department), active=True, password_hash=data.get('password', 'changeme'), commodities=data.get('commodities', ''), backup_of=data.get('backupOf', ''))
    db.session.add(new_user)
    db.session.commit()
    log_audit(user.email, 'USER_ADD', 'user', email, after=new_user.to_dict())
    return jsonify({'success': True})

@admin_bp.route('/users/<email>', methods=['PUT'])
@jwt_required()
def update_user(email):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    target = User.query.filter_by(email=email.lower()).first()
    if not target: return jsonify({'success': False, 'message': 'User not found'}), 404
    data = request.get_json()
    before = target.to_dict()
    if 'name' in data: target.name = data['name']
    if 'role' in data and role_at_least(user.role, 'SuperAdmin'): target.role = data['role']
    if 'department' in data: target.department = data['department']
    if 'active' in data: target.active = data['active']
    if 'password' in data and role_at_least(user.role, 'SuperAdmin'): target.password_hash = data['password']
    if 'commodities' in data: target.commodities = data['commodities']
    if 'backupOf' in data: target.backup_of = data['backupOf']
    db.session.commit()
    log_audit(user.email, 'USER_UPDATE', 'user', email, before=before, after=target.to_dict())
    return jsonify({'success': True})

@admin_bp.route('/users/<email>', methods=['DELETE'])
@jwt_required()
def remove_user(email):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    if email.lower() == user.email: return jsonify({'success': False, 'message': 'Cannot remove yourself'}), 400
    target = User.query.filter_by(email=email.lower()).first()
    if not target: return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(target)
    db.session.commit()
    log_audit(user.email, 'USER_REMOVE', 'user', email)
    return jsonify({'success': True})

@admin_bp.route('/settings', methods=['GET'])
@jwt_required()
def get_settings():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    settings = {s.key: s.value for s in AppSetting.query.all()}
    defaults = {
        'windowStart': '08:00',
        'windowEnd': '22:00',
        'managerEmail': '',
        'escalateDays': '3',
        'lockDuplicate': 'YES',
        'requireRemarks': 'YES',
        'skipWeekends': 'YES',
        'emailDigestEnabled': 'NO',
        'emailDigestTime': '18:00',
        'emailTeammateReminderEnabled': 'NO',
        'emailTeammateReminderTime': '14:00',
        'emailTeammateReminderSubject': '⏰ Daily MIS Task Reminder — {user_name} ({pending_count} Pending)',
        'emailTeammateReminderBodyTmpl': '',
        'emailTeammateReminderExcludedEmails': '',
        'emailTeammateFinalEnabled': 'NO',
        'emailTeammateFinalTime': '18:00',
        'emailTeammateTargetRoles': 'Teammate',
        'emailTeammateTargetEmails': '',
        'emailTeammateFinalExcludedEmails': '',
        'emailTeammateSubject': 'Daily MIS Task Summary: Final Update — {user_name} ({score}% Done)',
        'emailTeammateFinalBodyTmpl': '',
        'emailManagerDigestEnabled': 'NO',
        'emailManagerDigestTime': '19:00',
        'emailManagerTargetRoles': 'Manager,SuperAdmin',
        'emailManagerTargetEmails': '',
        'emailManagerDigestExcludedEmails': '',
        'emailManagerSubject': 'MIS Daily Manager Digest — {date_str}',
        'emailManagerDigestBodyTmpl': '',
        'emailLeaderDigestEnabled': 'NO',
        'emailLeaderDigestTime': '20:00',
        'emailLeaderTargetRoles': 'Leader',
        'emailLeaderTargetEmails': '',
        'emailLeaderDigestExcludedEmails': '',
        'emailLeaderSubject': 'MIS Research Team Daily Summary — {date_str}',
        'emailLeaderDigestBodyTmpl': '',
        'smtpHost': '',
        'smtpPort': '587',
        'smtpUser': '',
        'smtpPassword': '',
        'smtpFrom': '',
    }
    for k,v in defaults.items():
        if k not in settings: settings[k] = v
    return jsonify({'success': True, 'settings': settings})

@admin_bp.route('/settings', methods=['POST'])
@jwt_required()
def save_settings():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    data = request.get_json()
    for key, value in data.items():
        setting = AppSetting.query.filter_by(key=key).first()
        if setting:
            setting.value = str(value)
        else:
            db.session.add(AppSetting(key=key, value=str(value)))
    db.session.commit()
    log_audit(user.email, 'SETTINGS_UPDATE', 'settings', after=data)
    return jsonify({'success': True})

@admin_bp.route('/modules', methods=['GET'])
@jwt_required()
def get_modules():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    modules = {m.module_key: m.enabled for m in ModuleToggle.query.all()}
    return jsonify({'success': True, 'modules': modules})

@admin_bp.route('/modules', methods=['POST'])
@jwt_required()
def save_modules():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'SuperAdmin'): return jsonify({'success': False}), 403
    data = request.get_json()
    for key, enabled in data.items():
        toggle = ModuleToggle.query.filter_by(module_key=key).first()
        if toggle: toggle.enabled = bool(enabled)
        else: db.session.add(ModuleToggle(module_key=key, enabled=bool(enabled)))
    db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/audit', methods=['GET'])
@jwt_required()
def get_audit():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    page = request.args.get('page', 1, type=int)
    logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).paginate(page=page, per_page=50, error_out=False)
    return jsonify({'success': True, 'logs': [l.to_dict() for l in logs.items], 'hasMore': logs.has_next, 'total': logs.total})

# --- REPORTS ---
@admin_bp.route('/reports', methods=['GET'])
@jwt_required()
def get_reports():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    return jsonify({'success': True, 'data': [r.to_dict() for r in Report.query.all()]})

@admin_bp.route('/reports', methods=['POST'])
@jwt_required()
def add_report():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    data = request.get_json()
    rep = Report(
        name=data.get('name'),
        frequency=data.get('frequency', 'Daily'),
        primary_assignee=data.get('primaryAssignee', ''),
        backup_1=data.get('backup1', ''),
        backup_2=data.get('backup2', ''),
        deadline=data.get('deadline', ''),
        schedule_day=data.get('scheduleDay', ''),
        instructions=data.get('instructions', ''),
    )
    db.session.add(rep)
    db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/reports/<int:r_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def modify_report(r_id):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    rep = Report.query.get(r_id)
    if not rep: return jsonify({'success': False}), 404
    if request.method == 'DELETE':
        db.session.delete(rep)
    else:
        data = request.get_json()
        if 'name' in data: rep.name = data['name']
        if 'frequency' in data: rep.frequency = data['frequency']
        if 'primaryAssignee' in data: rep.primary_assignee = data['primaryAssignee']
        if 'backup1' in data: rep.backup_1 = data['backup1']
        if 'backup2' in data: rep.backup_2 = data['backup2']
        if 'deadline' in data: rep.deadline = data['deadline']
        if 'scheduleDay' in data: rep.schedule_day = data['scheduleDay']
        if 'instructions' in data: rep.instructions = data['instructions']
    db.session.commit()
    return jsonify({'success': True})

# --- COMMODITIES ---
@admin_bp.route('/commodities', methods=['GET'])
@jwt_required()
def get_admin_commodities():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    return jsonify({'success': True, 'data': [c.to_dict() for c in CommodityConfig.query.all()]})

@admin_bp.route('/commodities', methods=['POST'])
@jwt_required()
def add_commodity():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    data = request.get_json()
    c = CommodityConfig(
        commodity=data.get('commodity'),
        type=data.get('type'),
        factor=data.get('factor'),
        mode=data.get('mode', ''),
        source=data.get('source', ''),
        primary_assignee=data.get('primaryAssignee', ''),
        backup_1=data.get('backup1', ''),
        backup_2=data.get('backup2', ''),
        schedule_day=data.get('scheduleDay', ''),
        instructions=data.get('instructions', ''),
    )
    db.session.add(c)
    db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/commodities/<int:c_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def modify_commodity(c_id):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    c = CommodityConfig.query.get(c_id)
    if not c: return jsonify({'success': False}), 404
    if request.method == 'DELETE':
        db.session.delete(c)
    else:
        data = request.get_json()
        if 'commodity' in data: c.commodity = data['commodity']
        if 'type' in data: c.type = data['type']
        if 'factor' in data: c.factor = data['factor']
        if 'mode' in data: c.mode = data['mode']
        if 'source' in data: c.source = data['source']
        if 'primaryAssignee' in data: c.primary_assignee = data['primaryAssignee']
        if 'backup1' in data: c.backup_1 = data['backup1']
        if 'backup2' in data: c.backup_2 = data['backup2']
        if 'scheduleDay' in data: c.schedule_day = data['scheduleDay']
        if 'instructions' in data: c.instructions = data['instructions']
    db.session.commit()
    return jsonify({'success': True})

# --- TASK TEMPLATES ---
@admin_bp.route('/tasks', methods=['GET'])
@jwt_required()
def get_task_templates():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    return jsonify({'success': True, 'data': [t.to_dict() for t in TaskTemplate.query.all()]})

@admin_bp.route('/tasks', methods=['POST'])
@jwt_required()
def add_task_template():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    data = request.get_json()
    t = TaskTemplate(
        name=data.get('name'),
        assignee=data.get('assignee', ''),
        backup_1=data.get('backup1', ''),
        backup_2=data.get('backup2', ''),
        recurrence=data.get('recurrence', 'daily'),
        schedule_day=data.get('scheduleDay', ''),
        instructions=data.get('instructions', ''),
    )
    db.session.add(t)
    db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/tasks/<int:t_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def modify_task_template(t_id):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    t = TaskTemplate.query.get(t_id)
    if not t: return jsonify({'success': False}), 404
    if request.method == 'DELETE':
        db.session.delete(t)
    else:
        data = request.get_json()
        if 'name' in data: t.name = data['name']
        if 'assignee' in data: t.assignee = data['assignee']
        if 'backup1' in data: t.backup_1 = data['backup1']
        if 'backup2' in data: t.backup_2 = data['backup2']
        if 'recurrence' in data: t.recurrence = data['recurrence']
        if 'scheduleDay' in data: t.schedule_day = data['scheduleDay']
        if 'instructions' in data: t.instructions = data['instructions']
    db.session.commit()
    return jsonify({'success': True})

# --- ROSTER ---
@admin_bp.route('/roster', methods=['GET'])
@jwt_required()
def get_roster():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    return jsonify({'success': True, 'data': [r.to_dict() for r in RosterConfig.query.all()]})

@admin_bp.route('/roster', methods=['POST'])
@jwt_required()
def add_roster():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    data = request.get_json()
    r = RosterConfig(role=data.get('role'), employee=data.get('employee', ''), frequency=data.get('frequency', 'Daily'), schedule_day=data.get('scheduleDay', ''), remark=data.get('remark', ''))
    db.session.add(r)
    db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/roster/<int:r_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def modify_roster(r_id):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    r = RosterConfig.query.get(r_id)
    if not r: return jsonify({'success': False}), 404
    if request.method == 'DELETE':
        db.session.delete(r)
    else:
        data = request.get_json()
        if 'role' in data: r.role = data['role']
        if 'employee' in data: r.employee = data['employee']
        if 'frequency' in data: r.frequency = data['frequency']
        if 'scheduleDay' in data: r.schedule_day = data['scheduleDay']
        if 'remark' in data: r.remark = data['remark']
    db.session.commit()
    return jsonify({'success': True})


# --- BACKUP HANDOVERS ---
@admin_bp.route('/handovers', methods=['GET'])
@jwt_required()
def list_handovers():
    """List handovers. Managers see all; teammates see only ones involving them."""
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    q = BackupActivation.query.order_by(BackupActivation.start_date.desc())
    if not role_at_least(user.role, 'Manager'):
        from sqlalchemy import or_
        q = q.filter(or_(BackupActivation.primary_email == user.email,
                         BackupActivation.backup_email == user.email))
    items = q.all()
    return jsonify({'success': True, 'data': [h.to_dict() for h in items]})


@admin_bp.route('/handovers', methods=['POST'])
@jwt_required()
def add_handover():
    user, err = _require_manager()
    if err: return err
    data = request.get_json() or {}
    primary = (data.get('primaryEmail') or '').strip().lower()
    backup = (data.get('backupEmail') or '').strip().lower()
    if not primary:
        return jsonify({'success': False, 'message': 'primaryEmail required'}), 400
    
    import json
    scope_type = data.get('scopeType', 'all')
    items = data.get('items', [])
    items_json = json.dumps(items) if items else '[]'

    if scope_type == 'distributed' and items:
        if not backup or backup == primary:
            for it in items:
                if it.get('backupEmail'):
                    backup = it['backupEmail'].strip().lower()
                    break

    if not backup:
        return jsonify({'success': False, 'message': 'Backup assignee required'}), 400

    try:
        from datetime import date as _date
        sd = _date.fromisoformat(data['startDate'])
        ed = _date.fromisoformat(data['endDate'])
    except Exception:
        return jsonify({'success': False, 'message': 'startDate / endDate (YYYY-MM-DD) required'}), 400
    if ed < sd:
        return jsonify({'success': False, 'message': 'endDate must be >= startDate'}), 400

    h = BackupActivation(
        primary_email=primary,
        backup_email=backup,
        start_date=sd,
        end_date=ed,
        reason=data.get('reason', 'On leave'),
        notes=data.get('notes', ''),
        scope_type=scope_type,
        items_json=items_json,
        granted_by=user.email,
        active=True,
    )
    db.session.add(h)
    db.session.commit()
    log_audit(user.email, 'HANDOVER_GRANT', 'handover', h.id, after=h.to_dict())
    return jsonify({'success': True, 'data': h.to_dict()})


@admin_bp.route('/handovers/<int:h_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def modify_handover(h_id):
    user, err = _require_manager()
    if err: return err
    h = BackupActivation.query.get(h_id)
    if not h: return jsonify({'success': False, 'message': 'Not found'}), 404
    if request.method == 'DELETE':
        before = h.to_dict()
        db.session.delete(h)
        db.session.commit()
        log_audit(user.email, 'HANDOVER_DELETE', 'handover', h_id, before=before)
        return jsonify({'success': True})
    data = request.get_json() or {}
    before = h.to_dict()
    from datetime import date as _date
    if 'startDate' in data:
        try: h.start_date = _date.fromisoformat(data['startDate'])
        except Exception: pass
    if 'endDate' in data:
        try: h.end_date = _date.fromisoformat(data['endDate'])
        except Exception: pass
    if 'reason' in data: h.reason = data['reason']
    if 'notes' in data: h.notes = data['notes']
    if 'active' in data: h.active = bool(data['active'])
    if 'scopeType' in data: h.scope_type = data['scopeType']
    if 'items' in data:
        import json
        h.items_json = json.dumps(data['items'])
    db.session.commit()
    log_audit(user.email, 'HANDOVER_UPDATE', 'handover', h_id, before=before, after=h.to_dict())
    return jsonify({'success': True, 'data': h.to_dict()})


@admin_bp.route('/user-duties/<email>', methods=['GET'])
@jwt_required()
def get_user_duties(email):
    """Fetches commodities, roster duties, and MIS reports owned by the given user email for work distribution."""
    user, err = _require_manager()
    if err: return err

    target_user = User.query.filter_by(email=email.strip().lower()).first()
    if not target_user:
        return jsonify({'success': False, 'message': 'User not found'}), 404

    target_email = target_user.email.lower()
    target_name = (target_user.name or '').lower()

    # 1. Commodities (Daily only)
    commodities = set()
    configs = CommodityConfig.query.all()
    for cfg in configs:
        freq = (cfg.type or '').lower().strip()
        if freq not in ('daily', 'mon-fri', ''):
            continue
        assignees = [
            (cfg.mode or '').lower().strip(),
            (cfg.primary_assignee or '').lower().strip(),
            (cfg.backup_1 or '').lower().strip(),
            (cfg.backup_2 or '').lower().strip(),
        ]
        if any(a and (a == target_email or a == target_name or (len(a) > 2 and a in target_email) or (len(target_name) > 2 and target_name == a)) for a in assignees):
            if cfg.commodity and cfg.commodity.strip():
                commodities.add(cfg.commodity.strip())

    if not commodities and target_user.commodities:
        for c in target_user.commodities.split(','):
            if c.strip(): commodities.add(c.strip())

    # 2. Roster Duties (Daily only)
    rosters = RosterConfig.query.all()
    user_rosters = []
    for r in rosters:
        freq = (r.frequency or '').lower().strip()
        if freq not in ('daily', 'mon-fri', ''):
            continue
        if target_name and target_name in (r.employee or '').lower():
            user_rosters.append(r.role or 'Roster Duty')

    # 3. MIS Reports (Daily only)
    reports = Report.query.all()
    user_reports = []
    for rep in reports:
        freq = (rep.frequency or '').lower().strip()
        if freq not in ('daily', 'mon-fri', ''):
            continue
        assignee = (rep.primary_assignee or '').lower()
        if target_email in assignee or (target_name and target_name in assignee):
            user_reports.append(rep.name)

    # 4. Task Templates (Daily only)
    tasks = TaskTemplate.query.all()
    user_tasks = []
    for t in tasks:
        freq = (t.recurrence or '').lower().strip()
        if freq not in ('daily', 'mon-fri', ''):
            continue
        assignee = (t.assignee or '').lower()
        if target_email in assignee or (target_name and target_name in assignee):
            user_tasks.append(t.name)

    return jsonify({
        'success': True,
        'email': target_user.email,
        'name': target_user.name,
        'commodities': sorted(list(commodities)),
        'rosterDuties': sorted(list(set(user_rosters))),
        'reports': sorted(list(set(user_reports))),
        'tasks': sorted(list(set(user_tasks)))
    })


# --- REPORT GROUPS (Report Merging window) ---
@admin_bp.route('/report-groups', methods=['GET'])
@jwt_required()
def get_report_groups():
    user, err = _require_manager()
    if err: return err
    groups = ReportGroup.query.order_by(ReportGroup.parent_category, ReportGroup.group_name).all()
    by_category = {}
    for g in groups:
        by_category.setdefault(g.parent_category, []).append(g.to_dict())
    return jsonify({'success': True, 'data': [g.to_dict() for g in groups], 'byCategory': by_category})


@admin_bp.route('/report-groups', methods=['POST'])
@jwt_required()
def add_report_group():
    user, err = _require_manager()
    if err: return err
    data = request.get_json() or {}
    parent = (data.get('parentCategory') or '').strip()
    name = (data.get('groupName') or '').strip()
    if not parent or not name:
        return jsonify({'success': False, 'message': 'parentCategory and groupName required'}), 400
    members = data.get('members') or []
    if isinstance(members, list):
        members_str = ','.join(m.strip() for m in members if m and m.strip())
    else:
        members_str = str(members).strip()
    g = ReportGroup(
        parent_category=parent,
        group_name=name,
        members=members_str,
        frequency=data.get('frequency', 'Daily'),
        primary_assignee=data.get('primaryAssignee', ''),
        backup_1=data.get('backup1', ''),
        backup_2=data.get('backup2', ''),
        schedule_day=data.get('scheduleDay', ''),
        visibility=data.get('visibility', 'managers'),
        remark=data.get('remark', ''),
        created_by=user.email,
    )
    db.session.add(g)
    db.session.commit()
    log_audit(user.email, 'REPORT_GROUP_ADD', 'report_group', g.id, after=g.to_dict())
    return jsonify({'success': True, 'data': g.to_dict()})


@admin_bp.route('/report-groups/<int:g_id>', methods=['PUT', 'DELETE'])
@jwt_required()
def modify_report_group(g_id):
    user, err = _require_manager()
    if err: return err
    g = ReportGroup.query.get(g_id)
    if not g: return jsonify({'success': False, 'message': 'Not found'}), 404
    if request.method == 'DELETE':
        before = g.to_dict()
        db.session.delete(g)
        db.session.commit()
        log_audit(user.email, 'REPORT_GROUP_REMOVE', 'report_group', g_id, before=before)
        return jsonify({'success': True})
    data = request.get_json() or {}
    before = g.to_dict()
    if 'parentCategory' in data: g.parent_category = data['parentCategory']
    if 'groupName' in data: g.group_name = data['groupName']
    if 'members' in data:
        m = data['members']
        g.members = ','.join(x.strip() for x in m if x and x.strip()) if isinstance(m, list) else str(m)
    if 'frequency' in data: g.frequency = data['frequency']
    if 'primaryAssignee' in data: g.primary_assignee = data['primaryAssignee']
    if 'backup1' in data: g.backup_1 = data['backup1']
    if 'backup2' in data: g.backup_2 = data['backup2']
    if 'scheduleDay' in data: g.schedule_day = data['scheduleDay']
    if 'visibility' in data: g.visibility = data['visibility']
    if 'remark' in data: g.remark = data['remark']
    db.session.commit()
    log_audit(user.email, 'REPORT_GROUP_UPDATE', 'report_group', g_id, before=before, after=g.to_dict())
    return jsonify({'success': True, 'data': g.to_dict()})


# --- CSV SAMPLES (download template) ---
@admin_bp.route('/csv-sample/<kind>', methods=['GET'])
@jwt_required()
def csv_sample(kind):
    user, err = _require_manager()
    if err: return err
    kind = (kind or '').lower()
    # scheduleDay semantics (per frequency):
    #   weekly       -> day name: Monday..Sunday
    #   monthly      -> day of month: 1..31 or 'last'
    #   quarterly    -> day of month (fires Jan/Apr/Jul/Oct on that day)
    #   half-yearly  -> day of month (fires Jan/Jul on that day)
    #   yearly       -> MM-DD (e.g. 04-15)
    if kind == 'tasks':
        return _csv_response('sample_tasks.csv',
            ['name', 'assignee', 'backup1', 'backup2', 'recurrence', 'scheduleDay', 'instructions'],
            [
                ['Daily Price Check', 'analyst@agalabs.com', 'lead@agalabs.com', '', 'daily', '', 'Check NCDEX before 11am'],
                ['Weekly Market Summary', 'lead@agalabs.com', 'analyst@agalabs.com', 'mgr@agalabs.com', 'weekly', 'Monday', ''],
                ['Monthly Compliance Report', '', '', '', 'monthly', '1', ''],
            ])
    if kind == 'reports':
        return _csv_response('sample_reports.csv',
            ['name', 'frequency', 'primaryAssignee', 'backup1', 'backup2', 'deadline', 'scheduleDay', 'instructions'],
            [
                ['Pulses Daily', 'Daily', 'analyst@agalabs.com', 'lead@agalabs.com', '', '18:00', '', 'Imported Market Price — take after 3:00'],
                ['Coarse Grain Weekly', 'Weekly', 'lead@agalabs.com', 'analyst@agalabs.com', '', '17:00', 'Monday', ''],
                ['Oilseed Monthly', 'Monthly', '', '', '', '12:00', '1', ''],
            ])
    if kind == 'commodities':
        return _csv_response('sample_commodities.csv',
            ['commodity', 'type', 'Factor or Task', 'mode', 'source', 'primaryAssignee', 'backup1', 'backup2', 'scheduleDay', 'instructions'],
            [
                ['Tur', 'Daily', 'Arrival', 'nishant@agalabs.com', 'Agmarknet', 'nishant@agalabs.com', 'pankaj@agalabs.com', '', '', 'Use Agmarknet daily snapshot'],
                ['Maize', 'Weekly', 'Price', 'gopi@agalabs.com', 'Mandi', 'gopi@agalabs.com', '', '', 'Monday', ''],
                ['Bajra', 'Monthly', 'Price', '', 'Trade', '', '', '', '1', ''],
            ])
    if kind == 'report-groups':
        return _csv_response('sample_report_groups.csv',
            ['parentCategory', 'groupName', 'members', 'frequency', 'primaryAssignee', 'backup1', 'backup2', 'scheduleDay', 'visibility', 'remark'],
            [
                ['Pulses', 'Pulses Daily', 'Tur|Urad|Bengal gram|Moong|Masoor|Pea', 'Daily', 'analyst@agalabs.com', 'lead@agalabs.com', '', '', 'managers', 'Auto-grouped'],
                ['Coarse Grain', 'Coarse Grain Weekly', 'Maize|Bajra|Barley', 'Weekly', 'lead@agalabs.com', 'analyst@agalabs.com', 'mgr@agalabs.com', 'Monday', 'managers', ''],
            ])
    if kind == 'roster':
        return _csv_response('sample_roster.csv',
            ['role', 'employee', 'frequency', 'scheduleDay', 'remark'],
            [
                ['Daily Reporter', 'analyst@agalabs.com', 'Daily', '', ''],
                ['Weekly Reviewer', 'lead@agalabs.com', 'Weekly', 'Monday', 'Mondays only'],
            ])
    return jsonify({'success': False, 'message': 'Unknown CSV kind'}), 400


# --- CSV BULK IMPORT ---
@admin_bp.route('/csv-import/<kind>', methods=['POST'])
@jwt_required()
def csv_import(kind):
    user, err = _require_manager()
    if err: return err
    f = request.files.get('file')
    if not f:
        return jsonify({'success': False, 'message': 'CSV file required (field name "file")'}), 400
    try:
        rows = _parse_csv(f)
    except Exception as e:
        return jsonify({'success': False, 'message': f'CSV parse error: {e}'}), 400
    if not rows:
        return jsonify({'success': False, 'message': 'CSV has no data rows'}), 400

    kind = (kind or '').lower()
    inserted, skipped, errors = 0, 0, []

    try:
        if kind == 'tasks':
            for i, r in enumerate(rows, start=2):
                name = (r.get('name') or '').strip()
                if not name:
                    skipped += 1; errors.append(f'row {i}: missing name'); continue
                rec = (r.get('recurrence') or 'daily').lower()
                if rec not in ('daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly', 'mon-fri', 'fortnightly'):
                    rec = 'daily'
                db.session.add(TaskTemplate(
                    name=name,
                    assignee=r.get('assignee', ''),
                    backup_1=r.get('backup1', ''),
                    backup_2=r.get('backup2', ''),
                    recurrence=rec,
                    schedule_day=r.get('scheduleDay', ''),
                    instructions=r.get('instructions', ''),
                ))
                inserted += 1

        elif kind == 'reports':
            for i, r in enumerate(rows, start=2):
                name = (r.get('name') or '').strip()
                if not name:
                    skipped += 1; errors.append(f'row {i}: missing name'); continue
                db.session.add(Report(
                    name=name,
                    frequency=r.get('frequency', 'Daily') or 'Daily',
                    primary_assignee=r.get('primaryAssignee', ''),
                    backup_1=r.get('backup1', ''),
                    backup_2=r.get('backup2', ''),
                    deadline=r.get('deadline', ''),
                    schedule_day=r.get('scheduleDay', ''),
                    instructions=r.get('instructions', ''),
                ))
                inserted += 1

        elif kind == 'commodities':
            for i, r in enumerate(rows, start=2):
                commodity = (r.get('commodity') or '').strip()
                ctype = (r.get('type') or '').strip()
                factor = (r.get('factor') or '').strip()
                if not commodity or not ctype or not factor:
                    skipped += 1; errors.append(f'row {i}: commodity/type/factor required'); continue
                db.session.add(CommodityConfig(
                    commodity=commodity, type=ctype, factor=factor,
                    mode=r.get('mode', ''), source=r.get('source', ''),
                    primary_assignee=r.get('primaryAssignee', ''),
                    backup_1=r.get('backup1', ''),
                    backup_2=r.get('backup2', ''),
                    schedule_day=r.get('scheduleDay', ''),
                    instructions=r.get('instructions', ''),
                ))
                inserted += 1

        elif kind == 'report-groups':
            for i, r in enumerate(rows, start=2):
                parent = (r.get('parentCategory') or '').strip()
                name = (r.get('groupName') or '').strip()
                if not parent or not name:
                    skipped += 1; errors.append(f'row {i}: parentCategory/groupName required'); continue
                # members may be pipe- or comma-delimited inside a CSV cell
                raw_members = r.get('members', '') or ''
                if '|' in raw_members:
                    members_str = ','.join(m.strip() for m in raw_members.split('|') if m.strip())
                else:
                    members_str = ','.join(m.strip() for m in raw_members.split(',') if m.strip())
                db.session.add(ReportGroup(
                    parent_category=parent,
                    group_name=name,
                    members=members_str,
                    frequency=r.get('frequency', 'Daily') or 'Daily',
                    primary_assignee=r.get('primaryAssignee', ''),
                    backup_1=r.get('backup1', ''),
                    backup_2=r.get('backup2', ''),
                    schedule_day=r.get('scheduleDay', ''),
                    visibility=(r.get('visibility', 'managers') or 'managers').lower(),
                    remark=r.get('remark', ''),
                    created_by=user.email,
                ))
                inserted += 1

        elif kind == 'roster':
            for i, r in enumerate(rows, start=2):
                role = (r.get('role') or '').strip()
                emp = (r.get('employee') or '').strip()
                if not role or not emp:
                    skipped += 1; errors.append(f'row {i}: role/employee required'); continue
                db.session.add(RosterConfig(
                    role=role, employee=emp,
                    frequency=r.get('frequency', 'Daily') or 'Daily',
                    schedule_day=r.get('scheduleDay', ''),
                    remark=r.get('remark', ''),
                ))
                inserted += 1
        else:
            return jsonify({'success': False, 'message': f'Unknown import kind: {kind}'}), 400

        db.session.commit()
        log_audit(user.email, 'CSV_IMPORT', kind, '',
                  after={'inserted': inserted, 'skipped': skipped})
        return jsonify({
            'success': True,
            'inserted': inserted,
            'skipped': skipped,
            'errors': errors[:50],
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Import failed: {e}'}), 500


@admin_bp.route('/email-logs', methods=['GET'])
@jwt_required()
def get_email_logs():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403

    from app.models import EmailLog
    logs = EmailLog.query.order_by(EmailLog.sent_at.desc()).limit(100).all()
    return jsonify({
        'success': True,
        'logs': [l.to_dict() for l in logs]
    })


@admin_bp.route('/email-test', methods=['POST'])
@jwt_required()
def send_test_email():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403

    data = request.get_json() or {}
    to_email = data.get('to_email', '').strip()
    if not to_email:
        return jsonify({'success': False, 'message': 'Recipient email is required.'}), 400

    from app.services.email_service import send_email, build_todays_live_updates_html
    subject = "Advanced MIS — Today's Live Updates & Connection Test"
    html_body = build_todays_live_updates_html(recipient_email=to_email, is_test=True)
    
    success = send_email(to_email, subject, html_body, force=True)
    if success:
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': 'SMTP check failed. Check host, port, username, password and From email.'}), 500


@admin_bp.route('/email-trigger-digest', methods=['POST'])
@jwt_required()
def trigger_email_digest():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403

    data = request.get_json() or {}
    stage = data.get('stage', 'all')
    target_email = data.get('target_email', '').strip() or None

    from datetime import date
    import threading
    from app.services.scheduler import (
        _send_teammate_reminders, _send_teammate_finals,
        _send_manager_digests, _send_leader_digests
    )
    from flask import current_app
    
    app_obj = current_app._get_current_object()
    
    def _run_digest():
        with app_obj.app_context():
            try:
                today = date.today()
                if stage == 'teammate-reminder':
                    _send_teammate_reminders(app_obj, today, force=True, target_email=target_email)
                elif stage == 'teammate-final':
                    _send_teammate_finals(app_obj, today, force=True, target_email=target_email)
                elif stage == 'manager-digest':
                    _send_manager_digests(app_obj, today, force=True, target_email=target_email)
                elif stage == 'leader-digest':
                    _send_leader_digests(app_obj, today, force=True, target_email=target_email)
                else:
                    _send_teammate_reminders(app_obj, today, force=True, target_email=target_email)
                    _send_teammate_finals(app_obj, today, force=True, target_email=target_email)
                    _send_manager_digests(app_obj, today, force=True, target_email=target_email)
                    _send_leader_digests(app_obj, today, force=True, target_email=target_email)
            except Exception as e:
                app_obj.logger.exception(f"[email_trigger] Background trigger failed: {e}")

    thread = threading.Thread(target=_run_digest)
    thread.daemon = True
    thread.start()
    return jsonify({'success': True, 'message': 'Digest dispatch triggered in background.'})


@admin_bp.route('/email-preview', methods=['POST'])
@jwt_required()
def get_email_preview():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403

    data = request.get_json() or {}
    stage = data.get('stage', 'stage-1')
    target_email = (data.get('user_email') or '').strip().lower()

    from datetime import datetime, date
    try:
        from zoneinfo import ZoneInfo
        IST = ZoneInfo('Asia/Kolkata')
    except ImportError:
        import pytz
        IST = pytz.timezone('Asia/Kolkata')

    from sqlalchemy import or_, and_
    from app.models import User
    from app.services.email_service import (
        get_setting, build_reminder_email_html, build_daily_digest_html,
        build_manager_digest_html, build_leader_digest_html
    )
    from app.services.scheduler import _get_user_daily_summary

    today = datetime.now(IST).date()
    date_str = today.strftime('%B %d, %Y')
    from_addr = get_setting('smtpFrom', get_setting('smtpUser', 'mail.agalabs@gmail.com'))

    # Determine matched target users strictly based on "Will be sent to:" rules for stage
    matched_users = []
    
    if stage in ['stage-1', 'stage-2']:
        roles_key = 'emailTeammateTargetRoles'
        emails_key = 'emailTeammateTargetEmails'
        excluded_key = 'emailTeammateReminderExcludedEmails' if stage == 'stage-1' else 'emailTeammateFinalExcludedEmails'
        
        raw_roles = data.get('target_roles') if 'target_roles' in data else get_setting(roles_key, 'Teammate')
        raw_emails = data.get('target_emails') if 'target_emails' in data else get_setting(emails_key, '')
        raw_excluded = data.get('excluded_emails') if 'excluded_emails' in data else get_setting(excluded_key, '')

        target_roles = [r.strip() for r in (raw_roles or '').split(',') if r.strip() and r.strip() == 'Teammate']
        target_emails = [e.strip().lower() for e in (raw_emails or '').split(',') if e.strip()]
        excluded_emails = [e.strip().lower() for e in (raw_excluded or '').split(',') if e.strip()]
        
        conds = []
        if target_roles: conds.append(and_(User.active == True, User.role.in_(target_roles)))
        if target_emails: conds.append(User.email.in_(target_emails))
        if conds:
            users_db = User.query.filter(or_(*conds)).all()
        else:
            users_db = User.query.filter(User.active == True, User.role == 'Teammate').all()
            
        matched_users = [u for u in users_db if u.email.lower() not in excluded_emails]

    elif stage == 'stage-3':
        raw_roles = data.get('target_roles') if 'target_roles' in data else get_setting('emailManagerTargetRoles', 'Manager,SuperAdmin')
        raw_emails = data.get('target_emails') if 'target_emails' in data else get_setting('emailManagerTargetEmails', '')
        raw_excluded = data.get('excluded_emails') if 'excluded_emails' in data else get_setting('emailManagerDigestExcludedEmails', '')

        target_roles = [r.strip() for r in (raw_roles or '').split(',') if r.strip()]
        target_emails = [e.strip().lower() for e in (raw_emails or '').split(',') if e.strip()]
        excluded_emails = [e.strip().lower() for e in (raw_excluded or '').split(',') if e.strip()]
        
        conds = []
        if target_roles: conds.append(and_(User.active == True, User.role.in_(target_roles)))
        if target_emails: conds.append(User.email.in_(target_emails))
        if conds:
            users_db = User.query.filter(or_(*conds)).all()
        else:
            users_db = User.query.filter(User.active == True, User.role.in_(['Manager', 'SuperAdmin'])).all()
        
        mgrs = list(set(u for u in users_db if u.email.lower() not in excluded_emails))
        global_mgr = get_setting('managerEmail').strip().lower()
        if global_mgr and global_mgr not in excluded_emails:
            mgr_u = User.query.filter(User.email.ilike(global_mgr)).first()
            if mgr_u and mgr_u not in mgrs: mgrs.append(mgr_u)
        matched_users = mgrs

    elif stage == 'stage-4':
        raw_roles = data.get('target_roles') if 'target_roles' in data else get_setting('emailLeaderTargetRoles', 'Leader')
        raw_emails = data.get('target_emails') if 'target_emails' in data else get_setting('emailLeaderTargetEmails', '')
        raw_excluded = data.get('excluded_emails') if 'excluded_emails' in data else get_setting('emailLeaderDigestExcludedEmails', '')

        target_roles = [r.strip() for r in (raw_roles or '').split(',') if r.strip()]
        target_emails = [e.strip().lower() for e in (raw_emails or '').split(',') if e.strip()]
        excluded_emails = [e.strip().lower() for e in (raw_excluded or '').split(',') if e.strip()]
        
        conds = []
        if target_roles: conds.append(and_(User.active == True, User.role.in_(target_roles)))
        if target_emails: conds.append(User.email.in_(target_emails))
        if conds:
            users_db = User.query.filter(or_(*conds)).all()
        else:
            users_db = User.query.filter(User.active == True, User.role == 'Leader').all()
            
        matched_users = [u for u in users_db if u.email.lower() not in excluded_emails]

    recipients_info = [{'name': u.name, 'email': u.email, 'role': u.role} for u in matched_users]

    if not matched_users:
        return jsonify({
            'success': True,
            'subject': 'No Recipients Matched',
            'from_addr': from_addr,
            'to_addr': 'None',
            'recipients': [],
            'html_body': '<div style="padding:40px; text-align:center; font-family:sans-serif; color:#94a3b8;"><h3 style="margin-bottom:8px; color:#ef4444;">⚠️ No Target Recipients Matched</h3><p style="font-size:13px;">No active users are currently added to "Will be sent to:" for this stage.</p></div>'
        })

    active_user = None
    if target_email:
        active_user = next((u for u in matched_users if u.email.lower() == target_email), None)
    if not active_user:
        active_user = matched_users[0]

    if stage == 'stage-1':
        summary = _get_user_daily_summary(active_user, today)
        html_body = build_reminder_email_html(active_user, date_str, summary)
        subj_tmpl = get_setting('emailTeammateReminderSubject', "⏰ Daily MIS Task Reminder — {user_name} ({pending_count} Pending)")
        subject = subj_tmpl.format(user_name=active_user.name, pending_count=len(summary['pending']), date_str=date_str)
    
    elif stage == 'stage-2':
        summary = _get_user_daily_summary(active_user, today)
        html_body = build_daily_digest_html(active_user, date_str, summary)
        subj_tmpl = get_setting('emailTeammateSubject', "Daily MIS Task Summary: Final Update — {user_name} ({score}% Done)")
        subject = subj_tmpl.format(user_name=active_user.name, score=summary['score'], date_str=date_str)

    elif stage == 'stage-3':
        teammates = User.query.filter(User.active == True, User.role == 'Teammate').all()
        summaries = []
        for u in teammates:
            summary = _get_user_daily_summary(u, today)
            if summary['is_holiday'] and summary['total'] == 0: continue
            summaries.append({
                'name': u.name, 'email': u.email, 'department': u.department,
                'done': summary['done'], 'pending': summary['pending'],
                'skip': summary['skip'], 'total': summary['total'], 'score': summary['score']
            })
        html_body = build_manager_digest_html(date_str, summaries)
        subj_tmpl = get_setting('emailManagerSubject', "MIS Daily Manager Digest — {date_str}")
        subject = subj_tmpl.format(date_str=date_str)

    elif stage == 'stage-4':
        teammates = User.query.filter(User.active == True, User.role == 'Teammate').all()
        teammates_tasks = []
        for u in teammates:
            summary = _get_user_daily_summary(u, today)
            if summary['is_holiday'] and summary['total'] == 0: continue
            teammates_tasks.append({
                'name': u.name, 'email': u.email, 'department': u.department,
                'score': summary['score'], 'done': summary['done'],
                'pending': summary['pending'], 'skip': summary['skip']
            })
        html_body = build_leader_digest_html(date_str, teammates_tasks)
        subj_tmpl = get_setting('emailLeaderSubject', "MIS Research Team Daily Summary — {date_str}")
        subject = subj_tmpl.format(date_str=date_str)

    return jsonify({
        'success': True,
        'subject': subject,
        'from_addr': from_addr,
        'to_addr': active_user.email,
        'active_user_name': active_user.name,
        'recipients': recipients_info,
        'html_body': html_body
    })
