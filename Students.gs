/**
 * Students.gs
 *
 * The CRM spreadsheet is the single master source of student data.
 * This module only ever READS from the CRM sheet, and WRITES into this
 * Attendance spreadsheet's own "Students" sheet (a local, attendance-scoped
 * cache). The CRM is never modified. Existing attendance-linked students
 * are never overwritten by a sync — only new students are appended.
 *
 * Expected CRM header row (case-insensitive, order-independent):
 *   Student ID | Student Name | Parent Name | Mobile Number | WhatsApp Number
 *   | Class | School | Joining Date | Status
 * "Student ID" is optional — if the CRM has no ID column, an internal ID
 * is generated and kept stable on every future sync via name+mobile+class
 * matching.
 */

function getSetting_(key) {
  const rows = readSheetAsObjects_(SHEET_SETTINGS);
  const row = rows.find(function (r) { return r.Key === key; });
  return row ? row.Value : '';
}

// Maps our internal field name -> list of acceptable CRM header spellings.
const CRM_HEADER_MAP = {
  StudentID: ['student id', 'studentid', 'id'],
  Name: ['student name', 'name'],
  ParentName: ['parent name', 'parentname', 'guardian name'],
  Mobile: ['mobile number', 'mobile', 'phone', 'contact number'],
  WhatsApp: ['whatsapp number', 'whatsapp'],
  Class: ['class', 'standard', 'grade'],
  School: ['school', 'school name'],
  JoiningDate: ['joining date', 'admission date', 'date of joining'],
  Status: ['status']
};

function matchCrmColumns_(headerRow) {
  const normalized = headerRow.map(function (h) { return String(h).trim().toLowerCase(); });
  const colIndex = {};
  Object.keys(CRM_HEADER_MAP).forEach(function (field) {
    const aliases = CRM_HEADER_MAP[field];
    let idx = -1;
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.indexOf(normalized[i]) !== -1) { idx = i; break; }
    }
    colIndex[field] = idx; // -1 if not present in the CRM
  });
  return colIndex;
}

/**
 * Reads the CRM sheet (external spreadsheet, read-only) and returns
 * normalized student rows. Throws a descriptive error if the CRM sheet
 * ID / tab is not configured or not reachable.
 */
function readCrm_() {
  const crmId = getSetting_('CRM_SHEET_ID');
  const crmTab = getSetting_('CRM_SHEET_TAB') || 'Students';
  if (!crmId) throw new Error('CRM Google Sheet ID is not configured. Set it in Settings first.');

  let crmSpreadsheet;
  try {
    crmSpreadsheet = SpreadsheetApp.openById(crmId);
  } catch (e) {
    throw new Error('Could not open the CRM spreadsheet. Check the CRM Sheet ID in Settings and sharing permissions.');
  }
  const crmSheet = crmSpreadsheet.getSheetByName(crmTab) || crmSpreadsheet.getSheets()[0];
  const lastRow = crmSheet.getLastRow();
  const lastCol = crmSheet.getLastColumn();
  if (lastRow < 2) return [];

  const values = crmSheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headerRow = values[0];
  const colIndex = matchCrmColumns_(headerRow);

  const results = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const get = function (field) {
      const idx = colIndex[field];
      return idx === -1 || idx === undefined ? '' : row[idx];
    };
    const name = String(get('Name') || '').trim();
    if (!name) continue; // skip blank rows

    results.push({
      crmId: String(get('StudentID') || '').trim(),
      name: name,
      parentName: String(get('ParentName') || '').trim(),
      mobile: String(get('Mobile') || '').trim(),
      whatsapp: String(get('WhatsApp') || get('Mobile') || '').trim(),
      className: String(get('Class') || '').trim(),
      school: String(get('School') || '').trim(),
      joiningDate: get('JoiningDate') ? fmtDate_(get('JoiningDate')) : '',
      status: String(get('Status') || 'Active').trim()
    });
  }
  return results;
}

/**
 * Syncs new students from the CRM into the local Students sheet.
 * - Students already present (matched by CRM ID, or by name+mobile+class
 *   when the CRM has no ID) are left completely untouched.
 * - Only brand-new students are appended, each with a freshly generated
 *   internal StudentID if the CRM did not supply one.
 * - Attendance history is never touched by this operation.
 */
function syncStudentsFromCrm_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;

  let crmRows;
  try {
    crmRows = readCrm_();
  } catch (e) {
    return fail_(e.message, 'CRM_ERROR');
  }

  const existing = readSheetAsObjects_(SHEET_STUDENTS);
  const existingByCrmId = {};
  const existingByKey = {}; // name|mobile|class fallback key
  existing.forEach(function (s) {
    if (s.CrmRef) existingByCrmId[s.CrmRef] = s;
    existingByKey[(s.Name + '|' + s.Mobile + '|' + s.Class).toLowerCase()] = s;
  });

  let added = 0;
  crmRows.forEach(function (c) {
    const hasCrmId = !!c.crmId;
    const already = hasCrmId ? existingByCrmId[c.crmId]
      : existingByKey[(c.name + '|' + c.mobile + '|' + c.className).toLowerCase()];
    if (already) return; // never overwrite an existing student or their attendance link

    appendRow_(SHEET_STUDENTS, {
      StudentID: newId_('ST'),
      Name: c.name,
      ParentName: c.parentName,
      Mobile: c.mobile,
      WhatsApp: c.whatsapp,
      Class: c.className,
      School: c.school,
      JoiningDate: c.joiningDate,
      Status: c.status || 'Active',
      SyncedAt: nowIso_(),
      CrmRef: c.crmId || ''
    }, COLUMNS.STUDENTS);
    added++;
  });

  return ok_({ added: added, totalCrmRecords: crmRows.length, totalStudents: existing.length + added });
}

function getStudents_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;

  const filters = payload.filters || {};
  let students = readSheetAsObjects_(SHEET_STUDENTS);

  if (filters.search) {
    const q = String(filters.search).toLowerCase();
    students = students.filter(function (s) {
      return [s.Name, s.ParentName, s.Mobile, s.Class, s.School].some(function (v) {
        return String(v || '').toLowerCase().indexOf(q) !== -1;
      });
    });
  }
  if (filters.className) students = students.filter(function (s) { return s.Class === filters.className; });
  if (filters.school) students = students.filter(function (s) { return s.School === filters.school; });
  if (filters.status) students = students.filter(function (s) { return s.Status === filters.status; });

  return ok_(students.map(function (s) {
    return {
      studentId: s.StudentID, name: s.Name, parentName: s.ParentName, mobile: s.Mobile,
      whatsapp: s.WhatsApp, className: s.Class, school: s.School, joiningDate: s.JoiningDate, status: s.Status
    };
  }));
}

function getClassList_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;
  const students = readSheetAsObjects_(SHEET_STUDENTS);
  const classes = Array.from(new Set(students.map(function (s) { return s.Class; }).filter(Boolean))).sort();
  return ok_(classes);
}
