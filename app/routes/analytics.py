"""
Analytics — KPIs, SLA breaches, commodity comparison, exports.
"""
import csv, io
from datetime import datetime, date, timedelta, timezone
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required
from app import db
from app.models import MasterLog, User
from app.auth import get_current_user, role_at_least

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
        ds = r.entry_date.isoformat() if r.entry_date else ''
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
