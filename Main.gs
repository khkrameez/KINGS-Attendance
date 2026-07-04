/**
 * Main.gs — single HTTP entry point for the whole backend.
 *
 * The frontend (api.js) sends every request as an HTTP POST with a
 * text/plain body containing JSON: { action: "...", payload: {...} }.
 * text/plain is used deliberately (instead of application/json) so the
 * browser treats it as a "simple request" and skips the CORS pre-flight
 * OPTIONS call, which Apps Script Web Apps cannot answer.
 *
 * Deploy this project as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 * See docs/DEPLOYMENT_GUIDE.md for full steps.
 */

// Action name -> handler function. Every handler receives the parsed
// payload object (which always includes "token" once the user is logged in)
// and returns a plain object with { success, data|error }.
const ROUTES = {
  // Auth
  login: login_,
  logout: logout_,
  validateSession: validateSession_,
  changePassword: changePassword_,
  listUsers: listUsers_,
  createUser: createUser_,
  deactivateUser: deactivateUser_,

  // Students / CRM
  syncStudentsFromCrm: syncStudentsFromCrm_,
  getStudents: getStudents_,
  getClassList: getClassList_,

  // Attendance
  getStudentsForAttendance: getStudentsForAttendance_,
  saveAttendance: saveAttendance_,
  getAttendanceHistory: getAttendanceHistory_,
  updateAttendanceRecord: updateAttendanceRecord_,
  deleteAttendanceRecord: deleteAttendanceRecord_,
  getConsecutiveAbsentStudents: getConsecutiveAbsentStudents_,

  // Reports / dashboard
  getDashboardStats: getDashboardStats_,
  getDailyReport: getDailyReport_,
  getMonthlyReport: getMonthlyReport_,
  getClassWiseReport: getClassWiseReport_,
  getStudentWiseReport: getStudentWiseReport_,
  getAttendancePercentageReport: getAttendancePercentageReport_,
  getLowAttendanceReport: getLowAttendanceReport_,
  getConsecutiveAbsentReport: getConsecutiveAbsentReport_,

  // Settings
  getSettings: getSettings_,
  updateSettings: updateSettings_
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;
    const payload = body.payload || {};
    if (body.token) payload.token = body.token; // convenience, also accepted at top level

    const handler = ROUTES[action];
    if (!handler) return jsonOut_(fail_('Unknown action: ' + action, 'UNKNOWN_ACTION'));

    const result = handler(payload);
    return jsonOut_(result);
  } catch (err) {
    return jsonOut_(fail_('Server error: ' + err.message, 'SERVER_ERROR'));
  }
}

// A simple GET is used only as a health check (e.g. visiting the deployed
// URL directly in a browser) — it does not serve the app UI.
function doGet(e) {
  return jsonOut_(ok_({
    status: 'KINGs Learning Centre Attendance API is running.',
    time: new Date().toISOString()
  }));
}
