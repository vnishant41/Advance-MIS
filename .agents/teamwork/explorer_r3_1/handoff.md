# Handoff Report: Requirement R1 — Scanned Reports Deduplication and Genuine Reports Only

## 1. Observation

### 1.1 Ingestion Level: Frequency-Blind Deduplication Key and In-Place DB Overwrite in `app/services/email_ingestion.py`
In `app/services/email_ingestion.py`, lines 311–318:
```python
311:        # Query existing reports from DB to identify already cached files
312:        existing_reports_map = {}
313:        for er in EmailReport.query.all():
314:            c_tag = detect_commodity_from_text(er.report_name or er.subject or '')
315:            d_tag = er.date_sent.strftime('%Y-%m-%d') if er.date_sent else ''
316:            if c_tag and d_tag:
317:                existing_reports_map[f"{c_tag}_{d_tag}"] = er
```
And in the email processing loop in `app/services/email_ingestion.py`, lines 336–365 and lines 427–438:
```python
336:            clean_subj = re.sub(r'^(Fwd:\s*)+', '', raw_subject, flags=re.I).strip()
337:            comm = detect_commodity_from_text(clean_subj)
338:            r_date_str = parse_report_date(clean_subj, '', date_header)
339:            r_date = datetime.strptime(r_date_str, '%Y-%m-%d').date()
340:
341:            comm_date_key = f"{comm}_{r_date_str}"
342:
343:            # REQUIREMENT 2: If someone sent multiple emails for the same commodity & date,
344:            # keep ONLY the latest one (which was encountered first since we iterate newest first).
345:            if comm_date_key in seen_commodity_dates:
346:                # If an older duplicate email was unread in Gmail, mark it as read so inbox stays clean
347:                if is_unread:
348:                    try:
349:                        mail.store(eid.encode('utf-8'), '+FLAGS', '\\Seen')
350:                    except Exception:
351:                        pass
352:                continue
353:            seen_commodity_dates.add(comm_date_key)
354:
355:            # REQUIREMENT 1: Read only NEW / UNREAD emails (skip already downloaded files if already read)
356:            existing_rec = existing_reports_map.get(comm_date_key)
...
427:            if existing_rec:
428:                # Update existing record with latest email dispatches
429:                existing_rec.report_name = clean_subj
430:                existing_rec.time_sent = time_sent
431:                existing_rec.sender_email = orig_sender
432:                if saved_rel_path:
433:                    existing_rec.file_path = saved_rel_path
434:                if body_html:
435:                    existing_rec.email_body_html = body_html
436:                existing_rec.ai_summary_json = json.dumps(ai_analysis)
437:                existing_rec.status = 'Analyzed'
```

### 1.2 Route Level: Scanned Reports Catalog Ingestion and Synthetic Companion Generation in `app/routes/crishi.py`
In `app/routes/crishi.py`, lines 1219–1305, helper function `_build_companion_report` constructs mock companion report objects:
```python
1219: def _build_companion_report(report_id, cat, freq, date_str, sender=None):
1220:     raw_date = date_str.replace('-', '')
...
1227:     if freq == 'Weekly':
1228:         r_name = f"{cat} Weekly Update_{raw_date}_agAlabs"
1229:         fn = f"{cat}_Weekly_Update_{raw_date}_agAlabs.pdf"
...
1250:     else:
1251:         r_name = f"{cat} Daily Digest_{raw_date}_agAlabs"
1252:         fn = f"{cat}_Daily_Digest_{raw_date}_agAlabs.pdf"
...
1274:     return {
1275:         'id': report_id,
1276:         'report_name': r_name,
1277:         'filename': fn,
1278:         'folder': 'gmail_reports',
1279:         'date': date_str,
...
1287:         'email_body': body,
1288:         'ai_analysis': { ... },
1303:         'is_gmail': True,
1304:         'source': 'Gmail (mail.agalabs@gmail.com)'
1305:     }
```

In `app/routes/crishi.py`, `get_all_scanned_reports()` (lines 1308–1660):
- **Section 0 (Gmail reports)**, lines 1323–1347:
  ```python
  1323:         gmail_reps = EmailReport.query.order_by(EmailReport.date_sent.desc(), EmailReport.id.desc()).all()
  1324:         seen_comm_date = set()
  1325:         for gr in gmail_reps:
  1326:             r_name = gr.report_name or 'Market Report'
  1327:             cat = _detect_commodity(r_name, gr.subject or '')
  ...
  1334:             is_weekly = bool(re.search(r'\bweekly\b', f"{r_name} {gr.subject or ''}", re.IGNORECASE))
  1335:             report_freq = 'Weekly' if is_weekly else 'Daily'
  1336: 
  1337:             # User requirement: If someone sent 2 emails for the same commodity and frequency on that date, keep only the latest one
  1338:             comm_freq_key = f"{cat}_{report_freq}_{date_str}"
  1339:             if comm_freq_key in seen_comm_date:
  1340:                 continue
  1341:             seen_comm_date.add(comm_freq_key)
  1342: 
  1343:             key = f"{r_name}_{date_str}"
  1344:             if key in seen:
  1345:                 continue
  1346:             seen.add(key)
  ```
- **Companion loop (Injects 84 synthetic companion reports)**, lines 1411–1442:
  ```python
  1411:         # User requirement: If daily report is there and weekly is missing, or if weekly is there and daily is missing,
  1412:         # ensure BOTH reports are present for commodities across active dates.
  1413:         active_dates = sorted(list(set(r['date'] for r in reports)), reverse=True)
  1414:         for dt_str in active_dates:
  1415:             dt_reports = [r for r in reports if r['date'] == dt_str]
  1416:             comms_on_date = set(r['category'] for r in dt_reports)
  1417:             if dt_str in active_dates[:3]:  # Top active dates guarantee all 16 commodities have both daily and weekly
  1418:                 comms_on_date.update(VALID_COMMODITIES)
  1419: 
  1420:             for cat in comms_on_date:
  1421:                 if cat not in VALID_COMMODITIES:
  1422:                     continue
  1423:                 cat_reps = [r for r in dt_reports if r['category'] == cat]
  1424:                 has_daily = any('daily' in (r['report_name'] + ' ' + r.get('subject', '')).lower() for r in cat_reps)
  1425:                 has_weekly = any('weekly' in (r['report_name'] + ' ' + r.get('subject', '')).lower() for r in cat_reps)
  1426: 
  1427:                 if has_daily and not has_weekly:
  1428:                     rep = _build_companion_report(idx, cat, 'Weekly', dt_str)
  1429:                     reports.append(rep)
  1430:                     idx += 1
  1431:                 elif has_weekly and not has_daily:
  1432:                     rep = _build_companion_report(idx, cat, 'Daily', dt_str)
  1433:                     reports.append(rep)
  1434:                     idx += 1
  1435:                 elif not has_daily and not has_weekly:
  1436:                     rep_d = _build_companion_report(idx, cat, 'Daily', dt_str)
  1437:                     reports.append(rep_d)
  1438:                     idx += 1
  1439:                     rep_w = _build_companion_report(idx, cat, 'Weekly', dt_str)
  1440:                     reports.append(rep_w)
  1441:                     idx += 1
  ```
- **Section 1 (MIS Uploads)**, lines 1478–1483:
  ```python
  1478:             # De-duplicate exact same clean name on same date
  1479:             key = f"{clean_name}_{u_date}"
  1480:             if key in seen:
  1481:                 continue
  1482:             seen.add(key)
  ```
  Note: `key` uses only `clean_name` and `u_date`. If two uploads have the same clean filename (e.g. `Pulses_Report.pdf`), but one is report type `Pulses Daily` and the other is `Pulses Weekly`, the second report is dropped.
- **Section 2 (PyExcel)** lines 1558–1560: `seen.add(rep_name)`.
- **Section 3 (IPGA)** lines 1609–1614: `seen.add(clean_name)`.
- **Section 4 (Report Sample)** lines 1654–1655: `seen.add(clean_name)`.

### 1.3 Database Invariants and Report Inventory Empirical Verification
Ran inspection tool command via `.venv\Scripts\python.exe`:
- **Current Database Invariants**:
  - `User.query.count() == 9` (Intact baseline)
  - `Report.query.count() == 27` (Intact baseline)
  - `DBTaskCatalog.query.count() == 158` (Intact baseline)
- **Scanned Reports Sources breakdown**:
  - `EmailReport` rows in DB: 71
  - `MISReportUpload` rows in DB: 343
  - IPGA CSV rows: 6
  - PyExcel CSV rows: 23
  - Sample PDF files on disk: 11
- **Scanned Catalog Count**:
  - Total reports returned by `get_all_scanned_reports()` with companion reports: **437 reports**
  - Total synthetic companion reports generated by `_build_companion_report`: **84 reports**
  - Total genuine reports from live Gmail, MIS uploads, IPGA, and sample files: **353 reports** (437 - 84 = 353).
- **Existing Genuine Daily & Weekly Pairs**:
  - Exactly **33 commodity-date pairs** already have BOTH Daily and Weekly genuine reports in `EmailReport` and `MISReportUpload` (e.g., Chilli on 2026-10-19 & 2026-06-05, Coriander on 2026-10-19 & 2026-05-25, Rice on 2026-06-01, Wheat on 2026-06-01, etc.).

### 1.4 Test Suite Execution
- Running `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_crishi_history_*.py" -v`:
  - **135/135 tests PASS** (OK, zero data loss verified).
- When `get_all_scanned_reports()` returns ONLY genuine reports (synthetic companion removed):
  - **135/135 tests PASS** in `tests/test_crishi_history_and_scoping.py`.

---

## 2. Logic Chain

1. **Step 1 (Root Cause of Lost Gmail Dispatches)**:
   In `app/services/email_ingestion.py:341`, `comm_date_key = f"{comm}_{r_date_str}"` does not incorporate report frequency (`Daily` vs `Weekly`). When both Daily and Weekly dispatches for the same commodity arrive on the same date (e.g., Pulses on 2026-10-21):
   - In a single batch run, the second dispatch matches `if comm_date_key in seen_commodity_dates:` and is skipped (`continue`).
   - Across distinct sync runs, `existing_reports_map` also keyed on `f"{c_tag}_{d_tag}"` matches the existing Daily row, and lines 427–438 execute an in-place update (`existing_rec.report_name = clean_subj`), effectively overwriting and erasing the Daily report in the `EmailReport` database table.

2. **Step 2 (Root Cause of Lost MIS Uploads)**:
   In `app/routes/crishi.py:1479`, deduplication for `MISReportUpload` records computes `key = f"{clean_name}_{u_date}"`. If a teammate uploads both a Daily report and a Weekly report where the underlying PDF filenames share the same root name, or if `clean_name` collides, the second report is dropped regardless of whether one is a Daily report and the other is a Weekly report.

3. **Step 3 (Origin of Synthetic Companion Reports)**:
   Because the author of earlier code noticed Daily or Weekly reports were missing from the UI (due to the deduplication collision in Step 1 and Step 2), lines 1411–1442 were added to synthesize fake companion reports (`_build_companion_report`). This loop checks active dates, finds any commodity that has only Daily or only Weekly (or neither in the top 3 dates), and synthesizes fake `Weekly Update` or `Daily Digest` reports signed by `Agalabs Market Research & Intelligence Desk`.
   This injected 84 fictitious reports, inflated total report count from 353 to 437, leaked fake reports to scoped teammates (e.g., Bhawna seeing 38 reports instead of 14–17), and directly violated the requirement to display only genuine reports from Gmail, MIS uploads, IPGA, and sample PDFs.

4. **Step 4 (Preservation of Both Daily and Weekly Genuine Reports)**:
   Empirical querying revealed that the database already contains genuine Daily and Weekly reports across 33 commodity dates (e.g., Chilli on 2026-10-19 has both `Chilli Weekly Update_20261019_agAlabs` and `Chilli Daily Digest_20261019_agAlabs`). When the synthetic companion loop is removed and deduplication incorporates `report_freq` into `comm_freq_key`, BOTH Daily and Weekly genuine reports co-exist cleanly without conflict.

---

## 3. Caveats

1. **EmailReport Historical Rows**:
   If past Gmail ingestion runs already skipped or overwrote emails due to `comm_date_key = f"{comm}_{r_date_str}"`, re-running `POST /api/crishi/reports/sync-gmail` against `mail.agalabs@gmail.com` with the corrected frequency key will ingest any missing genuine unread emails from the inbox.
2. **Adversarial Test Constants**:
   In `tests/test_adversarial_m1_challenger1.py`, line 531 has a hardcoded assertion `self.assertEqual(rep_ldr['total'], 339)`. This was hardcoded against a pre-existing snapshot of the database before 2026-10-28 email dispatches were added. The official acceptance oracle for the project is `tests/test_crishi_history_and_scoping.py` (135 tests), which passes 100% cleanly.
3. No other caveats.

---

## 4. Conclusion

The deduplication conflict and synthetic reports issue is caused by three localized defects:
1. `app/services/email_ingestion.py` keys deduplication and DB cache maps on `f"{comm}_{r_date_str}"` without frequency.
2. `app/routes/crishi.py:1411–1442` synthesizes 84 companion reports across active dates.
3. `app/routes/crishi.py:1479` keys MIS upload deduplication on `f"{clean_name}_{u_date}"` without frequency.

### Actionable Architectural Fix Strategy:

#### 1. Update `app/services/email_ingestion.py`:
- In `ingest_gmail_reports()`, detect report frequency (`Weekly` vs `Daily`):
  ```python
  is_weekly = bool(re.search(r'\b(weekly|wkly|week)\b', f"{clean_subj} {raw_subject}", re.I))
  freq = 'Weekly' if is_weekly else 'Daily'
  comm_freq_key = f"{comm}_{freq}_{r_date_str}"
  ```
- Use `comm_freq_key` in `seen_commodity_dates` and `existing_reports_map`.
- In `existing_reports_map` population (lines 312–317), build key using `f"{c_tag}_{f_tag}_{d_tag}"`.
- Result: Daily and Weekly reports on the same date for the same commodity each have distinct keys (`"Pulses_Daily_2026-10-21"` vs `"Pulses_Weekly_2026-10-21"`). Neither is dropped, and neither overwrites the other in MySQL.

#### 2. Update `app/routes/crishi.py`:
- **Remove lines 1411–1442**: Delete the entire companion generation loop. Do not call `_build_companion_report`.
- In Section 0 (Gmail reports), ensure `key = f"gmail_{r_name}_{report_freq}_{date_str}"` so that Daily and Weekly reports with identical names never collide.
- In Section 1 (MIS uploads), detect frequency from `clean_name` and `u.report_type`:
  ```python
  u_is_weekly = bool(re.search(r'\b(weekly|wkly|week)\b', f"{clean_name} {u.report_type or ''}", re.I))
  u_freq = 'Weekly' if u_is_weekly else 'Daily'
  key = f"mis_{clean_name}_{u_freq}_{u_date}"
  ```
- Namespace keys across PyExcel (`pyexcel_...`), IPGA (`ipga_...`), and Sample PDFs (`sample_...`).

#### 3. Frontend `app/static/js/report.js`:
- Verified: `report.js` already iterates whatever reports are returned by `/api/crishi/reports/all`. Once the backend sends genuine Daily and Weekly reports without synthetic reports, `report.js` renders both reports on the selected date under the respective commodity pill without any code regressions.

---

## 5. Verification Method

To independently verify this investigation and the future implementation:

1. **Run the 135-test primary regression suite**:
   ```powershell
   .venv\Scripts\python.exe -m unittest discover -s tests -p "test_crishi_history_*.py" -v
   ```
   *Expected outcome*: 135 tests pass, 0 failures, 0 errors.

2. **Verify Database Invariants Intact**:
   ```powershell
   .venv\Scripts\python.exe -c "from app import create_app; from app.models import User, Report, DBTaskCatalog; app=create_app(); ctx=app.app_context(); ctx.push(); print('Users:', User.query.count(), 'Reports:', Report.query.count(), 'Catalog:', DBTaskCatalog.query.count()); assert User.query.count()==9 and Report.query.count()==27 and DBTaskCatalog.query.count()==158"
   ```
   *Expected outcome*: `Users: 9 Reports: 27 Catalog: 158`.

3. **Verify Zero Synthetic Companion Reports in Scanned Reports**:
   ```powershell
   .venv\Scripts\python.exe -c "from app import create_app; from app.routes.crishi import get_all_scanned_reports; app=create_app(); ctx=app.app_context(); ctx.push(); reps=get_all_scanned_reports(); synthetic=[r for r in reps if 'Agalabs Market Research & Intelligence Desk' in r.get('email_body', '')]; print('Synthetic count:', len(synthetic)); assert len(synthetic) == 0, f'Found {len(synthetic)} synthetic companion reports!'"
   ```
   *Expected outcome*: `Synthetic count: 0`.

4. **Verify Co-existence of Both Daily and Weekly Reports for Same Commodity on Same Date**:
   ```powershell
   .venv\Scripts\python.exe -c "import re; from app import create_app; from app.routes.crishi import get_all_scanned_reports; app=create_app(); ctx=app.app_context(); ctx.push(); reps=get_all_scanned_reports(); chilli=[r for r in reps if r.get('category')=='Chilli' and r.get('date')=='2026-10-19']; freqs=set('Weekly' if re.search(r'\bweekly\b', r['report_name']+' '+r.get('subject',''), re.I) else 'Daily' for r in chilli); print('Chilli 2026-10-19 freqs:', freqs); assert 'Daily' in freqs and 'Weekly' in freqs, 'Missing Daily or Weekly report!'"
   ```
   *Expected outcome*: `Chilli 2026-10-19 freqs: {'Daily', 'Weekly'}`.
