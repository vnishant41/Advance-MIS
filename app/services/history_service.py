"""
History Service — Database Update Timestamp & History Extraction
Provides extraction of authoritative database timestamps and immutable table update tracking.
"""
import os
import re
from datetime import datetime, date, timezone
from app import db
from app.models import DBTaskCatalog, TableUpdateHistory
from app.services.surveillance import verify_table_data_in_db, get_snapshot_latest_date


def extract_table_db_update_history(catalog_id=None, raw_table_name=None, report_date=None):
    """
    Extracts actual database update timestamp and row count for a table.
    Works with either catalog_id or raw_table_name.
    Gracefully falls back to snapshot CSVs if live DB is unavailable.
    Returns: dict with { db_update_timestamp, row_count, status, latest_date, table_name, ... }
    """
    from flask import has_app_context
    if not has_app_context():
        from app import create_app
        app = create_app()
        with app.app_context():
            return extract_table_db_update_history(catalog_id=catalog_id, raw_table_name=raw_table_name, report_date=report_date)

    if not report_date:
        report_date_str = date.today().strftime('%Y-%m-%d')
    elif isinstance(report_date, (datetime, date)):
        report_date_str = report_date.strftime('%Y-%m-%d')
    else:
        report_date_str = str(report_date).strip()

    catalog_item = None
    if catalog_id:
        catalog_item = db.session.get(DBTaskCatalog, int(catalog_id))
        if catalog_item and not raw_table_name:
            raw_table_name = catalog_item.raw_table_name

    if not raw_table_name and catalog_item:
        raw_table_name = catalog_item.raw_table_name

    if not raw_table_name:
        return {
            'db_update_timestamp': datetime.now(timezone.utc),
            'row_count': 0,
            'status': 'Pending',
            'latest_date': report_date_str,
            'table_name': ''
        }

    date_col = getattr(catalog_item, 'date_column', 'Date') if catalog_item else 'Date'

    verif = verify_table_data_in_db(raw_table_name, date_col=date_col, target_date_str=report_date_str)

    row_count = verif.get('matching_rows', 0)
    if row_count == 0 and verif.get('verified'):
        row_count = 1

    latest_date = verif.get('latest_date') or report_date_str

    # Formulate valid datetime for db_update_timestamp
    try:
        if isinstance(latest_date, datetime):
            db_ts = latest_date
        elif isinstance(latest_date, date):
            db_ts = datetime(latest_date.year, latest_date.month, latest_date.day, 12, 0, 0, tzinfo=timezone.utc)
        elif isinstance(latest_date, str) and re.match(r'^\d{4}-\d{2}-\d{2}', latest_date):
            parts = latest_date.split(' ')
            d_parts = [int(p) for p in parts[0].split('-')]
            if len(parts) > 1 and ':' in parts[1]:
                t_parts = [int(p) for p in parts[1].split(':')]
                db_ts = datetime(d_parts[0], d_parts[1], d_parts[2], t_parts[0], t_parts[1], tzinfo=timezone.utc)
            else:
                db_ts = datetime(d_parts[0], d_parts[1], d_parts[2], 12, 0, 0, tzinfo=timezone.utc)
        else:
            db_ts = datetime.now(timezone.utc)
    except Exception:
        db_ts = datetime.now(timezone.utc)

    status = 'Verified' if verif.get('verified') else 'Pending'

    return {
        'db_update_timestamp': db_ts,
        'row_count': row_count,
        'status': status,
        'latest_date': latest_date,
        'table_name': raw_table_name,
        'verified': verif.get('verified', False),
        'source_type': verif.get('source_type', '')
    }


def record_table_update_history(catalog_id, report_date, person_name, remarks='', row_count=None, status=None, db_update_timestamp=None):
    """
    Appends an immutable TableUpdateHistory record.
    """
    from flask import has_app_context
    if not has_app_context():
        from app import create_app
        app = create_app()
        with app.app_context():
            return record_table_update_history(catalog_id, report_date, person_name, remarks=remarks, row_count=row_count, status=status, db_update_timestamp=db_update_timestamp)

    catalog_item = db.session.get(DBTaskCatalog, int(catalog_id)) if catalog_id else None
    if not catalog_item:
        table_name = f"catalog_{catalog_id}"
        final_name = f"Task {catalog_id}"
        commodity = "General"
    else:
        table_name = catalog_item.raw_table_name
        final_name = catalog_item.final_name
        raw_comm = catalog_item.commodity or "General"
        try:
            from app.routes.crishi import _detect_commodity
            det = _detect_commodity(final_name, raw_comm)
            commodity = det if det and det != 'General' else raw_comm
        except Exception:
            commodity = raw_comm

    if isinstance(report_date, str):
        try:
            r_date = datetime.strptime(report_date[:10], '%Y-%m-%d').date()
        except Exception:
            r_date = date.today()
    elif isinstance(report_date, datetime):
        r_date = report_date.date()
    elif isinstance(report_date, date):
        r_date = report_date
    else:
        r_date = date.today()

    if row_count is None or db_update_timestamp is None:
        extracted = extract_table_db_update_history(catalog_id=catalog_id, report_date=r_date)
        if row_count is None:
            row_count = extracted.get('row_count', 0)
        if db_update_timestamp is None:
            db_update_timestamp = extracted.get('db_update_timestamp', datetime.now(timezone.utc))
        if status is None:
            status = extracted.get('status', 'Verified')

    if not status:
        status = 'Verified'

    entry = TableUpdateHistory(
        catalog_id=catalog_id,
        person_name=person_name or 'Teammate',
        table_name=table_name,
        final_name=final_name,
        commodity=commodity,
        db_update_timestamp=db_update_timestamp or datetime.now(timezone.utc),
        report_date=r_date,
        status=status,
        row_count=int(row_count or 0),
        remarks=remarks or ''
    )
    db.session.add(entry)
    db.session.commit()
    return entry


COMMODITY_ALIASES_MAP = {
    # Pulses umbrella
    'pulses': {
        'tokens': ['pulse', 'pulses', 'ipga', 'dal', 'bengal gram', 'chana', 'chickpea', 'gram', 'tur', 'arhar', 'toor', 'pigeon pea', 'urad', 'black matpe', 'black gram', 'moong', 'mung', 'green gram', 'masoor', 'lentil', 'pea', 'peas', 'yellow pea'],
        'is_umbrella': True,
    },
    'pulse': 'pulses',
    'all pulses': 'pulses',

    # Chana / Bengal Gram / Chickpea
    'chana': {
        'tokens': ['chana', 'bengal gram', 'gram', 'chickpea', 'chickpeas', 'desi chana', 'kabuli chana'],
        'parent': 'Pulses',
    },
    'bengal gram': 'chana',
    'chickpea': 'chana',
    'chickpeas': 'chana',
    'gram': 'chana',

    # Tur / Arhar / Pigeon Pea
    'tur': {
        'tokens': ['tur', 'arhar', 'toor', 'pigeon pea', 'pigeonpea', 'red gram'],
        'parent': 'Pulses',
    },
    'arhar': 'tur',
    'toor': 'tur',
    'pigeon pea': 'tur',
    'pigeonpea': 'tur',

    # Urad / Black Matpe
    'urad': {
        'tokens': ['urad', 'black matpe', 'blackmatpe', 'black gram', 'mash'],
        'parent': 'Pulses',
    },
    'black matpe': 'urad',
    'blackmatpe': 'urad',
    'black gram': 'urad',

    # Moong / Green Gram
    'moong': {
        'tokens': ['moong', 'mung', 'green gram', 'golden gram'],
        'parent': 'Pulses',
    },
    'mung': 'moong',
    'green gram': 'moong',

    # Masoor / Lentil
    'masoor': {
        'tokens': ['masoor', 'lentil', 'lentils', 'red lentil'],
        'parent': 'Pulses',
    },
    'lentil': 'masoor',
    'lentils': 'masoor',
    'red lentil': 'masoor',

    # Pea
    'pea': {
        'tokens': ['pea', 'peas', 'yellow pea', 'green pea', 'vatana', 'matar'],
        'parent': 'Pulses',
    },
    'peas': 'pea',
    'yellow pea': 'pea',
    'green pea': 'pea',

    # Rapeseed / Mustard / Canola
    'rapeseed': {
        'tokens': ['rapeseed', 'mustard', 'canola', 'oilseed', 'oilseeds', 'sarson', 'rai', 'toria', 'rm seed'],
    },
    'mustard': 'rapeseed',
    'canola': 'rapeseed',
    'oilseed': 'rapeseed',
    'oilseeds': 'rapeseed',
    'sarson': 'rapeseed',
    'rai': 'rapeseed',

    # Soybeans / Soybean / SOPA
    'soybeans': {
        'tokens': ['soybeans', 'soybean', 'soya', 'soy', 'sopa', 'doc'],
    },
    'soybean': 'soybeans',
    'soya': 'soybeans',
    'sopa': 'soybeans',

    # Maize / Corn
    'maize': {
        'tokens': ['maize', 'corn', 'makka', 'cme corn', 'feed grains'],
    },
    'corn': 'maize',
    'makka': 'maize',

    # Cumin / Jeera
    'cumin': {
        'tokens': ['cumin', 'jeera', 'jira'],
    },
    'jeera': 'cumin',
    'jira': 'cumin',

    # Coriander / Dhaniya
    'coriander': {
        'tokens': ['coriander', 'dhaniya', 'dhania'],
    },
    'dhaniya': 'coriander',
    'dhania': 'coriander',

    # Chilli
    'chilli': {
        'tokens': ['chilli', 'chili', 'red chilli', 'mirch', 'mirchi', 'guntur'],
    },
    'chili': 'chilli',

    # Turmeric / Haldi
    'turmeric': {
        'tokens': ['turmeric', 'haldi'],
    },
    'haldi': 'turmeric',

    # Cotton
    'cotton': {
        'tokens': ['cotton', 'kapas', 'lint'],
    },
    'kapas': 'cotton',

    # Tops / Vegetables
    'tops': {
        'tokens': ['tops', 'top', 'vegetable', 'vegetables', 'tomato', 'potato', 'onion', 'egg', 'poultry', 'forecasting', 'logistics', 'macro'],
        'is_umbrella': True,
    },
    'tomato': {
        'tokens': ['tomato', 'tamatar'],
        'parent': 'Tops',
    },
    'potato': {
        'tokens': ['potato', 'aloo', 'alu'],
        'parent': 'Tops',
    },
    'onion': {
        'tokens': ['onion', 'pyaz', 'pyaaz', 'kanda'],
        'parent': 'Tops',
    },
    'egg': {
        'tokens': ['egg', 'poultry', 'necc', 'broiler'],
    },
    'poultry': {
        'tokens': ['poultry', 'egg', 'broiler', 'feed'],
    },
    'logistics': {
        'tokens': ['logistics', 'rake', 'freight'],
    },
    'macro': {
        'tokens': ['macro', 'cpi', 'inflation', 'forex', 'exchange rate'],
    },
    'forecasting': {
        'tokens': ['forecasting', 'forecast', 'statistical'],
    },

    # Weather / GIS
    'weather': {
        'tokens': ['weather', 'monsoon', 'rainfall', 'temperature', 'gis', 'agri-gis', 'ndvi', 'imd', 'satellite', 'tempmax'],
    },
    'monsoon': 'weather',
    'rainfall': 'weather',
    'gis': 'weather',
    'agri-gis': 'weather',

    # Wheat
    'wheat': {
        'tokens': ['wheat', 'gehun', 'gehu'],
    },
    'gehun': 'wheat',

    # Rice
    'rice': {
        'tokens': ['rice', 'paddy', 'chawal', 'basmati'],
    },
    'paddy': 'rice',

    # Bajra
    'bajra': {
        'tokens': ['bajra', 'pearl millet', 'millet', 'millets'],
    },
    'millet': 'bajra',

    # Barley
    'barley': {
        'tokens': ['barley', 'jau', 'jowar'],
    },
    'jau': 'barley',

    # Sugar
    'sugar': {
        'tokens': ['sugar', 'sugarcane', 'cheeni', 'chini'],
    },
    'sugarcane': 'sugar',
}


def resolve_commodity_alias(param):
    """
    Recursively resolves commodity alias string to canonical key and dictionary config.
    """
    k = (param or '').strip().lower()
    entry = COMMODITY_ALIASES_MAP.get(k)
    visited = set()
    while isinstance(entry, str) and k not in visited:
        visited.add(k)
        k = entry
        entry = COMMODITY_ALIASES_MAP.get(k)
    return k, entry


def build_commodity_history_filter(comm_param, dialect_name='mysql'):
    """
    Constructs an authoritative SQLAlchemy binary expression for filtering TableUpdateHistory.
    For MySQL, utilizes token word-boundary regular expressions to prevent substring collisions
    (e.g., 'tur' colliding with 'Futures', 'rice' colliding with 'Prices').
    Includes fallback for non-MySQL dialects.
    """
    if not comm_param or not str(comm_param).strip():
        return None

    k, entry = resolve_commodity_alias(comm_param)
    if not entry or not isinstance(entry, dict):
        return TableUpdateHistory.commodity.ilike(f'%{str(comm_param).strip()}%')

    tokens = entry.get('tokens', [k])
    parent = entry.get('parent')

    if dialect_name == 'mysql':
        regex_pattern = r'(^|[^a-zA-Z])(' + '|'.join(re.escape(t) for t in tokens) + r')([^a-zA-Z]|$)'
        conds = [TableUpdateHistory.commodity.op('REGEXP')(regex_pattern)]
        if parent:
            parent_regex = r'(^|[^a-zA-Z])(' + re.escape(parent.lower()) + r')([^a-zA-Z]|$)'
            conds.append(
                (TableUpdateHistory.commodity.op('REGEXP')(parent_regex)) &
                (TableUpdateHistory.final_name.op('REGEXP')(regex_pattern))
            )
            conds.append(TableUpdateHistory.final_name.op('REGEXP')(regex_pattern))
        else:
            conds.append(TableUpdateHistory.final_name.op('REGEXP')(regex_pattern))
        return db.or_(*conds)
    else:
        conds = [TableUpdateHistory.commodity.ilike(f'%{t}%') for t in tokens]
        conds.extend([TableUpdateHistory.final_name.ilike(f'%{t}%') for t in tokens])
        return db.or_(*conds)

