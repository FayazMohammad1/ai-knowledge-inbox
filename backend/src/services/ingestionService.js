import { randomUUID } from 'node:crypto';
import { IngestionError, UpstreamError } from '../errors.js';
import { chunkText } from './chunker.js';

const MIN_TEXT_CHARS = 10;
const MAX_ERROR_CHARS = 300;
const TITLE_CHARS = 60;

/** Title for a note without one: its first line, shortened. */
const deriveTitle = (content) => {
  const firstLine = content.split('\n').find((line) => line.trim()) ?? 'Untitled note';
  return firstLine.length > TITLE_CHARS ? `${firstLine.slice(0, TITLE_CHARS).trimEnd()}…` : firstLine;
};

/**
 * Two phases:
 *   submit()  - synchronous and cheap: validate-already-done, persist a `pending` item,
 *               enqueue it, return immediately (the HTTP layer answers 202).
 *   process() - runs in the background queue: fetch page (URLs) -> chunk -> embed ->
 *               store chunks and flip the item to `ready` in ONE transaction.
 */
export function createIngestionService({
  config,
  db,
  itemsRepo,
  chunksRepo,
  vectorStore,
  embedder,
  urlFetcher,
  enqueue,
  logger,
}) {
  const saveResult = db.transaction((itemId, { title, text, chunks }) => {
    chunksRepo.replaceForItem(itemId, chunks);
    itemsRepo.markReady(itemId, { title, rawContent: text, chunkCount: chunks.length });
  });

  return {
    submit(input) {
      const item =
        input.type === 'note'
          ? itemsRepo.create({
              id: randomUUID(),
              sourceType: 'note',
              title: input.title ?? deriveTitle(input.content),
              rawContent: input.content,
            })
          : itemsRepo.create({
              id: randomUUID(),
              sourceType: 'url',
              title: input.title ?? null,
              sourceUrl: input.url,
            });

      logger.info({ itemId: item.id, sourceType: item.sourceType }, 'item accepted');
      enqueue(item.id);
      return item;
    },

    /** Re-enqueue anything that was pending/processing when the process last stopped. */
    recoverUnfinished() {
      const ids = itemsRepo.listUnfinishedIds();
      ids.forEach(enqueue);
      if (ids.length) logger.info({ count: ids.length }, 're-enqueued unfinished items');
      return ids.length;
    },

    async process(itemId) {
      const item = itemsRepo.getForProcessing(itemId);
      if (!item) return; // deleted while queued

      const startedAt = Date.now();
      itemsRepo.markProcessing(itemId);

      let { title, rawContent: text } = item;
      if (item.sourceType === 'url' && !text) {
        const page = await urlFetcher.fetchPage(item.sourceUrl);
        text = page.text;
        title = item.title ?? page.title ?? new URL(item.sourceUrl).hostname;
      }

      if (!text || text.trim().length < MIN_TEXT_CHARS) {
        throw new IngestionError('No readable text found in this content');
      }

      const chunks = chunkText(text, config.chunking);
      // Prefixing the title gives each chunk document-level context in its embedding.
      const vectors = await embedder.embed(chunks.map((chunk) => `${title}\n\n${chunk.text}`));

      saveResult(itemId, {
        title,
        text,
        chunks: chunks.map((chunk, i) => ({
          id: randomUUID(),
          index: chunk.index,
          text: chunk.text,
          embedding: vectors[i],
          model: embedder.model,
        })),
      });
      vectorStore.invalidate();

      logger.info(
        { itemId, chunks: chunks.length, model: embedder.model, durationMs: Date.now() - startedAt },
        'item ready',
      );
    },

    /** Called by the queue once retries are exhausted (or the error is permanent). */
    markFailed(itemId, err) {
      const known = err instanceof IngestionError || err instanceof UpstreamError;
      const message = known ? err.message : 'Unexpected error while processing (see server logs)';
      itemsRepo.markFailed(itemId, message.slice(0, MAX_ERROR_CHARS));
    },
  };
}
