import assert from 'node:assert/strict';
import { normalizeModel } from './lib/model-normalizer.js';
import { normalizeSsePayload } from './lib/server/sse.js';

const model = normalizeModel({
  id: 'qwen/qwen3.8-max:free',
  display_name: 'Qwen3.8 Max',
  owned_by: 'qwen',
  access_tier: 'free',
  context_length: 1000000,
  max_output_tokens: 32768,
  pricing: { currency: 'USD', unit: 'per_1m_tokens', input: 0, output: 0 },
  capabilities: { vision: false, tools: true, reasoning: true, future_flag: true },
  reasoning_efforts: { levels: ['low', 'high'], default: 'high' },
  future_metadata: { hello: 'world' },
}, 'xkiro');

assert.equal(model.provider, 'xkiro');
assert.equal(model.id, 'qwen/qwen3.8-max:free');
assert.equal(model.accessTier, 'free');
assert.equal(model.contextLength, 1000000);
assert.equal(model.capabilities.future_flag, true);
assert.equal(model.metadata.future_metadata.hello, 'world');
assert.deepEqual(model.reasoningEfforts.levels, ['low', 'high']);

assert.deepEqual(normalizeSsePayload('{"choices":[{"delta":{"content":"hello"}}]}'), { type: 'token', content: 'hello', id: undefined, model: undefined });
assert.equal(normalizeSsePayload('[DONE]').type, 'done');
assert.equal(normalizeSsePayload('{"error":{"message":"rate limited"}}').type, 'error');
assert.equal(normalizeSsePayload('{"type":"message_stop"}').type, 'done');

console.log('xKiro unit checks: OK');
