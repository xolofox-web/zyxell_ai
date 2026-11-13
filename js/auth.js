/* ============================================================
   ZYXELL AI — auth.js
   Register / login / logout lokal (localStorage)
   ============================================================ */

async function hashPassword(pw) {
  try {
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  let h = 0;
  for (let i = 0; i < pw.length; i++) { h = ((h << 5) - h) + pw.charCodeAt(i); h |= 0; }
  return 'h' + Math.abs(h);
}

const Auth = {
  async register(u, p) {
    const users = Store.get('zyxell_users', {});
    if (users[u.toLowerCase()]) throw new Error('Username sudah terpakai');
    users[u.toLowerCase()] = { username: u, passHash: await hashPassword(p), createdAt: Date.now() };
    Store.set('zyxell_users', users);
    return users[u.toLowerCase()];
  },
  async login(u, p) {
    const users = Store.get('zyxell_users', {});
    const acc = users[u.toLowerCase()];
    if (!acc) throw new Error('Akun tidak ditemukan');
    if (acc.passHash !== await hashPassword(p)) throw new Error('Password salah');
    return acc;
  },
  logout() {
    Store.del('zyxell_session');
    state.user = null;
    state.messages = [];
    state.conversationId = null;
    state.activeStream = null;
    showScreen('auth');
  }
};