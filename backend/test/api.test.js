import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { UpstreamError } from '../src/errors.js';
import { createUrlFetcher } from '../src/services/urlFetcher.js';
import { closeAllTestApps, startTestApp } from './helpers.js';

after(closeAllTestApps);

const NOTES = {
  retries: 'Our retry policy: failed jobs are retried 3 times with exponential backoff starting at 1 second, then marked failed.',
  pasta: 'Pasta recipe: boil salted water, cook the spaghetti for 9 minutes, then toss with olive oil, garlic and parmesan.',
};

describe('API: ingestion and listing', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());

  it('POST /ingest accepts a note with 202, a Location header and no raw content echo', async () => {
    const res = await app.post('/ingest', { type: 'note', content: NOTES.retries, title: 'Retry policy' });
    assert.equal(res.status, 202);
    assert.equal(res.body.item.status, 'pending');
    assert.equal(res.body.item.title, 'Retry policy');
    assert.equal(res.headers.get('location'), `/items/${res.body.item.id}`);
    assert.equal('rawContent' in res.body.item, false);
    assert.ok(res.headers.get('x-request-id'));
    await app.queue.onIdle();
  });

  it('processes in the background: item becomes ready with chunks, title derived from first line', async () => {
    const item = await app.ingestAndWait({ type: 'note', content: NOTES.pasta });
    assert.equal(item.status, 'ready');
    assert.equal(item.chunkCount, 1);
    assert.match(item.title, /^Pasta recipe/);
    assert.equal(item.rawContent, NOTES.pasta);
  });

  it('GET /items lists newest first with pagination metadata', async () => {
    const res = await app.get('/items?limit=2');
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 2);
    assert.equal(res.body.limit, 2);
    assert.ok(res.body.total >= 2);
    assert.ok(res.body.items[0].createdAt >= res.body.items[1].createdAt);
    assert.equal('rawContent' in res.body.items[0], false);
  });

  it('DELETE /items/:id removes the item and 404s afterwards', async () => {
    const item = await app.ingestAndWait({ type: 'note', content: 'Temporary note to be removed soon.' });
    assert.equal((await app.del(`/items/${item.id}`)).status, 204);
    assert.equal((await app.get(`/items/${item.id}`)).status, 404);
    assert.equal((await app.del(`/items/${item.id}`)).body.error.code, 'NOT_FOUND');
  });
});

describe('API: validation and error shape', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());

  const cases = [
    ['unknown type', { type: 'pdf' }, 'type must be'],
    ['empty note', { type: 'note', content: '   ' }, 'content must not be empty'],
    ['url entered as a note', { type: 'note', content: 'https://example.com/article' }, 'URL tab'],
    ['unreadable note', { type: 'note', content: 'asdfghjkl zxcvbnm' }, 'unreadable'],
    ['oversized note', { type: 'note', content: 'x'.repeat(50_001) }, 'at most 50000'],
    ['non-http url', { type: 'url', url: 'ftp://example.com/file' }, 'http:// or https://'],
    ['garbage url', { type: 'url', url: 'not a url' }, 'http:// or https://'],
    ['missing url', { type: 'url' }, 'url must be a string'],
  ];
  for (const [name, payload, fragment] of cases) {
    it(`POST /ingest rejects ${name} with 400 and a useful message`, async () => {
      const res = await app.post('/ingest', payload);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(JSON.stringify(res.body.error.details).includes(fragment), JSON.stringify(res.body.error));
      assert.ok(res.body.error.requestId);
    });
  }

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const res = await app.post('/ingest', '{"type": "note",');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  it('rejects a too-short question and bad topK on /query', async () => {
    assert.equal((await app.post('/query', { question: 'hi' })).status, 400);
    assert.equal((await app.post('/query', { question: 'a fine question', topK: 99 })).status, 400);
  });

  it('validates ids and pagination on /items', async () => {
    assert.equal((await app.get('/items/123')).status, 400);
    assert.equal((await app.get('/items?limit=1000')).status, 400);
    assert.equal((await app.get('/items/6f1b3c1e-3c53-4b57-9a6b-0f6d1d1a2b3c')).status, 404);
  });

  it('returns 404 with the standard envelope for unknown routes', async () => {
    const res = await app.get('/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
  });
});

describe('API: RAG query', () => {
  let app;
  before(async () => {
    app = await startTestApp();
    await app.ingestAndWait({ type: 'note', content: NOTES.retries, title: 'Retry policy' });
    await app.ingestAndWait({ type: 'note', content: NOTES.pasta, title: 'Pasta' });
  });
  after(() => app.close());

  it('retrieves the relevant note first and returns cited sources', async () => {
    const res = await app.post('/query', { question: 'How many times are failed jobs retried?' });
    assert.equal(res.status, 200);
    assert.equal(res.body.sources[0].title, 'Retry policy');
    assert.equal(res.body.sources[0].ref, 1);
    assert.equal(res.body.sources[0].cited, true);
    assert.match(res.body.sources[0].snippet, /retried 3 times/);
    assert.ok(res.body.sources[0].score > 0);
    assert.match(res.body.answer, /\[1\]/);
    assert.equal(res.body.meta.mode, 'extractive');
  });

  it('answers "nothing relevant" without calling the LLM when no chunk is similar enough', async () => {
    const res = await app.post('/query', { question: 'quantum chromodynamics lagrangian' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sources, []);
    assert.equal(res.body.meta.mode, 'no-context');
  });

  it('uses the embedder default similarity floor, and RETRIEVAL_MIN_SCORE overrides it', async () => {
    const question = 'How many times are failed jobs retried?';
    assert.equal((await app.post('/query', { question })).body.sources.length > 0, true);

    const strict = await startTestApp({ env: { RETRIEVAL_MIN_SCORE: '0.99' } });
    await strict.ingestAndWait({ type: 'note', content: NOTES.retries });
    const res = await strict.post('/query', { question });
    assert.equal(res.body.meta.mode, 'no-context');
    await strict.close();
  });

  it('respects topK', async () => {
    const res = await app.post('/query', { question: 'retry jobs pasta spaghetti', topK: 1 });
    assert.equal(res.body.sources.length, 1);
  });

  it('works on an empty knowledge base', async () => {
    const empty = await startTestApp();
    const res = await empty.post('/query', { question: 'anything saved here?' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sources, []);
    await empty.close();
  });
});

describe('API: upstream failures', () => {
  it('maps an LLM provider failure on /query to 502 UPSTREAM_ERROR without leaking details', async () => {
    const answerer = { mode: 'llm', model: 'm', answer: async () => { throw new UpstreamError('Language model request failed with upstream status 500'); } };
    const app = await startTestApp({ overrides: { answerer } });
    await app.ingestAndWait({ type: 'note', content: NOTES.retries });
    const res = await app.post('/query', { question: 'How many times are failed jobs retried?' });
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'UPSTREAM_ERROR');
    await app.close();
  });

  it('returns 500 with a generic message for unexpected bugs', async () => {
    const answerer = { mode: 'llm', model: 'm', answer: async () => { throw new TypeError('secret internal detail'); } };
    const app = await startTestApp({ overrides: { answerer } });
    await app.ingestAndWait({ type: 'note', content: NOTES.retries });
    const res = await app.post('/query', { question: 'How many times are failed jobs retried?' });
    assert.equal(res.status, 500);
    assert.equal(res.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(res.body), /secret internal detail/);
    await app.close();
  });

  it('retries a flaky embedding provider during ingestion, then succeeds', async () => {
    let calls = 0;
    const embedder = {
      model: 'flaky',
      embed: async (texts) => {
        calls += 1;
        if (calls === 1) throw new UpstreamError('temporary outage', { retryable: true });
        return texts.map(() => Float32Array.from([1, 0]));
      },
    };
    const app = await startTestApp({ overrides: { embedder } });
    const item = await app.ingestAndWait({ type: 'note', content: NOTES.retries });
    assert.equal(item.status, 'ready');
    assert.equal(item.attempts, 2);
    await app.close();
  });

  it('marks an item failed with a readable error when retries are exhausted', async () => {
    const embedder = { model: 'down', embed: async () => { throw new UpstreamError('provider down', { retryable: true }); } };
    const app = await startTestApp({ overrides: { embedder } });
    const item = await app.ingestAndWait({ type: 'note', content: NOTES.retries });
    assert.equal(item.status, 'failed');
    assert.equal(item.error, 'provider down');
    assert.equal(item.attempts, 3);
    await app.close();
  });
});

describe('API: URL ingestion', () => {
  let origin;
  let site;
  before(async () => {
    site = http.createServer((req, res) => {
      if (req.url === '/doc') {
        return res.writeHead(200, { 'content-type': 'text/html' }).end(
          `<html><head><title>Cache Guide</title></head><body><main><p>Use a cache-aside pattern: read from the cache first and fall back to the database on a miss.</p><p>Set a time-to-live so stale entries expire automatically after fifteen minutes.</p></main></body></html>`,
        );
      }
      return res.writeHead(404).end();
    });
    await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${site.address().port}`;
  });
  after(() => site.close());

  it('fetches, extracts and indexes a page server-side, then answers from it', async () => {
    const logger = { debug() {} };
    const urlFetcher = createUrlFetcher({ timeoutMs: 2000, maxBytes: 1 << 20, maxRedirects: 3, allowPrivateHosts: true, logger });
    const app = await startTestApp({ overrides: { urlFetcher } });

    const item = await app.ingestAndWait({ type: 'url', url: `${origin}/doc` });
    assert.equal(item.status, 'ready');
    assert.equal(item.title, 'Cache Guide');
    assert.equal(item.sourceType, 'url');
    assert.equal(item.sourceUrl, `${origin}/doc`);

    const res = await app.post('/query', { question: 'What cache pattern should I use?' });
    assert.equal(res.body.sources[0].sourceUrl, `${origin}/doc`);
    assert.match(res.body.sources[0].snippet, /cache-aside/);
    await app.close();
  });

  it('blocks private-network URLs by default and records why on the item', async () => {
    const app = await startTestApp({ env: { ALLOW_PRIVATE_URLS: 'false' } });
    const item = await app.ingestAndWait({ type: 'url', url: `${origin}/doc` });
    assert.equal(item.status, 'failed');
    assert.match(item.error, /private or reserved/);
    assert.equal(item.attempts, 1, 'permanent errors are not retried');
    await app.close();
  });

  it('records a permanent failure for a 404 page', async () => {
    const urlFetcher = createUrlFetcher({ timeoutMs: 2000, maxBytes: 1 << 20, maxRedirects: 3, allowPrivateHosts: true, logger: { debug() {} } });
    const app = await startTestApp({ overrides: { urlFetcher } });
    const item = await app.ingestAndWait({ type: 'url', url: `${origin}/missing` });
    assert.equal(item.status, 'failed');
    assert.match(item.error, /HTTP 404/);
    await app.close();
  });
});

describe('API: rate limiting and health', () => {
  it('returns 429 in the standard envelope once the limit is exceeded', async () => {
    const app = await startTestApp({ env: { RATE_LIMIT_QUERY_PER_MIN: '2' } });
    await app.post('/query', { question: 'first question' });
    await app.post('/query', { question: 'second question' });
    const res = await app.post('/query', { question: 'third question' });
    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, 'RATE_LIMITED');
    await app.close();
  });

  it('GET /health reports the active providers', async () => {
    const app = await startTestApp();
    const res = await app.get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.answerMode, 'extractive');
    assert.equal(res.body.embeddingModel, 'local-hash-512');
    await app.close();
  });
});
