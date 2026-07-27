"""
Email Service — Handles rendering and sending daily HTML digests via SMTP.
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.models import AppSetting, User
from flask import current_app

def get_setting(key, default=''):
    s = AppSetting.query.filter_by(key=key).first()
    return s.value if s else default

def send_email(to_emails, subject, html_body, force=False):
    """Send an HTML email using SMTP settings from database."""
    enabled = get_setting('emailDigestEnabled', 'NO').upper() == 'YES'
    if not enabled and not force:
        current_app.logger.info("[email_service] Email sending is disabled (emailDigestEnabled != YES)")
        return False

    host = get_setting('smtpHost')
    port = get_setting('smtpPort', '587')
    user = get_setting('smtpUser')
    password = get_setting('smtpPassword')
    from_addr = get_setting('smtpFrom', user)

    if not host or not port:
        current_app.logger.warning("[email_service] SMTP configuration missing host or port")
        return False

    if isinstance(to_emails, list):
        to_str = ', '.join(to_emails)
        recipients = to_emails
    else:
        to_str = to_emails
        recipients = [email.strip() for email in to_emails.split(',') if email.strip()]

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
    
    # Define score indicator colors
    if score >= 80:
        score_color = '#10B981'  # Green
        score_bg = '#ECFDF5'
    elif score >= 50:
        score_color = '#F59E0B'  # Amber
        score_bg = '#FFFBEB'
    else:
        score_color = '#EF4444'  # Red
        score_bg = '#FEF2F2'

    # Build done list HTML
    done_items_html = ''
    if summary['done']:
        done_items_html = '<div style="margin-bottom: 20px;">'
        done_items_html += '<h3 style="color: #10B981; font-size: 14px; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px;">✓ Completed Tasks</h3>'
        for item in summary['done']:
            remark_html = f'<div style="font-size: 11px; color: #6B7280; font-style: italic; margin-top: 2px;">Reason/Remark: {item["remarks"]}</div>' if item['remarks'] else ''
            done_items_html += f"""
            <div style="padding: 8px 12px; background-color: #F9FAFB; border-left: 3px solid #10B981; border-radius: 4px; margin-bottom: 6px;">
                <div style="font-weight: 600; font-size: 13px; color: #1F2937;">{item['label']}</div>
                {remark_html}
            </div>"""
        done_items_html += '</div>'

    # Build pending list HTML
    pending_items_html = ''
    if summary['pending']:
        pending_items_html = '<div style="margin-bottom: 20px;">'
        pending_items_html += '<h3 style="color: #F59E0B; font-size: 14px; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px;">⚠ Pending Tasks</h3>'
        for item in summary['pending']:
            remark_html = f'<div style="font-size: 11px; color: #6B7280; font-style: italic; margin-top: 2px;">Reason/Remark: {item["remarks"]}</div>' if item['remarks'] else ''
            pending_items_html += f"""
            <div style="padding: 8px 12px; background-color: #F9FAFB; border-left: 3px solid #F59E0B; border-radius: 4px; margin-bottom: 6px;">
                <div style="font-weight: 600; font-size: 13px; color: #1F2937;">{item['label']}</div>
                {remark_html}
            </div>"""
        pending_items_html += '</div>'

    # Build skip list HTML
    skip_items_html = ''
    if summary['skip']:
        skip_items_html = '<div style="margin-bottom: 20px;">'
        skip_items_html += '<h3 style="color: #9CA3AF; font-size: 14px; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px;">↩ Skipped Tasks</h3>'
        for item in summary['skip']:
            remark_html = f'<div style="font-size: 11px; color: #6B7280; font-style: italic; margin-top: 2px;">Reason/Remark: {item["remarks"]}</div>' if item['remarks'] else ''
            skip_items_html += f"""
            <div style="padding: 8px 12px; background-color: #F9FAFB; border-left: 3px solid #9CA3AF; border-radius: 4px; margin-bottom: 6px;">
                <div style="font-weight: 600; font-size: 13px; color: #1F2937;">{item['label']}</div>
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F3F4F6; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #E5E7EB;">
        <!-- Header -->
        <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #4F46E5 0%, #3730A3 100%); text-align: center; color: #FFFFFF;">
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">Advanced MIS Daily Digest</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">{date_str}</p>
            </td>
        </tr>
        
        <!-- Summary Dashboard Card -->
        <tr>
            <td style="padding: 24px 24px 12px 24px;">
                <div style="background-color: {score_bg}; border: 1px solid {score_color}22; padding: 16px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 12px; font-weight: 700; color: #4B5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Daily Completion Score</div>
                    <div style="font-size: 32px; font-weight: 900; color: {score_color};">{score}%</div>
                    <div style="max-width: 250px; margin: 8px auto 0 auto; height: 6px; background-color: #E5E7EB; border-radius: 3px; overflow: hidden;">
                        <div style="width: {score}%; height: 100%; background-color: {score_color};"></div>
                    </div>
                </div>
            </td>
        </tr>

        <!-- User Information -->
        <tr>
            <td style="padding: 12px 24px 12px 24px;">
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="font-size: 12px; color: #4B5563; background-color: #F9FAFB; padding: 12px; border-radius: 6px; border: 1px solid #E5E7EB;">
                    <tr>
                        <td><strong>Team Member:</strong> {user.name} ({user.email})</td>
                        <td align="right"><strong>Department:</strong> {user.department}</td>
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
                
                {f'<div style="text-align: center; padding: 20px; color: #6B7280; font-size: 13px; font-style: italic;">No tasks scheduled or due for today.</div>' if not summary['done'] and not summary['pending'] and not summary['skip'] else ''}
            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="padding: 24px; background-color: #F9FAFB; text-align: center; font-size: 11px; color: #9CA3AF; border-top: 1px solid #E5E7EB;">
                <p style="margin: 0 0 6px 0;">This email is an automated digest from the Advanced MIS system.</p>
                <p style="margin: 0;"><a href="#" style="color: #4F46E5; text-decoration: none; font-weight: 600;">Go to MIS Portal</a></p>
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
    
    tasks_html = ''
    for item in pending_tasks:
        tasks_html += f"""
        <div style="padding: 10px 14px; background-color: #FFFBEB; border-left: 4px solid #F59E0B; border-radius: 6px; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 13px; color: #78350F;">{item['label']}</div>
            <div style="font-size: 11px; color: #B45309; margin-top: 2px;">Status: Pending Update</div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MIS Pending Tasks Reminder</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F3F4F6; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #E5E7EB;">
        <!-- Header -->
        <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); text-align: center; color: #FFFFFF;">
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">⏰ Daily MIS Task Reminder</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">{date_str}</p>
            </td>
        </tr>
        <!-- Content -->
        <tr>
            <td style="padding: 24px;">
                <p style="font-size: 14px; color: #374151; margin-top: 0; line-height: 1.5;">Hi <strong>{user.name}</strong>,</p>
                <p style="font-size: 14px; color: #374151; line-height: 1.5;">This is a reminder that you have <strong>{pending_count} pending tasks</strong> remaining for today in the MIS. Please update them at your earliest convenience.</p>
                
                <h3 style="color: #1F2937; font-size: 14px; text-transform: uppercase; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px; letter-spacing: 0.5px;">📋 Remaining Pending Tasks</h3>
                {tasks_html if pending_tasks else '<div style="text-align: center; color: #10B981; font-weight: 700; padding: 20px; font-size: 13px;">✓ Excellent! You have no pending tasks right now.</div>'}
                
                <div style="text-align: center; margin-top: 28px; margin-bottom: 8px;">
                    <a href="#" style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); color: white; padding: 12px 24px; text-decoration: none; font-weight: 700; border-radius: 6px; display: inline-block; font-size: 13px; box-shadow: 0 2px 4px rgba(245,158,11,0.3);">Update Tasks Now</a>
                </div>
            </td>
        </tr>
        <!-- Footer -->
        <tr>
            <td style="padding: 24px; background-color: #F9FAFB; text-align: center; font-size: 11px; color: #9CA3AF; border-top: 1px solid #E5E7EB;">
                <p style="margin: 0;">This is an automated system reminder from the Advanced MIS platform.</p>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return html


def build_manager_digest_html(date_str, summaries):
    """HTML email for managers showing status of all teammates."""
    rows_html = ''
    total_score = 0
    valid_count = 0
    
    for s in summaries:
        score = s['score']
        total_score += score
        valid_count += 1
        
        score_color = '#10B981' if score >= 80 else '#F59E0B' if score >= 50 else '#EF4444'
        rows_html += f"""
        <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 8px; font-weight: 600; font-size: 13px; color: #1F2937;">{s['name']}<br><span style="font-size: 11px; color: #6B7280; font-weight: normal;">{s['email']}</span></td>
            <td style="padding: 12px 8px; text-align: center; color: #10B981; font-weight: 700; font-size: 13px;">{s['done']}</td>
            <td style="padding: 12px 8px; text-align: center; color: #F59E0B; font-weight: 700; font-size: 13px;">{s['pending']}</td>
            <td style="padding: 12px 8px; text-align: center; color: #9CA3AF; font-size: 13px;">{s['skip']}</td>
            <td style="padding: 12px 8px; text-align: center; font-weight: 700; color: #374151; font-size: 13px;">{s['total']}</td>
            <td style="padding: 12px 8px; text-align: right; font-weight: bold; color: {score_color}; font-size: 13px;">{score}%</td>
        </tr>"""

    avg_score = round(total_score / valid_count) if valid_count > 0 else 0
    avg_color = '#10B981' if avg_score >= 80 else '#F59E0B' if avg_score >= 50 else '#EF4444'

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily MIS Manager Digest</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F3F4F6; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 650px; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #E5E7EB;">
        <!-- Header -->
        <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #4F46E5 0%, #3730A3 100%); text-align: center; color: #FFFFFF;">
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">📈 Daily MIS Manager Digest</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Team-wide Completion Update · {date_str}</p>
            </td>
        </tr>
        <!-- Content -->
        <tr>
            <td style="padding: 20px;">
                <div style="background-color: #EEF2FF; border: 1px solid #4F46E522; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 12px; font-weight: 700; color: #4F46E5; text-transform: uppercase; letter-spacing: 0.5px;">Overall Team Completion Score</div>
                    <div style="font-size: 32px; font-weight: 900; color: {avg_color}; margin-top: 4px;">{avg_score}%</div>
                </div>

                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #F9FAFB; border-bottom: 2px solid #E5E7EB; color: #4B5563; font-weight: bold; text-transform: uppercase; font-size: 11px;">
                            <th style="padding: 8px; text-align: left; letter-spacing: 0.5px;">Teammate</th>
                            <th style="padding: 8px; text-align: center; letter-spacing: 0.5px;">Done</th>
                            <th style="padding: 8px; text-align: center; letter-spacing: 0.5px;">Pending</th>
                            <th style="padding: 8px; text-align: center; letter-spacing: 0.5px;">Skip</th>
                            <th style="padding: 8px; text-align: center; letter-spacing: 0.5px;">Total</th>
                            <th style="padding: 8px; text-align: right; letter-spacing: 0.5px;">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html if summaries else '<tr><td colspan="6" style="text-align:center; padding:30px; color:#9CA3AF; font-size: 13px;">No active teammates found today.</td></tr>'}
                    </tbody>
                </table>
            </td>
        </tr>
        <!-- Footer -->
        <tr>
            <td style="padding: 24px; background-color: #F9FAFB; text-align: center; font-size: 11px; color: #9CA3AF; border-top: 1px solid #E5E7EB;">
                <p style="margin: 0;">Sent to all active Managers and Administrators.</p>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return html


def build_leader_digest_html(date_str, teammates_tasks):
    """HTML email for leaders showing detailed research team updates teammate-wise."""
    cards_html = ''
    for t in teammates_tasks:
        score = t['score']
        score_color = '#10B981' if score >= 80 else '#F59E0B' if score >= 50 else '#EF4444'
        
        # Build tasks detail lists
        done_items = ''
        if t['done']:
            done_items = '<div style="margin-top:10px; font-weight:700; font-size:11px; color:#10B981; text-transform:uppercase; letter-spacing:0.5px;">✓ Completed</div>'
            for item in t['done']:
                remark = f'<div style="font-size:11px; color:#6B7280; font-style:italic; margin-top:2px;">Remark: {item["remarks"]}</div>' if item['remarks'] else ''
                done_items += f"""
                <div style="font-size:12px; color:#374151; padding:6px 0; border-bottom:1px solid #F3F4F6;">
                    <strong>{item['label']}</strong>
                    {remark}
                </div>"""
                
        pending_items = ''
        if t['pending']:
            pending_items = '<div style="margin-top:10px; font-weight:700; font-size:11px; color:#F59E0B; text-transform:uppercase; letter-spacing:0.5px;">⚠ Pending</div>'
            for item in t['pending']:
                remark = f'<div style="font-size:11px; color:#6B7280; font-style:italic; margin-top:2px;">Remark: {item["remarks"]}</div>' if item['remarks'] else ''
                pending_items += f"""
                <div style="font-size:12px; color:#374151; padding:6px 0; border-bottom:1px solid #F3F4F6;">
                    <strong>{item['label']}</strong>
                    {remark}
                </div>"""

        skip_items = ''
        if t['skip']:
            skip_items = '<div style="margin-top:10px; font-weight:700; font-size:11px; color:#9CA3AF; text-transform:uppercase; letter-spacing:0.5px;">↩ Skipped</div>'
            for item in t['skip']:
                remark = f'<div style="font-size:11px; color:#6B7280; font-style:italic; margin-top:2px;">Remark: {item["remarks"]}</div>' if item['remarks'] else ''
                skip_items += f"""
                <div style="font-size:12px; color:#374151; padding:6px 0; border-bottom:1px solid #F3F4F6;">
                    <strong>{item['label']}</strong>
                    {remark}
                </div>"""

        cards_html += f"""
        <div style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
            <div style="border-bottom: 2px solid #F3F4F6; padding-bottom: 8px; margin-bottom: 10px;">
                <div style="font-size: 16px; font-weight: 900; color: {score_color}; float: right; line-height: 1.2;">{score}% Done</div>
                <strong style="font-size: 14px; color: #1F2937;">{t['name']}</strong>
                <div style="font-size: 11px; color: #6B7280; margin-top: 2px;">{t['email']} · {t['department']}</div>
                <div style="clear: both;"></div>
            </div>
            
            {done_items}
            {pending_items}
            {skip_items}
            
            {'' if done_items or pending_items or skip_items else '<div style="font-size:12px; color:#9CA3AF; font-style:italic; text-align:center; padding:10px 0;">No tasks assigned today.</div>'}
        </div>"""

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Research Team Update</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F3F4F6; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 650px; background-color: #F9FAFB; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #E5E7EB;">
        <!-- Header -->
        <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #10B981 0%, #047857 100%); text-align: center; color: #FFFFFF;">
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">📋 Research Team Update (Teammate-wise)</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Leader Board Summary · {date_str}</p>
            </td>
        </tr>
        <!-- Content -->
        <tr>
            <td style="padding: 20px;">
                {cards_html if teammates_tasks else '<div style="text-align:center; padding:30px; color:#9CA3AF; background:#fff; border-radius:8px; font-size: 13px;">No research team tasks scheduled for today.</div>'}
            </td>
        </tr>
        <!-- Footer -->
        <tr>
            <td style="padding: 24px; background-color: #F9FAFB; text-align: center; font-size: 11px; color: #9CA3AF; border-top: 1px solid #E5E7EB;">
                <p style="margin: 0;">Sent to all active Leaders and Department Heads.</p>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return html
