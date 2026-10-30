"""
Surveillance Service — Advanced MIS Redesign
Live Database Table Surveillance against `agalabsdev_stage` with graceful fallback
to `latest_two_dates_agalabsdev_stage` snapshot data.
Supports multi-stream daily updates (prices, news, reports) and 15th-20th monthly cycle windows (Trade Flow).
"""
import os
import glob
import re
from datetime import datetime, date, timedelta, time, timezone
import pymysql
from app import db
from app.models import DBTaskCatalog, ManagerTaskPull, TaskSkip, TaskRemark, DBTaskVerification

STAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'latest_two_dates_agalabsdev_stage', 'latest_two_dates_agalabsdev_stage')
SUMMARY_PATH = os.path.join(STAGE_DIR, '_export_summary.txt')

# In-memory cache for fast grid renders
_SURVEILLANCE_CACHE = {
    'timestamp': None,
    'data': [],
    'summary': {}
}


def invalidate_surveillance_cache():
    """Invalidates the in-memory surveillance cache to force fresh calculation."""
    _SURVEILLANCE_CACHE['timestamp'] = None
    _SURVEILLANCE_CACHE['data'] = []
    _SURVEILLANCE_CACHE['summary'] = {}


def parse_export_summary():
    """Reads snapshot table dates from _export_summary.txt for offline/local fallback."""
    table_meta = {}
    if not os.path.exists(SUMMARY_PATH):
        return table_meta

    try:
        with open(SUMMARY_PATH, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if line.startswith('Table: '):
                    parts = [p.strip() for p in line.strip().split('|')]
                    tname = parts[0].replace('Table:', '').strip()
                    date_col = parts[2].replace('Date column:', '').strip() if len(parts) > 2 else 'Date'
                    dates_str = parts[3].replace('Dates:', '').strip() if len(parts) > 3 else ''
                    
                    # Extract latest date
                    first_date = dates_str.split(',')[0].strip() if dates_str else ''
                    if ' ' in first_date:
                        first_date = first_date.split(' ')[0]
                    table_meta[tname] = {
                        'date_column': date_col,
                        'latest_date': first_date
                    }
    except Exception as e:
        print(f"Warning parsing summary: {e}")
    return table_meta

COMMODITY_NORM_MAP = {
    # Individual Pulse Commodities (Bengal Gram, Tur, Urad, Moong, Masoor, Pea):
    'Bengal Gram (Chana)': 'Bengal Gram',
    'Bengal Gram': 'Bengal Gram',
    'Chana': 'Bengal Gram',
    'Gram': 'Bengal Gram',
    'Tur': 'Tur',
    'Arhar': 'Tur',
    'Pigeon Pea': 'Tur',
    'Urad': 'Urad',
    'Black Matpe': 'Urad',
    'Moong': 'Moong',
    'Green Gram': 'Moong',
    'Masoor': 'Masoor',
    'Lentil': 'Masoor',
    'Red Lentils': 'Masoor',
    'Pea': 'Pea',
    'Peas': 'Pea',
    'Yellow Peas': 'Pea',
    'Green Peas': 'Pea',
    'Pulses': 'Bengal Gram, Tur, Urad, Moong, Masoor, Pea',
    'Chana & Pulses': 'Bengal Gram, Tur, Urad, Moong, Masoor, Pea',
    'Pulses / Tops': 'Bengal Gram, Tur, Urad, Moong, Masoor, Pea, Tops',

    # 2. Tops (Tomato, Potato, Onion)
    'TOP (Tomato, Onion, Potato)': 'Tops',
    'Tops': 'Tops',
    'Tomato': 'Tops',
    'Potato': 'Tops',
    'Onion': 'Tops',

    # 3. Soybeans
    'Soybeans': 'Soybeans',
    'Soybeans & Oilseeds': 'Soybeans',
    'Soybeans/Oilseeds': 'Soybeans',
    'Soymeal': 'Soybeans',

    # 4. Rapeseed
    'Rapeseed': 'Rapeseed',
    'Mustard': 'Rapeseed',
    'RM Seed': 'Rapeseed',
    'Oilseeds': 'Rapeseed',
    'Edible Oils': 'Rapeseed',

    # 5. Cotton
    'Cotton': 'Cotton',

    # 6. Chilli
    'Chilli': 'Chilli',
    'Chilli & Spices': 'Chilli',

    # 7. Coriander
    'Coriander': 'Coriander',
    'Dhaniya': 'Coriander',

    # 8. Cumin
    'Cumin': 'Cumin',
    'Jeera': 'Cumin',

    # 9. Turmeric
    'Turmeric': 'Turmeric',

    # 10. Weather
    'Weather': 'Weather',
    'Weather & Crop NDVI': 'Weather',
    'Agri-Climate': 'Weather',
    'Climatology & Weather': 'Weather',

    # 11. Maize
    'Maize': 'Maize',
    'Maize & Feed Grains': 'Maize',
    'Maize / Cereals': 'Maize',
    'Feed Grains': 'Maize',
    'Feed/Grains': 'Maize',

    # 12. Bajra
    'Bajra': 'Bajra',

    # 13. Barley
    'Barley': 'Barley',
    'Maize/Barley': 'Barley',

    # 14. Sugar
    'Sugar': 'Sugar',
    'Sugar & Bio-Energy': 'Sugar',
    'Bio-Energy': 'Sugar',
    'Energy': 'Sugar',

    # 15. Wheat
    'Wheat': 'Wheat',
    'Wheat & Foodgrains': 'Wheat',
    'Foodgrains': 'Wheat',
    'Grains': 'Wheat',

    # 16. Rice
    'Rice': 'Rice',
    'Wheat & Rice': 'Rice',
    'Paddy': 'Rice'
}

def get_source_pipeline(raw_table_name):
    t = (raw_table_name or '').lower()
    if t.startswith('sopa_'):
        return 'SOPA'
    elif t.startswith('ipga_'):
        return 'IPGA'
    elif t.startswith('pyexcel_'):
        return 'PyExcel'
    elif t.startswith('pystage_'):
        return 'PyStage'
    return 'Other'


_MYSQL_DOWN_UNTIL = None

def get_live_mysql_connection():
    """Tries to connect to the live agalabsdev_stage MySQL database with failure cooldown."""
    global _MYSQL_DOWN_UNTIL
    now = datetime.now()
    if _MYSQL_DOWN_UNTIL and now < _MYSQL_DOWN_UNTIL:
        return None

    host = os.getenv('STAGE_DB_HOST', '127.0.0.1')
    port = int(os.getenv('STAGE_DB_PORT', 3306))
    user = os.getenv('STAGE_DB_USER', 'root')
    password = os.getenv('STAGE_DB_PASS') or 'Nishant@321'
    database = os.getenv('STAGE_DB_NAME', 'agalabsdev_stage')

    try:
        conn = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            connect_timeout=1,
            cursorclass=pymysql.cursors.DictCursor
        )
        _MYSQL_DOWN_UNTIL = None
        return conn
    except Exception:
        _MYSQL_DOWN_UNTIL = now + timedelta(seconds=45)
        return None


def is_valid_date_str(val):
    """Validates that a string looks like an actual date or year, not an image URL or random text."""
    if not val:
        return False
    if isinstance(val, (datetime, date)):
        return True
    s = str(val).strip()
    if len(s) < 4 or len(s) > 35:
        return False
    if s.startswith(('http://', 'https://', '/', '\\', 'ftp://', '{', '[', '<')):
        return False
    # Standard YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
    if re.match(r'^\d{4}[-/]\d{1,2}([-/]\d{1,2})?', s):
        return True
    # DD-MM-YYYY or DD/MM/YYYY
    if re.match(r'^\d{1,2}[-/]\d{1,2}[-/]\d{4}', s):
        return True
    # 4-digit Year e.g. 2026
    if re.match(r'^\d{4}$', s):
        return True
    return False


def get_prioritized_date_candidates(table_name, configured_col=None):
    """
    Returns an ordered list of candidate date columns to probe for a given table:
    1. Specifically for Sowing Progress tables: WeekEndingDate
    2. Specifically for Rake Movement tables: MetwithDate
    3. Specifically for Port Lineups tables: PdfDate
    4. General tables:
       1st priority: configured_col, to_date, Date, published_at, created_at, updated_at, CreatedDate, TimeStamp, time
       2nd priority: MarketYear, market_year, MarketYearDate, Year
    """
    tlower = (table_name or '').lower()
    candidates = []

    # Table-specific overrides requested by user
    if 'sowing' in tlower:
        candidates.extend(['WeekEndingDate', 'weekendingdate'])
    elif 'rakemovement' in tlower or 'rake_movement' in tlower:
        candidates.extend(['MetwithDate', 'metwithdate', 'DemandDate'])
    elif 'port_lineup' in tlower or 'lineup' in tlower:
        candidates.extend(['PdfDate', 'pdfdate', 'BerthedDate'])

    if configured_col and configured_col not in candidates:
        candidates.append(configured_col)

    # 1st Priority: to_date, Date, published_at, created_at, updated_at, time, TimeStamp, CreatedDate
    candidates.extend([
        'to_date', 'ToDate', 'Date', 'date',
        'published_at', 'PublishedAt', 'created_at', 'CreatedAt', 'updated_at', 'UpdatedAt',
        'TimeStamp', 'timestamp', 'CreatedDate', 'created_date', 'createdDate',
        'time', 'Time', 'DateTime', 'datetime'
    ])
    # 2nd Priority: MarketYear, MarketYearDate, Year
    candidates.extend(['MarketYear', 'market_year', 'MarketYearDate', 'Year', 'year'])

    # Deduplicate while preserving order
    seen = set()
    result = []
    for c in candidates:
        clow = c.lower()
        if clow not in seen:
            seen.add(clow)
            result.append(c)
    return result


def query_max_date_from_db(conn, table_name, date_col):
    """Executes SELECT MAX(date_column) against agalabsdev_stage with prioritized candidate fallback."""
    candidates = get_prioritized_date_candidates(table_name, date_col)
    try:
        with conn.cursor() as cur:
            for col in candidates:
                try:
                    query = f"SELECT MAX(`{col}`) AS max_date FROM `{table_name}` WHERE `{col}` IS NOT NULL AND `{col}` >= '1900-01-01';"
                    cur.execute(query)
                    row = cur.fetchone()
                    if row and row['max_date']:
                        val = row['max_date']
                        if isinstance(val, (datetime, date)):
                            return val.strftime('%Y-%m-%d')
                        d_str = str(val).split(' ')[0]
                        if is_valid_date_str(d_str):
                            return d_str
                except Exception:
                    continue
    except Exception:
        pass
    return None


def verify_table_data_in_db(table_name, date_col='Date', target_date_str=None):
    """
    Verifies if records exist in MySQL agalabsdev_stage for the given date.
    Gracefully falls back to snapshot CSV if live MySQL is unavailable.
    Resolves date columns using:
    - 1st to date (to_date, Date, published_at, created_at, CreatedDate)
    - 2nd market year (MarketYear, Year)
    - WeekEndingDate for sowing progress
    - MetwithDate for rakemovement
    - PdfDate for portlineups
    Returns: dict with { verified, matching_rows, latest_date, total_rows, table_name, target_date, source_type }
    """
    if not target_date_str:
        target_date_str = date.today().strftime('%Y-%m-%d')

    candidates = get_prioritized_date_candidates(table_name, date_col)

    live_conn = get_live_mysql_connection()
    if live_conn:
        try:
            with live_conn.cursor() as cur:
                # Try candidates in order
                for col in candidates:
                    try:
                        # Count rows for specific target_date
                        q1 = f"SELECT COUNT(*) AS cnt, MAX(`{col}`) AS max_date FROM `{table_name}` WHERE (`{col}` = %s OR `{col}` LIKE %s);"
                        cur.execute(q1, (target_date_str, f"{target_date_str}%"))
                        row1 = cur.fetchone()
                        matching_cnt = row1['cnt'] if row1 and row1['cnt'] is not None else 0

                        # Count total rows and overall latest date
                        q2 = f"SELECT COUNT(*) AS total_cnt, MAX(`{col}`) AS global_max FROM `{table_name}` WHERE `{col}` IS NOT NULL AND `{col}` >= '1900-01-01';"
                        cur.execute(q2)
                        row2 = cur.fetchone()
                        total_cnt = row2['total_cnt'] if row2 and row2['total_cnt'] is not None else 0
                        global_max = row2['global_max'] if row2 else None
                        if isinstance(global_max, (datetime, date)):
                            global_max = global_max.strftime('%Y-%m-%d')
                        elif global_max:
                            d_cand = str(global_max).split(' ')[0]
                            global_max = d_cand if is_valid_date_str(d_cand) else None

                        live_conn.close()
                        is_verif = (matching_cnt > 0) or (bool(global_max) and is_valid_date_str(global_max) and global_max >= target_date_str)
                        return {
                            'verified': is_verif,
                            'matching_rows': matching_cnt if matching_cnt > 0 else (1 if is_verif else 0),
                            'latest_date': global_max or target_date_str,
                            'total_rows': total_cnt,
                            'table_name': table_name,
                            'target_date': target_date_str,
                            'source_type': 'Live MySQL (agalabsdev_stage)'
                        }
                    except Exception:
                        continue
        except Exception:
            if live_conn:
                live_conn.close()

    # Fallback: scan snapshot CSV
    import csv
    csv_path = os.path.join(STAGE_DIR, f"{table_name}.csv")
    if os.path.exists(csv_path):
        try:
            with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.reader(f)
                header = next(reader, None)
                if header:
                    header_clean = [c.lower().replace('\ufeff', '').strip() for c in header]
                    date_idx = None
                    for cand in candidates:
                        cand_low = cand.lower().strip()
                        if cand_low in header_clean:
                            date_idx = header_clean.index(cand_low)
                            break

                    matching_rows = 0
                    all_dates = set()
                    total_rows = 0
                    if date_idx is not None:
                        for row in reader:
                            total_rows += 1
                            if len(row) > date_idx:
                                d_str = row[date_idx].strip().split(' ')[0]
                                if is_valid_date_str(d_str):
                                    all_dates.add(d_str)
                                    if d_str == target_date_str:
                                        matching_rows += 1
                    else:
                        for _ in reader:
                            total_rows += 1

                    latest_date = max(all_dates) if all_dates else None
                    is_verif = (matching_rows > 0) or (bool(latest_date) and latest_date >= target_date_str)
                    return {
                        'verified': is_verif,
                        'matching_rows': matching_rows if matching_rows > 0 else (1 if is_verif else 0),
                        'latest_date': latest_date or target_date_str,
                        'total_rows': total_rows,
                        'table_name': table_name,
                        'target_date': target_date_str,
                        'source_type': 'Snapshot CSV (agalabsdev_stage)'
                    }
        except Exception:
            pass

    return {
        'verified': False,
        'matching_rows': 0,
        'latest_date': None,
        'total_rows': 0,
        'table_name': table_name,
        'target_date': target_date_str,
        'source_type': 'Snapshot CSV (agalabsdev_stage)'
    }


def get_snapshot_latest_date(table_name, date_col=None):
    """Scans snapshot CSV using prioritized date column candidates to determine latest date."""
    csv_path = os.path.join(STAGE_DIR, f"{table_name}.csv")
    if not os.path.exists(csv_path):
        return None
    try:
        import csv
        with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if not header:
                return None
            header_clean = [c.lower().replace('\ufeff', '').strip() for c in header]
            candidates = get_prioritized_date_candidates(table_name, date_col)
            date_idx = None
            for cand in candidates:
                cand_low = cand.lower().strip()
                if cand_low in header_clean:
                    date_idx = header_clean.index(cand_low)
                    break
            if date_idx is None:
                return None

            all_dates = []
            for row in reader:
                if len(row) > date_idx:
                    d_str = row[date_idx].strip().split(' ')[0]
                    if is_valid_date_str(d_str):
                        all_dates.append(d_str)
            if all_dates:
                return max(all_dates)
    except Exception:
        pass
    return None


def evaluate_table_status(item, latest_date_str, today_date, active_pull, active_skip, active_verification=None):
    """
    Computes PASS / FAIL / SKIP / PULL / WINDOW_ACTIVE / AWAITING_WINDOW / AWAITING_PULL
    governed by operational rules:
    - User/DB Verification: Overrides with PASS and row count.
    - Admin Skip: Overrides with documented reason.
    - Monthly Trade Flow: Gated by 15th-20th cycle window.
    - Other Monthly/Yearly: Gated by Manager Pull SLA.
    - Daily/Weekly: Evaluated against cutoff times.
    """
    # 1. Check for Admin Skip
    if active_skip:
        return 'SKIP', f"Admin Skipped: {active_skip.reason}"

    # 2. Check for User / DB Verification & Manager Actions
    if active_verification:
        v_status = (active_verification.status or 'VERIFIED').upper()
        v_rows = active_verification.row_count
        row_str = f" ({v_rows} rows in DB)" if v_rows > 0 else ""
        msg_str = f": {active_verification.notes}" if active_verification.notes else ""
        
        if v_status in ['NEED_CORRECTION', 'CORRECTION']:
            return 'NEED_CORRECTION', f"Needs Correction ({active_verification.verified_by}{msg_str})"
        elif v_status in ['NOT_CORRECT', 'REJECTED']:
            return 'NOT_CORRECT', f"Rejected / Discrepancy ({active_verification.verified_by}{msg_str})"
        elif v_status == 'PENDING':
            return 'PENDING', f"Marked Pending by {active_verification.verified_by}{msg_str}"
        elif v_status == 'VERIFIED':
            return 'PASS', f"Verified by {active_verification.verified_by} for {active_verification.report_date}{row_str}"

    freq = (item.frequency or 'Daily').strip()
    table_lower = item.raw_table_name.lower()
    final_lower = item.final_name.lower()

    # 3. Check for Monthly with 15th-20th Cycle Window (e.g. pyexcel_trade_flow)
    if 'trade_flow' in table_lower or '15' in final_lower or 'trade flow' in final_lower:
        day_of_month = today_date.day
        is_updated_cycle = False
        if latest_date_str:
            try:
                d_val = datetime.strptime(latest_date_str, '%Y-%m-%d').date()
                # If updated within past 40 days, or current/prior month
                if (today_date - d_val).days <= 40:
                    is_updated_cycle = True
            except Exception:
                pass

        if is_updated_cycle:
            return 'PASS', 'Updated for current 15th–20th cycle'
        
        if day_of_month < 15:
            return 'AWAITING_WINDOW', 'Window upcoming: Due between 15th–20th'
        elif 15 <= day_of_month <= 20:
            return 'WINDOW_ACTIVE', f'Cycle Window Open: Due by 20th ({20 - day_of_month} days left)'
        else: # day > 20
            return 'FAIL', 'Late: 15th–20th monthly publication cycle elapsed'

    # 4. Check for other Monthly / Yearly / Occasional Cadence
    if freq in ['Monthly', 'Yearly', 'Occasionally', 'Quarterly']:
        if not active_pull or active_pull.status != 'Open':
            return 'AWAITING_PULL', 'Awaiting Manager Publication Signal'
        
        # Pull is active: verify if DB updated after pull date
        if latest_date_str and latest_date_str >= active_pull.pulled_at.strftime('%Y-%m-%d'):
            return 'PASS', 'Completed on time'
        
        # Check SLA deadline
        now_utc = datetime.now(timezone.utc)
        deadline = active_pull.deadline.replace(tzinfo=timezone.utc) if active_pull.deadline.tzinfo is None else active_pull.deadline
        if now_utc > deadline:
            return 'FAIL', 'SLA Expired without DB update'
        
        return 'PULL', f"SLA countdown active (due {active_pull.deadline.strftime('%Y-%m-%d %H:%M')})"

    # 5. Daily & Weekly Automatic Evaluation
    if not latest_date_str:
        return 'FAIL', 'No data dates found in table'

    try:
        d_val = datetime.strptime(latest_date_str, '%Y-%m-%d').date()
    except Exception:
        return 'PASS', ''

    if freq == 'Daily':
        cutoff_str = getattr(item, 'target_cutoff_time', '18:30') or '18:30'
        try:
            ch, cm = map(int, cutoff_str.split(':'))
            cutoff_t = time(ch, cm)
        except Exception:
            cutoff_t = time(18, 30)

        now_t = datetime.now().time()
        cutoff_passed = (now_t >= cutoff_t)

        if d_val >= today_date:
            return 'PASS', 'Updated today in DB'
        elif d_val >= today_date - timedelta(days=1):
            if not cutoff_passed:
                return 'PASS', f"Yesterday's data active (Today due by {cutoff_str} IST)"
            else:
                return 'FAIL', f"Late: Today's cutoff ({cutoff_str} IST) elapsed without update"
        else:
            return 'FAIL', f'Late: table last updated on {latest_date_str}'

    elif freq == 'Weekly':
        if d_val >= today_date - timedelta(days=7):
            return 'PASS', 'Updated this week'
        else:
            return 'FAIL', 'Late: no update in past 7 days'

    return 'PASS', ''


def get_surveillance_grid(target_date_str=None, force_refresh=False):
    """
    Fetches the surveillance grid for all catalog tables along with
    real-time progress summaries for Manager overview, cadence aggregate breakdowns,
    pipeline source breakdowns, commodity-basis rollups, and date-wise update matrices.
    Returns: (results_list, summary_dict)
    """
    global _SURVEILLANCE_CACHE
    now = datetime.now()
    today_real = date.today()

    if target_date_str:
        try:
            today_date = datetime.strptime(target_date_str.strip(), '%Y-%m-%d').date()
        except Exception:
            today_date = today_real
    else:
        today_date = today_real

    is_querying_today = (today_date == today_real)
    target_date_formatted = today_date.strftime('%Y-%m-%d')

    if is_querying_today and not force_refresh and _SURVEILLANCE_CACHE['timestamp']:
        if (now - _SURVEILLANCE_CACHE['timestamp']).total_seconds() < 30:
            return _SURVEILLANCE_CACHE['data'], _SURVEILLANCE_CACHE['summary']

    snapshot_meta = parse_export_summary()
    live_conn = get_live_mysql_connection()

    catalog_items = DBTaskCatalog.query.filter_by(is_active=True).all()
    if not catalog_items:
        seed_default_catalog()
        catalog_items = DBTaskCatalog.query.filter_by(is_active=True).all()

    # Load recent verifications (past 7 days around target date)
    verifications = DBTaskVerification.query.filter(
        DBTaskVerification.report_date >= today_date - timedelta(days=7)
    ).order_by(DBTaskVerification.id.desc()).all()
    verif_map = {}
    for v in verifications:
        if v.catalog_id not in verif_map:
            verif_map[v.catalog_id] = v

    # Pre-fetch all open pulls, skips, and latest remarks in 3 batch queries
    all_pulls = {p.catalog_id: p for p in ManagerTaskPull.query.filter_by(status='Open').all()}
    all_skips = {s.catalog_id: s for s in TaskSkip.query.filter_by(skip_date=today_date).all()}
    all_remarks = {}
    for r in TaskRemark.query.order_by(TaskRemark.id.asc()).all():
        all_remarks[r.catalog_id] = r

    results = []
    user_stats = {}
    updated_today_count = 0
    pending_count = 0
    cycle_window_count = 0
    awaiting_pull_count = 0
    remarks_count = 0
    need_correction_count = 0
    not_correct_count = 0

    cadence_summary = {
        'daily': {'total': 0, 'updated': 0, 'pending': 0, 'pct': 0},
        'weekly': {'total': 0, 'updated': 0, 'pending': 0, 'pct': 0},
        'monthly': {'total': 0, 'updated': 0, 'pending': 0, 'pct': 0}
    }

    pipeline_summary = {
        'SOPA': {'total': 0, 'updated': 0, 'pending': 0},
        'IPGA': {'total': 0, 'updated': 0, 'pending': 0},
        'PyExcel': {'total': 0, 'updated': 0, 'pending': 0},
        'PyStage': {'total': 0, 'updated': 0, 'pending': 0},
        'Other': {'total': 0, 'updated': 0, 'pending': 0}
    }

    from collections import defaultdict
    comm_groups = defaultdict(list)

    for item in catalog_items:
        # 1. Determine latest date from MySQL or Snapshot with prioritized candidate probing
        latest_date = None
        if live_conn:
            latest_date = query_max_date_from_db(live_conn, item.raw_table_name, item.date_column)

        if not latest_date:
            latest_date = get_snapshot_latest_date(item.raw_table_name, item.date_column)

        if not latest_date and item.raw_table_name in snapshot_meta:
            latest_date = snapshot_meta[item.raw_table_name].get('latest_date')

        if not latest_date:
            latest_date = '2026-10-14'

        # 2. Check Pull, Skip, Remark, Verification
        active_pull = all_pulls.get(item.id)
        active_skip = all_skips.get(item.id)
        user_remark = all_remarks.get(item.id)
        active_verif = verif_map.get(item.id)

        status, auto_remark = evaluate_table_status(item, latest_date, today_date, active_pull, active_skip, active_verif)
        
        # Due Date / Window Display
        due_date_str = item.target_cutoff_time or '18:30 IST'
        if 'trade_flow' in item.raw_table_name.lower():
            due_date_str = 'Window: 15th–20th Oct'
        elif item.frequency in ['Monthly', 'Yearly', 'Occasionally'] and not active_pull:
            due_date_str = 'Awaiting Publication'
        elif active_pull:
            due_date_str = active_pull.deadline.strftime('%Y-%m-%d %H:%M')

        # Check if updated today / target date
        has_today_data = bool(
            (latest_date and latest_date >= target_date_formatted) or
            (active_verif and str(active_verif.report_date) >= target_date_formatted and active_verif.status == 'VERIFIED')
        )

        is_trade_flow = ('trade_flow' in item.raw_table_name.lower() or 'trade flow' in item.final_name.lower())
        is_up_today = has_today_data or (is_trade_flow and status == 'PASS') or (status == 'SKIP')

        # Granular Today Update Status & Badge Label
        if is_up_today:
            if is_trade_flow:
                today_status = 'CYCLE_UPDATED'
                today_badge_text = 'Updated Today (Cycle)'
                today_badge_class = 'badge-success'
            else:
                today_status = 'UPDATED_TODAY'
                today_badge_text = 'Updated Today'
                today_badge_class = 'badge-success'
        elif active_skip:
            today_status = 'SKIPPED'
            today_badge_text = 'Admin Skipped'
            today_badge_class = 'badge-skipped'
        elif is_trade_flow:
            today_status = 'WINDOW_ACTIVE'
            today_badge_text = 'Cycle Window (Due 20th)'
            today_badge_class = 'badge-window'
        elif status == 'NEED_CORRECTION':
            today_status = 'NEED_CORRECTION'
            today_badge_text = 'Needs Correction'
            today_badge_class = 'badge-correction'
        elif status == 'NOT_CORRECT':
            today_status = 'NOT_CORRECT'
            today_badge_text = 'Not Correct'
            today_badge_class = 'badge-danger'
        elif status == 'FAIL':
            today_status = 'LATE_TODAY'
            today_badge_text = 'Not Updated Today (Overdue)'
            today_badge_class = 'badge-danger'
        else:
            today_status = 'PENDING_TODAY'
            cutoff_val = item.target_cutoff_time or '18:30'
            today_badge_text = f'Not Updated Today (Due {cutoff_val})'
            today_badge_class = 'badge-warning'

        if status == 'NEED_CORRECTION':
            need_correction_count += 1
            pending_count += 1
        elif status == 'NOT_CORRECT':
            not_correct_count += 1
            pending_count += 1
        elif is_up_today:
            updated_today_count += 1
        elif status == 'FAIL':
            pending_count += 1
        elif status in ['WINDOW_ACTIVE', 'AWAITING_WINDOW']:
            cycle_window_count += 1
        elif status == 'AWAITING_PULL':
            awaiting_pull_count += 1
        elif status == 'PENDING':
            pending_count += 1

        if user_remark:
            remarks_count += 1

        # Commodity normalization & source pipeline
        def _clean_comm_list(raw_c):
            if not raw_c: return 'General / Other'
            parts = [p.strip() for p in raw_c.split(',') if p.strip()]
            normed = [COMMODITY_NORM_MAP.get(p, p) for p in parts]
            seen = set()
            res = []
            for x in normed:
                if x.lower() not in seen:
                    seen.add(x.lower())
                    res.append(x)
            return ', '.join(res) if res else 'General / Other'
        norm_commodity = _clean_comm_list(item.commodity)
        source_pipe = get_source_pipeline(item.raw_table_name)

        # Cadence breakdown
        freq = (item.frequency or 'Daily').strip()
        c_key = 'daily' if freq == 'Daily' else ('weekly' if freq == 'Weekly' else 'monthly')
        cadence_summary[c_key]['total'] += 1
        if is_up_today:
            cadence_summary[c_key]['updated'] += 1
        else:
            cadence_summary[c_key]['pending'] += 1

        # Pipeline breakdown
        p_key = source_pipe if source_pipe in pipeline_summary else 'Other'
        pipeline_summary[p_key]['total'] += 1
        if is_up_today:
            pipeline_summary[p_key]['updated'] += 1
        else:
            pipeline_summary[p_key]['pending'] += 1

        # Track user stats (handles single user or comma-separated multiple users)
        raw_u = item.user_name or 'Unassigned'
        assignees_list = [u.strip() for u in raw_u.split(',') if u.strip()]
        for u_name in assignees_list:
            if u_name not in user_stats:
                user_stats[u_name] = {
                    'total': 0, 'updated': 0, 'pending': 0, 'windows': 0,
                    'daily_total': 0, 'daily_updated': 0,
                    'weekly_total': 0, 'weekly_updated': 0,
                    'monthly_total': 0, 'monthly_updated': 0
                }
            user_stats[u_name]['total'] += 1
            if is_up_today:
                user_stats[u_name]['updated'] += 1
            elif status in ['FAIL', 'NEED_CORRECTION', 'NOT_CORRECT', 'PENDING']:
                user_stats[u_name]['pending'] += 1
            elif status in ['WINDOW_ACTIVE', 'AWAITING_WINDOW']:
                user_stats[u_name]['windows'] += 1

            if item.frequency == 'Daily':
                user_stats[u_name]['daily_total'] += 1
                if is_up_today:
                    user_stats[u_name]['daily_updated'] += 1
            elif item.frequency == 'Weekly':
                user_stats[u_name]['weekly_total'] += 1
                if is_up_today:
                    user_stats[u_name]['weekly_updated'] += 1
            elif item.frequency in ['Monthly', 'Yearly', 'Quarterly']:
                user_stats[u_name]['monthly_total'] += 1
                if is_up_today:
                    user_stats[u_name]['monthly_updated'] += 1

        import json
        comm_cfg = {}
        if getattr(item, 'commodity_config', None):
            try:
                comm_cfg = json.loads(item.commodity_config) if isinstance(item.commodity_config, str) else (item.commodity_config or {})
            except Exception:
                comm_cfg = {}

        task_entry = {
            'id': item.id,
            'user': item.user_name,
            'commodity': norm_commodity,
            'commodity_config': comm_cfg,
            'raw_table': item.raw_table_name,
            'final_name': item.final_name,
            'frequency': item.frequency,
            'source_pipeline': source_pipe,
            'last_updated': latest_date,
            'due_date': due_date_str,
            'cutoff_time': item.target_cutoff_time or '18:30',
            'status': status,
            'is_updated_today': is_up_today,
            'has_today_data': has_today_data,
            'today_status': today_status,
            'today_badge_text': today_badge_text,
            'today_badge_class': today_badge_class,
            'target_date': target_date_formatted,
            'is_verified': bool(active_verif),
            'verified_by': active_verif.verified_by if active_verif else '',
            'verification_status': active_verif.status if active_verif else '',
            'verification_notes': active_verif.notes if active_verif else '',
            'verified_date': str(active_verif.report_date) if active_verif else '',
            'verified_rows': active_verif.row_count if active_verif else 0,
            'remark': (user_remark.remark_text if user_remark else '') or auto_remark,
            'user_remark': user_remark.remark_text if user_remark else '',
            'user_remark_id': user_remark.id if user_remark else None,
            'user_remark_by': user_remark.user_name if user_remark else '',
            'user_remark_at': user_remark.created_at.strftime('%Y-%m-%d %H:%M') if user_remark and user_remark.created_at else '',
            'is_edited': bool(getattr(user_remark, 'is_edited', False)) if user_remark else False,
            'edited_at': user_remark.edited_at.strftime('%d %b %Y, %I:%M %p') if (user_remark and getattr(user_remark, 'edited_at', None)) else '',
            'last_edited_by': getattr(user_remark, 'last_edited_by', '') if user_remark else '',
            'source': item.source_name or item.source_url or 'Primary Market Desk',
            'source_url': item.source_url or '',
        }
        results.append(task_entry)

        comm_parts = [c.strip() for c in norm_commodity.split(',') if c.strip()]
        for cp in comm_parts:
            # Check if this commodity has specific timing / frequency / assignee configured
            cp_cfg = comm_cfg.get(cp) or {}
            cp_freq = cp_cfg.get('frequency') or item.frequency or 'Daily'
            cp_cutoff = cp_cfg.get('cutoff_time') or item.target_cutoff_time or '18:30'
            cp_user = cp_cfg.get('assigned_user') or item.user_name

            cp_entry = dict(task_entry)
            cp_entry['commodity'] = cp
            cp_entry['frequency'] = cp_freq
            cp_entry['cutoff_time'] = cp_cutoff
            cp_entry['user'] = cp_user

            # If frequency is overridden from Daily to Monthly / Weekly / Yearly / Cycle Window:
            if cp_freq != item.frequency:
                if cp_freq in ['Monthly', 'Yearly', 'Occasionally']:
                    if has_today_data or (status == 'PASS') or (status == 'SKIP'):
                        cp_entry['today_status'] = 'UPDATED_TODAY'
                        cp_entry['today_badge_text'] = f'Updated ({cp_freq})'
                        cp_entry['today_badge_class'] = 'badge-success'
                        cp_entry['is_updated_today'] = True
                        cp_entry['status'] = 'PASS'
                    else:
                        cp_entry['today_status'] = 'WINDOW_ACTIVE' if ('trade_flow' in item.raw_table_name.lower()) else 'AWAITING_WINDOW'
                        cp_entry['today_badge_text'] = f'{cp_freq} Cadence (Due {cp_cutoff})'
                        cp_entry['today_badge_class'] = 'badge-window'
                        cp_entry['is_updated_today'] = False
                        cp_entry['status'] = 'WINDOW_ACTIVE' if ('trade_flow' in item.raw_table_name.lower()) else 'AWAITING_PULL'
                elif cp_freq == 'Weekly':
                    if has_today_data or (status == 'PASS') or (status == 'SKIP'):
                        cp_entry['today_status'] = 'UPDATED_TODAY'
                        cp_entry['today_badge_text'] = 'Updated (Weekly)'
                        cp_entry['today_badge_class'] = 'badge-success'
                        cp_entry['is_updated_today'] = True
                        cp_entry['status'] = 'PASS'
                    else:
                        cp_entry['today_status'] = 'PENDING_TODAY'
                        cp_entry['today_badge_text'] = f'Weekly (Due {cp_cutoff})'
                        cp_entry['today_badge_class'] = 'badge-warning'
                        cp_entry['is_updated_today'] = False

            comm_groups[cp].append(cp_entry)

    if live_conn:
        live_conn.close()

    # Calculate cadence completion percentages
    for k in cadence_summary:
        tot = cadence_summary[k]['total']
        up = cadence_summary[k]['updated']
        cadence_summary[k]['pct'] = int(round((up / tot) * 100)) if tot > 0 else 0

    # Calculate completion percentage for each user
    teammates = {}
    for u, st in user_stats.items():
        pct = int(round((st['updated'] / st['total']) * 100)) if st['total'] > 0 else 0
        teammates[u] = {
            'total': st['total'],
            'updated': st['updated'],
            'pending': st['pending'],
            'windows': st['windows'],
            'pct': pct,
            'daily_total': st['daily_total'],
            'daily_updated': st['daily_updated'],
            'weekly_total': st['weekly_total'],
            'weekly_updated': st['weekly_updated'],
            'monthly_total': st['monthly_total'],
            'monthly_updated': st['monthly_updated'],
        }

    # Summary object for Manager view
    total_tracked = len(results)
    overall_pct = int(round((updated_today_count / total_tracked) * 100)) if total_tracked > 0 else 0
    recent_updates = [
        {
            'id': r['id'],
            'table': r['raw_table'],
            'name': r['final_name'],
            'user': r['user'],
            'commodity': r['commodity'],
            'date': r['last_updated'],
            'status': r['status'],
            'today_status': r['today_status'],
            'today_badge_text': r['today_badge_text'],
            'is_verified': r['is_verified'],
            'verified_by': r['verified_by'],
            'verified_rows': r['verified_rows'],
            'remark': r['user_remark']
        }
        for r in sorted([x for x in results if x['is_updated_today']], key=lambda x: x['last_updated'], reverse=True)
    ]

    # Build Commodity-Basis Rollups
    commodity_rollups = []
    for comm_name, tbls in sorted(comm_groups.items(), key=lambda x: x[0]):
        tot_c = len(tbls)
        up_c = len([x for x in tbls if x['is_updated_today']])
        pend_c = tot_c - up_c
        pct_c = int(round((up_c / tot_c) * 100)) if tot_c > 0 else 0

        # Unique assignees for this commodity
        all_u = set()
        for t in tbls:
            for s in t['user'].split(','):
                if s.strip(): all_u.add(s.strip())
        assignees_list = sorted(list(all_u))

        if pct_c == 100:
            comm_stat = 'COMPLETED'
        elif pct_c > 0:
            comm_stat = 'PARTIAL'
        else:
            comm_stat = 'PENDING'

        commodity_rollups.append({
            'commodity': comm_name,
            'total_tables': tot_c,
            'updated_today': up_c,
            'pending_today': pend_c,
            'completion_pct': pct_c,
            'status': comm_stat,
            'assignees': assignees_list,
            'assignees_str': ', '.join(assignees_list) if assignees_list else 'Unassigned',
            'tables': tbls
        })

    # Build Date-Wise Metadata
    available_dates = [(today_real - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(7)]
    date_summary = {
        'selected_date': target_date_formatted,
        'is_today': is_querying_today,
        'available_dates': available_dates,
        'total_tracked': total_tracked,
        'updated_on_date': updated_today_count,
        'pending_on_date': pending_count,
        'completion_pct': overall_pct
    }

    summary = {
        'total_tasks': total_tracked,
        'updated_today': updated_today_count,
        'pending_action': pending_count,
        'need_correction_count': need_correction_count,
        'not_correct_count': not_correct_count,
        'cycle_windows': cycle_window_count,
        'awaiting_pull': awaiting_pull_count,
        'remarks_count': remarks_count,
        'completion_pct': overall_pct,
        'cadence_summary': cadence_summary,
        'pipeline_summary': pipeline_summary,
        'teammates': teammates,
        'recent_updates': recent_updates,
        'commodity_rollups': commodity_rollups,
        'date_summary': date_summary
    }

    if is_querying_today:
        _SURVEILLANCE_CACHE['timestamp'] = now
        _SURVEILLANCE_CACHE['data'] = results
        _SURVEILLANCE_CACHE['summary'] = summary

    return results, summary



def seed_default_catalog():
    """Seeds authentic previous user tasks into DBTaskCatalog."""
    master = [
        # --- NISHANT: Pulses, Tops, Daily News & Prices, Trade Flow (15th-20th Cycle) ---
        ('Nishant', 'Bengal Gram (Chana)', 'pyexcel_imported_market_prices', 'Imported Market Prices — Chana', 'Daily', 'CreatedDate', '18:30', 'IPGA / Market Survey', 'https://ipga.co.in'),
        ('Nishant', 'Pulses', 'ipga_spot', 'Pulses Mandi Spot Prices', 'Daily', 'CreatedDate', '18:30', 'Agmarknet / IPGA', 'https://agmarknet.gov.in'),
        ('Nishant', 'Pulses', 'ipga_cnf', 'Pulses CNF Port Prices', 'Daily', 'CreatedDate', '18:30', 'International Port Quotes', ''),
        ('Nishant', 'Pulses', 'pyexcel_pulses_cnf_prices', 'Detailed Pulses CNF Parity Structure', 'Daily', 'CreatedDate', '18:30', 'Overseas Brokers / Trade', ''),
        ('Nishant', 'Pulses', 'ipga_international_prices', 'International Pulse Prices & Burma', 'Daily', 'CreatedDate', '18:30', 'Myanmar/Yangon Trade Desk', ''),
        ('Nishant', 'Pulses', 'pyexcel_pulses_international_prices', 'Pulses International Trade Rates', 'Daily', 'CreatedDate', '18:30', 'Overseas Trade Desks', ''),
        ('Nishant', 'Pulses', 'pyexcel_pulses_port_prices', 'Major Ports Pulses Delivery Prices', 'Daily', 'CreatedDate', '18:30', 'Port Terminal Surveys', ''),
        ('Nishant', 'Pulses', 'pyexcel_international_prices', 'Pulses Global FOB Market Prices', 'Daily', 'CreatedDate', '18:30', 'International Export Feeds', ''),
        ('Nishant', 'Tops', 'pyexcel_tops_prices', 'Tops Daily Mandi Spot Rates (Potato, Onion, Tomato)', 'Daily', 'CreatedDate', '18:00', 'Mandi Spot Network', ''),
        ('Nishant', 'Pulses', 'pyexcel_dashboard_news', 'Pulses Domestic & Global News', 'Daily', 'CreatedDate', '18:30', 'Commodity News Feeds', ''),
        ('Nishant', 'Pulses', 'pyexcel_market_report', 'Pulses Daily Market Bulletin & Summary', 'Daily', 'created_date', '18:30', 'Commodity Market Bulletin', ''),
        ('Nishant', 'Pulses', 'ipga_portstock', 'Major Ports Pulses Stock Audit', 'Weekly', 'Date', '17:00', 'JNPT, Chennai, Mundra Ports', ''),
        ('Nishant', 'Pulses', 'pyexcel_port_stocks', 'Pulses Port Stocks Survey', 'Weekly', 'CreatedDate', '17:00', 'Maritime Port Surveyors', ''),
        ('Nishant', 'Pulses', 'pyexcel_portstock', 'Alternate Port Stock Feed', 'Weekly', 'date', '17:00', 'Port Logistics Desk', ''),
        ('Nishant', 'Pulses', 'ipga_arrivals_marketwise', 'Marketwise Pulses Arrivals', 'Weekly', 'CreatedDate', '18:00', 'State APMCs / Agmarknet', ''),
        ('Nishant', 'Pulses', 'pystage_factrates_sowingprogress', 'Weekly All-India Sowing Progress', 'Weekly', 'CreatedDate', '18:00', 'Ministry of Agriculture', ''),
        ('Nishant', 'Pulses', 'ipga_chennai_manifest', 'Chennai Port Vessel Manifest', 'Weekly', 'EndDate', '18:00', 'Customs Port Manifests', ''),
        ('Nishant', 'Pulses', 'ipga_articles', 'IPGA Pulses Articles & Editorials', 'Weekly', 'Date', '18:00', 'IPGA Publications', ''),
        ('Nishant', 'Pulses', 'ipga_blogs', 'IPGA Market Blogs & Industry Insights', 'Weekly', 'Date', '18:00', 'IPGA Blog Portal', ''),
        ('Nishant', 'Pulses', 'ipga_reports', 'IPGA Research & Survey Reports', 'Weekly', 'created_date', '18:00', 'IPGA Research Division', ''),
        ('Nishant', 'Pulses', 'ipga_tenders', 'IPGA Global Pulses Tenders Feed', 'Weekly', 'Date', '18:00', 'Global Tender Bulletins', ''),
        ('Nishant', 'Pulses', 'ipga_videos', 'IPGA Commodity Webinar Videos', 'Weekly', 'Date', '18:00', 'IPGA Media Desk', ''),
        ('Nishant', 'Pulses', 'pyexcel_articles', 'Agri Commodity Knowledge Articles', 'Weekly', 'Date', '18:00', 'AGALABS Content Desk', ''),
        ('Nishant', 'Pulses', 'pyexcel_videos', 'Market Analysis & Commodity Videos', 'Weekly', 'Date', '18:00', 'AGALABS Media Desk', ''),
        ('Nishant', 'Pulses / Tops', 'pyexcel_trade_flow', 'Monthly Trade Flow (Due 15th-20th)', 'Monthly', 'Date', '18:30', 'Ministry of Commerce / DGCIS (15-20th Window)', ''),
        ('Nishant', 'Pulses', 'pystage_factrates_monthly_exports', 'Pulses Monthly Exports', 'Monthly', 'CreatedDate', '18:00', 'DGCIS / APEDA', ''),
        ('Nishant', 'Pulses', 'pystage_factrates_monthly_imports', 'Pulses Monthly Imports', 'Monthly', 'CreatedDate', '18:00', 'Ministry of Commerce', ''),
        ('Nishant', 'Pulses', 'pyexcel_balancesheet_agalabs', 'AGALABS Pulses Balancesheet Model', 'Monthly', 'CreatedDate', '18:00', 'AGALABS Research Desk', ''),
        ('Nishant', 'Pulses', 'pyexcel_factrates_dashboard_balancesheet', 'Pulses Dashboard Balancesheet', 'Monthly', 'CreatedDate', '18:00', 'Commodity Balancesheet Team', ''),
        ('Nishant', 'Pulses', 'pystage_factrates_usda_balancesheet', 'USDA Pulses & Grain Balancesheet', 'Monthly', 'CreatedDate', '18:00', 'USDA WASDE Pulses Desk', ''),
        ('Nishant', 'Pulses', 'pyexcel_key_producing_countries', 'Key Producing Countries Metrics', 'Monthly', 'CreatedDate', '18:00', 'Global Agronomic Database', ''),
        ('Nishant', 'Pulses', 'pyexcel_production_table_country', 'Countrywise Production Table', 'Monthly', 'CreatedDate', '18:00', 'International Production Feed', ''),
        ('Nishant', 'Pulses', 'pyexcel_msp', 'Minimum Support Price (MSP)', 'Yearly', 'CreatedDate', '18:00', 'CACP / Cabinet Committee', ''),
        ('Nishant', 'Pulses', 'pyexcel_buffernorms', 'Pulses Strategic Buffer Norms', 'Yearly', 'Date', '18:00', 'Dept of Consumer Affairs', ''),
        ('Nishant', 'Pulses', 'pyexcel_buffer_stock', 'Central Buffer Stock Position', 'Monthly', 'CreatedDate', '18:00', 'Central Buffer Management', ''),

        # --- PANKAJ: Chilli, Spices & Terminal Market Feeds ---
        ('Pankaj', 'Chilli', 'pyexcel_rksinghal', 'Chilli Guntur & Regional Spot Prices', 'Daily', 'CreatedDate', '18:00', 'Mandi Survey / Trade Desk', ''),
        ('Pankaj', 'Spices', 'pyexcel_spices_fob_prices', 'Spices FOB Export Prices', 'Daily', 'CreatedDate', '18:30', 'Spices Board of India / Ports', ''),
        ('Pankaj', 'Spices', 'pystage_factrates_ncdex_spot', 'NCDEX Spices Spot Mandi Indices', 'Daily', 'CreatedDate', '18:30', 'NCDEX Spot Terminal', 'https://www.ncdex.com'),
        ('Pankaj', 'Spices', 'pystage_factrates_ncdex_futures', 'NCDEX Spices Futures Daily Closing', 'Daily', 'CreatedDate', '19:30', 'NCDEX Exchange Feed', 'https://www.ncdex.com'),
        ('Pankaj', 'Spices', 'pyexcel_fob_prices_manual', 'Spices FOB Manual Quotes Desk', 'Daily', 'CreatedDate', '18:30', 'Export Merchant Exporters', ''),
        ('Pankaj', 'Spices', 'pyexcel_statewise_arrival_price', 'Statewise Spices Arrivals & Mandi Rates', 'Weekly', 'Date', '18:00', 'State APMC Portals', ''),
        ('Pankaj', 'Spices', 'pystage_factrates_ncdex_stock', 'NCDEX Accredited Warehouse Stock', 'Weekly', 'CreatedDate', '18:00', 'NCDEX Deliverable Stock Position', ''),
        ('Pankaj', 'Spices', 'pystage_factrates_ncdex_edd', 'NCDEX Early Delivery & Settlement Positions', 'Weekly', 'CreatedDate', '18:00', 'NCDEX Clearing & Settlement', ''),
        ('Pankaj', 'Spices', 'pyexcel_fob_monthly_prices', 'Spices Monthly FOB Export Pricing', 'Monthly', 'date', '18:00', 'Spices Board Export Monthly', ''),

        # --- NITESH: Logistics, Maize, Feed Grains, Poultry, Macro & Currencies ---
        ('Nitesh', 'Logistics', 'pyexcel_rakemovement', 'All-India Freight Rake Movement', 'Daily', 'CreatedDate', '18:00', 'Indian Railways / FOIS', ''),
        ('Nitesh', 'Logistics', 'pyexcel_freight_movement', 'Freight Dispatch & Sidings Movement', 'Daily', 'Date', '18:00', 'Rail Sidings & Goods Sheds', ''),
        ('Nitesh', 'Maize', 'pystage_factrates_wholesaleprice', 'Maize Mandi Wholesale Prices', 'Daily', 'CreatedDate', '18:30', 'AgriCentral / Agmarknet', ''),
        ('Nitesh', 'Egg / Poultry', 'pyexcel_egg_prices', 'National Egg Coordination Prices (NECC)', 'Daily', 'CreatedDate', '18:00', 'NECC Official', ''),
        ('Nitesh', 'Egg / Poultry', 'pyexcel_egg_poultry_data', 'Commercial Egg & Poultry Wholesale Rates', 'Daily', 'CreatedDate', '18:00', 'Poultry Trade Association', ''),
        ('Nitesh', 'Poultry / Feed', 'pyexcel_poultry', 'Broiler & Poultry Feed Quotes', 'Daily', 'Date', '18:00', 'SMS / Breeder Association', ''),
        ('Nitesh', 'Maize / Cereals', 'pystage_factrates_igc_fobprice', 'International IGC FOB Price', 'Daily', 'CreatedDate', '19:00', 'International Grains Council', ''),
        ('Nitesh', 'Feed Grains', 'pyexcel_ddgs_price', 'DDGS Distillery Feed Prices', 'Daily', 'CreatedDate', '18:30', 'Ethanol Plants / Traders', ''),
        ('Nitesh', 'Feed Grains', 'pyexcel_de_oiled_bran_cake_prices', 'De-Oiled Rice Bran (DORB) Feed Rates', 'Daily', 'CreatedDate', '18:30', 'Solvent Extractors Feed Desk', ''),
        ('Nitesh', 'Maize', 'pystage_factrates_cme_futures', 'CME Corn / Grain Futures', 'Daily', 'CreatedDate', '19:30', 'CME Group / Reuters', ''),
        ('Nitesh', 'Macro', 'pystage_factrates_exchangerate', 'Forex USD/INR Exchange Rates', 'Daily', 'CreatedDate', '18:00', 'Reserve Bank of India', ''),
        ('Nitesh', 'Macro', 'pystage_factrates_exchangerate_xe', 'Realtime Multi-Currency Rates (XE)', 'Daily', 'CreatedDate', '18:00', 'XE Foreign Exchange Feed', ''),
        ('Nitesh', 'Maize', 'pyexcel_port_lineup', 'Indian Ports Grain Vessel Lineup', 'Weekly', 'CreatedDate', '18:00', 'Maritime Port Terminals', ''),
        ('Nitesh', 'Maize', 'pyexcel_maize_matured_rake', 'Matured Maize Rakes Tracking', 'Weekly', 'CreatedDate', '18:00', 'Rail Sidings / Mandi', ''),
        ('Nitesh', 'Grains', 'pyexcel_central_pool_stock', 'Central Pool Foodgrain Stocks', 'Monthly', 'CreatedDate', '18:00', 'FCI / Dept of Food', ''),
        ('Nitesh', 'Maize/Barley', 'pystage_factrates_usda_balancesheet_world', 'USDA World Grain Balancesheet', 'Monthly', 'CreatedDate', '18:00', 'USDA WASDE', ''),
        ('Nitesh', 'Macro', 'pyexcel_cpi', 'Consumer Price Index (CPI/WPI)', 'Monthly', 'CreatedDate', '18:00', 'MoSPI Official', ''),
        ('Nitesh', 'Macro', 'pyexcel_inflation', 'National Inflation Series', 'Monthly', 'CreatedDate', '18:00', 'Ministry of Statistics (MoSPI)', ''),
        ('Nitesh', 'Macro', 'pyexcel_inflation_composite', 'Composite Inflation Rates', 'Monthly', 'CreatedDate', '18:00', 'MoSPI Composite Data', ''),
        ('Nitesh', 'Grains', 'pyexcel_igc_outlook', 'IGC Monthly Grain Market Outlook', 'Monthly', 'CreatedDate', '18:00', 'International Grains Council', ''),
        ('Nitesh', 'Feed/Grains', 'pyexcel_commodity_consumption', 'Grain & Feed Domestic Consumption', 'Monthly', 'CreatedDate', '18:00', 'Research Economic Desk', ''),
        ('Nitesh', 'Macro/Grains', 'pyexcel_oecd_data', 'OECD Food & Agriculture Outlook', 'Monthly', 'CreatedDate', '18:00', 'OECD Database', ''),

        # --- BHAWNA: Cotton, Soybeans, Edible Oils & Oilseeds ---
        ('Bhawna', 'Soybeans', 'sopa_spot_price', 'SOPA Soybean Spot Mandi Rates', 'Daily', 'CreatedDate', '18:00', 'SOPA Indore', 'https://www.sopa.org'),
        ('Bhawna', 'Soybeans', 'pyexcel_soybean_plant_quote', 'Soybean Crushing Plant Quotes', 'Daily', 'CreatedDate', '18:00', 'Solvent Extractors Association', ''),
        ('Bhawna', 'Oilseeds', 'pystage_oilseed_crush_margin', 'Oilseed Crushing Margin Calculation', 'Daily', 'date', '19:00', 'Proprietary SOPA Model', ''),
        ('Bhawna', 'Soybeans', 'pyexcel_soybean_basis', 'Soybean FOB & Basis Export Rates', 'Daily', 'date', '18:30', 'Trade Brokers', ''),
        ('Bhawna', 'Soybeans', 'sopa_arrivalsbystate', 'Statewise Soybean Arrivals', 'Weekly', 'CreatedDate', '18:00', 'SOPA Survey', ''),
        ('Bhawna', 'Edible Oils', 'pyexcel_price_influencing_factors', 'Macro Price Influencing Matrix', 'Weekly', 'CreatedDate', '18:00', 'Research Desk Analysis', ''),
        ('Bhawna', 'Edible Oils', 'pyexcel_edible_oil_tariff_structure', 'Edible Oil Tariff Structure & Import Duty', 'Weekly', 'createdDate', '18:00', 'CBIC Customs Notifications', ''),
        ('Bhawna', 'Soybeans/Oilseeds', 'pystage_factrates_solventextract', 'Solvent Extractors Extraction Data', 'Weekly', 'CreatedDate', '18:00', 'SEA Industry Feed', ''),
        ('Bhawna', 'Soybeans', 'sopa_lab', 'SOPA Testing Laboratory Quality Reports', 'Weekly', 'Date', '18:00', 'SOPA Testing Labs', ''),
        ('Bhawna', 'Soybeans', 'sopa_labs_surveyors', 'SOPA Accredited Surveyors & Network', 'Weekly', 'Date', '18:00', 'SOPA Quality Control', ''),
        ('Bhawna', 'Soybeans', 'sopa_balancesheet', 'SOPA Soybean India Balancesheet', 'Monthly', 'CreatedDate', '18:00', 'SOPA Indore', ''),
        ('Bhawna', 'Soybeans', 'sopa_balancesheet_world', 'World Soybean Balancesheet', 'Monthly', 'CreatedDate', '18:00', 'Global Soybean Analytics', ''),
        ('Bhawna', 'Soymeal', 'pyexcel_soybean_meal_export', 'Soybean De-Oiled Cake (DOC) Exports', 'Monthly', 'CreatedDate', '18:00', 'Solvent Extractors Association of India', ''),
        ('Bhawna', 'Soybeans', 'sopa_countrywise_apy', 'Countrywise Soybean APY', 'Monthly', 'CreatedDate', '18:00', 'SOPA Global Analytics', ''),
        ('Bhawna', 'Soybeans', 'sopa_apy_state', 'Statewise Soybean Area, Production & Yield', 'Monthly', 'CreatedDate', '18:00', 'SOPA India Data', ''),
        ('Bhawna', 'Oilseeds', 'sopa_glossary_terms', 'Oilseeds Standards & Technical Glossary', 'Monthly', 'date', '18:00', 'SOPA Standards Manual', ''),

        # --- NITESH: Sugar & Bio-Energy (Reassigned), Logistics, Maize, Feed Grains ---
        ('Nitesh', 'Sugar & Bio-Energy', 'pystage_factrates_iso_sugar', 'ISO Sugar & White Sugar Index', 'Daily', 'Date', '18:30', 'International Sugar Organization', ''),
        ('Nitesh', 'Sugar & Bio-Energy', 'pyexcel_crude_oil_prices', 'Brent & WTI Crude Oil Prices', 'Daily', 'CreatedDate', '19:00', 'NYMEX / ICE Feeds', ''),
        ('Nitesh', 'Sugar & Bio-Energy', 'pyexcel_ethanol_supplied', 'Daily Ethanol Lifting & Delivery Volume', 'Daily', 'CreatedDate', '18:00', 'OMCs Lifting Dashboard', ''),
        ('Nitesh', 'Sugar & Bio-Energy', 'pyexcel_ethanol_basic_price', 'Government Ethanol Basic Procurement Prices', 'Daily', 'CreatedDate', '18:00', 'MoPNG / OMCs Pricing Policy', ''),
        ('Nitesh', 'Sugar & Bio-Energy', 'pyexcel_sugar_mill_distillery', 'Sugar Mill & Distillery Capacity Feed', 'Weekly', 'CreatedDate', '18:00', 'ISMA / State Cane Commissioners', ''),
        ('Nitesh', 'Sugar & Bio-Energy', 'pyexcel_ethanol_capacity_rawmaterial', 'Distillery Ethanol Production Capacity by Feedstock', 'Weekly', 'CreatedDate', '18:00', 'ISMA / DFPD Ethanol Cell', ''),
        ('Nitesh', 'Sugar & Bio-Energy', 'pyexcel_ethanol_recap', 'OMC Ethanol Allotment & Supply Recap', 'Weekly', 'CreatedDate', '18:00', 'OMC Ethanol Portal', ''),
        ('Nitesh', 'Sugar & Bio-Energy', 'pyexcel_government_monthly_sugar_sale_quota', 'Government Monthly Sugar Sale Quota', 'Monthly', 'CreatedDate', '18:00', 'DFPD / Ministry of Consumer Affairs', ''),
        ('Nitesh', 'Sugar & Bio-Energy', 'pyexcel_allocation_offtake', 'Sugar Allocation & Offtake Monthly Report', 'Monthly', 'CreatedDate', '18:00', 'Dept of Food & Public Distribution', ''),
        ('Nitesh', 'Sugar & Bio-Energy', 'pyexcel_ethanol_cyclewise_offer_summary', 'Cyclewise Ethanol Tender Allocation Summary', 'Monthly', 'CreatedDate', '18:00', 'OMCs Joint Tender Portal', ''),

        # --- GOPI, BHAWNA & PANKAJ: Weather & Climatology (Alternate Days) ---
        ('Bhawna', 'Weather & Crop NDVI', 'pyexcel_daily_weather_data', 'IMD Daily Weather & Rainfall Tracker', 'Daily', 'CreatedDate', '18:00', 'India Meteorological Department (IMD)', ''),
        ('Pankaj', 'Weather & Crop NDVI', 'pyexcel_normal_weather_data', 'IMD Climatological Normal Benchmarks', 'Daily', 'CreatedDate', '18:00', 'IMD Climatology Cell', ''),
        ('Bhawna', 'Weather & Crop NDVI', 'pyexcel_gis_ndvi', 'Satellite NDVI Crop Health & Vegetation Index', 'Weekly', 'CreatedDate', '18:00', 'ISRO / Copernicus Satellite Earth Observation', ''),
        ('Pankaj', 'Weather & Crop NDVI', 'pystage_factrates_rainfall_region', 'Regional Monsoon Performance & Rainfall Departure', 'Weekly', 'CreatedDate', '18:00', 'IMD Regional Centers', ''),
        ('Bhawna', 'Weather & Crop NDVI', 'pystage_factrates_rainfall_district', 'District-level IMD Rainfall Station Records', 'Monthly', 'Date', '18:00', 'IMD District Met Centers', ''),
        ('Pankaj', 'Weather & Crop NDVI', 'pystage_factrates_rainfall_district_monthly', 'Monthly District Rainfall Departure Matrix', 'Monthly', 'CreatedDate', '18:00', 'IMD Climatology Center Pune', ''),

        # --- GOPI: Wheat, Rice, Foodgrains, Agronomics & Forecasting ---
        ('Gopi', 'Wheat', 'pystage_factrates_spot', 'Wheat Mandi Wholesale Rates', 'Daily', 'CreatedDate', '18:30', 'Agmarknet / State APMC Mandis', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_retailprice', 'Wheat & Rice Retail Mandi Price', 'Daily', 'CreatedDate', '18:30', 'Dept of Consumer Affairs Price Cell', ''),
        ('Gopi', 'Foodgrains', 'pyexcel_govt_procurement_daily', 'Central Pool Foodgrain Daily Procurement', 'Daily', 'CreatedDate', '18:00', 'FCI / Agricoop Portal', ''),
        ('Gopi', 'Wheat & Rice', 'pystage_factrates_arrivalsbystate', 'Statewise Grain Arrivals', 'Weekly', 'CreatedDate', '18:00', 'Agmarknet Daily Aggregates', ''),
        ('Gopi', 'Wheat', 'pyexcel_eastern_australian_wheat', 'Eastern Australia Wheat FOB Export Quotes', 'Weekly', 'CreatedDate', '18:00', 'Australian Grain Trade Feeds', ''),
        ('Gopi', 'Wheat', 'pyexcel_australian_fob', 'Australian Port FOB Grain Export Rates', 'Weekly', 'CreatedDate', '18:00', 'Port Geraldton & Fremantle Exporters', ''),
        ('Gopi', 'Agri-GIS', 'pyexcel_gis_gt_points', 'Ground Truth Crop Verification GPS Points', 'Weekly', 'created_date', '18:00', 'Field Survey Geo-tagging', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_sowingprogress_final', 'All-India Final Sowing Area Aggregates', 'Weekly', 'CreatedDate', '18:00', 'Ministry of Agriculture', ''),
        ('Gopi', 'Foodgrains', 'pyexcel_auction', 'e-NAM Mandi Foodgrain Electronic Auctions', 'Weekly', 'CreatedDate', '18:00', 'e-NAM Platform', ''),
        ('Gopi', 'Foodgrains', 'pyexcel_auction_results', 'State Foodgrain Tender Auction Results', 'Weekly', 'CreatedDate', '18:00', 'State Agricultural Marketing Boards', ''),
        ('Gopi', 'Wheat', 'pyexcel_omss_monthly', 'OMSS Domestic Wheat Sale Scheme', 'Monthly', 'CreatedDate', '18:00', 'FCI OMSS Tender Results', ''),
        ('Gopi', 'Wheat', 'pyexcel_omss_state', 'Statewise OMSS Wheat Tender Allotment', 'Monthly', 'CreatedDate', '18:00', 'FCI Zonal Offices', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_advance_estimates', 'Advance Estimates of Foodgrain Production', 'Monthly', 'CreatedDate', '18:00', 'DAC&FW Directorate of Economics', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_annual_exports', 'Foodgrain Annual Export Historical Register', 'Monthly', 'CreatedDate', '18:00', 'DGCIS Annual Trade Desk', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_annual_imports', 'Foodgrain Annual Import Historical Register', 'Monthly', 'CreatedDate', '18:00', 'Ministry of Commerce & Industry', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_apy_state', 'State APY Historical Time Series', 'Monthly', 'CreatedDate', '18:00', 'Ministry of Agriculture APY Cell', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_apy_district', 'District APY Agricultural Statistics', 'Monthly', 'CreatedDate', '18:00', 'District Statistical Handbooks', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_govt_procurement', 'MSP Central Procurement Aggregates', 'Monthly', 'CreatedDate', '18:00', 'FCI Procurement Headquarters', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_govt_procurement_trends', 'Foodgrain Procurement Historical Trends', 'Monthly', 'Date', '18:00', 'Foodgrain Market Analytics', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_govt_stockPosition', 'FCI Foodgrain Central Stock Position', 'Monthly', 'CreatedDate', '18:00', 'Food Corporation of India', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_govt_stocksale', 'FCI Open Market Stock Tender Sales', 'Monthly', 'CreatedDate', '18:00', 'FCI Commercial Tenders Desk', ''),
        ('Gopi', 'Foodgrains', 'pystage_factrates_govt_stocksale_final', 'FCI Final Stock Sale Reconciliation', 'Monthly', 'CreatedDate', '18:00', 'FCI Regional Stock Depot Audit', ''),
        ('Gopi', 'Foodgrains', 'pyexcel_mandi_list', 'All-India Mandi Master Directory', 'Monthly', 'CreatedDate', '18:00', 'Agmarknet Master Register', ''),
        ('Gopi', 'Foodgrains', 'pyexcel_govt_notifications', 'Ministry of Agriculture Policy Gazette & S.O. Orders', 'Monthly', 'CreatedDate', '18:00', 'The Gazette of India', ''),
        ('Gopi', 'Agronomics', 'pyexcel_agro_climatic', 'Agro-Climatic Regional Characterization', 'Monthly', 'CreatedDate', '18:00', 'Planning Commission / NITI Aayog', ''),
        ('Gopi', 'Agronomics', 'pyexcel_cost_of_cultivation', 'CACP Cost of Cultivation Studies (A2, A2+FL, C2)', 'Monthly', 'CreatedDate', '18:00', 'Commission for Agricultural Costs & Prices', ''),
        ('Gopi', 'Agronomics', 'pyexcel_crop_pattern_countrywise_apy', 'Global Crop Pattern & Countrywise APY', 'Monthly', 'CreatedDate', '18:00', 'FAOSTAT Database', ''),
        ('Gopi', 'Agronomics', 'pyexcel_total_agri_land_states', 'Statewise Total Agricultural & Sown Land Statistics', 'Monthly', 'CreatedDate', '18:00', 'Land Use Statistics of India', ''),
        ('Gopi', 'Forecasting', 'pystage_price_forecast', 'Statistical Mandi Price Forecasting Models', 'Monthly', 'Date', '18:00', 'Proprietary Agri Econometric Models', ''),
        ('Gopi', 'Forecasting', 'pystage_price_forecast_metrics', 'Forecasting Accuracy & Historical Error Metrics', 'Monthly', 'Date', '18:00', 'Model Evaluation & Backtest Desk', '')
    ]

    for user, comm, raw_t, final_n, freq, dcol, cutoff, src, url in master:
        comm_clean = COMMODITY_NORM_MAP.get(comm, comm)
        exists = DBTaskCatalog.query.filter_by(raw_table_name=raw_t).first()
        if not exists:
            cat = DBTaskCatalog(
                user_name=user,
                commodity=comm_clean,
                raw_table_name=raw_t,
                final_name=final_n,
                frequency=freq,
                date_column=dcol,
                target_cutoff_time=cutoff,
                source_name=src,
                source_url=url,
                is_active=True
            )
            db.session.add(cat)
        else:
            # Keep authentic user, commodity, frequency, and cutoff synchronized
            exists.user_name = user
            exists.commodity = comm_clean
            exists.final_name = final_n
            exists.frequency = freq
            exists.date_column = dcol
            exists.target_cutoff_time = cutoff
            exists.source_name = src
            exists.is_active = True
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Catalog seed notice: {e}")
