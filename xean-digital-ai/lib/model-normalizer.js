function normalizeCapability(value) {
  return typeof value === 'boolean' ? value : undefined;
}

export function normalizeModel(raw, provider) {
  const id = typeof raw === 'string' ? raw : raw?.id;
  if (!id || typeof id !== 'string') return null;
  const source = typeof raw === 'object' && raw ? raw : {};
  const capabilities = source.capabilities && typeof source.capabilities === 'object' ? source.capabilities : {};
  const reasoning = source.reasoning_efforts && typeof source.reasoning_efforts === 'object' ? source.reasoning_efforts : null;
  const vendor = source.owned_by || id.split('/')[0] || provider;
  return {
    provider, id,
    name: source.display_name || id,
    displayName: source.display_name || id,
    ownedBy: source.owned_by || null,
    vendor,
    accessTier: source.access_tier || null,
    contextLength: Number.isFinite(source.context_length) ? source.context_length : null,
    maxOutputTokens: Number.isFinite(source.max_output_tokens) ? source.max_output_tokens : null,
    pricing: source.pricing && typeof source.pricing === 'object' ? source.pricing : null,
    capabilities: { vision: normalizeCapability(capabilities.vision), tools: normalizeCapability(capabilities.tools), reasoning: normalizeCapability(capabilities.reasoning), ...capabilities },
    reasoningEfforts: reasoning ? { levels: Array.isArray(reasoning.levels) ? reasoning.levels.filter((x) => typeof x === 'string') : [], default: typeof reasoning.default === 'string' ? reasoning.default : null, ...reasoning } : null,
    modality: source.modality || 'chat',
    metadata: source,
  };
}
