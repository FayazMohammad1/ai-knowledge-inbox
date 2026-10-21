import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkText } from '../src/services/chunker.js';

describe('chunkText', () => {
  it('returns nothing for empty or whitespace-only input', () => {
    assert.deepEqual(chunkText(''), []);
    assert.deepEqual(chunkText('  \n\n \t '), []);
  });

  it('keeps short text as a single chunk', () => {
    assert.deepEqual(chunkText('A short note.'), [{ index: 0, text: 'A short note.' }]);
  });

  it('never exceeds maxChars, even for long paragraphs and unbroken tokens', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. ';
    const text = `${sentence.repeat(60)}\n\n${'x'.repeat(2500)}\n\n${sentence.repeat(10)}`;
    const chunks = chunkText(text, { maxChars: 300, overlapChars: 40 });
    assert.ok(chunks.length > 5);
    for (const chunk of chunks) assert.ok(chunk.text.length <= 300, `chunk of ${chunk.text.length} chars`);
  });

  it('packs whole paragraphs together and splits between them first', () => {
    const para = (n) => `Paragraph ${n} ${'word '.repeat(30)}`.trim();
    const chunks = chunkText([para(1), para(2), para(3)].join('\n\n'), { maxChars: 400, overlapChars: 0 });
    assert.equal(chunks.length, 2);
    assert.ok(chunks[0].text.includes('Paragraph 1') && chunks[0].text.includes('Paragraph 2'));
    assert.ok(chunks[1].text.startsWith('Paragraph 3'));
  });

  it('prefers sentence boundaries over mid-sentence cuts', () => {
    const text = 'First sentence is here. Second sentence follows it. Third sentence ends the line.';
    const chunks = chunkText(text, { maxChars: 55, overlapChars: 0 });
    for (const chunk of chunks) assert.match(chunk.text, /[.]$/);
  });

  it('overlaps consecutive chunks so boundary facts survive', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `Line number ${i} carries some distinct content`);
    const chunks = chunkText(lines.join('\n'), { maxChars: 200, overlapChars: 60 });
    assert.ok(chunks.length > 1);
    const tailOfFirst = chunks[0].text.slice(-20);
    assert.ok(chunks[1].text.includes(tailOfFirst), 'second chunk should repeat the end of the first');
  });

  it('numbers chunks sequentially', () => {
    const chunks = chunkText('word '.repeat(500), { maxChars: 200, overlapChars: 20 });
    assert.deepEqual(chunks.map((c) => c.index), chunks.map((_, i) => i));
  });

  it('rejects an overlap that is not smaller than the chunk size', () => {
    assert.throws(() => chunkText('text', { maxChars: 100, overlapChars: 100 }), RangeError);
  });
});
