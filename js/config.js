/* ============================================================
   ZYXELL AI — config.js
   Konstanta, SVG icons, dan state global
   ============================================================ */

const DEFAULT_SYSTEM_PROMPT = `Kamu adalah ZYXELL AI, asisten belajar yang ramah dan membantu.
Jawab dengan bahasa yang sama dengan bahasa user (default: Bahasa Indonesia).
Untuk soal matematika/sains: tunjukkan langkah penyelesaian yang jelas.
Untuk gambar soal: ekstrak teks soal terlebih dahulu, lalu jawab dengan langkah-langkah.
Gunakan format markdown agar mudah dibaca.
Jika user meminta penjelasan, jelaskan dengan analogi sederhana.`;

// Lucide-inspired icon paths
const Icons = {
  calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="12" y1="16" x2="12" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>',
  flask: '<path d="M9 3h6M10 3v6L4 20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2L14 9V3"/>',
  alignLeft: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>',
  lightbulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12c1 1 1 2 1 3h6c0-1 0-2 1-3a7 7 0 0 0-4-12z"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  arrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'
};

function svg(path, size = 18, sw = 1.8) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

// Global app state
const state = {
  user: null,
  view: 'chat',
  messages: [],
  conversationId: null,
  pendingImage: null,
  activeStream: null,
  settings: {
    apiKey: '', model: 'gemini-2.5-flash',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    fontSize: 15, theme: 'dark', language: 'id'
  }
};