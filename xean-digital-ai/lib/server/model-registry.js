import { getProviders, getDefaultProviderId } from '@/lib/server/providers';

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const CACHE_TTL_MS = Number(process.env.MODEL_CACHE_TTL_MS || DEFAULT_TTL_MS);

const globalKey = '__xeanModelRegistry';
const globalState = globalThis[globalKey] || (globalThis[globalKey] = new Map());

function now() { return Date.now(); }

export async function syncProviderModels(providerId, { force = false, signal } = {}) {
  const provider = getProviders().find((item) => item.id === providerId);
  if (!provider) throw new Error(`Provider tidak dikenal: ${providerId}`);

  const cached = globalState.get(providerId);
  if (!force && cached && cached.expiresAt > now()) return { ...cached, cached: true };

  const models = await provider.getModels({ signal });
  const next = {
    provider: providerId,
    models,
    syncedAt: now(),
    expiresAt: now() + CACHE_TTL_MS,
  };
  globalState.set(providerId, next);
  return { ...next, cached: false };
}

export async function getModelRegistry({ providerId, force = false, signal } = {}) {
  const providers = providerId ? [providerId] : getProviders().map((provider) => provider.id);
  const results = [];
  for (const id of providers) {
    try {
      results.push(await syncProviderModels(id, { force, signal }));
    } catch (error) {
      const cached = globalState.get(id);
      results.push({
        provider: id,
        models: cached?.models || [],
        syncedAt: cached?.syncedAt || null,
        expiresAt: cached?.expiresAt || null,
        cached: true,
        error: normalizeRegistryError(error),
      });
    }
  }

  const models = results.flatMap((result) => result.models || []);
  return {
    models,
    providers: results,
    defaultProvider: providerId || getDefaultProviderId(),
    cacheTtlMs: CACHE_TTL_MS,
    syncedAt: now(),
  };
}

export function invalidateModelRegistry(providerId) {
  if (providerId) globalState.delete(providerId);
  else globalState.clear();
}

export function normalizeRegistryError(error) {
  return {
    code: error?.status ? `HTTP_${error.status}` : error?.name || 'PROVIDER_ERROR',
    message: error?.detail || error?.message || 'Provider tidak tersedia.',
  };
}
