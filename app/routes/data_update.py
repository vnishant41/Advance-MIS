"""
Data Update — Commodity/Type/Factor submission with frequency support.
"""
import time, random
from datetime import datetime, date, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models import CommodityConfig, MasterLog, User, BackupActivation
from app.auth import get_current_user, role_at_least, log_audit

du_bp = Blueprint('du', __name__)


def _new_log_id():
    return f"LOG{int(time.time()*1000)}_{random.randint(100, 999)}"


def _get_user_commodities(user):
    """Returns list of commodities user is assigned to across User record, CommodityConfig assignments & active handovers."""
    comms = set()

    # 1. From User.commodities
    if user.commodities:
        for c in user.commodities.split(','):
            c = c.strip()
            if c:
                comms.add(c)

    # 2. From CommodityConfig assignments (mode, primary_assignee, backup_1, backup_2)
    me = (user.email or '').lower().strip()
    name = (user.name or '').lower().strip()
    
    all_configs = CommodityConfig.query.all()
    for cfg in all_configs:
        assignees = [
            (cfg.mode or '').lower().strip(),
            (cfg.primary_assignee or '').lower().strip(),
            (cfg.backup_1 or '').lower().strip(),
            (cfg.backup_2 or '').lower().strip(),
        ]
        if any(a and (a == me or a == name or (len(a) > 2 and a in me) or (len(name) > 2 and name == a)) for a in assignees):
            if cfg.commodity and cfg.commodity.strip():
                comms.add(cfg.commodity.strip())

    # 3. Check backup_of user's commodities
    if user.backup_of:
        backup = User.query.filter_by(email=user.backup_of.lower().strip()).first()
        if backup:
            if backup.commodities:
                for c in backup.commodities.split(','):
                    c = c.strip()
                    if c:
                        comms.add(c)
            b_me = backup.email.lower().strip()
            b_name = (backup.name or '').lower().strip()
            for cfg in all_configs:
                assignees = [
                    (cfg.mode or '').lower().strip(),
                    (cfg.primary_assignee or '').lower().strip(),
                    (cfg.backup_1 or '').lower().strip(),
                    (cfg.backup_2 or '').lower().strip(),
                ]
                if any(a and (a == b_me or a == b_name or (len(a) > 2 and a in b_me) or (len(b_name) > 2 and b_name == a)) for a in assignees):
                    if cfg.commodity and cfg.commodity.strip():
                        comms.add(cfg.commodity.strip())

    # 4. Check active BackupActivation handovers for user (both 'all' and 'distributed' scope)
    today = date.today()
    active_handovers = BackupActivation.query.filter(
        BackupActivation.active.is_(True),
        BackupActivation.start_date <= today,
        BackupActivation.end_date >= today
    ).all()

    for h in active_handovers:
        if (h.scope_type or 'all') == 'all' and h.backup_email.lower().strip() == me:
            p_user = User.query.filter_by(email=h.primary_email.lower().strip()).first()
            if p_user:
                p_me = p_user.email.lower().strip()
                p_name = (p_user.name or '').lower().strip()
                for cfg in all_configs:
                    freq = (cfg.type or '').lower().strip()
                    if freq in ('daily', 'mon-fri', ''):
                        assignees = [
                            (cfg.mode or '').lower().strip(),
                            (cfg.primary_assignee or '').lower().strip(),
                            (cfg.backup_1 or '').lower().strip(),
                            (cfg.backup_2 or '').lower().strip(),
                        ]
                        if any(a and (a == p_me or a == p_name or (len(a) > 2 and a in p_me) or (len(p_name) > 2 and p_name == a)) for a in assignees):
                            if cfg.commodity and cfg.commodity.strip():
                                comms.add(cfg.commodity.strip())
        elif (h.scope_type or '').lower() == 'distributed':
            import json
            items = []
            try: items = json.loads(h.items_json or '[]')
            except Exception: items = []
            
            for it in items:
                if (it.get('backupEmail') or '').lower().strip() == me:
                    if (it.get('type') or '').lower() == 'commodity' and it.get('item'):
                        comm_item = it['item'].strip()
                        daily_match = False
                        for cfg in all_configs:
                            if cfg.commodity and cfg.commodity.strip().lower() == comm_item.lower():
                                freq = (cfg.type or '').lower().strip()
                                if freq in ('daily', 'mon-fri', ''):
                                    daily_match = True
                                    break
                        if daily_match or not all_configs:
                            comms.add(comm_item)

    seen_lower = set()
    deduped = []
    for c in sorted(list(comms), key=lambda x: x.lower()):
        cl = c.lower().strip()
        if cl not in seen_lower:
            seen_lower.add(cl)
            deduped.append(c.strip())

    final_comms = deduped
    
    # If Manager/SuperAdmin has no specific assigned commodities, return None (unrestricted)
    if not final_comms and role_at_least(user.role, 'Manager'):
        return None

    return final_comms


@du_bp.route('/commodities', methods=['GET'])
@jwt_required()
def get_commodities():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    comms = _get_user_commodities(user)
    if comms is None:
        configs = CommodityConfig.query.all()
        seen = set()
        commodities = []
        for c in configs:
            if c.commodity and c.commodity not in seen:
                seen.add(c.commodity)
                commodities.append(c.commodity)
        return jsonify({'success': True, 'commodities': sorted(commodities, key=lambda x: x.lower())})

    return jsonify({'success': True, 'commodities': comms})


@du_bp.route('/types/<commodity>', methods=['GET'])
@jwt_required()
def get_types(commodity):
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    configs = CommodityConfig.query.filter_by(commodity=commodity).all()
    seen = set()
    types = []
    for c in configs:
        if c.type and c.type not in seen:
            seen.add(c.type)
            types.append(c.type)

    return jsonify({'success': True, 'commodity': commodity, 'types': types})


@du_bp.route('/factors/<commodity>/<type_name>', methods=['GET'])
@jwt_required()
def get_factors(commodity, type_name):
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    configs = CommodityConfig.query.filter_by(commodity=commodity, type=type_name).all()
    factors = []
    for c in configs:
        if c.factor:
            factors.append({
                'factor': c.factor,
                'mode': c.mode,
                'source': c.source,
                'lastStatus': 'Pending',
                'lastRemarks': '',
            })

    # Prefill from today's entries if any
    today = date.today()
    topic = f"{commodity}::{type_name}"
    existing = MasterLog.query.filter_by(
        on_behalf_of_email=user.email,
        entry_date=today,
        topic=topic,
        entry_type='DataUpdate',
        row_status='Active',
    ).all()

    prefill = {}
    for e in existing:
        prefill[e.sub_topic] = {'status': e.status, 'remarks': e.remarks}

    for f in factors:
        if f['factor'] in prefill:
            f['lastStatus'] = prefill[f['factor']]['status']
            f['lastRemarks'] = prefill[f['factor']]['remarks']

    return jsonify({'success': True, 'commodity': commodity, 'type': type_name, 'factors': factors})


@du_bp.route('/submit', methods=['POST'])
@jwt_required()
def submit_du():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    data = request.get_json()
    commodity = data.get('commodity', '')
    type_name = data.get('type', '')
    factors = data.get('factors', [])

    if not commodity or not type_name:
        return jsonify({'success': False, 'message': 'Commodity and type required'}), 400
    if not factors:
        return jsonify({'success': False, 'message': 'No factors to submit'}), 400

    entry_date = date.fromisoformat(data.get('date', date.today().isoformat()))
    topic = f"{commodity}::{type_name}"
    now = datetime.now(timezone.utc)
    target_email = data.get('onBehalfOf', user.email).lower()

    # Amend existing entries for same topic/date
    existing = MasterLog.query.filter_by(
        on_behalf_of_email=target_email,
        entry_date=entry_date,
        topic=topic,
        entry_type='DataUpdate',
        row_status='Active',
    ).all()
    amended_count = 0
    for e in existing:
        e.row_status = 'Amended'
        amended_count += 1

    log_ids = []
    for f in factors:
        log_id = _new_log_id()
        entry = MasterLog(
            log_id=log_id,
            timestamp_submitted=now,
            submitted_by_email=user.email,
            on_behalf_of_email=target_email,
            on_behalf_of_name=user.name,
            entry_type='DataUpdate',
            entry_date=entry_date,
            week_number=entry_date.isocalendar()[1],
            month_year=entry_date.strftime('%B %Y'),
            topic=topic,
            sub_topic=f.get('factor', ''),
            status=f.get('status', 'Pending'),
            mode_or_extra=f.get('mode', ''),
            remarks=f.get('remarks', ''),
            row_status='Active',
        )
        db.session.add(entry)
        log_ids.append(log_id)

    db.session.commit()

    done = sum(1 for f in factors if f.get('status') == 'Done')
    pending = sum(1 for f in factors if f.get('status') == 'Pending')
    skip = sum(1 for f in factors if f.get('status') == 'Skip')

    log_audit(user.email, 'DU_SUBMIT', 'log', ','.join(log_ids),
              after={'commodity': commodity, 'type': type_name, 'count': len(factors), 'done': done, 'pending': pending, 'skip': skip})

    return jsonify({
        'success': True,
        'amendedCount': amended_count,
        'message': f'Saved {len(factors)} factors.\nDone: {done} Pending: {pending} Skip: {skip}',
    })


@du_bp.route('/factor-task', methods=['POST'])
@jwt_required()
def add_factor_task():
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    
    data = request.get_json() or {}
    commodity = (data.get('commodity') or '').strip()
    type_name = (data.get('type') or 'Daily').strip()
    factor = (data.get('factor') or '').strip()
    
    if not commodity or not factor:
        return jsonify({'success': False, 'message': 'Commodity and Factor Name are required'}), 400
    
    # Permission check for Teammates/Leaders
    user_comms = _get_user_commodities(user)
    if user_comms is not None and len(user_comms) > 0:
        allowed = any(uc.lower() in commodity.lower() or commodity.lower() in uc.lower() for uc in user_comms)
        if not allowed and not role_at_least(user.role, 'Manager'):
            return jsonify({'success': False, 'message': f'Access denied: You are not assigned to commodity "{commodity}"'}), 403

    c = CommodityConfig(
        commodity=commodity,
        type=type_name,
        factor=factor,
        mode=data.get('mode') or user.name,
        source=data.get('source', ''),
        primary_assignee=data.get('primaryAssignee') or user.email,
        backup_1=data.get('backup1', ''),
        backup_2=data.get('backup2', ''),
        schedule_day=data.get('scheduleDay', ''),
        instructions=data.get('instructions', ''),
    )
    db.session.add(c)
    db.session.commit()
    log_audit(user.email, 'FACTOR_TASK_ADD', 'CommodityConfig', str(c.id), after=c.to_dict())
    return jsonify({'success': True, 'config': c.to_dict(), 'message': f'Factor Task "{factor}" created for {commodity}'})

