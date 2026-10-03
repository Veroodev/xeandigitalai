export function friendlyProviderError(status, detail = '', provider = 'provider') {
  const cleanDetail = String(detail || '').replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').slice(0, 240);
  switch (status) {
    case 400: return { message: 'Permintaan tidak valid.', detail: cleanDetail };
    case 401: return { message: 'API key tidak valid atau belum dikonfigurasi.', detail: '' };
    case 403: return { message: 'Akses ke model/provider ditolak.', detail: cleanDetail };
    case 404: return { message: 'Model atau endpoint tidak tersedia.', detail: cleanDetail };
    case 429: return { message: 'Rate limit tercapai. Coba lagi sebentar.', detail: '' };
    case 500: return { message: `${provider} mengalami kesalahan internal.`, detail: cleanDetail };
    case 502:
    case 503:
    case 504: return { message: `${provider} sedang tidak tersedia. Coba lagi nanti.`, detail: '' };
    default: return { message: `Provider membalas ${status}.`, detail: cleanDetail };
  }
}

export function redactSecrets(value) {
  return String(value || '')
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,}]+/gi, '$1[REDACTED]')
    .replace(/(x-api-key\s*[:=]\s*)[^\s,}]+/gi, '$1[REDACTED]')
    .replace(/(sk-[a-z0-9_-]{8,})/gi, '[REDACTED]');
}
