import { dot } from './vectorMath.js';

/**
 * Brute-force vector search over SQLite-backed chunks, with an in-memory cache.
 *
 * SQLite is the source of truth; the cache (model -> entries) is rebuilt lazily after
 * `invalidate()`. Exact cosine search over a few tens of thousands of chunks takes
 * milliseconds, needs no extra infrastructure and cannot return approximate results.
 * The `search` signature is what an ANN index (sqlite-vec, pgvector, Qdrant) would
 * implement, so swapping it out later touches this file only.
 */
export class VectorStore {
  #chunksRepo;
  #cache = new Map();

  constructor(chunksRepo) {
    this.#chunksRepo = chunksRepo;
  }

  invalidate() {
    this.#cache.clear();
  }

  size(model) {
    return this.#entries(model).length;
  }

  /** @returns {Array<{score:number, ...chunk}>} best matches first, filtered by `minScore`. */
  search(model, queryVector, { topK, minScore = -1 }) {
    const best = [];
    for (const entry of this.#entries(model)) {
      const score = dot(queryVector, entry.vector);
      if (score < minScore) continue;
      if (best.length < topK || score > best[best.length - 1].score) {
        insertSorted(best, { ...entry, score });
        if (best.length > topK) best.pop();
      }
    }
    return best.map(({ vector, ...rest }) => rest);
  }

  #entries(model) {
    if (!this.#cache.has(model)) {
      this.#cache.set(model, this.#chunksRepo.loadAllForModel(model));
    }
    return this.#cache.get(model);
  }
}

function insertSorted(sortedDesc, candidate) {
  let i = sortedDesc.length;
  while (i > 0 && sortedDesc[i - 1].score < candidate.score) i -= 1;
  sortedDesc.splice(i, 0, candidate);
}
