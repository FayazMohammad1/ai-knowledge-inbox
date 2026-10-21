import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGeminiEmbedder } from '../src/embeddings/geminiEmbedder.js';
import { createGeminiAnswerer } from '../src/llm/geminiAnswerer.js';

const apiError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('createGeminiEmbedder', () => {
  it('returns normalized vectors in input order, batching large inputs', async () => {
    const batches = [];
    const client = {
      models: {
        embedContent: async ({ contents }) => {
          batches.push(contents.length);
          return { embeddings: contents.map(() => ({ values: [3, 4] })) };
        },
      },
    };
    const embedder = createGeminiEmbedder({ client, model: 'test-model' });
    const vectors = await embedder.embed(Array.from({ length: 70 }, (_, i) => `text ${i}`));
    assert.deepEqual(batches, [64, 6]);
    assert.equal(vectors.length, 70);
    assert.ok(Math.abs(vectors[0][0] - 0.6) < 1e-6 && Math.abs(vectors[0][1] - 0.8) < 1e-6);
    assert.equal(embedder.model, 'test-model');
  });

  it('maps provider failures to UpstreamError with sensible retryability', async () => {
    const failing = (status) =>
      createGeminiEmbedder({ client: { models: { embedContent: async () => { throw apiError(status); } } }, model: 'm' });
    await assert.rejects(failing(401).embed(['x']), { code: 'UPSTREAM_ERROR', retryable: false, message: /GEMINI_API_KEY/ });
    await assert.rejects(failing(429).embed(['x']), { status: 503, retryable: true });
    await assert.rejects(failing(500).embed(['x']), { status: 502, retryable: true });
  });
});

describe('createGeminiAnswerer', () => {
  const contexts = [{ ref: 1, title: 'Retry policy', sourceUrl: null, text: 'Retry 3 times.' }];

  it('sends a grounded prompt containing the passages and the question', async () => {
    let request;
    const client = {
      models: {
        generateContent: async (r) => {
          request = r;
          return { text: ' Three times [1]. ', usageMetadata: { totalTokenCount: 42 } };
        },
      },
    };
    const result = await createGeminiAnswerer({ client, model: 'chat-model' }).answer({ question: 'How many retries?', contexts });
    assert.equal(result.answer, 'Three times [1].');
    assert.equal(request.model, 'chat-model');
    assert.match(request.config.systemInstruction, /ONLY the numbered context passages/);
    assert.match(request.contents.parts[0].text, /\[1\] Retry policy/);
    assert.match(request.contents.parts[0].text, /Question: How many retries\?/);
  });

  it('treats an empty completion as an upstream failure', async () => {
    const client = { models: { generateContent: async () => ({ text: '' }) } };
    await assert.rejects(createGeminiAnswerer({ client, model: 'm' }).answer({ question: 'q?', contexts }), { code: 'UPSTREAM_ERROR' });
  });
});
