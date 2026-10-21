import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VectorStore } from '../src/services/vectorStore.js';
import { normalize } from '../src/services/vectorMath.js';

const entry = (chunkId, vector) => ({ chunkId, itemId: `item-${chunkId}`, text: chunkId, vector: normalize(Float32Array.from(vector)) });

function storeWith(entriesByModel) {
  let loads = 0;
  const repo = { loadAllForModel: (model) => { loads += 1; return entriesByModel[model] ?? []; } };
  return { store: new VectorStore(repo), loads: () => loads };
}

describe('VectorStore', () => {
  const query = normalize(Float32Array.from([1, 0]));

  it('returns the top-k matches best first, without exposing raw vectors', () => {
    const { store } = storeWith({ m: [entry('far', [0, 1]), entry('best', [1, 0.05]), entry('mid', [1, 1])] });
    const hits = store.search('m', query, { topK: 2 });
    assert.deepEqual(hits.map((h) => h.chunkId), ['best', 'mid']);
    assert.ok(hits[0].score > hits[1].score);
    assert.equal('vector' in hits[0], false);
  });

  it('drops matches below minScore', () => {
    const { store } = storeWith({ m: [entry('good', [1, 0]), entry('orthogonal', [0, 1])] });
    assert.deepEqual(store.search('m', query, { topK: 5, minScore: 0.5 }).map((h) => h.chunkId), ['good']);
  });

  it('only searches vectors made by the requested embedding model', () => {
    const { store } = storeWith({ a: [entry('from-a', [1, 0])], b: [entry('from-b', [1, 0])] });
    assert.deepEqual(store.search('b', query, { topK: 5 }).map((h) => h.chunkId), ['from-b']);
  });

  it('caches per model until invalidated', () => {
    const { store, loads } = storeWith({ m: [entry('x', [1, 0])] });
    store.search('m', query, { topK: 1 });
    store.search('m', query, { topK: 1 });
    assert.equal(loads(), 1);
    store.invalidate();
    store.search('m', query, { topK: 1 });
    assert.equal(loads(), 2);
  });
});
