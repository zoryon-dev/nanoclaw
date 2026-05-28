import { normalizeDescricao } from './normalize.mjs';

/**
 * Look up a classification for a description.
 *
 * Priority:
 *   1. Source-provided categoria_hint (e.g. Hotmart's Categoria column)
 *      mapped via hotmartMap → confidence 0.90, fonte 'source'
 *   2. Exact normalized match against cache patterns → confidence 0.95
 *   3. Substring match (longest pattern wins) → confidence 0.80
 *   4. null
 *
 * @param {{ descricao_raw: string, categoria_hint: string | null }} input
 * @param {{ version: number, patterns: Array<{ match: string, categoria: string, subcategoria: string, meio_pagamento_hint?: string | null }> }} cache
 * @param {Object<string, { categoria: string, subcategoria: string }> | null} hotmartMap
 * @returns {{ categoria: string, subcategoria: string, meio_pagamento_hint?: string | null, fonte: 'source' | 'cache', confidence: number } | null}
 */
export function classify(input, cache, hotmartMap) {
  const { descricao_raw, categoria_hint } = input ?? {};

  // 1. Source hint
  if (categoria_hint && hotmartMap && hotmartMap[categoria_hint]) {
    const m = hotmartMap[categoria_hint];
    return {
      categoria: m.categoria,
      subcategoria: m.subcategoria,
      meio_pagamento_hint: m.meio_pagamento_hint ?? null,
      fonte: 'source',
      confidence: 0.9,
    };
  }

  const normalized = normalizeDescricao(descricao_raw ?? '');
  if (!normalized) return null;
  const patterns = cache?.patterns ?? [];

  // 2. Exact normalized match
  for (const p of patterns) {
    if (normalized === p.match) {
      return {
        categoria: p.categoria,
        subcategoria: p.subcategoria,
        meio_pagamento_hint: p.meio_pagamento_hint ?? null,
        fonte: 'cache',
        confidence: 0.95,
      };
    }
  }

  // 3. Substring match (longest pattern wins)
  const sorted = [...patterns].sort((a, b) => b.match.length - a.match.length);
  for (const p of sorted) {
    if (normalized.includes(p.match)) {
      return {
        categoria: p.categoria,
        subcategoria: p.subcategoria,
        meio_pagamento_hint: p.meio_pagamento_hint ?? null,
        fonte: 'cache',
        confidence: 0.8,
      };
    }
  }

  return null;
}
