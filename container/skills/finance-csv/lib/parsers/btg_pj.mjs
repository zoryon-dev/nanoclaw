/**
 * BTG PJ (business) statement parser.
 * CSV with quoted fields, BR date/number format.
 * Header: "Data","Descricao","Valor","Saldo"
 *
 * @param {string} raw — full CSV content (UTF-8)
 * @returns {object} canonical schema
 */
export function parseBtgPj(raw) {
  if (!raw || raw.trim().length === 0) throw new Error('empty CSV');

  const lines = raw.split(/\r?\n/u).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV has header but no data rows');

  const header = parseCsvLine(lines[0]);
  const idx = {
    data: header.findIndex((c) => /^data$/iu.test(c)),
    descricao: header.findIndex((c) => /descri/iu.test(c)),
    valor: header.findIndex((c) => /^valor$/iu.test(c)),
  };
  if (idx.data < 0 || idx.descricao < 0 || idx.valor < 0) {
    throw new Error(`BTG PJ header missing required columns: ${lines[0]}`);
  }

  const linhas = [];
  const seqByDate = new Map();
  let minDate = null;
  let maxDate = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const data = parseBrDate(cols[idx.data]);
    if (!data) continue;
    const descricao_raw = (cols[idx.descricao] ?? '').trim();
    const signed = parseBrValue(cols[idx.valor]);
    const valor = Math.abs(signed);
    const tipo = inferTipo(signed, descricao_raw);

    const seq = (seqByDate.get(data) ?? 0) + 1;
    seqByDate.set(data, seq);

    linhas.push({
      linha_id: `btg_pj-${data}-${String(seq).padStart(3, '0')}`,
      data,
      valor,
      tipo,
      descricao_raw,
      banco_tx_id: null,
      meio_pagamento_hint: inferMeio(descricao_raw),
      categoria_hint: null,
    });

    if (!minDate || data < minDate) minDate = data;
    if (!maxDate || data > maxDate) maxDate = data;
  }

  if (linhas.length === 0) throw new Error('no data rows — empty CSV after header');

  return {
    banco: 'btg_pj',
    conta_inferida: 'BTG PJ',
    escopo: 'PJ',
    periodo: { inicio: minDate ?? '', fim: maxDate ?? '' },
    linhas,
  };
}

/**
 * Parse a single CSV line with simple double-quote handling.
 * Assumes no embedded quotes inside quoted fields (true for BTG PJ fixture).
 * @param {string} line
 * @returns {string[]}
 */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
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

function inferMeio(descricao) {
  if (/PIX/iu.test(descricao)) return 'PIX';
  if (/Boleto/iu.test(descricao)) return 'Boleto';
  if (/Saque/iu.test(descricao)) return 'Saque';
  if (/Cart[ãa]o/iu.test(descricao)) return 'Cartão';
  if (/TED|Transfer/iu.test(descricao)) return 'Transferência';
  return null;
}
