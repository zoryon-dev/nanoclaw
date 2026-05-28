/**
 * Hotmart sales/financial report parser.
 * CSV with UTF-8 BOM, semicolon separator, PT-BR headers,
 * dot-decimal numbers (not BR format), and 12 columns including Categoria.
 *
 * @param {string} raw — CSV content
 * @returns {object} canonical schema
 */
export function parseHotmart(raw) {
  if (!raw || raw.trim().length === 0) throw new Error('empty CSV');

  // Strip UTF-8 BOM if present
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/u).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV has header but no data rows');

  const header = lines[0].split(';').map((c) => c.trim());
  const idx = {
    data: header.findIndex((c) => /Data\s+do\s+lan/iu.test(c)),
    status: header.findIndex((c) => /^Status$/iu.test(c)),
    transacao: header.findIndex((c) => /^Transa[çc][ãa]o$/iu.test(c)),
    identificador: header.findIndex((c) => /Identificador/iu.test(c)),
    descricao: header.findIndex((c) => /^Descri/iu.test(c)),
    valor: header.findIndex((c) => /^Valor$/iu.test(c)),
    produto: header.findIndex((c) => /Nome\s+do\s+produto/iu.test(c)),
    categoria: header.findIndex((c) => /^Categoria$/iu.test(c)),
  };
  if (idx.data < 0 || idx.valor < 0 || idx.categoria < 0 || idx.descricao < 0) {
    throw new Error(`Hotmart header missing required columns: ${lines[0]}`);
  }

  const linhas = [];
  const seqByDate = new Map();
  let minDate = null;
  let maxDate = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map((c) => c.trim());
    if (idx.status >= 0 && cols[idx.status] && cols[idx.status] !== 'Efetivado') continue;

    const data = parseBrDate(cols[idx.data]);
    if (!data) continue;

    const descricao = cols[idx.descricao] ?? '';
    const produto = idx.produto >= 0 ? cols[idx.produto] : '';
    const descricao_raw = produto ? `${descricao} | ${produto}` : descricao;
    const categoria_hint = cols[idx.categoria] || null;

    const signed = parseDotValue(cols[idx.valor]);
    const valor = Math.abs(signed);
    const tipo = inferTipo(signed, categoria_hint);

    const banco_tx_id =
      (idx.transacao >= 0 && cols[idx.transacao]) ||
      (idx.identificador >= 0 && cols[idx.identificador]) ||
      null;

    const seq = (seqByDate.get(data) ?? 0) + 1;
    seqByDate.set(data, seq);

    linhas.push({
      linha_id: `hotmart-${data}-${String(seq).padStart(3, '0')}`,
      data,
      valor,
      tipo,
      descricao_raw,
      banco_tx_id,
      meio_pagamento_hint: null,
      categoria_hint,
    });

    if (!minDate || data < minDate) minDate = data;
    if (!maxDate || data > maxDate) maxDate = data;
  }

  return {
    banco: 'hotmart',
    conta_inferida: 'Hotmart',
    escopo: 'PJ',
    periodo: { inicio: minDate ?? '', fim: maxDate ?? '' },
    linhas,
  };
}

function parseBrDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseDotValue(s) {
  if (!s) return 0;
  const n = Number(String(s).replace(/[^\d.\-]/gu, ''));
  return Number.isFinite(n) ? n : 0;
}

function inferTipo(signed, categoria) {
  if (categoria === 'Reembolso cartão hotmart') return 'estorno';
  return signed < 0 ? 'despesa' : 'receita';
}
