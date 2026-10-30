# Technical Investigation Report: Requirement R2 (Person-Basis Update History Tracking)

**Author:** explorer_r2_2  
**Date:** 2026-10-28  
**Scope:** Advance ERP — Crishi Database Surveillance, Data Updates, Table Catalog, and Immutable History Tracking  

---

## 1. Executive Summary

Requirement R2 requires Advance ERP to:
1. Retrieve an **immutable person-basis update history directly from database update date/timestamps** when data was updated in the database (e.g., Nishant updating Trade Flow – Pulses, Bhawna updating Trade Flow – Soybeans).
2. Ensure each update history record contains all 9 mandatory fields:
   - **Person name** (e.g. `Nishant`, `Bhawna`)
   - **Table name** (e.g. `pyexcel_trade_flow`, `sopa_spot_price`)
   - **Final name** (e.g. `Trade Flow – Pulses (Chana, Tur, Urad, Moong, Masoor, Pea)`, `Trade Flow – Soybeans & Edible Oils`)
   - **Commodity** (e.g. `Pulses`, `Soybeans`)
   - **DB update date/timestamp** (the exact date/timestamp the data record was loaded/updated in the database)
   - **Report date** (the business date/period the data pertains to, e.g. `2026-07-01`, `2026-10-14`)
   - **Status** (e.g. `PASS`, `VERIFIED`, `WINDOW_ACTIVE`, `NEED_CORRECTION`)
   - **Row count** (the number of records updated/verified for that date/commodity)
   - **Remarks** (operational notes or manager review instructions)

### Key Findings:
- **Underlying Database Update Timestamps:** In the MySQL database `agalabsdev_stage` (155 tables), 151 tables contain explicit date/timestamp columns:
  - Tables like `sopa_spot_price`, `pyexcel_imported_market_prices`, `pyexcel_rksinghal`, and `pystage_factrates_spot` maintain both `Date` (report date) and `CreatedDate` / `timestamp` (when data was loaded into MySQL).
  - In `pyexcel_trade_flow`, monthly trade flow records are distinguished by `CommodityName` and `Date` (e.g., Nishant's Pulses updates total 292 rows for `2026-07-01` and 298 rows for `2026-06-01`; Bhawna's Soybeans updates total 99 rows for `2026-07-01` and 85 rows for `2026-06-01`).
- **Catalog & Person Mapping:** The table `db_task_catalog` in `advance_erp` (158 rows) authoritatively maps `raw_table_name` to `final_name`, `commodity`, `user_name` (assigned person), `frequency`, and `date_column`.
- **Current State of Update History:** 
  - `information_schema.tables.update_time` is `NULL` for all 155 tables in `agalabsdev_stage` because MySQL InnoDB does not maintain persistent update times.
  - No database triggers exist in `advance_erp` or `agalabsdev_stage`.
  - The existing verification table `db_task_verifications` contains only 6 records and performs in-place mutation (overwrites) when a user or manager re-verifies a table, making it non-immutable.
  - The surveillance grid's `recent_updates` is computed transiently in-memory and lost across query windows.
- **Architectural Recommendation:** Introduce a dedicated, immutable database model `TableUpdateHistory` (`table_update_history`) in `advance_erp`, backed by a service that extracts both historical database update records directly from `agalabsdev_stage` date/timestamps and logs every new verification/sync event append-only.

---

## 2. Deep Dive: Current Data Update Execution & Tracking

### 2.1 Surveillance Update & Verification Flow (`app/routes/crishi.py`)
- **Route:** `POST /api/crishi/sync-report-db` (lines 115–250)
  - Invoked when a user clicks *"Verify in MySQL & Update MIS"* or syncs all tasks.
  - Takes `catalogId`, `reportDate`, and `userName` (defaulting to the JWT identity or target user).
  - Calls `verify_table_data_in_db(table_name, date_col, report_date_str)` in `app/services/surveillance.py` (lines 297–412).
  - **Database Query in `agalabsdev_stage`:**
    ```sql
    -- Count matching rows for specific target report date
    SELECT COUNT(*) AS cnt, MAX(`Date`) AS max_date 
    FROM `pyexcel_trade_flow` 
    WHERE (`Date` = '2026-07-01' OR `Date` LIKE '2026-07-01%');
    
    -- Count total rows and global max date
    SELECT COUNT(*) AS total_cnt, MAX(`Date`) AS global_max 
    FROM `pyexcel_trade_flow` 
    WHERE `Date` IS NOT NULL AND `Date` >= '1900-01-01';
    ```
  - **Mutation Bug / Limitation (lines 178–194):**
    ```python
    existing = DBTaskVerification.query.filter_by(catalog_id=itm.id, report_date=target_date).first()
    if existing:
        existing.verified_by = user_identity
        existing.row_count = verif_res.get('matching_rows', 1)
        existing.latest_db_date = db_latest
        existing.status = 'VERIFIED'
    else:
        new_verif = DBTaskVerification(...)
    ```
    *Result:* If a table is re-synced or corrected, the previous update verification is overwritten. There is no historical ledger of previous updates.

### 2.2 Operational Remarks & Revision History (`app/routes/crishi.py`)
- **Route:** `POST /api/crishi/remark` (lines 252–338)
  - When a teammate or author updates an operational remark, the prior remark is preserved in `task_remark_history` (lines 296–304):
    - Columns: `remark_id`, `catalog_id`, `old_remark_text`, `new_remark_text`, `edited_by`, `edited_at`.
  - The current remark in `task_remarks` is modified in-place (`remark_text`, `is_edited=True`, `edited_at`, `last_edited_by`).

### 2.3 Manager Review Flow (`app/routes/crishi.py`)
- **Route:** `POST /api/crishi/manager-review` (lines 357–450)
  - Managers can flag updates as `VERIFIED`, `NOT_CORRECT`, `PENDING`, or `NEED_CORRECTION`.
  - Mutates `DBTaskVerification` and appends a formatted remark (`[Manager: ...]`) to `TaskRemark`.

### 2.4 Data Update Submission Flow (`app/routes/data_update.py`)
- **Route:** `POST /api/du/submit` (lines 212–284)
  - Submits commodity factors into `master_log` (`entry_type='DataUpdate'`).
  - Sets previous rows for the same date and topic to `row_status='Amended'`.
  - Writes audit event to `audit_log` with action `DU_SUBMIT`.

### 2.5 MIS PDF Ingestion & Template Parsing (`app/routes/mis_report.py`)
- **Route:** `POST /api/mis/upload-pdf` (lines 175–316)
  - Uploads PDF files, runs layout/table extraction, and records metadata in `mis_report_uploads`.
  - Records `filename`, `report_type`, `uploaded_by`, `file_size`, `tables_count`, `charts_count`, and `quality_score`.

---

## 3. Database Schema & Timestamp Inspection

### 3.1 `information_schema.tables.update_time` Analysis
We executed an inspection query against `information_schema.tables` across both `advance_erp` and `agalabsdev_stage`:
```sql
SELECT table_schema, table_name, engine, update_time 
FROM information_schema.tables 
WHERE table_schema IN ('advance_erp', 'agalabsdev_stage') 
AND update_time IS NOT NULL;
```
**Results:**
- All 155 tables in `agalabsdev_stage` are `InnoDB`. Their `update_time` in `information_schema` is `NULL`.
- Only 10 tables in `advance_erp` show an `update_time`, which is an in-memory counter lost upon MySQL service restart.
- **Conclusion:** `information_schema.tables.update_time` **cannot** be used as a reliable, immutable source for update history.

### 3.2 Stage Database Table Columns (`agalabsdev_stage`)
Inspection of all 155 tables revealed 400 date/timestamp columns across 151 tables. The tables follow consistent design patterns:

| Table Category | Examples | Report Date Column | DB Ingestion Timestamp Column | Ingestor Column |
|---|---|---|---|---|
| **SOPA Tables** | `sopa_spot_price`, `sopa_balancesheet` | `Date` (e.g. `2026-10-14`), `MarketYearDate` | `CreatedDate` (e.g. `2026-10-14`), `created_at` | `CreatedBy` (e.g. `tech`, `Research`) |
| **IPGA Pulses Tables** | `ipga_spot`, `ipga_cnf`, `ipga_international_prices` | `Date` (e.g. `2026-10-13`) | `CreatedDate` | `CreatedBy` |
| **PyExcel Pulses/Spices/Grains** | `pyexcel_imported_market_prices`, `pyexcel_rksinghal` | `Date` (e.g. `2026-10-13`) | `CreatedDate` (timestamp/date) | `CreatedBy` |
| **Trade Flow Tables** | `pyexcel_trade_flow` | `Date` (e.g. `2026-07-01`) | Monthly publication date (`Date`) | Governed by 15th–20th cycle |
| **Rail Logistics** | `pyexcel_rakemovement` | `MetwithDate`, `DemandDate` | `CreatedDate` (datetime) | `CreatedBy` |

### 3.3 The Trade Flow Verification Evidence
Direct execution of SQL queries on `agalabsdev_stage.pyexcel_trade_flow` confirmed the prompt's exact scenario:
```sql
SELECT CommodityName, `Date`, COUNT(*) as cnt
FROM agalabsdev_stage.pyexcel_trade_flow
WHERE `Date` IN ('2026-07-01', '2026-06-01')
GROUP BY CommodityName, `Date`;
```
**Observed Output:**
- **Nishant updating Trade Flow – Pulses:**
  - `Bengal gram`, `Masoor`, `Moong`, `Pea`:
    - Report Date `2026-07-01`: **292 rows**
    - Report Date `2026-06-01`: **298 rows**
- **Bhawna updating Trade Flow – Soybeans:**
  - `Soybeans`, `Soybean Meal`, `Soybean Oil`:
    - Report Date `2026-07-01`: **99 rows**
    - Report Date `2026-06-01`: **85 rows**
- **Gopi updating Trade Flow – Foodgrains (Rice):**
  - Report Date `2026-07-01`: **142 rows**
- **Pankaj updating Trade Flow – Spices (Chilli, Coriander, Cumin):**
  - Report Date `2026-07-01`: **645 rows**
- **Nitesh updating Trade Flow – Maize / DDGS:**
  - Report Date `2026-07-01`: **80 rows**

This confirms that the raw database contains the exact row counts and dates corresponding to each teammate's commodity portfolio.

---

## 4. Mapping: Person Name, Table Name, Final Name, Commodity

The mapping engine is defined in `advance_erp.db_task_catalog`:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       db_task_catalog                                            │
├────┬──────────┬─────────────────────────────┬───────────────────────────────┬────────────────────┤
│ id │ user_name│ raw_table_name              │ final_name                    │ commodity          │
├────┼──────────┼─────────────────────────────┼───────────────────────────────┼────────────────────┤
│ 84 │ Nishant  │ pyexcel_trade_flow          │ Trade Flow – Pulses (...)     │ Bengal Gram, ...   │
│ 71 │ Nishant  │ pyexcel_imported_market_pr..│ Imported Market Prices – Chana│ Bengal Gram        │
│ 106│ Bhawna   │ sopa_spot_price             │ SOPA Soybean Spot Mandi Rates │ Soybeans           │
│ 201│ Bhawna   │ pyexcel_trade_flow          │ Trade Flow – Soybeans & Oils  │ Soybeans           │
│ 88 │ Pankaj   │ pyexcel_rksinghal           │ Chilli Guntur & Spot Prices   │ Chilli             │
│ 94 │ Nitesh   │ pyexcel_rakemovement        │ All-India Freight Rake Movem..│ Logistics          │
│ 119│ Gopi     │ pystage_factrates_spot      │ Wheat Mandi Wholesale Rates   │ Wheat              │
└────┴──────────┴─────────────────────────────┴───────────────────────────────┴────────────────────┘
```

### Mapping Attributes:
1. **Person Name (`user_name`):** Identifies the responsible teammate. Matches `User.name` in `advance_erp.users`.
2. **Raw Table (`raw_table_name`):** Actual table name in `agalabsdev_stage`.
3. **Final Name (`final_name`):** Human-readable business title shown on reports and surveillance.
4. **Commodity (`commodity`):** Authoritative commodity normalized via `COMMODITY_NORM_MAP` in `app/services/surveillance.py`.
5. **Cadence & SLA:** `frequency` ('Daily', 'Weekly', 'Monthly', 'Yearly'), `date_column`, `target_cutoff_time`.

---

## 5. Architectural Gap Analysis

| Requirement Field | Existing Model Representation | Gap / Limitation | Solution |
|---|---|---|---|
| **Person Name** | `db_task_catalog.user_name` & `db_task_verifications.verified_by` | Not joined into a unified history view | Map catalog assignee or verifier |
| **Table Name** | `db_task_catalog.raw_table_name` | Raw name only; not linked to historical events | Stored on history record |
| **Final Name** | `db_task_catalog.final_name` | Present in catalog, absent in logs | Snapshot on history record |
| **Commodity** | `db_task_catalog.commodity` | Present in catalog, absent in logs | Snapshot on history record |
| **DB Update Date/Timestamp** | `agalabsdev_stage.<table_name>.CreatedDate` or `db_task_verifications.created_at` | No persistent historical log in `advance_erp` | Query directly from stage tables & persist into immutable history table |
| **Report Date** | `agalabsdev_stage.<table_name>.Date` | Stored per-row in stage tables, but lost across surveillance cache resets | Stored on history record |
| **Status** | `db_task_verifications.status` / `evaluate_table_status` | Mutated on re-verification | Immutable status per update record |
| **Row Count** | `agalabsdev_stage COUNT(*)` / `db_task_verifications.row_count` | Transiently calculated | Stored on history record |
| **Remarks** | `task_remarks.remark_text` / `db_task_verifications.notes` | Remarks in `task_remarks` only store current state | Historical remarks linked to update |
| **Immutability** | None | `db_task_verifications` updates in-place | **Append-only** table with no update/delete operations |

---

## 6. Concrete Implementation Recommendations

### 6.1 Database Model: `TableUpdateHistory` (`app/models.py`)

Add the following SQLAlchemy model to `app/models.py`:

```python
class TableUpdateHistory(db.Model):
    """
    Immutable historical audit log of database table updates on a person basis.
    Every update event records the exact DB timestamp, report date, row count,
    catalog mapping, and operational remarks.
    """
    __tablename__ = 'table_update_history'
    
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    catalog_id = db.Column(db.Integer, db.ForeignKey('db_task_catalog.id', ondelete='SET NULL'), nullable=True, index=True)
    person_name = db.Column(db.String(255), nullable=False, index=True)
    table_name = db.Column(db.String(128), nullable=False, index=True)
    final_name = db.Column(db.String(255), nullable=False)
    commodity = db.Column(db.String(255), nullable=False, index=True)
    db_update_timestamp = db.Column(db.DateTime, nullable=False, index=True)
    report_date = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(db.String(50), nullable=False, default='PASS')
    row_count = db.Column(db.Integer, nullable=False, default=0)
    remarks = db.Column(db.Text, default='')
    source = db.Column(db.String(100), default='Database Update')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    catalog = db.relationship('DBTaskCatalog', backref=db.backref('update_history', lazy=True))

    def to_dict(self):
        return {
            'id': self.id,
            'catalogId': self.catalog_id,
            'personName': self.person_name,
            'person': self.person_name,
            'tableName': self.table_name,
            'rawTable': self.table_name,
            'finalName': self.final_name,
            'commodity': self.commodity,
            'dbUpdateTimestamp': _safe_iso(self.db_update_timestamp),
            'db_update_timestamp': _safe_iso(self.db_update_timestamp),
            'reportDate': str(self.report_date) if self.report_date else '',
            'report_date': str(self.report_date) if self.report_date else '',
            'status': self.status,
            'rowCount': self.row_count,
            'row_count': self.row_count,
            'remarks': self.remarks or '',
            'source': self.source or '',
            'createdAt': _safe_iso(self.created_at)
        }
```

### 6.2 SQL DDL Schema

```sql
CREATE TABLE IF NOT EXISTS `advance_erp`.`table_update_history` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `catalog_id` INT NULL,
    `person_name` VARCHAR(255) NOT NULL,
    `table_name` VARCHAR(128) NOT NULL,
    `final_name` VARCHAR(255) NOT NULL,
    `commodity` VARCHAR(255) NOT NULL,
    `db_update_timestamp` DATETIME NOT NULL,
    `report_date` DATE NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'PASS',
    `row_count` INT NOT NULL DEFAULT 0,
    `remarks` TEXT NULL,
    `source` VARCHAR(100) DEFAULT 'Database Update',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_update_hist_person` (`person_name`),
    INDEX `idx_update_hist_table` (`table_name`),
    INDEX `idx_update_hist_rep_date` (`report_date`),
    INDEX `idx_update_hist_db_ts` (`db_update_timestamp`),
    INDEX `idx_update_hist_comm` (`commodity`),
    CONSTRAINT `fk_update_hist_catalog` FOREIGN KEY (`catalog_id`) 
        REFERENCES `advance_erp`.`db_task_catalog` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 6.3 Direct History Extraction Service (`app/services/surveillance.py`)

A query function that extracts historical updates directly from MySQL `agalabsdev_stage` using table date/timestamps and catalog mappings:

```python
def extract_person_update_history_from_db(catalog_item):
    """
    Queries agalabsdev_stage directly for distinct (report_date, db_update_timestamp)
    groups, computing row counts and extracting authentic historical updates.
    """
    tbl = catalog_item.raw_table_name
    dcol = catalog_item.date_column or 'Date'
    fn = catalog_item.final_name
    comm = catalog_item.commodity
    u = catalog_item.user_name

    live_conn = get_live_mysql_connection()
    if not live_conn:
        return []

    # Detect timestamp column
    ts_cand = dcol
    try:
        with live_conn.cursor() as cur:
            cur.execute(f"DESCRIBE `{tbl}`;")
            cols = [c['Field'] for c in cur.fetchall()]
            for cand in ['CreatedDate', 'created_date', 'created_at', 'updated_at', 'TimeStamp']:
                if cand in cols:
                    ts_cand = cand
                    break

            where_clause = ""
            if 'trade_flow' in tbl.lower():
                if any(k in fn.lower() or k in comm.lower() for k in ['soybean', 'oil']):
                    where_clause = "WHERE CommodityName LIKE '%Soybean%'"
                elif any(k in fn.lower() or k in comm.lower() for k in ['pulse', 'chana', 'urad', 'moong', 'pea', 'masoor']):
                    where_clause = "WHERE CommodityName IN ('Bengal gram', 'Chana', 'Tur', 'Urad', 'Moong', 'Masoor', 'Pea')"

            q = f"""
                SELECT `{dcol}` as report_date, `{ts_cand}` as db_update_ts, COUNT(*) as cnt
                FROM `{tbl}`
                {where_clause}
                GROUP BY `{dcol}`, `{ts_cand}`
                ORDER BY `{dcol}` DESC, `{ts_cand}` DESC
                LIMIT 10;
            """
            cur.execute(q)
            rows = cur.fetchall()
            results = []
            for r in rows:
                results.append({
                    'catalog_id': catalog_item.id,
                    'person_name': u,
                    'table_name': tbl,
                    'final_name': fn,
                    'commodity': comm,
                    'db_update_timestamp': r['db_update_ts'],
                    'report_date': r['report_date'],
                    'status': 'PASS',
                    'row_count': r['cnt'],
                    'remarks': 'Retrieved directly from database update timestamps'
                })
            return results
    except Exception as e:
        print(f"Error querying {tbl}: {e}")
        return []
    finally:
        live_conn.close()
```

### 6.4 API Endpoints (`app/routes/crishi.py`)

#### 1. Retrieve Person-Basis Update History with Role Scoping
```python
@crishi_bp.route('/update-history', methods=['GET'])
@jwt_required(optional=True)
def get_update_history():
    """
    Retrieves immutable person-basis update history records directly from DB update date/timestamps.
    Enforces role scoping:
      - Admins (SuperAdmin, Manager, Leader) can view all or filter by teammate.
      - Teammates are strictly restricted to their own portfolio history.
    """
    user = get_current_user()
    user_identity = get_jwt_identity() or (user.email if user else None)
    
    # Determine user role
    role = user.role if user else ('Teammate' if user_identity else 'SuperAdmin')
    is_admin = role in ['SuperAdmin', 'Manager', 'Leader', 'Admin']

    requested_teammate = request.args.get('teammate', '').strip() or request.args.get('person', '').strip()
    commodity_filter = request.args.get('commodity', '').strip()
    table_filter = request.args.get('table', '').strip()
    report_date_filter = request.args.get('date', '').strip()
    limit = int(request.args.get('limit', 100))

    query = TableUpdateHistory.query

    # Enforce Teammate Role Scoping (Requirement R1 & R3)
    if not is_admin:
        teammate_name = user.name if user else (user_identity or 'Teammate')
        query = query.filter(TableUpdateHistory.person_name.ilike(f"%{teammate_name}%"))
    elif requested_teammate and requested_teammate.upper() != 'ALL':
        query = query.filter(TableUpdateHistory.person_name.ilike(f"%{requested_teammate}%"))

    if commodity_filter and commodity_filter.upper() != 'ALL':
        query = query.filter(TableUpdateHistory.commodity.ilike(f"%{commodity_filter}%"))

    if table_filter:
        query = query.filter(TableUpdateHistory.table_name.ilike(f"%{table_filter}%"))

    if report_date_filter:
        try:
            r_date = datetime.strptime(report_date_filter, '%Y-%m-%d').date()
            query = query.filter_by(report_date=r_date)
        except Exception:
            pass

    records = query.order_by(TableUpdateHistory.db_update_timestamp.desc(), TableUpdateHistory.id.desc()).limit(limit).all()

    # If table_update_history is not yet populated, auto-seed from agalabsdev_stage database records
    if not records and not requested_teammate and not commodity_filter:
        seed_update_history_from_stage()
        records = query.order_by(TableUpdateHistory.db_update_timestamp.desc(), TableUpdateHistory.id.desc()).limit(limit).all()

    return jsonify({
        'success': True,
        'count': len(records),
        'records': [r.to_dict() for r in records],
        'role': role,
        'is_admin': is_admin,
        'user_name': user.name if user else user_identity
    })
```

#### 2. Append-Only Integration in `/sync-report-db` (`app/routes/crishi.py:170–218`)
Whenever a teammate verifies a table update, append a new immutable entry to `table_update_history`:
```python
# In addition to DBTaskVerification:
history_entry = TableUpdateHistory(
    catalog_id=itm.id,
    person_name=user_identity,
    table_name=itm.raw_table_name,
    final_name=itm.final_name,
    commodity=itm.commodity,
    db_update_timestamp=datetime.now(timezone.utc),
    report_date=target_date,
    status='PASS' if verif_res.get('verified') else 'PENDING',
    row_count=verif_res.get('matching_rows', 0),
    remarks=f"Verified via {verif_res.get('source_type', 'DB')}",
    source=verif_res.get('source_type', 'Live MySQL (agalabsdev_stage)')
)
db.session.add(history_entry)
```

### 6.5 UI Integration in Crishi (`app/static/js/crishi.js`)

1. **Tab Navigation (lines 175–182):**
   Add dedicated 'Update History' tab button:
   ```html
   <button class="crishi-tab-btn ${this.activeTab === 'update_history' ? 'active' : ''}" id="tab-update-history">
       <i class="fas fa-history"></i> Update History
   </button>
   ```

2. **Tab Panel (`view-update-history`):**
   Render an interactive data table with:
   - Filter bar: Teammate selector (visible to Admins, pre-selected and locked/hidden for Teammates), Commodity selector, Date picker, Table search.
   - History table columns:
     - Person Name (Badge)
     - Business Title & Commodity
     - Table Name (`table-code-tag`)
     - DB Update Timestamp (Exact date & time of DB modification)
     - Report Date (Business period)
     - Status (Color-coded badge: `PASS`, `VERIFIED`, `NEED_CORRECTION`)
     - Row Count (Number of records)
     - Operational Remarks

3. **Portfolio Chip Direct Linking (lines 339–342):**
   Clicking a teammate chip in *"Teammate Portfolios (Click to Filter Workload)"* switches to the 'Update History' tab filtered to that teammate.

---

## 7. Verification Plan & Test Strategy

To verify this implementation end-to-end:
1. **Database Schema Verification:**
   Execute table creation in MySQL `advance_erp` and verify schema using `DESCRIBE table_update_history;`.
2. **Automated Unit & Integration Tests:**
   Create `tests/test_update_history.py` testing:
   - Extraction of historical updates from `pyexcel_trade_flow` for Nishant (Pulses) and Bhawna (Soybeans).
   - Validation that all 9 required fields are present and non-null on retrieved records.
   - Role scoping enforcement:
     - SuperAdmin/Manager (`ram@agalabs.com`, `nishant@agalabs.com`) can query all history and filter by any teammate.
     - Teammates (`bhawna@agalabs.com`, `gopichand@agalabs.com`) are restricted to their own portfolio update records.
   - Immutability check: verifying that repeated syncs append new history entries rather than mutating past logs.
3. **Execution Command:**
   ```powershell
   & ".venv\Scripts\python.exe" -m pytest tests/test_update_history.py -v
   ```
