# System Architecture & Technical Design Specification

> **Document Version:** 2.0  
> **Status:** Technical Architecture Specification  
> **Target Environment:** Flask / SQLAlchemy / MySQL 8.0 / Vanilla CSS & JS / Eventlet / APScheduler

---

## 1. High-Level Architecture & Dual-Database Strategy

The redesigned system operates on a **Dual-Database Strategy** to guarantee absolute isolation between raw agricultural data and ERP management metadata:

```mermaid
graph TD
    subgraph UI [Frontend Presentation Layer]
        Nav[Consolidated Top Bar: 1. Crishi DB | 2. Report]
        Grid[10-Column Live Surveillance Grid]
        RosterView[2-Month Non-Repeating Roster View]
        ReportModal[3-in-1 Report Inspection Modal]
    end

    subgraph Backend [Flask Application Services Layer]
        SurveillanceDaemon[DB Surveillance Daemon (APScheduler)]
        GmailDaemon[Gmail Ingestion Daemon (IMAP / API)]
        AIEngine[AI PDF Analysis & Extraction Engine]
        RosterEngine[Fair Rotation Constraint Engine]
        APIRoutes[REST Controllers / Blueprints]
    end

    subgraph DataTier [Dual Database Tier]
        ERP_DB[(advance_erp DB: App Metadata, Roster, Pulls, Reports)]
        STAGE_DB[(agalabsdev_stage DB: 132 Live Commodity Tables)]
    end

    UI <--> APIRoutes
    APIRoutes <--> ERP_DB
    SurveillanceDaemon -->|Live MAX Date Queries| STAGE_DB
    SurveillanceDaemon -->|Update Status Cache| ERP_DB
    GmailDaemon -->|Store PDF & Email Metadata| ERP_DB
    GmailDaemon -->|Trigger Analysis| AIEngine
    AIEngine -->|Store Insights JSON| ERP_DB
    RosterEngine <--> ERP_DB
```

### 1.1 Database 1: `agalabsdev_stage` (The Monitored Research Database)
- **Host / Port:** `127.0.0.1:3306` (or internal research server IP `168.144.28.192`).
- **Role:** Pure read-only surveillance target for the MIS application.
- **Content:** The 132+ raw commodity tables (e.g., `pyexcel_rakemovement`, `ipga_imported_market_prices`, `pystage_factrates_sowingprogress`, `sopa_spot_price`).
- **Access Pattern:** The MIS executes lightweight `SELECT MAX(date_col)` queries to determine data presence.

### 1.2 Database 2: `advance_erp` (The Management Information Database)
- **Role:** Full read-write persistence for all application features.
- **Content:** User accounts, Sub-Admin permissions, table catalogs, Manager Pull records, Admin Skip logs, user remarks, published weekly rosters, and ingested email reports.

---

## 2. Background Daemons & Worker Engine

The application integrates background worker threads managed by `APScheduler`:

### Daemon 1: Table Surveillance Worker (`db_surveillance_worker`)
- **Interval:** Runs every 5 minutes during trading/working hours (08:30 to 20:00 IST) and every 30 minutes off-hours.
- **Execution:**
  1. Reads all active table descriptors from `advance_erp.db_task_catalog`.
  2. Queries `MAX(date_col)` from `agalabsdev_stage`.
  3. Compares dates against the schedule rules:
     - If `Daily/Weekly`: Checks against calendar cutoff.
     - If `Monthly/Yearly`: Checks if an active Manager Pull is open.
  4. Caches status (`PASS`, `FAIL`, `SKIP`, `AWAITING_PULL`) in memory/Redis to allow instantaneous frontend table loading.

### Daemon 2: Gmail Report Collector (`gmail_collector_worker`)
- **Interval:** Runs every 3 minutes.
- **Execution:**
  1. Authenticates securely to `imap.gmail.com:993` via SSL using Gmail App Password.
  2. Searches for unread messages containing PDF attachments or designated keywords (`Digest`, `Wire`, `Report`).
  3. Downloads and saves attachments to `uploads/reports/YYYY-MM/`.
  4. Persists email metadata (Subject, Sender, Timestamp, Body) to `advance_erp.email_reports`.
  5. Queues background task for AI Text & Table Analysis.

### Daemon 3: SLA Countdown & Escalation Dispatcher
- **Interval:** Runs every 1 minute.
- **Execution:**
  1. Inspects active Manager Pulls in `advance_erp.manager_task_pulls`.
  2. If the SLA time expires without a corresponding DB record in `agalabsdev_stage`, marks task as `FAIL` and emits a high-priority WebSocket / banner alert.

---

## 3. Database Schema DDL for `advance_erp`

Below are the production MySQL DDL statements for the new and updated tables:

```sql
USE `advance_erp`;

-- --------------------------------------------------------
-- 1. Table Catalog: Master Registry of Monitored Tables
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `db_task_catalog` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `commodity` VARCHAR(100) NOT NULL,
  `raw_table_name` VARCHAR(128) NOT NULL,
  `final_name` VARCHAR(255) NOT NULL,
  `frequency` ENUM('Daily', 'Weekly', 'Monthly', 'Yearly', 'Occasionally') NOT NULL DEFAULT 'Daily',
  `date_column` VARCHAR(64) NOT NULL DEFAULT 'Date',
  `target_cutoff_time` TIME DEFAULT '18:30:00',
  `source_name` VARCHAR(255) DEFAULT NULL,
  `source_url` TEXT,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_table_name` (`raw_table_name`),
  KEY `idx_commodity` (`commodity`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 2. Manager Task Pulls: Tracking Gated Cadences
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `manager_task_pulls` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `catalog_id` BIGINT NOT NULL,
  `pulled_by_user_id` BIGINT NOT NULL,
  `pulled_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sla_hours` INT NOT NULL DEFAULT 24,
  `deadline` DATETIME NOT NULL,
  `status` ENUM('Open', 'Completed_On_Time', 'Late_Completed', 'Expired_Failed') DEFAULT 'Open',
  `completed_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_catalog_status` (`catalog_id`, `status`),
  CONSTRAINT `fk_pull_catalog` FOREIGN KEY (`catalog_id`) REFERENCES `db_task_catalog` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 3. Admin Task Skips: Audit Record of Skipped Duties
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_skips` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `catalog_id` BIGINT NOT NULL,
  `skip_date` DATE NOT NULL,
  `skipped_by_user_id` BIGINT NOT NULL,
  `reason` TEXT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_catalog_date` (`catalog_id`, `skip_date`),
  CONSTRAINT `fk_skip_catalog` FOREIGN KEY (`catalog_id`) REFERENCES `db_task_catalog` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 4. Task Remarks: Free-text User Explanations
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_remarks` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `catalog_id` BIGINT NOT NULL,
  `remark_date` DATE NOT NULL,
  `user_id` BIGINT NOT NULL,
  `remark_text` TEXT NOT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_catalog_remark_date` (`catalog_id`, `remark_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 5. Two-Month Rotating Weekly Roster
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roster_schedules` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `week_start_date` DATE NOT NULL,
  `week_end_date` DATE NOT NULL,
  `duty_name` VARCHAR(150) NOT NULL,
  `raw_table_name` VARCHAR(128) DEFAULT NULL,
  `assigned_user_id` BIGINT NOT NULL,
  `backup_user_id` BIGINT DEFAULT NULL,
  `is_rake_movement` TINYINT(1) DEFAULT 0,
  `created_by_user_id` BIGINT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_week_user` (`week_start_date`, `assigned_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 6. Email Reports: Ingested Gmail Market Documents
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `email_reports` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `report_name` VARCHAR(255) NOT NULL,
  `date_sent` DATE NOT NULL,
  `time_sent` TIME NOT NULL,
  `subject` VARCHAR(500) NOT NULL,
  `sender_email` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `email_body_html` MEDIUMTEXT,
  `ai_summary_json` JSON DEFAULT NULL,
  `status` ENUM('Ingested', 'Analyzed', 'Warning') DEFAULT 'Ingested',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_date_sent` (`date_sent`),
  KEY `idx_report_name` (`report_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 7. User Role Extension: Sub-Admin Flag
-- --------------------------------------------------------
ALTER TABLE `users` 
  ADD COLUMN IF NOT EXISTS `is_roster_sub_admin` TINYINT(1) DEFAULT 0 AFTER `role`;
```

---

## 4. RESTful API Endpoints Specification

### 4.1 Crishi Database Endpoints

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/crishi/grid` | Returns the 10-column surveillance grid with computed `PASS`/`FAIL` statuses. | Teammate, Sub-Admin, Manager |
| `POST` | `/api/crishi/pull` | Initiates a Manager Pull on a Monthly/Yearly/Occasional task. | Manager Only |
| `POST` | `/api/crishi/skip` | Approves an Admin Skip for a Daily/Weekly task with a mandatory reason. | Manager Only |
| `POST` | `/api/crishi/remark` | Adds or updates a user remark for a specific task date. | Teammate, Manager |
| `PUT` | `/api/crishi/source` | Updates the master source name/URL for a table. | Teammate, Manager |
| `POST` | `/api/crishi/force-refresh` | Triggers immediate query against `agalabsdev_stage` bypassing cache. | All Roles |

### 4.2 Roster Endpoints

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/roster/current` | Fetches active 8-week roster schedule. | All Roles |
| `POST` | `/api/roster/generate` | Generates 2-month unique non-repeating roster with Rake Movement. | Sub-Admin, Manager |
| `POST` | `/api/roster/swap` | Swaps duties between two teammates for a given week. | Sub-Admin, Manager |
| `PUT` | `/api/roster/user-subadmin` | Grants or revokes Roster Sub-Admin permissions for a teammate. | Manager Only |

### 4.3 Report Endpoints

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reports/list` | Returns list of reports formatted by Name, Date, Subject, Time Sent. | All Roles |
| `GET` | `/api/reports/<id>/details` | Returns 3-in-1 inspection payload: Email Headers/Body, PDF URL, AI Insights. | All Roles |
| `GET` | `/api/reports/<id>/pdf` | Streams the PDF binary file for embedded canvas viewing. | All Roles |
| `POST` | `/api/reports/sync-gmail` | Triggers manual on-demand fetch from Gmail inbox. | Manager Only |
