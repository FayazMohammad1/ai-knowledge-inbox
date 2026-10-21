import { createApp } from './app.js';
import { openDatabase } from './db/index.js';
import { createEmbedder } from './embeddings/index.js';
import { createAnswerer } from './llm/index.js';
import { createJobQueue } from './queue/jobQueue.js';
import { createChunksRepo } from './repositories/chunksRepo.js';
import { createItemsRepo } from './repositories/itemsRepo.js';
import { createIngestionService } from './services/ingestionService.js';
import { createItemsService } from './services/itemsService.js';
import { createQueryService } from './services/queryService.js';
import { createUrlFetcher } from './services/urlFetcher.js';
import { VectorStore } from './services/vectorStore.js';

/**
 * Composition root: the only place that knows which concrete implementation backs each
 * interface. Tests pass `overrides` (fake embedder, stub answerer, ...) instead of mocking modules.
 */
export function buildContainer({ config, logger, overrides = {} }) {
  const db = overrides.db ?? openDatabase(config.dbPath);
  const itemsRepo = createItemsRepo(db);
  const chunksRepo = createChunksRepo(db);
  const vectorStore = new VectorStore(chunksRepo);

  const embedder = overrides.embedder ?? createEmbedder(config);
  const answerer = overrides.answerer ?? createAnswerer(config);
  const urlFetcher =
    overrides.urlFetcher ?? createUrlFetcher({ ...config.urlFetch, logger: logger.child({ component: 'url-fetcher' }) });

  const queue = createJobQueue({
    ...config.ingestion,
    handler: (itemId) => ingestion.process(itemId),
    onFailure: (itemId, err) => ingestion.markFailed(itemId, err),
    logger: logger.child({ component: 'queue' }),
  });

  const ingestion = createIngestionService({
    config,
    db,
    itemsRepo,
    chunksRepo,
    vectorStore,
    embedder,
    urlFetcher,
    enqueue: queue.enqueue,
    logger: logger.child({ component: 'ingestion' }),
  });

  const services = {
    ingestion,
    items: createItemsService({ itemsRepo, vectorStore }),
    query: createQueryService({ config, embedder, vectorStore, answerer, logger: logger.child({ component: 'query' }) }),
  };

  const app = createApp({
    config,
    logger,
    services,
    describeRuntime: () => ({
      embeddingModel: embedder.model,
      answerMode: answerer.mode,
      chatModel: answerer.model,
      queue: queue.stats(),
    }),
  });

  return { app, queue, ingestion, db, close: () => db.close() };
}
