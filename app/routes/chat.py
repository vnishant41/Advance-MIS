"""
Chat — Real-time messaging with WebSocket support, DMs and file attachments.
"""
import os
import time
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename
from sqlalchemy import or_, func
from app import db, socketio
from app.models import ChatMessage, User
from app.auth import get_current_user
from flask_socketio import emit, join_room, leave_room

chat_bp = Blueprint('chat', __name__)

CHAT_UPLOAD_SUBDIR = 'chat'
MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME_PREFIXES = (
    'image/', 'application/', 'text/', 'audio/', 'video/',
)


def _dm_channel_id(email_a, email_b):
    """Deterministic DM channel id so both users land in the same room."""
    a, b = sorted([(email_a or '').lower().strip(), (email_b or '').lower().strip()])
    return f"dm-{a}__{b}"


def _dm_other_email(channel, me):
    """Given a DM channel id and the current user's email, return the other party."""
    if not channel.startswith('dm-'):
        return None
    pair = channel[3:].split('__', 1)
    if len(pair) != 2:
        return None
    me_lc = (me or '').lower()
    return pair[0] if pair[1] == me_lc else pair[1]


def _chat_upload_dir():
    folder = os.path.join(current_app.config['UPLOAD_FOLDER'], CHAT_UPLOAD_SUBDIR)
    os.makedirs(folder, exist_ok=True)
    return folder


@chat_bp.route('/channels', methods=['GET'])
@jwt_required()
def get_channels():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    channels = [
        {'id': 'general', 'name': '# General', 'type': 'public'},
        {'id': 'research', 'name': '# Research', 'type': 'department'},
        {'id': 'announcements', 'name': '# Announcements', 'type': 'public'},
    ]

    # DM channels the user has participated in (sent or received).
    me = user.email.lower()
    pattern = f"dm-%{me}%"
    dm_rows = db.session.query(ChatMessage.channel).filter(
        ChatMessage.channel.like('dm-%'),
        ChatMessage.channel.like(pattern),
    ).distinct().all()

    # Build a {email -> name} lookup for display labels
    others = set()
    for (ch,) in dm_rows:
        o = _dm_other_email(ch, me)
        if o:
            others.add(o)
    name_map = {}
    if others:
        for u in User.query.filter(func.lower(User.email).in_(list(others))).all():
            name_map[u.email.lower()] = u.name or u.email

    for (ch,) in dm_rows:
        o = _dm_other_email(ch, me)
        if not o:
            continue
        channels.append({
            'id': ch,
            'name': f"@ {name_map.get(o, o)}",
            'type': 'dm',
            'otherEmail': o,
        })

    return jsonify({'success': True, 'channels': channels})


@chat_bp.route('/users', methods=['GET'])
@jwt_required()
def list_users_for_dm():
    """List active users the current user can DM (excludes self)."""
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401
    rows = User.query.filter(
        User.active == True,
        func.lower(User.email) != user.email.lower(),
    ).order_by(User.name).all()
    return jsonify({
        'success': True,
        'users': [{'email': u.email, 'name': u.name, 'role': u.role} for u in rows],
    })


@chat_bp.route('/dm/<other_email>', methods=['POST'])
@jwt_required()
def open_dm(other_email):
    """Return the channel id for a 1:1 DM with `other_email`. Creates it lazily on first message."""
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401
    other = (other_email or '').strip().lower()
    if not other or other == user.email.lower():
        return jsonify({'success': False, 'message': 'Invalid recipient'}), 400
    target = User.query.filter(func.lower(User.email) == other).first()
    if not target:
        return jsonify({'success': False, 'message': 'User not found'}), 404
    channel = _dm_channel_id(user.email, target.email)
    return jsonify({
        'success': True,
        'channel': {
            'id': channel,
            'name': f"@ {target.name or target.email}",
            'type': 'dm',
            'otherEmail': target.email.lower(),
        },
    })


@chat_bp.route('/messages/<channel>', methods=['GET'])
@jwt_required()
def get_messages(channel):
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    # If this is a DM channel, only the two participants may read it.
    if channel.startswith('dm-'):
        other = _dm_other_email(channel, user.email)
        if not other:
            return jsonify({'success': False, 'message': 'Bad DM channel'}), 400

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('limit', 50, type=int)
    messages = ChatMessage.query.filter_by(channel=channel, deleted=False) \
        .order_by(ChatMessage.timestamp.desc()) \
        .paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        'success': True,
        'messages': [m.to_dict() for m in reversed(messages.items)],
        'hasMore': messages.has_next,
    })


@chat_bp.route('/send', methods=['POST'])
@jwt_required()
def send_message():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401
    data = request.get_json() or {}
    channel = (data.get('channel') or 'general').strip()
    text = (data.get('message') or '').strip()
    attachment = data.get('attachment') or {}

    # Must have either text or an attachment
    has_attachment = bool(attachment.get('filename'))
    if not text and not has_attachment:
        return jsonify({'success': False, 'message': 'Empty message'}), 400

    # DM-permission check
    if channel.startswith('dm-') and not _dm_other_email(channel, user.email):
        return jsonify({'success': False, 'message': 'Bad DM channel'}), 400

    msg_kwargs = dict(
        channel=channel,
        sender_email=user.email,
        sender_name=user.name,
        message=text,
        reply_to=data.get('replyTo'),
    )
    if has_attachment:
        msg_kwargs.update(
            attachment_filename=attachment.get('filename', ''),
            attachment_original=attachment.get('original', ''),
            attachment_size=int(attachment.get('size', 0) or 0),
            attachment_mime=attachment.get('mime', ''),
        )
    msg = ChatMessage(**msg_kwargs)
    db.session.add(msg)
    db.session.commit()
    socketio.emit('new_message', msg.to_dict(), room=channel, namespace='/chat')
    return jsonify({'success': True, 'message': msg.to_dict()})


@chat_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_file():
    """Accept a single file (max 10 MB). Returns metadata to attach to a message via /chat/send."""
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    f = request.files.get('file')
    if not f or not f.filename:
        return jsonify({'success': False, 'message': 'No file uploaded'}), 400

    # Size check — both stream-position and Content-Length to be safe
    try:
        f.stream.seek(0, os.SEEK_END)
        size = f.stream.tell()
        f.stream.seek(0)
    except Exception:
        size = request.content_length or 0
    if size > MAX_CHAT_FILE_BYTES:
        return jsonify({'success': False, 'message': f'File exceeds 10 MB limit ({size} bytes)'}), 413
    if size == 0:
        return jsonify({'success': False, 'message': 'Empty file'}), 400

    safe_name = secure_filename(f.filename) or 'file'
    ext = ''
    if '.' in safe_name:
        ext = '.' + safe_name.rsplit('.', 1)[1].lower()
    stored = f"{int(time.time())}_{uuid.uuid4().hex[:10]}{ext}"

    dest = os.path.join(_chat_upload_dir(), stored)
    f.save(dest)

    return jsonify({
        'success': True,
        'attachment': {
            'filename': stored,
            'original': safe_name,
            'size': size,
            'mime': f.mimetype or '',
            'url': f"/api/chat/file/{stored}",
        },
    })


@chat_bp.route('/file/<path:filename>', methods=['GET'])
@jwt_required()
def download_file(filename):
    """Serve a previously-uploaded chat attachment. DM access is restricted
    to the two participants; public/dept channel files are open to all logged-in users."""
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    # secure_filename to defend against path traversal
    safe = secure_filename(filename)
    if not safe or safe != filename:
        return jsonify({'success': False, 'message': 'Bad filename'}), 400

    msg = ChatMessage.query.filter_by(attachment_filename=safe, deleted=False).first()
    if not msg:
        return jsonify({'success': False, 'message': 'File not found'}), 404

    # DM gating
    if msg.channel.startswith('dm-'):
        other = _dm_other_email(msg.channel, user.email)
        if not other:
            return jsonify({'success': False, 'message': 'Access denied'}), 403

    folder = _chat_upload_dir()
    return send_from_directory(
        folder, safe,
        as_attachment=False,
        download_name=msg.attachment_original or safe,
    )


@chat_bp.route('/search', methods=['GET'])
@jwt_required()
def search_messages():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401
    q = request.args.get('q', '')
    if len(q) < 2:
        return jsonify({'success': True, 'results': []})
    me = user.email.lower()
    # Limit search results to channels the user can see (public/dept + their DMs)
    results = ChatMessage.query.filter(
        ChatMessage.message.ilike(f'%{q}%'),
        ChatMessage.deleted == False,
        or_(
            ~ChatMessage.channel.like('dm-%'),
            ChatMessage.channel.like(f'%{me}%'),
        ),
    ).order_by(ChatMessage.timestamp.desc()).limit(20).all()
    return jsonify({'success': True, 'results': [m.to_dict() for m in results]})


# WebSocket events
@socketio.on('join', namespace='/chat')
def on_join(data):
    room = data.get('channel', 'general')
    join_room(room)
    emit('user_joined', {'email': data.get('email', ''), 'channel': room}, room=room)


@socketio.on('leave', namespace='/chat')
def on_leave(data):
    room = data.get('channel', 'general')
    leave_room(room)


@socketio.on('typing', namespace='/chat')
def on_typing(data):
    room = data.get('channel', 'general')
    emit('user_typing', {'email': data.get('email', ''), 'name': data.get('name', '')}, room=room, include_self=False)
