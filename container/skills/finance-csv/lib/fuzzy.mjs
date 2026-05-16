/**
 * Token-set Jaccard similarity for descricao matching.
 * Splits on whitespace and common punctuation (incl. asterisk, slash, dot),
 * lowercases, strips standalone digit tokens, deduplicates.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} 0..1 — |intersection| / |union|
 */
export function tokenSetRatio(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  for (const t of ta) if (tb.has(t)) intersect++;
  const union = ta.size + tb.size - intersect;
  return intersect / union;
}

function tokens(s) {
  return new Set(
    s
      .toLowerCase()
      .split(/[\s.,;:*/()\-_]+/u)
      .filter((t) => t.length > 0 && !/^\d+$/.test(t))
  );
}
