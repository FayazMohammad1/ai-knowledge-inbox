/** Which passage numbers ([1], [2]...) does the model's answer actually cite? Ignores out-of-range numbers. */
export function extractCitedRefs(answer, maxRef) {
  const refs = new Set();
  for (const match of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const ref = Number(match[1]);
    if (ref >= 1 && ref <= maxRef) refs.add(ref);
  }
  return refs;
}
