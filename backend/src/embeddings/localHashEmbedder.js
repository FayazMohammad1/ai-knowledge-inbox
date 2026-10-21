import { normalize } from '../services/vectorMath.js';

/**
 * Zero-dependency fallback embedder: feature hashing over unigrams and bigrams.
 *
 * It is LEXICAL, not semantic ("car" and "automobile" are unrelated), but it is
 * deterministic, offline and free, so the whole app (and the test suite) runs without an
 * API key. Use the Gemini provider (or any real embedding model) for real semantic search.
 */
const STOPWORDS = new Set(
  'a an and are as at be by for from has have in is it its of on or that the this to was were will with what which who how why when where do does did i you we they he she'.split(
    ' ',
  ),
);

const fnv1a = (text) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const stem = (token) => (token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token);

const tokenize = (text) =>
  (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOPWORDS.has(t)).map(stem);

export function createLocalHashEmbedder({ dimensions = 512 } = {}) {
  const embedOne = (text) => {
    const tokens = tokenize(text);
    const counts = new Map();
    for (let i = 0; i < tokens.length; i += 1) {
      counts.set(tokens[i], (counts.get(tokens[i]) ?? 0) + 1);
      if (i > 0) {
        const bigram = `${tokens[i - 1]}_${tokens[i]}`;
        counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
      }
    }
    const vector = new Float32Array(dimensions);
    for (const [feature, count] of counts) {
      const hash = fnv1a(feature);
      const sign = hash & 1 ? 1 : -1; // random sign reduces collision bias
      vector[(hash >>> 1) % dimensions] += sign * (1 + Math.log(count));
    }
    return normalize(vector);
  };

  return {
    model: `local-hash-${dimensions}`,
    // Lexical overlap yields small cosines (a clear match is ~0.1-0.4) but unrelated text is ~0.
    defaultMinScore: 0.03,
    async embed(texts) {
      return texts.map(embedOne);
    },
  };
}
