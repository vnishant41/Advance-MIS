"""
Data Update — Commodity/Type/Factor submission with frequency support.
"""
import time, random
from datetime import datetime, date, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models import CommodityConfig, MasterLog, User
from app.auth import get_current_user, role_at_least, log_audit

du_bp = Blueprint('du', __name__)


def _new_log_id():
    return f"LOG{int(time.time()*1000)}_{random.randint(100, 999)}"


def _get_user_commodities(user):
    """Returns list of commodities user can access, or None for unrestricted."""
    if role_at_least(user.role, 'Manager'):
        return None  # unrestricted
    comms = [c.strip() for c in (user.commodities or '').split(',') if c.strip()]
    # Also merge backup_of user's commodities
    if user.backup_of:
        backup = User.query.filter_by(email=user.backup_of.lower()).first()
        if backup:
            for c in (backup.commodities or '').split(','):
                c = c.strip()
                if c and c not in comms:
                    comms.append(c)
    return comms


@du_bp.route('/commodities', methods=['GET'])
@jwt_required()
def get_commodities():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    configs = CommodityConfig.query.all()
    seen = set()
    commodities = []
    for c in configs:
        if c.commodity and c.commodity not in seen:
            seen.add(c.commodity)
            commodities.append(c.commodity)

    # Filter by user's commodity access
    comms = _get_user_commodities(user)
    if comms is not None and len(comms) > 0:
        commodities = [c for c in commodities if any(
            uc.lower() in c.lower() or c.lower() in uc.lower()
            for uc in comms
        )]

    return jsonify({'success': True, 'commodities': sorted(commodities)})


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
