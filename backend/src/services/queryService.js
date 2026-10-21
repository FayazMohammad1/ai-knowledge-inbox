import { extractCitedRefs } from './citations.js';
import { normalize } from './vectorMath.js';

const round = (value, digits) => Number(value.toFixed(digits));

/**
 * RAG query flow: embed question -> top-k similarity search -> grounded prompt -> answer.
 * Returns the answer plus only the retrieved passages cited by the answer.
 */
export function createQueryService({ config, embedder, vectorStore, answerer, logger }) {
  return {
    async answer({ question, topK }, { log = logger } = {}) {
      const k = topK ?? config.retrieval.defaultTopK;
      const timings = {};

      let mark = Date.now();
      const [rawQueryVector] = await embedder.embed([question]);
      timings.embedMs = Date.now() - mark;

      mark = Date.now();
      const hits = vectorStore.search(embedder.model, normalize(rawQueryVector), {
        topK: k,
        minScore: config.retrieval.minScore ?? embedder.defaultMinScore ?? 0,
      });
      timings.searchMs = Date.now() - mark;

      if (hits.length === 0) {
        log.info({ ...timings, hits: 0 }, 'query had no relevant passages');
        return {
          answer: "I couldn't find anything relevant to that in your saved items.",
          sources: [],
          meta: { mode: 'no-context', model: null, retrieved: 0, embeddingModel: embedder.model },
        };
      }

      const relevantHits = hits.slice(0, 3);
      const contexts = relevantHits.map((hit, i) => ({
        ref: i + 1,
        title: hit.title,
        sourceUrl: hit.sourceUrl,
        text: hit.text,
      }));

      mark = Date.now();
      const result = await answerer.answer({ question, contexts });
      timings.llmMs = Date.now() - mark;

      const cited = extractCitedRefs(result.answer, contexts.length);
      const sources = relevantHits.map((hit, i) => ({
          ref: i + 1,
          itemId: hit.itemId,
          chunkId: hit.chunkId,
          title: hit.title,
          sourceType: hit.sourceType,
          sourceUrl: hit.sourceUrl,
          snippet: hit.text,
          score: round(hit.score, 4),
          cited: cited.has(i + 1),
        }));
      log.info(
        { ...timings, hits: hits.length, topScore: round(hits[0].score, 3), cited: sources.length, mode: result.mode },
        'query answered',
      );

      return {
        answer: result.answer,
        sources,
        meta: {
          mode: result.mode,
          model: result.model,
          retrieved: hits.length,
          embeddingModel: embedder.model,
          usage: result.usage ?? null,
        },
      };
    },
  };
}
