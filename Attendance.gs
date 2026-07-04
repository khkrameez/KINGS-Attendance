/**
 * Attendance.gs
 *
 * Attendance formula:
 *   Working Classes = Present + Absent   (NA is excluded entirely)
 *   Attendance %     = Present / (Present + Absent) * 100
 * NA is NEVER counted as Absent and NEVER reduces the percentage.
 */

/** Returns the class roster together with any attendance already saved for that date. */
function getStudentsForAttendance_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;

  const date = payload.date;
  const className = payload.className;
  if (!date || !className) return fail_('Date and class are required.', 'VALIDATION');

  const students = readSheetAsObjects_(SHEET_STUDENTS).filter(function (s) { return s.Class === className; });
  const attendance = readSheetAsObjects_(SHEET_ATTENDANCE).filter(function (a) { return a.Date === date && a.Class === className; });
  const byStudent = {};
  attendance.forEach(function (a) { byStudent[a.StudentID] = a.Status; });

  const roster = students.map(function (s) {
    return { studentId: s.StudentID, name: s.Name, className: s.Class, status: byStudent[s.StudentID] || null };
  });

  return ok_({
    roster: roster,
    alreadySaved: attendance.length > 0
  });
}

/**
 * Saves attendance for a date+class. Creates new records if none exist yet
 * for that date+class (duplicate-safe — a second "save" for the same
 * date+class updates the existing records instead of duplicating rows).
 */
function saveAttendance_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;

  const date = payload.date;
  const className = payload.className;
  const records = payload.records || []; // [{studentId, name, status}]

  if (!date || !className) return fail_('Date and class are required.', 'VALIDATION');
  if (!records.length) return fail_('No students to save.', 'VALIDATION');
  const validStatuses = [STATUS_PRESENT, STATUS_ABSENT, STATUS_NA];
  if (records.some(function (r) { return validStatuses.indexOf(r.status) === -1; })) {
    return fail_('Every student must have a valid status (Present, Absent or NA).', 'VALIDATION');
  }

  const existingAll = readSheetAsObjects_(SHEET_ATTENDANCE);
  const existingForClassDate = existingAll.filter(function (a) { return a.Date === date && a.Class === className; });
  const existingByStudent = {};
  existingForClassDate.forEach(function (a) { existingByStudent[a.StudentID] = a; });

  let created = 0, updated = 0;
  records.forEach(function (r) {
    const existing = existingByStudent[r.studentId];
    if (existing) {
      existing.Status = r.status;
      existing.MarkedBy = auth.session.Username;
      existing.Timestamp = nowIso_();
      updateRow_(SHEET_ATTENDANCE, existing.__row, existing, COLUMNS.ATTENDANCE);
      updated++;
    } else {
      appendRow_(SHEET_ATTENDANCE, {
        RecordID: newId_('A'),
        Date: date,
        Class: className,
        StudentID: r.studentId,
        StudentName: r.name,
        Status: r.status,
        MarkedBy: auth.session.Username,
        Timestamp: nowIso_()
      }, COLUMNS.ATTENDANCE);
      created++;
    }
  });

  const consecutive = computeConsecutiveAbsentees_();

  return ok_({ created: created, updated: updated, consecutiveAbsentCount: consecutive.length });
}

function getAttendanceHistory_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;

  const filters = payload.filters || {};
  let rows = readSheetAsObjects_(SHEET_ATTENDANCE);

  if (filters.date) rows = rows.filter(function (a) { return a.Date === filters.date; });
  if (filters.month) rows = rows.filter(function (a) { return dateInMonth_(a.Date, filters.month); });
  if (filters.className) rows = rows.filter(function (a) { return a.Class === filters.className; });
  if (filters.studentId) rows = rows.filter(function (a) { return a.StudentID === filters.studentId; });

  rows.sort(function (a, b) { return String(b.Date).localeCompare(String(a.Date)); });

  return ok_(rows.map(function (a) {
    return {
      recordId: a.RecordID, date: a.Date, className: a.Class, studentId: a.StudentID,
      studentName: a.StudentName, status: a.Status, markedBy: a.MarkedBy, timestamp: a.Timestamp
    };
  }));
}

function updateAttendanceRecord_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;

  const rows = readSheetAsObjects_(SHEET_ATTENDANCE);
  const record = rows.find(function (a) { return a.RecordID === payload.recordId; });
  if (!record) return fail_('Attendance record not found.', 'NOT_FOUND');

  if ([STATUS_PRESENT, STATUS_ABSENT, STATUS_NA].indexOf(payload.status) === -1) {
    return fail_('Invalid status.', 'VALIDATION');
  }

  record.Status = payload.status;
  record.MarkedBy = auth.session.Username;
  record.Timestamp = nowIso_();
  updateRow_(SHEET_ATTENDANCE, record.__row, record, COLUMNS.ATTENDANCE);
  computeConsecutiveAbsentees_();
  return ok_({ updated: true });
}

function deleteAttendanceRecord_(payload) {
  const auth = requireAdmin_(payload); // staff cannot delete
  if (auth.error) return auth.error;

  const rows = readSheetAsObjects_(SHEET_ATTENDANCE);
  const record = rows.find(function (a) { return a.RecordID === payload.recordId; });
  if (!record) return fail_('Attendance record not found.', 'NOT_FOUND');

  deleteRow_(SHEET_ATTENDANCE, record.__row);
  return ok_({ deleted: true });
}

// ---- Consecutive-absence detection ---------------------------------------

/**
 * A student's "classes" are their own chronological attendance records
 * (Present/Absent only — NA days don't count as a class occurrence at all,
 * consistent with "NA must never be treated as absent").
 * Returns students whose most recent N records (N = threshold) are all Absent.
 */
function computeConsecutiveAbsentees_() {
  const attendance = readSheetAsObjects_(SHEET_ATTENDANCE)
    .filter(function (a) { return a.Status === STATUS_PRESENT || a.Status === STATUS_ABSENT; });

  const byStudent = {};
  attendance.forEach(function (a) {
    if (!byStudent[a.StudentID]) byStudent[a.StudentID] = [];
    byStudent[a.StudentID].push(a);
  });

  const students = readSheetAsObjects_(SHEET_STUDENTS);
  const studentIndex = {};
  students.forEach(function (s) { studentIndex[s.StudentID] = s; });

  const flagged = [];
  Object.keys(byStudent).forEach(function (studentId) {
    const list = byStudent[studentId].sort(function (a, b) { return String(a.Date).localeCompare(String(b.Date)); });
    const lastN = list.slice(-CONSECUTIVE_ABSENT_THRESHOLD);
    if (lastN.length === CONSECUTIVE_ABSENT_THRESHOLD && lastN.every(function (r) { return r.Status === STATUS_ABSENT; })) {
      const s = studentIndex[studentId];
      if (s) {
        flagged.push({
          studentId: studentId,
          name: s.Name,
          className: s.Class,
          parentName: s.ParentName,
          whatsapp: s.WhatsApp,
          lastAbsentDates: lastN.map(function (r) { return r.Date; })
        });
      }
    }
  });
  return flagged;
}

function getConsecutiveAbsentStudents_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;
  return ok_(computeConsecutiveAbsentees_());
}
