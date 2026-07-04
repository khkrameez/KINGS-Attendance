/**
 * Auth.gs — login, sessions, role checks, user management.
 */

// ---- One-time setup -------------------------------------------------------

/**
 * Run this ONCE from the Apps Script editor (select "setup" then Run).
 * Creates all sheets with headers, default settings, and a first
 * Administrator account (username: admin / password: admin123 — CHANGE IT
 * immediately after first login).
 */
function setup() {
  getOrCreateSheet_(SHEET_USERS, COLUMNS.USERS);
  getOrCreateSheet_(SHEET_STUDENTS, COLUMNS.STUDENTS);
  getOrCreateSheet_(SHEET_ATTENDANCE, COLUMNS.ATTENDANCE);
  getOrCreateSheet_(SHEET_SETTINGS, COLUMNS.SETTINGS);
  getOrCreateSheet_(SHEET_SESSIONS, COLUMNS.SESSIONS);

  // Default settings (only fill keys that don't already exist)
  const existing = readSheetAsObjects_(SHEET_SETTINGS);
  const existingKeys = existing.map(function (r) { return r.Key; });
  const settingsSheet = getDb_().getSheetByName(SHEET_SETTINGS);
  Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
    if (existingKeys.indexOf(key) === -1) {
      const value = key === 'ATTENDANCE_SHEET_ID' ? getDb_().getId() : DEFAULT_SETTINGS[key];
      settingsSheet.appendRow([key, value]);
    }
  });

  // Seed first admin user if Users sheet is empty
  const users = readSheetAsObjects_(SHEET_USERS);
  if (users.length === 0) {
    const salt = Utilities.getUuid();
    appendRow_(SHEET_USERS, {
      UserID: newId_('U'),
      Username: 'admin',
      PasswordHash: hashPassword_('admin123', salt),
      Salt: salt,
      Role: ROLE_ADMIN,
      FullName: 'Administrator',
      Email: '',
      Active: true,
      CreatedAt: nowIso_()
    }, COLUMNS.USERS);
  }

  Logger.log('Setup complete. Default login -> username: admin / password: admin123');
}

// ---- Login / logout / session -------------------------------------------

function login_(payload) {
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  const remember = !!payload.remember;

  if (!username || !password) return fail_('Username and password are required.', 'VALIDATION');

  const users = readSheetAsObjects_(SHEET_USERS);
  const user = users.find(function (u) { return String(u.Username).toLowerCase() === username.toLowerCase(); });

  if (!user) return fail_('Invalid username or password.', 'AUTH');
  if (user.Active === false || String(user.Active).toUpperCase() === 'FALSE') {
    return fail_('This account has been deactivated. Contact the Administrator.', 'AUTH');
  }

  const computed = hashPassword_(password, user.Salt);
  if (computed !== user.PasswordHash) return fail_('Invalid username or password.', 'AUTH');

  const token = newId_('S');
  const created = new Date();
  const expires = new Date(created.getTime() + (remember
    ? SESSION_DAYS_REMEMBER * 24 * 60 * 60 * 1000
    : SESSION_HOURS_DEFAULT * 60 * 60 * 1000));

  appendRow_(SHEET_SESSIONS, {
    Token: token,
    Username: user.Username,
    Role: user.Role,
    FullName: user.FullName,
    CreatedAt: created.toISOString(),
    ExpiresAt: expires.toISOString()
  }, COLUMNS.SESSIONS);

  cleanupExpiredSessions_();

  return ok_({
    token: token,
    username: user.Username,
    fullName: user.FullName,
    role: user.Role,
    expiresAt: expires.toISOString()
  });
}

function logout_(payload) {
  const token = payload.token;
  const sessions = readSheetAsObjects_(SHEET_SESSIONS);
  const match = sessions.find(function (s) { return s.Token === token; });
  if (match) deleteRow_(SHEET_SESSIONS, match.__row);
  return ok_({ loggedOut: true });
}

/** Returns the session object for a valid, non-expired token, or null. */
function getSession_(token) {
  if (!token) return null;
  const sessions = readSheetAsObjects_(SHEET_SESSIONS);
  const match = sessions.find(function (s) { return s.Token === token; });
  if (!match) return null;
  if (new Date(match.ExpiresAt).getTime() < Date.now()) {
    deleteRow_(SHEET_SESSIONS, match.__row);
    return null;
  }
  return match;
}

function validateSession_(payload) {
  const session = getSession_(payload.token);
  if (!session) return fail_('Session expired or invalid. Please log in again.', 'SESSION_EXPIRED');
  return ok_({
    username: session.Username,
    fullName: session.FullName,
    role: session.Role,
    expiresAt: session.ExpiresAt
  });
}

function cleanupExpiredSessions_() {
  const sheet = getDb_().getSheetByName(SHEET_SESSIONS);
  const rows = readSheetAsObjects_(SHEET_SESSIONS);
  const now = Date.now();
  // delete bottom-up so row indices stay valid
  rows.slice().reverse().forEach(function (r) {
    if (new Date(r.ExpiresAt).getTime() < now) sheet.deleteRow(r.__row);
  });
}

// ---- Auth guards used by every other module ------------------------------

/** Throws-free guard: returns {session} or {error: response} */
function requireAuth_(payload) {
  const session = getSession_(payload.token);
  if (!session) return { error: fail_('Session expired or invalid. Please log in again.', 'SESSION_EXPIRED') };
  return { session: session };
}

function requireAdmin_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth;
  if (auth.session.Role !== ROLE_ADMIN) {
    return { error: fail_('This action requires Administrator access.', 'FORBIDDEN') };
  }
  return auth;
}

// ---- User management (Administrator only) --------------------------------

function listUsers_(payload) {
  const auth = requireAdmin_(payload);
  if (auth.error) return auth.error;
  const users = readSheetAsObjects_(SHEET_USERS).map(function (u) {
    return { userId: u.UserID, username: u.Username, role: u.Role, fullName: u.FullName, email: u.Email, active: u.Active };
  });
  return ok_(users);
}

function createUser_(payload) {
  const auth = requireAdmin_(payload);
  if (auth.error) return auth.error;

  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  const role = payload.role === ROLE_ADMIN ? ROLE_ADMIN : ROLE_STAFF;
  const fullName = String(payload.fullName || username);
  const email = String(payload.email || '');

  if (!username || !password) return fail_('Username and password are required.', 'VALIDATION');
  if (password.length < 6) return fail_('Password must be at least 6 characters.', 'VALIDATION');

  const users = readSheetAsObjects_(SHEET_USERS);
  if (users.some(function (u) { return String(u.Username).toLowerCase() === username.toLowerCase(); })) {
    return fail_('That username already exists.', 'DUPLICATE');
  }

  const salt = Utilities.getUuid();
  appendRow_(SHEET_USERS, {
    UserID: newId_('U'),
    Username: username,
    PasswordHash: hashPassword_(password, salt),
    Salt: salt,
    Role: role,
    FullName: fullName,
    Email: email,
    Active: true,
    CreatedAt: nowIso_()
  }, COLUMNS.USERS);

  return ok_({ created: true });
}

function deactivateUser_(payload) {
  const auth = requireAdmin_(payload);
  if (auth.error) return auth.error;

  const users = readSheetAsObjects_(SHEET_USERS);
  const target = users.find(function (u) { return u.UserID === payload.userId; });
  if (!target) return fail_('User not found.', 'NOT_FOUND');

  target.Active = payload.active !== undefined ? !!payload.active : false;
  updateRow_(SHEET_USERS, target.__row, target, COLUMNS.USERS);
  return ok_({ updated: true });
}

function changePassword_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;

  const users = readSheetAsObjects_(SHEET_USERS);
  // Admins may reset any user's password; others may only change their own.
  const targetUsername = (auth.session.Role === ROLE_ADMIN && payload.username) ? payload.username : auth.session.Username;
  const user = users.find(function (u) { return u.Username === targetUsername; });
  if (!user) return fail_('User not found.', 'NOT_FOUND');

  const newPassword = String(payload.newPassword || '');
  if (newPassword.length < 6) return fail_('Password must be at least 6 characters.', 'VALIDATION');

  // Non-admins changing their own password must supply the current password.
  if (auth.session.Role !== ROLE_ADMIN || targetUsername === auth.session.Username) {
    const current = String(payload.currentPassword || '');
    if (hashPassword_(current, user.Salt) !== user.PasswordHash) {
      return fail_('Current password is incorrect.', 'AUTH');
    }
  }

  const salt = Utilities.getUuid();
  user.Salt = salt;
  user.PasswordHash = hashPassword_(newPassword, salt);
  updateRow_(SHEET_USERS, user.__row, user, COLUMNS.USERS);
  return ok_({ changed: true });
}
