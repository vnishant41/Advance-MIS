"""
MIS Report — Report entry + PDF upload & analysis.
"""
import os, time, random, json
from datetime import datetime, date, timezone
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required
from app import db
from app.models import Report, ReportComponent, MasterLog, MISReportUpload, User, MISTemplate, SemanticFeedback
from app.auth import get_current_user, role_at_least, log_audit

mis_bp = Blueprint('mis', __name__)


def _new_log_id():
    return f"LOG{int(time.time()*1000)}_{random.randint(100, 999)}"


@mis_bp.route('/reports', methods=['GET'])
@jwt_required()
def get_reports():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    reports = Report.query.all()

    # Teammates only see reports assigned to them (primary or backup1/2).
    # Managers/Leaders/SuperAdmins see everything.
    if not role_at_least(user.role, 'Manager'):
        me_email = user.email.lower()
        me_name = (user.name or '').lower()
        def _mine(r):
            for fld in (r.primary_assignee, getattr(r, 'backup_1', '') or '', getattr(r, 'backup_2', '') or ''):
                f = (fld or '').lower()
                if f and (me_email in f or (me_name and me_name in f)):
                    return True
            return False
        reports = [r for r in reports if _mine(r)]

    today_dow = date.today().weekday()  # 0=Mon
    result = []
    for r in reports:
        freq = (r.frequency or 'Daily').strip()
        due_today = (
            freq == 'Daily' or
            (freq in ('Weekly', 'Weeky') and today_dow == 0) or
            (freq == 'Monthly' and date.today().day == 1) or
            (freq == 'Mon-Fri' and today_dow <= 4)
        )
        result.append({**r.to_dict(), 'dueToday': due_today})

    return jsonify({'success': True, 'reports': result})


@mis_bp.route('/components/<report_name>', methods=['GET'])
@jwt_required()
def get_components(report_name):
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    comps = ReportComponent.query.filter_by(report_name=report_name).all()
    result = []
    for c in comps:
        d = c.to_dict()
        d['lastStatus'] = 'Pending'
        d['lastRemarks'] = ''

        # Prefill from today's entries
        existing = MasterLog.query.filter_by(
            on_behalf_of_email=user.email,
            entry_date=date.today(),
            topic=report_name,
            sub_topic=c.component_name,
            entry_type='MISReport',
            row_status='Active',
        ).first()
        if existing:
            d['lastStatus'] = existing.status
            d['lastRemarks'] = existing.remarks
        result.append(d)

    return jsonify({'success': True, 'report': report_name, 'components': result})


@mis_bp.route('/submit', methods=['POST'])
@jwt_required()
def submit_mis():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    data = request.get_json()
    report = data.get('report', '')
    entries = data.get('entries', [])

    if not report:
        return jsonify({'success': False, 'message': 'Report name required'}), 400
    if not entries:
        return jsonify({'success': False, 'message': 'No entries to submit'}), 400

    entry_date = date.fromisoformat(data.get('date', date.today().isoformat()))
    now = datetime.now(timezone.utc)
    target_email = data.get('onBehalfOf', user.email).lower()

    # Amend existing
    existing = MasterLog.query.filter_by(
        on_behalf_of_email=target_email,
        entry_date=entry_date,
        topic=report,
        entry_type='MISReport',
        row_status='Active',
    ).all()
    amended_count = 0
    for e in existing:
        e.row_status = 'Amended'
        amended_count += 1

    # Check if late
    rpt = Report.query.filter_by(name=report).first()
    is_late = False
    deadline = ''
    if rpt and rpt.deadline:
        deadline = rpt.deadline
        now_time = now.strftime('%H:%M')
        is_late = now_time > rpt.deadline

    log_ids = []
    for e in entries:
        log_id = _new_log_id()
        entry = MasterLog(
            log_id=log_id,
            timestamp_submitted=now,
            submitted_by_email=user.email,
            on_behalf_of_email=target_email,
            on_behalf_of_name=user.name,
            entry_type='MISReport',
            entry_date=entry_date,
            week_number=entry_date.isocalendar()[1],
            month_year=entry_date.strftime('%B %Y'),
            topic=report,
            sub_topic=e.get('component', ''),
            status=e.get('status', 'Pending'),
            remarks=e.get('remarks', ''),
            is_late=is_late,
            row_status='Active',
        )
        db.session.add(entry)
        log_ids.append(log_id)

    db.session.commit()

    done = sum(1 for e in entries if e.get('status') == 'Done')
    pending = sum(1 for e in entries if e.get('status') == 'Pending')
    skip = sum(1 for e in entries if e.get('status') == 'Skip')
    pct = round(done / (done + pending) * 100) if (done + pending) > 0 else 0

    log_audit(user.email, 'MIS_SUBMIT', 'log', ','.join(log_ids),
              after={'report': report, 'count': len(entries), 'done': done, 'pending': pending, 'skip': skip, 'isLate': is_late})

    msg = f'Saved {len(entries)} entries.'
    if is_late:
        msg += f'\nLATE (deadline: {deadline})'
    msg += f'\nDone: {done} Pending: {pending} Skip: {skip}\nProgress: {pct}%'

    return jsonify({
        'success': True,
        'amendedCount': amended_count,
        'message': msg,
    })


@mis_bp.route('/upload-pdf', methods=['POST'])
@jwt_required()
def upload_pdf():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'success': False, 'message': 'Only PDF files accepted'}), 400

    report_type = request.form.get('reportType', '')

    # Save file
    timestamp = int(time.time())
    safe_name = f"{timestamp}_{file.filename.replace(' ', '_')}"
    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], safe_name)
    file.save(filepath)
    file_size = os.path.getsize(filepath)

    # Create upload record
    upload = MISReportUpload(
        filename=safe_name,
        original_filename=file.filename,
        report_type=report_type,
        uploaded_by=user.email,
        file_size=file_size,
    )
    db.session.add(upload)
    db.session.commit()

    # Fast precheck — read page 1 only, extract name + date, verify they look
    # right BEFORE running the slow template validation and LLM call. Lets the
    # user know in ~1s if they uploaded the wrong file.
    try:
        from app.services.pdf_parser import pdf_precheck
        precheck = pdf_precheck(filepath, report_type)
    except Exception as e:
        precheck = {'ok': False, 'reason': f'Precheck error: {e}',
                    'extractedName': '', 'extractedDate': '',
                    'nameMatch': False, 'dateFound': False, 'expectedTokens': []}

    if not precheck.get('ok'):
        upload.parsed = True
        upload.summary = precheck.get('reason', 'Precheck rejected the file.')
        upload.quality_score = 0
        upload.analysis_json = json.dumps({'precheck': precheck, 'isTemplateBased': False})
        db.session.commit()
        log_audit(user.email, 'PDF_UPLOAD_REJECTED', 'report', str(upload.id),
                  after={'filename': file.filename, 'reportType': report_type,
                         'precheck': precheck})
        return jsonify({
            'success': True,
            'upload': upload.to_dict(),
            'precheckFailed': True,
            'precheck': precheck,
        })

    # Parse the PDF
    try:
        from app.services.pdf_parser import analyze_pdf
        template_config = None
        if report_type:
            tpl = MISTemplate.query.filter_by(report_type=report_type).first()
            if tpl:
                template_config = json.loads(tpl.layout_config or '[]')
        analysis = analyze_pdf(filepath, report_type, template_config)
        # Carry the precheck result inside the analysis for transparency
        analysis['precheck'] = precheck

        # Semantic verification. Fetch up to 5 most-recent user
        # feedback entries for this report_type as in-context examples so the
        # engine improves over time per report type.
        try:
            from app.services.semantic_validator import verify_semantic_data
            examples_q = (
                SemanticFeedback.query
                .filter_by(report_type=report_type)
                .order_by(SemanticFeedback.created_at.desc())
                .limit(5)
                .all()
                if report_type else []
            )
            examples = [
                {
                    'section': f.section,
                    'verdict': f.verdict,
                    'feedback': f.feedback,
                    'notes': f.notes,
                }
                for f in examples_q
            ]
            semantic_result = verify_semantic_data(report_type, analysis, examples)
            analysis['llm'] = semantic_result  # Keep the 'llm' key in JSON so frontend doesn't break if it expects it
        except Exception as e:
            analysis['llm'] = {'available': False, 'error': str(e), 'sections': []}

        upload.parsed = True
        upload.analysis_json = json.dumps(analysis)
        upload.summary = analysis.get('summary', '')
        upload.quality_score = analysis.get('qualityScore', 0)
        upload.sections_found = json.dumps(analysis.get('sectionsFound', []))
        upload.sections_missing = json.dumps(analysis.get('sectionsMissing', []))
        upload.tables_count = analysis.get('tablesCount', 0)
        upload.charts_count = analysis.get('chartsCount', 0)
        upload.commentary_status = analysis.get('commentaryStatus', '')
        upload.validation_results = json.dumps(analysis.get('validationResults', {}))
        db.session.commit()
    except Exception as e:
        upload.summary = f'Parse error: {str(e)}'
        db.session.commit()

    # Rich audit entry: include extracted fields, score, per-category summary, and a
    # per-element list (label/type/status/extracted text). The analysis_json on the
    # upload row already carries the full detail; the audit row makes it queryable
    # alongside other MasterLog entries.
    try:
        a = json.loads(upload.analysis_json or '{}')
    except Exception:
        a = {}
    audit_after = {
        'filename': file.filename,
        'reportType': report_type,
        'size': file_size,
        'qualityScore': upload.quality_score,
        'extractedFields': a.get('extractedFields', {}),
        'categoryStatus': a.get('categoryStatus', {}),
        'elementCount': len(a.get('detailLog', [])),
        'elements': [
            {'label': d.get('label'), 'type': d.get('type'), 'page': d.get('page'),
             'status': d.get('status'), 'text': (d.get('extractedText') or '')[:120]}
            for d in a.get('detailLog', [])
        ],
    }
    log_audit(user.email, 'PDF_UPLOAD', 'report', str(upload.id), after=audit_after)

    return jsonify({'success': True, 'upload': upload.to_dict()})


@mis_bp.route('/analysis/<int:upload_id>', methods=['GET'])
@jwt_required()
def get_analysis(upload_id):
    upload = MISReportUpload.query.get(upload_id)
    if not upload:
        return jsonify({'success': False, 'message': 'Upload not found'}), 404
    return jsonify({'success': True, 'analysis': upload.to_dict()})


@mis_bp.route('/analysis/all', methods=['GET'])
@jwt_required()
def get_all_analyses():
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    # Teammates only see their own upload history; managers see everything.
    q = MISReportUpload.query.order_by(MISReportUpload.upload_date.desc())
    if not role_at_least(user.role, 'Manager'):
        q = q.filter(MISReportUpload.uploaded_by == user.email)
    uploads = q.limit(50).all()
    return jsonify({'success': True, 'analyses': [u.to_dict() for u in uploads]})


@mis_bp.route('/templates', methods=['GET'])
@jwt_required()
def get_templates():
    # Any authenticated user can list templates so the PDF Analysis report-type
    # dropdown can populate. Modifying/deleting templates is still Manager-only.
    user = get_current_user()
    if not user:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    templates = MISTemplate.query.all()
    return jsonify({'success': True, 'templates': [t.to_dict() for t in templates]})


@mis_bp.route('/templates', methods=['POST'])
@jwt_required()
def save_template():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'):
        return jsonify({'success': False, 'message': 'Not authorized'}), 403

    data = request.get_json()
    report_type = data.get('reportType', '').strip()
    layout_config = data.get('layoutConfig', [])

    if not report_type:
        return jsonify({'success': False, 'message': 'Report type is required'}), 400

    template = MISTemplate.query.filter_by(report_type=report_type).first()
    if template:
        template.layout_config = json.dumps(layout_config)
        template.updated_at = datetime.now(timezone.utc)
    else:
        template = MISTemplate(
            report_type=report_type,
            layout_config=json.dumps(layout_config),
            created_by=user.email
        )
        db.session.add(template)

    db.session.commit()
    return jsonify({'success': True, 'message': 'Template saved successfully', 'template': template.to_dict()})


@mis_bp.route('/templates/<int:template_id>', methods=['DELETE'])
@jwt_required()
def delete_template(template_id):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'):
        return jsonify({'success': False, 'message': 'Not authorized'}), 403

    template = MISTemplate.query.get(template_id)
    if not template:
        return jsonify({'success': False, 'message': 'Template not found'}), 404

    report_type = template.report_type
    db.session.delete(template)
    db.session.commit()
    log_audit(user.email, 'MIS_TEMPLATE_DELETE', 'template', str(template_id),
              before={'reportType': report_type})
    return jsonify({'success': True, 'message': f'Deleted template "{report_type}"'})


@mis_bp.route('/semantic-feedback', methods=['POST'])
@jwt_required()
def submit_semantic_feedback():
    """Capture a thumbs up/down on a semantic verdict so future runs can use it as
    an in-context example for the same report_type."""
    user = get_current_user()
    if not user:
        return jsonify({'success': False}), 401

    data = request.get_json() or {}
    fb = SemanticFeedback(
        report_type=data.get('reportType', ''),
        upload_id=int(data.get('uploadId', 0) or 0),
        section=data.get('section', '')[:500],
        verdict=data.get('verdict', '')[:50],
        reason=data.get('reason', ''),
        feedback=data.get('feedback', '')[:20],
        notes=data.get('notes', ''),
        user_email=user.email,
    )
    db.session.add(fb)
    db.session.commit()
    return jsonify({'success': True, 'id': fb.id})


@mis_bp.route('/templates/auto-detect', methods=['POST'])
@jwt_required()
def auto_detect_template():
    """Scan an uploaded master PDF and return suggested bounding boxes.
    Manager+ only. The PDF is processed in-memory style (saved to temp) and discarded.
    """
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'):
        return jsonify({'success': False, 'message': 'Not authorized'}), 403

    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'success': False, 'message': 'Only PDF files accepted'}), 400

    timestamp = int(time.time())
    safe_name = f"auto_{timestamp}_{file.filename.replace(' ', '_')}"
    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], safe_name)
    file.save(filepath)

    try:
        from app.services.pdf_parser import auto_detect_elements
        elements = auto_detect_elements(filepath)
        return jsonify({'success': True, 'elements': elements, 'count': len(elements)})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Auto-detect failed: {e}'}), 500
    finally:
        try:
            os.remove(filepath)
        except Exception:
            pass
