/* ============================================================
   ZYXELL AI — conversations.js
   History list, bookmark list
   ============================================================ */

function loadConversation(convId) {
  if (state.activeStream && state.activeStream.convId === convId) {
    state.messages = state.activeStream.conv.messages;
    state.conversationId = convId;
    renderMessages();
    return;
  }
  const conv = Convs.getById(convId);
  if (!conv) return;
  state.messages = conv.messages.map(m => ({ ...m, streaming: false }));
  state.conversationId = convId;
  renderMessages();
}

function renderHistory() {
  const list = $('historyList');
  const convs = Convs.load();
  if (!convs.length) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${svg(Icons.inbox, 32, 1.5)}</div>
        <h3>Belum ada riwayat</h3>
        <p>Percakapan akan muncul di sini setelah Anda mulai bertanya.</p>
      </div>`;
    return;
  }
  list.innerHTML = '';
  convs.forEach(c => {
    const item = el('div', 'list-item');
    const date = new Date(c.updatedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    const isStreaming = state.activeStream && state.activeStream.convId === c.id;
    item.innerHTML = `
      <div class="list-item-head">
        <div class="list-item-title">${esc(c.title)}</div>
        <div class="list-item-time">${date}</div>
      </div>
      <div class="list-item-meta">${c.messages.length} pesan${isStreaming ? ' &middot; sedang diproses' : ''}</div>
      <div class="list-item-actions">
        <button class="item-btn" data-act="open">Buka</button>
        <button class="item-btn danger" data-act="del">${svg(Icons.trash, 11, 1.8)} Hapus</button>
      </div>`;
    item.querySelector('[data-act="open"]').onclick = (e) => {
      e.stopPropagation();
      loadConversation(c.id);
      switchView('chat');
      haptic();
    };
    item.querySelector('[data-act="del"]').onclick = (e) => {
      e.stopPropagation();
      if (!confirm('Hapus percakapan ini?')) return;
      Convs.remove(c.id);
      if (state.conversationId === c.id) {
        state.messages = [];
        state.conversationId = null;
      }
      renderHistory();
      haptic();
    };
    list.appendChild(item);
  });
}

function addBookmark(text) {
  const list = Store.get(Store.uk('bookmarks'), []);
  if (list.some(b => b.text === text)) { toast('Sudah tersimpan'); return; }
  list.unshift({ id: 'b' + Date.now(), text, createdAt: Date.now() });
  Store.set(Store.uk('bookmarks'), list);
  toast('Tersimpan ke bookmark');
  haptic();
}

function renderBookmarks() {
  const list = $('bookmarksList');
  const items = Store.get(Store.uk('bookmarks'), []);
  if (!items.length) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${svg(Icons.bookmark, 32, 1.5)}</div>
        <h3>Belum ada tersimpan</h3>
        <p>Simpan jawaban penting untuk dibaca kembali kapan saja.</p>
      </div>`;
    return;
  }
  list.innerHTML = '';
  items.forEach(b => {
    const item = el('div', 'list-item');
    const preview = b.text.slice(0, 140).replace(/[#*`>]/g, '').trim();
    const date = new Date(b.createdAt).toLocaleDateString('id-ID', { dateStyle: 'medium' });
    item.innerHTML = `
      <div class="list-item-head">
        <div class="list-item-title">${esc(preview)}${b.text.length > 140 ? '…' : ''}</div>
        <div class="list-item-time">${date}</div>
      </div>
      <div class="list-item-actions">
        <button class="item-btn" data-act="copy">${svg(Icons.copy, 11, 1.8)} Copy</button>
        <button class="item-btn danger" data-act="del">${svg(Icons.trash, 11, 1.8)} Hapus</button>
      </div>`;
    item.querySelector('[data-act="copy"]').onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(b.text);
      toast('Tersalin ke clipboard');
      haptic();
    };
    item.querySelector('[data-act="del"]').onclick = (e) => {
      e.stopPropagation();
      Store.set(Store.uk('bookmarks'), items.filter(x => x.id !== b.id));
      renderBookmarks();
      haptic();
    };
    list.appendChild(item);
  });
}