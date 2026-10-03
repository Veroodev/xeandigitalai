// Membaca stream SSE dari /api/chat.
// Mendukung format OpenAI (choices[0].delta.content) dan Anthropic (content_block_delta).
export async function streamChat({ messages, model, signal, onToken }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Permintaan gagal (${res.status}).`;
    try {
      const data = await res.json();
      if (data?.error) message = data.detail ? `${data.error}: ${data.detail}` : data.error;
    } catch {
      /* body bukan JSON */
    }
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
      if (data === '[DONE]') {
        finished = true;
        return;
      }
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) {
        throw new Error(typeof json.error === 'string' ? json.error : json.error.message || 'Galat dari model.');
      }
      const token =
        json.choices?.[0]?.delta?.content ??
        (json.type === 'content_block_delta' ? json.delta?.text : '') ??
        '';
      if (token) onToken(token);
    }
  };

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';
    for (const ev of events) {
      handleEvent(ev);
      if (finished) break;
    }
  }
  if (!finished && buffer.trim()) handleEvent(buffer);
}
