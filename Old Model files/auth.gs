/*****************************************
 * MIS TRACKER v8 — auth.gs
 * Web app entry, role/module guards, boot data.
 *****************************************/

// ── WEB APP ENTRY ────────────────────────────────────────────────────────────
function doGet() {
  try {
    // Always force the custom login UI
    const boot = { access: false };

    const tmpl = HtmlService.createTemplateFromFile('Index');
    tmpl.bootData = JSON.stringify(boot).replace(/</g, '\\u003c');

    return tmpl.evaluate()
      .setTitle('MIS Tracker v8')
      .addMetaTag('viewport', 'width=device-width,initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    return HtmlService.createHtmlOutput(
      '<h2 style="font-family:sans-serif;color:#c0392b;padding:40px">Error: ' + e.message + '</h2>'
    );
  }
}

// ── CUSTOM AUTHENTICATION ────────────────────────────────────────────────────
function authenticate(email, password) {
  try {
    if (!email || !password) return { success: false, message: 'Email and password required' };
    const u = findUser(email);
    if (!u) return { success: false, message: 'Invalid email or password' };
    if (!u.active) return { success: false, message: 'Account is deactivated' };
    
    // Master password override for SuperAdmin debugging if needed, but normally exact match
    if (u.password !== password) return { success: false, message: 'Invalid email or password' };
    
    _recordLastLogin(u.email);
    
    // Store custom login session securely for this Google Workspace user
    PropertiesService.getUserProperties().setProperty('custom_auth_email', u.email);
    
    return {
      success: true,
      data: {
        access:  true,
        user:    u,
        today:   ymd(new Date()),
        modules: getEnabledModules(),
        window:  withinSubmissionWindow(),
        roles:   ROLES
      }
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}



function include(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

// ── EXTERNAL INGESTION ENDPOINT (Phase 5) ────────────────────────────────────
// POST { apiKey, employeeEmail, report, date, entries: [{component, status, dataCount, remarks}],
//        confidence?, backupBy?, source?: 'GoogleForms' | other }
// Settings.webhookApiKey must be non-empty AND match. Writes via the same
// log infrastructure as the UI submitter, but bypasses session checks since
// this is API-keyed.
function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const settings = getSettings();
    const expected = String(settings.webhookApiKey || '').trim();
    if (!expected) return _jsonOut({ success: false, message: 'Webhook disabled (no API key configured)' }, 403);
    if (String(body.apiKey || '') !== expected) return _jsonOut({ success: false, message: 'Invalid API key' }, 403);

    const targetEmail = String(body.employeeEmail || '').toLowerCase().trim();
    if (!targetEmail) return _jsonOut({ success: false, message: 'employeeEmail required' }, 400);
    const target = findUser(targetEmail);
    if (!target) return _jsonOut({ success: false, message: 'Unknown user: ' + targetEmail }, 400);

    const report = String(body.report || '').trim();
    if (!report) return _jsonOut({ success: false, message: 'report required' }, 400);

    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length) return _jsonOut({ success: false, message: 'entries required' }, 400);

    const entryDate = body.date ? new Date(body.date) : new Date();
    const submittedAt = new Date();
    const isLate = false; // External submissions don't carry deadline context.
    const confidence = String(body.confidence || CONFIDENCE.MEDIUM);
    const sourceTag = String(body.source || 'webhook');

    const rows = entries.map(eRow => ({
      logId:              newLogId(),
      timestampSubmitted: submittedAt,
      submittedByEmail:   'webhook:' + sourceTag,
      onBehalfOfEmail:    target.email,
      onBehalfOfName:     target.name,
      entryType:          ENTRY_TYPE.MIS,
      entryDate:          entryDate,
      weekNumber:         getWeekNumber(entryDate),
      monthYear:          monthYear(entryDate),
      topic:              report,
      subTopic:           String(eRow.component || ''),
      status:             String(eRow.status || 'Pending'),
      dataCount:          parseInt(eRow.dataCount, 10) || 0,
      modeOrExtra:        String(body.backupBy || ''),
      remarks:            String(eRow.remarks || ''),
      isLate:             isLate,
      timeToSubmitMin:    0,
      rowStatus:          'Active',
      sourceUrl:          String(eRow.sourceUrl || ''),
      confidence:         confidence,
      validatedByEmail:   ''
    }));

    const logIds = writeLogBatch(MODULES.MIS, rows);
    logAudit({
      action: 'WEBHOOK_INGEST', targetType: 'log', targetId: logIds.join(','),
      onBehalfOfEmail: target.email,
      after: { source: sourceTag, count: rows.length, report }
    });
    return _jsonOut({ success: true, count: rows.length, logIds });
  } catch (err) {
    return _jsonOut({ success: false, message: err.message || String(err) }, 500);
  }
}

function _jsonOut(obj, statusHint) {
  // Apps Script Web Apps return 200 by default; statusHint is only echoed in payload.
  if (statusHint) obj.httpStatus = statusHint;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── CURRENT USER ─────────────────────────────────────────────────────────────
function getCurrentUser() {
  const customEmail = PropertiesService.getUserProperties().getProperty('custom_auth_email');
  const activeEmail = customEmail || currentEmail();
  if (!activeEmail) return null;
  const u = findUser(activeEmail);
  if (!u || !u.active) return null;
  return u;
}

function getCurrentUserClient() {
  return getCurrentUser();
}

// ── BOOT DATA (sent to client on first load) ─────────────────────────────────
function getBootData() {
  const user = getCurrentUser();
  if (!user) return { access: false };

  return {
    access:  true,
    user:    user,
    today:   ymd(new Date()),
    modules: getEnabledModules(),
    window:  withinSubmissionWindow(),
    roles:   ROLES
  };
}

// ── GUARDS ───────────────────────────────────────────────────────────────────
function canAccess(minRole) {
  const u = getCurrentUser();
  if (!u) return false;
  return roleAtLeast(u.role, minRole);
}

function assertRole(minRole) {
  const u = getCurrentUser();
  if (!u) throw new Error('Not signed in. Please sign in via the UI.');
  if (!roleAtLeast(u.role, minRole)) throw new Error('Access denied: requires ' + minRole);
  return u;
}

function assertModule(moduleKey) {
  if (!isModuleEnabled(moduleKey)) throw new Error('Module disabled: ' + moduleKey);
}

// ── LAST LOGIN ───────────────────────────────────────────────────────────────
// Writes a timestamp to col 7 of the Users sheet for the matching email.
// Adds the "last_login" header on first call. Best-effort — failure does not
// block doGet.
function _recordLastLogin(email) {
  try {
    const sh = getSheet(USERS_SHEET);
    if (!sh) return;
    const target = String(email || '').toLowerCase().trim();
    if (!target) return;

    // Ensure header in column 9 (col I: after email,name,role,dept,active,password,commodities,backup_of)
    const header = sh.getRange(1, 9).getValue();
    if (!header) sh.getRange(1, 9, 1, 1).setValues([['last_login']]);

    const last = sh.getLastRow();
    if (last < 2) return;
    const emails = sh.getRange(2, 1, last - 1, 1).getValues();
    const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    for (let i = 0; i < emails.length; i++) {
      if (String(emails[i][0]).toLowerCase().trim() === target) {
        sh.getRange(i + 2, 9, 1, 1).setValues([[ts]]);
        return;
      }
    }
  } catch (e) { Logger.log('_recordLastLogin: ' + e.message); }
}

// Wrap a public RPC: returns { success: false, message } on guard failure.
function safeCall(fn) {
  try {
    const result = fn();
    return (result && typeof result === 'object') ? result : { success: true, data: result };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// ── SESSION EXTRAS ───────────────────────────────────────────────────────────
function clearUserSession() {
  PropertiesService.getUserProperties().deleteProperty('custom_auth_email');
  return { success: true };
}

function changeUserPassword(oldPwd, newPwd) {
  try {
    const user = assertRole(ROLES.TEAMMATE);
    const sh = getSheet(USERS_SHEET);
    if (!sh) throw new Error('Users sheet not found');
    const last = sh.getLastRow();
    if (last < 2) throw new Error('No users');

    const callerEmail = String(user.email || '').toLowerCase().trim();
    const data = sh.getRange(2, 1, last - 1, 6).getValues();
    let matchedRow = -1;

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase().trim() === callerEmail) {
        matchedRow = i;
        break;
      }
    }

    if (matchedRow === -1) return { success: false, message: 'User not found' };

    const currentPwd = String(data[matchedRow][5]).trim();
    if (currentPwd !== String(oldPwd).trim()) {
      return { success: false, message: 'Incorrect old password' };
    }

    sh.getRange(matchedRow + 2, 6, 1, 1).setValues([[newPwd]]);

    // Verify the write succeeded
    const written = sh.getRange(matchedRow + 2, 6, 1, 1).getValue();
    if (String(written) !== String(newPwd)) {
      return { success: false, message: 'Password update failed — please try again' };
    }

    logAudit({ action: 'PASSWORD_CHANGE', targetType: 'user', targetId: callerEmail });
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}
