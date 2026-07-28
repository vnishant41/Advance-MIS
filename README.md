# Advanced MIS / Advanced ERP System Documentation

## Overview
**Advanced MIS** is a robust, full-stack Python web application built using Flask, SQLAlchemy (MySQL), and real-time Socket.IO communication. It serves as an Enterprise Resource Planning and Management Information System tailored specifically for a research team. 

Originally developed to replace a legacy, fragmented Google Apps Script-based tracker, this system centralizes daily workflows, automates report validation, and enhances team collaboration through structured task management and strict role-based access control.

---

## The Problem
Before the implementation of this system, the research team faced several operational bottlenecks:
1. **Fragmented Workflows:** The team relied on manual Excel sheets or scattered Google Apps Scripts to track daily tasks, data updates, and MIS reports. This led to scattered data, double entries, and inefficient context switching.
2. **Manual Report Validation:** Checking daily MIS reports (PDFs) for accuracy, required sections, tables, and charts was entirely manual, tedious, and highly prone to human error.
3. **Lack of Centralized Collaboration:** Managing recurring tasks, long-term sprints, and daily team communications required multiple external tools, making it hard to maintain a single source of truth.
4. **Accountability & Absence Management:** There was no streamlined way to track audit logs (who did what and when), and managing task handovers when a team member went on leave was chaotic and informal.

---

## How It Solves These Problems
1. **Unified Dashboard:** Consolidates all daily workflows—Data Updates, MIS Report submissions, and recurring Tasks—into a single, centralized dashboard. Users have a single entry point for everything they need to accomplish.
2. **Automated Validation Engine:** Introduces an "Advanced Text Verification" engine (formerly AI PDF Analysis). It automatically validates uploaded reports against predefined "Saved Format" master templates using bounding boxes, instantly flagging missing sections, tables, or charts with Green/Red status feedback.
3. **Jira-Style Kanban:** Replaces manual task sheets with a visual Kanban board, allowing managers to track ad-hoc projects, assign story points, run sprints, and handle multi-assignee workflows.
4. **Formal Backup System & Roles:** Implements strict hierarchical access (Manager, Leader, Teammate) along with a "Backup Activation" feature. If a primary assignee is away, a manager can activate a backup, temporarily routing visibility and responsibilities to another team member to ensure zero downtime.

---

## Core Functions

### 1. Unified Task & Workflow Management
- **Task Templates & Cadences:** Supports creating tasks that recur on strict frequencies (Daily, Weekly, Monthly, Quarterly, Yearly).
- **Task Overrides:** Managers can override due dates for specific periods (e.g., if a monthly report source publishes late) without altering the master template.
- **Unified Entry:** Data Updates, Report Submissions, and general Tasks are all logged into a singular `MasterLog` to track timeliness, completion status, and time-to-submit.

### 2. MIS Report Advanced Text Verification
- **Template Builder:** Managers can define master templates with exact layout bounding boxes for different report types (e.g., "Pulses Daily").
- **Automated Parsing:** When a user uploads a PDF report, the system parses it (via `pdfplumber`), counts tables/charts, and verifies that required textual sections exist in the correct locations.
- **Semantic Feedback Loop:** Maintains a historical database of text verifications and user feedback to continuously improve layout validation accuracy over time.

### 3. Agile Kanban System
- **Sprint Management:** Supports organizing tasks into Sprints with defined start/end dates and sprint goals.
- **Task Tracking:** Visual drag-and-drop board with statuses (Assigned, In Progress, Under Review, Done, Blocked).
- **Rich Task Metadata:** Includes dependencies, blocked reasons, tags, story points, and threaded JSON comments for in-depth project tracking.

### 4. Role-Based Access Control (RBAC) & User Management
- **Hierarchical Access:** Manager, Leader, and Teammate roles dictate what parts of the application (e.g., User Management, Analytics) a user can see.
- **Commodity-Based Access:** Data visibility is filtered based on the specific "Commodities" a user is assigned to research.

---

## Other Functions

- **Real-Time Team Chat:** A Socket.IO powered chat system featuring general channels, research channels, and dedicated task-specific threads to keep conversations contextualized. Supports file attachments.
- **Audit & Activity Logging:** An extensive `AuditLog` records every significant action (creation, deletion, status change) along with "before" and "after" JSON snapshots for complete traceability and compliance.
- **Roster Management:** Automated scheduling configurations (`RosterConfig`) for rotating team roles on specific frequencies.
- **In-App Notifications:** A robust notification system (`Notification` model) that alerts users to new task assignments, backup activations, and overdue items.
- **Report Grouping:** Allows managers to group multiple reports under a parent category (e.g., "Pulses") for streamlined viewing and validation workflows.

---

## Code Flow & Architecture (Detailed)

The Advanced MIS application is architected around a robust Model-View-Controller (MVC) paradigm tailored for Flask. It strictly separates concerns between data persistence, business logic, route handling, and the presentation layer. Below is the detailed lifecycle of the system and the role of each component.

### 1. Application Entry & Initialization (`run.py` & `app/__init__.py`)
- **`run.py` (The Entry Point):** This is the executable script that bootstraps the application. It imports the `create_app` factory function and the `socketio` instance. It binds the server to port 5000 and starts the Eventlet-backed Socket.IO server, which is required for asynchronous real-time communication.
- **`app/__init__.py` (The Factory):** Implements the Flask Application Factory pattern. When `create_app()` is called:
  - It loads configuration settings (database URIs, secret keys, JWT settings).
  - It initializes Flask extensions: `db` (SQLAlchemy), `socketio` (Flask-SocketIO), `jwt` (Flask-JWT-Extended), and `cors` (Flask-CORS).
  - It registers all Route Blueprints. Blueprints modularize the application so that routes aren't clustered in a single file.
  - It initializes background services (like APScheduler) for cron jobs, such as automated roster rollovers and daily database maintenance.

### 2. The Routing Layer (Controllers in `app/routes/`)
When an HTTP request hits the server (e.g., a user submitting a task or uploading a PDF), it is intercepted by a Blueprint router.
- **Role & Security:** Routes enforce access control using decorators like `@login_required` or custom RBAC logic (e.g., checking if `current_user.role == 'Manager'`).
- **Core Blueprints:**
  - `auth.py`: Manages user authentication, session creation, password hashing, and login history.
  - `tasks.py`: Handles fetching, creating, and updating recurring task entries and data updates. It calculates due dates based on task cadences.
  - `kanban.py`: Exposes RESTful endpoints for Kanban board operations (drag-and-drop updates, sprint creation, threaded comments).
  - `mis_report.py`: The critical endpoint for receiving PDF uploads. It saves the file temporarily and delegates the heavy lifting to the Service layer.
  - `chat.py`: Manages Socket.IO event emissions and chat history fetching.

### 3. The Business Logic & Services Layer (`app/services/`)
To prevent "fat controllers", computationally expensive or highly specialized logic is abstracted into isolated service modules. Routes call these services and await a structured response.
- **`pdf_parser.py` (Advanced Text Verification Engine):** When `mis_report.py` receives a PDF, it passes the file path to this service. The service uses `pdfplumber` to extract bounding boxes, maps them against the `MISTemplate` JSON coordinates, and evaluates if the required tables, charts, or text blocks are present.
- **`semantic_validator.py`:** Interacts with the historical `SemanticFeedback` database to evaluate the "quality" of text sections. It looks for past edge-cases or manual overrides approved by managers.
- **`scheduler.py`:** A daemonized APScheduler instance that runs in the background. It performs tasks like generating new `MasterLog` pending entries at midnight for Daily tasks, or rotating employees in the `RosterConfig`.

### 4. The Data Layer (Models in `app/models.py`)
This layer defines the structural schema of the MySQL database using SQLAlchemy ORM (Object-Relational Mapping).
- **Entities:** Models correspond to database tables (e.g., `User`, `MasterLog`, `KanbanTask`, `MISReportUpload`, `MISTemplate`).
- **Data Integrity:** Models enforce data types, primary/foreign keys, uniqueness constraints, and default values. 
- **Serialization:** Each model includes a `to_dict()` helper method. This is crucial because when the backend needs to send data to the frontend via AJAX/JSON, SQLAlchemy objects must be serialized into Python dictionaries.

### 5. The View Layer (`app/templates/` & `app/static/`)
The frontend is rendered server-side using Jinja2 templates, then hydrated with client-side JavaScript.
- **Templates (`app/templates/`):** Base layouts (`base.html`) provide the navigational shell, while child templates (`index.html`, `kanban.html`) inject page-specific content.
- **Static Assets (`app/static/`):** Contains pure Vanilla CSS for styling (ensuring rapid load times without heavy CSS frameworks) and Vanilla JavaScript.
- **Client-Server Interaction:**
  - **Traditional:** Standard page loads and form POST submissions.
  - **Asynchronous (AJAX):** Using JavaScript `fetch()` API to hit backend endpoints (e.g., updating a task status) without reloading the page.
  - **Real-Time (WebSocket):** The frontend establishes a Socket.IO connection. When a user sends a chat message or a manager assigns a task, the server emits a broadcast event, and the client's JavaScript dynamically updates the DOM instantly.

### Full Request Lifecycle Example (Uploading an MIS Report)
1. **Client:** User uploads `report.pdf` via the frontend UI in `index.html`.
2. **Route:** The POST request is caught by `@mis_report_bp.route('/upload')`. The route verifies the user's session and saves the file to the `uploads/` directory.
3. **Service:** The route calls `pdf_parser.analyze(filepath, report_type)`. The parser reads the `MISTemplate` coordinates from the DB, scans the PDF, and calculates a Pass/Fail score.
4. **Model:** The route creates a new `MISReportUpload` record in the database via SQLAlchemy, saving the JSON analysis results and the uploader's email.
5. **Response:** The route returns a JSON success object containing the parsing summary.
6. **Client:** The frontend JavaScript receives the JSON, removes the loading spinner, and dynamically renders the Green/Red validation checklist for the user.
