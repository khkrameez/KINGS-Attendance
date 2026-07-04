/**
 * Reports.gs — dashboard stats and all report generators.
 * All percentage math follows: Present / (Present + Absent) * 100, NA excluded.
 */

function pct_(present, absent) {
  const total = present + absent;
  return total === 0 ? 0 : Math.round((present / total) * 1000) / 10; // 1 decimal
}

function getDashboardStats_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;

  const students = readSheetAsObjects_(SHEET_STUDENTS);
  const attendance = readSheetAsObjects_(SHEET_ATTENDANCE);
  const today = fmtDate_(new Date());
  const thisMonth = fmtMonth_(new Date());

  const todayRows = attendance.filter(function (a) { return a.Date === today; });
  const todayPresent = todayRows.filter(function (a) { return a.Status === STATUS_PRESENT; }).length;
  const todayAbsent = todayRows.filter(function (a) { return a.Status === STATUS_ABSENT; }).length;
  const todayNA = todayRows.filter(function (a) { return a.Status === STATUS_NA; }).length;

  const monthRows = attendance.filter(function (a) { return dateInMonth_(a.Date, thisMonth); });
  const monthPresent = monthRows.filter(function (a) { return a.Status === STATUS_PRESENT; }).length;
  const monthAbsent = monthRows.filter(function (a) { return a.Status === STATUS_ABSENT; }).length;

  // Attendance trend: present % per day for the last 14 days that have data
  const byDate = {};
  attendance.forEach(function (a) {
    if (a.Status === STATUS_NA) return;
    byDate[a.Date] = byDate[a.Date] || { present: 0, absent: 0 };
    if (a.Status === STATUS_PRESENT) byDate[a.Date].present++; else byDate[a.Date].absent++;
  });
  const trendDates = Object.keys(byDate).sort().slice(-14);
  const trend = trendDates.map(function (d) {
    return { date: d, percentage: pct_(byDate[d].present, byDate[d].absent) };
  });

  // Class-wise attendance (today)
  const classToday = {};
  todayRows.forEach(function (a) {
    if (a.Status === STATUS_NA) return;
    classToday[a.Class] = classToday[a.Class] || { present: 0, absent: 0 };
    if (a.Status === STATUS_PRESENT) classToday[a.Class].present++; else classToday[a.Class].absent++;
  });
  const classWise = Object.keys(classToday).map(function (c) {
    return { className: c, percentage: pct_(classToday[c].present, classToday[c].absent) };
  });

  // Recent activity (last 10 saved records)
  const recent = attendance.slice().sort(function (a, b) { return String(b.Timestamp).localeCompare(String(a.Timestamp)); }).slice(0, 10)
    .map(function (a) { return { studentName: a.StudentName, className: a.Class, status: a.Status, date: a.Date, timestamp: a.Timestamp, markedBy: a.MarkedBy }; });

  return ok_({
    totalStudents: students.length,
    today: { present: todayPresent, absent: todayAbsent, na: todayNA, percentage: pct_(todayPresent, todayAbsent) },
    month: { percentage: pct_(monthPresent, monthAbsent) },
    trend: trend,
    classWise: classWise,
    recentActivity: recent,
    consecutiveAbsentees: computeConsecutiveAbsentees_(),
    todayDate: today,
    currentTime: new Date().toISOString()
  });
}

function getDailyReport_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;
  const date = payload.date || fmtDate_(new Date());
  const rows = readSheetAsObjects_(SHEET_ATTENDANCE).filter(function (a) { return a.Date === date; });
  return ok_(rows.map(function (a) {
    return { date: a.Date, className: a.Class, studentName: a.StudentName, studentId: a.StudentID, status: a.Status };
  }));
}

function getMonthlyReport_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;
  const month = payload.month; // yyyy-MM
  if (!month) return fail_('Month is required (yyyy-MM).', 'VALIDATION');

  const rows = readSheetAsObjects_(SHEET_ATTENDANCE).filter(function (a) { return dateInMonth_(a.Date, month); });
  const byStudent = {};
  rows.forEach(function (a) {
    byStudent[a.StudentID] = byStudent[a.StudentID] || { name: a.StudentName, className: a.Class, present: 0, absent: 0, na: 0 };
    if (a.Status === STATUS_PRESENT) byStudent[a.StudentID].present++;
    else if (a.Status === STATUS_ABSENT) byStudent[a.StudentID].absent++;
    else byStudent[a.StudentID].na++;
  });

  const report = Object.keys(byStudent).map(function (id) {
    const s = byStudent[id];
    return {
      studentId: id, studentName: s.name, className: s.className,
      present: s.present, absent: s.absent, na: s.na,
      percentage: pct_(s.present, s.absent)
    };
  });
  return ok_(report);
}

function getClassWiseReport_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;
  const month = payload.month;
  const className = payload.className;
  if (!month || !className) return fail_('Month and class are required.', 'VALIDATION');

  const rows = readSheetAsObjects_(SHEET_ATTENDANCE)
    .filter(function (a) { return dateInMonth_(a.Date, month) && a.Class === className; });

  const byStudent = {};
  rows.forEach(function (a) {
    byStudent[a.StudentID] = byStudent[a.StudentID] || { name: a.StudentName, present: 0, absent: 0, na: 0 };
    if (a.Status === STATUS_PRESENT) byStudent[a.StudentID].present++;
    else if (a.Status === STATUS_ABSENT) byStudent[a.StudentID].absent++;
    else byStudent[a.StudentID].na++;
  });

  const report = Object.keys(byStudent).map(function (id) {
    const s = byStudent[id];
    return { studentId: id, studentName: s.name, present: s.present, absent: s.absent, na: s.na, percentage: pct_(s.present, s.absent) };
  });
  return ok_(report);
}

function getStudentWiseReport_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;
  const studentId = payload.studentId;
  const month = payload.month;
  if (!studentId || !month) return fail_('Student and month are required.', 'VALIDATION');

  const student = readSheetAsObjects_(SHEET_STUDENTS).find(function (s) { return s.StudentID === studentId; });
  if (!student) return fail_('Student not found.', 'NOT_FOUND');

  const rows = readSheetAsObjects_(SHEET_ATTENDANCE)
    .filter(function (a) { return a.StudentID === studentId && dateInMonth_(a.Date, month); });

  const present = rows.filter(function (a) { return a.Status === STATUS_PRESENT; }).length;
  const absent = rows.filter(function (a) { return a.Status === STATUS_ABSENT; }).length;
  const na = rows.filter(function (a) { return a.Status === STATUS_NA; }).length;

  return ok_({
    studentId: studentId,
    studentName: student.Name,
    className: student.Class,
    parentName: student.ParentName,
    whatsapp: student.WhatsApp,
    month: month,
    present: present,
    absent: absent,
    na: na, // included in payload for admin UI, but frontend must hide NA in parent-facing views
    percentage: pct_(present, absent),
    records: rows.map(function (a) { return { date: a.Date, status: a.Status }; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); })
  });
}

function getAttendancePercentageReport_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;
  const month = payload.month;
  if (!month) return fail_('Month is required.', 'VALIDATION');
  const monthly = getMonthlyReport_(payload);
  if (!monthly.success) return monthly;
  return ok_(monthly.data.sort(function (a, b) { return b.percentage - a.percentage; }));
}

function getLowAttendanceReport_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;
  const month = payload.month;
  const threshold = Number(payload.threshold || getSetting_('LOW_ATTENDANCE_THRESHOLD') || 75);
  const monthly = getMonthlyReport_(payload);
  if (!monthly.success) return monthly;
  return ok_({
    threshold: threshold,
    students: monthly.data.filter(function (s) { return (s.present + s.absent) > 0 && s.percentage < threshold; })
      .sort(function (a, b) { return a.percentage - b.percentage; })
  });
}

function getConsecutiveAbsentReport_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;
  return ok_(computeConsecutiveAbsentees_());
}
