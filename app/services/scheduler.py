"""Active reminders — push notifications at the time of work.

A small APScheduler background job that:
  - Scans each active user's tasks scheduled for today
  - Creates Notification rows for the moments that matter (morning reminder,
    deadline-approaching, overdue)
  - Pushes them in real time over Socket.IO to the user's personal room so
    the toast appears immediately without a page refresh

The job is idempotent: every notification has a stable per-day key (title +
user + date) so the same alert never fires twice in one calendar day.
"""
from datetime import datetime, date, timedelta
import threading


try:
    from zoneinfo import ZoneInfo
    IST = ZoneInfo('Asia/Kolkata')
except ImportError:
    import pytz
    IST = pytz.timezone('Asia/Kolkata')

# Module-level state so we can stop / restart cleanly (e.g., during reload).
_scheduler = None
_lock = threading.Lock()


def start_scheduler(app, socketio):
    """Boot the background reminder scheduler. Called once from create_app()."""
    global _scheduler
    with _lock:
        if _scheduler is not None:
            return _scheduler
        try:
            from apscheduler.schedulers.background import BackgroundScheduler
        except ImportError:
            app.logger.warning("apscheduler not installed — active notifications disabled")
            return None

        sched = BackgroundScheduler(daemon=True, timezone=IST)

        def _tick():
            try:
                with app.app_context():
                    _scan_and_notify(socketio)
                    
                    # ── Multi-Stage Email Digest Timings ──
                    from app.services.email_service import get_setting
                    from app import db
                    from app.models import AppSetting
                    
                    if get_setting('emailDigestEnabled', 'NO').upper() == 'YES':
                        now = datetime.now(IST)
                        today = now.date()
                        cur_hh_mm = now.strftime('%H:%M')

                        # 1. Teammate Reminder
                        if get_setting('emailTeammateReminderEnabled', 'NO').upper() == 'YES':
                            reminder_time = get_setting('emailTeammateReminderTime', '14:00')
                            last_run = get_setting('lastEmailReminderDate', '')
                            if cur_hh_mm >= reminder_time and last_run != today.isoformat():
                                setting = AppSetting.query.filter_by(key='lastEmailReminderDate').first()
                                if setting: setting.value = today.isoformat()
                                else: db.session.add(AppSetting(key='lastEmailReminderDate', value=today.isoformat()))
                                db.session.commit()
                                app.logger.info("[scheduler] Triggering teammate reminder digests...")
                                _send_teammate_reminders(app, today)

                        # 2. Teammate Final Update
                        if get_setting('emailTeammateFinalEnabled', 'NO').upper() == 'YES':
                            final_time = get_setting('emailTeammateFinalTime', '18:00')
                            last_run = get_setting('lastEmailTeammateFinalDate', '')
                            if cur_hh_mm >= final_time and last_run != today.isoformat():
                                setting = AppSetting.query.filter_by(key='lastEmailTeammateFinalDate').first()
                                if setting: setting.value = today.isoformat()
                                else: db.session.add(AppSetting(key='lastEmailTeammateFinalDate', value=today.isoformat()))
                                db.session.commit()
                                app.logger.info("[scheduler] Triggering teammate final digests...")
                                _send_teammate_finals(app, today)

                        # 3. Manager Digest
                        if get_setting('emailManagerDigestEnabled', 'NO').upper() == 'YES':
                            mgr_time = get_setting('emailManagerDigestTime', '19:00')
                            last_run = get_setting('lastEmailManagerDigestDate', '')
                            if cur_hh_mm >= mgr_time and last_run != today.isoformat():
                                setting = AppSetting.query.filter_by(key='lastEmailManagerDigestDate').first()
                                if setting: setting.value = today.isoformat()
                                else: db.session.add(AppSetting(key='lastEmailManagerDigestDate', value=today.isoformat()))
                                db.session.commit()
                                app.logger.info("[scheduler] Triggering manager digests...")
                                _send_manager_digests(app, today)

                        # 4. Leader Digest
                        if get_setting('emailLeaderDigestEnabled', 'NO').upper() == 'YES':
                            ldr_time = get_setting('emailLeaderDigestTime', '20:00')
                            last_run = get_setting('lastEmailLeaderDigestDate', '')
                            if cur_hh_mm >= ldr_time and last_run != today.isoformat():
                                setting = AppSetting.query.filter_by(key='lastEmailLeaderDigestDate').first()
                                if setting: setting.value = today.isoformat()
                                else: db.session.add(AppSetting(key='lastEmailLeaderDigestDate', value=today.isoformat()))
                                db.session.commit()
                                app.logger.info("[scheduler] Triggering leader digests...")
                                _send_leader_digests(app, today)
            except Exception as e:
                try:
                    from app import db
                    db.session.rollback()
                    db.session.remove()
                except Exception:
                    pass
                app.logger.warning("[scheduler] tick failed: %s", e)

        # Every 5 minutes is a sweet spot: frequent enough that deadline-window
        # alerts (±30 min) catch their target, infrequent enough not to thrash
        # the database. Adjust via the SCHEDULER_TICK_MINUTES env var if needed.
        import os
        tick_min = int(os.environ.get('SCHEDULER_TICK_MINUTES', '5'))
        sched.add_job(_tick, 'interval', minutes=tick_min,
                      next_run_time=datetime.now(IST), id='active-reminders',
                      max_instances=1, coalesce=True)
        sched.start()
        app.logger.info("[scheduler] active reminders started (every %d min)", tick_min)
        _scheduler = sched
        return sched


def _scan_and_notify(socketio):
    """One pass: walk all active users, decide who needs which notifications."""
    from app import db
    from app.models import User, Notification, Report, MasterLog
    from app.routes.tasks import (
        _get_mis_tasks, _get_du_tasks, _get_report_group_tasks,
        _filter_tasks_for_user, should_fire_with_override,
        _load_override_index,
    )
    from app.models import TaskTemplate

    now = datetime.now(IST)
    today = now.date()
    cur_hh_mm = now.strftime('%H:%M')
    weekend = today.weekday() >= 5

    users = User.query.filter_by(active=True).all()
    if not users:
        return

    # Pre-fetch shared state once per tick — saves per-user N+1 cost.
    override_index = _load_override_index(today)
    all_templates = TaskTemplate.query.all()
    reports_by_name = {r.name: r for r in Report.query.all()}

    for user in users:
        try:
            # Today's already-submitted logs, indexed for O(1) status lookup.
            logs = MasterLog.query.filter_by(
                on_behalf_of_email=user.email,
                entry_date=today,
                row_status='Active',
            ).all()
            log_index = {(l.entry_type, l.topic, l.sub_topic or ''): l for l in logs}

            pending_items = []   # (entry_type, topic, label) — what's still open

            if not weekend:
                # Templates
                for t in _filter_tasks_for_user(all_templates, user, on_date=today):
                    if not should_fire_with_override(
                            'TaskTemplate', t.name, '',
                            t.recurrence, getattr(t, 'schedule_day', '') or '',
                            today, override_index):
                        continue
                    log = log_index.get(('Task', t.name, ''))
                    if not log or log.status not in ('Done', 'Skip'):
                        pending_items.append(('Task', t.name, t.name))

                # MIS reports — also drive deadline-approaching / overdue alerts
                for m in _get_mis_tasks(user, today):
                    rpt_name = m.get('name', '')
                    if m.get('status') not in ('Done', 'Skip'):
                        pending_items.append(('MISReport', rpt_name, f"MIS: {rpt_name}"))
                        # Deadline check (Report.deadline is 'HH:MM')
                        rep = reports_by_name.get(rpt_name)
                        if rep and rep.deadline:
                            _check_deadline(socketio, user, rpt_name, rep.deadline,
                                            cur_hh_mm, today)

                # Factor (DU) tasks — count incomplete sub-rows
                for g in _get_du_tasks(user, today):
                    base = f"{g.get('commodity', '')}::{g.get('type', '')}"
                    pending_factors = [f for f in g.get('factors', []) if f.get('status') != 'Done']
                    if pending_factors:
                        pending_items.append(('DataUpdate', base,
                                              f"Data Update: {g.get('commodity', '')} — {g.get('type', '')}"))

                # Report Groups
                for gr in _get_report_group_tasks(user, today):
                    pending_items.append(('ReportGroup', gr.get('name', ''), gr.get('name', '')))

            # ── Morning kickoff: one notification per day if anything is pending ──
            if pending_items and cur_hh_mm >= '09:00':
                title = f"You have {len(pending_items)} task{'s' if len(pending_items) != 1 else ''} due today"
                _emit_if_new(socketio, user.email, 'info', title,
                             ', '.join(p[2] for p in pending_items[:6]),
                             link='#tasks', dedup_date=today)
        except Exception as e:
            # One user blowing up shouldn't sink the whole tick.
            from flask import current_app
            current_app.logger.warning("[scheduler] user=%s skipped: %s", user.email, e)
            continue

    # Commit any new notification rows created across all users.
    db.session.commit()


def _check_deadline(socketio, user, report_name, deadline_hhmm, cur_hh_mm, today):
    """Emit deadline-approaching (within 30 min) and overdue alerts for a report."""
    try:
        from datetime import datetime as _dt
        dl = _dt.strptime(deadline_hhmm, '%H:%M').time()
        cur = _dt.strptime(cur_hh_mm, '%H:%M').time()
    except (ValueError, TypeError):
        return

    # Compare as minutes-since-midnight so we can do simple arithmetic.
    dl_min = dl.hour * 60 + dl.minute
    cur_min = cur.hour * 60 + cur.minute
    delta = dl_min - cur_min

    if 0 < delta <= 30:
        # Approaching window: 0-30 min before deadline.
        _emit_if_new(socketio, user.email, 'warning',
                     f"Deadline in {delta} min: {report_name}",
                     f"Submit before {deadline_hhmm}",
                     link='#mis', dedup_date=today)
    elif delta < 0:
        # Overdue.
        _emit_if_new(socketio, user.email, 'error',
                     f"Overdue: {report_name}",
                     f"Deadline was {deadline_hhmm}",
                     link='#mis', dedup_date=today)


def _emit_if_new(socketio, user_email, ntype, title, message, link='', dedup_date=None):
    """Create a Notification row if no row with the same title was created for
    this user today, then emit a socket event so the active session gets a
    real-time toast / badge bump.
    """
    from app import db
    from app.models import Notification
    if dedup_date is None:
        dedup_date = date.today()

    day_start = datetime.combine(dedup_date, datetime.min.time())
    day_end = day_start + timedelta(days=1)
    existing = Notification.query.filter(
        Notification.user_email == user_email,
        Notification.title == title,
        Notification.created_at >= day_start,
        Notification.created_at < day_end,
    ).first()
    if existing:
        return  # already sent today — do not duplicate

    n = Notification(
        user_email=user_email,
        type=ntype,
        title=title,
        message=message,
        link=link,
        read=False,
    )
    db.session.add(n)
    db.session.flush()  # get n.id without full commit

    # Push to the user's personal room so the live session picks it up.
    try:
        socketio.emit('notification', {
            'id': n.id,
            'type': ntype,
            'title': title,
            'message': message,
            'link': link,
        }, room=user_email)
    except Exception:
        pass  # socket emit failures are non-fatal; the row is persisted


def _get_user_daily_summary(user, today):
    from app.models import MasterLog, TaskTemplate, Report
    from app.routes.tasks import (
        _get_mis_tasks, _get_du_tasks, _get_report_group_tasks,
        _filter_tasks_for_user, should_fire_with_override,
        _load_override_index,
    )
    from app.services.email_service import get_setting

    override_index = _load_override_index(today)
    all_templates = TaskTemplate.query.all()

    weekend = today.weekday() >= 5
    skip_weekends_val = get_setting('skipWeekends', 'YES').upper()
    is_holiday = weekend and (skip_weekends_val == 'YES')

    logs = MasterLog.query.filter_by(
        on_behalf_of_email=user.email,
        entry_date=today,
        row_status='Active',
    ).all()
    log_index = {(l.entry_type, l.topic, l.sub_topic or ''): l for l in logs}

    done_list = []
    pending_list = []
    skip_list = []

    def add_item(entry_type, topic, sub_topic, label):
        log = log_index.get((entry_type, topic, sub_topic))
        status = log.status if log else 'Pending'
        remarks = log.remarks if log else ''
        item = {
            'type': entry_type,
            'topic': topic,
            'sub_topic': sub_topic,
            'label': label,
            'status': status,
            'remarks': remarks
        }
        if status == 'Done':
            done_list.append(item)
        elif status == 'Skip':
            skip_list.append(item)
        else:
            pending_list.append(item)

    fired_template_topics = set()
    if not is_holiday:
        # Templates
        for t in _filter_tasks_for_user(all_templates, user, on_date=today):
            if not should_fire_with_override(
                    'TaskTemplate', t.name, '',
                    t.recurrence, getattr(t, 'schedule_day', '') or '',
                    today, override_index):
                continue
            fired_template_topics.add(t.name)
            add_item('Task', t.name, '', t.name)

        # MIS reports
        for m in _get_mis_tasks(user, today):
            rpt_name = m.get('name', '')
            add_item('MISReport', rpt_name, '', f"MIS Report: {rpt_name}")

        # Factor (DU) tasks
        for g in _get_du_tasks(user, today):
            base = f"{g.get('commodity', '')}::{g.get('type', '')}"
            for f in g.get('factors', []):
                factor_name = f.get('factor', '')
                add_item('DataUpdate', base, factor_name, f"DU: {g.get('commodity', '')} — {factor_name}")

        # Report Groups
        for gr in _get_report_group_tasks(user, today):
            group_name = gr.get('name', '')
            add_item('ReportGroup', group_name, '', f"Merged Report: {group_name}")

    # Add ad-hoc tasks
    for l in logs:
        if l.entry_type == 'Task' and l.topic not in fired_template_topics:
            add_item('Task', l.topic, '', l.topic)

    total = len(done_list) + len(pending_list) + len(skip_list)
    score = round((len(done_list) / total) * 100) if total > 0 else 100

    return {
        'done': done_list,
        'pending': pending_list,
        'skip': skip_list,
        'total': total,
        'score': score,
        'is_holiday': is_holiday
    }


def _send_teammate_reminders(app, today, force=False, target_email=None):
    from app.models import User
    from app.services.email_service import send_email, build_reminder_email_html, get_setting
    from sqlalchemy import or_, and_
    
    if target_email:
        users = User.query.filter(User.email.ilike(target_email.strip())).all()
    else:
        target_roles = [r.strip() for r in get_setting('emailTeammateTargetRoles', 'Teammate').split(',') if r.strip() and r.strip() == 'Teammate']
        target_emails = [e.strip().lower() for e in get_setting('emailTeammateTargetEmails', '').split(',') if e.strip()]
        conds = []
        if target_roles: conds.append(and_(User.active == True, User.role.in_(target_roles)))
        if target_emails: conds.append(User.email.in_(target_emails))
        if conds:
            users = User.query.filter(or_(*conds)).all()
        else:
            users = User.query.filter(User.active == True, User.role == 'Teammate').all()
            
        excluded_emails = [e.strip().lower() for e in get_setting('emailTeammateReminderExcludedEmails', '').split(',') if e.strip()]
        if excluded_emails:
            users = [u for u in users if u.email.lower() not in excluded_emails]
        
    date_str = today.strftime('%B %d, %Y')
    
    for user in users:
        summary = _get_user_daily_summary(user, today)
        if summary['is_holiday'] and summary['total'] == 0:
            continue
        if len(summary['pending']) == 0:
            continue
            
        html_body = build_reminder_email_html(user, date_str, summary)
        subject_tmpl = get_setting('emailTeammateReminderSubject', "⏰ Daily MIS Task Reminder — {user_name} ({pending_count} Pending)")
        subject = subject_tmpl.format(user_name=user.name, pending_count=len(summary['pending']), date_str=date_str)
        send_email([user.email], subject, html_body, force=force)


def _send_teammate_finals(app, today, force=False, target_email=None):
    from app.models import User
    from app.services.email_service import send_email, build_daily_digest_html, get_setting
    from sqlalchemy import or_, and_
    
    if target_email:
        users = User.query.filter(User.email.ilike(target_email.strip())).all()
    else:
        target_roles = [r.strip() for r in get_setting('emailTeammateTargetRoles', 'Teammate').split(',') if r.strip() and r.strip() == 'Teammate']
        target_emails = [e.strip().lower() for e in get_setting('emailTeammateTargetEmails', '').split(',') if e.strip()]
        conds = []
        if target_roles: conds.append(and_(User.active == True, User.role.in_(target_roles)))
        if target_emails: conds.append(User.email.in_(target_emails))
        if conds:
            users = User.query.filter(or_(*conds)).all()
        else:
            users = User.query.filter(User.active == True, User.role == 'Teammate').all()

        excluded_emails = [e.strip().lower() for e in get_setting('emailTeammateFinalExcludedEmails', '').split(',') if e.strip()]
        if excluded_emails:
            users = [u for u in users if u.email.lower() not in excluded_emails]

    date_str = today.strftime('%B %d, %Y')
    
    for user in users:
        summary = _get_user_daily_summary(user, today)
        if summary['is_holiday'] and summary['total'] == 0:
            continue
            
        html_body = build_daily_digest_html(user, date_str, summary)
        subject_tmpl = get_setting('emailTeammateSubject', "Daily MIS Task Summary: Final Update — {user_name} ({score}% Done)")
        subject = subject_tmpl.format(user_name=user.name, score=summary['score'], date_str=date_str)
        send_email([user.email], subject, html_body, force=force)


def _send_manager_digests(app, today, force=False, target_email=None):
    from app.models import User
    from app.services.email_service import send_email, build_manager_digest_html, get_setting
    from sqlalchemy import or_
    
    teammates = User.query.filter(User.active == True, User.role == 'Teammate').all()
    date_str = today.strftime('%B %d, %Y')
    
    summaries = []
    for user in teammates:
        summary = _get_user_daily_summary(user, today)
        if summary['is_holiday'] and summary['total'] == 0:
            continue
        summaries.append({
            'name': user.name,
            'email': user.email,
            'department': user.department,
            'done': summary['done'],
            'pending': summary['pending'],
            'skip': summary['skip'],
            'total': summary['total'],
            'score': summary['score']
        })
        
    if not summaries:
        return
        
    html_body = build_manager_digest_html(date_str, summaries)
    
    if target_email:
        recipients = [target_email.strip().lower()]
    else:
        target_roles = [r.strip() for r in get_setting('emailManagerTargetRoles', 'Manager,SuperAdmin').split(',') if r.strip()]
        target_emails = [e.strip().lower() for e in get_setting('emailManagerTargetEmails', '').split(',') if e.strip()]
        conds = []
        if target_roles: conds.append(User.role.in_(target_roles))
        if target_emails: conds.append(User.email.in_(target_emails))
        if conds:
            managers = User.query.filter(User.active == True, or_(*conds)).all()
        else:
            managers = User.query.filter(User.active == True, User.role.in_(['Manager', 'SuperAdmin'])).all()
        recipients = list(set(m.email.lower() for m in managers))
        
        global_mgr = get_setting('managerEmail').strip()
        if global_mgr:
            recipients.append(global_mgr.lower())
            
        excluded_emails = [e.strip().lower() for e in get_setting('emailManagerDigestExcludedEmails', '').split(',') if e.strip()]
        recipients = list(set(r for r in recipients if r.lower() not in excluded_emails))
    
    if not recipients:
        return
        
    subject_tmpl = get_setting('emailManagerSubject', "MIS Daily Manager Digest — {date_str}")
    subject = subject_tmpl.format(date_str=date_str)
    send_email(recipients, subject, html_body, force=force)


def _send_leader_digests(app, today, force=False, target_email=None):
    from app.models import User
    from app.services.email_service import send_email, build_leader_digest_html, get_setting
    from sqlalchemy import or_
    
    teammates = User.query.filter(User.active == True, User.role == 'Teammate').all()
    date_str = today.strftime('%B %d, %Y')
    
    teammates_tasks = []
    for user in teammates:
        summary = _get_user_daily_summary(user, today)
        if summary['is_holiday'] and summary['total'] == 0:
            continue
        teammates_tasks.append({
            'name': user.name,
            'email': user.email,
            'department': user.department,
            'score': summary['score'],
            'done': summary['done'],
            'pending': summary['pending'],
            'skip': summary['skip']
        })
        
    if not teammates_tasks:
        return
        
    html_body = build_leader_digest_html(date_str, teammates_tasks)
    
    if target_email:
        recipients = [target_email.strip().lower()]
    else:
        target_roles = [r.strip() for r in get_setting('emailLeaderTargetRoles', 'Leader').split(',') if r.strip()]
        target_emails = [e.strip().lower() for e in get_setting('emailLeaderTargetEmails', '').split(',') if e.strip()]
        conds = []
        if target_roles: conds.append(User.role.in_(target_roles))
        if target_emails: conds.append(User.email.in_(target_emails))
        if conds:
            leaders = User.query.filter(User.active == True, or_(*conds)).all()
        else:
            leaders = User.query.filter(User.active == True, User.role == 'Leader').all()
        recipients = list(set(l.email.lower() for l in leaders))
        
        excluded_emails = [e.strip().lower() for e in get_setting('emailLeaderDigestExcludedEmails', '').split(',') if e.strip()]
        recipients = list(set(r for r in recipients if r.lower() not in excluded_emails))
    
    if not recipients:
        return
        
    subject_tmpl = get_setting('emailLeaderSubject', "MIS Research Team Daily Summary — {date_str}")
    subject = subject_tmpl.format(date_str=date_str)
    send_email(recipients, subject, html_body, force=force)


def _send_daily_digests(app, today):
    """Fallback/compatibility daily digest runner."""
    _send_teammate_finals(app, today)
