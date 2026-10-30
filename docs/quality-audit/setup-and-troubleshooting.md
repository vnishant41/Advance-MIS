# Advance ERP Setup, Deployment & Troubleshooting Guide

**Document Version:** 2.0.0 (Post-Remediation Final Edition)  
**Audit Milestone:** Milestone 6 (Final Documentation & Synchronization - R5)  
**Execution Timestamp:** 2026-10-28T11:00:00Z  
**Target Repository:** `Advance ERP` (`d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP`)  
**Audit Lead:** Worker Final Docs M6 / Quality Assurance & Architecture Specialist  

---

## 1. Overview & Prerequisites

Advance ERP is an enterprise operations platform combining real-time agricultural database surveillance, dynamic duty rostering, automated Gmail IMAP document ingestion, and PDF template parsing.

### System Prerequisites
- **Operating System:** Windows 10 / Windows 11 x64 (or Linux / macOS with path adjustments)
- **Python:** Python 3.12 (CPython 3.12.0+)
- **Database Engine:** MySQL Server 8.0.x running on port `3306`
- **Shell / Terminal:** PowerShell 5.1+ or PowerShell 7+ on Windows
- **Version Control:** Git 2.40+

---

## 2. Environment Setup

### 2.1 Clone and Directory Navigation
Open PowerShell and navigate to the project root directory:
```powershell
cd "d:\D Disk Data Backup\Nishant_800mb\Nishant\Aniygravity\Advance ERP"
```

### 2.2 Virtual Environment Initialization
Ensure a Python 3.12 virtual environment is initialized at `.venv`:
```powershell
# Create virtual environment if it does not exist
python -m venv .venv

# Activate the virtual environment
.\.venv\Scripts\Activate.ps1
```
*Note: If PowerShell displays an `ExecutionPolicy` error when activating scripts, run:*
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 2.3 Dependency Installation
Install pinned project dependencies from `requirements.txt`:
```powershell
.venv\Scripts\pip.exe install -r requirements.txt
```
Key dependencies installed:
- `Flask==3.1.1`
- `Flask-SocketIO==5.5.1`
- `eventlet==0.39.1`
- `SQLAlchemy==2.0.51`
- `Flask-SQLAlchemy==3.1.1`
- `PyMySQL==1.2.0`
- `Flask-JWT-Extended==4.7.1`
- `APScheduler==3.11.0`
- `pdfplumber==0.11.6`
- `openpyxl==3.1.5`

---

## 3. Database & Environment Configuration

### 3.1 MySQL Schema Configuration
Advance ERP utilizes a dual-database architecture:
1. **`advance_erp` (Primary Database):** Houses 34 relational tables managing users, reports, table catalog mappings, task logs, audit trails, and notifications.
2. **`agalabsdev_stage` (Surveillance Database):** External surveillance data lake containing 140+ agricultural commodity and scrapper tables.

Verify that the local MySQL service is active:
```powershell
Get-Service -Name MySQL*
# If stopped:
Start-Service MySQL80
```

### 3.2 Environment Variables (`.env`)
The application loads configuration values from `.env` in the project root. Ensure the file contains:
```ini
# Flask & Security Configuration
FLASK_APP=run.py
FLASK_ENV=development
SECRET_KEY=super-secret-key-advance-erp-2026-production
JWT_SECRET_KEY=jwt-advance-erp-secret-key-production-2026-secure-32bytes
JWT_ACCESS_TOKEN_EXPIRES=86400

# Database Connection URIs
# Primary ERP Database:
DATABASE_URL=mysql+pymysql://root:password@127.0.0.1:3306/advance_erp
# Surveillance Database:
SURVEILLANCE_DB_URL=mysql+pymysql://root:password@127.0.0.1:3306/agalabsdev_stage

# Document Upload Directories
UPLOAD_FOLDER=uploads
MAX_CONTENT_LENGTH=16777216

# Email / SMTP Configuration (Outbound Alerts & Daily Digests)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
SMTP_FROM=your_email@gmail.com

# Email / IMAP Configuration (Inbound Report Fetching)
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_gmail_app_password
IMAP_SERVER=imap.gmail.com
IMAP_PORT=993

# Local LLM Semantic Validator (Optional)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3
```

---

## 4. Running Advance ERP

### 4.1 Launch Command
Start the Advance ERP application using the entry point script:
```powershell
.venv\Scripts\python.exe run.py
```

### 4.2 Application Startup Sequence
Upon execution, `run.py` performs the following automated procedures:
1. **Port Availability Check:** Checks if port `5000` is currently bound by another process. If occupied, it identifies the owning PID, prompts or cleanly terminates the conflicting process, and claims the port.
2. **Local Network IP Resolution:** Discovers active network adapter IPv4 addresses (e.g. `192.168.1.65`).
3. **Automated Migration Invariant Assertions:** Executes `_run_lightweight_migrations()` in `app/__init__.py`. This checks baseline row counts and logs:
   ```text
   [migration] Zero data loss verified: 9 users, 27 reports, 158 catalog entries intact.
   ```
4. **APScheduler Background Jobs:** Initializes the `Asia/Kolkata` scheduler for 5-minute deadline scans and scheduled daily digests.
5. **Eventlet SocketIO Server:** Binds to `0.0.0.0:5000` and displays the startup banner:
   ```text
   * Running on all addresses (0.0.0.0)
   * Local:   http://127.0.0.1:5000/
   * Network: http://192.168.1.65:5000/
   ```

---

## 5. Network Connectivity & IP Architecture

### 5.1 Listening Interfaces (`0.0.0.0:5000`)
The web application binds to `0.0.0.0:5000`, meaning it listens on all active IPv4 interfaces on the host system:

| Access Context | URL | Description |
|---|---|---|
| **Local Machine** | `http://127.0.0.1:5000/`<br>`http://localhost:5000/` | Standard local development access via loopback interface. |
| **Local Area Network (LAN)** | `http://192.168.1.65:5000/` | Wi-Fi LAN access for cross-device testing on mobile phones, tablets, or other workstations. |
| **Obsolete Address Note** | `http://10.60.165.77:5000/` | **Connection Refused**. This IP was a transient DHCP lease from a previous session and is no longer assigned to any network adapter on this machine. |

### 5.2 Discovering Active Host IP in PowerShell
If the local Wi-Fi router assigns a new DHCP lease, inspect current active IPv4 addresses using:
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" } | Select-Object IPAddress, InterfaceAlias
```

---

## 6. Authentication & Test User Credentials

The database comes pre-seeded with baseline accounts. For local development, master passwords and user credentials are configured as follows:

| User Account | Name | Role | Dev Master Password | Permissions / Capabilities |
|---|---|---|---|---|
| `vaibhav@agalabs.com` | Vaibhav | `SuperAdmin` | `admin123` | Full administrative control, Table Mapping Studio, skip tasks, user management |
| `nishant@agalabs.com` | Nishant | `SuperAdmin` | `admin123` | Full administrative control, system settings, architecture configs |
| `ram@agalabs.com` | Ram Gopal | `Manager` | `admin123` | Daily surveillance review, manager task pull, roster scheduling |
| `bhawna@agalabs.com` | Bhawna | `Teammate` | `admin123` | Daily commodity surveillance, task checklist submission, MIS upload |
| `gopichand@agalabs.com` | Gopichand | `Teammate` | `admin123` | Scrapper matrix tasks, daily task submission |
| `nitesh@agalabs.com` | Nitesh | `Teammate` | `admin123` | Weather rotation tasks, daily task submission |
| `pankaj@agalabs.com` | Pankaj | `Teammate` | `admin123` | Daily commodity surveillance, task checklist submission |

---

## 7. Running Automated Test Suites
 
### 7.1 Complete Test Discovery Suite (97 tests)
Executes all unit, integration, and regression suites covering User Hierarchy, Table Mapping Studio, dynamic linking, and BUG-01..12 fixes:
```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
```
*Expected Result:* 97 tests passed, 0 failures, 0 errors in ~7.0 seconds.

### 7.2 Backend Stress & Concurrency Suite (7 tests)
Executes multi-threaded stress and database deadlock resistance tests:
```powershell
.venv\Scripts\python.exe -m unittest tests/adversarial_backend_stress.py -v
```
*Expected Result:* 7 tests passed, 0 failures, 0 errors in ~1.8 seconds.

### 7.3 Full Regression Suite Subtotal (104 tests)
All 6 test files (`test_adversarial_challenger2.py`, `test_batch1_fixes.py`, `test_batch2_fixes.py`, `test_hierarchy_and_studio.py`, `test_quality_audit_regression.py`, `adversarial_backend_stress.py`) combine for **104 total tests**, achieving 100% pass rate (104 PASSED, 0 FAILED, 0 BLOCKED, 0 NOT RUN) with zero deprecation or security warnings.

### 7.4 Verifying Baseline Invariants via CLI
Verify that all 9 users, 27 reports, and 158 catalog entries remain intact:
```powershell
.venv\Scripts\python.exe -c "from app import create_app, db; from app.models import User, Report, DBTaskCatalog; app=create_app(); ctx=app.app_context(); ctx.push(); print(f'Users: {User.query.count()}, Reports: {Report.query.count()}, Catalog: {DBTaskCatalog.query.count()}')"
```

---

## 8. Common Troubleshooting Steps

### 8.1 Port 5000 Already in Use (`WinError 10048`)
- **Symptom:** Server launch fails with `[WinError 10048] Only one usage of each socket address is normally permitted`.
- **Cause:** A previous instance of `run.py` is still running in the background.
- **Solution:**
  1. Find the PID listening on port 5000:
     ```powershell
     netstat -ano | findstr :5000
     ```
  2. Terminate the process by PID:
     ```powershell
     taskkill /F /PID <PID_NUMBER>
     ```
  3. Re-run `.venv\Scripts\python.exe run.py`.

### 8.2 MySQL Server Connection Refused (`2003: Can't connect to MySQL server`)
- **Symptom:** Startup fails with `pymysql.err.OperationalError: (2003, "Can't connect to MySQL server on '127.0.0.1'")`.
- **Cause:** Local MySQL service is stopped.
- **Solution:**
  1. Verify MySQL service status:
     ```powershell
     Get-Service MySQL*
     ```
  2. Start the service:
     ```powershell
     Start-Service MySQL80
     ```

### 8.3 Admin Settings Crash (`NameError: name 'os' is not defined`) (BUG-01 - RESOLVED)
- **Symptom:** Sending a request to `GET /api/admin/settings` returns HTTP 500 with `NameError: name 'os' is not defined`.
- **Cause:** `app/routes/admin.py` lacked a top-level `import os`.
- **Remediation Status:** **Resolved in Milestone 3**. Added `import os`, `import re`, `import glob` to `app/routes/admin.py:4`. Protected by automated test `test_bug01_get_settings_succeeds_without_name_error` in `tests/test_batch1_fixes.py`.

### 8.4 Stale Code Execution in Background Process (BUG-03 - RESOLVED)
- **Symptom:** Changes saved to `.py` files on disk do not reflect in API responses.
- **Cause:** `run.py` runs eventlet with `use_reloader=False` to avoid threading conflicts on Windows.
- **Remediation Status:** **Resolved in Milestone 3**. Stale process PID 16524 was cleanly terminated and restarted as active PID 5016, ensuring full runtime synchronization with the latest disk codebase.
- **Operational Procedure:** Whenever backend Python files are modified, terminate the active server process (`Stop-Process -Id <PID> -Force` or `taskkill /F /PID <PID>`) and restart `run.py` so the Python interpreter loads updated bytecode.

### 8.5 Insecure Key Length Warning (BUG-08 - RESOLVED)
- **Symptom:** Test execution logs `InsecureKeyLengthWarning: The HMAC key is 19 bytes long...`.
- **Cause:** The default fallback `JWT_SECRET_KEY` in `app/config.py` was `'jwt-erp-secret-2026'` (19 bytes < 32 bytes RFC 7518 minimum).
- **Remediation Status:** **Resolved in Milestone 4**. Fallback key upgraded to a 55-byte cryptographic secret (`'jwt-advance-erp-super-secret-key-32bytes-2026-production'`). Emits zero warnings. Protected by `test_bug08_jwt_secret_key_length_and_no_warning`.

### 8.6 Ollama Semantic Validation Offline
- **Symptom:** MIS report parsing logs an error connecting to `http://localhost:11434`.
- **Cause:** Ollama service is not running locally.
- **Solution:**
  `app/services/semantic_validator.py` contains automated `try/except` fallback logic, allowing the system to operate smoothly without LLM validation. If LLM features are desired:
  1. Start Ollama: `ollama serve`
  2. Pull the model: `ollama pull llama3`

### 8.7 Gmail IMAP Ingestion Fails
- **Symptom:** `/api/crishi/reports/sync-gmail` returns `Authentication failed` or `IMAP error`.
- **Cause:** Missing or expired Google Account App Password.
- **Solution:**
  1. Enable 2-Step Verification on the configured Google account.
  2. Generate a 16-character App Password under Google Account Security > App Passwords.
  3. Set `GMAIL_APP_PASSWORD` and `SMTP_PASSWORD` in `.env`.
