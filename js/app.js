/* ============================================================
   ZYXELL AI — app.js
   Entry point: init user session
   ============================================================ */

function enterApp(username) {
  state.user = { username };
  showScreen('app');
  loadSettings();
  state.messages = [];
  state.conversationId = null;
  renderMessages();
  switchView('chat');
  updateSendState();
}

function init() {
  wireEvents();
  const session = Store.get('zyxell_session');
  if (session?.username) enterApp(session.username);
  else showScreen('auth');
}

document.addEventListener('DOMContentLoaded', init);