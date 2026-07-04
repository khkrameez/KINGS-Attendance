/**
 * KINGs Learning Centre – Attendance Management System
 * Config.gs
 *
 * Central configuration. Sheet IDs and other tunables are stored in the
 * "Settings" sheet of THIS spreadsheet (the Attendance spreadsheet) so they
 * can be changed from the Settings screen without redeploying code.
 *
 * On first run, call setup() once from the Apps Script editor
 * (Run > setup) to create all required sheets with headers.
 */

// ---- Fixed constants (safe to hardcode) --------------------------------

// Roles
const ROLE_ADMIN = 'Administrator';
const ROLE_STAFF = 'Staff';

// Attendance statuses
const STATUS_PRESENT = 'Present';
const STATUS_ABSENT = 'Absent';
const STATUS_NA = 'NA';

// Session lifetime (in hours) for a normal login
const SESSION_HOURS_DEFAULT = 10;
// Session lifetime (in days) when "Remember Login" is checked
const SESSION_DAYS_REMEMBER = 30;

// Consecutive absences that trigger an alert
const CONSECUTIVE_ABSENT_THRESHOLD = 3;

// Sheet (tab) names inside THIS spreadsheet
const SHEET_USERS = 'Users';
const SHEET_STUDENTS = 'Students';
const SHEET_ATTENDANCE = 'Attendance';
const SHEET_SETTINGS = 'Settings';
const SHEET_SESSIONS = 'Sessions';

// Column headers for each sheet — single source of truth used everywhere
// so a header can be changed in one place if ever needed.
const COLUMNS = {
  USERS: ['UserID', 'Username', 'PasswordHash', 'Salt', 'Role', 'FullName', 'Email', 'Active', 'CreatedAt'],
  STUDENTS: ['StudentID', 'Name', 'ParentName', 'Mobile', 'WhatsApp', 'Class', 'School', 'JoiningDate', 'Status', 'SyncedAt', 'CrmRef'],
  ATTENDANCE: ['RecordID', 'Date', 'Class', 'StudentID', 'StudentName', 'Status', 'MarkedBy', 'Timestamp'],
  SETTINGS: ['Key', 'Value'],
  SESSIONS: ['Token', 'Username', 'Role', 'FullName', 'CreatedAt', 'ExpiresAt']
};

// Default settings written by setup() if they do not already exist.
// CRM_SHEET_ID and CRM_SHEET_TAB MUST be edited from the Settings screen
// (or here) to point at the real CRM spreadsheet before Sync Students works.
const DEFAULT_SETTINGS = {
  INSTITUTE_NAME: 'KINGs Learning Centre',
  INSTITUTE_LOGO: '',
  ACADEMIC_YEAR: '',
  CRM_SHEET_ID: '1qWVMSuLXcHCQ0156Jv5ZccSIEPN80ARJ0u2RB0CGtVI',
  CRM_SHEET_TAB: 'Students',
  ATTENDANCE_SHEET_ID: '', // filled in automatically by setup() with this spreadsheet's own ID
  THEME: 'blue',
  LOW_ATTENDANCE_THRESHOLD: '75'
};

/** Returns the active spreadsheet that stores all Attendance-system sheets. */
function getDb_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}
