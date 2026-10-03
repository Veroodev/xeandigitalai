import { authHeaders, getConfig } from '@/lib/server/apmix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/models -> { models: [{ id }], default, source: 'api' | 'fallback' }
// Jika GET /v1/models gagal, kembalikan model bawaan agar UI tetap bisa dipakai.
export async function GET() {
  const cfg = getConfig();
  const fallback = {
    models: [{ id: cfg.defaultModel }],
    default: cfg.defaultModel,
    source: 'fallback',
  };

  if (!cfg.key) return Response.json(fallback);

  try {
    const res = await fetch(cfg.modelsUrl, {
      headers: authHeaders(cfg),
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 },
    });
    if (!res.ok) return Response.json(fallback);

    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    const ids = [...new Set(list.map((m) => (typeof m === 'string' ? m : m?.id)).filter(Boolean))];
    if (!ids.length) return Response.json(fallback);

    if (!ids.includes(cfg.defaultModel)) ids.unshift(cfg.defaultModel);
    return Response.json({
      models: ids.map((id) => ({ id })),
      default: cfg.defaultModel,
      source: 'api',
    });
  } catch {
    return Response.json(fallback);
  }
}
