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

        sched = BackgroundScheduler(daemon=True, timezone='Asia/Kolkata')

        def _tick():
            try:
                with app.app_context():
                    _scan_and_notify(socketio)
            except Exception as e:
                app.logger.exception("[scheduler] tick failed: %s", e)

        # Every 5 minutes is a sweet spot: frequent enough that deadline-window
        # alerts (±30 min) catch their target, infrequent enough not to thrash
        # the database. Adjust via the SCHEDULER_TICK_MINUTES env var if needed.
        import os
        tick_min = int(os.environ.get('SCHEDULER_TICK_MINUTES', '5'))
        sched.add_job(_tick, 'interval', minutes=tick_min,
                      next_run_time=datetime.now(), id='active-reminders',
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

    now = datetime.now()
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
