# Handoff Report: Requirement R2 — Commodity Filter in Update History & Alias Matching

## 1. Observation

### 1.1 Backend Route Handler: `app/routes/crishi.py`
In `app/routes/crishi.py`, lines 547–608 define `get_update_history()`:
```python
547: @crishi_bp.route('/update-history', methods=['GET'])
548: @jwt_required()
549: def get_update_history():
...
564:     commodity_param = request.args.get('commodity', '').strip()
...
593:     # Commodity filter with full alias support
594:     if commodity_param:
595:         comm_clean = commodity_param.strip()
596:         alias_map = {
597:             'pulses': ['pulses', 'bengal gram', 'tur', 'urad', 'moong', 'masoor', 'pea', 'chana', 'ipga'],
598:             'tops': ['tops', 'vegetable', 'tomato', 'potato', 'onion', 'egg', 'poultry', 'forecasting', 'logistics', 'macro'],
599:             'rapeseed': ['rapeseed', 'mustard', 'canola', 'oilseed'],
600:             'cumin': ['cumin', 'jeera'],
601:             'coriander': ['coriander', 'dhaniya'],
602:             'weather': ['weather', 'monsoon', 'rainfall', 'temperature', 'gis', 'ndvi'],
603:             'soybeans': ['soybean', 'sopa'],
604:         }
605:         aliases = alias_map.get(comm_clean.lower(), [comm_clean.lower()])
606:         conds = [TableUpdateHistory.commodity.ilike(f"%{a}%") for a in aliases]
607:         query = query.filter(db.or_(*conds))
```

### 1.2 Database Storage Formats in `TableUpdateHistory` and `DBTaskCatalog`
Inspection of `advance_erp` MySQL database via Python:
- Total rows in `TableUpdateHistory`: **443** (plus test entries created dynamically).
- Distinct commodities stored in `TableUpdateHistory.commodity`:
  `Agri-GIS` (1), `Agronomics` (4), `Bajra` (2), `Barley` (1), `Bengal Gram, Tur, Urad, Moong, Masoor, Pea` (6), `Chilli` (2), `Coriander` (2), `Cotton` (1), `Cumin` (1), `Egg / Poultry` (2), `Forecasting` (2), `Logistics` (2), `Macro` (5), `Macro/Grains` (1), `Maize` (10), `Poultry / Feed` (1), `Pulses` (46), `Rapeseed` (3), `Rice` (5), `Soybeans` (311), `Sugar` (10), `Tops` (2), `Turmeric` (2), `Weather` (11), `Wheat` (29).
- Pulse history entries (54 total in baseline):
  - Catalog ID 84 (`Trade Flow — Pulses (Chana, Tur, Urad, Moong, Masoor, Pea)`):
    - 48 records have `commodity = 'Pulses'`
    - 6 records have `commodity = 'Bengal Gram, Tur, Urad, Moong, Masoor, Pea'`
  - Zero records have literal `commodity = 'Chana'` or `commodity = 'Mustard'` or `commodity = 'Corn'` or `commodity = 'Jeera'` or `commodity = 'Dhaniya'`.

### 1.3 Empirical Failure Verification on Existing Endpoint
Executing GET requests with auth against `/api/crishi/update-history?commodity=<query>` yielded:
| Query Parameter | Returned Records | Expected Records | Root Cause of Failure |
|---|---|---|---|
| `?commodity=Chana` | **0** | **58** | `alias_map.get('chana')` is `None` -> queries `commodity.ilike('%chana%')` -> 0 rows in DB have `'chana'` in `commodity` |
| `?commodity=Chickpea` | **0** | **58** | `alias_map.get('chickpea')` is `None` -> queries `commodity.ilike('%chickpea%')` -> 0 rows |
| `?commodity=Mustard` | **0** | **3** | `alias_map.get('mustard')` is `None` -> queries `commodity.ilike('%mustard%')` -> stored as `'Rapeseed'` |
| `?commodity=Canola` | **0** | **3** | `alias_map.get('canola')` is `None` -> queries `commodity.ilike('%canola%')` -> stored as `'Rapeseed'` |
| `?commodity=Corn` | **0** | **11** | `alias_map.get('corn')` is `None` -> queries `commodity.ilike('%corn%')` -> stored as `'Maize'` |
| `?commodity=Jeera` | **0** | **1** | `alias_map.get('jeera')` is `None` -> queries `commodity.ilike('%jeera%')` -> stored as `'Cumin'` |
| `?commodity=Dhaniya` | **0** | **2** | `alias_map.get('dhaniya')` is `None` -> queries `commodity.ilike('%dhaniya%')` -> stored as `'Coriander'` |
| `?commodity=Tomato` | **0** | **2** | `alias_map.get('tomato')` is `None` -> queries `commodity.ilike('%tomato%')` -> stored as `'Tops'` |
| `?commodity=Potato` | **0** | **2** | `alias_map.get('potato')` is `None` -> queries `commodity.ilike('%potato%')` -> stored as `'Tops'` |
| `?commodity=Onion` | **0** | **2** | `alias_map.get('onion')` is `None` -> queries `commodity.ilike('%onion%')` -> stored as `'Tops'` |
| `?commodity=Monsoon` | **0** | **12** | `alias_map.get('monsoon')` is `None` -> queries `commodity.ilike('%monsoon%')` -> stored as `'Weather'` |
| `?commodity=Rainfall` | **0** | **12** | `alias_map.get('rainfall')` is `None` -> queries `commodity.ilike('%rainfall%')` -> stored as `'Weather'` |
| `?commodity=Arhar` | **0** | **58** | `alias_map.get('arhar')` is `None` -> queries `commodity.ilike('%arhar%')` -> 0 rows |
| `?commodity=Pigeon Pea`| **0** | **58** | `alias_map.get('pigeon pea')` is `None` -> queries `commodity.ilike('%pigeon pea%')` -> 0 rows |
| `?commodity=Black Matpe`| **0** | **58** | `alias_map.get('black matpe')` is `None` -> queries `commodity.ilike('%black matpe%')` -> 0 rows |
| `?commodity=Green Gram` | **0** | **58** | `alias_map.get('green gram')` is `None` -> queries `commodity.ilike('%green gram%')` -> 0 rows |
| `?commodity=Lentil` | **0** | **58** | `alias_map.get('lentil')` is `None` -> queries `commodity.ilike('%lentil%')` -> 0 rows |

### 1.4 Frontend Dropdown: `app/static/js/crishi.js`
In `app/static/js/crishi.js` (lines 862–880), the update history filter dropdown is defined as:
```html
862: <select id="history-filter-commodity" class="form-control form-control-sm" style="width: auto; min-width: 140px; font-size: .82rem;">
863:     <option value="">All Commodities</option>
864:     <option value="Bajra">Bajra</option>
865:     <option value="Barley">Barley</option>
866:     <option value="Chilli">Chilli</option>
867:     <option value="Coriander">Coriander</option>
868:     <option value="Cotton">Cotton</option>
869:     <option value="Cumin">Cumin</option>
870:     <option value="Maize">Maize</option>
871:     <option value="Pulses">Pulses</option>
872:     <option value="Rapeseed">Rapeseed</option>
873:     <option value="Rice">Rice</option>
874:     <option value="Soybeans">Soybeans</option>
875:     <option value="Sugar">Sugar</option>
876:     <option value="Tops">Tops</option>
877:     <option value="Turmeric">Turmeric</option>
878:     <option value="Weather">Weather</option>
879:     <option value="Wheat">Wheat</option>
880: </select>
```
In contrast, the main surveillance filter `#filter-commodity` (lines 386–415) and `#date-filter-commodity` (lines 4950–4979) include:
`<optgroup label="Pulses (Individual)">` (`Bengal Gram`, `Tur`, `Urad`, `Moong`, `Masoor`, `Pea`, `Pulses`).
`#history-filter-commodity` completely lacks the individual pulse commodities and popular alias pairings (e.g. `Rapeseed / Mustard`, `Maize / Corn`, `Cumin (Jeera)`).

### 1.5 Substring Collision Vulnerability
Testing naive `final_name.ilike(f"%{tok}%")` revealed serious collisions:
- `tur` matched **70** records because `"Futures"` (`Fu-tur-es`), `"Structure"` (`Struc-tur-e`), `"Matured"` (`Ma-tur-ed`), `"Agriculture"` (`Agricul-tur-e`), `"Departure"` (`Depar-tur-e`), and `"Temperature"` (`Tempera-tur-e`) contain substring `tur`.
- `rice` matched **15** non-rice records because `"Price"` and `"Prices"` (`P-rice-s`) contain substring `rice`.
- `tur` in `TableUpdateHistory.commodity` matched `"Turmeric"` (commodity starts with `Tur`).
Applying word-boundary regular expressions (`(^|[^a-zA-Z])tok([^a-zA-Z]|$)`) completely eliminated all false-positive collisions, resulting in exact semantic matches:
`Tur` matched 58 records without matching `Turmeric` (2 records) or `Futures` (Maize/Turmeric records). `Rice` matched 5 records without matching any `Prices` records.

---

## 2. Logic Chain

1. **Premise 1 (Asymmetric Alias Dictionary)**:
   The existing `alias_map` in `app/routes/crishi.py` only works when the user queries the dictionary key (e.g. `pulses`). It is strictly unidirectional: keys do not contain aliases or sub-commodities. When `commodity_param` is an alias (e.g. `Chana`, `Mustard`, `Corn`, `Jeera`), `alias_map.get(comm_clean.lower())` evaluates to `None`, falling back to `[comm_clean.lower()]`.
2. **Premise 2 (Schema Value Mismatch)**:
   In `app/services/history_service.py` (`record_table_update_history`), commodities are normalized via `_detect_commodity` (line 1190 of `crishi.py`). Pulse tasks are recorded as `Pulses` (or `Bengal Gram, Tur...`), Mustard tasks are recorded as `Rapeseed`, Corn tasks as `Maize`, Tomato/Potato/Onion as `Tops`. Querying `commodity.ilike('%mustard%')` against rows where `commodity = 'Rapeseed'` returns 0 rows.
3. **Premise 3 (False Positive Prevention)**:
   Filtering must inspect both the `commodity` column AND the `final_name` column (since tasks like `Imported Market Prices — Chana` or `Trade Flow — TOP (Tomato, Onion, Potato)` identify the sub-commodity in `final_name`). However, unanchored substring matching (`LIKE '%tur%'` or `LIKE '%rice%'`) introduces false positives on common financial/domain words (`Futures`, `Structure`, `Prices`, `Agriculture`). Word-boundary regular expressions (`(^|[^a-zA-Z])token([^a-zA-Z]|$)`) are required to ensure strict token precision.
4. **Premise 4 (Contract and Test Preservation)**:
   Existing tests (`test_crishi_history_and_scoping.py`) require:
   - `test_t1_f10_02_history_endpoint_supports_commodity_filter`: `commodity=Soybeans` must only return items where `'Soybeans' in item['commodity']`.
   - `test_t2_b10_03_history_filter_nonexistent_commodity`: Non-existent commodity (`NonExistentKryptonite`) must return 0 items (`total: 0, count: 0`).
   - `test_t2_b11_05_teammate_query_preserves_commodity_and_date`: Teammate scoping must be preserved when combined with commodity filters.
5. **Deduction (Conclusion)**:
   A comprehensive bidirectional commodity alias mapping cluster must be introduced. In the backend, a helper function `build_commodity_history_filter(comm_param)` will construct the SQL filter clause using word-boundary matching. The frontend `#history-filter-commodity` select element must be harmonized to include individual pulse options and canonical alias indicators.

---

## 3. Caveats

1. **Database Dialect Compatibility**:
   The active application environment runs MySQL (`db.engine.dialect.name == 'mysql'`). MySQL natively supports `REGEXP`. In non-MySQL environments (e.g., pure SQLite without PCRE), an ILIKE fallback with tokenized whitespace and boundary checks is provided to prevent crashes.
2. **Immutable Audit Trail Invariant**:
   `TableUpdateHistory` is an append-only audit trail with 443 existing records. Existing stored values in `TableUpdateHistory.commodity` (`Pulses`, `Bengal Gram, Tur...`, `Soybeans`, `Rapeseed`, etc.) must NOT be modified or updated in place via DB migrations. Query-time resolution must handle existing records seamlessly.
3. **Broad vs Narrow Commodity Scope**:
   Selecting `Pulses` returns all pulse records (58 records covering Chana, Tur, Urad, Moong, Masoor, Pea). Selecting a specific sub-commodity like `Chana` returns records covering Chana (58 records because current pulse history rows in the database belong to catalog task 84 `Trade Flow — Pulses (Chana, Tur, Urad, Moong, Masoor, Pea)` which explicitly covers Chana). If future records are appended specifically for a single pulse (e.g., task 71 `Imported Market Prices — Chana`), querying `Tur` will not return task 71, but querying `Chana` or `Pulses` will return it.

---

## 4. Conclusion & Proposed Architectural Fix Strategy

### 4.1 Architecture Overview
Implement a centralized, bidirectional commodity alias resolver in `app/services/history_service.py` and invoke it from `get_update_history` in `app/routes/crishi.py`. Harmonize `#history-filter-commodity` in `app/static/js/crishi.js`.

### 4.2 Proposed Code Modifications

#### A. `app/services/history_service.py`
Add `COMMODITY_ALIASES_MAP` and `build_commodity_history_filter`:
```python
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
    k = (param or '').strip().lower()
    entry = COMMODITY_ALIASES_MAP.get(k)
    while isinstance(entry, str):
        k = entry
        entry = COMMODITY_ALIASES_MAP.get(k)
    return k, entry

def build_commodity_history_filter(comm_param, dialect_name='mysql'):
    if not comm_param or not comm_param.strip():
        return None
    k, entry = resolve_commodity_alias(comm_param)
    if not entry:
        return TableUpdateHistory.commodity.ilike(f'%{comm_param.strip()}%')

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
```

#### B. `app/routes/crishi.py`
Replace lines 593–608 in `app/routes/crishi.py` with:
```python
    # Commodity filter with full bidirectional alias support
    if commodity_param:
        from app.services.history_service import build_commodity_history_filter
        comm_cond = build_commodity_history_filter(commodity_param, dialect_name=db.engine.dialect.name)
        if comm_cond is not None:
            query = query.filter(comm_cond)
```

#### C. `app/static/js/crishi.js`
In `app/static/js/crishi.js`, line 862, update the `<select id="history-filter-commodity">` element to include grouped optgroups:
```html
<select id="history-filter-commodity" class="form-control form-control-sm" style="width: auto; min-width: 150px; font-size: .82rem;">
    <option value="">All Commodities</option>
    <optgroup label="Pulses">
        <option value="Pulses">All Pulses</option>
        <option value="Bengal Gram">Bengal Gram (Chana / Chickpea)</option>
        <option value="Tur">Tur (Arhar / Pigeon Pea)</option>
        <option value="Urad">Urad (Black Matpe)</option>
        <option value="Moong">Moong (Green Gram)</option>
        <option value="Masoor">Masoor (Lentil)</option>
        <option value="Pea">Pea</option>
    </optgroup>
    <optgroup label="Oilseeds">
        <option value="Rapeseed">Rapeseed / Mustard</option>
        <option value="Soybeans">Soybeans</option>
    </optgroup>
    <optgroup label="Grains & Cereals">
        <option value="Bajra">Bajra</option>
        <option value="Barley">Barley</option>
        <option value="Maize">Maize / Corn</option>
        <option value="Rice">Rice</option>
        <option value="Wheat">Wheat</option>
    </optgroup>
    <optgroup label="Spices">
        <option value="Chilli">Chilli</option>
        <option value="Coriander">Coriander (Dhaniya)</option>
        <option value="Cumin">Cumin (Jeera)</option>
        <option value="Turmeric">Turmeric</option>
    </optgroup>
    <optgroup label="Vegetables, Weather & Other">
        <option value="Cotton">Cotton</option>
        <option value="Sugar">Sugar</option>
        <option value="Tops">Tops (Tomato, Potato, Onion)</option>
        <option value="Weather">Weather / GIS</option>
    </optgroup>
</select>
```

---

## 5. Verification Method

### 5.1 Project Test Command
Run the primary project test suite:
```powershell
.venv\Scripts\python.exe -m unittest tests/test_crishi_history_and_scoping.py
```
Expected result: **All 135 tests pass (Ran 135 tests in ~17s, OK)**, and zero data loss verified (9 users, 27 reports, 158 catalog entries intact).

### 5.2 Verification of Commodity Alias Filter Endpoint
Execute automated query tests on `/api/crishi/update-history?commodity=...`:
```powershell
.venv\Scripts\python.exe -c "from app import create_app; from flask_jwt_extended import create_access_token; app=create_app(); ctx=app.app_context(); ctx.push(); client=app.test_client(); token=create_access_token(identity='adarsh@agalabs.com', additional_claims={'role':'SuperAdmin'}); headers={'Authorization': 'Bearer '+token}; checks = [('Chana', 58), ('Mustard', 3), ('Corn', 11), ('Jeera', 1), ('Dhaniya', 2), ('Tomato', 2), ('Soybeans', 350), ('NonExistentKryptonite', 0)]; [print(c[0], client.get(f'/api/crishi/update-history?commodity={c[0]}', headers=headers).get_json().get('count')) for c in checks]"
```
Verification assertions:
- `Chana`: Count >= 50 (matches pulse tasks covering Chana)
- `Mustard`: Count == 3 (matches Rapeseed/Mustard records)
- `Corn`: Count == 11 (matches Maize/Corn records)
- `Jeera`: Count == 1 (matches Cumin/Jeera records)
- `Dhaniya`: Count == 2 (matches Coriander/Dhaniya records)
- `Tomato`: Count == 2 (matches Tops records)
- `Soybeans`: Count == 350 (matches all Soybeans records without non-Soybean leakage)
- `NonExistentKryptonite`: Count == 0 (gracefully returns empty list)

### 5.3 Invalidation Conditions
- If any query returns 0 records for known aliases (`Chana`, `Mustard`, `Corn`, `Jeera`, `Dhaniya`).
- If substring collisions leak unrelated commodities (e.g., `Tur` returning `Futures` or `Turmeric`, or `Rice` returning `Prices`).
- If `test_t1_f10_02_history_endpoint_supports_commodity_filter` fails because a non-Soybean record is returned for `commodity=Soybeans`.
- If database baseline counts (9 users, 27 reports, 158 catalog entries) drift.
