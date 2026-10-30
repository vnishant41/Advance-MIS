"""
Email Service — Handles rendering and sending daily HTML digests via SMTP.
"""
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.models import AppSetting, User
from flask import current_app

ENV_KEY_MAP = {
    'smtpHost': 'SMTP_HOST',
    'smtpPort': 'SMTP_PORT',
    'smtpUser': 'SMTP_USER',
    'smtpPassword': 'SMTP_PASSWORD',
    'smtpFrom': 'SMTP_FROM',
}

def get_setting(key, default=''):
    s = AppSetting.query.filter_by(key=key).first()
    if s and s.value and s.value.strip():
        return s.value.strip()
    env_var = ENV_KEY_MAP.get(key)
    if env_var:
        env_val = os.getenv(env_var)
        if env_val and env_val.strip():
            return env_val.strip()
    return default

def send_email(to_emails, subject, html_body, force=False):
    """Send an HTML email using SMTP settings from database with strict recipient double-check."""
    master = get_setting('emailDigestEnabled', 'NO').upper() == 'YES'
    if not master and not force:
        current_app.logger.info("[email_service] Email sending is disabled (Global Email Master Switch is set to NO)")
        return False

    # Double-check recipient format and validity
    if isinstance(to_emails, str):
        to_list = [e.strip() for e in to_emails.split(',') if e.strip()]
    elif isinstance(to_emails, (list, set, tuple)):
        to_list = [str(e).strip() for e in to_emails if str(e).strip()]
    else:
        to_list = []

    # Filter and double-check valid email addresses
    valid_recipients = [e for e in to_list if '@' in e and '.' in e.split('@')[-1]]
    if not valid_recipients:
        current_app.logger.warning("[email_service] Double-check failed: No valid recipient email addresses specified (%s)", to_emails)
        return False

    host = get_setting('smtpHost')
    port = get_setting('smtpPort', '587')
    user = get_setting('smtpUser')
    password = get_setting('smtpPassword')
    from_addr = get_setting('smtpFrom', user)

    if not host or not port:
        current_app.logger.warning("[email_service] SMTP configuration missing host or port")
        return False

    to_str = ', '.join(valid_recipients)
    recipients = valid_recipients

    from app import db
    from app.models import EmailLog

    log_entry = EmailLog(
        recipient=to_str,
        subject=subject,
        body=html_body,
        status='Pending'
    )
    db.session.add(log_entry)
    db.session.commit()

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = from_addr
        msg['To'] = to_str

        part = MIMEText(html_body, 'html')
        msg.attach(part)

        port_int = int(port)
        if port_int == 465:
            server = smtplib.SMTP_SSL(host, port_int, timeout=15)
        else:
            server = smtplib.SMTP(host, port_int, timeout=15)
            server.ehlo()
            if server.has_extn('STARTTLS'):
                server.starttls()
                server.ehlo()

        if user and password:
            server.login(user, password)

        server.sendmail(from_addr, recipients, msg.as_string())
        server.quit()
        current_app.logger.info("[email_service] Email sent successfully to %s", to_str)
        
        log_entry.status = 'Success'
        db.session.commit()
        return True
    except Exception as e:
        current_app.logger.exception("[email_service] Failed to send email to %s: %s", to_emails, e)
        log_entry.status = 'Failed'
        log_entry.error_message = str(e)
        db.session.commit()
        return False

def build_todays_live_updates_html(recipient_email=None, is_test=False):
    """Build a rich, executive HTML report containing all of today's updates till now."""
    from datetime import date, datetime
    from app.models import MasterLog, User, AppSetting
    from app import db

    today = date.today()
    date_str = datetime.now().strftime("%A, %B %d, %Y at %I:%M %p")

    # Query all MasterLog entries submitted today
    logs_today = MasterLog.query.filter(
        MasterLog.entry_date == today,
        MasterLog.row_status != 'Amended'
    ).order_by(MasterLog.timestamp_submitted.desc()).all()

    done_count = sum(1 for l in logs_today if l.status == 'Done')
    pending_count = sum(1 for l in logs_today if l.status == 'Pending')
    skip_count = sum(1 for l in logs_today if l.status == 'Skip')

    # Total active teammates
    teammates = User.query.filter(User.role == 'Teammate', User.active == True).all()

    # Build Teammate Progress Rows for Today
    teammate_rows_html = ""
    for t in teammates:
        user_logs = [l for l in logs_today if (l.on_behalf_of_email or '').lower() == t.email.lower()]
        t_done = sum(1 for l in user_logs if l.status == 'Done')
        t_pending = sum(1 for l in user_logs if l.status == 'Pending')
        t_skip = sum(1 for l in user_logs if l.status == 'Skip')
        t_total = t_done + t_pending + t_skip
        t_rate = round((t_done / t_total * 100)) if t_total > 0 else (100 if t_done > 0 else 0)
        
        badge_color = "#10B981" if t_rate >= 80 else ("#F59E0B" if t_rate >= 50 else "#EF4444")
        
        teammate_rows_html += f"""
        <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px; font-weight: 600; color: #1e293b; font-size: 13px;">{t.name}</td>
            <td style="padding: 10px 12px; color: #64748b; font-size: 12px;">{t.department or 'Research'}</td>
            <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #10b981; font-size: 13px;">{t_done}</td>
            <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #f59e0b; font-size: 13px;">{t_pending}</td>
            <td style="padding: 10px 12px; text-align: center;">
                <span style="background-color: {badge_color}18; color: {badge_color}; padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 12px;">{t_rate}%</span>
            </td>
        </tr>
        """

    if not teammate_rows_html:
        teammate_rows_html = '<tr><td colspan="5" style="padding: 12px; text-align: center; color: #94a3b8; font-size: 12px;">No active teammates found.</td></tr>'

    # Build Recent Live Logs Table for Today
    log_rows_html = ""
    for l in logs_today[:15]: # Show top 15 submitted today
        submitted_at = l.timestamp_submitted.strftime("%I:%M %p") if l.timestamp_submitted else "Today"
        status_style = "background-color: #ecfdf5; color: #10b981;" if l.status == 'Done' else ("background-color: #fffbeb; color: #f59e0b;" if l.status == 'Pending' else "background-color: #f1f5f9; color: #64748b;")
        
        log_rows_html += f"""
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 10px; font-size: 12px; color: #64748b;">{submitted_at}</td>
            <td style="padding: 8px 10px; font-size: 12px; font-weight: 600; color: #1e293b;">{l.on_behalf_of_name or l.submitted_by_name or 'System'}</td>
            <td style="padding: 8px 10px; font-size: 12px; font-weight: 600; color: #334155;">{l.topic}{f" ({l.sub_topic})" if l.sub_topic else ""}</td>
            <td style="padding: 8px 10px; font-size: 11px; color: #4f46e5;"><span style="background-color: #e0e7ff; padding: 2px 6px; border-radius: 4px;">{l.entry_type or 'MIS'}</span></td>
            <td style="padding: 8px 10px; text-align: center;">
                <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; {status_style}">{l.status}</span>
            </td>
        </tr>
        """

    if not log_rows_html:
        log_rows_html = '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #94a3b8; font-size: 13px;">No updates submitted yet today.</td></tr>'

    test_banner_html = ""
    if is_test:
        test_banner_html = """
        <div style="background-color: #e0e7ff; border: 1px solid #c7d2fe; padding: 10px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 12px; color: #3730a3; font-weight: 600; text-align: center;">
            ⚡ SMTP Connection Successful! This live report demonstrates your active email setup & live today data.
        </div>
        """

    total_submissions = len(logs_today)

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Advanced MIS — Today's Live Updates Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 680px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
        
        <!-- Header Banner -->
        <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%); color: #ffffff;">
                <table width="100%" border="0" cellpadding="0" cellspacing="0">
                    <tr>
                        <td>
                            <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff;">Advanced MIS</h1>
                            <p style="margin: 4px 0 0 0; font-size: 13px; color: #a5b4fc; font-weight: 500;">Today's Live Updates Report (As of Till Now)</p>
                        </td>
                        <td align="right">
                            <span style="background-color: rgba(255,255,255,0.15); color: #ffffff; padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 700;">{date_str}</span>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <tr>
            <td style="padding: 20px 24px;">
                {test_banner_html}

                <!-- Summary Cards Row -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                    <tr>
                        <td width="31%" style="background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 14px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 11px; font-weight: 700; color: #047857; text-transform: uppercase;">Completed</div>
                            <div style="font-size: 24px; font-weight: 800; color: #059669; margin-top: 2px;">{done_count}</div>
                        </td>
                        <td width="3.5%"></td>
                        <td width="31%" style="background-color: #fffbeb; border: 1px solid #fde68a; padding: 14px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 11px; font-weight: 700; color: #b45309; text-transform: uppercase;">Pending</div>
                            <div style="font-size: 24px; font-weight: 800; color: #d97706; margin-top: 2px;">{pending_count}</div>
                        </td>
                        <td width="3.5%"></td>
                        <td width="31%" style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 14px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 11px; font-weight: 700; color: #0369a1; text-transform: uppercase;">Total Submitted</div>
                            <div style="font-size: 24px; font-weight: 800; color: #0284c7; margin-top: 2px;">{total_submissions}</div>
                        </td>
                    </tr>
                </table>

                <!-- Teammates Progress Summary -->
                <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 10px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
                    👥 Teammates Live Progress Today
                </h3>
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                            <th align="left" style="padding: 8px 12px; font-size: 11px; color: #64748b; text-transform: uppercase;">Teammate</th>
                            <th align="left" style="padding: 8px 12px; font-size: 11px; color: #64748b; text-transform: uppercase;">Department</th>
                            <th align="center" style="padding: 8px 12px; font-size: 11px; color: #64748b; text-transform: uppercase;">Completed</th>
                            <th align="center" style="padding: 8px 12px; font-size: 11px; color: #64748b; text-transform: uppercase;">Pending</th>
                            <th align="center" style="padding: 8px 12px; font-size: 11px; color: #64748b; text-transform: uppercase;">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teammate_rows_html}
                    </tbody>
                </table>

                <!-- Live Submissions Stream -->
                <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 10px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
                    ⚡ Today's Live Submission Activity (Latest 15)
                </h3>
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 12px; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                            <th align="left" style="padding: 8px 10px; font-size: 11px; color: #64748b; text-transform: uppercase;">Time</th>
                            <th align="left" style="padding: 8px 10px; font-size: 11px; color: #64748b; text-transform: uppercase;">Teammate</th>
                            <th align="left" style="padding: 8px 10px; font-size: 11px; color: #64748b; text-transform: uppercase;">Report / Topic</th>
                            <th align="left" style="padding: 8px 10px; font-size: 11px; color: #64748b; text-transform: uppercase;">Type</th>
                            <th align="center" style="padding: 8px 10px; font-size: 11px; color: #64748b; text-transform: uppercase;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {log_rows_html}
                    </tbody>
                </table>

            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="padding: 16px 24px; background-color: #f8fafc; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; font-size: 11px; color: #94a3b8;">Advanced MIS Research Team Management Hub &bull; Automated Live Status Report</p>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return html


def build_daily_digest_html(user, date_str, summary):
    """Build a premium HTML template for the daily task digest."""
    score = summary['score']
    custom_note = get_setting('emailTeammateFinalBodyTmpl', '').strip()
    custom_html = f'<div style="background-color: #F8FAFC; border-left: 4px solid #4F46E5; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; color: #1E293B; line-height: 1.5;">{custom_note}</div>' if custom_note else ''
    
    if score >= 80:
        score_color = '#10B981'
        score_bg = '#ECFDF5'
        score_border = '#A7F3D0'
    elif score >= 50:
        score_color = '#F59E0B'
        score_bg = '#FFFBEB'
        score_border = '#FDE68A'
    else:
        score_color = '#EF4444'
        score_bg = '#FEF2F2'
        score_border = '#FECACA'

    done_count = len(summary.get('done', []))
    pending_count = len(summary.get('pending', []))
    skip_count = len(summary.get('skip', []))
    total_count = summary.get('total', 0)

    # Build done list HTML
    done_items_html = ''
    if summary.get('done'):
        done_items_html = '<div style="margin-bottom: 20px;">'
        done_items_html += f'<h3 style="color: #059669; font-size: 13px; font-weight: 800; text-transform: uppercase; margin-bottom: 10px; border-bottom: 2px solid #ECFDF5; padding-bottom: 6px; letter-spacing: 0.5px;">✓ Completed Tasks ({done_count})</h3>'
        for item in summary['done']:
            remark_html = f'<div style="font-size: 11px; color: #64748B; font-style: italic; margin-top: 3px;">Note: {item["remarks"]}</div>' if item['remarks'] else ''
            done_items_html += f"""
            <div style="padding: 10px 14px; background-color: #F8FAFC; border-left: 4px solid #10B981; border-radius: 6px; margin-bottom: 8px;">
                <div style="font-weight: 700; font-size: 13px; color: #1E293B;">{item['label']}</div>
                {remark_html}
            </div>"""
        done_items_html += '</div>'

    # Build pending list HTML
    pending_items_html = ''
    if summary.get('pending'):
        pending_items_html = '<div style="margin-bottom: 20px;">'
        pending_items_html += f'<h3 style="color: #D97706; font-size: 13px; font-weight: 800; text-transform: uppercase; margin-bottom: 10px; border-bottom: 2px solid #FFFBEB; padding-bottom: 6px; letter-spacing: 0.5px;">⚠ Pending Tasks ({pending_count})</h3>'
        for item in summary['pending']:
            remark_html = f'<div style="font-size: 11px; color: #64748B; font-style: italic; margin-top: 3px;">Note: {item["remarks"]}</div>' if item['remarks'] else ''
            pending_items_html += f"""
            <div style="padding: 10px 14px; background-color: #FFFBEB; border-left: 4px solid #F59E0B; border-radius: 6px; margin-bottom: 8px;">
                <div style="font-weight: 700; font-size: 13px; color: #78350F;">{item['label']}</div>
                {remark_html}
            </div>"""
        pending_items_html += '</div>'

    # Build skip list HTML
    skip_items_html = ''
    if summary.get('skip'):
        skip_items_html = '<div style="margin-bottom: 20px;">'
        skip_items_html += f'<h3 style="color: #64748B; font-size: 13px; font-weight: 800; text-transform: uppercase; margin-bottom: 10px; border-bottom: 2px solid #F1F5F9; padding-bottom: 6px; letter-spacing: 0.5px;">↩ Skipped Tasks ({skip_count})</h3>'
        for item in summary['skip']:
            remark_html = f'<div style="font-size: 11px; color: #64748B; font-style: italic; margin-top: 3px;">Reason: {item["remarks"]}</div>' if item['remarks'] else ''
            skip_items_html += f"""
            <div style="padding: 10px 14px; background-color: #F8FAFC; border-left: 4px solid #94A3B8; border-radius: 6px; margin-bottom: 8px;">
                <div style="font-weight: 700; font-size: 13px; color: #334155;">{item['label']}</div>
                {remark_html}
            </div>"""
        skip_items_html += '</div>'

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily MIS Report Update</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); border: 1px solid #E2E8F0;">
        <!-- Header -->
        <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #1E1B4B 0%, #312E81 60%, #4338CA 100%); color: #FFFFFF;">
                <table width="100%" border="0" cellpadding="0" cellspacing="0">
                    <tr>
                        <td>
                            <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; color: #FFFFFF;">Advanced MIS</h1>
                            <p style="margin: 4px 0 0 0; font-size: 13px; color: #A5B4FC; font-weight: 500;">Daily Task Summary & Score Update</p>
                        </td>
                        <td align="right">
                            <span style="background-color: rgba(255,255,255,0.15); color: #FFFFFF; padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 700;">{date_str}</span>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        
        <!-- Summary Dashboard Card -->
        <tr>
            <td style="padding: 24px 24px 12px 24px;">
                {custom_html}
                <div style="background-color: {score_bg}; border: 1px solid {score_border}; padding: 18px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.8px;">Daily Completion Score</div>
                    <div style="font-size: 36px; font-weight: 900; color: {score_color}; margin: 4px 0;">{score}%</div>
                    <div style="max-width: 280px; margin: 8px auto 0 auto; height: 8px; background-color: #E2E8F0; border-radius: 4px; overflow: hidden;">
                        <div style="width: {score}%; height: 100%; background-color: {score_color}; border-radius: 4px;"></div>
                    </div>
                </div>
            </td>
        </tr>

        <!-- User Information -->
        <tr>
            <td style="padding: 12px 24px;">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="font-size: 12px; color: #475569; background-color: #F8FAFC; padding: 12px 16px; border-radius: 8px; border: 1px solid #E2E8F0;">
                    <tr>
                        <td><strong>Team Member:</strong> {user.name} ({user.email})</td>
                        <td align="right"><strong>Department:</strong> {user.department or 'Research'}</td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Tasks Content -->
        <tr>
            <td style="padding: 12px 24px 24px 24px;">
                {done_items_html}
                {pending_items_html}
                {skip_items_html}
                
                {f'<div style="text-align: center; padding: 24px; color: #64748B; font-size: 13px; font-style: italic; background-color: #F8FAFC; border-radius: 8px;">No tasks scheduled or due for today.</div>' if not done_items_html and not pending_items_html and not skip_items_html else ''}
            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="padding: 20px 24px; background-color: #F8FAFC; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0;">
                <p style="margin: 0 0 6px 0;">This email is an automated final digest from the Advanced MIS system.</p>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return html


def build_reminder_email_html(user, date_str, summary):
    """HTML email for daily pending tasks reminder."""
    pending_tasks = summary.get('pending', [])
    pending_count = len(pending_tasks)
    custom_note = get_setting('emailTeammateReminderBodyTmpl', '').strip()
    custom_html = f'<div style="background-color: #FFFBEB; border-left: 4px solid #D97706; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; color: #78350F; line-height: 1.5;">{custom_note}</div>' if custom_note else ''
    
    tasks_html = ''
    for item in pending_tasks:
        tasks_html += f"""
        <div style="padding: 12px 16px; background-color: #FFFBEB; border-left: 4px solid #F59E0B; border-radius: 6px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
            <div style="font-weight: 700; font-size: 13px; color: #78350F;">{item['label']}</div>
            <div style="font-size: 11px; color: #B45309; margin-top: 3px; font-weight: 600;">Status: Pending Update</div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MIS Pending Tasks Reminder</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); border: 1px solid #E2E8F0;">
        <!-- Header -->
        <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #D97706 0%, #B45309 100%); text-align: center; color: #FFFFFF;">
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">⏰ Daily MIS Task Reminder</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">{date_str}</p>
            </td>
        </tr>
        <!-- Content -->
        <tr>
            <td style="padding: 24px;">
                {custom_html}
                <p style="font-size: 14px; color: #334155; margin-top: 0; line-height: 1.5;">Hi <strong>{user.name}</strong>,</p>
                <p style="font-size: 14px; color: #334155; line-height: 1.5;">This is a friendly reminder that you have <strong>{pending_count} pending task{'s' if pending_count != 1 else ''}</strong> remaining for today in the MIS portal. Please update them at your earliest convenience.</p>
                
                <h3 style="color: #1E293B; font-size: 13px; font-weight: 800; text-transform: uppercase; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #FEF3C7; padding-bottom: 6px; letter-spacing: 0.5px;">📋 Remaining Pending Tasks ({pending_count})</h3>
                {tasks_html if pending_tasks else '<div style="text-align: center; color: #059669; font-weight: 700; padding: 20px; font-size: 13px; background-color: #ECFDF5; border-radius: 8px;">✓ Excellent! You have completed all scheduled tasks for today.</div>'}
                
            </td>
        </tr>
        <!-- Footer -->
        <tr>
            <td style="padding: 20px 24px; background-color: #F8FAFC; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0;">
                <p style="margin: 0;">This is an automated pending task reminder from the Advanced MIS platform.</p>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return html


def build_manager_digest_html(date_str, summaries):
    """HTML email for managers showing overall summary matrix at top and detailed teammate-wise task breakdown below."""
    rows_html = ''
    cards_html = ''
    total_score = 0
    valid_count = 0
    total_done_all = 0
    total_pending_all = 0
    custom_note = get_setting('emailManagerDigestBodyTmpl', '').strip()
    custom_html = f'<div style="background-color: #F8FAFC; border-left: 4px solid #4F46E5; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; color: #1E293B; line-height: 1.5;">{custom_note}</div>' if custom_note else ''
    
    for s in summaries:
        score = s['score']
        total_score += score
        valid_count += 1

        done_list = s['done'] if isinstance(s['done'], list) else []
        pending_list = s['pending'] if isinstance(s['pending'], list) else []
        skip_list = s['skip'] if isinstance(s['skip'], list) else []

        done_cnt = len(done_list) if isinstance(s['done'], list) else s['done']
        pending_cnt = len(pending_list) if isinstance(s['pending'], list) else s['pending']
        skip_cnt = len(skip_list) if isinstance(s['skip'], list) else s['skip']
        tot_cnt = s.get('total', done_cnt + pending_cnt + skip_cnt)

        total_done_all += done_cnt
        total_pending_all += pending_cnt
        
        score_color = '#10B981' if score >= 80 else ('#F59E0B' if score >= 50 else '#EF4444')
        border_color = score_color

        rows_html += f"""
        <tr style="border-bottom: 1px solid #F1F5F9;">
            <td style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: #1E293B;">{s['name']}<br><span style="font-size: 11px; color: #64748B; font-weight: normal;">{s['email']}</span></td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 800; color: {score_color}; font-size: 13px;">{score}% Done</td>
        </tr>"""

        # Detailed card for teammate
        done_items = ''
        if done_list:
            done_items = '<div style="margin-top:8px; font-weight:800; font-size:11px; color:#10B981; text-transform:uppercase; letter-spacing:0.5px;">✓ Completed</div>'
            for item in done_list:
                remark = f'<div style="font-size:11px; color:#64748B; font-style:italic; margin-top:2px;">Note: {item["remarks"]}</div>' if item.get('remarks') else ''
                done_items += f"""
                <div style="font-size:12px; color:#1E293B; padding:5px 0; border-bottom:1px solid #F1F5F9;">
                    <strong>{item.get('label', item)}</strong>
                    {remark}
                </div>"""

        pending_items = ''
        if pending_list:
            pending_items = '<div style="margin-top:8px; font-weight:800; font-size:11px; color:#F59E0B; text-transform:uppercase; letter-spacing:0.5px;">⚠ Pending</div>'
            for item in pending_list:
                remark = f'<div style="font-size:11px; color:#64748B; font-style:italic; margin-top:2px;">Note: {item["remarks"]}</div>' if item.get('remarks') else ''
                pending_items += f"""
                <div style="font-size:12px; color:#1E293B; padding:5px 0; border-bottom:1px solid #F1F5F9;">
                    <strong>{item.get('label', item)}</strong>
                    {remark}
                </div>"""

        skip_items = ''
        if skip_list:
            skip_items = '<div style="margin-top:8px; font-weight:800; font-size:11px; color:#94A3B8; text-transform:uppercase; letter-spacing:0.5px;">↩ Skipped</div>'
            for item in skip_list:
                remark = f'<div style="font-size:11px; color:#64748B; font-style:italic; margin-top:2px;">Reason: {item["remarks"]}</div>' if item.get('remarks') else ''
                skip_items += f"""
                <div style="font-size:12px; color:#334155; padding:5px 0; border-bottom:1px solid #F1F5F9;">
                    <strong>{item.get('label', item)}</strong>
                    {remark}
                </div>"""

        cards_html += f"""
        <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-left: 5px solid {border_color}; border-radius: 8px; padding: 14px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="border-bottom: 1px solid #F1F5F9; padding-bottom: 6px; margin-bottom: 8px;">
                <div style="font-size: 15px; font-weight: 900; color: {score_color}; float: right; line-height: 1.2;">{score}% Done</div>
                <strong style="font-size: 13px; color: #1E293B;">{s['name']}</strong>
                <div style="font-size: 11px; color: #64748B; margin-top: 1px;">{s['email']} · {s.get('department') or 'Operations'}</div>
                <div style="clear: both;"></div>
            </div>
            {done_items}
            {pending_items}
            {skip_items}
            {'' if done_items or pending_items or skip_items else '<div style="font-size:11px; color:#94A3B8; font-style:italic; text-align:center; padding:6px 0;">No tasks assigned today.</div>'}
        </div>"""

    avg_score = round(total_score / valid_count) if valid_count > 0 else 0
    avg_color = '#10B981' if avg_score >= 80 else ('#F59E0B' if avg_score >= 50 else '#EF4444')

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily MIS Manager Digest</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 660px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); border: 1px solid #E2E8F0;">
        <!-- Header -->
        <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #312E81 0%, #4338CA 100%); text-align: center; color: #FFFFFF;">
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">📈 Daily MIS Manager Digest</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Team-wide KPI & Completion Update · {date_str}</p>
            </td>
        </tr>
        <!-- KPI Summary Cards Row -->
        <tr>
            <td style="padding: 20px 20px 10px 20px;">
                {custom_html}
                <table width="100%" border="0" cellpadding="0" cellspacing="0">
                    <tr>
                        <td width="31%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 10px; font-weight: 800; color: #64748B; text-transform: uppercase;">Team Average Score</div>
                            <div style="font-size: 22px; font-weight: 900; color: {avg_color}; margin-top: 2px;">{avg_score}%</div>
                        </td>
                        <td width="3.5%"></td>
                        <td width="31%" style="background-color: #ECFDF5; border: 1px solid #A7F3D0; padding: 12px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase;">Total Done</div>
                            <div style="font-size: 22px; font-weight: 900; color: #059669; margin-top: 2px;">{total_done_all}</div>
                        </td>
                        <td width="3.5%"></td>
                        <td width="31%" style="background-color: #FFFBEB; border: 1px solid #FDE68A; padding: 12px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 10px; font-weight: 800; color: #B45309; text-transform: uppercase;">Total Pending</div>
                            <div style="font-size: 22px; font-weight: 900; color: #D97706; margin-top: 2px;">{total_pending_all}</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <!-- Teammate Summary Matrix Table -->
        <tr>
            <td style="padding: 10px 20px;">
                <h3 style="color: #1E293B; font-size: 12px; font-weight: 800; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.5px;">📊 Teammate Summary Matrix</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background:#FFFFFF; border-radius:8px; border:1px solid #E2E8F0; overflow:hidden;">
                    <thead>
                        <tr style="background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #475569; font-weight: bold; text-transform: uppercase; font-size: 11px;">
                            <th style="padding: 10px 12px; text-align: left; letter-spacing: 0.5px;">Teammate</th>
                            <th style="padding: 10px 12px; text-align: right; letter-spacing: 0.5px;">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html if summaries else '<tr><td colspan="2" style="text-align:center; padding:30px; color:#94A3B8; font-size: 13px;">No active teammates found today.</td></tr>'}
                    </tbody>
                </table>
            </td>
        </tr>
        <!-- Detailed Teammate-wise Task Cards -->
        <tr>
            <td style="padding: 10px 20px 20px 20px;">
                <h3 style="color: #1E293B; font-size: 12px; font-weight: 800; text-transform: uppercase; margin: 10px 0 10px 0; letter-spacing: 0.5px;">📋 Detailed Teammate Breakdown</h3>
                {cards_html if summaries else '<div style="text-align:center; padding:30px; color:#94A3B8; background:#fff; border-radius:8px; font-size: 13px;">No teammate tasks scheduled for today.</div>'}
            </td>
        </tr>
        <!-- Footer -->
        <tr>
            <td style="padding: 20px 24px; background-color: #F8FAFC; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0;">
                <p style="margin: 0;">Sent to all active Managers and Administrators.</p>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return html


def build_leader_digest_html(date_str, teammates_tasks):
    """HTML email for leaders showing summary matrix at top and detailed teammate-wise research updates below."""
    rows_html = ''
    cards_html = ''
    total_score = 0
    valid_count = 0
    total_done_all = 0
    total_pending_all = 0
    custom_note = get_setting('emailLeaderDigestBodyTmpl', '').strip()
    custom_html = f'<div style="background-color: #ECFDF5; border-left: 4px solid #059669; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; color: #065F46; line-height: 1.5;">{custom_note}</div>' if custom_note else ''
    
    for t in teammates_tasks:
        score = t['score']
        total_score += score
        valid_count += 1

        done_list = t['done'] if isinstance(t['done'], list) else []
        pending_list = t['pending'] if isinstance(t['pending'], list) else []
        skip_list = t['skip'] if isinstance(t['skip'], list) else []

        done_cnt = len(done_list) if isinstance(t['done'], list) else t['done']
        pending_cnt = len(pending_list) if isinstance(t['pending'], list) else t['pending']
        skip_cnt = len(skip_list) if isinstance(t['skip'], list) else t['skip']
        tot_cnt = t.get('total', done_cnt + pending_cnt + skip_cnt)

        total_done_all += done_cnt
        total_pending_all += pending_cnt
        
        score_color = '#10B981' if score >= 80 else ('#F59E0B' if score >= 50 else '#EF4444')
        border_color = score_color

        rows_html += f"""
        <tr style="border-bottom: 1px solid #F1F5F9;">
            <td style="padding: 10px 12px; font-weight: 600; font-size: 12px; color: #1E293B;">{t['name']}<br><span style="font-size: 10px; color: #64748B; font-weight: normal;">{t['email']}</span></td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 800; color: {score_color}; font-size: 12px;">{score}% Done</td>
        </tr>"""

        # Build detailed tasks cards
        done_items = ''
        if done_list:
            done_items = '<div style="margin-top:8px; font-weight:800; font-size:11px; color:#10B981; text-transform:uppercase; letter-spacing:0.5px;">✓ Completed</div>'
            for item in done_list:
                remark = f'<div style="font-size:11px; color:#64748B; font-style:italic; margin-top:2px;">Note: {item["remarks"]}</div>' if item.get('remarks') else ''
                done_items += f"""
                <div style="font-size:12px; color:#1E293B; padding:5px 0; border-bottom:1px solid #F1F5F9;">
                    <strong>{item.get('label', item)}</strong>
                    {remark}
                </div>"""

        pending_items = ''
        if pending_list:
            pending_items = '<div style="margin-top:8px; font-weight:800; font-size:11px; color:#F59E0B; text-transform:uppercase; letter-spacing:0.5px;">⚠ Pending</div>'
            for item in pending_list:
                remark = f'<div style="font-size:11px; color:#64748B; font-style:italic; margin-top:2px;">Note: {item["remarks"]}</div>' if item.get('remarks') else ''
                pending_items += f"""
                <div style="font-size:12px; color:#1E293B; padding:5px 0; border-bottom:1px solid #F1F5F9;">
                    <strong>{item.get('label', item)}</strong>
                    {remark}
                </div>"""

        skip_items = ''
        if skip_list:
            skip_items = '<div style="margin-top:8px; font-weight:800; font-size:11px; color:#94A3B8; text-transform:uppercase; letter-spacing:0.5px;">↩ Skipped</div>'
            for item in skip_list:
                remark = f'<div style="font-size:11px; color:#64748B; font-style:italic; margin-top:2px;">Reason: {item["remarks"]}</div>' if item.get('remarks') else ''
                skip_items += f"""
                <div style="font-size:12px; color:#334155; padding:5px 0; border-bottom:1px solid #F1F5F9;">
                    <strong>{item.get('label', item)}</strong>
                    {remark}
                </div>"""

        cards_html += f"""
        <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-left: 5px solid {border_color}; border-radius: 8px; padding: 14px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="border-bottom: 1px solid #F1F5F9; padding-bottom: 6px; margin-bottom: 8px;">
                <div style="font-size: 15px; font-weight: 900; color: {score_color}; float: right; line-height: 1.2;">{score}% Done</div>
                <strong style="font-size: 13px; color: #1E293B;">{t['name']}</strong>
                <div style="font-size: 11px; color: #64748B; margin-top: 1px;">{t['email']} · {t.get('department') or 'Research'}</div>
                <div style="clear: both;"></div>
            </div>
            
            {done_items}
            {pending_items}
            {skip_items}
            
            {'' if done_items or pending_items or skip_items else '<div style="font-size:11px; color:#94A3B8; font-style:italic; text-align:center; padding:6px 0;">No tasks assigned today.</div>'}
        </div>"""

    avg_score = round(total_score / valid_count) if valid_count > 0 else 0
    avg_color = '#10B981' if avg_score >= 80 else ('#F59E0B' if avg_score >= 50 else '#EF4444')

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Research Team Update</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 660px; background-color: #F8FAFC; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); border: 1px solid #E2E8F0;">
        <!-- Header -->
        <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #059669 0%, #047857 100%); text-align: center; color: #FFFFFF;">
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">📋 Research Team Update (Teammate-wise)</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Leader Board Summary · {date_str}</p>
            </td>
        </tr>
        <!-- Top KPI Summary Cards Row -->
        <tr>
            <td style="padding: 18px 18px 6px 18px;">
                {custom_html}
                <table width="100%" border="0" cellpadding="0" cellspacing="0">
                    <tr>
                        <td width="31%" style="background-color: #FFFFFF; border: 1px solid #E2E8F0; padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 10px; font-weight: 800; color: #64748B; text-transform: uppercase;">Team Average Score</div>
                            <div style="font-size: 20px; font-weight: 900; color: {avg_color}; margin-top: 2px;">{avg_score}%</div>
                        </td>
                        <td width="3.5%"></td>
                        <td width="31%" style="background-color: #ECFDF5; border: 1px solid #A7F3D0; padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase;">Total Done</div>
                            <div style="font-size: 20px; font-weight: 900; color: #059669; margin-top: 2px;">{total_done_all}</div>
                        </td>
                        <td width="3.5%"></td>
                        <td width="31%" style="background-color: #FFFBEB; border: 1px solid #FDE68A; padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 10px; font-weight: 800; color: #B45309; text-transform: uppercase;">Total Pending</div>
                            <div style="font-size: 20px; font-weight: 900; color: #D97706; margin-top: 2px;">{total_pending_all}</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <!-- Teammates Summary Matrix Table -->
        <tr>
            <td style="padding: 10px 18px;">
                <h3 style="color: #1E293B; font-size: 12px; font-weight: 800; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.5px;">📊 Teammate Summary Matrix</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background:#FFFFFF; border-radius:8px; border:1px solid #E2E8F0; overflow:hidden;">
                    <thead>
                        <tr style="background-color: #F1F5F9; border-bottom: 2px solid #E2E8F0; color: #475569; font-weight: bold; text-transform: uppercase; font-size: 10px;">
                            <th style="padding: 8px 12px; text-align: left;">Teammate</th>
                            <th style="padding: 8px 12px; text-align: right;">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html if teammates_tasks else '<tr><td colspan="2" style="text-align:center; padding:20px; color:#94A3B8; font-size: 12px;">No active teammates found today.</td></tr>'}
                    </tbody>
                </table>
            </td>
        </tr>
        <!-- Detailed Teammate-wise Task Cards -->
        <tr>
            <td style="padding: 10px 18px 20px 18px;">
                <h3 style="color: #1E293B; font-size: 12px; font-weight: 800; text-transform: uppercase; margin: 10px 0 10px 0; letter-spacing: 0.5px;">📋 Detailed Teammate Breakdown</h3>
                {cards_html if teammates_tasks else '<div style="text-align:center; padding:30px; color:#94A3B8; background:#fff; border-radius:8px; font-size: 13px;">No research team tasks scheduled for today.</div>'}
            </td>
        </tr>
        <!-- Footer -->
        <tr>
            <td style="padding: 20px 24px; background-color: #F8FAFC; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0;">
                <p style="margin: 0;">Sent to all active Leaders and Department Heads.</p>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return html

