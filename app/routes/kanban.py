"""
Kanban Board — Full CRUD with sprints, comments, drag-drop support.
"""
import time, random, json
from datetime import datetime, date, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models import KanbanTask, Sprint, User
from app.auth import get_current_user, role_at_least, log_audit

kanban_bp = Blueprint('kanban', __name__)
STATUSES = ['Assigned', 'In Progress', 'Under Review', 'Done', 'Blocked']

def _filter_tasks(tasks, user):
    if user.role in ('SuperAdmin', 'Manager'):
        return tasks
    return [t for t in tasks if user.email in (t.assigned_to or '') or t.created_by == user.email]

@kanban_bp.route('/board', methods=['GET'])
@jwt_required()
def get_board():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    # Order by (status, position ASC, updated_at DESC) — lower position first,
    # newer tasks first when position ties so freshly moved cards land on top.
    rows = KanbanTask.query.order_by(KanbanTask.position.asc(), KanbanTask.updated_at.desc()).all()
    visible = _filter_tasks(rows, user)
    sprints = Sprint.query.all()
    return jsonify({'success': True, 'tasks': [t.to_dict() for t in visible], 'sprints': [s.to_dict() for s in sprints], 'statuses': STATUSES})

@kanban_bp.route('/shell', methods=['GET'])
@jwt_required()
def get_shell():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    visible = _filter_tasks(KanbanTask.query.all(), user)
    sprints = Sprint.query.all()
    assignees = set()
    tags_set = set()
    for t in visible:
        for e in (t.assigned_to or '').split(','): 
            e = e.strip()
            if e: assignees.add(e)
        for tag in (t.tags or '').split(','):
            tag = tag.strip()
            if tag: tags_set.add(tag)
    counts = {s: sum(1 for t in visible if t.status == s) for s in STATUSES}
    users_data = [u.to_dict() for u in User.query.filter_by(active=True).all()]
    return jsonify({'success': True, 'statuses': STATUSES, 'counts': counts, 'sprints': [s.to_dict() for s in sprints], 'assignees': sorted(assignees), 'tags': sorted(tags_set), 'allUsers': users_data})

@kanban_bp.route('/task', methods=['POST'])
@jwt_required()
def create_task():
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    data = request.get_json()
    title = (data.get('title') or '').strip()
    if not title: return jsonify({'success': False, 'message': 'Title required'}), 400
    assigned_to = data.get('assignedTo', '')
    if isinstance(assigned_to, list): assigned_to = ', '.join(assigned_to)
    emails = [e.strip().lower() for e in assigned_to.split(',') if e.strip()]
    names = [getattr(User.query.filter_by(email=e).first(), 'name', e) for e in emails]
    now = datetime.now(timezone.utc)
    task_id = f"T{int(time.time()*1000)}_{random.randint(100,999)}"
    due_date = None
    if data.get('dueDate'):
        try: due_date = date.fromisoformat(data['dueDate'])
        except: pass
    task = KanbanTask(task_id=task_id, title=title, description=data.get('desc',''), assigned_to=', '.join(emails), assigned_to_name=', '.join(names), status='Assigned', due_date=due_date, created_by=user.email, created_at=now, updated_at=now, tags=data.get('tags',''), sprint_id=data.get('sprintId',''), story_points=int(data.get('storyPoints',0)), department=data.get('dept', user.department or ''), remark=data.get('remark',''))
    db.session.add(task)
    db.session.commit()
    return jsonify({'success': True, 'id': task_id, 'task': task.to_dict()})

@kanban_bp.route('/task/<task_id>', methods=['PUT'])
@jwt_required()
def update_task(task_id):
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    task = KanbanTask.query.filter_by(task_id=task_id).first()
    if not task: return jsonify({'success': False, 'message': 'Task not found'}), 404
    is_assignee = user.email in (task.assigned_to or '')
    is_mgr = role_at_least(user.role, 'Manager')
    if not is_mgr and not is_assignee: return jsonify({'success': False, 'message': 'Not authorized'}), 403
    data = request.get_json()
    new_status = data.get('status', task.status)
    if new_status == 'Blocked':
        reason = (data.get('blockedReason') or '').strip()
        if not reason: return jsonify({'success': False, 'message': 'Blocked reason required'}), 400
        task.blocked_reason = reason
    elif task.status == 'Blocked' and new_status != 'Blocked':
        task.blocked_reason = ''

    # When status changes (cross-column move), put this task at the TOP of the
    # destination column. We do that by setting its position one below the
    # current minimum in that column.
    if new_status != task.status:
        from sqlalchemy import func as _sqlfn
        min_pos = db.session.query(_sqlfn.min(KanbanTask.position)).filter(
            KanbanTask.status == new_status,
            KanbanTask.task_id != task.task_id,
        ).scalar()
        task.position = (min_pos if min_pos is not None else 0) - 1

    task.status = new_status
    is_creator = task.created_by == user.email
    if is_mgr or is_creator or is_assignee:
        for field in ['title','desc','tags','sprintId','remark']:
            if field in data:
                attr = {'desc':'description','sprintId':'sprint_id'}.get(field, field)
                setattr(task, attr, data[field])
        if 'storyPoints' in data: task.story_points = int(data['storyPoints'] or 0)
        if 'dueDate' in data:
            try: task.due_date = date.fromisoformat(data['dueDate']) if data['dueDate'] else None
            except: pass
        if 'assignedTo' in data:
            assigned = data['assignedTo']
            if isinstance(assigned, list): assigned = ', '.join(assigned)
            emails = [e.strip().lower() for e in assigned.split(',') if e.strip()]
            names = [getattr(User.query.filter_by(email=e).first(), 'name', e) for e in emails]
            task.assigned_to = ', '.join(emails)
            task.assigned_to_name = ', '.join(names)
    db.session.commit()
    return jsonify({'success': True, 'task': task.to_dict()})

@kanban_bp.route('/task/<task_id>', methods=['DELETE'])
@jwt_required()
def delete_task(task_id):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    task = KanbanTask.query.filter_by(task_id=task_id).first()
    if not task: return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(task)
    db.session.commit()
    return jsonify({'success': True})

@kanban_bp.route('/task/<task_id>/comment', methods=['POST'])
@jwt_required()
def add_comment(task_id):
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    task = KanbanTask.query.filter_by(task_id=task_id).first()
    if not task: return jsonify({'success': False, 'message': 'Not found'}), 404
    data = request.get_json()
    text = (data.get('comment') or '').strip()
    if not text: return jsonify({'success': False, 'message': 'Empty comment'}), 400
    comments = json.loads(task.comments_json or '[]')
    comments.append({'by': user.name, 'email': user.email, 'text': text, 'at': datetime.now(timezone.utc).isoformat()})
    task.comments_json = json.dumps(comments)
    task.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({'success': True, 'comments': comments})

@kanban_bp.route('/bulk-move', methods=['POST'])
@jwt_required()
def bulk_move():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    data = request.get_json()
    ids = data.get('ids', [])
    status = data.get('status', '')
    if status not in STATUSES: return jsonify({'success': False, 'message': 'Invalid status'}), 400
    moved = 0
    for tid in ids:
        task = KanbanTask.query.filter_by(task_id=tid).first()
        if not task: continue
        if not (role_at_least(user.role, 'Manager') or user.email in (task.assigned_to or '')): continue
        task.status = status
        task.updated_at = datetime.now(timezone.utc)
        if status == 'Blocked': task.blocked_reason = data.get('blockedReason', '')
        elif task.blocked_reason: task.blocked_reason = ''
        moved += 1
    db.session.commit()
    return jsonify({'success': True, 'moved': moved})

@kanban_bp.route('/reorder', methods=['POST'])
@jwt_required()
def reorder_column():
    """Persist a new top-to-bottom order for tasks within one status column.

    Body: { status: 'In Progress', orderedIds: ['T1', 'T2', ...] }
    """
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401
    data = request.get_json() or {}
    status = (data.get('status') or '').strip()
    ordered_ids = data.get('orderedIds') or []
    if status not in STATUSES:
        return jsonify({'success': False, 'message': 'Invalid status'}), 400
    if not isinstance(ordered_ids, list):
        return jsonify({'success': False, 'message': 'orderedIds must be a list'}), 400

    # Renumber: position 0, 1, 2, ... in the order received.
    updated = 0
    for idx, tid in enumerate(ordered_ids):
        t = KanbanTask.query.filter_by(task_id=tid, status=status).first()
        if not t:
            continue
        # Permission: assignee or manager+
        if not (role_at_least(user.role, 'Manager') or user.email in (t.assigned_to or '')):
            continue
        t.position = idx
        updated += 1
    db.session.commit()
    return jsonify({'success': True, 'updated': updated})


@kanban_bp.route('/sprint', methods=['POST'])
@jwt_required()
def create_sprint():
    user = get_current_user()
    if not user: return jsonify({'success': False, 'message': 'Authentication required'}), 401
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name: return jsonify({'success': False, 'message': 'Name required'}), 400
    sid = f"SP{int(time.time()*1000)}_{random.randint(100,999)}"
    s_date = e_date = None
    try:
        if data.get('startDate'): s_date = date.fromisoformat(data['startDate'])
        if data.get('endDate'): e_date = date.fromisoformat(data['endDate'])
    except: pass
    sprint = Sprint(sprint_id=sid, name=name, start_date=s_date, end_date=e_date, status='Active', goal=data.get('goal',''))
    db.session.add(sprint)
    db.session.commit()
    return jsonify({'success': True, 'id': sid, 'sprint': sprint.to_dict()})

@kanban_bp.route('/sprint/<sprint_id>/status', methods=['PUT'])
@jwt_required()
def update_sprint_status(sprint_id):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    sprint = Sprint.query.filter_by(sprint_id=sprint_id).first()
    if not sprint: return jsonify({'success': False, 'message': 'Not found'}), 404
    data = request.get_json()
    sprint.status = data.get('status', sprint.status)
    db.session.commit()
    return jsonify({'success': True, 'sprint': sprint.to_dict()})
