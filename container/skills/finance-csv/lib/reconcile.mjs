import { classify } from './classify.mjs';
import { tokenSetRatio } from './fuzzy.mjs';

const VALOR_TOL_REC = 0.5;
const DIA_TOL_REC = 3;
const DATA_TOL_REB = 5;
const DATA_TOL_LAN = 1;
const ESTORNO_LOOKBACK = 7;
const NAME_FUZZ_THRESHOLD = 0.49;
const ESTORNO_FUZZ_THRESHOLD = 0.3;

/**
 * Reconcile a canonical CSV against current sheet state.
 *
 * @param {object} canonical
 * @param {{lancamentos: Array, recorrentes_ativos: Array, recebiveis_esperados: Array}} sheet
 * @param {object} cache
 * @param {Object<string, {categoria, subcategoria}> | null} hotmartMap
 * @param {Set<string>} markerSet
 * @returns {object}
 */
export function reconcile(canonical, sheet, cache, hotmartMap, markerSet) {
  const buckets = {
    matched: [],
    candidato_recorrente: [],
    candidato_recebivel: [],
    estorno_match: [],
    transferencia_interna: [],
    to_add: [],
    ambiguous: [],
    skipped_reimport: [],
  };

  for (const linha of canonical.linhas) {
    if (markerSet.has(linha.linha_id)) {
      buckets.skipped_reimport.push({ linha });
      continue;
    }

    if (linha.tipo === 'despesa' && matchRecorrente(linha, sheet.recorrentes_ativos, buckets)) continue;
    if (linha.tipo === 'receita' && matchRecebivel(linha, sheet.recebiveis_esperados, buckets)) continue;
    if (matchLancamento(linha, sheet.lancamentos, buckets)) continue;

    if (linha.tipo === 'estorno') {
      handleEstorno(linha, sheet.lancamentos, buckets, cache, hotmartMap);
      continue;
    }
    if (linha.tipo === 'transferencia_interna') {
      buckets.transferencia_interna.push({ linha });
      continue;
    }

    addToAdd(linha, buckets, cache, hotmartMap);
  }

  const summary = {
    total_linhas: canonical.linhas.length,
    matched: buckets.matched.length,
    candidato_recorrente: buckets.candidato_recorrente.length,
    candidato_recebivel: buckets.candidato_recebivel.length,
    estorno_match: buckets.estorno_match.length,
    transferencia_interna: buckets.transferencia_interna.length,
    to_add: buckets.to_add.length,
    skipped_reimport: buckets.skipped_reimport.length,
    ambiguous: buckets.ambiguous.length,
  };

  return { summary, ...buckets };
}

function matchRecorrente(linha, recorrentes, buckets) {
  const dia = Number(linha.data.slice(8, 10));
  for (const rec of recorrentes ?? []) {
    if (rec.pago_no_mes) continue;
    if (Math.abs(Number(rec.valor) - linha.valor) > VALOR_TOL_REC) continue;
    if (Math.abs(Number(rec.dia_do_mes) - dia) > DIA_TOL_REC) continue;
    if (tokenSetRatio(linha.descricao_raw, rec.nome ?? '') <= NAME_FUZZ_THRESHOLD) continue;
    buckets.candidato_recorrente.push({
      linha,
      recorrente_id: rec.id,
      recorrente_codigo: rec.codigo,
      recorrente_nome: rec.nome,
      action: 'marcar_pago',
    });
    return true;
  }
  return false;
}

function matchRecebivel(linha, recebiveis, buckets) {
  for (const reb of recebiveis ?? []) {
    if (Math.abs(Number(reb.valor) - linha.valor) > VALOR_TOL_REC) continue;
    if (daysBetween(reb.data_prevista, linha.data) > DATA_TOL_REB) continue;
    buckets.candidato_recebivel.push({
      linha,
      recebivel_id: reb.id,
      recebivel_descricao: reb.descricao,
      action: 'confirmar_recebimento',
    });
    return true;
  }
  return false;
}

function matchLancamento(linha, lancamentos, buckets) {
  const candidatos = [];
  for (const lan of lancamentos ?? []) {
    if (lan.tipo !== linha.tipo) continue;
    if (Number(lan.valor) !== linha.valor) continue;
    if (daysBetween(lan.data, linha.data) > DATA_TOL_LAN) continue;
    candidatos.push(lan);
  }
  if (candidatos.length === 1) {
    buckets.matched.push({ linha, lan_id: candidatos[0].id, confidence: 1.0 });
    return true;
  }
  if (candidatos.length > 1) {
    buckets.ambiguous.push({
      linha,
      candidatos: candidatos.map((c) => ({ lan_id: c.id, data: c.data, descricao: c.descricao })),
    });
    return true;
  }
  return false;
}

function handleEstorno(linha, lancamentos, buckets, cache, hotmartMap) {
  for (const lan of lancamentos ?? []) {
    if (lan.tipo !== 'despesa') continue;
    if (Math.abs(Number(lan.valor) - linha.valor) >= 0.01) continue;
    if (daysBetween(lan.data, linha.data) > ESTORNO_LOOKBACK) continue;
    if (tokenSetRatio(lan.descricao ?? '', linha.descricao_raw) < ESTORNO_FUZZ_THRESHOLD) continue;
    buckets.estorno_match.push({ linha, lan_id_to_delete: lan.id });
    return;
  }
  // No match — treat as receita with ESTORNO prefix
  const linhaReceita = { ...linha, tipo: 'receita', descricao_raw: `ESTORNO: ${linha.descricao_raw}` };
  buckets.to_add.push({
    linha: linhaReceita,
    sugestao: classifyOrDefault(linhaReceita, cache, hotmartMap),
  });
}

function addToAdd(linha, buckets, cache, hotmartMap) {
  buckets.to_add.push({
    linha,
    sugestao: classifyOrDefault(linha, cache, hotmartMap),
  });
}

function classifyOrDefault(linha, cache, hotmartMap) {
  const r = classify({ descricao_raw: linha.descricao_raw, categoria_hint: linha.categoria_hint ?? null }, cache, hotmartMap);
  return r ?? { categoria: null, subcategoria: null, fonte: null, confidence: 0 };
}

function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}
