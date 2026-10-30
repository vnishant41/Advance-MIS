"""
Admin — User management, settings, audit trail, report merging, bulk CSV import.
"""
import os
import re
import glob
import csv
import io
import json
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required
from app import db
from app.models import (
    User, AppSetting, ModuleToggle, AuditLog, Report, CommodityConfig,
    TaskTemplate, RosterConfig, ReportGroup, BackupActivation, DBTaskCatalog,
    UserReportMapping, UserCommodityMapping,
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

def _parse_commodities_payload(commodities_payload, comm_mappings_payload=None):
    """Parses commodities payload (list of dicts, list of strings, or comma string)
    and returns (user_commodities_str, commodity_records) where commodity_records
    is a list of (commodity_name, mapping_config_str)."""
    commodity_records = []
    c_names = []

    if isinstance(commodities_payload, list):
        for item in commodities_payload:
            if isinstance(item, dict):
                c_name = (item.get('commodity') or item.get('name') or '').strip()
                c_cfg = item.get('mapping_config') or item.get('mappingConfig') or item.get('config')
                if isinstance(c_cfg, dict):
                    c_cfg = json.dumps(c_cfg)
                elif c_cfg is not None:
                    c_cfg = str(c_cfg)
                if c_name:
                    c_names.append(c_name)
                    commodity_records.append((c_name, c_cfg))
            elif isinstance(item, str) and item.strip():
                c_clean = item.strip()
                c_names.append(c_clean)
                commodity_records.append((c_clean, None))
    elif isinstance(commodities_payload, str):
        if commodities_payload.strip():
            for c in commodities_payload.split(','):
                c_clean = c.strip()
                if c_clean:
                    c_names.append(c_clean)
                    commodity_records.append((c_clean, None))

    if isinstance(comm_mappings_payload, list):
        for item in comm_mappings_payload:
            if isinstance(item, dict):
                c_name = (item.get('commodity') or item.get('name') or '').strip()
                c_cfg = item.get('mapping_config') or item.get('mappingConfig') or item.get('config')
                if isinstance(c_cfg, dict):
                    c_cfg = json.dumps(c_cfg)
                elif c_cfg is not None:
                    c_cfg = str(c_cfg)
                if c_name and not any(r[0].lower() == c_name.lower() for r in commodity_records):
                    commodity_records.append((c_name, c_cfg))
                    if c_name not in c_names:
                        c_names.append(c_name)

    user_commodities_str = ', '.join(c_names)
    return user_commodities_str, commodity_records


def _parse_reports_payload(reports_payload, existing_user_mappings=None):
    """Parses reports payload (list of dicts, IDs, or names) into report records dicts."""
    if not isinstance(reports_payload, list):
        return []

    existing_by_id = {}
    existing_by_name = {}
    if existing_user_mappings:
        for m in existing_user_mappings:
            if m.report_id:
                existing_by_id[m.report_id] = m
            if m.report_name:
                existing_by_name[m.report_name.strip().lower()] = m

    report_records = []
    for rep in reports_payload:
        if isinstance(rep, dict):
            rep_id = rep.get('report_id') or rep.get('reportId') or rep.get('id')
            rep_name = (rep.get('report_name') or rep.get('reportName') or rep.get('name') or '').strip()
            timing_schedule = rep.get('timing_schedule') or rep.get('timingSchedule') or rep.get('timing') or ''
            deadline = rep.get('deadline') or ''
            frequency = rep.get('frequency') or ''

            report_obj = None
            if rep_id:
                try:
                    report_obj = db.session.get(Report, int(rep_id))
                except (ValueError, TypeError):
                    report_obj = None
            if not report_obj and rep_name:
                report_obj = Report.query.filter(Report.name.ilike(rep_name)).first()

            if report_obj:
                final_rep_id = report_obj.id
                final_rep_name = rep_name or report_obj.name
                default_freq = report_obj.frequency or 'Daily'
                default_dl = report_obj.deadline or ''
            else:
                first_rep = Report.query.first()
                final_rep_id = first_rep.id if first_rep else 1
                final_rep_name = rep_name or (first_rep.name if first_rep else 'General Report')
                default_freq = 'Daily'
                default_dl = ''

            # If existing mapping exists, carry over missing timing/deadline/frequency
            prev_m = existing_by_id.get(final_rep_id) or (existing_by_name.get(final_rep_name.lower()) if final_rep_name else None)
            if prev_m:
                if not timing_schedule and prev_m.timing_schedule:
                    timing_schedule = prev_m.timing_schedule
                if not deadline:
                    deadline = prev_m.deadline or default_dl
                if not frequency:
                    frequency = prev_m.frequency or default_freq
            else:
                if not deadline:
                    deadline = default_dl
                if not frequency:
                    frequency = default_freq

            report_records.append({
                'report_id': final_rep_id,
                'report_name': final_rep_name,
                'timing_schedule': timing_schedule,
                'deadline': deadline,
                'frequency': frequency
            })
        elif isinstance(rep, (int, str)):
            robj = None
            try:
                rid = int(rep)
                robj = db.session.get(Report, rid)
            except ValueError:
                robj = Report.query.filter(Report.name.ilike(str(rep).strip())).first()
            if robj:
                report_records.append({
                    'report_id': robj.id,
                    'report_name': robj.name,
                    'timing_schedule': '',
                    'deadline': robj.deadline or '',
                    'frequency': robj.frequency or 'Daily'
                })
    return report_records


@admin_bp.route('/users', methods=['POST'])
@jwt_required()
def add_user():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    if not email: return jsonify({'success': False, 'message': 'Email required'}), 400
    name = (data.get('name') or '').strip()
    if not name: return jsonify({'success': False, 'message': 'Name is required'}), 400
    if User.query.filter_by(email=email).first(): return jsonify({'success': False, 'message': 'User already exists'}), 400

    backup_1 = (data.get('backup_1') or data.get('backup1') or '').strip()
    backup_2 = (data.get('backup_2') or data.get('backup2') or '').strip()
    backup_of = (data.get('backup_of') or data.get('backupOf') or '').strip()

    user_commodities_str, commodity_records = _parse_commodities_payload(
        data.get('commodities'),
        data.get('commodity_mappings')
    )

    new_user = User(
        email=email,
        name=(data.get('name') or '').strip(),
        role=data.get('role', 'Teammate'),
        department=data.get('department', user.department or 'Research'),
        active=True,
        password_hash=data.get('password', 'changeme'),
        commodities=user_commodities_str,
        backup_of=backup_of,
        backup_1=backup_1,
        backup_2=backup_2
    )
    db.session.add(new_user)
    db.session.flush()

    # Insert UserReportMapping records
    reports_payload = data.get('reports') if 'reports' in data else data.get('report_mappings')
    report_records = _parse_reports_payload(reports_payload)
    for r in report_records:
        urm = UserReportMapping(
            user_id=new_user.id,
            report_id=r['report_id'],
            report_name=r['report_name'],
            timing_schedule=r['timing_schedule'],
            deadline=r['deadline'],
            frequency=r['frequency']
        )
        db.session.add(urm)

    # Insert UserCommodityMapping records
    for comm_name, comm_cfg in commodity_records:
        ucm = UserCommodityMapping(
            user_id=new_user.id,
            commodity=comm_name,
            mapping_config=comm_cfg
        )
        db.session.add(ucm)

    db.session.commit()
    log_audit(user.email, 'USER_ADD', 'user', email, after=new_user.to_dict())
    return jsonify({
        'success': True,
        'message': 'User created successfully',
        'user': new_user.to_dict(),
        'data': new_user.to_dict()
    }), 200


@admin_bp.route('/users/<email>', methods=['PUT'])
@jwt_required()
def update_user(email):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    target = User.query.filter_by(email=email.lower()).first()
    if not target: return jsonify({'success': False, 'message': 'User not found'}), 404
    data = request.get_json() or {}
    before = target.to_dict()

    if 'name' in data:
        new_name = (data['name'] or '').strip()
        old_name = target.name
        if new_name and new_name != old_name:
            target.name = new_name
            # Relational cascading sync
            # 1. db_task_catalog.user_name
            for cat in DBTaskCatalog.query.filter_by(user_name=old_name).all():
                cat.user_name = new_name
            for cat in DBTaskCatalog.query.filter(DBTaskCatalog.user_name.like(f"%{old_name}%")).all():
                parts = [p.strip() for p in cat.user_name.split(',')]
                if old_name in parts:
                    cat.user_name = ', '.join([new_name if p == old_name else p for p in parts])
            # Invalidate surveillance cache if present
            try:
                from app.services.surveillance import _SURVEILLANCE_CACHE
                _SURVEILLANCE_CACHE['timestamp'] = None
            except Exception:
                pass

            # 2. reports.primary_assignee, backup_1, backup_2
            for rep in Report.query.filter_by(primary_assignee=old_name).all():
                rep.primary_assignee = new_name
            for rep in Report.query.filter_by(backup_1=old_name).all():
                rep.backup_1 = new_name
            for rep in Report.query.filter_by(backup_2=old_name).all():
                rep.backup_2 = new_name

    if 'role' in data and (user.role == 'SuperAdmin' or role_at_least(user.role, 'SuperAdmin')):
        target.role = data['role']
    if 'department' in data:
        target.department = data['department']
    if 'active' in data:
        target.active = bool(data['active'])
    if 'password' in data and (user.role == 'SuperAdmin' or role_at_least(user.role, 'SuperAdmin')):
        if data['password']:
            target.password_hash = data['password']

    if 'backup_1' in data: target.backup_1 = data['backup_1'] or ''
    elif 'backup1' in data: target.backup_1 = data['backup1'] or ''

    if 'backup_2' in data: target.backup_2 = data['backup_2'] or ''
    elif 'backup2' in data: target.backup_2 = data['backup2'] or ''

    if 'backup_of' in data: target.backup_of = data['backup_of'] or ''
    elif 'backupOf' in data: target.backup_of = data['backupOf'] or ''

    # Handle commodities update
    if 'commodities' in data or 'commodity_mappings' in data:
        user_commodities_str, commodity_records = _parse_commodities_payload(
            data.get('commodities'),
            data.get('commodity_mappings')
        )
        if 'commodities' in data:
            target.commodities = user_commodities_str

        # Carry over existing configs if omitted
        existing_comm_map = {cm.commodity.lower(): cm for cm in target.commodity_mappings}
        final_comm_records = []
        for c_name, c_cfg in commodity_records:
            if c_cfg is None and c_name.lower() in existing_comm_map:
                c_cfg = existing_comm_map[c_name.lower()].mapping_config
            final_comm_records.append((c_name, c_cfg))

        UserCommodityMapping.query.filter_by(user_id=target.id).delete()
        for c_name, c_cfg in final_comm_records:
            ucm = UserCommodityMapping(
                user_id=target.id,
                commodity=c_name,
                mapping_config=c_cfg
            )
            db.session.add(ucm)

    # Handle reports update
    if 'reports' in data or 'report_mappings' in data:
        raw_reports = data.get('reports') if 'reports' in data else data.get('report_mappings')
        report_records = _parse_reports_payload(raw_reports, existing_user_mappings=target.report_mappings)
        UserReportMapping.query.filter_by(user_id=target.id).delete()
        for r in report_records:
            urm = UserReportMapping(
                user_id=target.id,
                report_id=r['report_id'],
                report_name=r['report_name'],
                timing_schedule=r['timing_schedule'],
                deadline=r['deadline'],
                frequency=r['frequency']
            )
            db.session.add(urm)

    db.session.commit()
    log_audit(user.email, 'USER_UPDATE', 'user', email, before=before, after=target.to_dict())
    return jsonify({
        'success': True,
        'message': 'User updated successfully',
        'user': target.to_dict(),
        'data': target.to_dict()
    }), 200

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
        'smtpHost': os.getenv('SMTP_HOST', ''),
        'smtpPort': os.getenv('SMTP_PORT', '587'),
        'smtpUser': os.getenv('SMTP_USER', ''),
        'smtpPassword': os.getenv('SMTP_PASSWORD', ''),
        'smtpFrom': os.getenv('SMTP_FROM', ''),
    }
    for k, v in defaults.items():
        if k not in settings or not settings[k]:
            settings[k] = v
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
    rep = db.session.get(Report, r_id)
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
    c = db.session.get(CommodityConfig, c_id)
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
    t = db.session.get(TaskTemplate, t_id)
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
@jwt_required(optional=True)
def get_roster():
    user = get_current_user()
    if user and not role_at_least(user.role, 'Manager'):
        return jsonify({'success': False}), 403
    return jsonify({'success': True, 'data': [r.to_dict() for r in RosterConfig.query.all()]})

@admin_bp.route('/roster', methods=['POST'])
@jwt_required(optional=True)
def add_roster():
    user = get_current_user()
    if user and not role_at_least(user.role, 'Manager'):
        return jsonify({'success': False}), 403
    data = request.get_json() or {}
    r = RosterConfig(role=data.get('role'), employee=data.get('employee', ''), frequency=data.get('frequency', 'Daily'), schedule_day=data.get('scheduleDay', ''), remark=data.get('remark', ''))
    db.session.add(r)
    db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/roster/<int:r_id>', methods=['PUT', 'DELETE'])
@jwt_required(optional=True)
def modify_roster(r_id):
    user = get_current_user()
    if user and not role_at_least(user.role, 'Manager'):
        return jsonify({'success': False}), 403
    r = db.session.get(RosterConfig, r_id)
    if not r: return jsonify({'success': False}), 404
    if request.method == 'DELETE':
        db.session.delete(r)
    else:
        data = request.get_json() or {}
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
    h = db.session.get(BackupActivation, h_id)
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
    g = db.session.get(ReportGroup, g_id)
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
    from_addr = get_setting('smtpFrom', get_setting('smtpUser', os.getenv('SMTP_FROM', os.getenv('SMTP_USER', ''))))

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


# ─── Crishi Database Table Mapping Management ────────────────────────────────

@admin_bp.route('/table-mappings', methods=['GET'])
@jwt_required(optional=True)
def get_table_mappings():
    """Returns all table mappings from DBTaskCatalog with search, filter, and DB status."""
    query = DBTaskCatalog.query
    user_filter = request.args.get('user', '').strip()
    comm_filter = request.args.get('commodity', '').strip()
    freq_filter = request.args.get('frequency', '').strip()
    search = request.args.get('q', '').strip().lower()

    if user_filter:
        query = query.filter(DBTaskCatalog.user_name.ilike(f"%{user_filter}%"))
    if comm_filter:
        query = query.filter(DBTaskCatalog.commodity.ilike(f"%{comm_filter}%"))
    if freq_filter:
        query = query.filter_by(frequency=freq_filter)

    items = query.order_by(DBTaskCatalog.id.asc()).all()

    if search:
        items = [i for i in items if search in i.raw_table_name.lower() or search in i.final_name.lower() or search in i.commodity.lower() or search in i.user_name.lower()]

    active_users = [u.name for u in User.query.filter_by(active=True).order_by(User.name.asc()).all() if u.name]

    comm_set = set()
    for cc in CommodityConfig.query.all():
        if cc.commodity and cc.commodity.strip():
            comm_set.add(cc.commodity.strip())
    for rep in Report.query.all():
        d = rep.to_dict()
        c = d.get('commodity')
        if c and c.strip():
            comm_set.add(c.strip())
    commodities_list = sorted(list(comm_set))

    mapped_items = [i.to_dict() for i in items]

    return jsonify({
        'success': True,
        'count': len(items),
        'data': mapped_items,
        'mappings': mapped_items,
        'active_users': active_users,
        'users': active_users,
        'commodities': commodities_list
    })


@admin_bp.route('/table-mappings', methods=['POST'])
@jwt_required(optional=True)
def add_table_mapping():
    """Adds a new table mapping to DBTaskCatalog. Supports multiple commodities and multi-user assignments for the same raw table."""
    payload = request.get_json() or {}
    raw_table = (payload.get('raw_table_name') or payload.get('raw_table') or payload.get('rawTable') or '').strip()
    user_name = (payload.get('assigned_user') or payload.get('user') or payload.get('userName') or '').strip()
    commodity = (payload.get('commodity') or '').strip()
    final_name = (payload.get('final_business_name') or payload.get('final_name') or payload.get('finalName') or '').strip()
    frequency = (payload.get('frequency') or 'Daily').strip()
    date_col = (payload.get('date_column') or payload.get('dateColumn') or 'Date').strip()
    cutoff = (payload.get('due_time') or payload.get('cutoff_time') or payload.get('cutoffTime') or '18:30').strip()
    source_name = (payload.get('source_pipeline') or payload.get('sourceName') or payload.get('source_name') or '').strip()
    source_url = (payload.get('sourceUrl') or payload.get('source_url') or '').strip()
    is_active = payload.get('is_active', payload.get('isActive', True))

    if not raw_table or not user_name or not final_name:
        return jsonify({'success': False, 'message': 'rawTable, user, and finalName are required'}), 400

    from app.services.surveillance import COMMODITY_NORM_MAP
    import json

    def clean_comm_str(val):
        if not val:
            return 'General / Other'
        parts = [p.strip() for p in val.split(',') if p.strip()]
        normed = []
        for p in parts:
            norm_val = COMMODITY_NORM_MAP.get(p, p)
            for sub in norm_val.split(','):
                sub_clean = sub.strip()
                if sub_clean:
                    normed.append(sub_clean)
        seen = set()
        res = []
        for x in normed:
            if x.lower() not in seen:
                seen.add(x.lower())
                res.append(x)
        return ', '.join(res) if res else 'General / Other'

    comm_clean = clean_comm_str(commodity)
    comm_cfg = payload.get('commodity_config') or payload.get('commodityConfig')
    comm_cfg_str = json.dumps(comm_cfg) if isinstance(comm_cfg, dict) else (str(comm_cfg).strip() if comm_cfg else None)

    # Check for exact duplicate (same table, same commodity, same assignee)
    exact_duplicate = DBTaskCatalog.query.filter_by(
        raw_table_name=raw_table,
        commodity=comm_clean,
        user_name=user_name
    ).first()
    if exact_duplicate:
        return jsonify({
            'success': False,
            'message': f"A mapping for `{raw_table}` under `{comm_clean}` assigned to `{user_name}` already exists."
        }), 400

    cat = DBTaskCatalog(
        user_name=user_name,
        commodity=comm_clean,
        commodity_config=comm_cfg_str,
        raw_table_name=raw_table,
        final_name=final_name,
        frequency=frequency or 'Daily',
        date_column=date_col or 'Date',
        target_cutoff_time=cutoff or '18:30',
        source_name=source_name or '',
        source_url=source_url or '',
        is_active=bool(is_active)
    )
    db.session.add(cat)
    db.session.commit()

    from app.services.surveillance import _SURVEILLANCE_CACHE
    _SURVEILLANCE_CACHE['timestamp'] = None

    return jsonify({
        'success': True,
        'message': f"Table `{raw_table}` mapped successfully to {user_name} ({comm_clean}).",
        'item': cat.to_dict()
    })


@admin_bp.route('/table-mappings/<int:id>', methods=['PUT'])
@jwt_required(optional=True)
def update_table_mapping(id):
    """Updates an existing table mapping in DBTaskCatalog."""
    cat = db.session.get(DBTaskCatalog, id)
    if not cat:
        return jsonify({'success': False, 'message': 'Mapping not found'}), 404

    payload = request.get_json() or {}
    from app.services.surveillance import COMMODITY_NORM_MAP
    import json

    user = payload.get('assigned_user') or payload.get('user') or payload.get('userName')
    if user: cat.user_name = user.strip()

    comm = payload.get('commodity')
    if comm is not None:
        parts = [p.strip() for p in comm.split(',') if p.strip()]
        normed = []
        for p in parts:
            norm_val = COMMODITY_NORM_MAP.get(p, p)
            for sub in norm_val.split(','):
                sub_clean = sub.strip()
                if sub_clean:
                    normed.append(sub_clean)
        seen = set()
        res = []
        for x in normed:
            if x.lower() not in seen:
                seen.add(x.lower())
                res.append(x)
        cat.commodity = ', '.join(res) if res else 'General / Other'

    cc = payload.get('commodity_config') or payload.get('commodityConfig')
    if cc is not None:
        if isinstance(cc, dict):
            cat.commodity_config = json.dumps(cc)
        else:
            cat.commodity_config = str(cc).strip() if cc else None

    fn = payload.get('final_business_name') or payload.get('final_name') or payload.get('finalName')
    if fn: cat.final_name = fn.strip()

    freq = payload.get('frequency')
    if freq: cat.frequency = freq.strip()

    dc = payload.get('date_column') or payload.get('dateColumn')
    if dc: cat.date_column = dc.strip()

    dt = payload.get('due_time') or payload.get('cutoff_time') or payload.get('cutoffTime')
    if dt: cat.target_cutoff_time = dt.strip()

    sn = payload.get('source_pipeline') or payload.get('source_name') or payload.get('sourceName')
    if sn: cat.source_name = sn.strip()

    su = payload.get('source_url') or payload.get('sourceUrl')
    if su: cat.source_url = su.strip()

    if 'is_active' in payload:
        cat.is_active = bool(payload['is_active'])
    elif 'isActive' in payload:
        cat.is_active = bool(payload['isActive'])

    db.session.commit()
    from app.services.surveillance import _SURVEILLANCE_CACHE
    _SURVEILLANCE_CACHE['timestamp'] = None

    return jsonify({
        'success': True,
        'message': f"Table `{cat.raw_table_name}` mapping updated successfully.",
        'item': cat.to_dict()
    })


@admin_bp.route('/table-mappings/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_table_mapping(id):
    """Deactivates or removes a table mapping."""
    cat = db.session.get(DBTaskCatalog, id)
    if not cat:
        return jsonify({'success': False, 'message': 'Mapping not found'}), 404

    table_name = cat.raw_table_name
    db.session.delete(cat)
    db.session.commit()
    from app.services.surveillance import _SURVEILLANCE_CACHE
    _SURVEILLANCE_CACHE['timestamp'] = None

    return jsonify({
        'success': True,
        'message': f"Table `{table_name}` mapping removed successfully."
    })


@admin_bp.route('/table-schema/<path:table_name>', methods=['GET'])
@jwt_required()
def get_table_schema(table_name):
    """Returns all columns and their types for a given table in agalabsdev_stage."""
    if not re.match(r'^[a-zA-Z0-9_]+$', table_name):
        return jsonify({'success': False, 'error': 'Invalid table name format'}), 400

    from app.services.surveillance import get_live_mysql_connection
    live_conn = get_live_mysql_connection()
    columns = []
    if live_conn:
        try:
            with live_conn.cursor() as cur:
                cur.execute(
                    """SELECT COLUMN_NAME AS Field, COLUMN_TYPE AS Type 
                       FROM information_schema.COLUMNS 
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s""",
                    (table_name,)
                )
                rows = cur.fetchall()
                if not rows:
                    cur.execute(f"DESCRIBE `{table_name}`;")
                    rows = cur.fetchall()
                for row in rows:
                    c_name = row.get('Field') or row.get('COLUMN_NAME') or ''
                    c_type = row.get('Type') or row.get('COLUMN_TYPE') or ''
                    c_type_low = c_type.lower()
                    c_name_low = c_name.lower()
                    is_date = (
                        any(d in c_type_low for d in ['date', 'time', 'year']) or
                        any(k in c_name_low for k in ['date', 'year', 'timestamp', 'metwith', 'weekending', 'pdfdate'])
                    )
                    columns.append({
                        'name': c_name,
                        'type': c_type,
                        'is_date': is_date
                    })
            live_conn.close()
        except Exception:
            if live_conn:
                live_conn.close()

    if not columns:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        csv_path = os.path.join(base_dir, 'latest_two_dates_agalabsdev_stage', 'latest_two_dates_agalabsdev_stage', f"{table_name}.csv")
        if os.path.exists(csv_path):
            try:
                with open(csv_path, 'r', encoding='utf-8', errors='ignore') as fp:
                    reader = csv.reader(fp)
                    header = next(reader)
                    for h in header:
                        clean_h = h.strip().lstrip('\ufeff')
                        is_date = any(k in clean_h.lower() for k in ['date', 'year', 'time', 'timestamp', 'metwith', 'weekending', 'pdfdate'])
                        columns.append({
                            'name': clean_h,
                            'type': 'varchar',
                            'is_date': is_date
                        })
            except Exception:
                pass

    return jsonify({
        'success': True,
        'table': table_name,
        'count': len(columns),
        'columns': columns
    })


@admin_bp.route('/fetch-db-tables', methods=['GET'])
@jwt_required(optional=True)
def fetch_db_tables():
    """
    Inspects MySQL agalabsdev_stage (or snapshot CSV directory) to fetch
    all discovered database tables, auto-detects date columns, identifies unmapped
    tables, and suggests source pipeline and commodity.
    """
    import os, glob, csv
    from app.services.surveillance import get_live_mysql_connection

    mapped_items = {c.raw_table_name: c for c in DBTaskCatalog.query.all()}
    discovered_tables = []

    # 1. Try MySQL live connection
    live_conn = get_live_mysql_connection()
    used_live = False
    if live_conn:
        try:
            with live_conn.cursor() as cur:
                cur.execute("SHOW TABLES;")
                rows = cur.fetchall()
                for r in rows:
                    tbl_name = list(r.values())[0]
                    # inspect columns
                    try:
                        cur.execute(f"DESCRIBE `{tbl_name}`;")
                        cols = [col['Field'] for col in cur.fetchall()]
                    except Exception:
                        cols = []

                    # detect date col
                    date_col = 'Date'
                    for cand in ['Date', 'date', 'CreatedDate', 'created_date', 'EndDate', 'end_date', 'WeekEndingDate', 'MarketYearDate', 'ReportDate', 'AsOnDate', 'timestamp']:
                        for c in cols:
                            if c.lower() == cand.lower():
                                date_col = c
                                break
                        if date_col != 'Date':
                            break
                    discovered_tables.append({'table': tbl_name, 'date_col': date_col, 'columns': cols[:8]})
                used_live = True
                live_conn.close()
        except Exception:
            used_live = False

    # 2. Fallback to snapshot CSV directory if live MySQL didn't fetch
    if not used_live or not discovered_tables:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        csv_pattern = os.path.join(base_dir, 'latest_two_dates_agalabsdev_stage', 'latest_two_dates_agalabsdev_stage', '*.csv')
        csv_files = glob.glob(csv_pattern)
        if not csv_files:
            csv_pattern = os.path.join(base_dir, 'latest_two_dates_agalabsdev_stage', '*.csv')
            csv_files = glob.glob(csv_pattern)

        for f in sorted(csv_files):
            tbl = os.path.basename(f)[:-4]
            cols = []
            date_col = 'Date'
            try:
                with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
                    reader = csv.reader(fp)
                    headers = [h.strip().lstrip('\ufeff') for h in next(reader)]
                    cols = headers
                    for cand in ['Date', 'date', 'CreatedDate', 'created_date', 'EndDate', 'end_date', 'WeekEndingDate', 'MarketYearDate', 'ReportDate', 'AsOnDate', 'timestamp']:
                        for h in headers:
                            if h.lower() == cand.lower():
                                date_col = h
                                break
                        if date_col != 'Date':
                            break
            except Exception:
                pass
            discovered_tables.append({'table': tbl, 'date_col': date_col, 'columns': cols[:8]})

    from collections import defaultdict
    mapped_groups = defaultdict(list)
    for c in DBTaskCatalog.query.all():
        mapped_groups[c.raw_table_name].append(c)

    # Process and build response list
    results = []
    unmapped_count = 0
    mapped_count = 0

    for item in discovered_tables:
        tbl = item['table']
        table_mappings = mapped_groups.get(tbl, [])
        is_mapped = len(table_mappings) > 0
        cat = table_mappings[0] if table_mappings else None
        if is_mapped:
            mapped_count += 1
        else:
            unmapped_count += 1

        # Suggest pipeline
        tl = tbl.lower()
        if tl.startswith('sopa_'): pipe = 'SOPA'
        elif tl.startswith('ipga_'): pipe = 'IPGA'
        elif tl.startswith('pyexcel_'): pipe = 'PyExcel'
        elif tl.startswith('pystage_'): pipe = 'PyStage'
        else: pipe = 'Other'

        # Suggest commodity
        sug_comm = 'General'
        if any(x in tl for x in ['chana', 'pulse', 'bengal']): sug_comm = 'Chana & Pulses'
        elif 'tops' in tl: sug_comm = 'TOP (Tomato, Onion, Potato)'
        elif any(x in tl for x in ['soy', 'sopa', 'oilseed', 'doc']): sug_comm = 'Soybeans & Oilseeds'
        elif any(x in tl for x in ['chilli', 'spice', 'singhal', 'ncdex_spot']): sug_comm = 'Chilli & Spices'
        elif any(x in tl for x in ['rake', 'freight']): sug_comm = 'Logistics & Freight'
        elif any(x in tl for x in ['maize', 'corn', 'ddgs', 'bran_cake', 'cme']): sug_comm = 'Maize & Feed Grains'
        elif any(x in tl for x in ['egg', 'poultry']): sug_comm = 'Poultry & Animal Feed'
        elif any(x in tl for x in ['sugar', 'ethanol', 'crude']): sug_comm = 'Sugar & Bio-Energy'
        elif any(x in tl for x in ['wheat', 'rice', 'grain', 'procurement', 'omss', 'fci']): sug_comm = 'Wheat & Foodgrains'
        elif any(x in tl for x in ['weather', 'rainfall', 'met']): sug_comm = 'Climatology & Weather'
        elif any(x in tl for x in ['ndvi', 'gis', 'gt_points', 'cost_of_cultivation']): sug_comm = 'Remote Sensing & GIS'
        elif any(x in tl for x in ['forecast']): sug_comm = 'Mandi Price Forecasting'
        elif any(x in tl for x in ['cpi', 'inflation', 'exchangerate', 'oecd']): sug_comm = 'Macro & Currencies'

        # Generate friendly business title
        clean_raw = tbl
        for pfx in ['pyexcel_', 'ipga_', 'sopa_', 'pystage_']:
            if clean_raw.lower().startswith(pfx):
                clean_raw = clean_raw[len(pfx):]
                break
        sug_title = clean_raw.replace('_', ' ').strip().title()

        results.append({
            'table_name': tbl,
            'tableName': tbl,
            'is_mapped': is_mapped,
            'isMapped': is_mapped,
            'mapping_count': len(table_mappings),
            'mappings': [c.to_dict() for c in table_mappings],
            'mapped_info': {
                'id': cat.id,
                'assigned_user': cat.user_name,
                'commodity': cat.commodity,
                'final_name': cat.final_name,
                'frequency': cat.frequency
            } if cat else None,
            'mappedId': cat.id if cat else None,
            'mappedUser': ', '.join([c.user_name for c in table_mappings]) if table_mappings else '',
            'mappedCommodity': ', '.join(list(set([c.commodity for c in table_mappings]))) if table_mappings else '',
            'mappedFinalName': cat.final_name if cat else '',
            'mappedFrequency': cat.frequency if cat else '',
            'detected_date_column': item['date_col'],
            'detectedDateCol': item['date_col'],
            'suggested_pipeline': pipe,
            'suggestedPipeline': pipe,
            'suggested_commodity': sug_comm,
            'suggestedCommodity': sug_comm,
            'suggested_title': sug_title,
            'suggestedTitle': sug_title,
            'columnsPreview': item['columns']
        })

    return jsonify({
        'success': True,
        'source': 'MySQL (agalabsdev_stage)' if used_live else 'Snapshot CSV (agalabsdev_stage)',
        'total_db_tables': len(results),
        'totalTables': len(results),
        'already_mapped_count': mapped_count,
        'mappedCount': mapped_count,
        'unmapped_count': unmapped_count,
        'unmappedCount': unmapped_count,
        'tables': results
    })
