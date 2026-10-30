# Advanced MIS (Research ERP Hub) — Operational Documentation & User Manual

> **System Version:** 2.5 (Enterprise Edition)  
> **Database Environment:** `agalabsdev_stage` (114 Monitored Tables across 16 Authoritative Commodities) & `advance_erp`  
> **Target Audience:** All Research Analysts, Data Engineers, Managers, and SuperAdmins  
> **Last Updated:** October 2026  

---

## Table of Contents
1. [Executive Overview: What is Advanced MIS?](#1-executive-overview-what-is-advanced-mis)
2. [Authoritative Commodity & Report Mapping](#2-authoritative-commodity--report-mapping)
3. [How Does the System Update? (Surveillance & Sync Engine)](#3-how-does-the-system-update-surveillance--sync-engine)
   - [Automated MySQL Surveillance Engine](#31-automated-mysql-surveillance-engine)
   - [Date Column Identification Hierarchy](#32-date-column-identification-hierarchy)
   - [Cadence, Cutoff Times & Status Rules](#33-cadence-cutoff-times--status-rules)
   - [Manual and On-Demand Synchronization](#34-manual-and-on-demand-synchronization)
   - [Audit Logging & WhatsApp-Style Edit History](#35-audit-logging--whatsapp-style-edit-history)
4. [How to Use the Platform (General Guide)](#4-how-to-use-the-platform-general-guide)
   - [Master Navigation & Key Metrics](#41-master-navigation--key-metrics)
   - [The Three Master Surveillance Views](#42-the-three-master-surveillance-views)
   - [Operational Remarks & WhatsApp-Style Version Control](#43-operational-remarks--whatsapp-style-version-control)
   - [Manager Quality Review & Action Workflow](#44-manager-quality-review--action-workflow)
   - [3-in-1 Report Split View Inspection](#45-3-in-1-report-split-view-inspection)
   - [Role-Based Access Scoping & Teammate Isolation](#46-role-based-access-scoping--teammate-isolation)
   - [Person-Basis Database Update History & Audit Trail](#47-person-basis-database-update-history--audit-trail)
   - [Interactive Column Header Sort Buttons](#48-interactive-column-header-sort-buttons)
5. [Individual User Operating Manuals](#5-individual-user-operating-manuals)
   - [5.1 Vaibhav (SuperAdmin — Executive Oversight & Platform Governance)](#51-vaibhav-superadmin--executive-oversight--platform-governance)
   - [5.2 Ram Gopal (Manager — Research Quality & Surveillance Approver)](#52-ram-gopal-manager--research-quality--surveillance-approver)
   - [5.3 Nishant (SuperAdmin & Lead Analyst — Pulses & Tops Portfolio, 36 Tables)](#53-nishant-superadmin--lead-analyst--pulses--tops-portfolio-36-tables)
   - [5.4 Bhawna (Research Analyst — Cotton, Rapeseed, Soybeans & Weather, 17 Tables)](#54-bhawna-research-analyst--cotton-rapeseed-soybeans--weather-17-tables)
   - [5.5 Pankaj (Research Analyst — Chilli, Coriander, Cumin, Turmeric & Weather, 13 Tables)](#55-pankaj-research-analyst--chilli-coriander-cumin-turmeric--weather-13-tables)
   - [5.6 Nitesh (Research Analyst — Bajra, Barley, Maize & Sugar, 21 Tables)](#56-nitesh-research-analyst--bajra-barley-maize--sugar-21-tables)
   - [5.7 Gopi (Research Analyst — Rice & Wheat, 27 Tables)](#57-gopi-research-analyst--rice--wheat-27-tables)
   - [5.8 Balram (Tech Teammate — Pipeline Integrations & System Automations)](#58-balram-tech-teammate--pipeline-integrations--system-automations)
6. [Frequently Asked Questions (FAQ) & Troubleshooting](#6-frequently-asked-questions-faq--troubleshooting)

---

## 1. Executive Overview: What is Advanced MIS?

**Advanced MIS** is the centralized Research ERP and Live Table Surveillance Hub for Agalabs. It transforms research operations from fragile, manually updated Excel spreadsheets into an automated, real-time surveillance platform directly connected to the active MySQL research database (`agalabsdev_stage`).

### Key Capabilities
* **114 Active Monitored Tables**: Real-time tracking strictly focused on the **16 Authoritative Agricultural Commodities** (Pulses, Tops, Soybeans, Rapeseed, Cotton, Chilli, Coriander, Cumin, Turmeric, Weather, Maize, Bajra, Barley, Sugar, Wheat, Rice).
* **27 Canonical Market Reports**: Automated ingestion and monitoring of the 27 designated daily and weekly intelligence reports matching `report mapping.xlsx`.
* **Direct Database Verification**: Verifies table freshness by querying actual database records (`MAX(date)` and row count) instead of relying on self-reported checkmarks.
* **Strict Role-Based Security**: SuperAdmins, Managers, and Analysts have specialized privileges. Teammates have exclusive ownership over their operational notes, while Managers maintain quality control via review actions.
* **WhatsApp-Style Edit Audit Trail**: When analysts edit their remarks, previous iterations, timestamps, and reasons are captured in an immutable audit log with a clickable `(edited)` indicator.
* **10-Column Desktop Grid**: A responsive, fixed-width layout displaying Assignee, Commodity, Raw Table Name, Final Business Title, Cadence, Last Date in DB, Today Status, Status, Remarks & Manager Review, and Actions.

---

## 2. Authoritative Commodity & Report Mapping

As specified in `report mapping.xlsx`, the platform strictly maintains **16 Authoritative Commodities** and **27 Market Reports** distributed across the team:

| Assigned Person | Commodity | Canonical Reports | Monitored DB Tables |
| :--- | :--- | :--- | :--- |
| **Nishant** | **Pulses** (Bengal Gram, Tur, Urad, Moong, Masoor, Pea)<br>**Tops** (Tomato, Potato, Onion) | `Pulses Daily`<br>`Pulses Weekly`<br>`Tops Daily` | 36 Active Tables (IPGA Spot/CNF, Sowing, Buffer Stocks, Tops Rates) |
| **Bhawna** | **Cotton**<br>**Rapeseed**<br>**Soybeans**<br>**Weather** (Alternate Week) | `Cotton Weekly`<br>`Rapeseed Daily`<br>`Rapeseed Weekly`<br>`Soybeans Daily`<br>`Soybeans Weekly`<br>`Weather Daily` (Alt) | 17 Active Tables (SOPA Spot/Arrivals/Balancesheets, Crush Margins, Tariffs) |
| **Pankaj** | **Chilli**<br>**Coriander**<br>**Cumin**<br>**Turmeric**<br>**Weather** (Alternate Week) | `Chilli Daily`<br>`Chilli Weekly`<br>`Coriander Daily`<br>`Coriander Weekly`<br>`Cumin Daily`<br>`Cumin Weekly`<br>`Turmeric Daily`<br>`Turmeric Weekly`<br>`Weather Daily` (Alt) | 13 Active Tables (Guntur Spot, Spices FOB Exports, NCDEX Futures/Stocks, IMD Weather) |
| **Nitesh** | **Bajra**<br>**Barley**<br>**Maize**<br>**Sugar** | `Bajra Weekly`<br>`Barley Weekly`<br>`Maize Daily`<br>`Maize Weekly`<br>`Sugar Daily`<br>`Sugar Weekly` | 21 Active Tables (Maize Mandi Wholesale, CME Futures, Sugar Indices, Ethanol Lifting) |
| **Gopi** | **Rice**<br>**Wheat** | `Rice Daily`<br>`Rice Weekly`<br>`Wheat Daily`<br>`Wheat Weekly` | 27 Active Tables (Wheat Mandi Wholesale, Central Procurement, e-NAM Auctions, Rice Retail) |

---

## 2. How Does the System Update? (Surveillance & Sync Engine)

```
┌─────────────────────────────────────────────────────────────┐
│             MySQL Database: agalabsdev_stage                │
│    (132 Monitored Tables: Spot, CNF, Sowing, Rake, Trade)    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Live SQL Inspection
                               ▼
┌─────────────────────────────────────────────────────────────┐
│          Surveillance Service (app/services/surveillance.py) │
│  - Detects date column by priority hierarchy                │
│  - Computes row counts & checks data inserted TODAY         │
│  - Evaluates daily cutoffs (e.g. 18:30) & 15th-20th windows │
└──────────────────────────────┬──────────────────────────────┘
                               │ State Evaluation
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Status Calculation                      │
│   PASS (Green) | LATE (Red) | REVISION (Yellow)             │
│   REJECTED (Red) | CYCLE DUE (Blue) | SKIPPED (Muted)       │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│      Web Client Grid        │ │    Audit Log in MySQL       │
│  (Realtime WebSocket Push)  │ │   (advance_erp.audit_log)   │
└─────────────────────────────┘ └─────────────────────────────┘
```

### 2.1 Automated MySQL Surveillance Engine
The surveillance engine runs as an automated background service (`app/services/surveillance.py`). Every cycle, it:
1. Queries `INFORMATION_SCHEMA.TABLES` to ensure all 132 target tables exist and checks current row counts.
2. Identifies the primary date column for each table using strict domain rules.
3. Queries `SELECT MAX(date_column), COUNT(*) FROM <table>` to discover the latest operational date.
4. Compares the latest record date against today's calendar date (`CURRENT_DATE()`) and target cutoff times.

### 2.2 Date Column Identification Hierarchy
Different commodity tables use distinct naming conventions for timestamps. The engine detects dates using the following prioritized rules:
1. **1st Priority — Transaction Date**: `Date`, `date`, `TradeDate`, `PriceDate` (standard for daily mandi spot, CNF port rates, international prices).
2. **2nd Priority — Agricultural Market Year**: `MarketYearDate`, `CropYearDate`, `YearMonth` (used for USDA balance sheets, SOPA annual estimates, production tables).
3. **Weekly Sowing Progress**: `WeekEndingDate` (specifically for `pystage_factrates_sowingprogress` and Ministry of Agriculture sowing updates).
4. **Freight Rake Movement**: `metwithdate` / `CreatedDate` (for `pyexcel_rakemovement` and railway siding freight logistics).
5. **Port Vessel Manifests & Lineups**: `PDF Date` / `EndDate` / `CreatedDate` (for `pyexcel_port_lineup`, `ipga_chennai_manifest`, and custom port documents).

### 2.3 Cadence, Cutoff Times & Status Rules

| Cadence | Target Cutoff Time | Target Rule |
| :--- | :--- | :--- |
| **Daily** | 18:00 – 18:30 IST | Must contain records with date equal to today. If current time > 18:30 and no update exists, marked **LATE**. |
| **Weekly** | Mondays / Fridays 18:00 IST | Weekly tables (e.g. Sowing on Friday, Port Stock on Monday) must update on scheduled days. |
| **Monthly (Cycle Window)** | 15th to 20th of the Month | Monthly trade flow and government balance sheet tables enter an active window (**15TH–20TH OCT**). Due by the 20th. |
| **Yearly / Ad-Hoc** | On-Demand (Manager Pull) | Annual balance sheets, MSP announcements, and census estimates await the Manager's Pull signal. |

#### Status Definitions
* <span style="color: #10b981; font-weight: bold;">PASS</span>: Data is verified in MySQL for today's date on or before the cutoff time.
* <span style="color: #ef4444; font-weight: bold;">LATE</span>: Daily cutoff has elapsed (e.g. past 18:30 IST) and no fresh records exist for today.
* <span style="color: #f59e0b; font-weight: bold;">REVISION</span>: The Manager reviewed the data and requested an analyst correction.
* <span style="color: #ef4444; font-weight: bold;">REJECTED</span>: Data has discrepancies or failed sanity checks during Manager Review.
* <span style="color: #0ea5e9; font-weight: bold;">CYCLE DUE</span>: Monthly trade flow window is active (15th–20th cycle); submission pending.
* <span style="color: #94a3b8; font-weight: bold;">SKIPPED</span>: SuperAdmin approved a formal operational skip (e.g., market holiday).

### 2.4 Manual and On-Demand Synchronization
* **Live DB Surveillance Button**: Triggers an immediate, full-sweep background scan of all 132 tables in `agalabsdev_stage`.
* **Quick Verify DB Button (`Verify`)**: Located on each table row in the Actions column. Instantly re-verifies that individual table against MySQL and refreshes its row status.
* **Update MIS from DB Button**: Pushes verified database dates and row totals into the central MIS reporting schema.
* **Manager Pull Signal (`Pull`)**: For monthly/ad-hoc tables, unlocks the analyst's data entry window for that monthly cycle.
* **Admin Skip (`Skip`)**: Prompts SuperAdmin for a skip reason (e.g., APMC Diwali holiday) and marks the task as approved-skip.

### 2.5 Audit Logging & WhatsApp-Style Edit History
Every operation is recorded in the `audit_log` table:
* When an analyst adds or edits a remark.
* When a manager approves, flags, or rejects data.
* When an admin updates configurations or skips a task.

---

## 3. How to Use the Platform (General Guide)

### 3.1 Master Navigation & Key Metrics
The top KPI banner provides instantaneous visibility into daily progress:
* **Monitored Coverage (132)**: Active monitored research tables in `agalabsdev_stage`.
* **Updated Till Now**: Percentage of daily portfolio verified in the database today.
* **Pending / Overdue**: Count of tables that have missed their target cutoff.
* **Cycle Windows (15–20th)**: Active monthly trade flow tasks currently due.
* **Need Correction**: Tasks marked for revision by managers.
* **Teammate Remarks**: Live counter of operational delay notes logged today.

### 3.2 The Three Master Surveillance Views

```
  ┌──────────────────────┬──────────────────────────┬──────────────────┐
  │  Table Basis Update  │  Commodity Basis Update  │  Date-Wise View  │
  └──────────────────────┴──────────────────────────┴──────────────────┘
```

1. **Table Basis Update (Default)**:
   A high-density 10-column master grid displaying Assignee, Commodity, Raw Table Name, Final Business Title, Cadence, Last Date in DB, Today Status, Status, Remarks & Manager Review, and Actions.
2. **Commodity Basis Update**:
   Rollup cards grouped by commodity cluster (Pulses, TOP, Soybeans, Spices, Feed Grains, Logistics, Agronomics). Displays completion percentage per cluster.
3. **Date-Wise View**:
   Historical timeline view organizing table verification events by calendar date.

### 3.3 Operational Remarks & WhatsApp-Style Version Control
When an update is delayed (e.g., mandis closed, broker delay), analysts must log an operational remark:
1. Click **`+ Remark`** in the *Remarks & Manager Review* column.
2. Enter your note using bracketed category tags for clean formatting:
   * Example: `[Mandi Delay] Heavy rains in Guntur; arrivals delayed by 3 hours.`
   * Example: `[Broker Survey] Evening rates confirmed with 4 NCDEX benchmark brokers.`
3. **Edit Security Rule**: Only the assigned analyst can edit their remark. Admins see a read-only lock dialog.
4. **WhatsApp-Style Edit Indicator**: When edited, an **`(edited)`** badge appears. Clicking it opens a modal displaying:
   * Previous text version.
   * Edit timestamp and editor identity.
   * Reason for edit.

### 3.4 Manager Quality Review & Action Workflow
Managers (or SuperAdmins) perform quality checks on any row by clicking **`Action`**:
1. Review the table's latest row count, date, and user remarks.
2. Select a decision:
   * **Pass**: Data confirmed valid.
   * **Needs Correction**: Sends item to analyst for revision.
   * **Not Correct**: Rejects entry due to data discrepancy.
   * **Pending**: Postpones decision awaiting external verification.
3. Enter manager feedback/instructions.
4. Click **Submit Review**. The table row immediately reflects the decision with a colored status pill.

### 3.5 3-in-1 Report Split View Inspection (`#report`)
Accessible from the left sidebar, the Report module provides a synchronized split-screen:
* **Left Panel**: AI-extracted commodity data points and tables.
* **Center Panel**: High-definition embedded PDF document viewer.
* **Right Panel**: Direct live comparison against `agalabsdev_stage` records.

### 3.6 Role-Based Access Scoping & Teammate Isolation
To safeguard operational integrity and provide streamlined personal focus, Advanced MIS enforces strict server-side role boundaries:

* **Administrators (`SuperAdmin`, `Manager`, `Leader`)**:
  - **Full Surveillance Visibility**: Admins view all 158 catalog tables, all 16 commodities, and all 27 canonical market reports.
  - **All Teammate Portfolios**: The header displays portfolio chips for all active analysts (`Nishant`, `Bhawna`, `Pankaj`, `Nitesh`, `Gopi`, etc.), allowing leaders to audit any analyst's progress with a single click.
  - **Administrative Controls**: Exclusively authorized to execute **Manager Pull** (`/api/crishi/pull`), **Task Skip** (`/api/crishi/skip`), **Manager Review** (`/api/crishi/manager-review`), and weekly duty roster generation.
* **Teammates (`Teammate` Role, e.g. Bhawna, Nitesh, Pankaj, Gopi)**:
  - **Portfolio Workspace Isolation**: Teammates are scoped strictly to their own assigned commodities and canonical reports.
  - **Private Teammate Chip**: Teammates only see their own personal portfolio chip in the top header. Other analysts' portfolio chips are hidden.
  - **Restricted Mutating Actions**: Direct administrative mutation endpoints enforce `@admin_required` and return `HTTP 403 Forbidden` if called by teammates.

### 3.7 Person-Basis Database Update History & Audit Trail
Accessible via the dedicated **Update History** tab in Crishi Surveillance (`#tab-history`), this feature maintains an authoritative, immutable log of who updated what table, on which date, and with what verification status:

* **Authoritative Data Capture (`TableUpdateHistory`)**:
  Every table synchronization via **Update MIS from DB** (`POST /api/crishi/sync-report-db`) or surveillance verification records:
  1. `ID`: Unique incrementing audit ID.
  2. `Report Date`: The operational reporting date (YYYY-MM-DD).
  3. `Commodity`: Commodity cluster (e.g. Maize, Pulses, Soybeans, Sugar, Bajra).
  4. `Table Name`: Physical MySQL raw table name (e.g. `pyexcel_trade_flow`, `pystage_factrates_spot`).
  5. `Final Name`: Canonical business title.
  6. `Updated By`: Person-basis identity of the verifying analyst.
  7. `DB Update Timestamp`: Exact DateTime timestamp extracted from MySQL or verified snapshot.
  8. `Row Count`: Total matching rows in the database.
  9. `Status`: Verification verdict (`Verified`, `Pending`).
  10. `Remarks`: Operational synchronization note or user remarks.

* **Append-Only Immutability**:
  Direct client mutations (`PUT`, `POST`, `PATCH`, `DELETE`) on `/api/crishi/update-history` are prohibited and return `HTTP 405 Method Not Allowed`. Subsequent synchronizations create new distinct records preserving historical audit trails.

* **Role-Scoped History Access**:
  - **Admins**: Can view all update history entries and filter by teammate, commodity, status, search keyword, or date range.
  - **Teammates**: Queries are strictly forced to the authenticated user's own records (`person_name = currentUser.name`).

### 3.8 Interactive Column Header Sort Buttons
The Update History table features bidirectional, click-to-sort column buttons integrated directly into the table headings:

* **10 Interactive Header Buttons**:
  Clicking any column header (`ID`, `Report Date`, `Commodity`, `Table Name`, `Final Name`, `Updated By`, `DB Update Timestamp`, `Row Count`, `Status`, `Remarks`) instantly sorts the records.
* **Ascending & Descending Toggles**:
  - Clicking once sorts the column in default order (newest-first for IDs, Dates, and Timestamps; alphabetical for text; numeric for Row Count).
  - Clicking a second time flips the sort direction between **Ascending (`▲`)** and **Descending (`▼`)**.
* **Visual Status Feedback**:
  The currently active sort column highlights with a bright cyan border and glowing badge (`#38bdf8`) displaying the active sort direction icon.

---

## 4. Individual User Operating Manuals

---

### 4.1 Vaibhav (SuperAdmin — Executive Oversight & Platform Governance)
* **Email:** `vaibhav@agalabs.com`
* **Role:** SuperAdmin
* **Core Responsibilities:** Overall system uptime, user access management, platform settings, SLA governance.

#### Daily Checklist
1. **09:30 IST — Morning SLA Inspection**:
   * Open `#crishi`. Check the **Updated Till Now** and **Pending / Overdue** counters.
   * Review any **Need Correction** items flagged from the previous evening.
2. **18:30 IST — Evening Cutoff Audit**:
   * Filter table by `Late` status pill.
   * Verify whether late tables have analyst remarks explaining the delay.
   * For market holidays or official exchange closures, use the **`Skip`** button to formally log an approved skip with the holiday reason.
3. **Weekly User & Permission Governance (`#admin`)**:
   * Review active accounts. Deactivate departing contractors or update email assignments.
   * Review the **Audit Log** for unusual bulk updates or manager overrides.

---

### 4.2 Ram Gopal (Manager — Research Quality & Surveillance Approver)
* **Email:** `ram@agalabs.com`
* **Role:** Manager
* **Core Responsibilities:** Data quality assurance, manager reviews, revision dispatching, 15th–20th cycle sign-off.

#### Daily Checklist
1. **18:00 IST — Live Intake Monitoring**:
   * Click through the teammate chips (**Nishant**, **Bhawna**, **Pankaj**, **Nitesh**, **Gopi**) to view each analyst's completion score.
2. **18:45 IST — Review & Action Dispatch**:
   * For rows requiring inspection, click the orange **`Action`** button.
   * If spot rates or volumes look suspicious, mark as **Needs Correction** and write clear instructions in the message box.
   * If data is completely inaccurate, mark as **Not Correct**.
3. **15th–20th of Every Month — Trade Flow Cycle Governance**:
   * Filter by `15th-20th Cycle`.
   * Review monthly export/import data for Pulses, Soybeans, Cereals, and Maize.
   * Once validated, issue the final **Pass** approval.

---

### 5.3 Nishant (SuperAdmin & Lead Analyst — Pulses & Tops Portfolio, 36 Tables)
* **Email:** `nishant@agalabs.com`
* **Role:** SuperAdmin & Lead Research Analyst
* **Assigned Commodities:** **Pulses** (Bengal Gram, Tur, Urad, Moong, Masoor, Pea) & **Tops** (Tomato, Potato, Onion).
* **Canonical Reports:**
  1. `Pulses Daily` (Daily)
  2. `Pulses Weekly` (Weekly)
  3. `Tops Daily` (Daily)
* **Assigned Portfolio:** **36 Monitored Tables** (34 Pulses tables + 2 Tops tables).

#### Monitored Tables Inventory
| Raw Table Name | Final Business Display Title | Cadence | Cutoff Time | Date Column |
| :--- | :--- | :--- | :--- | :--- |
| `pyexcel_imported_market_prices` | Imported Market Prices — Chana / Tur / Urad | Daily | 18:30 IST | `Date` |
| `ipga_spot` | Pulses Mandi Spot Prices | Daily | 18:30 IST | `Date` |
| `ipga_cnf` | Pulses CNF Port Prices | Daily | 18:30 IST | `Date` |
| `pyexcel_pulses_cnf_prices` | Detailed Pulses CNF Parity Structure | Daily | 18:30 IST | `Date` |
| `ipga_international_prices` | International Pulse Prices & Burma | Daily | 18:30 IST | `Date` |
| `pyexcel_pulses_international_prices`| Pulses International Trade Rates | Daily | 18:30 IST | `Date` |
| `pyexcel_pulses_port_prices` | Major Ports Pulses Delivery Prices | Daily | 18:30 IST | `Date` |
| `pyexcel_tops_prices` | Tops Daily Mandi Spot Rates (Potato, Onion, Tomato)| Daily | 18:30 IST | `Date` |
| `pyexcel_dashboard_news` | Pulses Domestic & Global News | Daily | 18:30 IST | `Date` |
| `ipga_portstock` | Major Ports Pulses Stock Audit | Weekly (Mon) | 17:00 IST | `Date` |
| `ipga_arrivals_marketwise` | Marketwise Pulses Arrivals | Weekly (Tue) | 18:00 IST | `Date` |
| `pystage_factrates_sowingprogress` | Weekly All-India Sowing Progress | Weekly (Fri) | 18:00 IST | `WeekEndingDate`|
| `ipga_chennai_manifest` | Chennai Port Vessel Manifest | Weekly (Thu) | 18:00 IST | `EndDate` |
| `pyexcel_trade_flow` | Pulses Monthly Trade Flow | Monthly | 15th–20th | `Date` |

#### Step-by-Step Daily Workflow
1. **By 18:00 IST**: Ensure all scrapers and survey uploads have populated the daily spot and CNF tables.
2. **At 18:15 IST**:
   * Open `#crishi` and click the **Nishant** portfolio filter.
   * Verify that daily tables show the green **`Updated`** badge and **`PASS`** status.
   * If a table did not update automatically, click its **`Verify`** button to re-check MySQL.
3. **If Rates are Delayed**:
   * Click **`+ Remark`**.
   * Add a tagged operational note:
     `[General Operational Note] Verified with NCDEX and local Mandi brokers. Rates updated with latest evening closing figures.`
4. **Friday Sowing Progress (18:00 IST)**:
   * Validate that `pystage_factrates_sowingprogress` contains the current week's `WeekEndingDate`.
5. **Monthly Trade Flow (15th–20th)**:
   * Verify official customs import/export statistics before the 20th deadline.

---

### 5.4 Bhawna (Research Analyst — Cotton, Rapeseed, Soybeans & Weather, 17 Tables)
* **Email:** `bhawna@agalabs.com`
* **Role:** Teammate / Research Analyst
* **Assigned Commodities:** **Cotton**, **Rapeseed**, **Soybeans**, and **Weather** (Alternate Week with Pankaj).
* **Canonical Reports:**
  1. `Cotton Weekly` (Weekly)
  2. `Rapeseed Daily` (Daily)
  3. `Rapeseed Weekly` (Weekly)
  4. `Soybeans Daily` (Daily)
  5. `Soybeans Weekly` (Weekly)
  6. `Weather Daily` (Daily — Alternate Week)
* **Assigned Portfolio:** **17 Monitored Tables** (13 Soybeans + 3 Rapeseed + 1 Cotton).

#### Monitored Tables Inventory
| Raw Table Name | Final Business Display Title | Cadence | Cutoff Time | Date Column |
| :--- | :--- | :--- | :--- | :--- |
| `sopa_spot_price` | SOPA Soybean Spot Mandi Rates | Daily | 18:00 IST | `Date` |
| `pyexcel_soybean_basis` | Soybean FOB & Basis Rates | Daily | 18:30 IST | `date` |
| `pyexcel_soybean_plant_quote` | Crushing Plant Delivery Quotes | Daily | 18:00 IST | `Date` |
| `pystage_oilseed_crush_margin`| Oilseed Crushing Margin Calculation (Rapeseed & Soy)| Daily | 19:00 IST | `date` |
| `sopa_arrivalsbystate` | State-wise Soybean Arrivals | Weekly (Mon) | 18:00 IST | `Date` |
| `pyexcel_price_influencing_factors` | Macro Price Influencing Matrix (Cotton) | Weekly (Fri) | 18:00 IST | `Date` |
| `pyexcel_edible_oil_tariff_structure`| Government Tariff Value Structure (Rapeseed) | Fortnightly | 18:00 IST | `createdDate` |
| `sopa_balancesheet` | SOPA Soybean India Balancesheet | Monthly | 15th–20th | `MarketYearDate`|
| `sopa_balancesheet_world` | Global Soybean Supply/Demand | Monthly | 15th–20th | `MarketYearDate`|
| `pyexcel_soybean_meal_export` | Soybean De-Oiled Cake Exports | Monthly | 15th–20th | `Date` |

#### Step-by-Step Daily Workflow
1. **By 18:00 IST**: Extract Indore SOPA spot rates and plant quotes; execute the ingestion script into `sopa_spot_price`.
2. **At 18:45 IST**: Verify that the crushing margin calculation table (`pystage_oilseed_crush_margin`) has run with today's closing figures.
3. **If SOPA Bulletin is Delayed**:
   * Click **`+ Remark`** on `sopa_spot_price`.
   * Log: `[SOPA Delay] SOPA Indore evening circular awaited; expected by 19:15 IST.`
4. **Fortnightly Tariff Revisions**:
   * When CBIC issues new tariff values (around the 15th and 30th/31st of each month), update `pyexcel_edible_oil_tariff_structure` and click **`Verify`**.

---

### 5.5 Pankaj (Research Analyst — Chilli, Coriander, Cumin, Turmeric & Weather, 13 Tables)
* **Email:** `pankaj@agalabs.com`
* **Role:** Teammate / Research Analyst
* **Assigned Commodities:** **Chilli**, **Coriander**, **Cumin**, **Turmeric**, and **Weather** (Alternate Week with Bhawna).
* **Canonical Reports:**
  1. `Chilli Daily` (Daily)
  2. `Chilli Weekly` (Weekly)
  3. `Coriander Daily` (Daily)
  4. `Coriander Weekly` (Weekly)
  5. `Cumin Daily` (Daily)
  6. `Cumin Weekly` (Weekly)
  7. `Turmeric Daily` (Daily)
  8. `Turmeric Weekly` (Weekly)
  9. `Weather Daily` (Daily — Alternate Week)
* **Assigned Portfolio:** **13 Monitored Tables** (2 Chilli + 2 Coriander + 1 Cumin + 2 Turmeric + 6 Weather).

#### Monitored Tables Inventory
| Raw Table Name | Final Business Display Title | Cadence | Cutoff Time | Date Column |
| :--- | :--- | :--- | :--- | :--- |
| `pyexcel_rksinghal` | Chilli Guntur & Regional Spot Prices | Daily | 18:00 IST | `Date` |
| `pyexcel_statewise_arrival_price` | Statewise Spices & Chilli Arrivals | Weekly (Wed) | 18:00 IST | `Date` |
| `pyexcel_spices_fob_prices` | Coriander & Cumin FOB Export Prices | Daily | 18:30 IST | `Date` |
| `pyexcel_fob_prices_manual` | Coriander FOB Manual Quotes Desk | Daily | 18:30 IST | `Date` |
| `pystage_factrates_ncdex_stock` | NCDEX Cumin & Spices Warehouse Stock | Weekly (Wed) | 18:00 IST | `Date` |
| `pystage_factrates_ncdex_futures` | NCDEX Turmeric & Spices Futures Closing | Daily | 18:30 IST | `Date` |
| `pystage_factrates_ncdex_edd` | NCDEX Early Delivery & Settlement Positions | Weekly (Wed) | 18:00 IST | `Date` |
| `pyexcel_daily_weather_data` | IMD Daily Weather & Rainfall Tracker | Daily | 19:00 IST | `Date` |
| `pyexcel_normal_weather_data` | IMD Climatological Normal Benchmarks | Daily | 19:00 IST | `Date` |
| `pyexcel_gis_ndvi` | Satellite NDVI Crop Health & Vegetation Index | Weekly (Mon) | 18:00 IST | `Date` |
| `pystage_factrates_rainfall_region` | Regional Monsoon Departure Matrix | Weekly (Mon) | 18:00 IST | `Date` |

#### Step-by-Step Daily Workflow
1. **By 18:00 IST**: Enter Guntur and Warangal chilli rates into `pyexcel_rksinghal`.
2. **Weather Rotation Duty**:
   * Weather surveillance alternates between Pankaj and Bhawna weekly.
   * Click **Weekly Roster & Rake Movement** in the top action bar to inspect your active rotation week.
   * During your assigned week, ensure IMD rainfall departures are ingested by 19:00 IST daily.
3. **Discrepancy Reporting**:
   * If auction volumes at Guntur are suspended due to strikes or holidays, immediately log a remark:
     `[APMC Closure] Guntur Mandi closed today on account of local holiday; no auctions conducted.`

---

### 5.6 Nitesh (Research Analyst — Bajra, Barley, Maize & Sugar, 21 Tables)
* **Email:** `nitesh@agalabs.com`
* **Role:** Teammate / Research Analyst
* **Assigned Commodities:** **Bajra**, **Barley**, **Maize**, and **Sugar**.
* **Canonical Reports:**
  1. `Bajra Weekly` (Weekly)
  2. `Barley Weekly` (Weekly)
  3. `Maize Daily` (Daily)
  4. `Maize Weekly` (Weekly)
  5. `Sugar Daily` (Daily)
  6. `Sugar Weekly` (Weekly)
* **Assigned Portfolio:** **21 Monitored Tables** (1 Bajra + 1 Barley + 9 Maize + 10 Sugar).

#### Key Tables Highlights
| Raw Table Name | Final Business Display Title | Cadence | Cutoff Time | Date Column |
| :--- | :--- | :--- | :--- | :--- |
| `pystage_factrates_ncdex_spot` | NCDEX Mandi Spot Indices (Bajra & Feed Grains) | Daily | 18:00 IST | `Date` |
| `pystage_factrates_usda_balancesheet_world` | USDA World Grain Balancesheet (Barley) | Monthly | 15th–20th | `Date` |
| `pystage_factrates_wholesaleprice` | Maize Mandi Wholesale Prices | Daily | 18:30 IST | `Date` |
| `pystage_factrates_cme_futures` | CME Corn / Grain Futures | Daily | 19:30 IST | `Date` |
| `pyexcel_ddgs_price` | DDGS Distillery Feed Prices (Maize) | Daily | 18:30 IST | `Date` |
| `pyexcel_port_lineup` | Indian Ports Grain Vessel Lineup | Weekly (Wed) | 18:00 IST | `PdfDate` |
| `pystage_factrates_iso_sugar` | ISO Sugar & White Sugar Index | Daily | 18:30 IST | `Date` |
| `pyexcel_crude_oil_prices` | Brent & WTI Crude Oil Prices | Daily | 19:00 IST | `Date` |
| `pyexcel_ethanol_supplied` | Daily Ethanol Lifting & Delivery Volume | Daily | 18:30 IST | `Date` |
| `pyexcel_ethanol_recap` | OMC Ethanol Allotment & Supply Recap | Weekly (Mon) | 18:00 IST | `Date` |
| `pyexcel_government_monthly_sugar_sale_quota` | Government Monthly Sugar Sale Quota | Monthly | 15th–20th | `Date` |

#### Step-by-Step Daily Workflow
1. **18:00 IST — Bajra & Maize Daily Check**:
   * Verify `pystage_factrates_ncdex_spot` and `pystage_factrates_wholesaleprice` updated with today's mandi arrivals and wholesale prices.
2. **18:30 IST — Sugar & Ethanol Delivery Updates**:
   * Verify `pyexcel_ethanol_supplied` and `pystage_factrates_iso_sugar` have been refreshed.
3. **19:30 IST — CME Night Settlement**:
   * Confirm that US grain futures settle into `pystage_factrates_cme_futures`.
4. **Monthly Sugar Quota & Allocation**:
   * During the 15th–20th window, update monthly sugar mill quotas and tender summaries.

---

### 5.7 Gopi (Research Analyst — Rice & Wheat, 27 Tables)
* **Email:** `gopichand@agalabs.com`
* **Role:** Teammate / Research Analyst
* **Assigned Commodities:** **Rice** and **Wheat**.
* **Canonical Reports:**
  1. `Rice Daily` (Daily)
  2. `Rice Weekly` (Weekly)
  3. `Wheat Daily` (Daily)
  4. `Wheat Weekly` (Weekly)
* **Assigned Portfolio:** **27 Monitored Tables** (4 Rice + 23 Wheat).

#### Key Tables Highlights
| Raw Table Name | Final Business Display Title | Cadence | Cutoff Time | Date Column |
| :--- | :--- | :--- | :--- | :--- |
| `pystage_factrates_retailprice` | Wheat & Rice Retail Mandi Price | Daily | 18:30 IST | `Date` |
| `pystage_factrates_arrivalsbystate` | Statewise Grain Arrivals (Wheat & Rice) | Weekly (Wed) | 18:00 IST | `Date` |
| `pyexcel_de_oiled_bran_cake_prices` | De-Oiled Rice Bran (DORB) Feed Rates | Daily | 18:00 IST | `Date` |
| `pystage_factrates_spot` | Wheat Mandi Wholesale Rates | Daily | 18:30 IST | `Date` |
| `pyexcel_govt_procurement_daily` | Central Pool Foodgrain Daily Procurement | Daily | 18:30 IST | `Date` |
| `pyexcel_auction` | e-NAM Mandi Foodgrain Electronic Auctions | Weekly (Thu) | 18:00 IST | `Date` |
| `pyexcel_omss_monthly` | OMSS Domestic Wheat Sale Scheme | Monthly | 15th–20th | `Date` |
| `pyexcel_eastern_australian_wheat` | Eastern Australia Wheat FOB Export Quotes | Weekly (Wed) | 18:00 IST | `Date` |
| `pystage_factrates_sowingprogress_final` | All-India Final Sowing Area Aggregates | Weekly (Fri) | 18:00 IST | `WeekEndingDate`|
| `pystage_factrates_advance_estimates` | Advance Estimates of Foodgrain Production | Monthly | 15th–20th | `Date` |

#### Step-by-Step Daily Workflow
1. **Daily (18:30 IST)**: Verify daily wheat wholesale prices across state mandis.
2. **Thursday OMSS Tenders & e-NAM Auctions**: Check weekly FCI tender bidding outcomes and update `pyexcel_auction`.
3. **Monthly Foodgrain Procurement & Stock Position (Due by 20th)**:
   * Download Department of Food & Public Distribution stock bulletins.
   * Populate `pystage_factrates_govt_stockPosition` and verify via the **`Verify`** button.

---

### 4.8 Balram (Tech Teammate — Pipeline Integrations & System Automations)
* **Email:** `balram@agalabs.com`
* **Role:** Tech Teammate / Engineer
* **Core Responsibilities:** Scraper health, MySQL schema synchronization, API endpoints, WebSocket server.

#### Technical Maintenance Tasks
1. **Server Process Monitoring**:
   * Flask service runs on `http://localhost:5000` (`run.py`) under eventlet WSGI.
   * Live socket events push table status updates without page reloads.
2. **Database Connectivity**:
   * Primary ERP database: `168.144.28.192:3306/advance_erp`.
   * Monitored staging database: `127.0.0.1:3306/agalabsdev_stage`.
3. **Schema Mappings**:
   * If an engineering scraper introduces a new table or changes a date column name, update the mapping in `app/services/surveillance.py` and `app/static/js/crishi.js`.

---

## 5. Frequently Asked Questions (FAQ) & Troubleshooting

### Q1: My table was updated in MySQL, but MIS still displays "LATE" (Red). What should I do?
* **Solution**: Click the green **`Verify`** button on that specific table's row. This forces an immediate live SQL query to `agalabsdev_stage`. If today's records are found, the row immediately changes to **`PASS`** (Green).

### Q2: Why does an Admin get an "Administrator Notice" when trying to edit my remark?
* **Solution**: This is a strict operational security feature. **Only the assigned teammate can edit their remark.** Admins can only view the remark and its audit log. If a manager needs changes, they will use the **`Action`** button to request a revision.

### Q3: What is the meaning of the `(edited)` badge on a remark?
* **Solution**: Similar to WhatsApp, whenever an analyst modifies an existing remark, the system flags it with a green `(edited)` pill. Clicking `(edited)` opens a modal displaying previous text versions, timestamps, and edit reasons.

### Q4: Mandis were closed today due to a state holiday. How do we prevent a "LATE" penalty?
* **Solution**: 
  1. The analyst must post an operational remark: e.g. `[APMC Holiday] Mandis closed for regional holiday.`
  2. The SuperAdmin or Manager clicks the **`Skip`** icon on that row and enters the holiday justification. The status changes to **`SKIPPED`** without hurting team SLA metrics.

### Q5: How does the 15th–20th Monthly Trade Flow Cycle work?
* **Solution**: On the 15th of each month, all monthly trade flow and government estimate tables automatically enter the **`15TH–20TH`** window. Analysts have until 23:59 IST on the 20th to finalize records before tables are marked Overdue.

---

*© 2026 Agalabs Research Hub. All rights reserved. Confidential and proprietary.*
