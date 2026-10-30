# Advanced MIS Redesign Documentation Suite

Welcome to the comprehensive technical documentation for the **Advanced MIS Redesign**.

This suite documents the complete architectural transformation of the system from a manual self-reporting tool into an **Automated Data Surveillance, Intelligence, and Email-Driven MIS**.

---

## 📚 Complete Document Sitemap

| # | Document Title | Primary Focus & Contents | Link |
| :-: | :--- | :--- | :--- |
| **01** | **Project Goals & Strategic Vision** | • Paradigm Shift: Verification directly through database updates (`agalabsdev_stage`)<br>• Menu Consolidation: Reducing 4 modules down to **Crishi Database** & **Report**<br>• Hiding Kanban Board and Team Chat<br>• Strategic business value and stakeholder objectives. | [01_REDESIGN_GOALS_AND_VISION.md](file:///d:/D%20Disk%20Data%20Backup/Nishant_800mb/Nishant/Aniygravity/Advance%20ERP/docs/01_REDESIGN_GOALS_AND_VISION.md) |
| **02** | **Requirements Specification** | • Functional Requirements (FR-01 to FR-15)<br>• Non-Functional Requirements (Performance, Security, Audit)<br>• Role-Based Access Control: Manager, Sub-Admin (Roster), Teammate<br>• Frequency rules & data representation specs. | [02_REQUIREMENTS_SPECIFICATION.md](file:///d:/D%20Disk%20Data%20Backup/Nishant_800mb/Nishant/Aniygravity/Advance%20ERP/docs/02_REQUIREMENTS_SPECIFICATION.md) |
| **03** | **Crishi Database Module Specification** | • 10-Column Data Representation Grid design<br>• Pass (Green) vs Fail (Red) evaluation logic<br>• Daily/Weekly auto-monitoring with **Admin Skip**<br>• Monthly/Yearly **Manager Pull** with SLA Countdown & Late Alerts<br>• **2-Month Fair Roster Generator** with **Rake Movement** and **Sub-Admin** access. | [03_CRISHI_DATABASE_MODULE_SPEC.md](file:///d:/D%20Disk%20Data%20Backup/Nishant_800mb/Nishant/Aniygravity/Advance%20ERP/docs/03_CRISHI_DATABASE_MODULE_SPEC.md) |
| **04** | **Report Module & Gmail Integration** | • Answering *"How I will get the data from Gmail"* (IMAP vs API vs Webhook)<br>• Step-by-step Gmail App Password setup guide<br>• Background ingestion daemon architecture & code<br>• Master Report Table formatting (`Name, Date, Subject, Time Sent`)<br>• **3-in-1 Inspection Modal**: Email Preview + PDF Viewer + AI Analysis. | [04_REPORT_MODULE_AND_GMAIL_INTEGRATION.md](file:///d:/D%20Disk%20Data%20Backup/Nishant_800mb/Nishant/Aniygravity/Advance%20ERP/docs/04_REPORT_MODULE_AND_GMAIL_INTEGRATION.md) |
| **05** | **Master Task-to-Database Mapping Matrix** | • Merged mapping: `User > Commodity > Raw Table > Final Name > Frequency > Source`<br>• Analysis of 132 tables in `latest_two_dates_agalabsdev_stage`<br>• Portfolios: Pulses (Nishant), Maize & Poultry (Nitesh), Soybeans/SOPA, Sugar, Vegetables, Weather/GIS, Logistics (Rake Movement). | [05_TASK_TO_DATABASE_MAPPING_MATRIX.md](file:///d:/D%20Disk%20Data%20Backup/Nishant_800mb/Nishant/Aniygravity/Advance%20ERP/docs/05_TASK_TO_DATABASE_MAPPING_MATRIX.md) |
| **06** | **System Architecture & Technical Design** | • Dual-Database Strategy: `agalabsdev_stage` (surveillance) + `advance_erp` (metadata)<br>• Complete MySQL DDL for new tables (`db_task_catalog`, `manager_task_pulls`, `task_skips`, `task_remarks`, `roster_schedules`, `email_reports`)<br>• Background daemons (Surveillance, Gmail, SLA Alert)<br>• RESTful API endpoint catalog. | [06_SYSTEM_ARCHITECTURE_AND_TECHNICAL_DESIGN.md](file:///d:/D%20Disk%20Data%20Backup/Nishant_800mb/Nishant/Aniygravity/Advance%20ERP/docs/06_SYSTEM_ARCHITECTURE_AND_TECHNICAL_DESIGN.md) |
| **07** | **Implementation Roadmap & Migration Plan** | • 7-Phase execution schedule with Gantt visual<br>• Technical checklists from UI de-cluttering to production rollout<br>• Operational risk management and mitigation strategies. | [07_IMPLEMENTATION_ROADMAP_AND_MIGRATION_PLAN.md](file:///d:/D%20Disk%20Data%20Backup/Nishant_800mb/Nishant/Aniygravity/Advance%20ERP/docs/07_IMPLEMENTATION_ROADMAP_AND_MIGRATION_PLAN.md) |

---

## ⚡ Quick Architecture Summary

```
                      ADVANCED MIS REDESIGNED PORTAL
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         │                                                     │
         ▼                                                     ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│     1. CRISHI DATABASE          │   │          2. REPORT              │
├─────────────────────────────────┤   ├─────────────────────────────────┤
│ • Automated agalabsdev_stage    │   │ • Automated Ingestion from      │
│   table surveillance            │   │   Gmail inbox                   │
│ • Pass (Green) / Fail (Red)     │   │ • Formatted Table:              │
│ • Daily/Weekly: Admin Skip      │   │   Report Name | Date | Subject  │
│ • Monthly/Yearly: Manager Pull  │   │   | Time Sent                   │
│ • 2-Month Non-Repeating Roster  │   │ • 3-in-1 Interactive Modal:     │
│ • Sub-Admin Roster Role         │   │   [Email] + [PDF] + [AI Analysis│
│ • Rake Movement Rotation Duty   │   └─────────────────────────────────┘
└─────────────────────────────────┘
```
