/**
 * Minimal in-process job queue: bounded concurrency + retry with exponential backoff.
 *
 * Durability does NOT live here. The job *state* (pending/processing/ready/failed) is a
 * column in SQLite, and on startup unfinished items are re-enqueued, so a crash loses
 * nothing. This class only schedules work in this process. In a multi-instance
 * deployment it would be replaced by a real queue (BullMQ, SQS, Postgres SKIP LOCKED)
 * with the same enqueue()/handler contract.
 *
 * A handler error with `retryable === false` fails the job immediately; anything else is
 * retried up to `maxAttempts`, after which `onFailure` is called.
 */
export function createJobQueue({ concurrency, maxAttempts, retryBaseMs, handler, onFailure, logger }) {
  const waiting = [];
  const attempts = new Map();
  const retryTimers = new Set();
  const idleWaiters = [];
  let active = 0;

  const isIdle = () => active === 0 && waiting.length === 0 && retryTimers.size === 0;

  function enqueue(jobId) {
    waiting.push(jobId);
    pump();
  }

  function pump() {
    while (active < concurrency && waiting.length > 0) {
      const jobId = waiting.shift();
      active += 1;
      run(jobId).finally(() => {
        active -= 1;
        pump();
        if (isIdle()) idleWaiters.splice(0).forEach((resolve) => resolve());
      });
    }
  }

  async function run(jobId) {
    const attempt = (attempts.get(jobId) ?? 0) + 1;
    attempts.set(jobId, attempt);
    const log = logger.child({ jobId, attempt });

    try {
      await handler(jobId, { attempt });
      attempts.delete(jobId);
    } catch (err) {
      const retryable = err?.retryable !== false;
      if (retryable && attempt < maxAttempts) {
        const delayMs = retryBaseMs * 2 ** (attempt - 1);
        log.warn({ err: err.message, delayMs }, 'job failed, will retry');
        const timer = setTimeout(() => {
          retryTimers.delete(timer);
          enqueue(jobId);
        }, delayMs);
        // Deliberately NOT unref'd: a scheduled retry is pending work that must keep the process alive.
        retryTimers.add(timer);
        return;
      }
      attempts.delete(jobId);
      // A non-retryable failure is a known, expected outcome (bad URL, empty page...): warn, no stack.
      if (retryable) log.error({ err }, 'job failed after exhausting retries');
      else log.warn({ reason: err.message }, 'job failed permanently');
      try {
        await onFailure(jobId, err);
      } catch (callbackErr) {
        log.error({ err: callbackErr }, 'onFailure handler threw');
      }
    }
  }

  return {
    enqueue,
    /** Resolves when nothing is running, waiting or scheduled for retry (used by tests and shutdown). */
    onIdle: () => (isIdle() ? Promise.resolve() : new Promise((resolve) => idleWaiters.push(resolve))),
    stats: () => ({ active, waiting: waiting.length, retrying: retryTimers.size }),
  };
}
