/* ============================================================
   ZYXELL Admin — admin.js
   Self-contained dashboard: auth, users, API keys, stats
   ============================================================ */

// ---------- STATE ----------
const state = {
  currentAdmin: null,
  page: 'dashboard',
  apikeyStatus: {},   // { username: { status, message, checkedAt } }
  userSearch: '',
  apiKeySearch: '',
  testing: {}
};

// ---------- DOM HELPERS ----------
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---------- STORAGE ----------
const Store = {
  get(k, fb = null) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
    catch { return fb; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { console.error(e); return false; }
  },
  del(k) { localStorage.removeItem(k); },
  keys() { return Object.keys(localStorage).filter(k => k.startsWith('zyxell_')); }
};

// ---------- TOAST ----------
let toastTimer;
function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- CRYPTO (PBKDF2) ----------
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substr(i, 2), 16);
  return out;
}
async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return {
    hash: bytesToHex(new Uint8Array(bits)),
    salt: saltHex || bytesToHex(salt)
  };
}
async function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = await hashPassword(password, storedSalt);
  return hash === storedHash;
}

// ---------- ADMIN AUTH ----------
const AdminStore = {
  all() { return Store.get('zyxell_admins', {}); },
  save(map) { Store.set('zyxell_admins', map); },
  list() {
    const map = this.all();
    return Object.values(map).map(a => ({
      username: a.username, createdAt: a.createdAt
    }));
  },
  session() { return Store.get('zyxell_admin_session', null); },
  setSession(username) { Store.set('zyxell_admin_session', { username, ts: Date.now() }); },
  clearSession() { Store.del('zyxell_admin_session'); }
};

const AdminAuth = {
  async register(username, password) {
    const map = AdminStore.all();
    const key = username.toLowerCase();
    if (map[key]) throw new Error('Username admin sudah terpakai');
    const { hash, salt } = await hashPassword(password);
    map[key] = { username, hash, salt, createdAt: Date.now() };
    AdminStore.save(map);
    return map[key];
  },
  async login(username, password) {
    const map = AdminStore.all();
    const acc = map[username.toLowerCase()];
    if (!acc) throw new Error('Admin tidak ditemukan');
    const ok = await verifyPassword(password, acc.hash, acc.salt);
    if (!ok) throw new Error('Password salah');
    return acc;
  },
  async changePassword(username, oldPassword, newPassword) {
    const map = AdminStore.all();
    const key = username.toLowerCase();
    const acc = map[key];
    if (!acc) throw new Error('Admin tidak ditemukan');
    const ok = await verifyPassword(oldPassword, acc.hash, acc.salt);
    if (!ok) throw new Error('Password lama salah');
    const { hash, salt } = await hashPassword(newPassword);
    acc.hash = hash; acc.salt = salt;
    map[key] = acc;
    AdminStore.save(map);
  },
  delete(username) {
    const map = AdminStore.all();
    const key = username.toLowerCase();
    if (!map[key]) return;
    if (Object.keys(map).length <= 1) throw new Error('Tidak bisa menghapus admin terakhir');
    if (state.currentAdmin && state.currentAdmin.username.toLowerCase() === key) {
      throw new Error('Tidak bisa menghapus akun sendiri');
    }
    delete map[key];
    AdminStore.save(map);
  }
};

// ---------- USER DATA COLLECTORS ----------
function getAllUsers() {
  const users = Store.get('zyxell_users', {});
  return Object.entries(users).map(([key, u]) => ({
    key, username: u.username, createdAt: u.createdAt
  }));
}

function getUserSettings(username) {
  return Store.get(`zyxell_settings_${username}`, {});
}

function getUserConversations(username) {
  return Store.get(`zyxell_conversations_${username}`, []);
}

function getUserBookmarks(username) {
  return Store.get(`zyxell_bookmarks_${username}`, []);
}

function collectStats() {
  const users = getAllUsers();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  let totalConversations = 0;
  let totalMessages = 0;
  let totalBookmarks = 0;
  let usersWithApiKey = 0;
  let newUsersThisWeek = 0;
  let activeUsersThisWeek = 0;

  const activity = new Map();
  const userStats = [];

  users.forEach(u => {
    const convs = getUserConversations(u.username);
    const settings = getUserSettings(u.username);
    const bookmarks = getUserBookmarks(u.username);

    let userMessages = 0;
    let lastActive = null;
    let userConvCount = 0;

    convs.forEach(c => {
      userConvCount++;
      const msgs = c.messages?.length || 0;
      userMessages += msgs;
      if (!lastActive || (c.updatedAt || 0) > lastActive) lastActive = c.updatedAt || 0;

      const d = new Date(c.updatedAt || 0);
      d.setHours(0, 0, 0, 0);
      const dayKey = d.getTime();
      activity.set(dayKey, (activity.get(dayKey) || 0) + msgs);
    });

    totalConversations += userConvCount;
    totalMessages += userMessages;
    totalBookmarks += bookmarks.length;
    if (settings.apiKey) usersWithApiKey++;
    if (u.createdAt > weekAgo) newUsersThisWeek++;
    if (lastActive && lastActive > weekAgo) activeUsersThisWeek++;

    userStats.push({
      username: u.username,
      createdAt: u.createdAt,
      lastActive,
      conversations: userConvCount,
      messages: userMessages,
      bookmarks: bookmarks.length,
      hasApiKey: !!settings.apiKey,
      apiKey: settings.apiKey || '',
      model: settings.model || 'gemini-2.5-flash'
    });
  });

  return {
    totalUsers: users.length,
    totalConversations,
    totalMessages,
    totalBookmarks,
    usersWithApiKey,
    newUsersThisWeek,
    activeUsersThisWeek,
    activity,
    userStats
  };
}

// ---------- API KEY TESTING ----------
async function testApiKey(apiKey) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (res.ok) return { status: 'ok', message: 'Valid' };
    const data = await res.json().catch(() => ({}));
    return { status: 'invalid', message: data.error?.message || `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'error', message: err.message || 'Network error' };
  }
}

function getCachedStatus(username) {
  const cache = Store.get('zyxell_admin_apikey_status', {});
  return cache[username] || null;
}

function setCachedStatus(username, status) {
  const cache = Store.get('zyxell_admin_apikey_status', {});
  cache[username] = status;
  Store.set('zyxell_admin_apikey_status', cache);
}

async function testAndCacheUser(username) {
  const settings = getUserSettings(username);
  if (!settings.apiKey) {
    setCachedStatus(username, { status: 'none', message: 'Belum diisi', checkedAt: Date.now() });
    return { status: 'none', message: 'Belum diisi', checkedAt: Date.now() };
  }
  const result = await testApiKey(settings.apiKey);
  const payload = { ...result, checkedAt: Date.now() };
  setCachedStatus(username, payload);
  return payload;
}

// ---------- FORMATTERS ----------
function maskKey(key) {
  if (!key) return '—';
  if (key.length <= 12) return key.slice(0, 4) + '...';
  return key.slice(0, 8) + '...' + key.slice(-4);
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('id-ID', { dateStyle: 'medium' });
}
function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}
function relTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return min + 'm lalu';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'j lalu';
  const day = Math.floor(hr / 24);
  if (day < 7) return day + 'h lalu';
  return fmtDate(ts);
}

function statusBadge(status) {
  if (!status) return '<span class="badge neutral">Belum dicek</span>';
  if (status.status === 'ok') return '<span class="badge success">Berfungsi</span>';
  if (status.status === 'invalid') return '<span class="badge danger">Tidak valid</span>';
  if (status.status === 'none') return '<span class="badge neutral">Tidak ada</span>';
  return '<span class="badge warning">Error</span>';
}

// ---------- NAVIGATION ----------
function showScreen(name) {
  $('setupScreen').classList.toggle('hidden', name !== 'setup');
  $('loginScreen').classList.toggle('hidden', name !== 'login');
  $('appScreen').classList.toggle('hidden', name !== 'app');
}

function switchPage(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page));

  if (page === 'dashboard') renderDashboard();
  if (page === 'users') renderUsers();
  if (page === 'apikeys') renderApiKeys();
  if (page === 'admins') renderAdmins();
}

// ---------- RENDER: DASHBOARD ----------
function renderDashboard() {
  const s = collectStats();

  // Stat cards
  const cards = [
    { label: 'Total Pengguna', value: s.totalUsers, sub: `+${s.newUsersThisWeek} minggu ini` },
    { label: 'Percakapan', value: s.totalConversations, sub: `${s.activeUsersThisWeek} user aktif` },
    { label: 'Total Pesan', value: s.totalMessages, sub: 'sepanjang waktu' },
    { label: 'API Key Aktif', value: s.usersWithApiKey, sub: `dari ${s.totalUsers} user` }
  ];
  $('statGrid').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value.toLocaleString('id-ID')}</div>
      <div class="stat-sub">${c.sub}</div>
    </div>
  `).join('');

  // Activity chart (last 7 days)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.getTime();
    days.push({
      label: d.toLocaleDateString('id-ID', { weekday: 'short' }),
      date: d,
      count: s.activity.get(key) || 0
    });
  }
  const max = Math.max(1, ...days.map(d => d.count));
  $('activityChart').innerHTML = days.map(d => {
    const pct = (d.count / max) * 100;
    return `
      <div class="chart-bar-wrap">
        <div class="chart-bar" style="height:${Math.max(pct, 2)}%">
          <div class="chart-value">${d.count}</div>
        </div>
        <div class="chart-label">${d.label}</div>
      </div>`;
  }).join('');

  // Top users
  const top = [...s.userStats].sort((a, b) => b.messages - a.messages).slice(0, 8);
  if (!top.length) {
    $('topUsersTable').innerHTML = `
      <div class="empty">
        <p>Belum ada aktivitas pengguna.</p>
      </div>`;
    return;
  }
  $('topUsersTable').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th class="td-num">Percakapan</th>
          <th class="td-num">Pesan</th>
          <th class="td-num">Bookmark</th>
          <th>Terakhir aktif</th>
        </tr>
      </thead>
      <tbody>
        ${top.map(u => `
          <tr>
            <td><strong>${esc(u.username)}</strong></td>
            <td class="td-num">${u.conversations}</td>
            <td class="td-num">${u.messages}</td>
            <td class="td-num">${u.bookmarks}</td>
            <td class="td-muted">${relTime(u.lastActive)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

// ---------- RENDER: USERS ----------
function renderUsers() {
  const stats = collectStats();
  const q = state.userSearch.toLowerCase();
  const filtered = stats.userStats
    .filter(u => !q || u.username.toLowerCase().includes(q))
    .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));

  $('usersCount').textContent = `${filtered.length} dari ${stats.totalUsers} user`;

  if (!filtered.length) {
    $('usersTableWrap').innerHTML = `
      <div class="empty">
        <h3>${q ? 'Tidak ada user cocok' : 'Belum ada user'}</h3>
        <p>${q ? 'Coba kata kunci lain.' : 'User akan muncul di sini setelah mendaftar di aplikasi utama.'}</p>
      </div>`;
    return;
  }

  $('usersTableWrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Terdaftar</th>
          <th>Terakhir aktif</th>
          <th class="td-num">Percakapan</th>
          <th class="td-num">Pesan</th>
          <th>API Key</th>
          <th class="td-actions"></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(u => {
          const status = getCachedStatus(u.username);
          return `
            <tr>
              <td><strong>${esc(u.username)}</strong></td>
              <td class="td-muted">${fmtDate(u.createdAt)}</td>
              <td class="td-muted">${relTime(u.lastActive)}</td>
              <td class="td-num">${u.conversations}</td>
              <td class="td-num">${u.messages}</td>
              <td>${u.hasApiKey ? statusBadge(status) : '<span class="badge neutral">Tidak ada</span>'}</td>
              <td class="td-actions">
                <button class="btn-secondary btn-small" data-test="${esc(u.username)}">Test</button>
                <button class="btn-danger btn-small" data-del-user="${esc(u.username)}">Hapus</button>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  $('usersTableWrap').querySelectorAll('[data-test]').forEach(btn => {
    btn.onclick = async () => {
      const uname = btn.dataset.test;
      btn.disabled = true; btn.textContent = 'Tes...';
      await testAndCacheUser(uname);
      renderUsers();
      toast(`Selesai tes: ${uname}`);
    };
  });
  $('usersTableWrap').querySelectorAll('[data-del-user]').forEach(btn => {
    btn.onclick = () => {
      const uname = btn.dataset.delUser;
      if (!confirm(`Hapus user "${uname}" beserta semua data percakapannya?`)) return;
      deleteUser(uname);
      renderUsers();
      toast(`User "${uname}" dihapus`);
    };
  });
}

function deleteUser(username) {
  const users = Store.get('zyxell_users', {});
  delete users[username.toLowerCase()];
  Store.set('zyxell_users', users);
  Store.del(`zyxell_settings_${username}`);
  Store.del(`zyxell_conversations_${username}`);
  Store.del(`zyxell_bookmarks_${username}`);
  const cache = Store.get('zyxell_admin_apikey_status', {});
  delete cache[username];
  Store.set('zyxell_admin_apikey_status', cache);
}

// ---------- RENDER: API KEYS ----------
function renderApiKeys() {
  const stats = collectStats();
  const q = state.apiKeySearch.toLowerCase();
  const withKeys = stats.userStats
    .filter(u => u.hasApiKey)
    .filter(u => !q || u.username.toLowerCase().includes(q));

  const ok = withKeys.filter(u => getCachedStatus(u.username)?.status === 'ok').length;
  const bad = withKeys.filter(u => getCachedStatus(u.username)?.status === 'invalid').length;
  $('apiKeySummary').textContent = `${withKeys.length} key · ${ok} berfungsi · ${bad} tidak valid`;

  if (!withKeys.length) {
    $('apiKeysTableWrap').innerHTML = `
      <div class="empty">
        <h3>Belum ada API key</h3>
        <p>User perlu mengisi API key di halaman Pengaturan pada aplikasi utama.</p>
      </div>`;
    return;
  }

  $('apiKeysTableWrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>API Key</th>
          <th>Model</th>
          <th>Status</th>
          <th>Terakhir dicek</th>
          <th class="td-actions"></th>
        </tr>
      </thead>
      <tbody>
        ${withKeys.map(u => {
          const s = getCachedStatus(u.username);
          return `
            <tr>
              <td><strong>${esc(u.username)}</strong></td>
              <td class="td-mono">${esc(maskKey(u.apiKey))}</td>
              <td class="td-muted">${esc(u.model)}</td>
              <td>${statusBadge(s)}</td>
              <td class="td-muted">${s ? relTime(s.checkedAt) : '—'}</td>
              <td class="td-actions">
                <button class="btn-secondary btn-small" data-test-key="${esc(u.username)}">Test</button>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  $('apiKeysTableWrap').querySelectorAll('[data-test-key]').forEach(btn => {
    btn.onclick = async () => {
      const uname = btn.dataset.testKey;
      btn.disabled = true; btn.textContent = 'Tes...';
      await testAndCacheUser(uname);
      renderApiKeys();
    };
  });
}

async function testAllApiKeys() {
  const stats = collectStats();
  const targets = stats.userStats.filter(u => u.hasApiKey).map(u => u.username);
  if (!targets.length) { toast('Tidak ada API key untuk dites'); return; }

  const btn = $('testAllBtn');
  btn.disabled = true;
  const original = btn.textContent;

  for (let i = 0; i < targets.length; i++) {
    btn.textContent = `Tes ${i + 1}/${targets.length}...`;
    await testAndCacheUser(targets[i]);
  }

  btn.disabled = false;
  btn.textContent = original;
  renderApiKeys();
  toast(`Selesai tes ${targets.length} key`);
}

// ---------- RENDER: ADMINS ----------
function renderAdmins() {
  const admins = AdminStore.list().sort((a, b) => a.createdAt - b.createdAt);
  const me = state.currentAdmin?.username.toLowerCase();

  $('adminsTableWrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Dibuat</th>
          <th class="td-actions"></th>
        </tr>
      </thead>
      <tbody>
        ${admins.map(a => `
          <tr>
            <td>
              <strong>${esc(a.username)}</strong>
              ${a.username.toLowerCase() === me ? '<span class="badge neutral" style="margin-left:6px">Anda</span>' : ''}
            </td>
            <td class="td-muted">${fmtDateTime(a.createdAt)}</td>
            <td class="td-actions">
              ${a.username.toLowerCase() !== me && admins.length > 1
                ? `<button class="btn-danger btn-small" data-del-admin="${esc(a.username)}">Hapus</button>`
                : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  $('adminsTableWrap').querySelectorAll('[data-del-admin]').forEach(btn => {
    btn.onclick = () => {
      const uname = btn.dataset.delAdmin;
      if (!confirm(`Hapus admin "${uname}"?`)) return;
      try {
        AdminAuth.delete(uname);
        renderAdmins();
        toast('Admin dihapus');
      } catch (err) {
        toast(err.message);
      }
    };
  });
}

// ---------- BACKUP / RESTORE ----------
function exportData() {
  const dump = {};
  Store.keys().forEach(k => {
    dump[k] = Store.get(k);
  });
  // Include current admin session? Skip for security.
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zyxell-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup diunduh');
}

async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (typeof data !== 'object' || !data) throw new Error('Format tidak valid');
    if (!confirm('Import akan MENIMPA semua data yang ada. Lanjutkan?')) return;
    Store.keys().forEach(k => Store.del(k));
    Object.entries(data).forEach(([k, v]) => Store.set(k, v));
    toast('Data diimpor. Silakan login ulang.');
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    toast('Gagal import: ' + err.message);
  }
}

// ---------- DANGER ZONE ----------
function clearAllUsers() {
  if (!confirm('Hapus SEMUA user beserta percakapan, bookmark, dan settings mereka?')) return;
  const users = getAllUsers();
  users.forEach(u => deleteUser(u.username));
  Store.set('zyxell_users', {});
  toast(`${users.length} user dihapus`);
  switchPage('dashboard');
}

function resetAll() {
  const ans = prompt('Ketik "RESET" untuk konfirmasi reset total (semua data termasuk admin akan dihapus):');
  if (ans !== 'RESET') { toast('Dibatalkan'); return; }
  Store.keys().forEach(k => Store.del(k));
  toast('Semua data dihapus');
  setTimeout(() => location.reload(), 800);
}

// ---------- INIT ----------
function init() {
  // Setup or login
  const admins = AdminStore.all();
  if (!Object.keys(admins).length) {
    showScreen('setup');
  } else {
    const session = AdminStore.session();
    if (session) {
      // validate session
      const acc = admins[session.username.toLowerCase()];
      if (acc) {
        enterApp(acc.username);
        return;
      }
    }
    showScreen('login');
  }
}

function enterApp(username) {
  state.currentAdmin = { username };
  $('adminName').textContent = username;
  $('adminAvatar').textContent = username.charAt(0).toUpperCase();
  showScreen('app');
  switchPage('dashboard');
}

// ---------- WIRE EVENTS ----------
function wireEvents() {
  // Setup form
  $('setupForm').onsubmit = async (e) => {
    e.preventDefault();
    const u = $('setupUsername').value.trim();
    const p = $('setupPassword').value;
    const pc = $('setupPasswordConfirm').value;
    $('setupError').textContent = '';
    if (p !== pc) { $('setupError').textContent = 'Konfirmasi password tidak cocok'; return; }
    try {
      await AdminAuth.register(u, p);
      AdminStore.setSession(u);
      toast('Admin pertama dibuat');
      enterApp(u);
    } catch (err) {
      $('setupError').textContent = err.message;
    }
  };

  // Login form
  $('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const u = $('loginUsername').value.trim();
    const p = $('loginPassword').value;
    $('loginError').textContent = '';
    try {
      const acc = await AdminAuth.login(u, p);
      AdminStore.setSession(acc.username);
      enterApp(acc.username);
    } catch (err) {
      $('loginError').textContent = err.message;
    }
  };

  // Logout
  $('logoutBtn').onclick = () => {
    if (!confirm('Logout dari dashboard admin?')) return;
    AdminStore.clearSession();
    state.currentAdmin = null;
    showScreen('login');
    $('loginPassword').value = '';
  };

  // Sidebar nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = () => switchPage(btn.dataset.page);
  });

  // Refresh buttons
  $('refreshDashboard').onclick = renderDashboard;
  $('refreshUsers').onclick = renderUsers;

  // Search
  $('userSearch').oninput = (e) => { state.userSearch = e.target.value; renderUsers(); };
  $('apiKeySearch').oninput = (e) => { state.apiKeySearch = e.target.value; renderApiKeys(); };

  // Test all
  $('testAllBtn').onclick = testAllApiKeys;

  // Add admin
  $('addAdminForm').onsubmit = async (e) => {
    e.preventDefault();
    const u = $('newAdminUsername').value.trim();
    const p = $('newAdminPassword').value;
    $('addAdminError').textContent = '';
    try {
      await AdminAuth.register(u, p);
      $('newAdminUsername').value = '';
      $('newAdminPassword').value = '';
      renderAdmins();
      toast('Admin ditambahkan');
    } catch (err) {
      $('addAdminError').textContent = err.message;
    }
  };

  // Change password
  $('changePasswordForm').onsubmit = async (e) => {
    e.preventDefault();
    const oldP = $('oldPassword').value;
    const newP = $('newPassword').value;
    const confirmP = $('confirmPassword').value;
    $('changePasswordError').textContent = '';
    if (newP !== confirmP) { $('changePasswordError').textContent = 'Konfirmasi tidak cocok'; return; }
    try {
      await AdminAuth.changePassword(state.currentAdmin.username, oldP, newP);
      $('oldPassword').value = '';
      $('newPassword').value = '';
      $('confirmPassword').value = '';
      toast('Password diubah');
    } catch (err) {
      $('changePasswordError').textContent = err.message;
    }
  };

  // Backup
  $('exportBtn').onclick = exportData;
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = (e) => {
    const f = e.target.files?.[0];
    if (f) importData(f);
    e.target.value = '';
  };

  // Danger
  $('clearUsersBtn').onclick = clearAllUsers;
  $('resetAllBtn').onclick = resetAll;
}

document.addEventListener('DOMContentLoaded', () => {
  wireEvents();
  init();
});