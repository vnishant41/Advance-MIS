"""
Advanced MIS — Database Models
All SQLAlchemy models for the application.
"""
from datetime import datetime, timezone
from app import db


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='Teammate')  # SuperAdmin, Manager, Leader, Teammate
    department = db.Column(db.String(100), default='Research')
    active = db.Column(db.Boolean, default=True)
    password_hash = db.Column(db.String(255), nullable=False)
    commodities = db.Column(db.Text, default='')  # comma-separated
    backup_of = db.Column(db.String(255), default='')
    last_login = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self, include_password=False):
        d = {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'role': self.role,
            'department': self.department,
            'active': self.active,
            'commodities': self.commodities or '',
            'backupOf': self.backup_of or '',
            'lastLogin': self.last_login.isoformat() if self.last_login else None,
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
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    deadline = db.Column(db.String(10), default='')
    primary_assignee = db.Column(db.String(255), default='')
    backup_1 = db.Column(db.String(255), default='')  # First backup person
    backup_2 = db.Column(db.String(255), default='')  # Second backup person
    frequency = db.Column(db.String(50), default='Daily')  # Daily, Weekly, Monthly, Quarterly, Yearly
    schedule_day = db.Column(db.String(50), default='')  # interpreted per-frequency (e.g. 'Monday', '15', '03-31')
    instructions = db.Column(db.Text, default='')  # admin-set instructions shown via (i) button on Today

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'deadline': self.deadline,
            'primaryAssignee': self.primary_assignee,
            'backup1': self.backup_1 or '',
            'backup2': self.backup_2 or '',
            'frequency': self.frequency,
            'scheduleDay': self.schedule_day or '',
            'instructions': self.instructions or '',
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
            'dueDate': self.due_date.isoformat() if self.due_date else '',
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
            'timestampSubmitted': self.timestamp_submitted.isoformat() if self.timestamp_submitted else '',
            'submittedBy': self.submitted_by_email,
            'onBehalfOf': self.on_behalf_of_email,
            'onBehalfOfName': self.on_behalf_of_name,
            'entryType': self.entry_type,
            'entryDate': self.entry_date.isoformat() if self.entry_date else '',
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
            'dueDate': self.due_date.isoformat() if self.due_date else '',
            'createdBy': self.created_by,
            'createdAt': self.created_at.isoformat() if self.created_at else '',
            'updatedAt': self.updated_at.isoformat() if self.updated_at else '',
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
            'startDate': self.start_date.isoformat() if self.start_date else '',
            'endDate': self.end_date.isoformat() if self.end_date else '',
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
            'date': self.date.isoformat() if self.date else '',
            'role': self.role,
            'employee': self.employee,
            'status': self.status,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else '',
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
            'timestamp': self.timestamp.isoformat() if self.timestamp else '',
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
            'timestamp': self.timestamp.isoformat() if self.timestamp else '',
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
            'updatedAt': self.updated_at.isoformat() if self.updated_at else '',
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
            'uploadDate': self.upload_date.isoformat() if self.upload_date else '',
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
            'createdAt': self.created_at.isoformat() if self.created_at else '',
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
            'newDate': self.new_date.isoformat() if self.new_date else '',
            'reason': self.reason or '',
            'createdBy': self.created_by or '',
            'createdAt': self.created_at.isoformat() if self.created_at else '',
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
            'createdAt': self.created_at.isoformat() if self.created_at else '',
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
    granted_by = db.Column(db.String(255), default='')  # manager email
    active = db.Column(db.Boolean, default=True, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'primaryEmail': self.primary_email,
            'backupEmail': self.backup_email,
            'startDate': self.start_date.isoformat() if self.start_date else '',
            'endDate': self.end_date.isoformat() if self.end_date else '',
            'reason': self.reason,
            'notes': self.notes,
            'grantedBy': self.granted_by,
            'active': self.active,
            'createdAt': self.created_at.isoformat() if self.created_at else '',
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
            'createdAt': self.created_at.isoformat() if self.created_at else '',
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
            'createdAt': self.created_at.isoformat() if self.created_at else '',
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
            'sentAt': self.sent_at.isoformat() if self.sent_at else '',
        }
