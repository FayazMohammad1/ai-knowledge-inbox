import { buildContainer } from './container.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config);

const { app, queue, ingestion, close } = buildContainer({ config, logger });

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, embeddings: config.providers.embeddings, llm: config.providers.llm },
    'AI Knowledge Inbox API listening',
  );
  if (config.providers.llm === 'extractive') {
    logger.warn('GEMINI_API_KEY not set: using local hash embeddings and extractive answers (no LLM)');
  }
  ingestion.recoverUnfinished();
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  server.close();
  // Give in-flight jobs a few seconds; anything unfinished is recovered on next start.
  await Promise.race([queue.onIdle(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
