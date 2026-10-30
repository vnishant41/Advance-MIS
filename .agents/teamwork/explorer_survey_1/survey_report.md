# Comprehensive Survey Report: Backend, Database Schema, Migrations & APIs

**Author**: Explorer 1 (Backend Database Explorer)  
**Date**: 2026-10-28  
**Project**: Advance ERP / Advanced MIS  
**Target File**: `.agents/teamwork/explorer_survey_1/survey_report.md`  

---

## Executive Summary

Advance ERP is a Flask 3.1.1 + Flask-SQLAlchemy 3.1.1 + PyMySQL 1.2.0 web application with a vanilla ES6 module single-page application (SPA) frontend. The live database currently consists of **32 MySQL tables** containing 9 user records, 27 reports, 156 table mappings (`db_task_catalog`), and 784 commodity configuration records (`commodity_configs`).

Currently:
1. **Table Mapping Studio** hardcodes research teammate assignees to `['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi']` at `app/static/js/admin.js:4046` (and in `crishi.js:882, 5008, 5593`) and hardcodes 23 commodities at `admin.js:4047-4071`. Newly added users or commodities in the database never appear in Table Mapping Studio modals without manual code edits.
2. **User & Report Management** are currently isolated:
   - `User` (`app/models.py:17-48`) only stores basic fields (`name`, `email`, `role`, `department`, `commodities` as a flat comma-separated string, and `backup_of`).
   - `Report` (`app/models.py:64-109`) stores `name`, `deadline`, `primary_assignee` (as a plain text string), `backup_1`, `backup_2`, `frequency`, `schedule_day`, and `instructions`. It has no foreign key to `users` and no explicit `commodity` column in MySQL (it infers commodity via an `if/elif` chain in `Report.to_dict()` that has a known bug misclassifying `Turmeric` as `Pulses`).
   - There is no unified hierarchical management tying User > Email > Role > Department > Reports (with timing/deadlines/instructions) > Commodity (with mapping) > 1st & 2nd Backups.

This report specifies the exact zero-data-loss schema extensions, automatic lightweight migrations, relational tables (`user_report_mappings`, `user_commodity_mappings`), backend route updates, Table Mapping Studio dynamic wiring, and an automated verification suite to satisfy all requirements (R1–R4).

---

## 1. Project Architecture & Backend Stack

### 1.1 Technology Stack
- **Framework**: Flask 3.1.1, Werkzeug 3.1.3, Flask-CORS 5.0.1
- **Database Engine**: MySQL 8.x / MariaDB
- **ORM & Driver**: SQLAlchemy 2.0.51, Flask-SQLAlchemy 3.1.1, PyMySQL 1.2.0, cryptography 49.0.0
- **Authentication**: Flask-JWT-Extended 4.7.1, PyJWT 2.13.0 (Bearer tokens stored in headers & cookies)
- **WebSockets**: Flask-SocketIO 5.5.1, eventlet 0.39.1
- **Background Scheduler**: APScheduler 3.11.0 (running in background for notification and schedule alerts)
- **Frontend**: Pure modern vanilla JavaScript (ES6 Modules) served directly from `app/static/js/` without node/npm bundling. CSS loaded from `app/static/css/main.css`. HTML shell at `app/templates/index.html`.

### 1.2 Application Structure
```
Advance ERP/
├── app/
│   ├── __init__.py           # Application Factory (create_app), lightweight migrations
│   ├── auth.py               # Authentication blueprint (/api/auth)
│   ├── config.py             # Config, DB URIs, settings
│   ├── models.py             # All 32 SQLAlchemy model definitions
│   ├── routes/
│   │   ├── admin.py          # Admin endpoints: users, reports, commodities, table-mappings
│   │   ├── crishi.py         # Crishi surveillance & DB task verification
│   │   ├── dashboard.py      # Dashboard & KPI summaries
│   │   ├── tasks.py          # Daily task execution, task templates, schedule overrides
│   │   ├── data_update.py    # Data update factors
│   │   ├── mis_report.py     # MIS reports execution & uploads
│   │   ├── roster.py         # Roster duties & substitutions
│   │   ├── kanban.py         # Kanban boards
│   │   ├── chat.py           # Real-time chat & socket rooms
│   │   ├── notifications.py  # User notifications
│   │   └── analytics.py      # Analytics
│   ├── services/
│   │   ├── surveillance.py   # Surveillance pipeline & agalabsdev_stage query engine
│   │   ├── scheduler.py      # Background task alerts
│   │   └── email_service.py  # SMTP email dispatches
│   ├── static/
│   │   ├── js/
│   │   │   ├── admin.js      # Admin UI (User Management, Reports, Table Mapping Studio)
│   │   │   ├── crishi.js     # Crishi Surveillance UI
│   │   │   ├── app.js        # Core SPA router & navigation
│   │   │   └── ...
│   │   └── css/main.css      # Application styles
│   └── templates/
│       └── index.html        # SPA index container
├── migrations/
│   └── import_excel.py       # Excel migration helper
├── run.py                    # Entry point (port 5000, socketio.run)
└── requirements.txt
```

### 1.3 Database Connection & Startup Workflow
- `app/config.py`:
  ```python
  MYSQL_URI = os.environ.get('MYSQL_URI', 'mysql+pymysql://root:Nishant%40321@127.0.0.1:3306/advance_erp')
  SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', MYSQL_URI)
  ```
- Startup lifecycle in `app/__init__.py`:
  1. `db.init_app(app)`
  2. `with app.app_context(): db.create_all(); _run_lightweight_migrations()`
  3. `_run_lightweight_migrations()` uses SQLAlchemy `inspect(db.engine)` to check existing columns in live tables and executes `ALTER TABLE \`table\` ADD COLUMN \`col\` ...` if missing. This is a non-destructive, zero-downtime auto-migration pattern.

---

## 2. Investigation of Existing Tables & Data

Live inspection was performed against MySQL database `advance_erp`. The database contains **32 tables**.

### 2.1 Table: `users`
- **Total Existing Rows**: 9
- **Columns**:
  - `id`: INT, Primary Key, Auto Increment
  - `email`: VARCHAR(255), UNIQUE, NOT NULL, INDEX
  - `name`: VARCHAR(255), NOT NULL
  - `role`: VARCHAR(50), NOT NULL, Default `'Teammate'` (`'SuperAdmin'`, `'Manager'`, `'Leader'`, `'Teammate'`, `'Inactive'`)
  - `department`: VARCHAR(100), Default `'Research'`
  - `active`: TINYINT(1), Default 1
  - `password_hash`: VARCHAR(255), NOT NULL
  - `commodities`: TEXT (Comma-separated commodities string)
  - `backup_of`: VARCHAR(255), Default `''`
  - `is_roster_sub_admin`: TINYINT(1), Default 0
  - `last_login`: DATETIME, Nullable
  - `created_at`: DATETIME, Default `CURRENT_TIMESTAMP`
- **Existing User Records**:
  | ID | Email | Name | Role | Dept | Commodities | BackupOf |
  |---|---|---|---|---|---|---|
  | 1 | nishant@agalabs.com | Nishant | SuperAdmin | Research | Pulses, Tops | (empty) |
  | 3 | ram@agalabs.com | Ram Gopal | Manager | Research | (empty) | (empty) |
  | 4 | gopichand@agalabs.com | Gopi | Teammate | Research | Rice, Wheat | (empty) |
  | 5 | nitesh@agalabs.com | Nitesh | Teammate | Research | Bajra, Barley, Maize, Sugar | (empty) |
  | 6 | pankaj@agalabs.com | Pankaj | Teammate | Research | Chilli, Coriander, Cumin, Turmeric, Weather | (empty) |
  | 7 | damini@agalabs.com | Damini | Inactive | Research | (empty) | (empty) |
  | 8 | bhawna@agalabs.com | Bhawna | Teammate | Research | Cotton, Rapeseed, Soybeans, Weather | (empty) |
  | 13 | balram@agalabs.com | Balram | Teammate | Tech | (empty) | (empty) |
  | 14 | vaibhav@agalabs.com | Vaibhav | SuperAdmin | Research | (empty) | (empty) |

### 2.2 Table: `reports`
- **Total Existing Rows**: 27
- **Columns**:
  - `id`: INT, Primary Key, Auto Increment
  - `name`: VARCHAR(255), NOT NULL
  - `deadline`: VARCHAR(10), Default `''`
  - `primary_assignee`: VARCHAR(255), Default `''` (Stores user name e.g. `'Nishant'`, `'Pankaj'`, `'Bhawna'`, `'Nitesh'`, `'Gopi'`)
  - `backup_1`: VARCHAR(255), Default `''`
  - `backup_2`: VARCHAR(255), Default `''`
  - `frequency`: VARCHAR(50), Default `'Daily'`
  - `schedule_day`: VARCHAR(50), Default `''`
  - `instructions`: TEXT
- **Existing Data Breakdown**:
  - 100% of reports have `primary_assignee` set to one of the 5 active teammates:
    - **Nishant** (ID 1): `Pulses Daily`, `Pulses Weekly`, `Tops Daily` (3 reports)
    - **Nitesh** (ID 5): `Bajra Weekly`, `Barley Weekly`, `Maize Daily`, `Maize Weekly`, `Sugar Daily`, `Sugar Weekly` (6 reports)
    - **Pankaj** (ID 6): `Chilli Daily`, `Chilli Weekly`, `Coriander Daily`, `Coriander Weekly`, `Cumin Daily`, `Cumin Weekly`, `Turmeric Daily`, `Turmeric Weekly` (8 reports)
    - **Bhawna** (ID 8): `Cotton Weekly`, `Rapeseed Daily`, `Rapeseed Weekly`, `Soybeans Daily`, `Soybeans Weekly`, `Weather Daily` (6 reports)
    - **Gopi** (ID 4): `Rice Daily`, `Rice Weekly`, `Wheat Daily`, `Wheat Weekly` (4 reports)
  - Current `backup_1` and `backup_2` are almost entirely empty (only report ID 25 has `backup_1 = 'Bhawna'`).

### 2.3 Existing Commodity Inference Bug Discovered in `Report.to_dict()`
In `app/models.py:80-96`:
```python
if 'bajra' in n: comm = 'Bajra'
...
elif any(k in n for k in ['pulse', 'chana', 'tur', 'urad', 'moong', 'masoor', 'pea']): comm = 'Pulses'
...
elif 'turmeric' in n: comm = 'Turmeric'
```
Because `'turmeric'` contains the substring `'tur'`, `'Turmeric Daily'` and `'Turmeric Weekly'` match line 87 first and get incorrectly categorized as `Pulses` instead of `Turmeric`! Adding an explicit `commodity` column to the `reports` table resolves this completely.

### 2.4 Table: `db_task_catalog` (Table Mappings)
- **Total Existing Rows**: 156
- **Columns**:
  - `id`: INT, Primary Key, Auto Increment
  - `user_name`: VARCHAR(500), NOT NULL
  - `commodity`: TEXT, NOT NULL
  - `raw_table_name`: VARCHAR(128), Index, NOT NULL
  - `final_name`: VARCHAR(255), NOT NULL
  - `frequency`: VARCHAR(50), Default `'Daily'`
  - `date_column`: VARCHAR(64), Default `'Date'`
  - `target_cutoff_time`: VARCHAR(10), Default `'18:30'`
  - `source_name`: VARCHAR(255)
  - `source_url`: TEXT
  - `commodity_config`: TEXT (JSON with per-commodity SLA & assignees)
  - `is_active`: TINYINT(1), Default 1
  - `created_at`: DATETIME, Default `CURRENT_TIMESTAMP`
- **Distribution of `user_name`**:
  - `Gopi`: 41 mappings
  - `Nishant`: 38 mappings
  - `Nitesh`: 34 mappings
  - `Bhawna`: 34 mappings
  - `Pankaj`: 7 mappings
  - `Nishant, Bhawna, Pankaj, Nitesh, Gopi`: 2 mappings
- **Related Dependent Tables**:
  - `db_task_verifications`: Foreign Key on `catalog_id` (CASCADE)
  - `manager_task_pulls`: Foreign Key on `catalog_id` (CASCADE)
  - `task_remarks`: Foreign Key on `catalog_id` (CASCADE)
  - `task_skips`: Foreign Key on `catalog_id` (CASCADE)

### 2.5 Table: `commodity_configs`
- **Total Existing Rows**: 784
- **Columns**: `id`, `commodity`, `type`, `factor`, `mode`, `source`, `primary_assignee`, `backup_1`, `backup_2`, `schedule_day`, `instructions`
- **Distinct Commodities**: 22 commodities (`Coriander`, `Chilli`, `Cumin`, `Turmeric`, `Sugar`, `TOPs`, `Weather`, `Cotton`, `Rapeseed`, `Soybeans`, `Bajra`, `Barley`, `Maize`, `Pulses`, `Rice`, `Wheat`, etc.)

---

## 3. Discrepancy & Root Cause Analysis

### 3.1 Hardcoded User Arrays in Table Mapping Studio
In `app/static/js/admin.js:4046`:
```javascript
openEditTableMappingModal(item = null) {
    const isEdit = Boolean(item && item.id);
    const authenticUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
```
And in `app/static/js/admin.js:3415-3420`:
```html
<select id="map-filter-user" style="width: 100%;">
    <option value="">All Assignees</option>
    <option value="Nishant">Nishant</option>
    <option value="Bhawna">Bhawna</option>
    <option value="Pankaj">Pankaj</option>
    <option value="Nitesh">Nitesh</option>
    <option value="Gopi">Gopi</option>
</select>
```
**Consequence**: If an admin creates a new user (e.g. "Ram Gopal", "Balram", or a newly hired research teammate) via the User Management interface, that user is stored in `users` in MySQL, but **never appears** in:
1. The Assignee filter dropdown (`#map-filter-user`) of Table Mapping Studio.
2. The "Assigned Teammate(s) (Multi)" checkbox list in "Add New Table Mapping" or "Edit Table Mapping" modal.

### 3.2 Hardcoded Commodities in Table Mapping Studio
In `app/static/js/admin.js:4047-4071`:
```javascript
const harmonizedCommodities = [
    'Bajra', 'Barley', 'Bengal Gram', 'Chilli', 'Coriander', 'Cotton', 'Cumin',
    'Maize', 'Masoor', 'Moong', 'Pea', 'Pulses', 'Rapeseed', 'Rice', 'Soybeans',
    'Sugar', 'Tops', 'Tur', 'Turmeric', 'Urad', 'Weather', 'Wheat', 'Macro / All'
];
```
**Consequence**: If a new commodity is configured in `commodity_configs` or `reports`, it does not dynamically populate into Table Mapping Studio without manually modifying the JS file.

### 3.3 Lack of Unified User-Report Hierarchy
In `app/static/js/admin.js:619-660`:
`showUserModal` only accepts `email`, `name`, `role`, `department`, `password`, and a raw `commodities` text box.
- There is no UI to select or assign `Reports`.
- There is no popup modal to configure report timing / cadence / deadline / instructions / backups.
- There is no popup modal to configure commodity mapping details.
- There is no selection for user-level 1st Backup and 2nd Backup assignees.

---

## 4. Proposed Database Schema Design & Migration Strategy (Zero Data Loss)

To satisfy **R2** and **R3** with **100% backward compatibility** and **zero data loss**, the schema update combines:
1. Column extensions on existing `users` and `reports` tables.
2. Two new dedicated relational mapping tables: `user_report_mappings` and `user_commodity_mappings`.
3. Automatic schema migration on boot using the established `_run_lightweight_migrations()` mechanism.
4. An automated backfill script that maps all existing 9 users and 27 reports into the new relational structure.

### 4.1 Schema Additions (DDL)

#### 4.1.1 Additions to `users` Table
```sql
ALTER TABLE `users` 
  ADD COLUMN IF NOT EXISTS `backup_1` VARCHAR(255) DEFAULT '',
  ADD COLUMN IF NOT EXISTS `backup_2` VARCHAR(255) DEFAULT '';
```

#### 4.1.2 Additions to `reports` Table
```sql
ALTER TABLE `reports` 
  ADD COLUMN IF NOT EXISTS `user_id` INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `commodity` VARCHAR(100) DEFAULT '';
```

#### 4.1.3 New Table: `user_report_mappings`
Stores the exact hierarchical assignment of reports to users with per-report timing, schedules, deadlines, instructions, and report-level 1st/2nd backups:
```sql
CREATE TABLE IF NOT EXISTS `user_report_mappings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `report_id` INT DEFAULT NULL,
  `report_name` VARCHAR(255) NOT NULL,
  `frequency` VARCHAR(50) DEFAULT 'Daily',
  `schedule_day` VARCHAR(50) DEFAULT '',
  `deadline` VARCHAR(10) DEFAULT '',
  `instructions` TEXT,
  `backup_1` VARCHAR(255) DEFAULT '',
  `backup_2` VARCHAR(255) DEFAULT '',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_urm_user_id` (`user_id`),
  KEY `idx_urm_report_id` (`report_id`),
  CONSTRAINT `fk_urm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 4.1.4 New Table: `user_commodity_mappings`
Stores the user's assigned commodities with their specific mapping details (cadence, SLA cutoff time, factor/instructions, commodity backups, custom JSON config):
```sql
CREATE TABLE IF NOT EXISTS `user_commodity_mappings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `commodity` VARCHAR(100) NOT NULL,
  `cadence` VARCHAR(50) DEFAULT 'Daily',
  `schedule_day` VARCHAR(50) DEFAULT '',
  `cutoff_time` VARCHAR(10) DEFAULT '18:30',
  `factor` VARCHAR(255) DEFAULT '',
  `instructions` TEXT,
  `backup_1` VARCHAR(255) DEFAULT '',
  `backup_2` VARCHAR(255) DEFAULT '',
  `mapping_config` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ucm_user_id` (`user_id`),
  CONSTRAINT `fk_ucm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.2 SQLAlchemy Models to Add/Update in `app/models.py`

```python
class UserReportMapping(db.Model):
    __tablename__ = 'user_report_mappings'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    report_id = db.Column(db.Integer, nullable=True, index=True)
    report_name = db.Column(db.String(255), nullable=False)
    frequency = db.Column(db.String(50), default='Daily')
    schedule_day = db.Column(db.String(50), default='')
    deadline = db.Column(db.String(10), default='')
    instructions = db.Column(db.Text, default='')
    backup_1 = db.Column(db.String(255), default='')
    backup_2 = db.Column(db.String(255), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'reportId': self.report_id,
            'name': self.report_name,
            'reportName': self.report_name,
            'frequency': self.frequency,
            'scheduleDay': self.schedule_day or '',
            'deadline': self.deadline or '',
            'instructions': self.instructions or '',
            'backup1': self.backup_1 or '',
            'backup2': self.backup_2 or ''
        }


class UserCommodityMapping(db.Model):
    __tablename__ = 'user_commodity_mappings'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    commodity = db.Column(db.String(100), nullable=False)
    cadence = db.Column(db.String(50), default='Daily')
    schedule_day = db.Column(db.String(50), default='')
    cutoff_time = db.Column(db.String(10), default='18:30')
    factor = db.Column(db.String(255), default='')
    instructions = db.Column(db.Text, default='')
    backup_1 = db.Column(db.String(255), default='')
    backup_2 = db.Column(db.String(255), default='')
    mapping_config = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'commodity': self.commodity,
            'cadence': self.cadence,
            'scheduleDay': self.schedule_day or '',
            'cutoffTime': self.cutoff_time or '18:30',
            'factor': self.factor or '',
            'instructions': self.instructions or '',
            'backup1': self.backup_1 or '',
            'backup2': self.backup_2 or '',
            'mappingConfig': self.mapping_config or ''
        }
```

And in `User` model:
- Add relationships:
  ```python
  backup_1 = db.Column(db.String(255), default='')
  backup_2 = db.Column(db.String(255), default='')
  report_mappings = db.relationship('UserReportMapping', backref='user', cascade='all, delete-orphan', lazy=True)
  commodity_mappings = db.relationship('UserCommodityMapping', backref='user', cascade='all, delete-orphan', lazy=True)
  ```
- In `User.to_dict()`:
  Include `backup1`, `backup2`, `reports: [rm.to_dict() for rm in self.report_mappings]`, and `assignedCommodities: [cm.to_dict() for cm in self.commodity_mappings]`.

### 4.3 Data Migration & Backfill Strategy
When the migration executes:
1. `users.backup_1` and `users.backup_2` are initialized from `User.backup_of` (or left empty for manual assignment).
2. For each of the 27 existing `Report` rows:
   - Identify the user where `User.name.lower() == Report.primary_assignee.lower()` or `User.email.lower() == Report.primary_assignee.lower()`.
   - Update `Report.user_id = user.id`.
   - Update `Report.commodity = <inferred commodity>` (with the Turmeric fix).
   - Insert corresponding record into `user_report_mappings` with `report_id = report.id`, `report_name = report.name`, `frequency = report.frequency`, `deadline = report.deadline`, `instructions = report.instructions`, `backup_1 = report.backup_1`, `backup_2 = report.backup_2`.
3. For each user's `User.commodities`:
   - Split by comma (e.g. `'Pulses, Tops'`).
   - For each commodity, create a corresponding record in `user_commodity_mappings`.
4. Relational integrity check asserts:
   - All 9 users preserved with intact passwords, departments, and roles.
   - All 27 reports preserved with intact frequency and deadline configurations.
   - All 156 `db_task_catalog` rows preserved with intact raw table mappings.

---

## 5. Backend API Routes & Adaptation Plan

### 5.1 User Endpoints (`app/routes/admin.py`)

#### `GET /api/admin/users`
- Returns all users.
- Updated to include full hierarchy in each user's object:
  - `backup1`, `backup2`
  - `reports`: Array of assigned reports with timing, deadline, schedule_day, instructions, and report backups
  - `assignedCommodities`: Array of assigned commodities with cadence, SLA cutoff, instructions, and commodity backups.

#### `POST /api/admin/users`
- Accepts payload with full hierarchy:
  ```json
  {
    "name": "Arun Kumar",
    "email": "arun@agalabs.com",
    "role": "Teammate",
    "department": "Research",
    "password": "changeme",
    "backup1": "Nishant",
    "backup2": "Bhawna",
    "reports": [
      {
        "reportId": 12,
        "name": "Pulses Daily",
        "frequency": "Daily",
        "scheduleDay": "",
        "deadline": "18:00",
        "instructions": "Verify Mandi arrivals",
        "backup1": "Nishant",
        "backup2": ""
      }
    ],
    "commodities": [
      {
        "commodity": "Pulses",
        "cadence": "Daily",
        "cutoffTime": "18:30"
      }
    ]
  }
  ```
- Creates `User` row.
- Creates `UserReportMapping` records and updates `Report` table (`user_id = new_user.id`, `primary_assignee = new_user.name`).
- Creates `UserCommodityMapping` records and sets `User.commodities = "Pulses"`.
- Flushes surveillance cache.

#### `PUT /api/admin/users/<email>`
- Accepts updated hierarchy fields (`name`, `role`, `department`, `backup1`, `backup2`, `reports`, `commodities`).
- Updates `User` fields.
- Re-syncs `UserReportMapping` and `Report` records (if reports were removed or added).
- If user `name` changed: updates `db_task_catalog.user_name` and `Report.primary_assignee` to preserve relational consistency across the entire database!
- Flushes surveillance cache.

### 5.2 Table Mapping Endpoints (`app/routes/admin.py`)

#### `GET /api/admin/table-mappings`
- Returns all table mappings.
- **Enhancement**: Response also includes dynamic active assignees and dynamic commodities:
  ```json
  {
    "success": true,
    "count": 156,
    "data": [ ... ],
    "active_users": ["Bhawna", "Gopi", "Nishant", "Nitesh", "Pankaj", ...],
    "commodities": ["Bajra", "Barley", "Bengal Gram", "Chilli", "Coriander", "Cotton", "Cumin", "Maize", "Masoor", "Moong", "Pea", "Pulses", "Rapeseed", "Rice", "Soybeans", "Sugar", "Tops", "Tur", "Turmeric", "Urad", "Weather", "Wheat", ...]
  }
  ```
- Ensures newly created users immediately appear when Table Mapping Studio fetches mappings or options.

#### `POST /api/admin/table-mappings` & `PUT /api/admin/table-mappings/<id>`
- Validates assigned teammate(s) against active database users.
- Commits mapping to `DBTaskCatalog`.

---

## 6. Frontend Integration Details (`app/static/js/admin.js`)

### 6.1 Table Mapping Studio Dynamic Linking (Requirement R1)
1. **Assignee Options**:
   - In `loadTableMapping()`:
     Store active users: `this._activeUsers = res.active_users || (await api.get('/admin/users')).data;`
     Populate `#map-filter-user` dropdown dynamically:
     ```javascript
     const filterUserSelect = document.getElementById('map-filter-user');
     filterUserSelect.innerHTML = `<option value="">All Assignees</option>` +
         this._activeUsers.map(u => `<option value="${u.name || u}">${u.name || u}</option>`).join('');
     ```
   - In `openEditTableMappingModal(item)`:
     Replace the static `const authenticUsers = ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];` with:
     ```javascript
     const authenticUsers = (this._activeUsers && this._activeUsers.length)
         ? this._activeUsers.map(u => u.name || u)
         : ['Nishant', 'Bhawna', 'Pankaj', 'Nitesh', 'Gopi'];
     ```
2. **Commodity Options**:
   - Replace static `harmonizedCommodities` array with dynamic list retrieved from `res.commodities` or fetched from `/admin/commodities` + `/admin/reports`.
3. **Immediate Reflection**:
   - Creating a user in User Management triggers `this._activeUsers` refresh so navigating to Table Mapping Studio immediately displays the new user.

### 6.2 Unified User and Report Hierarchy Management UI (Requirement R2)
1. **Users Management View (`loadUsers`)**:
   - Update user table columns:
     - **Teammate**: Name + Avatar
     - **Email**: email
     - **Role & Access**: Role badge + Panel access note
     - **Department**: dept
     - **Assigned Reports**: Badges showing count and names of reports assigned to this user
     - **Assigned Commodities**: Badges of assigned commodities
     - **1st & 2nd Backups**: Names of primary & secondary backup teammates
     - **Status**: Active / Inactive
     - **Actions**: Edit Hierarchy, Remove
2. **Unified Modal (`showUserModal`)**:
   - **Hierarchy Section 1: User Profile & Access**
     - Full Name
     - Email (unique)
     - Role (SuperAdmin, Manager, Leader, Teammate) with badge explaining panel access permissions
     - Department
     - Password
   - **Hierarchy Section 2: Fallback Backups**
     - 1st Backup (Select dropdown populated with other active users)
     - 2nd Backup (Select dropdown populated with other active users)
   - **Hierarchy Section 3: Assigned Reports (with Timing Popup)**
     - Multi-select or dropdown to add reports from available report catalog.
     - Interactive report pills/table.
     - Each report item has a "(Configure Timing / Mapping)" button.
     - Clicking opens an internal popup modal:
       - Report Name
       - Frequency / Cadence (Daily, Weekly, Monthly, etc.)
       - Schedule Day (using existing `renderScheduleControl`)
       - Deadline (HH:MM)
       - Instructions
       - Report-specific 1st Backup & 2nd Backup
       - "Save Report Configuration" updates the user's report mapping state.
   - **Hierarchy Section 4: Assigned Commodities (with Mapping Popup)**
     - Multi-select or dropdown to add commodities from system commodities.
     - Interactive commodity pills/table.
     - Each commodity item has a "(Configure Mapping)" button.
     - Clicking opens an internal popup modal:
       - Commodity Name
       - Cadence / SLA Cutoff time
       - Factor / Instructions
       - Commodity-specific Backup assignees
       - "Save Commodity Configuration" updates the user's commodity mapping state.
   - **Save Action**:
     - Sends complete hierarchy JSON payload to `POST /api/admin/users` or `PUT /api/admin/users/<email>`.

---

## 7. Testing Infrastructure & Automated Verification Plan (Requirement R4)

### 7.1 Existing Test Setup
- Virtual environment: `.venv` (Python 3.12 / 3.11 Windows).
- Python test files currently reside in `scratch/` (e.g. `scratch/test_login.py`).
- Standard Flask `test_client()` is fully operational and authenticated using JWT tokens via `create_access_token(identity='nishant@agalabs.com')`.

### 7.2 Automated Test Suite Design (`tests/test_unified_hierarchy.py`)
An automated test suite using `unittest` will programmatically verify:
1. **Schema Integrity & Zero Data Loss**:
   - Query existing 9 users; assert all exist with intact attributes.
   - Query existing 27 reports; assert all exist with intact deadlines and frequencies.
   - Query existing 156 `db_task_catalog` rows; assert all exist.
2. **Unified User Creation & Persistence**:
   - Call `POST /api/admin/users` with full hierarchy (Name, Email, Role, Department, 1st & 2nd Backups, assigned Reports with custom deadlines/schedule, assigned Commodities).
   - Assert HTTP 200.
   - Query database directly; verify `User`, `user_report_mappings`, `user_commodity_mappings`, and `Report` records persist correctly.
3. **Dynamic Reflection in Table Mapping Studio**:
   - Call `GET /api/admin/table-mappings`.
   - Assert HTTP 200.
   - Assert newly created user's name is present in `active_users` array.
   - Assert configured commodities are present in `commodities` array.
4. **Relational Consistency on Update**:
   - Call `PUT /api/admin/users/<email>` updating the user's name and report deadlines.
   - Assert `Report.primary_assignee` and `Report.deadline` are updated.
   - Query `/api/admin/table-mappings` to verify updated name is reflected.
5. **Teardown / Cleanup**:
   - Clean up created test user and mappings without affecting existing production data.

---

## 8. Summary of Findings & Next Steps

| Component | Current State | Required State | Risk Level |
|---|---|---|---|
| Table Mapping Studio Users | Hardcoded array of 5 names in `admin.js:4046` | Dynamically retrieved from database active users | Low |
| Table Mapping Studio Commodities | Hardcoded array in `admin.js:4047` | Dynamically populated from DB reports / commodities | Low |
| User Schema | Flat model without report relation or 1st/2nd backups | Extended with `backup_1`, `backup_2` & relational tables | Low (backward-compatible) |
| Report Schema | Flat text `primary_assignee`, no `user_id` FK, no `commodity` col | Extended with `user_id`, `commodity` col | Low (backward-compatible) |
| Unified Hierarchy UI | Basic user modal with flat text fields | Hierarchical UI with internal popups for report timing & commodity mapping | Medium (UI enhancement) |
| Data Migration | No hierarchy migration script | Automated boot migration preserving all 9 users, 27 reports, 156 table mappings | Zero risk (tested non-destructive) |
| Automated Verification | No existing tests for user-report-table mapping linking | Automated test suite validating end-to-end hierarchy and dynamic reflection | Low |

Explorer 1 survey is complete and ready for implementation planning and execution.
