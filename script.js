/**
 * script.js — shared utilities used by every page.
 * Load order on every page: style.css, then script.js, then api.js, then the page's own script.
 */

/* =========================================================================
   SESSION
   No app data is ever stored client-side — only the auth token, which is
   required to keep a multi-page (non-SPA) site logged in between pages.
   - Normal login: sessionStorage (cleared when the browser tab closes).
   - "Remember Login" checked: a cookie with a matching expiry, so the
     token survives a full browser restart without using Local Storage.
   ========================================================================= */
const Session = (function () {
  const KEY = 'kings_att_token';

  function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  }
  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }
  function clearCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }

  return {
    save(token, user, remember) {
      sessionStorage.setItem(KEY, token);
      sessionStorage.setItem(KEY + '_user', JSON.stringify(user));
      if (remember) {
        setCookie(KEY, token, 30);
        setCookie(KEY + '_user', JSON.stringify(user), 30);
      }
    },
    getToken() {
      return sessionStorage.getItem(KEY) || getCookie(KEY);
    },
    getUser() {
      const raw = sessionStorage.getItem(KEY + '_user') || getCookie(KEY + '_user');
      try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    clear() {
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(KEY + '_user');
      clearCookie(KEY);
      clearCookie(KEY + '_user');
    }
  };
})();

/* =========================================================================
   TOASTS
   ========================================================================= */
function ensureToastStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}
function toast(message, type) {
  const stack = ensureToastStack();
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';
  el.innerHTML = `<span class="material-icons">${icon}</span><span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 250); }, 3600);
}

/* =========================================================================
   LOADING OVERLAY
   ========================================================================= */
let loadingDepth = 0;
function showLoading(msg) {
  loadingDepth++;
  let overlay = document.querySelector('.loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `<div class="spinner"></div><div class="msg">${escapeHtml(msg || 'Loading...')}</div>`;
    document.body.appendChild(overlay);
  } else {
    overlay.querySelector('.msg').textContent = msg || 'Loading...';
    overlay.classList.remove('hidden');
  }
}
function hideLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1);
  if (loadingDepth === 0) {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }
}

/** Wraps an async action with the loading overlay + centralized error toast. */
async function withLoading(msg, fn) {
  showLoading(msg);
  try {
    return await fn();
  } catch (err) {
    toast(err.message || 'Something went wrong.', 'error');
    throw err;
  } finally {
    hideLoading();
  }
}

/* =========================================================================
   CONFIRM MODAL
   ========================================================================= */
function confirmModal({ title, message, confirmText, danger }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${escapeHtml(title || 'Please confirm')}</h3>
          <button class="modal-close" data-act="cancel"><span class="material-icons">close</span></button></div>
        <div class="modal-body"><p>${escapeHtml(message || '')}</p></div>
        <div class="modal-foot">
          <button class="btn btn-outline" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="confirm">${escapeHtml(confirmText || 'Confirm')}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act && e.target !== backdrop) return;
      const action = act ? act.dataset.act : 'cancel';
      backdrop.remove();
      resolve(action === 'confirm');
    });
  });
}

/* =========================================================================
   FORMATTING HELPERS
   ========================================================================= */
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function thisMonthStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function formatDateNice(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (String(dateStr).length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatMonthNice(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
function statusBadge(status) {
  if (!status) return '<span class="muted">—</span>';
  const cls = status === 'Present' ? 'badge-present' : status === 'Absent' ? 'badge-absent' : 'badge-na';
  return `<span class="badge ${cls}">${status}</span>`;
}
function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/* =========================================================================
   WHATSAPP
   ========================================================================= */
function sanitizePhone(num) {
  let digits = String(num || '').replace(/[^0-9]/g, '');
  if (digits.length === 10) digits = '91' + digits; // default India country code
  return digits;
}
function openWhatsApp(number, message) {
  const digits = sanitizePhone(number);
  if (!digits) { toast('No WhatsApp number on file for this student.', 'warning'); return; }
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}
function buildMonthlySummaryMessage({ instituteName, studentName, className, month, present, absent, percentage }) {
  return `📚 *${instituteName}*\n\nDear Parent,\n\nPlease find your child's attendance summary for *${month}*.\n\n👤 Student : ${studentName}\n🏫 Class : ${className}\n━━━━━━━━━━━━━━━━━━\n✅ Present : ${present} Classes\n❌ Absent : ${absent} Classes\n📊 Attendance : ${percentage}%\n━━━━━━━━━━━━━━━━━━\n\nThank you for your continued support in ensuring your child's regular attendance.\n\nRegards,\n*${instituteName}*`;
}
function buildConsecutiveAbsentMessage({ instituteName }) {
  return `📚 *${instituteName}*\n\nDear Parent,\n\nWe noticed that your child has been absent for the last *3 consecutive classes.*\n\nKindly let us know the reason for the absence.\n\nWe look forward to seeing your child back in class.\n\nThank you.\n\nRegards,\n*${instituteName}*`;
}

/* =========================================================================
   APP SHELL — sidebar / topbar / clock / route guard
   Every authenticated page calls initShell({ page: 'dashboard' }) at load.
   ========================================================================= */
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'space_dashboard', href: 'dashboard.html', roles: ['Administrator', 'Staff'] },
  { key: 'students', label: 'Students', icon: 'groups', href: 'students.html', roles: ['Administrator', 'Staff'] },
  { key: 'attendance', label: 'Attendance', icon: 'fact_check', href: 'attendance.html', roles: ['Administrator', 'Staff'] },
  { key: 'reports', label: 'Reports', icon: 'bar_chart', href: 'reports.html', roles: ['Administrator', 'Staff'] },
  { key: 'settings', label: 'Settings', icon: 'settings', href: 'settings.html', roles: ['Administrator'] }
];

async function initShell(opts) {
  const token = Session.getToken();
  if (!token) { location.href = 'login.html'; return null; }

  let session;
  try {
    session = await Api.validateSession();
  } catch (e) {
    return null; // Api.call already redirects to login on SESSION_EXPIRED
  }

  renderShell(opts.page, session);
  startClock();
  return session;
}

function renderShell(activePage, session) {
  const shellHtml = `
    <div class="sidebar-backdrop"></div>
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="crest-icon">K</div>
        <div class="name">KINGs Learning Centre<small>Attendance System</small></div>
      </div>
      <nav class="nav">
        ${NAV_ITEMS.filter(i => i.roles.includes(session.role)).map(i => `
          <div class="nav-item ${i.key === activePage ? 'active' : ''}" data-href="${i.href}">
            <span class="material-icons">${i.icon}</span><span>${i.label}</span>
          </div>`).join('')}
      </nav>
      <div class="sidebar-foot">
        <div class="sidebar-user">
          <div class="avatar">${initials(session.fullName)}</div>
          <div>
            <div class="u-name">${escapeHtml(session.fullName)}</div>
            <div class="u-role">${escapeHtml(session.role)}</div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm logout-btn" id="logoutBtn"><span class="material-icons">logout</span>Logout</button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="row">
          <button class="menu-toggle" id="menuToggle"><span class="material-icons">menu</span></button>
          <h1>${NAV_ITEMS.find(i => i.key === activePage)?.label || ''}</h1>
        </div>
        <div class="topbar-right">
          <div class="clock"><div class="t" id="clockTime">--:--:--</div><div id="clockDate">--</div></div>
        </div>
      </header>
      <div class="page" id="pageRoot"></div>
    </div>`;
  document.getElementById('appRoot').insertAdjacentHTML('afterbegin', shellHtml);

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => { location.href = el.dataset.href; });
  });
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    const yes = await confirmModal({ title: 'Log out', message: 'Are you sure you want to log out?', confirmText: 'Log out' });
    if (!yes) return;
    try { await Api.logout(); } catch (e) { /* ignore */ }
    Session.clear();
    location.href = 'login.html';
  });
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.querySelector('.sidebar-backdrop');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => { sidebar.classList.add('open'); backdrop.classList.add('show'); });
    backdrop.addEventListener('click', () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); });
  }
}

function startClock() {
  function tick() {
    const now = new Date();
    const timeEl = document.getElementById('clockTime');
    const dateEl = document.getElementById('clockDate');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }
  tick();
  setInterval(tick, 1000);
}

function requireAdmin(session) {
  if (session.role !== 'Administrator') {
    document.getElementById('pageRoot').innerHTML = `
      <div class="empty-state"><span class="material-icons">lock</span><h3>Administrator access required</h3>
      <p>You don't have permission to view this page.</p></div>`;
    return false;
  }
  return true;
}
