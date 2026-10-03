import { getConfig as getApmixConfig, authHeaders as apmixAuthHeaders } from '@/lib/server/apmix';

const XKIRO_BASE_URL = (process.env.XKIRO_BASE_URL || 'https://api.xkiro.com/v1').replace(/\/+$/, '');

import { normalizeModel } from '@/lib/model-normalizer';
export { normalizeModel } from '@/lib/model-normalizer';

export function createXKiroProvider() {
  return {
    id: 'xkiro',
    name: 'xKiro',
    async getModels({ signal } = {}) {
      const res = await fetch(`${XKIRO_BASE_URL}/models`, {
        headers: { Accept: 'application/json' },
        signal: signal || AbortSignal.timeout(8000),
        cache: 'no-store',
      });
      if (!res.ok) throw new ProviderHttpError(res.status, await safeProviderDetail(res));
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      return list.map((item) => normalizeModel(item, 'xkiro')).filter(Boolean);
    },
    chatUrl: `${XKIRO_BASE_URL}/chat/completions`,
    authHeaders: () => ({ Authorization: `Bearer ${process.env.XKIRO_API_KEY || ''}` }),
  };
}

export function createApmixProvider() {
  const cfg = getApmixConfig();
  return {
    id: 'apmix',
    name: 'APMIX',
    config: cfg,
    async getModels({ signal } = {}) {
      if (!cfg.key) return [normalizeModel({ id: cfg.defaultModel, display_name: cfg.defaultModel }, 'apmix')].filter(Boolean);
      const res = await fetch(cfg.modelsUrl, {
        headers: apmixAuthHeaders(cfg),
        signal: signal || AbortSignal.timeout(8000),
        cache: 'no-store',
      });
      if (!res.ok) throw new ProviderHttpError(res.status, await safeProviderDetail(res));
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const models = list.map((item) => normalizeModel(item, 'apmix')).filter(Boolean);
      return models.length ? models : [normalizeModel({ id: cfg.defaultModel, display_name: cfg.defaultModel }, 'apmix')].filter(Boolean);
    },
    chatUrl: cfg.chatUrl,
    authHeaders: () => apmixAuthHeaders(cfg),
  };
}

export class ProviderHttpError extends Error {
  constructor(status, detail = '') {
    super(`Provider HTTP ${status}`);
    this.name = 'ProviderHttpError';
    this.status = status;
    this.detail = detail;
  }
}

async function safeProviderDetail(res) {
  try {
    const text = await res.text();
    return text.slice(0, 500);
  } catch {
    return '';
  }
}

export function getProviders() {
  return [createApmixProvider(), createXKiroProvider()];
}

export function getProvider(providerId) {
  return getProviders().find((provider) => provider.id === providerId) || null;
}

export function getDefaultProviderId() {
  return process.env.XKIRO_API_KEY ? 'xkiro' : 'apmix';
}
