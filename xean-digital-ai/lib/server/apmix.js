// Konfigurasi provider. Hanya dipakai di route handler (server), jangan diimpor dari komponen client.
export function getConfig() {
  const base = (process.env.APMIX_BASE_URL || 'https://api.apmix.ai/v1').replace(/\/+$/, '');
  const root = base.replace(/\/v1$/, '');
  const format =
    (process.env.APMIX_API_FORMAT || 'openai').toLowerCase() === 'anthropic' ? 'anthropic' : 'openai';

  return {
    key: process.env.APMIX_API_KEY || '',
    format,
    defaultModel: process.env.APMIX_DEFAULT_MODEL || 'gpt-6-luna-free',
    chatUrl: format === 'anthropic' ? `${root}/v1/messages` : `${base}/chat/completions`,
    modelsUrl: format === 'anthropic' ? `${root}/v1/models` : `${base}/models`,
  };
}

export function authHeaders(cfg) {
  return cfg.format === 'anthropic'
    ? { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }
    : { Authorization: `Bearer ${cfg.key}` };
}
