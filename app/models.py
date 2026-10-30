"""
Advanced MIS — Database Models
All SQLAlchemy models for the application.
"""
from datetime import datetime, timezone
from app import db

def _safe_iso(val):
    if val is None:
        return None
    if hasattr(val, 'isoformat'):
        return val.isoformat()
    return str(val)



def infer_commodity(report_name):
    """Infer authoritative commodity from report name strictly matching report mapping.xlsx."""
    n = (report_name or '').lower()
    if 'bajra' in n: return 'Bajra'
    elif 'barley' in n: return 'Barley'
    elif 'chilli' in n: return 'Chilli'
    elif 'coriander' in n: return 'Coriander'
    elif 'cotton' in n: return 'Cotton'
    elif 'cumin' in n: return 'Cumin'
    elif 'maize' in n: return 'Maize'
    elif 'turmeric' in n: return 'Turmeric'
    elif any(k in n for k in ['pulse', 'chana', 'tur', 'urad', 'moong', 'masoor', 'pea']): return 'Pulses'
    elif any(k in n for k in ['rapeseed', 'mustard', 'rm seed']): return 'Rapeseed'
    elif 'rice' in n: return 'Rice'
    elif 'soy' in n: return 'Soybeans'
    elif 'sugar' in n: return 'Sugar'
    elif any(k in n for k in ['top', 'potato', 'onion', 'tomato']): return 'Tops'
    elif 'weather' in n: return 'Weather'
    elif 'wheat' in n: return 'Wheat'
    return 'General'


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.BigInteger, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='Teammate')  # SuperAdmin, Manager, Leader, Teammate
    department = db.Column(db.String(100), default='Research')
    active = db.Column(db.Boolean, default=True)
    password_hash = db.Column(db.String(255), nullable=False)
    commodities = db.Column(db.Text, default='')  # comma-separated
    backup_of = db.Column(db.String(255), default='')
    backup_1 = db.Column(db.String(255), nullable=True, default='')
    backup_2 = db.Column(db.String(255), nullable=True, default='')
    is_roster_sub_admin = db.Column(db.Boolean, default=False)
    last_login = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relational hierarchy mappings
    report_mappings = db.relationship('UserReportMapping', backref='user', cascade='all, delete-orphan', lazy=True)
    commodity_mappings = db.relationship('UserCommodityMapping', backref='user', cascade='all, delete-orphan', lazy=True)

    @property
    def reports(self):
        return self.report_mappings

    @reports.setter
    def reports(self, val):
        self.report_mappings = val

    def to_dict(self, include_password=False):
        d = {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'role': self.role,
            'department': self.department,
            'active': self.active,
            'commodities': self.commodities or '',
            'backup_of': self.backup_of or '',
            'backupOf': self.backup_of or '',
            'backup_1': self.backup_1 or '',
            'backup1': self.backup_1 or '',
            'backup_2': self.backup_2 or '',
            'backup2': self.backup_2 or '',
            'isRosterSubAdmin': self.is_roster_sub_admin or False,
            'lastLogin': _safe_iso(self.last_login),
            'reports': [rm.to_dict() for rm in (self.report_mappings or [])],
            'report_mappings': [rm.to_dict() for rm in (self.report_mappings or [])],
            'commodity_mappings': [cm.to_dict() for cm in (self.commodity_mappings or [])],
            'assignedCommodities': [cm.to_dict() for cm in (self.commodity_mappings or [])],
        }
        if include_password:
            d['password'] = self.password_hash
        return d


class AppSetting(db.Model):
    __tablename__ = 'app_settings'
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text, default='')


class ModuleToggle(db.Model):
    __tablename__ = 'module_toggles'
    id = db.Column(db.Integer, primary_key=True)
    module_key = db.Column(db.String(50), unique=True, nullable=False)
    enabled = db.Column(db.Boolean, default=True)


class Report(db.Model):
    __tablename__ = 'reports'
    id = db.Column(db.BigInteger, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    user_id = db.Column(db.BigInteger, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    commodity = db.Column(db.String(100), nullable=True)
    deadline = db.Column(db.String(10), default='')
    primary_assignee = db.Column(db.String(255), default='')
    backup_1 = db.Column(db.String(255), default='')  # First backup person
    backup_2 = db.Column(db.String(255), default='')  # Second backup person
    frequency = db.Column(db.String(50), default='Daily')  # Daily, Weekly, Monthly, Quarterly, Yearly
    schedule_day = db.Column(db.String(50), default='')  # interpreted per-frequency (e.g. 'Monday', '15', '03-31')
    instructions = db.Column(db.Text, default='')  # admin-set instructions shown via (i) button on Today

    user = db.relationship('User', backref=db.backref('assigned_reports', lazy=True), foreign_keys=[user_id])

    def to_dict(self):
        # Infer authoritative commodity from report name strictly matching report mapping.xlsx
        comm = self.commodity or infer_commodity(self.name)

        return {
            'id': self.id,
            'name': self.name,
            'commodity': comm,
            'user_id': self.user_id,
            'userId': self.user_id,
            'deadline': self.deadline,
            'primaryAssignee': self.primary_assignee,
            'primary_assignee': self.primary_assignee,
            'backup1': self.backup_1 or '',
            'backup2': self.backup_2 or '',
            'backup_1': self.backup_1 or '',
            'backup_2': self.backup_2 or '',
            'frequency': self.frequency,
            'scheduleDay': self.schedule_day or '',
            'schedule_day': self.schedule_day or '',
            'instructions': self.instructions or '',
        }


class UserReportMapping(db.Model):
    __tablename__ = 'user_report_mappings'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    report_id = db.Column(db.BigInteger, db.ForeignKey('reports.id', ondelete='CASCADE'), nullable=False, index=True)
    report_name = db.Column(db.String(255), nullable=False)
    timing_schedule = db.Column(db.String(255), nullable=True)
    deadline = db.Column(db.String(100), nullable=True)
    frequency = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    report = db.relationship('Report', backref=db.backref('user_mappings', cascade='all, delete-orphan', lazy=True), foreign_keys=[report_id])

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'userId': self.user_id,
            'report_id': self.report_id,
            'reportId': self.report_id,
            'report_name': self.report_name,
            'reportName': self.report_name,
            'name': self.report_name,
            'timing_schedule': self.timing_schedule or '',
            'timingSchedule': self.timing_schedule or '',
            'deadline': self.deadline or '',
            'frequency': self.frequency or '',
            'created_at': _safe_iso(self.created_at),
            'updated_at': _safe_iso(self.updated_at),
        }


class UserCommodityMapping(db.Model):
    __tablename__ = 'user_commodity_mappings'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    commodity = db.Column(db.String(100), nullable=False)
    mapping_config = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'userId': self.user_id,
            'commodity': self.commodity,
            'mapping_config': self.mapping_config or '',
            'mappingConfig': self.mapping_config or '',
            'config': self.mapping_config or '',
            'created_at': _safe_iso(self.created_at),
            'updated_at': _safe_iso(self.updated_at),
        }


class ReportComponent(db.Model):
    __tablename__ = 'report_components'
    id = db.Column(db.Integer, primary_key=True)
    report_name = db.Column(db.String(255), nullable=False, index=True)
    component_name = db.Column(db.String(255), nullable=False)
    assignee = db.Column(db.String(255), default='')
    min_count = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'reportName': self.report_name,
            'componentName': self.component_name,
            'assignee': self.assignee,
            'minCount': self.min_count,
        }


class CommodityConfig(db.Model):
    __tablename__ = 'commodity_configs'
    id = db.Column(db.Integer, primary_key=True)
    commodity = db.Column(db.String(255), nullable=False, index=True)
    type = db.Column(db.String(255), nullable=False)  # Task Timing: Daily / Weekly / Monthly / Quarterly / Yearly
    factor = db.Column(db.String(255), nullable=False)
    mode = db.Column(db.String(255), default='')      # User (assignee)
    source = db.Column(db.String(255), default='')
    primary_assignee = db.Column(db.String(255), default='')
    backup_1 = db.Column(db.String(255), default='')
    backup_2 = db.Column(db.String(255), default='')
    schedule_day = db.Column(db.String(50), default='')
    instructions = db.Column(db.Text, default='')

    def to_dict(self):
        return {
            'id': self.id,
            'commodity': self.commodity,
            'type': self.type,
            'factor': self.factor,
            'mode': self.mode,
            'source': self.source,
            'primaryAssignee': self.primary_assignee or '',
            'backup1': self.backup_1 or '',
            'backup2': self.backup_2 or '',
            'scheduleDay': self.schedule_day or '',
            'instructions': self.instructions or '',
        }


class TaskTemplate(db.Model):
    __tablename__ = 'task_templates'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    assignee = db.Column(db.String(255), default='')
    backup_1 = db.Column(db.String(255), default='')
    backup_2 = db.Column(db.String(255), default='')
    recurrence = db.Column(db.String(50), default='daily')  # daily, weekly, monthly, quarterly, yearly, mon-fri
    schedule_day = db.Column(db.String(50), default='')
    instructions = db.Column(db.Text, default='')
    due_date = db.Column(db.DateTime, nullable=True)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'assignee': self.assignee,
            'backup1': self.backup_1 or '',
            'backup2': self.backup_2 or '',
            'recurrence': self.recurrence,
            'scheduleDay': self.schedule_day or '',
            'instructions': self.instructions or '',
            'dueDate': _safe_iso(self.due_date) or '',
        }


class MasterLog(db.Model):
    __tablename__ = 'master_log'
    id = db.Column(db.Integer, primary_key=True)
    log_id = db.Column(db.String(100), unique=True, nullable=False, index=True)
    timestamp_submitted = db.Column(db.DateTime, nullable=False)
    submitted_by_email = db.Column(db.String(255), nullable=False)
    on_behalf_of_email = db.Column(db.String(255), nullable=False, index=True)
    on_behalf_of_name = db.Column(db.String(255), default='')
    entry_type = db.Column(db.String(50), nullable=False, index=True)  # MISReport, DataUpdate, Task
    entry_date = db.Column(db.Date, nullable=False, index=True)
    week_number = db.Column(db.Integer, default=0)
    month_year = db.Column(db.String(50), default='')
    topic = db.Column(db.String(255), default='')
    sub_topic = db.Column(db.String(255), default='')
    status = db.Column(db.String(50), default='Pending')  # Done, Pending, Skip
    data_count = db.Column(db.Integer, default=0)
    mode_or_extra = db.Column(db.String(255), default='')
    remarks = db.Column(db.Text, default='')
    is_late = db.Column(db.Boolean, default=False)
    time_to_submit_min = db.Column(db.Integer, default=0)
    row_status = db.Column(db.String(50), default='Active')  # Active, Amended
    source_url = db.Column(db.Text, default='')
    confidence = db.Column(db.String(50), default='Medium')
    validated_by_email = db.Column(db.String(255), default='')

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            'logId': self.log_id,
            'timestampSubmitted': _safe_iso(self.timestamp_submitted) or '',
            'submittedBy': self.submitted_by_email,
            'onBehalfOf': self.on_behalf_of_email,
            'onBehalfOfName': self.on_behalf_of_name,
            'entryType': self.entry_type,
            'entryDate': _safe_iso(self.entry_date) or '',
            'weekNumber': self.week_number,
            'monthYear': self.month_year,
            'topic': self.topic,
            'subTopic': self.sub_topic,
            'status': self.status,
            'dataCount': self.data_count,
            'modeOrExtra': self.mode_or_extra,
            'remarks': self.remarks,
            'isLate': self.is_late,
            'timeToSubmitMin': self.time_to_submit_min,
            'rowStatus': self.row_status,
            'sourceUrl': self.source_url,
            'confidence': self.confidence,
            'validatedBy': self.validated_by_email,
        }


class KanbanTask(db.Model):
    __tablename__ = 'kanban_tasks'
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.String(100), unique=True, nullable=False, index=True)
    title = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text, default='')
    assigned_to = db.Column(db.String(500), default='')  # comma-separated emails
    assigned_to_name = db.Column(db.String(500), default='')
    status = db.Column(db.String(50), default='Assigned')  # Assigned, In Progress, Under Review, Done, Blocked
    due_date = db.Column(db.Date, nullable=True)
    created_by = db.Column(db.String(255), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    tags = db.Column(db.String(500), default='')
    sprint_id = db.Column(db.String(100), default='')
    story_points = db.Column(db.Integer, default=0)
    comments_json = db.Column(db.Text, default='[]')
    department = db.Column(db.String(100), default='')
    depends_on = db.Column(db.String(500), default='')
    blocked_reason = db.Column(db.Text, default='')
    remark = db.Column(db.Text, default='')
    position = db.Column(db.Integer, default=0, index=True)  # within-column sort order (lower = top)

    def to_dict(self):
        import json
        comments = []
        try:
            comments = json.loads(self.comments_json or '[]')
        except Exception:
            pass
        assignee_list = [e.strip() for e in (self.assigned_to or '').split(',') if e.strip()]
        name_list = [n.strip() for n in (self.assigned_to_name or '').split(',') if n.strip()]
        return {
            'id': self.task_id,
            'position': self.position or 0,
            'title': self.title,
            'desc': self.description,
            'assignedTo': self.assigned_to,
            'assignedToList': assignee_list,
            'assignedToName': self.assigned_to_name,
            'assignedToNameList': name_list,
            'status': self.status,
            'dueDate': _safe_iso(self.due_date) or '',
            'createdBy': self.created_by,
            'createdAt': _safe_iso(self.created_at) or '',
            'updatedAt': _safe_iso(self.updated_at) or '',
            'tags': self.tags,
            'sprintId': self.sprint_id,
            'storyPoints': self.story_points,
            'comments': comments,
            'dept': self.department,
            'dependsOn': [d.strip() for d in (self.depends_on or '').split(',') if d.strip()],
            'blockedReason': self.blocked_reason,
            'remark': self.remark,
        }


class Sprint(db.Model):
    __tablename__ = 'sprints'
    id = db.Column(db.Integer, primary_key=True)
    sprint_id = db.Column(db.String(100), unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    start_date = db.Column(db.Date, nullable=True)
    end_date = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(50), default='Active')
    goal = db.Column(db.Text, default='')

    def to_dict(self):
        return {
            'id': self.sprint_id,
            'name': self.name,
            'startDate': _safe_iso(self.start_date) or '',
            'endDate': _safe_iso(self.end_date) or '',
            'status': self.status,
            'goal': self.goal,
        }


class RosterConfig(db.Model):
    __tablename__ = 'roster_configs'
    id = db.Column(db.Integer, primary_key=True)
    role = db.Column(db.String(255), nullable=False)
    employee = db.Column(db.String(255), nullable=False)
    frequency = db.Column(db.String(50), default='Daily')
    schedule_day = db.Column(db.String(50), default='')
    remark = db.Column(db.Text, default='')

    def to_dict(self):
        return {
            'id': self.id,
            'role': self.role,
            'employee': self.employee,
            'frequency': self.frequency,
            'scheduleDay': self.schedule_day or '',
            'remark': self.remark,
        }


class RosterLog(db.Model):
    __tablename__ = 'roster_log'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    role = db.Column(db.String(255), nullable=False)
    employee = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(50), default='Pending')
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            'id': self.id,
            'date': _safe_iso(self.date) or '',
            'role': self.role,
            'employee': self.employee,
            'status': self.status,
            'updatedAt': _safe_iso(self.updated_at) or '',
        }


class AuditLog(db.Model):
    __tablename__ = 'audit_log'
    id = db.Column(db.Integer, primary_key=True)
    audit_id = db.Column(db.String(100), unique=True, nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    actor_email = db.Column(db.String(255), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    target_type = db.Column(db.String(50), default='')
    target_id = db.Column(db.String(500), default='')
    before_json = db.Column(db.Text, default='')
    after_json = db.Column(db.Text, default='')
    is_proxy = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'auditId': self.audit_id,
            'timestamp': _safe_iso(self.timestamp) or '',
            'actor': self.actor_email,
            'action': self.action,
            'targetType': self.target_type,
            'targetId': self.target_id,
            'before': self.before_json,
            'after': self.after_json,
            'isProxy': self.is_proxy,
        }


class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'
    id = db.Column(db.Integer, primary_key=True)
    channel = db.Column(db.String(100), nullable=False, index=True)  # general, research, task-<id>, dm-<a>__<b>
    sender_email = db.Column(db.String(255), nullable=False)
    sender_name = db.Column(db.String(255), default='')
    message = db.Column(db.Text, nullable=False, default='')
    reply_to = db.Column(db.Integer, nullable=True)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    edited = db.Column(db.Boolean, default=False)
    deleted = db.Column(db.Boolean, default=False)
    # File attachment (optional)
    attachment_filename = db.Column(db.String(255), default='')   # stored filename on disk
    attachment_original = db.Column(db.String(255), default='')   # original upload filename
    attachment_size = db.Column(db.Integer, default=0)            # bytes
    attachment_mime = db.Column(db.String(100), default='')       # MIME type

    def to_dict(self):
        out = {
            'id': self.id,
            'channel': self.channel,
            'senderEmail': self.sender_email,
            'senderName': self.sender_name,
            'message': self.message if not self.deleted else '[deleted]',
            'replyTo': self.reply_to,
            'timestamp': _safe_iso(self.timestamp) or '',
            'edited': self.edited,
            'deleted': self.deleted,
        }
        if self.attachment_filename and not self.deleted:
            out['attachment'] = {
                'filename': self.attachment_original or self.attachment_filename,
                'url': f"/api/chat/file/{self.attachment_filename}",
                'size': self.attachment_size,
                'mime': self.attachment_mime,
            }
        return out


class MISTemplate(db.Model):
    __tablename__ = 'mis_templates'
    id = db.Column(db.Integer, primary_key=True)
    report_type = db.Column(db.String(255), unique=True, nullable=False)
    layout_config = db.Column(db.Text, default='[]')  # JSON array of bounding boxes
    created_by = db.Column(db.String(255), default='')
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        import json
        return {
            'id': self.id,
            'reportType': self.report_type,
            'layoutConfig': json.loads(self.layout_config or '[]'),
            'createdBy': self.created_by,
            'updatedAt': _safe_iso(self.updated_at) or '',
        }



class MISReportUpload(db.Model):
    __tablename__ = 'mis_report_uploads'
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(500), nullable=False)
    original_filename = db.Column(db.String(500), default='')
    report_type = db.Column(db.String(255), default='')  # e.g., "Pulses Daily"
    uploaded_by = db.Column(db.String(255), nullable=False)
    upload_date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    file_size = db.Column(db.Integer, default=0)
    parsed = db.Column(db.Boolean, default=False)
    analysis_json = db.Column(db.Text, default='{}')  # Full analysis result
    summary = db.Column(db.Text, default='')
    quality_score = db.Column(db.Integer, default=0)
    sections_found = db.Column(db.Text, default='[]')
    sections_missing = db.Column(db.Text, default='[]')
    tables_count = db.Column(db.Integer, default=0)
    charts_count = db.Column(db.Integer, default=0)
    commentary_status = db.Column(db.String(255), default='')
    validation_results = db.Column(db.Text, default='{}')

    def to_dict(self):
        import json
        return {
            'id': self.id,
            'filename': self.original_filename or self.filename,
            'reportType': self.report_type,
            'uploadedBy': self.uploaded_by,
            'uploadDate': _safe_iso(self.upload_date) or '',
            'fileSize': self.file_size,
            'parsed': self.parsed,
            'summary': self.summary,
            'qualityScore': self.quality_score,
            'sectionsFound': json.loads(self.sections_found or '[]'),
            'sectionsMissing': json.loads(self.sections_missing or '[]'),
            'tablesCount': self.tables_count,
            'chartsCount': self.charts_count,
            'commentaryStatus': self.commentary_status,
            'analysis': json.loads(self.analysis_json or '{}'),
            'validationResults': json.loads(self.validation_results or '{}'),
        }


class SemanticFeedback(db.Model):
    """User feedback on semantic text verdicts. Used as in-context examples on future runs
    so the system improves per report_type over time."""
    __tablename__ = 'mis_llm_feedback'
    id = db.Column(db.Integer, primary_key=True)
    report_type = db.Column(db.String(255), index=True, default='')
    upload_id = db.Column(db.Integer, default=0)
    section = db.Column(db.String(500), default='')      # heading text the verdict was about
    verdict = db.Column(db.String(50), default='')       # ok | suspect | missing
    reason = db.Column(db.Text, default='')              # the engine's reason
    feedback = db.Column(db.String(20), default='')      # 'up' | 'down'
    notes = db.Column(db.Text, default='')               # optional user note
    user_email = db.Column(db.String(255), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'reportType': self.report_type,
            'uploadId': self.upload_id,
            'section': self.section,
            'verdict': self.verdict,
            'reason': self.reason,
            'feedback': self.feedback,
            'notes': self.notes,
            'userEmail': self.user_email,
            'createdAt': _safe_iso(self.created_at) or '',
        }


class TaskOverride(db.Model):
    """Per-period date override for a monthly+ task. Default scheduleDay stays
    untouched; this row only overrides the firing date for one period (one
    month / quarter / half-year / year). Example: monthly Tradeflow normally
    fires on the 18th but this month the source publishes on the 20th — the
    manager creates an override for period '2026-05' with new_date=2026-05-20.
    """
    __tablename__ = 'task_overrides'
    id = db.Column(db.Integer, primary_key=True)
    entity_type = db.Column(db.String(50), nullable=False, index=True)   # TaskTemplate / Report / CommodityConfig / ReportGroup
    entity_key = db.Column(db.String(255), nullable=False, index=True)   # task name / report name / 'commodity::type'
    sub_key = db.Column(db.String(255), default='')                      # DU factor name
    period_key = db.Column(db.String(20), nullable=False, index=True)    # 'YYYY-MM' | 'YYYY-Qn' | 'YYYY-Hn' | 'YYYY'
    new_date = db.Column(db.Date, nullable=False)
    reason = db.Column(db.String(255), default='')
    created_by = db.Column(db.String(255), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.UniqueConstraint('entity_type', 'entity_key', 'sub_key', 'period_key', name='uq_task_override'),
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            'id': self.id,
            'entityType': self.entity_type,
            'entityKey': self.entity_key,
            'subKey': self.sub_key or '',
            'periodKey': self.period_key,
            'newDate': _safe_iso(self.new_date) or '',
            'reason': self.reason or '',
            'createdBy': self.created_by or '',
            'createdAt': _safe_iso(self.created_at) or '',
        }


class UserScheduleOverride(db.Model):
    """Per-user personal frequency override for a scheduled entity.

    Lets a Manager (or higher) collapse a monthly/quarterly/half-yearly task
    into a yearly cadence for themselves only — without affecting anyone else
    or the entity's default schedule. The original entity row is untouched;
    we just substitute (frequency, schedule_day) for this user at query time.
    """
    __tablename__ = 'user_schedule_overrides'
    id = db.Column(db.Integer, primary_key=True)
    user_email = db.Column(db.String(255), nullable=False, index=True)
    entity_type = db.Column(db.String(50), nullable=False, index=True)   # TaskTemplate / Report / CommodityConfig / ReportGroup / RosterConfig
    entity_key = db.Column(db.String(255), nullable=False, index=True)
    sub_key = db.Column(db.String(255), default='')                      # DU factor name (optional)
    frequency = db.Column(db.String(50), nullable=False, default='yearly')
    schedule_day = db.Column(db.String(50), default='')                  # interpreted per-frequency
    reason = db.Column(db.String(255), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.UniqueConstraint('user_email', 'entity_type', 'entity_key', 'sub_key',
                            name='uq_user_schedule_override'),
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def to_dict(self):
        return {
            'id': self.id,
            'userEmail': self.user_email,
            'entityType': self.entity_type,
            'entityKey': self.entity_key,
            'subKey': self.sub_key or '',
            'frequency': self.frequency,
            'scheduleDay': self.schedule_day or '',
            'reason': self.reason or '',
            'createdAt': _safe_iso(self.created_at) or '',
        }


class BackupActivation(db.Model):
    """A manager-granted handover: backup_email takes over for primary_email
    between start_date and end_date (inclusive). Only during this window does
    the backup user gain visibility on the primary's tasks/reports/commodities.
    """
    __tablename__ = 'backup_activations'
    id = db.Column(db.Integer, primary_key=True)
    primary_email = db.Column(db.String(255), nullable=False, index=True)
    backup_email = db.Column(db.String(255), nullable=False, index=True)
    start_date = db.Column(db.Date, nullable=False, index=True)
    end_date = db.Column(db.Date, nullable=False, index=True)
    reason = db.Column(db.String(255), default='')   # e.g. "On leave", "Sick"
    notes = db.Column(db.Text, default='')
    scope_type = db.Column(db.String(50), default='all')   # 'all' | 'distributed'
    items_json = db.Column(db.Text, default='[]')         # JSON array of distributed items
    granted_by = db.Column(db.String(255), default='')  # manager email
    active = db.Column(db.Boolean, default=True, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        import json
        items = []
        try:
            items = json.loads(self.items_json or '[]')
        except Exception:
            items = []
        return {
            'id': self.id,
            'primaryEmail': self.primary_email,
            'backupEmail': self.backup_email,
            'startDate': _safe_iso(self.start_date) or '',
            'endDate': _safe_iso(self.end_date) or '',
            'reason': self.reason,
            'notes': self.notes,
            'grantedBy': self.granted_by,
            'active': self.active,
            'scopeType': self.scope_type or 'all',
            'items': items,
            'createdAt': _safe_iso(self.created_at) or '',
        }


class ReportGroup(db.Model):
    """Groups reports under a parent category for the Report Merging window.

    Example: parent_category="Pulses", members="Tur,Urad,Bengal gram,Moong,Masoor,Pea"
    """
    __tablename__ = 'report_groups'
    id = db.Column(db.Integer, primary_key=True)
    parent_category = db.Column(db.String(255), nullable=False, index=True)
    group_name = db.Column(db.String(255), nullable=False)
    members = db.Column(db.Text, default='')  # comma-separated report names
    frequency = db.Column(db.String(50), default='Daily')
    primary_assignee = db.Column(db.String(255), default='')
    backup_1 = db.Column(db.String(255), default='')  # First backup person
    backup_2 = db.Column(db.String(255), default='')  # Second backup person
    schedule_day = db.Column(db.String(50), default='')
    visibility = db.Column(db.String(50), default='managers')  # managers | all
    remark = db.Column(db.Text, default='')
    created_by = db.Column(db.String(255), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'parentCategory': self.parent_category,
            'groupName': self.group_name,
            'members': [m.strip() for m in (self.members or '').split(',') if m.strip()],
            'frequency': self.frequency,
            'primaryAssignee': self.primary_assignee,
            'backup1': self.backup_1 or '',
            'backup2': self.backup_2 or '',
            'scheduleDay': self.schedule_day or '',
            'visibility': self.visibility,
            'remark': self.remark,
            'createdBy': self.created_by,
            'createdAt': _safe_iso(self.created_at) or '',
        }


class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    user_email = db.Column(db.String(255), nullable=False, index=True)
    type = db.Column(db.String(50), default='info')  # info, warning, error, success
    title = db.Column(db.String(255), default='')
    message = db.Column(db.Text, default='')
    link = db.Column(db.String(500), default='')
    read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'type': self.type,
            'title': self.title,
            'message': self.message,
            'link': self.link,
            'read': self.read,
            'createdAt': _safe_iso(self.created_at) or '',
        }


class EmailLog(db.Model):
    __tablename__ = 'email_logs'
    id = db.Column(db.Integer, primary_key=True)
    recipient = db.Column(db.Text, nullable=False)
    subject = db.Column(db.String(500), nullable=False)
    body = db.Column(db.Text, default='')
    status = db.Column(db.String(50), default='Success')  # Success or Failed
    error_message = db.Column(db.Text, default='')
    sent_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'recipient': self.recipient,
            'subject': self.subject,
            'body': self.body,
            'status': self.status,
            'errorMessage': self.error_message,
            'sentAt': _safe_iso(self.sent_at) or '',
        }


# ─── Crishi Database & Redesign Models ──────────────────────────────────────

class DBTaskCatalog(db.Model):
    """Master registry of agricultural database tables monitored by Crishi DB."""
    __tablename__ = 'db_task_catalog'
    id = db.Column(db.Integer, primary_key=True)
    user_name = db.Column(db.String(500), nullable=False)
    commodity = db.Column(db.Text, nullable=False)
    raw_table_name = db.Column(db.String(128), index=True, nullable=False)
    final_name = db.Column(db.String(255), nullable=False)
    frequency = db.Column(db.String(50), default='Daily')  # Daily, Weekly, Monthly, Yearly, Occasionally
    date_column = db.Column(db.String(64), default='Date')
    target_cutoff_time = db.Column(db.String(10), default='18:30')
    source_name = db.Column(db.String(255), default='')
    source_url = db.Column(db.Text, default='')
    commodity_config = db.Column(db.Text, nullable=True)  # JSON for per-commodity frequency, SLA & assignees
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        from app.services.surveillance import get_source_pipeline
        pipeline = get_source_pipeline(self.raw_table_name)
        return {
            'id': self.id,
            'user': self.user_name,
            'userName': self.user_name,
            'assigned_user': self.user_name,
            'commodity': self.commodity,
            'commodity_config': self.commodity_config or '',
            'commodityConfig': self.commodity_config or '',
            'raw_table': self.raw_table_name,
            'raw_table_name': self.raw_table_name,
            'rawTable': self.raw_table_name,
            'final_name': self.final_name,
            'final_business_name': self.final_name,
            'finalName': self.final_name,
            'frequency': self.frequency,
            'date_column': self.date_column,
            'dateColumn': self.date_column,
            'cutoff_time': self.target_cutoff_time,
            'cutoffTime': self.target_cutoff_time,
            'source': self.source_name or self.source_url or '',
            'source_name': self.source_name or '',
            'source_url': self.source_url or '',
            'source_pipeline': pipeline,
            'sourcePipeline': pipeline,
            'is_active': self.is_active,
            'isActive': self.is_active,
        }


class ManagerTaskPull(db.Model):
    """Tracks Manager Pull activations for Monthly, Yearly, and Occasional tasks."""
    __tablename__ = 'manager_task_pulls'
    id = db.Column(db.Integer, primary_key=True)
    catalog_id = db.Column(db.Integer, db.ForeignKey('db_task_catalog.id', ondelete='CASCADE'), nullable=False)
    pulled_by = db.Column(db.String(100), nullable=False)
    pulled_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    sla_hours = db.Column(db.Integer, default=24)
    deadline = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(50), default='Open')  # Open, Completed, Failed
    completed_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'catalogId': self.catalog_id,
            'pulledBy': self.pulled_by,
            'pulledAt': _safe_iso(self.pulled_at),
            'slaHours': self.sla_hours,
            'deadline': _safe_iso(self.deadline),
            'status': self.status,
            'completedAt': _safe_iso(self.completed_at),
        }


class TaskSkip(db.Model):
    """Administrative skips approved by Managers for holidays or external outages."""
    __tablename__ = 'task_skips'
    id = db.Column(db.Integer, primary_key=True)
    catalog_id = db.Column(db.Integer, db.ForeignKey('db_task_catalog.id', ondelete='CASCADE'), nullable=False)
    skip_date = db.Column(db.Date, nullable=False)
    skipped_by = db.Column(db.String(100), nullable=False)
    reason = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'catalogId': self.catalog_id,
            'skipDate': str(self.skip_date),
            'skippedBy': self.skipped_by,
            'reason': self.reason,
            'createdAt': _safe_iso(self.created_at),
        }


class TaskRemark(db.Model):
    """User operational notes attached to a monitored table."""
    __tablename__ = 'task_remarks'
    id = db.Column(db.Integer, primary_key=True)
    catalog_id = db.Column(db.Integer, db.ForeignKey('db_task_catalog.id', ondelete='CASCADE'), nullable=False)
    remark_date = db.Column(db.Date, nullable=False)
    user_name = db.Column(db.String(100), nullable=False)
    remark_text = db.Column(db.Text, nullable=False)
    is_edited = db.Column(db.Boolean, default=False)
    edited_at = db.Column(db.DateTime, nullable=True)
    last_edited_by = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'catalogId': self.catalog_id,
            'remarkDate': str(self.remark_date),
            'user': self.user_name,
            'remark': self.remark_text,
            'isEdited': bool(self.is_edited),
            'editedAt': _safe_iso(self.edited_at),
            'lastEditedBy': self.last_edited_by or '',
            'createdAt': _safe_iso(self.created_at),
        }


class TaskRemarkHistory(db.Model):
    """Audit log of user remark revisions (stored in database for audit compliance and WhatsApp-style info popup, not cluttering frontend table)."""
    __tablename__ = 'task_remark_history'
    id = db.Column(db.Integer, primary_key=True)
    remark_id = db.Column(db.Integer, nullable=False, index=True)
    catalog_id = db.Column(db.Integer, nullable=False, index=True)
    old_remark_text = db.Column(db.Text, nullable=False)
    new_remark_text = db.Column(db.Text, nullable=False)
    edited_by = db.Column(db.String(100), nullable=False)
    edited_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'remarkId': self.remark_id,
            'catalogId': self.catalog_id,
            'oldRemark': self.old_remark_text,
            'newRemark': self.new_remark_text,
            'editedBy': self.edited_by,
            'editedAt': _safe_iso(self.edited_at),
        }


class RosterSchedule(db.Model):
    """Weekly rotating duties including Rake Movement across a 2-month horizon."""
    __tablename__ = 'roster_schedules'
    id = db.Column(db.Integer, primary_key=True)
    week_start_date = db.Column(db.Date, nullable=False, index=True)
    week_end_date = db.Column(db.Date, nullable=False)
    duty_name = db.Column(db.String(150), nullable=False)
    raw_table_name = db.Column(db.String(128), default='')
    assigned_user = db.Column(db.String(100), nullable=False)
    backup_user = db.Column(db.String(100), default='')
    is_rake_movement = db.Column(db.Boolean, default=False)
    created_by = db.Column(db.String(100), default='System')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'weekStartDate': str(self.week_start_date),
            'weekEndDate': str(self.week_end_date),
            'dutyName': self.duty_name,
            'rawTable': self.raw_table_name,
            'assignedUser': self.assigned_user,
            'backupUser': self.backup_user,
            'isRakeMovement': self.is_rake_movement,
            'createdBy': self.created_by,
        }


class EmailReport(db.Model):
    """Market reports ingested automatically from Gmail inbox."""
    __tablename__ = 'email_reports'
    id = db.Column(db.Integer, primary_key=True)
    report_name = db.Column(db.String(255), nullable=False, index=True)
    date_sent = db.Column(db.Date, nullable=False, index=True)
    time_sent = db.Column(db.String(20), default='')
    subject = db.Column(db.String(500), default='')
    sender_email = db.Column(db.String(255), default='')
    file_path = db.Column(db.String(500), default='')
    email_body_html = db.Column(db.Text, default='')
    ai_summary_json = db.Column(db.Text, default='{}')
    status = db.Column(db.String(50), default='Analyzed')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'reportName': self.report_name,
            'date': str(self.date_sent),
            'timeSent': self.time_sent,
            'subject': self.subject,
            'sender': self.sender_email,
            'filePath': self.file_path,
            'emailBody': self.email_body_html,
            'aiSummary': self.ai_summary_json,
            'status': self.status,
            'createdAt': _safe_iso(self.created_at),
        }


class DBTaskVerification(db.Model):
    """Tracks user verification of MySQL table updates for specific dates and reports."""
    __tablename__ = 'db_task_verifications'
    id = db.Column(db.Integer, primary_key=True)
    catalog_id = db.Column(db.Integer, db.ForeignKey('db_task_catalog.id', ondelete='CASCADE'), nullable=False)
    report_date = db.Column(db.Date, nullable=False, index=True)
    verified_by = db.Column(db.String(255), nullable=False)
    row_count = db.Column(db.Integer, default=0)
    latest_db_date = db.Column(db.String(255), default='')
    status = db.Column(db.String(50), default='VERIFIED')  # VERIFIED, PENDING_ROWS
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'catalogId': self.catalog_id,
            'reportDate': str(self.report_date),
            'verifiedBy': self.verified_by,
            'rowCount': self.row_count,
            'latestDbDate': self.latest_db_date,
            'status': self.status,
            'notes': self.notes or '',
            'createdAt': _safe_iso(self.created_at),
        }


class RosterDaySubstitution(db.Model):
    """Tracks date-specific holiday replacements and backup assignee substitutions for roster duties."""
    __tablename__ = 'roster_day_substitutions'
    id = db.Column(db.Integer, primary_key=True)
    duty_role = db.Column(db.String(100), nullable=False, index=True)
    target_date = db.Column(db.Date, nullable=False, index=True)
    week_number = db.Column(db.Integer, default=0)
    primary_user = db.Column(db.String(100), nullable=False)
    backup_user = db.Column(db.String(100), nullable=False)
    is_on_leave = db.Column(db.Boolean, default=True)
    reason = db.Column(db.String(255), default='On Holiday / Leave')
    assigned_by = db.Column(db.String(100), default='Manager')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'dutyRole': self.duty_role,
            'targetDate': str(self.target_date),
            'weekNumber': self.week_number,
            'primaryUser': self.primary_user,
            'backupUser': self.backup_user,
            'isOnLeave': self.is_on_leave,
            'reason': self.reason,
            'assignedBy': self.assigned_by,
            'createdAt': _safe_iso(self.created_at),
        }


class _SafeQueryProperty:
    """
    Context-safe descriptor for TableUpdateHistory.query.
    If accessed when not has_app_context(), automatically creates and pushes
    a Flask application context so that queries succeed outside of explicit app_context blocks.
    """
    def __get__(self, obj, cls=None):
        if cls is None:
            cls = type(obj)
        from flask import has_app_context
        if not has_app_context():
            from app import create_app
            app = create_app()
            ctx = app.app_context()
            ctx.push()
        session = cls.__fsa__.session()
        try:
            session.commit()
        except Exception:
            session.rollback()
        return cls.query_class(cls, session=session)


class TableUpdateHistory(db.Model):
    """
    Immutable, append-only history of person-basis database updates and table synchronizations.
    Records captured: person_name, table_name, final_name, commodity, db_update_timestamp,
    report_date, status, row_count, remarks.
    """
    __tablename__ = 'table_update_history'

    query = _SafeQueryProperty()

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    catalog_id = db.Column(db.Integer, db.ForeignKey('db_task_catalog.id', ondelete='SET NULL'), nullable=True, index=True)
    person_name = db.Column(db.String(255), nullable=False, index=True)
    table_name = db.Column(db.String(255), nullable=False, index=True)
    final_name = db.Column(db.String(255), nullable=False)
    commodity = db.Column(db.String(255), nullable=False, index=True)
    db_update_timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    report_date = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(db.String(50), nullable=False, default='Verified')
    row_count = db.Column(db.Integer, nullable=False, default=0)
    remarks = db.Column(db.Text, nullable=True, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'catalog_id': self.catalog_id,
            'catalogId': self.catalog_id,
            'person_name': self.person_name,
            'personName': self.person_name,
            'table_name': self.table_name,
            'tableName': self.table_name,
            'final_name': self.final_name,
            'finalName': self.final_name,
            'commodity': self.commodity,
            'db_update_timestamp': _safe_iso(self.db_update_timestamp),
            'dbUpdateTimestamp': _safe_iso(self.db_update_timestamp),
            'report_date': self.report_date.isoformat() if self.report_date else '',
            'reportDate': self.report_date.isoformat() if self.report_date else '',
            'status': self.status,
            'row_count': self.row_count,
            'rowCount': self.row_count,
            'remarks': self.remarks or '',
            'created_at': _safe_iso(self.created_at),
        }

