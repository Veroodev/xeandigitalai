import { getProvider } from '@/lib/server/providers';
import { getModelRegistry } from '@/lib/server/model-registry';
import { friendlyProviderError } from '@/lib/server/provider-errors';
import { extractSseData, normalizeSsePayload, sseHeaders } from '@/lib/server/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SYSTEM_PROMPT = [
  'Kamu adalah asisten AI di aplikasi Xean Digital AI yang membantu pengguna membangun dan memahami hal teknis maupun umum. Balas dalam bahasa yang dipakai pengguna.',
  'Aturan keluaran:',
  '- Gunakan Markdown (tabel, daftar, kutipan, teks tebal/miring) bila membantu keterbacaan.',
  '- Setiap kode atau berkas yang kamu buat harus berada di dalam blok kode berpagar yang menyebut bahasa dan nama berkas, contoh: ```html filename="index.html" atau ```py filename="skrip.py".',
  '- Satu blok kode untuk satu berkas. Untuk halaman web sederhana, berikan satu berkas HTML lengkap (CSS dan JavaScript di dalamnya) kecuali pengguna meminta berkas terpisah.',
  '- Untuk data gunakan json atau csv, untuk dokumen gunakan md atau txt.',
  '- Jangan membungkus seluruh jawaban dalam satu blok kode, dan jelaskan singkat apa yang kamu buat di luar blok kode.',
].join('\n');

const MAX_MESSAGES = 100;
const MAX_CHARS = 400_000;
const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;

function jsonError(status, error, detail) {
  return Response.json(detail ? { error, detail } : { error }, { status });
}

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return null;
  const clean = input
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content)))
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }))
    .filter((m) => typeof m.content === 'string' ? m.content.trim() : m.content.length);
  if (!clean.length || clean[clean.length - 1].role !== 'user') return null;
  const total = clean.reduce((n, m) => n + JSON.stringify(m.content).length, 0);
  return total > MAX_CHARS ? null : clean;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const abort = () => { clearTimeout(timer); reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function fetchWithRetry(url, options) {
  let last;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, options);
      if (!RETRYABLE.has(res.status) || attempt === MAX_RETRIES) return res;
      const retryAfter = Number(res.headers.get('retry-after'));
      await res.body?.cancel().catch(() => {});
      const delay = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1000, 4000) : 500 * 2 ** attempt;
      await sleep(delay, options.signal);
    } catch (error) {
      // Jangan retry network timeout/unknown POST failures: xKiro memperingatkan retry POST stream
      // setelah timeout dapat menjalankan request kedua. Retry dibatasi pada status HTTP di atas.
      last = error;
      throw error;
    }
  }
  throw last || new Error('Provider request failed');
}

function streamNormalized(upstream, providerId, model) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let buffer = '';
  let sawDone = false;

  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          if (buffer.trim()) {
            for (const raw of extractSseData(buffer)) {
              const normalized = normalizeSsePayload(raw);
              if (!normalized) continue;
              if (normalized.type === 'done') sawDone = true;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...normalized, provider: providerId, model })}\n\n`));
            }
          }
          if (!sawDone) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: { message: 'Stream berakhir sebelum terminator diterima.', code: 'incomplete_stream' } })}\n\ndata: [DONE]\n\n`));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        for (const event of events) {
          for (const raw of extractSseData(event)) {
            const normalized = normalizeSsePayload(raw);
            if (!normalized) continue;
            if (normalized.type === 'done') sawDone = true;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...normalized, provider: providerId, model })}\n\n`));
          }
        }
      } catch (error) {
        if (error?.name !== 'AbortError') {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: { message: 'Stream provider gagal.', code: 'stream_error' }, provider: providerId, model })}\n\n`));
        }
        controller.close();
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return jsonError(400, 'Body permintaan harus berupa JSON.'); }

  const providerId = typeof body?.provider === 'string' ? body.provider : 'xkiro';
  const provider = getProvider(providerId);
  if (!provider) return jsonError(400, 'Provider tidak dikenal.');
  if (providerId === 'xkiro' && !process.env.XKIRO_API_KEY) return jsonError(500, 'XKIRO_API_KEY belum dikonfigurasi di environment server.');
  if (providerId === 'apmix' && !provider.config.key) return jsonError(500, 'APMIX_API_KEY belum dikonfigurasi di environment server.');

  const messages = sanitizeMessages(body?.messages);
  if (!messages) return jsonError(400, 'Daftar pesan tidak valid, kosong, atau terlalu panjang.');
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : '';
  if (!model) return jsonError(400, 'Model wajib dipilih.');

  let registry = await getModelRegistry({ providerId: providerId });
  let modelMeta = registry.models.find((item) => item.id === model);
  if (!modelMeta) {
    registry = await getModelRegistry({ providerId: providerId, force: true });
    modelMeta = registry.models.find((item) => item.id === model);
  }
  if (!modelMeta) return jsonError(404, 'Model tidak tersedia di katalog provider.');

  const requestedOptions = body?.options && typeof body.options === 'object' ? body.options : {};
  const capabilities = modelMeta?.capabilities && typeof modelMeta.capabilities === 'object' ? modelMeta.capabilities : {};

  if (requestedOptions.reasoningEffort && !Array.isArray(modelMeta?.reasoningEfforts?.levels)) return jsonError(400, 'Model ini tidak menyediakan reasoning effort yang dapat dipilih.');
  if (requestedOptions.reasoningEffort && !modelMeta.reasoningEfforts.levels.includes(requestedOptions.reasoningEffort)) return jsonError(400, 'Reasoning effort tidak didukung oleh model ini.');

  const safeMaxTokens = Number.isInteger(modelMeta?.maxOutputTokens) && modelMeta.maxOutputTokens > 0
    ? Math.min(Number.isInteger(requestedOptions.maxTokens) ? requestedOptions.maxTokens : modelMeta.maxOutputTokens, modelMeta.maxOutputTokens)
    : Number.isInteger(requestedOptions.maxTokens) ? requestedOptions.maxTokens : undefined;

  const payload = {
    model,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    stream: true,
    ...(safeMaxTokens ? { max_tokens: safeMaxTokens } : {}),
    ...(requestedOptions.reasoningEffort && capabilities.reasoning ? { reasoning_effort: requestedOptions.reasoningEffort } : {}),
  };
  if (capabilities.tools === true && Array.isArray(requestedOptions.tools)) {
    payload.tools = requestedOptions.tools;
    if (requestedOptions.toolChoice !== undefined) payload.tool_choice = requestedOptions.toolChoice;
  }
  if (requestedOptions.webSearch?.enable === true) payload.web_search = requestedOptions.webSearch;

  let upstream;
  try {
    upstream = await fetchWithRetry(provider.chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...provider.authHeaders() },
      body: JSON.stringify(payload),
      signal: req.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') return new Response(null, { status: 499 });
    return jsonError(502, 'Tidak bisa menghubungi penyedia API.');
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    const friendly = friendlyProviderError(upstream.status, detail, provider.name);
    return jsonError(upstream.status, friendly.message, friendly.detail);
  }

  const type = (upstream.headers.get('content-type') || '').toLowerCase();
  if (type.includes('application/json')) {
    const data = await upstream.json().catch(() => ({}));
    const text = data?.choices?.[0]?.message?.content;
    const bodyText = [
      `data: ${JSON.stringify({ type: 'meta', id: data?.id, model: data?.model || model, usage: data?.usage, finishReason: data?.choices?.[0]?.finish_reason, provider: provider.id })}`,
      `data: ${JSON.stringify({ type: 'token', content: typeof text === 'string' ? text : '', provider: provider.id, model })}`,
      'data: [DONE]', '',
    ].join('\n');
    return new Response(new TextEncoder().encode(bodyText), { headers: sseHeaders() });
  }
  if (!upstream.body) return jsonError(502, 'Penyedia API tidak mengirim stream.');

  return new Response(streamNormalized(upstream, provider.id, model), { headers: sseHeaders({ 'X-Xean-Provider': provider.id, 'X-Xean-Model': model }) });
}
