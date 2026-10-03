// Membaca stream SSE internal Xean dari /api/chat. Provider-specific wire format dinormalisasi server-side.
export async function streamChat({ messages, provider, model, modelMeta, signal, onToken, onMeta }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, provider, model, modelMeta }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Permintaan gagal (${res.status}).`;
    try {
      const data = await res.json();
      if (data?.error) message = data.detail ? `${data.error}: ${data.detail}` : data.error;
    } catch {}
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const handleEvent = (raw) => {
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      if (data === '[DONE]') { finished = true; return; }
      let json;
      try { json = JSON.parse(data); } catch { continue; }
      if (json.type === 'error') throw new Error(json.error?.message || 'Galat dari model.');
      if (json.type === 'meta') onMeta?.(json);
      if (json.type === 'token' && json.content) onToken(json.content);
    }
  };

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';
    for (const ev of events) { handleEvent(ev); if (finished) break; }
  }
  if (!finished && buffer.trim()) handleEvent(buffer);
  if (!finished && !signal?.aborted) throw new Error('Stream berakhir sebelum selesai.');
}
