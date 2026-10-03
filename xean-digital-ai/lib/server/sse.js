export function sseHeaders(extra = {}) {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...extra,
  };
}

export function extractSseData(raw) {
  const lines = raw.split(/\r?\n/);
  return lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).filter(Boolean);
}

export function normalizeSsePayload(data) {
  if (data === '[DONE]') return { type: 'done' };
  let json;
  try { json = JSON.parse(data); } catch { return null; }
  if (json?.error) return { type: 'error', error: json.error };

  const token = json?.choices?.[0]?.delta?.content
    ?? json?.delta?.text
    ?? (typeof json?.delta?.content === 'string' ? json.delta.content : '')
    ?? (json?.type === 'content_block_delta' ? json?.delta?.text : '')
    ?? '';

  const usage = json?.usage || json?.xkiro?.usage;
  const finishReason = json?.choices?.[0]?.finish_reason ?? json?.delta?.stop_reason ?? json?.xkiro?.finishReason;
  const id = json?.id ?? json?.xkiro?.id;
  const model = json?.model ?? json?.xkiro?.model;

  if (json?.type === 'message_stop') return { type: 'done', id, model, usage, finishReason };
  if (token) return { type: 'token', content: token, id, model };
  if (usage || finishReason || id || model) return { type: 'meta', id, model, usage, finishReason };
  return null;
}
