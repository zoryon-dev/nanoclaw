/**
 * Normalize a bank descricao_raw for use as a cache key.
 * - lowercase
 * - strip accents (NFD + remove combining marks)
 * - strip transaction-suffix patterns: trailing digits, *XXXX inline
 * - collapse all punctuation/whitespace to single space
 * - drop pure-digit tokens (preserve mixed alphanum like "C1")
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeDescricao(raw) {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\*\d+/gu, ' ')
    .replace(/[.,;:*/()\-_]+/gu, ' ')
    .split(/\s+/u)
    .filter((t) => t.length > 0 && !/^\d+$/.test(t))
    .join(' ');
}
