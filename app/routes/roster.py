"""
Roster / Roadster — Daily rotation management.
"""
from datetime import datetime, date, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models import RosterConfig, RosterLog, RosterDaySubstitution, RosterSchedule, AuditLog, DBTaskVerification, DBTaskCatalog
from app.services.surveillance import get_live_mysql_connection, query_max_date_from_db, get_snapshot_latest_date
from app.auth import get_current_user, role_at_least

roster_bp = Blueprint('roster', __name__)

@roster_bp.route('/today', methods=['GET'])
@jwt_required()
def get_today():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    today = date.today()
    configs = RosterConfig.query.all()
    tasks = []
    for rc in configs:
        emp = rc.employee.lower()
        if not role_at_least(user.role, 'Manager') and emp != user.email.lower() and emp != user.name.lower():
            continue
        log = RosterLog.query.filter_by(date=today, role=rc.role).first()
        tasks.append({'role': rc.role, 'employee': rc.employee, 'frequency': rc.frequency, 'remark': rc.remark, 'status': log.status if log else 'Pending'})
    return jsonify({'success': True, 'tasks': tasks, 'today': today.isoformat()})

@roster_bp.route('/status', methods=['PUT'])
@jwt_required()
def update_status():
    user = get_current_user()
    if not user: return jsonify({'success': False}), 401
    data = request.get_json()
    role = data.get('role', '')
    status = data.get('status', 'Done')
    today = date.today()
    log = RosterLog.query.filter_by(date=today, role=role).first()
    if log:
        log.status = status
        log.updated_at = datetime.now(timezone.utc)
    else:
        config = RosterConfig.query.filter_by(role=role).first()
        if not config: return jsonify({'success': False, 'message': 'Role not found'}), 404
        log = RosterLog(date=today, role=role, employee=config.employee, status=status)
        db.session.add(log)
    db.session.commit()
    return jsonify({'success': True, 'status': status})

@roster_bp.route('/config', methods=['GET'])
@jwt_required()
def get_config():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    configs = RosterConfig.query.all()
    return jsonify({'success': True, 'data': [c.to_dict() for c in configs]})

@roster_bp.route('/config', methods=['POST'])
@jwt_required()
def save_config():
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    data = request.get_json()
    old_role = data.get('oldRole')
    new_role = data.get('role', '')
    employee = data.get('employee', '')
    if not new_role or not employee: return jsonify({'success': False, 'message': 'Missing fields'}), 400
    if old_role:
        config = RosterConfig.query.filter_by(role=old_role).first()
        if config:
            config.role = new_role
            config.employee = employee
            config.frequency = data.get('frequency', 'Daily')
            config.remark = data.get('remark', '')
            db.session.commit()
            return jsonify({'success': True})
    config = RosterConfig(role=new_role, employee=employee, frequency=data.get('frequency', 'Daily'), remark=data.get('remark', ''))
    db.session.add(config)
    db.session.commit()
    return jsonify({'success': True})

@roster_bp.route('/config/<int:config_id>', methods=['DELETE'])
@jwt_required()
def delete_config(config_id):
    user = get_current_user()
    if not user or not role_at_least(user.role, 'Manager'): return jsonify({'success': False}), 403
    config = db.session.get(RosterConfig, config_id)
    if not config: return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(config)
    db.session.commit()
    return jsonify({'success': True})


# ─── Scrapper For REf.xlsx Master Plan Definitions & Dynamic Store ───────────
import json

DEFAULT_ROSTER_DUTIES = [
    {
        'role': 'AW',
        'title': 'Agricultural Weather (AW) Scrapper',
        'defaultTiming': 'Do after 6:30 PM',
        'frequency': 'Daily'
    },
    {
        'role': 'Retail / Wholesale',
        'title': 'Retail & Wholesale Mandi Prices Scrapper',
        'defaultTiming': 'Daily 18:00 IST',
        'frequency': 'Daily'
    },
    {
        'role': 'NCDEX',
        'title': 'NCDEX Bhavcopy & Spices Settlement Scrapper',
        'defaultTiming': 'Do after 4:30 PM',
        'frequency': 'Daily'
    },
    {
        'role': 'Currency',
        'title': 'Forex & Currency Valuation Scrapper',
        'defaultTiming': 'Do after 2:00 PM',
        'frequency': 'Daily'
    },
    {
        'role': 'CME',
        'title': 'CME Chicago Mercantile Exchange Global Futures',
        'defaultTiming': 'Daily Evening',
        'frequency': 'Daily'
    }
]

DEFAULT_ROSTER_PEOPLE = ['Bhawna', 'Nitesh', 'Gopi', 'Pankaj', 'Nishant']

DEFAULT_SCRAPPER_ROSTER_MATRIX = [
    {
        'role': 'AW',
        'title': 'Agricultural Weather (AW) Scrapper',
        'defaultTiming': 'Do after 6:30 PM',
        'frequency': 'Daily',
        'weeks': {1: 'Bhawna', 2: 'Nitesh', 3: 'Gopi', 4: 'Pankaj', 5: 'Nishant'}
    },
    {
        'role': 'Retail / Wholesale',
        'title': 'Retail & Wholesale Mandi Prices Scrapper',
        'defaultTiming': 'Daily 18:00 IST',
        'frequency': 'Daily',
        'weeks': {1: 'Nitesh', 2: 'Gopi', 3: 'Pankaj', 4: 'Nishant', 5: 'Bhawna'}
    },
    {
        'role': 'NCDEX',
        'title': 'NCDEX Bhavcopy & Spices Settlement Scrapper',
        'defaultTiming': 'Do after 4:30 PM',
        'frequency': 'Daily',
        'weeks': {1: 'Gopi', 2: 'Pankaj', 3: 'Nishant', 4: 'Bhawna', 5: 'Nitesh'}
    },
    {
        'role': 'Currency',
        'title': 'Forex & Currency Valuation Scrapper',
        'defaultTiming': 'Do after 2:00 PM',
        'frequency': 'Daily',
        'weeks': {1: 'Pankaj', 2: 'Nishant', 3: 'Bhawna', 4: 'Nitesh', 5: 'Gopi'}
    },
    {
        'role': 'CME',
        'title': 'CME Chicago Mercantile Exchange Global Futures',
        'defaultTiming': 'Daily Evening',
        'frequency': 'Daily',
        'weeks': {1: 'Nishant', 2: 'Bhawna', 3: 'Nitesh', 4: 'Gopi', 5: 'Pankaj'}
    }
]

DEFAULT_RAKE_MOVEMENT_ZONES = [
    {
        'person': 'Nishant',
        'email': 'nishant@agalabs.com',
        'zones': 'ER, KR, NC, NE',
        'zoneList': ['ER', 'KR', 'NC', 'NE'],
        'zoneNames': 'Eastern Railway, Konkan Railway, North Central Railway, North Eastern Railway',
        'schedule': 'Every Tuesday Update',
        'status': 'Active'
    },
    {
        'person': 'Nitesh',
        'email': 'nitesh@agalabs.com',
        'zones': 'None',
        'zoneList': [],
        'zoneNames': 'Exempt / Focus on Bajra, Barley, Maize, Sugar',
        'schedule': 'Exempt',
        'status': 'Exempt'
    },
    {
        'person': 'Gopi',
        'email': 'gopichand@agalabs.com',
        'zones': 'SEC, SE, SW, SCOR, NF, SR, WC, WR',
        'zoneList': ['SEC', 'SE', 'SW', 'SCOR', 'NF', 'SR', 'WC', 'WR'],
        'zoneNames': 'South East Central, South Eastern, South Western, South Coast, Northeast Frontier, Southern, West Central, Western',
        'schedule': 'Every Tuesday Update',
        'status': 'Active'
    },
    {
        'person': 'Pankaj',
        'email': 'pankaj@agalabs.com',
        'zones': 'CR, DFCR, EC, ECO',
        'zoneList': ['CR', 'DFCR', 'EC', 'ECO'],
        'zoneNames': 'Central Railway, Dedicated Freight Corridor, East Central Railway, East Coast Railway',
        'schedule': 'Every Tuesday Update',
        'status': 'Active'
    },
    {
        'person': 'Bhawna',
        'email': 'bhawna@agalabs.com',
        'zones': 'SC, NPLR, NW, NR',
        'zoneList': ['SC', 'NPLR', 'NW', 'NR'],
        'zoneNames': 'South Central Railway, Northern Port Logistics (Pipavav/Mundra), North Western Railway, Northern Railway',
        'schedule': 'Every Tuesday Update',
        'status': 'Active'
    }
]

DEFAULT_MONTHLY_MACRO_DUTIES = [
    {
        'duty': 'WPI',
        'fullName': 'Wholesale Price Index Macro Surveillance',
        'assignedPerson': 'Bhawna',
        'assignedEmail': 'bhawna@agalabs.com',
        'dueDay': '15th',
        'cadence': 'Every Month (15th)',
        'nextDueDate': '15-Nov-2026',
        'rule': 'One person assigned each month, then rotates sequentially across teammates.'
    },
    {
        'duty': 'CPI',
        'fullName': 'Consumer Price Index Inflation Surveillance',
        'assignedPerson': 'Bhawna',
        'assignedEmail': 'bhawna@agalabs.com',
        'dueDay': '15th',
        'cadence': 'Every Month (15th)',
        'nextDueDate': '15-Nov-2026',
        'rule': 'Assigned to the same person who handles WPI for that active month.'
    },
    {
        'duty': 'AW Report Download',
        'fullName': 'AW Report Download',
        'assignedPerson': 'Gopi',
        'assignedEmail': 'gopichand@agalabs.com',
        'dueDay': '5th',
        'cadence': 'Every Month (5th)',
        'nextDueDate': '05-Nov-2026',
        'rule': 'One person assigned each month other than the person handling WPI/CPI.'
    }
]

PERSON_EMAILS = {
    'Nishant': 'nishant@agalabs.com',
    'Bhawna': 'bhawna@agalabs.com',
    'Pankaj': 'pankaj@agalabs.com',
    'Nitesh': 'nitesh@agalabs.com',
    'Gopi': 'gopichand@agalabs.com'
}


def validate_roster(duties, people, weeks_count, matrix, is_index_grid=False):
    """
    Validates that:
    1. Every active duty has exactly one assigned person per week.
    2. No person performs more than one duty in any week.
    3. No person performs the same duty twice across the roster.
    4. Every assigned person refers to a valid teammate.
    """
    M = len(duties)
    N = len(people)
    K = int(weeks_count)
    people_lookup = {p.strip().lower(): p.strip() for p in people}

    if is_index_grid:
        grid = matrix
    else:
        grid = [[None for _ in range(K)] for _ in range(M)]
        duty_map = {d.strip().lower(): i for i, d in enumerate(duties)}
        for row in matrix:
            d_name = row.get('role', '').strip().lower()
            if d_name not in duty_map:
                continue
            d_idx = duty_map[d_name]
            weeks_dict = row.get('weeks', {})
            for w in range(1, K + 1):
                person_name = weeks_dict.get(w) or weeks_dict.get(str(w))
                if not person_name:
                    return False, f"Missing assignment for duty '{row.get('role')}' in Week {w}."
                p_clean = str(person_name).strip().lower()
                if p_clean not in people_lookup:
                    return False, f"Assignment '{person_name}' is not in the active people list."
                grid[d_idx][w - 1] = p_clean

    # 1. No person has more than one duty in any week
    for w in range(K):
        week_assignees = [grid[d][w] for d in range(M)]
        if any(a is None for a in week_assignees):
            return False, f"Week {w + 1} has unassigned duties."
        if len(week_assignees) != len(set(week_assignees)):
            seen = set()
            for a in week_assignees:
                if a in seen:
                    return False, f"Double-booking detected: '{a}' is assigned to multiple duties in Week {w + 1}."
                seen.add(a)

    # 2. No person performs the same duty twice across the entire roster
    for d in range(M):
        duty_assignees = [grid[d][w] for w in range(K)]
        if len(duty_assignees) != len(set(duty_assignees)):
            seen = set()
            for a in duty_assignees:
                if a in seen:
                    return False, f"Repetition detected: '{a}' is assigned to duty '{duties[d]}' more than once."
                seen.add(a)

    return True, None


def solve_roster(duties, people, weeks_count):
    """
    CSP with Backtracking and MRV Heuristic for Random Conflict-Free Roster Generation.
    Satisfies all 10 rules.
    """
    import random
    duties_clean = [str(d).strip() for d in duties if str(d).strip()]
    people_clean = [str(p).strip() for p in people if str(p).strip()]

    # Case-insensitive duplicate check
    d_lower = [d.lower() for d in duties_clean]
    if len(d_lower) != len(set(d_lower)):
        return False, 'Duplicate duty names detected. Please ensure all duty names are distinct.', None
    p_lower = [p.lower() for p in people_clean]
    if len(p_lower) != len(set(p_lower)):
        return False, 'Duplicate teammate names detected. Please ensure all teammate names are distinct.', None

    M = len(duties_clean)
    N = len(people_clean)
    try:
        K = int(weeks_count)
    except (ValueError, TypeError):
        K = 5

    if M == 0:
        return False, 'No active duties defined. Please add at least one duty.', None
    if N == 0:
        return False, 'No teammates available. Please add at least one person.', None
    if K <= 0:
        return False, 'Number of weeks must be at least 1.', None

    # Rule 2 Check: Max 1 duty per person per week
    if M > N:
        return False, (
            f"Cannot assign duties: Number of duties ({M}) exceeds available people ({N}). "
            f"Rule 2 requires that each person can perform at most ONE duty per week. You need at least {M} people."
        ), None

    # Rule 3 Check: Never assign same duty more than once across roster
    if K > N:
        return False, (
            f"Cannot assign duties: Number of weeks ({K}) exceeds available people ({N}). "
            f"Rule 3 prohibits any person from repeating the same duty across the roster. "
            f"You need at least {K} people for a {K}-week non-repeating roster (or reduce weeks to {N})."
        ), None

    grid = [[None for _ in range(K)] for _ in range(M)]
    person_week = [set() for _ in range(K)]
    duty_person = [set() for _ in range(M)]
    cells = [(d, w) for d in range(M) for w in range(K)]

    def get_candidates(d, w):
        forbidden = person_week[w] | duty_person[d]
        cands = [p for p in range(N) if p not in forbidden]
        random.shuffle(cands)
        return cands

    def backtrack(cell_idx):
        if cell_idx == len(cells):
            return True

        best_idx = -1
        best_cand = None
        min_len = 999999

        for i in range(cell_idx, len(cells)):
            d, w = cells[i]
            cands = get_candidates(d, w)
            if len(cands) == 0:
                return False
            if len(cands) < min_len:
                min_len = len(cands)
                best_idx = i
                best_cand = cands
                if min_len == 1:
                    break

        cells[cell_idx], cells[best_idx] = cells[best_idx], cells[cell_idx]
        d, w = cells[cell_idx]

        for p in best_cand:
            grid[d][w] = p
            person_week[w].add(p)
            duty_person[d].add(p)

            if backtrack(cell_idx + 1):
                return True

            grid[d][w] = None
            person_week[w].remove(p)
            duty_person[d].remove(p)

        cells[cell_idx], cells[best_idx] = cells[best_idx], cells[cell_idx]
        return False

    success = backtrack(0)
    if not success:
        return False, 'Backtracking constraint solver could not find a complete conflict-free schedule for this configuration.', None

    is_valid, val_err = validate_roster(duties_clean, people_clean, K, grid, is_index_grid=True)
    if not is_valid:
        return False, f"Generated schedule failed validation: {val_err}", None

    result = []
    for d_idx, d_name in enumerate(duties_clean):
        weeks_map = {}
        for w in range(K):
            weeks_map[w + 1] = people_clean[grid[d_idx][w]]
        result.append({
            'role': d_name,
            'weeks': weeks_map
        })

    return True, 'Complete conflict-free schedule generated and validated successfully.', result


def _get_roster_data():
    """Returns (matrix, duties, duty_titles, duty_timings, people, weeks_count) from AppSetting or defaults."""
    from app.models import AppSetting
    setting = AppSetting.query.filter_by(key='scrapper_roster_structure').first()
    if setting and setting.value:
        try:
            data = json.loads(setting.value)
            return (
                data.get('matrix') or DEFAULT_SCRAPPER_ROSTER_MATRIX,
                data.get('duties') or [d['role'] for d in DEFAULT_ROSTER_DUTIES],
                data.get('dutyTitles') or {d['role']: d['title'] for d in DEFAULT_ROSTER_DUTIES},
                data.get('dutyTimings') or {d['role']: d['defaultTiming'] for d in DEFAULT_ROSTER_DUTIES},
                data.get('people') or DEFAULT_ROSTER_PEOPLE,
                int(data.get('weeksCount') or 5)
            )
        except Exception:
            pass

    # Check legacy key
    legacy = AppSetting.query.filter_by(key='scrapper_roster_matrix').first()
    if legacy and legacy.value:
        try:
            mat = json.loads(legacy.value)
            duties = [r['role'] for r in mat]
            w_max = 5
            for r in mat:
                w_keys = [int(k) for k in r.get('weeks', {}).keys() if str(k).isdigit()]
                if w_keys:
                    w_max = max(w_max, max(w_keys))
            return (
                mat,
                duties,
                {d['role']: d['title'] for d in DEFAULT_ROSTER_DUTIES},
                {d['role']: d['defaultTiming'] for d in DEFAULT_ROSTER_DUTIES},
                DEFAULT_ROSTER_PEOPLE,
                w_max
            )
        except Exception:
            pass

    return (
        DEFAULT_SCRAPPER_ROSTER_MATRIX,
        [d['role'] for d in DEFAULT_ROSTER_DUTIES],
        {d['role']: d['title'] for d in DEFAULT_ROSTER_DUTIES},
        {d['role']: d['defaultTiming'] for d in DEFAULT_ROSTER_DUTIES},
        DEFAULT_ROSTER_PEOPLE,
        5
    )


def _get_scrapper_matrix_data():
    mat, _, _, _, _, _ = _get_roster_data()
    return mat


def _get_rake_movement_data():
    from app.models import AppSetting
    setting = AppSetting.query.filter_by(key='rake_movement_zones').first()
    if setting and setting.value:
        try:
            return json.loads(setting.value)
        except Exception:
            pass
    return DEFAULT_RAKE_MOVEMENT_ZONES


def _get_monthly_duties_data():
    from app.models import AppSetting
    setting = AppSetting.query.filter_by(key='monthly_macro_duties').first()
    if setting and setting.value:
        try:
            return json.loads(setting.value)
        except Exception:
            pass
    return DEFAULT_MONTHLY_MACRO_DUTIES


def _get_active_week_num(weeks_count=5):
    from app.models import AppSetting
    from datetime import date, timedelta
    today = date.today()
    first_day = date(today.year, today.month, 1)
    first_monday = first_day - timedelta(days=first_day.weekday())
    cal_week = ((today - first_monday).days // 7) + 1
    cal_week = min(max(1, cal_week), max(1, weeks_count))

    setting = AppSetting.query.filter_by(key='active_scrapper_week').first()
    if setting and setting.value:
        try:
            val = int(setting.value)
            if 1 <= val <= max(1, weeks_count):
                return val
        except (ValueError, TypeError):
            pass
    return cal_week


def _record_roster_audit(actor_email, action, details=''):
    """Logs changes to AuditLog."""
    import time, random
    from app.models import AuditLog
    try:
        audit = AuditLog(
            audit_id=f"ROS{int(time.time()*1000)}_{random.randint(100,999)}",
            timestamp=datetime.now(timezone.utc),
            actor_email=actor_email or 'System',
            action=action,
            target_type='Roster',
            target_id='RosterPlan',
            after_json=details if isinstance(details, str) else json.dumps(details)
        )
        db.session.add(audit)
    except Exception as e:
        print('Error recording audit:', e)


def _format_roster_date(val):
    """Formats any date object or date string to unified DD-MMM-YYYY format (e.g. 22-Oct-2026)."""
    if not val:
        return ''
    if isinstance(val, (datetime, date)):
        return val.strftime('%d-%b-%Y')
    val_str = str(val).strip()
    if val_str.lower() in ('none', 'exempt', 'null'):
        return val_str
    for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%d-%b-%Y', '%d/%m/%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(val_str, fmt).strftime('%d-%b-%Y')
        except (ValueError, TypeError):
            continue
    return val_str


@roster_bp.route('/scrapper-matrix', methods=['GET'])
def get_scrapper_matrix():
    """Returns the official Scrapper Roster matrix with dynamic calendar dates, RakeMovement, and monthly duties."""
    from datetime import timedelta
    today = date.today()
    matrix, duties, duty_titles, duty_timings, people, weeks_count = _get_roster_data()
    active_week = _get_active_week_num(weeks_count)

    # Next Tuesday calculation for Rake Movement
    days_until_tuesday = (1 - today.weekday()) % 7
    if days_until_tuesday == 0 and datetime.now().hour >= 20:
        days_until_tuesday = 7
    next_tuesday = today if days_until_tuesday == 0 else today + timedelta(days=days_until_tuesday)
    next_tuesday_str = next_tuesday.strftime('%d-%b-%Y')
    next_tuesday_formatted = f"Tuesday, {next_tuesday_str}"

    # Calculate Date Ranges for all configured weeks anchored to first Monday of current month
    first_day_current_month = date(today.year, today.month, 1)
    first_monday = first_day_current_month - timedelta(days=first_day_current_month.weekday())
    weeks_info = []
    for w in range(1, weeks_count + 1):
        w_start = first_monday + timedelta(weeks=(w - 1))
        w_end = w_start + timedelta(days=4)  # Monday through Friday working days
        is_cal_current = (w_start <= today <= (w_start + timedelta(days=6)))
        weeks_info.append({
            'week': w,
            'label': f"Week {w}",
            'date_range': f"{w_start.strftime('%d-%b-%Y')} – {w_end.strftime('%d-%b-%Y')}",
            'full_range': f"{w_start.strftime('%d-%b-%Y')} – {w_end.strftime('%d-%b-%Y')}",
            'start_date': w_start.strftime('%Y-%m-%d'),
            'end_date': w_end.strftime('%Y-%m-%d'),
            'is_current': is_cal_current,
            'is_active': (w == active_week)
        })

    # Fetch latest dates for Rake, WPI/CPI, Weather
    rake_last_date = None
    cpi_last_date = None
    weather_last_date = None
    try:
        conn = get_live_mysql_connection()
        if conn:
            try:
                rake_last_date = query_max_date_from_db(conn, 'pyexcel_rakemovement', 'MetwithDate')
                cpi_last_date = query_max_date_from_db(conn, 'pyexcel_cpi', 'CreatedDate')
                weather_last_date = query_max_date_from_db(conn, 'pyexcel_daily_weather_data', 'Date')
            finally:
                conn.close()
    except Exception:
        pass
    if not rake_last_date:
        rake_last_date = get_snapshot_latest_date('pyexcel_rakemovement') or '2026-10-12'
    if not cpi_last_date:
        cpi_last_date = get_snapshot_latest_date('pyexcel_cpi') or '2026-10-13'
    if not weather_last_date:
        weather_last_date = get_snapshot_latest_date('pyexcel_daily_weather_data') or '2026-10-04'

    # Prepare Rake Movement with exact Day and Date & Last Updated Date
    raw_rake_data = _get_rake_movement_data()
    rake_data = []
    for item in raw_rake_data:
        r_item = dict(item)
        is_exempt = (r_item.get('status') == 'Exempt') or (r_item.get('zones') == 'None') or not r_item.get('zones')
        item_date = _format_roster_date(r_item.get('date')) or next_tuesday_str
        r_item['day'] = 'Tuesday'
        r_item['date'] = item_date
        r_item['dayDate'] = f"Tuesday, {item_date}" if not is_exempt else 'Exempt'
        r_item['schedule'] = f"Every Tuesday ({item_date})" if not is_exempt else 'Exempt'
        r_item['lastUpdatedDate'] = _format_roster_date(rake_last_date)
        rake_data.append(r_item)

    # Dynamic Monthly Macro Duties: Sequential rotation across teammates
    month_offset = (today.year - 2026) * 12 + (today.month - 10)
    assigned_wpi = people[month_offset % max(1, len(people))]
    assigned_cpi = assigned_wpi
    assigned_aw = people[(month_offset + 1) % max(1, len(people))]

    next_month_date = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    next_month_offset = month_offset + 1
    next_assigned_wpi = people[next_month_offset % max(1, len(people))]
    next_assigned_aw = people[(next_month_offset + 1) % max(1, len(people))]

    monthly_data = [
        {
            'duty': 'WPI',
            'fullName': 'Wholesale Price Index Macro Surveillance',
            'assignedPerson': assigned_wpi,
            'assignedEmail': PERSON_EMAILS.get(assigned_wpi, f"{assigned_wpi.lower()}@agalabs.com"),
            'dueDay': '15th',
            'cadence': 'Every Month (15th)',
            'nextDueDate': f"15-{(today.replace(day=15) if today.day <= 15 else (today.replace(day=1) + timedelta(days=32)).replace(day=15)).strftime('%b-%Y')}",
            'activeMonth': today.strftime('%B %Y'),
            'rule': 'One person assigned each month, then rotates sequentially across teammates.',
            'nextMonthAssignee': next_assigned_wpi,
            'nextMonthName': next_month_date.strftime('%B %Y'),
            'lastUpdatedDate': _format_roster_date(cpi_last_date)
        },
        {
            'duty': 'CPI',
            'fullName': 'Consumer Price Index Inflation Surveillance',
            'assignedPerson': assigned_cpi,
            'assignedEmail': PERSON_EMAILS.get(assigned_cpi, f"{assigned_cpi.lower()}@agalabs.com"),
            'dueDay': '15th',
            'cadence': 'Every Month (15th)',
            'nextDueDate': f"15-{(today.replace(day=15) if today.day <= 15 else (today.replace(day=1) + timedelta(days=32)).replace(day=15)).strftime('%b-%Y')}",
            'activeMonth': today.strftime('%B %Y'),
            'rule': 'Assigned to the same person who handles WPI for that active month.',
            'nextMonthAssignee': next_assigned_wpi,
            'nextMonthName': next_month_date.strftime('%B %Y'),
            'lastUpdatedDate': _format_roster_date(cpi_last_date)
        },
        {
            'duty': 'AW Report Download',
            'fullName': 'AW Report Download',
            'assignedPerson': assigned_aw,
            'assignedEmail': PERSON_EMAILS.get(assigned_aw, f"{assigned_aw.lower()}@agalabs.com"),
            'dueDay': '5th',
            'cadence': 'Every Month (5th)',
            'nextDueDate': f"05-{(today.replace(day=5) if today.day <= 5 else (today.replace(day=1) + timedelta(days=32)).replace(day=5)).strftime('%b-%Y')}",
            'activeMonth': today.strftime('%B %Y'),
            'rule': 'One person assigned each month other than the person handling WPI/CPI.',
            'nextMonthAssignee': next_assigned_aw,
            'nextMonthName': next_month_date.strftime('%B %Y'),
            'lastUpdatedDate': _format_roster_date(weather_last_date)
        }
    ]

    duty_table_map = {
        'AW': 'pyexcel_daily_weather_data',
        'Retail Wholesale': 'ipga_spot',
        'Retail / Wholesale': 'ipga_spot',
        'NCDEX': 'pystage_factrates_ncdex_futures',
        'Currency': 'pystage_factrates_exchangerate',
        'CME': 'pystage_factrates_cme_futures'
    }

    table_latest_cache = {
        'pyexcel_rakemovement': rake_last_date,
        'pyexcel_cpi': cpi_last_date,
        'pyexcel_daily_weather_data': weather_last_date
    }

    cell_status_map = {}
    for row in matrix:
        role = row['role']
        cell_status_map[role] = {}
        tbl = duty_table_map.get(role, 'pyexcel_scrapper')
        if tbl not in table_latest_cache:
            t_date = None
            try:
                conn = get_live_mysql_connection()
                if conn:
                    try:
                        t_date = query_max_date_from_db(conn, tbl, 'Date')
                    finally:
                        conn.close()
            except Exception:
                pass
            if not t_date:
                t_date = get_snapshot_latest_date(tbl)
            table_latest_cache[tbl] = t_date or '2026-10-14'
        t_max_date = table_latest_cache[tbl]

        for w_info in weeks_info:
            w = w_info['week']
            w_s = datetime.strptime(w_info['start_date'], '%Y-%m-%d').date()
            w_e = datetime.strptime(w_info['end_date'], '%Y-%m-%d').date()

            # Check for holiday substitution in this week
            sub = RosterDaySubstitution.query.filter(
                RosterDaySubstitution.duty_role == role,
                RosterDaySubstitution.target_date >= w_s,
                RosterDaySubstitution.target_date <= w_e
            ).first()
            b_user = sub.backup_user if sub else ''
            on_leave = sub.is_on_leave if sub else False

            if w_s > today:
                c_status = 'UPCOMING'
                c_color = '#64748b'
                c_label = 'Upcoming'
            elif w_e < today:
                if t_max_date and t_max_date >= w_info['start_date']:
                    c_status = 'COMPLETED'
                    c_color = '#10b981'
                    c_label = '✓ Completed'
                else:
                    c_status = 'MISSED'
                    c_color = '#ef4444'
                    c_label = '✕ Missed'
            else: # current active week
                today_str = today.strftime('%Y-%m-%d')
                yesterday_str = (today - timedelta(days=1)).strftime('%Y-%m-%d')
                if t_max_date and t_max_date >= today_str:
                    c_status = 'COMPLETED'
                    c_color = '#10b981'
                    c_label = '✓ Done Today'
                elif t_max_date and t_max_date >= yesterday_str:
                    c_status = 'PENDING'
                    c_color = '#f59e0b'
                    c_label = '⏳ Due Today'
                else:
                    c_status = 'MISSED'
                    c_color = '#ef4444'
                    c_label = '✕ Missed'

            cell_status_map[role][str(w)] = {
                'status': c_status,
                'color': c_color,
                'label': c_label,
                'backupUser': b_user,
                'isOnLeave': on_leave,
                'latestDbDate': t_max_date
            }

    return jsonify({
        'success': True,
        'matrix': matrix,
        'cellStatus': cell_status_map,
        'duties': duties,
        'dutyTitles': duty_titles,
        'dutyTimings': duty_timings,
        'people': people,
        'weeksCount': weeks_count,
        'rakeMovement': rake_data,
        'monthlyRotation': monthly_data,
        'activeWeek': active_week,
        'teammates': people,
        'dateMeta': {
            'today': today.isoformat(),
            'todayFormatted': today.strftime('%A, %d %B %Y'),
            'currentMonth': today.strftime('%B %Y'),
            'nextMonth': next_month_date.strftime('%B %Y'),
            'rakeMovementDay': 'Tuesday',
            'rakeMovementDate': next_tuesday_str,
            'rakeMovementFormatted': next_tuesday_formatted,
            'weeksInfo': weeks_info
        }
    })


@roster_bp.route('/week-detail', methods=['GET'])
def get_week_detail():
    """
    Returns 7-day calendar breakdown for a specific week number with primary assignee,
    backup assignee / holiday substitution, and day-by-day task completion status.
    """
    from datetime import timedelta
    today = date.today()
    week_param = request.args.get('week', '1')
    try:
        week_num = int(week_param)
    except (ValueError, TypeError):
        week_num = 1

    matrix, duties, duty_titles, duty_timings, people, weeks_count = _get_roster_data()

    # Calculate Date Range for week_num anchored to first Monday of current month
    first_day_current_month = date(today.year, today.month, 1)
    first_monday = first_day_current_month - timedelta(days=first_day_current_month.weekday())
    w_start = first_monday + timedelta(weeks=(week_num - 1))
    w_end = w_start + timedelta(days=4)  # Working days Monday through Friday

    # 5 Working Days (Monday - Friday, excluding non-working Saturday & Sunday)
    day_list = []
    day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    for i in range(5):
        cur_d = w_start + timedelta(days=i)
        day_list.append({
            'date': cur_d.strftime('%Y-%m-%d'),
            'formatted': cur_d.strftime('%d-%b-%Y'),
            'dayName': day_names[i],
            'isToday': (cur_d == today),
            'isPast': (cur_d < today),
            'isFuture': (cur_d > today)
        })

    duty_table_map = {
        'AW': 'pyexcel_daily_weather_data',
        'Retail Wholesale': 'ipga_spot',
        'Retail / Wholesale': 'ipga_spot',
        'NCDEX': 'pystage_factrates_ncdex_futures',
        'Currency': 'pystage_factrates_exchangerate',
        'CME': 'pystage_factrates_cme_futures'
    }

    table_latest_cache = {}
    duties_detail = []

    for row in matrix:
        role = row['role']
        w_map = row.get('weeks', {})
        assignee = w_map.get(week_num) or w_map.get(str(week_num)) or 'Unassigned'
        table_name = duty_table_map.get(role, 'pyexcel_scrapper')

        if table_name not in table_latest_cache:
            t_date = None
            try:
                conn = get_live_mysql_connection()
                if conn:
                    try:
                        t_date = query_max_date_from_db(conn, table_name, 'Date')
                    finally:
                        conn.close()
            except Exception:
                pass
            if not t_date:
                t_date = get_snapshot_latest_date(table_name)
            table_latest_cache[table_name] = t_date or '2026-10-14'

        t_max_date = table_latest_cache[table_name]

        days_data = []
        for d_info in day_list:
            d_str = d_info['date']
            d_date = datetime.strptime(d_str, '%Y-%m-%d').date()

            # Check for holiday substitution
            sub = RosterDaySubstitution.query.filter_by(duty_role=role, target_date=d_date).first()
            backup_user = sub.backup_user if sub else ''
            is_on_leave = sub.is_on_leave if sub else False
            reason = sub.reason if sub else ''

            # Active assignee (substitute if on leave)
            active_assignee = backup_user if (is_on_leave and backup_user) else assignee

            # Status check for this day
            if d_date > today:
                status = 'UPCOMING'
                status_label = 'Upcoming'
                color = '#64748b'
            elif d_date == today:
                if t_max_date >= d_str:
                    status = 'DONE'
                    status_label = '✓ Done'
                    color = '#10b981'
                else:
                    status = 'PENDING'
                    status_label = '⏳ Due Today'
                    color = '#f59e0b'
            else: # past
                if t_max_date >= d_str:
                    status = 'DONE'
                    status_label = '✓ Done'
                    color = '#10b981'
                else:
                    status = 'MISSED'
                    status_label = '✕ Missed'
                    color = '#ef4444'

            days_data.append({
                'date': d_str,
                'dayName': d_info['dayName'],
                'primaryUser': assignee,
                'backupUser': backup_user,
                'isOnLeave': is_on_leave,
                'leaveReason': reason,
                'activeUser': active_assignee,
                'status': status,
                'statusLabel': status_label,
                'color': color,
                'table': table_name,
                'latestDbDate': t_max_date
            })

        duties_detail.append({
            'role': role,
            'title': row.get('title') or duty_titles.get(role, f"{role} Scrapper"),
            'defaultTiming': row.get('defaultTiming') or duty_timings.get(role, 'Scheduled Timing'),
            'table': table_name,
            'primaryUser': assignee,
            'days': days_data
        })

    # Tuesday Rake Movement detail for this week
    tuesday_day = day_list[1] # Tuesday is index 1
    raw_rake = _get_rake_movement_data()
    rake_table = 'pyexcel_rakemovement'
    rake_max = table_latest_cache.get(rake_table)
    if not rake_max:
        rake_max = get_snapshot_latest_date(rake_table) or '2026-10-12'

    rake_tuesday_detail = []
    t_date_obj = datetime.strptime(tuesday_day['date'], '%Y-%m-%d').date()
    for r in raw_rake:
        person = r.get('person')
        sub = RosterDaySubstitution.query.filter_by(duty_role='Rake Movement', target_date=t_date_obj, primary_user=person).first()
        r_backup = sub.backup_user if sub else ''
        r_leave = sub.is_on_leave if sub else False

        if t_date_obj > today:
            r_status = 'UPCOMING'
            r_color = '#64748b'
            r_label = 'Upcoming'
        elif t_date_obj == today:
            r_status = 'DONE' if rake_max >= tuesday_day['date'] else 'PENDING'
            r_color = '#10b981' if r_status == 'DONE' else '#f59e0b'
            r_label = '✓ Done' if r_status == 'DONE' else '⏳ Due Today'
        else:
            r_status = 'DONE' if rake_max >= tuesday_day['date'] else 'MISSED'
            r_color = '#10b981' if r_status == 'DONE' else '#ef4444'
            r_label = '✓ Done' if r_status == 'DONE' else '✕ Missed'

        rake_tuesday_detail.append({
            'person': person,
            'zones': r.get('zones'),
            'backupUser': r_backup,
            'isOnLeave': r_leave,
            'activeUser': r_backup if (r_leave and r_backup) else person,
            'status': r_status,
            'statusLabel': r_label,
            'color': r_color,
            'date': tuesday_day['date'],
            'latestDbDate': rake_max
        })

    return jsonify({
        'success': True,
        'week': week_num,
        'weekLabel': f"Week {week_num}",
        'dateRange': f"{w_start.strftime('%d %b')} - {w_end.strftime('%d %b %Y')}",
        'monthName': w_start.strftime('%B %Y'),
        'days': day_list,
        'duties': duties_detail,
        'rakeMovement': rake_tuesday_detail,
        'teammates': people
    })


@roster_bp.route('/assign-backup', methods=['POST'])
@jwt_required()
def assign_backup():
    """Assigns or updates a backup / holiday substitute for a duty on a specific date or full week."""
    from datetime import timedelta
    user = get_current_user()
    actor_email = user.email if user else 'Manager'

    payload = request.get_json() or {}
    duty_role = payload.get('dutyRole') or payload.get('role')
    primary_user = payload.get('primaryUser')
    backup_user = payload.get('backupUser')
    target_date_str = payload.get('targetDate')
    week_num = payload.get('weekNumber', 0)
    is_on_leave = payload.get('isOnLeave', True)
    reason = payload.get('reason', 'On Holiday / Leave')

    if not duty_role or not primary_user or not backup_user:
        return jsonify({'success': False, 'message': 'Missing dutyRole, primaryUser, or backupUser.'}), 400

    dates_to_apply = []
    dates_param = payload.get('dates')
    if dates_param and isinstance(dates_param, list):
        for ds in dates_param:
            try:
                dates_to_apply.append(datetime.strptime(str(ds).strip(), '%Y-%m-%d').date())
            except Exception:
                pass
    elif target_date_str and target_date_str != 'ALL':
        try:
            d_obj = datetime.strptime(target_date_str, '%Y-%m-%d').date()
            dates_to_apply.append(d_obj)
        except Exception:
            pass

    if not dates_to_apply and week_num > 0:
        today = date.today()
        first_day_current_month = date(today.year, today.month, 1)
        first_monday = first_day_current_month - timedelta(days=first_day_current_month.weekday())
        w_start = first_monday + timedelta(weeks=(int(week_num) - 1))
        for i in range(5):  # 5 working days (Monday - Friday)
            dates_to_apply.append(w_start + timedelta(days=i))

    for d_val in dates_to_apply:
        sub = RosterDaySubstitution.query.filter_by(duty_role=duty_role, target_date=d_val).first()
        if sub:
            sub.primary_user = primary_user
            sub.backup_user = backup_user
            sub.is_on_leave = is_on_leave
            sub.reason = reason
            sub.assigned_by = actor_email
        else:
            sub = RosterDaySubstitution(
                duty_role=duty_role,
                target_date=d_val,
                week_number=int(week_num or 0),
                primary_user=primary_user,
                backup_user=backup_user,
                is_on_leave=is_on_leave,
                reason=reason,
                assigned_by=actor_email
            )
            db.session.add(sub)

        # Log in RosterLog
        rlog = RosterLog(
            date=d_val,
            role=f"{duty_role} (Backup Assigned)",
            employee=backup_user,
            status=f"Substituted for {primary_user} ({reason})"
        )
        db.session.add(rlog)

    # Update RosterSchedule if applicable
    schedules = RosterSchedule.query.filter(RosterSchedule.duty_name.like(f"%{duty_role}%")).all()
    for s in schedules:
        s.backup_user = backup_user

    # Record audit log
    _record_roster_audit(
        actor_email=actor_email,
        action='ASSIGN_BACKUP',
        details={
            'dutyRole': duty_role,
            'primaryUser': primary_user,
            'backupUser': backup_user,
            'dates': [d.isoformat() for d in dates_to_apply],
            'reason': reason
        }
    )

    db.session.commit()
    return jsonify({
        'success': True,
        'message': f"Assigned {backup_user} as backup substitute for {primary_user} on {duty_role} across {len(dates_to_apply)} days.",
        'backupUser': backup_user,
        'datesApplied': len(dates_to_apply)
    })


@roster_bp.route('/generate-random', methods=['POST'])
@jwt_required()
def generate_random_roster():
    """Generates a complete conflict-free roster schedule using CSP backtracking."""
    user = get_current_user()
    actor_email = user.email if user else 'Nishant'
    payload = request.get_json() or {}

    current_matrix, default_duties, duty_titles, duty_timings, default_people, default_weeks = _get_roster_data()

    duties = payload.get('duties') or default_duties
    people = payload.get('people') or default_people
    weeks = payload.get('weeks') or default_weeks

    try:
        weeks = int(weeks)
    except (ValueError, TypeError):
        weeks = 5

    success, message, new_matrix = solve_roster(duties, people, weeks)
    if not success:
        return jsonify({
            'success': False,
            'message': message,
            'previousMatrix': current_matrix
        }), 400

    formatted_matrix = []
    for item in new_matrix:
        role = item['role']
        formatted_matrix.append({
            'role': role,
            'title': duty_titles.get(role, f"{role} Scrapper"),
            'defaultTiming': duty_timings.get(role, 'Scheduled Timing'),
            'weeks': item['weeks']
        })

    from app.models import AppSetting
    structure_data = {
        'matrix': formatted_matrix,
        'duties': duties,
        'dutyTitles': duty_titles,
        'dutyTimings': duty_timings,
        'people': people,
        'weeksCount': weeks
    }
    setting = AppSetting.query.filter_by(key='scrapper_roster_structure').first()
    if not setting:
        setting = AppSetting(key='scrapper_roster_structure', value=json.dumps(structure_data))
        db.session.add(setting)
    else:
        setting.value = json.dumps(structure_data)

    legacy = AppSetting.query.filter_by(key='scrapper_roster_matrix').first()
    if not legacy:
        legacy = AppSetting(key='scrapper_roster_matrix', value=json.dumps(formatted_matrix))
        db.session.add(legacy)
    else:
        legacy.value = json.dumps(formatted_matrix)

    _record_roster_audit(actor_email, 'Randomly Assigned Roster', f"Generated {len(duties)} duties x {weeks} weeks complete conflict-free schedule")
    db.session.commit()

    return jsonify({
        'success': True,
        'message': message,
        'matrix': formatted_matrix,
        'duties': duties,
        'people': people,
        'weeksCount': weeks
    })


@roster_bp.route('/scrapper-matrix', methods=['PUT'])
@jwt_required()
def update_scrapper_matrix():
    """Manual Edit Option: Allows saving customized assignments in the Scrapper Matrix."""
    from app.models import AppSetting
    user = get_current_user()
    actor_email = user.email if user else 'Nishant'
    payload = request.get_json() or {}
    matrix = payload.get('matrix')
    duties = payload.get('duties')
    people = payload.get('people')
    weeks_count = payload.get('weeksCount')

    if not matrix or not isinstance(matrix, list):
        return jsonify({'success': False, 'message': 'Matrix list required'}), 400

    _, cur_duties, duty_titles, duty_timings, cur_people, cur_weeks = _get_roster_data()
    final_duties = duties or cur_duties or [r.get('role') for r in matrix]
    final_people = people or cur_people or DEFAULT_ROSTER_PEOPLE
    final_weeks = int(weeks_count or cur_weeks or 5)

    structure_data = {
        'matrix': matrix,
        'duties': final_duties,
        'dutyTitles': duty_titles,
        'dutyTimings': duty_timings,
        'people': final_people,
        'weeksCount': final_weeks
    }
    setting = AppSetting.query.filter_by(key='scrapper_roster_structure').first()
    if not setting:
        setting = AppSetting(key='scrapper_roster_structure', value=json.dumps(structure_data))
        db.session.add(setting)
    else:
        setting.value = json.dumps(structure_data)

    legacy = AppSetting.query.filter_by(key='scrapper_roster_matrix').first()
    if not legacy:
        legacy = AppSetting(key='scrapper_roster_matrix', value=json.dumps(matrix))
        db.session.add(legacy)
    else:
        legacy.value = json.dumps(matrix)

    _record_roster_audit(actor_email, 'Updated Scrapper Rotation Matrix', f"Edited {len(matrix)} roles")
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Scrapper Rotation Matrix updated successfully.',
        'matrix': matrix,
        'duties': final_duties,
        'people': final_people,
        'weeksCount': final_weeks
    })


@roster_bp.route('/structure', methods=['POST'])
@jwt_required()
def update_roster_structure():
    """Allows adding/editing/removing duties and people, and changing weeks count dynamically."""
    from app.models import AppSetting
    user = get_current_user()
    actor_email = user.email if user else 'Nishant'
    payload = request.get_json() or {}

    current_matrix, default_duties, duty_titles, duty_timings, default_people, default_weeks = _get_roster_data()

    new_duties = payload.get('duties', default_duties)
    new_people = payload.get('people', default_people)
    new_weeks = payload.get('weeksCount', default_weeks)
    custom_titles = payload.get('dutyTitles', duty_titles)
    custom_timings = payload.get('dutyTimings', duty_timings)
    matrix = payload.get('matrix')

    try:
        new_weeks = int(new_weeks)
    except (ValueError, TypeError):
        new_weeks = 5

    if not matrix or len(matrix) != len(new_duties):
        matrix = []
        for d_idx, d in enumerate(new_duties):
            row_weeks = {}
            for w in range(1, new_weeks + 1):
                p_idx = (d_idx + w - 1) % max(1, len(new_people))
                row_weeks[w] = new_people[p_idx] if new_people else 'Unassigned'
            matrix.append({
                'role': d,
                'title': custom_titles.get(d, f"{d} Scrapper"),
                'defaultTiming': custom_timings.get(d, 'Scheduled Timing'),
                'weeks': row_weeks
            })

    structure_data = {
        'matrix': matrix,
        'duties': new_duties,
        'dutyTitles': custom_titles,
        'dutyTimings': custom_timings,
        'people': new_people,
        'weeksCount': new_weeks
    }
    setting = AppSetting.query.filter_by(key='scrapper_roster_structure').first()
    if not setting:
        setting = AppSetting(key='scrapper_roster_structure', value=json.dumps(structure_data))
        db.session.add(setting)
    else:
        setting.value = json.dumps(structure_data)

    legacy = AppSetting.query.filter_by(key='scrapper_roster_matrix').first()
    if not legacy:
        legacy = AppSetting(key='scrapper_roster_matrix', value=json.dumps(matrix))
        db.session.add(legacy)
    else:
        legacy.value = json.dumps(matrix)

    _record_roster_audit(actor_email, 'Updated Roster Structure', f"Duties: {len(new_duties)}, People: {len(new_people)}, Weeks: {new_weeks}")
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Roster structure updated successfully.',
        'matrix': matrix,
        'duties': new_duties,
        'dutyTitles': custom_titles,
        'dutyTimings': custom_timings,
        'people': new_people,
        'weeksCount': new_weeks
    })


@roster_bp.route('/monthly-schedule', methods=['GET'])
def get_monthly_schedule():
    """
    Returns rolling calendar schedule for the active month, seamlessly continuing into
    the 1st week of the next month with continuous rotation.
    """
    from datetime import timedelta
    today = date.today()
    matrix, duties, duty_titles, duty_timings, people, weeks_count = _get_roster_data()
    active_week = _get_active_week_num(weeks_count)

    current_year = today.year
    current_month = today.month
    next_month_year = current_year if current_month < 12 else current_year + 1
    next_month_num = current_month + 1 if current_month < 12 else 1

    first_day_current_month = date(current_year, current_month, 1)
    first_monday = first_day_current_month - timedelta(days=first_day_current_month.weekday())

    weeks = []
    curr = first_monday
    w_idx = 0
    while True:
        end = curr + timedelta(days=4)  # Working days Monday through Friday
        calendar_week_num = w_idx + 1
        cycle_week = (w_idx % max(1, weeks_count)) + 1

        is_next_month = (curr.month == next_month_num and curr.year == next_month_year)
        
        duty_assignments = {}
        for row in matrix:
            r_name = row['role']
            w_map = row.get('weeks', {})
            assigned = w_map.get(cycle_week) or w_map.get(str(cycle_week)) or (people[0] if people else 'Nishant')
            duty_assignments[r_name] = assigned

        weeks.append({
            'weekNumber': calendar_week_num,
            'cycleWeek': cycle_week,
            'cycleLabel': f"Week {cycle_week}",
            'startDate': curr.strftime('%Y-%m-%d'),
            'endDate': end.strftime('%Y-%m-%d'),
            'dateRange': f"{curr.strftime('%d %b')} - {end.strftime('%d %b')}",
            'fullRange': f"{curr.strftime('%d %b %Y')} - {end.strftime('%d %b %Y')}",
            'month': curr.strftime('%B %Y'),
            'isCurrent': (curr <= today <= (curr + timedelta(days=6))),
            'isNextMonthFirstWeek': is_next_month,
            'assignments': duty_assignments
        })

        curr += timedelta(days=7)
        w_idx += 1
        if is_next_month:
            break
        if w_idx >= 8:
            break

    return jsonify({
        'success': True,
        'currentMonth': today.strftime('%B %Y'),
        'nextMonth': date(next_month_year, next_month_num, 1).strftime('%B %Y'),
        'weeksCount': weeks_count,
        'weeks': weeks,
        'duties': duties,
        'dutyTitles': duty_titles,
        'dutyTimings': duty_timings,
        'people': people
    })



@roster_bp.route('/rake-zones', methods=['PUT'])
@jwt_required()
def update_rake_zones():
    """Manual Edit Option: Allows editing the railway zones allocated to each teammate."""
    from app.models import AppSetting
    user = get_current_user()
    actor_email = user.email if user else 'Nishant'
    payload = request.get_json() or {}
    person = payload.get('person')
    new_zones = payload.get('zones')
    new_zone_names = payload.get('zoneNames', '')
    status = payload.get('status', 'Active')
    due_date = payload.get('date') or payload.get('dueDate')

    current_rakes = _get_rake_movement_data()
    updated = False
    for r in current_rakes:
        if r['person'].lower() == (person or '').lower():
            r['zones'] = new_zones
            r['zoneList'] = [z.strip() for z in (new_zones or '').split(',') if z.strip() and z.strip().lower() != 'none']
            if new_zone_names:
                r['zoneNames'] = new_zone_names
            r['status'] = status
            if due_date:
                r['date'] = due_date
                r['dayDate'] = f"Tuesday, {due_date}"
                r['schedule'] = f"Every Tuesday ({due_date})"
            updated = True
            break

    if not updated and person:
        current_rakes.append({
            'person': person,
            'email': PERSON_EMAILS.get(person, f"{person.lower()}@agalabs.com"),
            'zones': new_zones,
            'zoneList': [z.strip() for z in (new_zones or '').split(',') if z.strip()],
            'zoneNames': new_zone_names,
            'date': due_date or '27-Oct-2026',
            'dayDate': f"Tuesday, {due_date or '27-Oct-2026'}",
            'schedule': f"Every Tuesday ({due_date or '27-Oct-2026'})",
            'status': status
        })

    setting = AppSetting.query.filter_by(key='rake_movement_zones').first()
    if not setting:
        setting = AppSetting(key='rake_movement_zones', value=json.dumps(current_rakes))
        db.session.add(setting)
    else:
        setting.value = json.dumps(current_rakes)

    _record_roster_audit(actor_email, f"Updated Rake Zones for {person}", f"Zones: {new_zones}, Date: {due_date}")
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f"Railway zones for {person} updated.",
        'rakeMovement': current_rakes
    })


@roster_bp.route('/rake-date', methods=['POST'])
@jwt_required()
def update_rake_date():
    """Manual Edit Option: Allows setting the Tuesday Rake Movement due date in the UI."""
    from app.models import AppSetting
    user = get_current_user()
    actor_email = user.email if user else 'Nishant'
    payload = request.get_json() or {}
    new_date = payload.get('date', '').strip()
    person = payload.get('person')

    if not new_date:
        return jsonify({'success': False, 'message': 'Date required'}), 400

    current_rakes = _get_rake_movement_data()
    for r in current_rakes:
        if not person or r['person'].lower() == person.lower():
            r['date'] = new_date
            r['dayDate'] = f"Tuesday, {new_date}"
            r['schedule'] = f"Every Tuesday ({new_date})"

    setting = AppSetting.query.filter_by(key='rake_movement_zones').first()
    if not setting:
        setting = AppSetting(key='rake_movement_zones', value=json.dumps(current_rakes))
        db.session.add(setting)
    else:
        setting.value = json.dumps(current_rakes)

    _record_roster_audit(actor_email, "Updated Rake Movement Due Date", f"Date: {new_date}")
    db.session.commit()
    return jsonify({
        'success': True,
        'message': f"Rake Movement date successfully set to {new_date}",
        'date': new_date,
        'rakeMovement': current_rakes
    })


@roster_bp.route('/monthly-duties', methods=['PUT'])
@jwt_required()
def update_monthly_duties():
    """Manual Edit Option: Allows editing person and dates for Monthly Macro Duties (WPI, CPI, AW Report)."""
    from app.models import AppSetting
    user = get_current_user()
    actor_email = user.email if user else 'Nishant'
    payload = request.get_json() or {}
    duties = payload.get('duties')

    if not duties or not isinstance(duties, list):
        return jsonify({'success': False, 'message': 'Duties list required'}), 400

    setting = AppSetting.query.filter_by(key='monthly_macro_duties').first()
    if not setting:
        setting = AppSetting(key='monthly_macro_duties', value=json.dumps(duties))
        db.session.add(setting)
    else:
        setting.value = json.dumps(duties)

    # Sync RosterConfig for monthly duties
    for d in duties:
        duty_name = d.get('duty')
        person_name = d.get('assignedPerson', '')
        person_email = d.get('assignedEmail') or PERSON_EMAILS.get(person_name, f"{person_name.lower()}@agalabs.com")
        due_day = d.get('dueDay', '15th').replace('th', '').replace('st', '').replace('nd', '').replace('rd', '').strip()

        rc = RosterConfig.query.filter(RosterConfig.role.ilike(f"%{duty_name}%")).first()
        if rc:
            rc.employee = person_email
            rc.schedule_day = due_day
        else:
            rc = RosterConfig(
                role=f"{duty_name} Monthly",
                employee=person_email,
                frequency='Monthly',
                schedule_day=due_day,
                remark=d.get('rule', '')
            )
            db.session.add(rc)

    _record_roster_audit(actor_email, 'Updated Monthly Macro Duties', f"Updated {len(duties)} duties")
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Monthly Macro Duties (person and dates) updated successfully.',
        'monthlyRotation': duties
    })


@roster_bp.route('/apply-week', methods=['POST'])
@jwt_required()
def apply_scrapper_week():
    """Applies a selected week (1-6) from the 6-Week Scrapper Roster to live RosterConfig and logs it."""
    from app.models import AppSetting
    user = get_current_user()
    actor_email = user.email if user else 'Nishant'
    payload = request.get_json() or {}
    week = payload.get('week')

    try:
        week = int(week)
    except (ValueError, TypeError):
        week = 1

    _, _, _, _, _, weeks_count = _get_roster_data()
    if not (1 <= week <= weeks_count):
        return jsonify({'success': False, 'message': f'Week must be between 1 and {weeks_count}'}), 400

    # Save active week in AppSetting
    setting = AppSetting.query.filter_by(key='active_scrapper_week').first()
    if not setting:
        setting = AppSetting(key='active_scrapper_week', value=str(week))
        db.session.add(setting)
    else:
        setting.value = str(week)

    matrix = _get_scrapper_matrix_data()
    today_dt = date.today()

    # Sync RosterConfig for the 5 scrapper roles and write RosterLog
    updated_roles = []
    for item in matrix:
        role_name = item['role']
        # weeks dictionary keys might be str or int
        weeks_map = item.get('weeks', {})
        assignee_name = weeks_map.get(week) or weeks_map.get(str(week)) or 'Nishant'
        assignee_email = PERSON_EMAILS.get(assignee_name, f"{assignee_name.lower()}@agalabs.com")

        rc = RosterConfig.query.filter_by(role=role_name).first()
        if rc:
            rc.employee = assignee_email
            rc.frequency = item.get('frequency', 'Daily')
            if not rc.remark:
                rc.remark = item.get('defaultTiming', '')
        else:
            rc = RosterConfig(
                role=role_name,
                employee=assignee_email,
                frequency=item.get('frequency', 'Daily'),
                remark=item.get('defaultTiming', '')
            )
            db.session.add(rc)

        # Log to RosterLog for audit trail
        rlog = RosterLog.query.filter_by(date=today_dt, role=role_name).first()
        if rlog:
            rlog.employee = assignee_name
            rlog.status = f"Week {week} Active"
            rlog.updated_at = datetime.now(timezone.utc)
        else:
            rlog = RosterLog(
                date=today_dt,
                role=role_name,
                employee=assignee_name,
                status=f"Week {week} Active"
            )
            db.session.add(rlog)

        updated_roles.append({'role': role_name, 'employee': assignee_name, 'email': assignee_email})

    _record_roster_audit(actor_email, f"Applied Roster Week {week}", f"Synchronized 5 scrapper roles to Week {week}")
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Active Roster Plan updated to Week {week} from Scrapper For REf.xlsx. Logs recorded.',
        'activeWeek': week,
        'updatedRoles': updated_roles
    })


@roster_bp.route('/logs', methods=['GET'])
def get_roster_logs():
    """Returns complete logs of roster changes, duty assignments, and status updates."""
    from app.models import AuditLog
    def _fmt(val):
        if not val:
            return ''
        if hasattr(val, 'strftime'):
            return val.strftime('%Y-%m-%d %H:%M')
        return str(val)[:16]

    r_logs = RosterLog.query.order_by(RosterLog.id.desc()).limit(60).all()
    audit_logs = AuditLog.query.filter(AuditLog.target_type == 'Roster').order_by(AuditLog.audit_id.desc()).limit(40).all()

    combined = []
    for r in r_logs:
        combined.append({
            'id': f"RL-{r.id}",
            'type': 'Duty Status',
            'date': str(r.date),
            'role': r.role,
            'employee': r.employee,
            'status': r.status,
            'timestamp': _fmt(getattr(r, 'updated_at', None) or r.date),
            'loggedBy': 'System / Teammate',
            'details': f"Duty {r.role} status marked as {r.status} for {r.date}"
        })

    for a in audit_logs:
        combined.append({
            'id': a.audit_id,
            'type': 'Plan Event',
            'date': _fmt(a.timestamp)[:10],
            'role': a.action,
            'employee': a.actor_email,
            'status': 'Audit Logged',
            'timestamp': _fmt(a.timestamp),
            'loggedBy': a.actor_email,
            'details': a.after_json or ''
        })

    # Sort combined by timestamp desc
    combined.sort(key=lambda x: str(x.get('timestamp') or ''), reverse=True)

    return jsonify({
        'success': True,
        'logs': combined[:80]
    })


# ─── Backward Compatibility Aliases ──────────────────────────────────────────
SCRAPPER_ROSTER_MATRIX = DEFAULT_SCRAPPER_ROSTER_MATRIX
RAKE_MOVEMENT_ZONES = DEFAULT_RAKE_MOVEMENT_ZONES
MONTHLY_ROTATION_RULES = DEFAULT_MONTHLY_MACRO_DUTIES
