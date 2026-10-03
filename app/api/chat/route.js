import { authHeaders, getConfig } from '@/lib/server/apmix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

function jsonError(status, error, detail) {
  return Response.json(detail ? { error, detail } : { error }, { status });
}

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return null;
  const clean = input
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
  if (!clean.length || clean[clean.length - 1].role !== 'user') return null;
  const total = clean.reduce((n, m) => n + m.content.length, 0);
  return total > MAX_CHARS ? null : clean;
}

// Jika provider membalas JSON biasa (bukan stream), ubah menjadi SSE agar klien tetap sama.
function jsonToSse(data) {
  const text =
    data?.choices?.[0]?.message?.content ??
    (Array.isArray(data?.content) ? data.content.map((c) => c?.text || '').join('') : '') ??
    '';
  const enc = new TextEncoder();
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(enc.encode(body), { headers: sseHeaders() });
}

function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

export async function POST(req) {
  const cfg = getConfig();
  if (!cfg.key) {
    return jsonError(500, 'APMIX_API_KEY belum diatur di .env.local atau environment hosting.');
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Body permintaan harus berupa JSON.');
  }

  const messages = sanitizeMessages(body?.messages);
  if (!messages) {
    return jsonError(400, 'Daftar pesan tidak valid, kosong, atau terlalu panjang.');
  }

  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : cfg.defaultModel;

  const payload =
    cfg.format === 'anthropic'
      ? { model, system: SYSTEM_PROMPT, messages, max_tokens: 8192, stream: true }
      : { model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages], stream: true };

  let upstream;
  try {
    upstream = await fetch(cfg.chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(cfg) },
      body: JSON.stringify(payload),
      signal: req.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') return new Response(null, { status: 499 });
    return jsonError(502, 'Tidak bisa menghubungi penyedia API.', String(err?.message || err).slice(0, 200));
  }

  if (!upstream.ok) {
    const detail = (await upstream.text().catch(() => '')).slice(0, 300);
    return jsonError(upstream.status, `Penyedia API membalas ${upstream.status}`, detail);
  }

  const type = upstream.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    return jsonToSse(await upstream.json().catch(() => ({})));
  }
  if (!upstream.body) return jsonError(502, 'Penyedia API tidak mengirim stream.');

  return new Response(upstream.body, { headers: sseHeaders() });
}
