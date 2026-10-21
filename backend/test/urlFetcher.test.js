import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import { createUrlFetcher } from '../src/services/urlFetcher.js';
import { extractReadableText } from '../src/services/htmlExtractor.js';
import { isPrivateAddress } from '../src/services/netGuard.js';

const logger = pino({ level: 'silent' });
const ARTICLE = `<!doctype html><html><head><title>Backoff Guide</title><style>.x{}</style></head><body>
  <nav>Home | About | Login</nav>
  <article><h1>Retry with backoff</h1>
  <p>Exponential backoff doubles the delay between attempts so a struggling service gets room to recover.</p>
  <p>Add random jitter to avoid synchronized retries from many clients hitting the same dependency at once.</p>
  <p>Cap the maximum delay and the number of attempts so failures surface instead of hiding forever.</p></article>
  <footer>Copyright</footer><script>alert('x')</script></body></html>`;

let server;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/article') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ARTICLE);
    if (req.url === '/plain') return res.writeHead(200, { 'content-type': 'text/plain' }).end('plain text body');
    if (req.url === '/image') return res.writeHead(200, { 'content-type': 'image/png' }).end('PNG');
    if (req.url === '/missing') return res.writeHead(404).end('nope');
    if (req.url === '/broken') return res.writeHead(503).end('later');
    if (req.url === '/huge') return res.writeHead(200, { 'content-type': 'text/html' }).end('a'.repeat(5000));
    if (req.url === '/loop') return res.writeHead(302, { location: '/loop' }).end();
    if (req.url === '/hop') return res.writeHead(302, { location: '/article' }).end();
    return res.writeHead(500).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const fetcher = (overrides = {}) =>
  createUrlFetcher({ timeoutMs: 2000, maxBytes: 1024 * 1024, maxRedirects: 3, allowPrivateHosts: true, logger, ...overrides });

describe('extractReadableText', () => {
  it('keeps article text and title, drops chrome and scripts', () => {
    const { title, text } = extractReadableText(ARTICLE);
    assert.equal(title, 'Backoff Guide');
    assert.match(text, /Exponential backoff doubles the delay/);
    assert.doesNotMatch(text, /Login|Copyright|alert/);
    assert.match(text, /\n\n/, 'paragraph breaks are preserved for the chunker');
  });
});

describe('urlFetcher', () => {
  it('fetches a page and returns title + readable text', async () => {
    const page = await fetcher().fetchPage(`${base}/article`);
    assert.equal(page.title, 'Backoff Guide');
    assert.match(page.text, /jitter/);
  });

  it('follows redirects and handles plain text', async () => {
    assert.match((await fetcher().fetchPage(`${base}/hop`)).text, /jitter/);
    assert.equal((await fetcher().fetchPage(`${base}/plain`)).text, 'plain text body');
  });

  it('classifies failures as retryable or permanent', async () => {
    await assert.rejects(fetcher().fetchPage(`${base}/missing`), { message: /HTTP 404/, retryable: false });
    await assert.rejects(fetcher().fetchPage(`${base}/broken`), { message: /HTTP 503/, retryable: true });
    await assert.rejects(fetcher().fetchPage(`${base}/image`), { message: /Unsupported content type/, retryable: false });
  });

  it('enforces size and redirect limits', async () => {
    await assert.rejects(fetcher({ maxBytes: 1000 }).fetchPage(`${base}/huge`), { message: /larger than/ });
    await assert.rejects(fetcher().fetchPage(`${base}/loop`), { message: /Too many redirects/ });
  });

  it('rejects non-http protocols', async () => {
    await assert.rejects(fetcher().fetchPage('file:///etc/passwd'), { message: /Only http and https/ });
  });

  describe('SSRF guard (enabled)', () => {
    const guarded = () => fetcher({ allowPrivateHosts: false });

    it('blocks loopback, link-local metadata and private IP literals', async () => {
      for (const url of [`${base}/article`, 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/', 'http://[::1]/']) {
        await assert.rejects(guarded().fetchPage(url), { message: /private or reserved/ }, url);
      }
    });

    it('blocks hostnames that resolve to a private address (checked at connect time)', async () => {
      const port = new URL(base).port;
      await assert.rejects(guarded().fetchPage(`http://localhost:${port}/article`), { message: /private or reserved/ });
    });
  });
});

describe('isPrivateAddress', () => {
  it('flags private/reserved ranges and allows public addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) {
      assert.equal(isPrivateAddress(ip), false, ip);
    }
  });
});
