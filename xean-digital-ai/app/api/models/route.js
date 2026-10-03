import { getModelRegistry, invalidateModelRegistry } from '@/lib/server/model-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const provider = url.searchParams.get('provider') || undefined;
  const force = url.searchParams.get('refresh') === '1';

  if (force) invalidateModelRegistry(provider);
  const registry = await getModelRegistry({ providerId: provider, force });

  return Response.json({
    models: registry.models,
    providers: registry.providers.map(({ provider: id, models, syncedAt, expiresAt, cached, error }) => ({
      id,
      count: models.length,
      syncedAt,
      expiresAt,
      cached,
      status: error && !models.length ? 'offline' : 'online',
      error: error ? { code: error.code, message: error.message } : null,
    })),
    defaultProvider: registry.defaultProvider,
    cacheTtlMs: registry.cacheTtlMs,
    source: 'live-catalog',
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
