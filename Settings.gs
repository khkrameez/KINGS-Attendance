/**
 * Settings.gs — institute-level configuration, readable by any logged-in
 * user, writable by Administrators only.
 */

function getSettings_(payload) {
  const auth = requireAuth_(payload);
  if (auth.error) return auth.error;
  const rows = readSheetAsObjects_(SHEET_SETTINGS);
  const settings = {};
  rows.forEach(function (r) { settings[r.Key] = r.Value; });
  return ok_(settings);
}

function updateSettings_(payload) {
  const auth = requireAdmin_(payload);
  if (auth.error) return auth.error;

  const updates = payload.settings || {};
  const sheet = getDb_().getSheetByName(SHEET_SETTINGS);
  const rows = readSheetAsObjects_(SHEET_SETTINGS);
  const byKey = {};
  rows.forEach(function (r) { byKey[r.Key] = r; });

  Object.keys(updates).forEach(function (key) {
    if (byKey[key]) {
      sheet.getRange(byKey[key].__row, 2).setValue(updates[key]);
    } else {
      sheet.appendRow([key, updates[key]]);
    }
  });

  return ok_({ updated: true });
}
