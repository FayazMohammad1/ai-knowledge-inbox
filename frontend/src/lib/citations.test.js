import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { splitCitations } from './citations.js';

describe('splitCitations', () => {
  it('turns [n] markers into cite parts between text parts', () => {
    assert.deepEqual(splitCitations('Retries happen 3 times [1] with backoff [2].', 2), [
      { type: 'text', value: 'Retries happen 3 times ' },
      { type: 'cite', ref: 1 },
      { type: 'text', value: ' with backoff ' },
      { type: 'cite', ref: 2 },
      { type: 'text', value: '.' },
    ]);
  });

  it('handles adjacent and leading citations', () => {
    assert.deepEqual(splitCitations('[1][2] Both agree.', 2), [
      { type: 'cite', ref: 1 },
      { type: 'cite', ref: 2 },
      { type: 'text', value: ' Both agree.' },
    ]);
  });

  it('leaves out-of-range markers as plain text', () => {
    assert.deepEqual(splitCitations('See [7] and [0].', 3), [{ type: 'text', value: 'See [7] and [0].' }]);
  });

  it('returns a single text part when there are no citations', () => {
    assert.deepEqual(splitCitations('No sources here.', 3), [{ type: 'text', value: 'No sources here.' }]);
  });

  it('returns nothing for an empty answer', () => {
    assert.deepEqual(splitCitations('', 3), []);
  });
});
