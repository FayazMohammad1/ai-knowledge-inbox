import { buildContainer } from '../src/container.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { createLocalHashEmbedder } from '../src/embeddings/localHashEmbedder.js';
import { createExtractiveAnswerer } from '../src/llm/extractiveAnswerer.js';

const openApps = new Set();

/** Register once per test file: closes any app a failed test left running, so a failure can never hang the run. */
export async function closeAllTestApps() {
  await Promise.all([...openApps].map((app) => app.close()));
}

/** Boots the real app on an ephemeral port with an in-memory DB and offline providers. */
export async function startTestApp({ overrides = {}, env = {} } = {}) {
  const config = loadConfig({
    DB_PATH: ':memory:',
    LOG_LEVEL: 'silent',
    INGEST_RETRY_BASE_MS: '5',
    RATE_LIMIT_INGEST_PER_MIN: '10000',
    RATE_LIMIT_QUERY_PER_MIN: '10000',
    ...env,
  });
  const logger = createLogger(config);
  const container = buildContainer({
    config,
    logger,
    overrides: {
      embedder: createLocalHashEmbedder(),
      answerer: createExtractiveAnswerer(),
      ...overrides,
    },
  });

  const server = await new Promise((resolve) => {
    const s = container.app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, body) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  };

  let closed = false;
  const app = {
    baseUrl,
    queue: container.queue,
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
    del: (path) => call('DELETE', path),
    /** Ingest and wait for the background job to finish, returning the final item. */
    async ingestAndWait(payload) {
      const created = await call('POST', '/ingest', payload);
      await container.queue.onIdle();
      const { body } = await call('GET', `/items/${created.body.item.id}`);
      return body.item;
    },
    async close() {
      if (closed) return;
      closed = true;
      openApps.delete(app);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      container.close();
    },
  };
  openApps.add(app);
  return app;
}
