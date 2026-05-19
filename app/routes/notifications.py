"""
Notifications — In-app notification system.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models import Notification
from app.auth import get_current_user

notif_bp = Blueprint('notifications', __name__)

@notif_bp.route('/', methods=['GET'])
@jwt_required()
def get_notifications():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    notifs = Notification.query.filter_by(user_email=user.email).order_by(Notification.created_at.desc()).limit(50).all()
    unread = sum(1 for n in notifs if not n.read)
    return jsonify({'success': True, 'notifications': [n.to_dict() for n in notifs], 'unread': unread})

@notif_bp.route('/read/<int:notif_id>', methods=['PUT'])
@jwt_required()
def mark_read(notif_id):
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    notif = Notification.query.get(notif_id)
    if notif and notif.user_email == user.email:
        notif.read = True
        db.session.commit()
    return jsonify({'success': True})

@notif_bp.route('/read-all', methods=['PUT'])
@jwt_required()
def mark_all_read():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    Notification.query.filter_by(user_email=user.email, read=False).update({'read': True})
    db.session.commit()
    return jsonify({'success': True})
