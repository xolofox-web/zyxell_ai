/* ============================================================
   ZYXELL AI — settings.js
   Load / save user settings, theme, font size
   ============================================================ */

function loadSettings() {
  const s = Store.get(Store.uk('settings'), {});
  state.settings = { ...state.settings, ...s };
  applyTheme(state.settings.theme);
  applyFontSize(state.settings.fontSize);
  $('settingApiKey').value = state.settings.apiKey;
  $('settingModel').value = state.settings.model;
  $('settingSystemPrompt').value = state.settings.systemPrompt;
  $('settingFontSize').value = state.settings.fontSize;
  $('fontSizeLabel').textContent = state.settings.fontSize + 'px';
  $('settingTheme').value = state.settings.theme;
  $('settingLanguage').value = state.settings.language;
}

function saveSettings() {
  state.settings.apiKey = $('settingApiKey').value.trim();
  state.settings.model = $('settingModel').value;
  state.settings.systemPrompt = $('settingSystemPrompt').value.trim() || DEFAULT_SYSTEM_PROMPT;
  state.settings.fontSize = parseInt($('settingFontSize').value);
  state.settings.theme = $('settingTheme').value;
  state.settings.language = $('settingLanguage').value;
  Store.set(Store.uk('settings'), state.settings);
  applyTheme(state.settings.theme);
  applyFontSize(state.settings.fontSize);
  toast('Pengaturan disimpan');
  haptic();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]').setAttribute('content',
    theme === 'dark' ? '#0c0b0a' : '#faf8f5');
}

function applyFontSize(size) {
  document.documentElement.style.setProperty('--fs', size + 'px');
}