/* ============================================================
   ZYXELL AI — events.js
   Wire semua event listener
   ============================================================ */

function wireEvents() {
  // Auth tabs
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t === tab));
      const isReg = tab.dataset.tab === 'register';
      $('authSubmit').textContent = isReg ? 'Buat akun' : 'Lanjutkan';
      $('authTitle').textContent = isReg ? 'Daftar' : 'Masuk';
      $('authSub').textContent = isReg
        ? 'Buat akun untuk memulai pengalaman belajar Anda.'
        : 'Belajar lebih cepat, praktis, dan cerdas.';
      $('authError').textContent = '';
    };
  });

  // Auth submit
  $('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = $('authUsername').value.trim();
    const password = $('authPassword').value;
    const isReg = document.querySelector('.auth-tab.active').dataset.tab === 'register';
    $('authError').textContent = '';
    try {
      let user;
      if (isReg) { user = await Auth.register(username, password); toast('Akun berhasil dibuat'); }
      else { user = await Auth.login(username, password); }
      Store.set('zyxell_session', { username: user.username });
      enterApp(user.username);
    } catch (err) {
      $('authError').textContent = err.message;
    }
  };

  // Logout
  $('logoutBtn').onclick = () => {
    if (state.activeStream) {
      if (!confirm('Ada proses yang berjalan. Keluar sekarang?')) return;
      state.activeStream.abortController?.abort();
    } else if (!confirm('Keluar dari ZYXELL AI?')) return;
    Auth.logout();
    haptic();
  };

  // Theme toggle
  $('themeToggle').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    state.settings.theme = next;
    applyTheme(next);
    Store.set(Store.uk('settings'), state.settings);
    $('settingTheme').value = next;
    haptic();
  };

  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => { switchView(btn.dataset.view); haptic(); };
  });

  // Chat input
  const ta = $('chatInput');
  ta.addEventListener('input', () => { autoResize(ta); updateSendState(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 600) {
      e.preventDefault();
      triggerSend();
    }
  });

  function triggerSend() {
    if (state.activeStream) {
      state.activeStream.abortController?.abort();
      return;
    }
    const text = ta.value.trim();
    const img = state.pendingImage;
    if (!text && !img) return;
    sendMessage(text, img);
    haptic();
  }
  $('sendBtn').onclick = triggerSend;

  // Attach image
  $('attachBtn').onclick = () => $('imageInput').click();
  $('imageInput').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast('Memproses gambar...');
      const c = await compressImage(file);
      state.pendingImage = c;
      showImagePreview();
      updateSendState();
    } catch {
      toast('Gagal memproses gambar');
    }
  };

  // Clear history
  $('clearHistory').onclick = () => {
    if (state.activeStream) { toast('Tunggu proses selesai'); return; }
    if (!confirm('Hapus semua riwayat chat?')) return;
    Store.set(Store.uk('conversations'), []);
    renderHistory();
    toast('Riwayat dihapus');
    haptic();
  };

  // Settings
  $('saveSettings').onclick = saveSettings;
  $('settingFontSize').oninput = (e) => {
    $('fontSizeLabel').textContent = e.target.value + 'px';
    applyFontSize(parseInt(e.target.value));
  };

  // New chat
  $('newChatBtn').onclick = () => {
    if (state.activeStream) toast('Proses tetap berjalan di latar belakang');
    state.messages = [];
    state.conversationId = null;
    switchView('chat');
    renderMessages();
    updateSendState();
    haptic();
  };
}