import dns from 'node:dns';
import { Agent, fetch } from 'undici';
import { IngestionError } from '../errors.js';
import { extractReadableText } from './htmlExtractor.js';
import { BlockedAddressError, isPrivateAddress } from './netGuard.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TEXT_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain)/i;

/**
 * Server-side page fetcher with the protections a user-supplied URL needs:
 *   - http(s) only, every redirect hop re-validated (redirects are followed manually)
 *   - SSRF guard: the DNS result is checked at connect time (so DNS rebinding cannot
 *     swap in a private IP after validation), and IP-literal hosts are checked up front
 *   - hard timeout and response-size cap (the body is streamed and aborted)
 *   - HTML/plain-text only
 * Failures are IngestionErrors flagged retryable (transient) or permanent.
 */
export function createUrlFetcher({ timeoutMs, maxBytes, maxRedirects, allowPrivateHosts, logger }) {
  const guardedLookup = (hostname, options, callback) => {
    dns.lookup(hostname, options, (err, address, family) => {
      if (err) return callback(err);
      const addresses = Array.isArray(address) ? address.map((a) => a.address) : [address];
      const blocked = addresses.find(isPrivateAddress);
      if (blocked) return callback(new BlockedAddressError(blocked));
      return callback(null, address, family);
    });
  };

  const dispatcher = allowPrivateHosts
    ? new Agent()
    : new Agent({ connect: { lookup: guardedLookup } });

  async function fetchPage(rawUrl) {
    let current = rawUrl;

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const url = parseHttpUrl(current);
      const response = await request(url);

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new IngestionError('Redirect response had no Location header');
        current = new URL(location, url).toString();
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new IngestionError(`Page responded with HTTP ${response.status}`, {
          retryable: response.status >= 500 || response.status === 429,
        });
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!TEXT_TYPES.test(contentType)) {
        await response.body?.cancel();
        throw new IngestionError(`Unsupported content type "${contentType || 'unknown'}"; only HTML and plain text are supported`);
      }

      const body = await readLimited(response, maxBytes);
      const decoded = decode(body, contentType);
      const page = /^text\/plain/i.test(contentType)
        ? { title: null, text: decoded.trim() }
        : extractReadableText(decoded);

      logger.debug({ url: current, bytes: body.length, chars: page.text.length }, 'page fetched');
      return page;
    }

    throw new IngestionError(`Too many redirects (more than ${maxRedirects})`);
  }

  async function request(url) {
    if (!allowPrivateHosts && isPrivateAddress(url.hostname.replace(/^\[|\]$/g, ''))) {
      throw new IngestionError('URL points to a private or reserved address');
    }
    try {
      return await fetch(url, {
        dispatcher,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'user-agent': 'AIKnowledgeInbox/1.0 (+personal knowledge base)',
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
        },
      });
    } catch (err) {
      throw mapNetworkError(err, timeoutMs);
    }
  }

  return { fetchPage };
}

function parseHttpUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new IngestionError('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new IngestionError('Only http and https URLs are supported');
  }
  return url;
}

function mapNetworkError(err, timeoutMs) {
  const code = err?.cause?.code ?? err?.code;
  if (code === 'ERR_BLOCKED_ADDRESS') {
    return new IngestionError('URL resolves to a private or reserved address', { cause: err });
  }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new IngestionError(`Fetching the page timed out after ${timeoutMs} ms`, { retryable: true, cause: err });
  }
  if (code === 'ENOTFOUND') {
    return new IngestionError('Host name could not be resolved', { cause: err });
  }
  return new IngestionError(`Could not fetch the page (${code ?? err?.message ?? 'network error'})`, {
    retryable: true,
    cause: err,
  });
}

async function readLimited(response, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) {
      // Throwing out of for-await closes the iterator, which cancels the download.
      throw new IngestionError(`Page is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function decode(buffer, contentType) {
  const charset = /charset=([^;\s]+)/i.exec(contentType)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}
