/* ============================================================
   ZYXELL AI — utils.js
   Storage, conversation store, DOM helpers, toast, markdown
   ============================================================ */

// ---------- STORAGE ----------
const Store = {
  get(k, fb = null) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
    catch { return fb; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.error(e); } },
  del(k) { localStorage.removeItem(k); },
  uk(base) { return `zyxell_${base}_${state.user?.username || 'guest'}`; }
};

// ---------- CONVERSATIONS STORE ----------
const Convs = {
  load() { return Store.get(Store.uk('conversations'), []); },
  save(list) { Store.set(Store.uk('conversations'), list.slice(0, 50)); },
  getById(id) { return this.load().find(c => c.id === id); },
  upsert(conv) {
    const list = this.load();
    const i = list.findIndex(c => c.id === conv.id);
    if (i >= 0) list[i] = conv; else list.unshift(conv);
    this.save(list);
  },
  remove(id) { this.save(this.load().filter(c => c.id !== id)); }
};

// ---------- DOM HELPERS ----------
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const haptic = () => { try { navigator.vibrate?.(6); } catch {} };

// ---------- TOAST ----------
let toastTimer;
function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- MARKDOWN ----------
function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    try { return marked.parse(text); } catch { return esc(text); }
  }
  return esc(text);
}