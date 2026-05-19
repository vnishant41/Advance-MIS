"""
Roster / Roadster — Daily rotation management.
"""
from datetime import datetime, date, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models import RosterConfig, RosterLog
from app.auth import get_current_user, role_at_least

roster_bp = Blueprint('roster', __name__)

@roster_bp.route('/today', methods=['GET'])
@jwt_required()
def get_today():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    today = date.today()
    configs = RosterConfig.query.all()
    tasks = []
    for rc in configs:
        emp = rc.employee.lower()
        if not role_at_least(user.role, 'Manager') and emp != user.email.lower() and emp != user.name.lower():
            continue
        log = RosterLog.query.filter_by(date=today, role=rc.role).first()
        tasks.append({'role': rc.role, 'employee': rc.employee, 'frequency': rc.frequency, 'remark': rc.remark, 'status': log.status if log else 'Pending'})
    return jsonify({'success': True, 'tasks': tasks, 'today': today.isoformat()})

@roster_bp.route('/status', methods=['PUT'])
@jwt_required()
def update_status():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    data = request.get_json()
    role = data.get('role', '')
    status = data.get('status', 'Done')
    today = date.today()
    log = RosterLog.query.filter_by(date=today, role=role).first()
    if log:
        log.status = status
        log.updated_at = datetime.now(timezone.utc)
    else:
        config = RosterConfig.query.filter_by(role=role).first()
        if not config: return jsonify({'success': False, 'message': 'Role not found'}), 404
        log = RosterLog(date=today, role=role, employee=config.employee, status=status)
        db.session.add(log)
    db.session.commit()
    return jsonify({'success': True, 'status': status})

@roster_bp.route('/config', methods=['GET'])
@jwt_required()
def get_config():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    configs = RosterConfig.query.all()
    return jsonify({'success': True, 'data': [c.to_dict() for c in configs]})

@roster_bp.route('/config', methods=['POST'])
@jwt_required()
def save_config():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    data = request.get_json()
    old_role = data.get('oldRole')
    new_role = data.get('role', '')
    employee = data.get('employee', '')
    if not new_role or not employee: return jsonify({'success': False, 'message': 'Missing fields'}), 400
    if old_role:
        config = RosterConfig.query.filter_by(role=old_role).first()
        if config:
            config.role = new_role
            config.employee = employee
            config.frequency = data.get('frequency', 'Daily')
            config.remark = data.get('remark', '')
            db.session.commit()
            return jsonify({'success': True})
    config = RosterConfig(role=new_role, employee=employee, frequency=data.get('frequency', 'Daily'), remark=data.get('remark', ''))
    db.session.add(config)
    db.session.commit()
    return jsonify({'success': True})

@roster_bp.route('/config/<int:config_id>', methods=['DELETE'])
@jwt_required()
def delete_config(config_id):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    config = RosterConfig.query.get(config_id)
    if not config: return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(config)
    db.session.commit()
    return jsonify({'success': True})
