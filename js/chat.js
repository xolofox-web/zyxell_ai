/* ============================================================
   ZYXELL AI — chat.js
   Image compression, message send, Gemini streaming
   ============================================================ */

async function compressImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob(blob => {
        if (!blob) return reject(new Error('compress fail'));
        const r = new FileReader();
        r.onload = () => {
          const dataUrl = r.result;
          resolve({ mime: 'image/jpeg', data: dataUrl.split(',')[1], dataUrl });
        };
        r.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function sendMessage(text, image = null) {
  if (state.activeStream) return;
  const apiKey = state.settings.apiKey;
  if (!apiKey) {
    toast('Set Gemini API Key di Pengaturan');
    switchView('settings');
    return;
  }
  if (!text && !image) return;

  if (!state.conversationId) state.conversationId = 'c' + Date.now();

  const userParts = [];
  if (text) userParts.push({ text });
  if (image) userParts.push({ inline_data: { mime_type: image.mime, data: image.data } });

  const userMsg = { role: 'user', parts: userParts, ts: Date.now() };
  const assistantMsg = { role: 'model', parts: [{ text: '' }], streaming: true, ts: Date.now() };

  state.messages.push(userMsg, assistantMsg);

  const conv = {
    id: state.conversationId,
    title: state.messages.find(m => m.role === 'user')?.parts?.find(p => p.text)?.text?.slice(0, 60) || 'Chat baru',
    messages: state.messages,
    updatedAt: Date.now()
  };
  Convs.upsert(conv);

  renderMessages();
  scrollToBottom(true);

  clearPendingImage();
  $('chatInput').value = '';
  autoResize($('chatInput'));

  const stream = {
    convId: state.conversationId,
    conv,
    msg: assistantMsg,
    abortController: new AbortController(),
    fullText: '',
    domContent: null
  };
  state.activeStream = stream;
  updateSendState();
  hookActiveStream();

  const persist = () => {
    stream.conv.updatedAt = Date.now();
    Convs.upsert(stream.conv);
  };

  let lastSave = Date.now();
  try {
    const contents = state.messages
      .filter(m => m.role === 'user' || (m.role === 'model' && !m.streaming && m.parts?.[0]?.text))
      .slice(0, -1)
      .map(m => ({ role: m.role, parts: m.parts }));

    const body = { contents };
    if (state.settings.systemPrompt) {
      body.systemInstruction = { parts: [{ text: state.settings.systemPrompt }] };
    }

    const model = state.settings.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: stream.abortController.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = `API Error ${res.status}`;
      try { const j = JSON.parse(errText); msg = j.error?.message || msg; } catch {}
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const parts = j.candidates?.[0]?.content?.parts || [];
          const delta = parts.filter(p => !p.thought).map(p => p.text || '').join('');
          if (!delta) continue;

          stream.fullText += delta;
          assistantMsg.parts[0].text = stream.fullText;

          if (stream.domContent && state.view === 'chat' && state.conversationId === stream.convId) {
            if (stream.fullText.length === delta.length) {
              stream.domContent.innerHTML = '';
              stream.domContent.style.whiteSpace = 'pre-wrap';
            }
            stream.domContent.textContent = stream.fullText;
            scrollToBottom();
          }

          const now = Date.now();
          if (now - lastSave > 3000) { persist(); lastSave = now; }
        } catch {}
      }
    }

    assistantMsg.streaming = false;
    if (!stream.fullText) stream.fullText = '_(Tidak ada respons)_';
    assistantMsg.parts[0].text = stream.fullText;

    if (stream.domContent) {
      stream.domContent.style.whiteSpace = '';
      stream.domContent.innerHTML = renderMarkdown(stream.fullText);
      const actions = stream.domContent.parentElement?.querySelector('.msg-actions');
      if (actions) {
        actions.innerHTML = `
          <button class="msg-action" data-a="save">${svg(Icons.bookmark, 12, 1.8)} Simpan</button>
          <button class="msg-action" data-a="copy">${svg(Icons.copy, 12, 1.8)} Copy</button>`;
        actions.querySelector('[data-a="save"]').onclick = () => addBookmark(stream.fullText);
        actions.querySelector('[data-a="copy"]').onclick = () => {
          navigator.clipboard?.writeText(stream.fullText);
          toast('Tersalin ke clipboard');
          haptic();
        };
      }
    }
    persist();

  } catch (err) {
    assistantMsg.streaming = false;
    if (err.name === 'AbortError') {
      const finalText = stream.fullText || '_(Dihentikan)_';
      assistantMsg.parts[0].text = finalText;
      if (stream.domContent) stream.domContent.innerHTML = renderMarkdown(finalText);
    } else {
      assistantMsg.parts[0].text = `Error: ${err.message}`;
      if (stream.domContent) stream.domContent.innerHTML = renderMarkdown(assistantMsg.parts[0].text);
      toast(err.message.slice(0, 80));
    }
    persist();
  } finally {
    state.activeStream = null;
    updateSendState();
  }
}