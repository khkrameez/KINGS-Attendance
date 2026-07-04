/**
 * Utils.gs — shared low-level helpers used across the backend.
 */

// ---- HTTP response helpers ----------------------------------------------

/** Wraps a JS object as a JSON text response (CORS allowed by Apps Script for Web Apps). */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  return { success: true, data: data };
}

function fail_(message, code) {
  return { success: false, error: message, code: code || 'ERROR' };
}

// ---- Sheet access ---------------------------------------------------------

/** Gets a sheet by name, creating it with headers if it does not exist. */
function getOrCreateSheet_(name, headers) {
  const db = getDb_();
  let sheet = db.getSheetByName(name);
  if (!sheet) {
    sheet = db.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a3d7c').setFontColor('#ffffff');
  }
  return sheet;
}

/** Reads all data rows of a sheet as an array of objects keyed by header row. */
function readSheetAsObjects_(sheetName) {
  const sheet = getDb_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return values.map(function (row, idx) {
    const obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    obj.__row = idx + 2; // 1-based sheet row number, for updates/deletes
    return obj;
  });
}

/** Appends one row (array of header-ordered values) to a sheet. */
function appendRow_(sheetName, rowObj, headers) {
  const sheet = getDb_().getSheetByName(sheetName);
  const row = headers.map(function (h) { return rowObj[h] !== undefined ? rowObj[h] : ''; });
  sheet.appendRow(row);
  return row;
}

/** Updates specific columns of a given sheet row (1-based, includes header row). */
function updateRow_(sheetName, rowIndex, rowObj, headers) {
  const sheet = getDb_().getSheetByName(sheetName);
  const row = headers.map(function (h) { return rowObj[h] !== undefined ? rowObj[h] : ''; });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
}

/** Deletes a sheet row by 1-based row index. */
function deleteRow_(sheetName, rowIndex) {
  getDb_().getSheetByName(sheetName).deleteRow(rowIndex);
}

// ---- IDs & hashing ----------------------------------------------------

function newId_(prefix) {
  return (prefix || '') + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

/** Deterministic salted SHA-256 hash, hex encoded. */
function hashPassword_(password, salt) {
  const digest = Utilities.computeHmacSha256Signature(password, salt);
  return digest.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

// ---- Dates --------------------------------------------------------------

/** Formats a Date (or date-parsable value) as yyyy-MM-dd in the script timezone. */
function fmtDate_(d) {
  const date = (d instanceof Date) ? d : new Date(d);
  return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');
}

function fmtMonth_(d) {
  const date = (d instanceof Date) ? d : new Date(d);
  return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM');
}

function nowIso_() {
  return new Date().toISOString();
}

/** True if dateStr (yyyy-MM-dd) falls within monthStr (yyyy-MM). */
function dateInMonth_(dateStr, monthStr) {
  return String(dateStr).indexOf(monthStr) === 0;
}
