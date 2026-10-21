export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

/** Return a unit-length copy. Stored vectors are normalized, so cosine similarity == dot product. */
export function normalize(vector) {
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  const out = new Float32Array(vector.length);
  if (norm === 0) return out;
  for (let i = 0; i < vector.length; i += 1) out[i] = vector[i] / norm;
  return out;
}
