/**
 * Inter PF statement parser.
 * CSV (`;` separator) with preamble rows (Extrato Conta Corrente, Conta, Período, Saldo, blank)
 * before the actual header (Data Lançamento;Histórico;Descrição;Valor;Saldo).
 * BR date/number format. Sign on Valor.
 *
 * @param {string} raw — CSV content (UTF-8)
 * @returns {object} canonical schema
 */
export function parseInter(raw) {
  if (!raw || raw.trim().length === 0) throw new Error('empty CSV');

  const lines = raw.split(/\r?\n/u);
  const headerIdx = findHeaderRow(lines);
  if (headerIdx === -1) throw new Error('Inter header not found — invalid format');

  const header = lines[headerIdx].split(';').map((c) => c.trim());
  const idx = {
    data: header.findIndex((c) => /data/iu.test(c)),
    historico: header.findIndex((c) => /hist[óo]rico/iu.test(c)),
    descricao: header.findIndex((c) => /descri/iu.test(c)),
    valor: header.findIndex((c) => /^valor$/iu.test(c)),
  };
  if (idx.data < 0 || idx.descricao < 0 || idx.valor < 0) {
    throw new Error(`Inter header missing required columns: ${lines[headerIdx]}`);
  }

  const linhas = [];
  const seqByDate = new Map();
  let minDate = null;
  let maxDate = null;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(';').map((c) => c.trim());
    const data = parseBrDate(cols[idx.data]);
    if (!data) continue;

    const historico = cols[idx.historico] ?? '';
    const descricao = cols[idx.descricao] ?? '';
    const descricao_raw = combineDescricao(historico, descricao);
    const signed = parseBrValue(cols[idx.valor]);
    const valor = Math.abs(signed);
    const tipo = inferTipo(signed, descricao_raw);

    const seq = (seqByDate.get(data) ?? 0) + 1;
    seqByDate.set(data, seq);

    linhas.push({
      linha_id: `inter-${data}-${String(seq).padStart(3, '0')}`,
      data,
      valor,
      tipo,
      descricao_raw,
      banco_tx_id: null,
      meio_pagamento_hint: inferMeio(historico),
      categoria_hint: null,
    });

    if (!minDate || data < minDate) minDate = data;
    if (!maxDate || data > maxDate) maxDate = data;
  }

  return {
    banco: 'inter',
    conta_inferida: 'Inter PF',
    escopo: 'PF',
    periodo: { inicio: minDate ?? '', fim: maxDate ?? '' },
    linhas,
  };
}

function findHeaderRow(lines) {
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('data') && lower.includes('hist') && lower.includes('descri') && lower.includes('valor')) {
      return i;
    }
  }
  return -1;
}

function combineDescricao(historico, descricao) {
  const h = historico.trim();
  const d = descricao.trim();
  if (h && d) return `${h} | ${d}`;
  return h || d || '';
}

function parseBrDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseBrValue(s) {
  if (!s) return 0;
  const cleaned = s.replace(/\./gu, '').replace(',', '.').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function inferTipo(signed, descricao) {
  if (/ESTORNO|REVERSAO/iu.test(descricao)) return 'estorno';
  if (/TED\s+PROPRIA|TRANSF.*PROPRIA|PIX.*PROPRIA/iu.test(descricao)) return 'transferencia_interna';
  return signed < 0 ? 'despesa' : 'receita';
}

function inferMeio(historico) {
  if (/Pix/iu.test(historico)) return 'PIX';
  if (/Boleto|fatura/iu.test(historico)) return 'Boleto';
  if (/Cart[ãa]o|d[ée]bito|cr[ée]dito/iu.test(historico)) return 'Cartão';
  if (/TED|Transfer/iu.test(historico)) return 'Transferência';
  return null;
}
