import { GoogleGenAI } from '@google/genai';
import { toUpstreamError } from '../errors.js';
import { normalize } from '../services/vectorMath.js';

const BATCH_SIZE = 64;

/** `client` is injectable so tests can pass a fake instead of calling the network. */
export function createGeminiEmbedder({ client, model }) {
  return {
    model,
    defaultMinScore: 0.15,
    async embed(texts) {
      const vectors = [];
      for (let start = 0; start < texts.length; start += BATCH_SIZE) {
        const batch = texts.slice(start, start + BATCH_SIZE);
        try {
          const response = await client.models.embedContent({ model, contents: batch });
          vectors.push(...(response.embeddings ?? []).map((entry) => normalize(Float32Array.from(entry.values))));
        } catch (err) {
          throw toUpstreamError(err, 'Embedding request');
        }
      }
      return vectors;
    },
  };
}

export function buildGeminiClient({ apiKey, timeoutMs }) {
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs } });
}
