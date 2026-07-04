/**
 * api.js — thin client for the Google Apps Script backend.
 *
 * IMPORTANT: set WEB_APP_URL below to your deployed Apps Script Web App
 * URL (see docs/DEPLOYMENT_GUIDE.md). Everything else in this file works
 * unchanged once that URL is set.
 *
 * Requests are sent as POST with Content-Type: text/plain. This is
 * intentional — it keeps the request a CORS "simple request" so the
 * browser does not send a pre-flight OPTIONS call (Apps Script Web Apps
 * cannot respond to OPTIONS).
 */

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbznccpcAOCO7ab_dTAlWu0tld5x5z3Jf2U2aijK7limtfJTzkSu7eG5ogdssVcYROdp/exec';

const Api = (function () {

  async function call(action, payload) {
    payload = payload || {};
    const token = Session.getToken();
    if (token) payload.token = token;

    let response;
    try {
      response = await fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, payload: payload })
      });
    } catch (networkErr) {
      throw new ApiError('Could not reach the server. Check your internet connection.', 'NETWORK_ERROR');
    }

    let json;
    try {
      json = await response.json();
    } catch (parseErr) {
      throw new ApiError('Unexpected response from the server.', 'PARSE_ERROR');
    }

    if (!json.success) {
      if (json.code === 'SESSION_EXPIRED') {
        Session.clear();
        if (!location.pathname.endsWith('login.html')) {
          location.href = 'login.html?expired=1';
        }
      }
      throw new ApiError(json.error || 'Something went wrong.', json.code || 'ERROR');
    }
    return json.data;
  }

  return {
    // Auth
    login: (username, password, remember) => call('login', { username, password, remember }),
    logout: () => call('logout', {}),
    validateSession: () => call('validateSession', {}),
    changePassword: (payload) => call('changePassword', payload),
    listUsers: () => call('listUsers', {}),
    createUser: (payload) => call('createUser', payload),
    deactivateUser: (userId, active) => call('deactivateUser', { userId, active }),

    // Students / CRM
    syncStudentsFromCrm: () => call('syncStudentsFromCrm', {}),
    getStudents: (filters) => call('getStudents', { filters: filters || {} }),
    getClassList: () => call('getClassList', {}),

    // Attendance
    getStudentsForAttendance: (date, className) => call('getStudentsForAttendance', { date, className }),
    saveAttendance: (date, className, records) => call('saveAttendance', { date, className, records }),
    getAttendanceHistory: (filters) => call('getAttendanceHistory', { filters: filters || {} }),
    updateAttendanceRecord: (recordId, status) => call('updateAttendanceRecord', { recordId, status }),
    deleteAttendanceRecord: (recordId) => call('deleteAttendanceRecord', { recordId }),
    getConsecutiveAbsentStudents: () => call('getConsecutiveAbsentStudents', {}),

    // Reports
    getDashboardStats: () => call('getDashboardStats', {}),
    getDailyReport: (date) => call('getDailyReport', { date }),
    getMonthlyReport: (month) => call('getMonthlyReport', { month }),
    getClassWiseReport: (month, className) => call('getClassWiseReport', { month, className }),
    getStudentWiseReport: (studentId, month) => call('getStudentWiseReport', { studentId, month }),
    getAttendancePercentageReport: (month) => call('getAttendancePercentageReport', { month }),
    getLowAttendanceReport: (month, threshold) => call('getLowAttendanceReport', { month, threshold }),
    getConsecutiveAbsentReport: () => call('getConsecutiveAbsentReport', {}),

    // Settings
    getSettings: () => call('getSettings', {}),
    updateSettings: (settings) => call('updateSettings', { settings })
  };
})();

function ApiError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}
