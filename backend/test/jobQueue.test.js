import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import pino from 'pino';
import { createJobQueue } from '../src/queue/jobQueue.js';

const logger = pino({ level: 'silent' });
const retryable = (message) => Object.assign(new Error(message), { retryable: true });
const permanent = (message) => Object.assign(new Error(message), { retryable: false });

describe('jobQueue', () => {
  it('retries transient failures with backoff and then succeeds', async () => {
    let calls = 0;
    const failures = [];
    const queue = createJobQueue({
      concurrency: 1, maxAttempts: 3, retryBaseMs: 1, logger,
      handler: async () => { calls += 1; if (calls < 3) throw retryable('flaky'); },
      onFailure: (id, err) => failures.push([id, err]),
    });
    queue.enqueue('job-1');
    await queue.onIdle();
    assert.equal(calls, 3);
    assert.equal(failures.length, 0);
  });

  it('gives up after maxAttempts and reports the failure', async () => {
    let calls = 0;
    const failures = [];
    const queue = createJobQueue({
      concurrency: 1, maxAttempts: 3, retryBaseMs: 1, logger,
      handler: async () => { calls += 1; throw retryable('always down'); },
      onFailure: (id, err) => failures.push([id, err.message]),
    });
    queue.enqueue('job-1');
    await queue.onIdle();
    assert.equal(calls, 3);
    assert.deepEqual(failures, [['job-1', 'always down']]);
  });

  it('does not retry permanent failures', async () => {
    let calls = 0;
    const failures = [];
    const queue = createJobQueue({
      concurrency: 1, maxAttempts: 5, retryBaseMs: 1, logger,
      handler: async () => { calls += 1; throw permanent('bad input'); },
      onFailure: (id, err) => failures.push(err.message),
    });
    queue.enqueue('job-1');
    await queue.onIdle();
    assert.equal(calls, 1);
    assert.deepEqual(failures, ['bad input']);
  });

  it('never runs more jobs at once than the concurrency limit', async () => {
    let running = 0;
    let peak = 0;
    const queue = createJobQueue({
      concurrency: 2, maxAttempts: 1, retryBaseMs: 1, logger,
      handler: async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 10));
        running -= 1;
      },
      onFailure: () => {},
    });
    ['a', 'b', 'c', 'd', 'e'].forEach(queue.enqueue);
    await queue.onIdle();
    assert.equal(peak, 2);
  });

  it('survives an onFailure callback that throws', async () => {
    const queue = createJobQueue({
      concurrency: 1, maxAttempts: 1, retryBaseMs: 1, logger,
      handler: async () => { throw permanent('x'); },
      onFailure: () => { throw new Error('callback bug'); },
    });
    queue.enqueue('job-1');
    await queue.onIdle(); // resolves instead of hanging or crashing
  });
});
