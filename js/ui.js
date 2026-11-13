/* ============================================================
   ZYXELL AI — ui.js
   Navigation, message rendering, composer state, image preview
   ============================================================ */

// ---------- SCREENS / VIEWS ----------
function showScreen(name) {
  $('authScreen').classList.toggle('hidden', name !== 'auth');
  $('appScreen').classList.toggle('hidden', name !== 'app');
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  if (view === 'history') renderHistory();
  if (view === 'bookmarks') renderBookmarks();
  if (view === 'chat' && state.activeStream) {
    hookActiveStream();
    updateSendState();
  }
}

// ---------- MESSAGES ----------
function renderMessages() {
  const box = $('chatMessages');
  if (!state.messages.length) {
    box.innerHTML = renderWelcome();
    bindWelcome();
    return;
  }
  box.innerHTML = '';
  state.messages.forEach(msg => box.appendChild(buildMessageEl(msg)));
  if (state.activeStream && state.activeStream.convId === state.conversationId) {
    hookActiveStream();
  }
  scrollToBottom(true);
}

function renderWelcome() {
  const lang = state.settings.language;
  const sugg = lang === 'en' ? [
    { i: Icons.calculator, t: 'Help me solve a math problem' },
    { i: Icons.flask, t: 'Explain a science concept' },
    { i: Icons.alignLeft, t: 'Summarize study material' },
    { i: Icons.lightbulb, t: 'Generate practice questions' }
  ] : [
    { i: Icons.calculator, t: 'Bantu selesaikan soal matematika' },
    { i: Icons.flask, t: 'Jelaskan konsep sains' },
    { i: Icons.alignLeft, t: 'Rangkum materi pelajaran' },
    { i: Icons.lightbulb, t: 'Buat latihan soal' }
  ];
  const copy = lang === 'en' ? {
    eyebrow: 'ZYXELL AI',
    title: 'Start learning',
    sub: 'Pick a topic to begin, or type your own question below.'
  } : {
    eyebrow: 'ZYXELL AI',
    title: 'Mulai belajar',
    sub: 'Pilih topik untuk memulai, atau ketik pertanyaan Anda sendiri.'
  };
  return `
    <div class="welcome">
      <div class="welcome-eyebrow">${copy.eyebrow}</div>
      <h2>${copy.title}</h2>
      <p>${copy.sub}</p>
      <div class="suggestions">
        ${sugg.map(s => `
          <button class="suggestion" data-prompt="${esc(s.t)}">
            <span class="suggestion-icon">${svg(s.i, 16, 1.7)}</span>
            <span class="suggestion-text">${esc(s.t)}</span>
          </button>
        `).join('')}
      </div>
    </div>`;
}

function bindWelcome() {
  document.querySelectorAll('.suggestion').forEach(btn => {
    btn.onclick = () => {
      haptic();
      $('chatInput').value = btn.dataset.prompt + ': ';
      $('chatInput').focus();
      updateSendState();
    };
  });
}

function buildMessageEl(msg) {
  if (msg.role === 'user') {
    const wrap = el('div', 'message user');
    const body = el('div', 'msg-body');
    const parts = msg.parts || [];
    const textPart = parts.find(p => p.text);
    const imgPart = parts.find(p => p.inline_data || p.inlineData);
    let html = '';
    if (imgPart) {
      const d = imgPart.inline_data || imgPart.inlineData;
      html += `<img src="data:${d.mime_type || d.mimeType};base64,${d.data}" style="max-height:200px;border-radius:6px;margin-bottom:8px;display:block">`;
    }
    if (textPart) html += renderMarkdown(textPart.text);
    body.innerHTML = html;
    wrap.appendChild(body);
    return wrap;
  }

  // Assistant message
  const wrap = el('div', 'message assistant');
  const body = el('div', 'msg-body');
  const content = el('div', 'msg-content');
  const actions = el('div', 'msg-actions');
  const textPart = (msg.parts || []).find(p => p.text);

  if (msg.streaming) {
    content.innerHTML = '<span class="caret"></span>';
  } else if (textPart) {
    content.innerHTML = renderMarkdown(textPart.text);
    if (textPart.text && !textPart.text.startsWith('Error:')) {
      actions.innerHTML = `
        <button class="msg-action" data-a="save">${svg(Icons.bookmark, 12, 1.8)} Simpan</button>
        <button class="msg-action" data-a="copy">${svg(Icons.copy, 12, 1.8)} Copy</button>`;
      actions.querySelector('[data-a="save"]').onclick = () => addBookmark(textPart.text);
      actions.querySelector('[data-a="copy"]').onclick = () => {
        navigator.clipboard?.writeText(textPart.text);
        toast('Tersalin ke clipboard');
        haptic();
      };
    }
  }
  body.appendChild(content);
  body.appendChild(actions);
  wrap.appendChild(body);
  return wrap;
}

function hookActiveStream() {
  const s = state.activeStream;
  if (!s) return;
  const lastEl = document.querySelector('#chatMessages .message.assistant:last-child .msg-content');
  if (lastEl) {
    s.domContent = lastEl;
    if (s.fullText) {
      lastEl.style.whiteSpace = 'pre-wrap';
      lastEl.textContent = s.fullText;
    }
  }
}

function scrollToBottom(force = false) {
  const box = $('chatMessages');
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (force || nearBottom) box.scrollTop = box.scrollHeight;
}

// ---------- IMAGE PREVIEW ----------
function showImagePreview() {
  const box = $('imagePreview');
  if (state.pendingImage) {
    box.innerHTML = `
      <img src="${state.pendingImage.dataUrl}">
      <button class="remove-img" id="clearImg">${svg(Icons.x, 10, 2.5)}</button>`;
    box.classList.remove('hidden');
    $('clearImg').onclick = clearPendingImage;
  } else {
    box.classList.add('hidden');
    box.innerHTML = '';
  }
}

function clearPendingImage() {
  state.pendingImage = null;
  showImagePreview();
  $('imageInput').value = '';
  updateSendState();
}

// ---------- COMPOSER ----------
function updateSendState() {
  const btn = $('sendBtn');
  const ta = $('chatInput');
  const streaming = !!state.activeStream;
  if (streaming) {
    btn.className = 'send-btn streaming';
    btn.innerHTML = svg(Icons.stop, 14, 2);
    btn.disabled = false;
    btn.title = 'Stop';
  } else {
    btn.className = 'send-btn' + ((ta.value.trim() || state.pendingImage) ? ' ready' : '');
    btn.innerHTML = svg(Icons.arrowUp, 16, 2.4);
    btn.disabled = !(ta.value.trim() || state.pendingImage);
    btn.title = 'Kirim';
  }
  const navChat = $('navChat');
  if (navChat) navChat.classList.toggle('streaming', streaming && state.view !== 'chat');
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}