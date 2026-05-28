import * as xlsx from 'xlsx';

const DATE_TIME_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}/u;

/**
 * Parse a BTG PF statement (.xls binary) into canonical schema.
 *
 * Sheet layout (0-based column indices):
 *   col 1 — Data e hora  ("23/04/2026 14:44")
 *   col 2 — Categoria    (BTG's own classification)
 *   col 3 — Transação    ("Pix enviado", "Compra no débito autorizada", …)
 *   col 6 — Descrição    (merchant / beneficiary; also "Saldo Diário" on summary rows)
 *   col 10 — Valor       (number; negative = despesa, positive = receita)
 *
 * @param {Buffer} buf — raw XLS file bytes
 * @returns {object} canonical schema
 */
export function parseBtgPf(buf) {
  if (!buf || buf.length === 0) throw new Error('empty buffer');
  let wb;
  try {
    wb = xlsx.read(buf, { type: 'buffer', cellDates: true });
  } catch (err) {
    throw new Error(`invalid XLS: ${err.message}`);
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('invalid XLS: no sheets');
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const linhas = [];
  const seqByDate = new Map();
  let minDate = null;
  let maxDate = null;

  for (const row of rows) {
    // A valid data row must have a date-time string in col 1
    const dataTime = String(row[1] ?? '');
    const dateMatch = dataTime.match(DATE_TIME_RE);
    if (!dateMatch) continue;

    // Skip "Saldo Diário" summary rows — they appear with "Saldo Diário" in col 6
    const descricao_raw = String(row[6] ?? '').trim();
    if (descricao_raw === 'Saldo Diário') continue;

    const data = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    const categoria = String(row[2] ?? '').trim();

    // Skip stray header repetition rows (e.g. col 2 = "Categoria")
    if (categoria === 'Categoria') continue;

    const transacao = String(row[3] ?? '').trim();
    const valorRaw = row[10];
    const valor = parseValor(valorRaw);
    if (valor === null) continue; // skip rows where valor isn't parseable

    const tipo = inferTipo(valor, transacao, descricao_raw);
    const absValor = Math.abs(valor);

    const seq = (seqByDate.get(data) ?? 0) + 1;
    seqByDate.set(data, seq);

    linhas.push({
      linha_id: `btg_pf-${data}-${String(seq).padStart(3, '0')}`,
      data,
      valor: absValor,
      tipo,
      descricao_raw,
      banco_tx_id: null,
      meio_pagamento_hint: inferMeio(transacao),
      categoria_hint: categoria || null,
    });

    if (!minDate || data < minDate) minDate = data;
    if (!maxDate || data > maxDate) maxDate = data;
  }

  return {
    banco: 'btg_pf',
    conta_inferida: 'BTG D',
    escopo: 'PF',
    periodo: { inicio: minDate ?? '', fim: maxDate ?? '' },
    linhas,
  };
}

function parseValor(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  // Handle BR number formatting: "1.234,56" → 1234.56
  const cleaned = raw.replace(/\./gu, '').replace(',', '.').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function inferTipo(valor, transacao, descricao) {
  if (/ESTORNO|REVERSAO/iu.test(transacao) || /ESTORNO|REVERSAO/iu.test(descricao)) return 'estorno';
  if (/TED\s+PROPRIA|TRANSF.*PROPRIA|PIX.*PROPRIA/iu.test(transacao)) return 'transferencia_interna';
  return valor < 0 ? 'despesa' : 'receita';
}

function inferMeio(transacao) {
  if (/PIX/iu.test(transacao)) return 'PIX';
  if (/cart[ãa]o|cr[ée]dito|d[ée]bito|cred|deb/iu.test(transacao)) return 'Cartão';
  if (/boleto/iu.test(transacao)) return 'Boleto';
  if (/saque/iu.test(transacao)) return 'Saque';
  if (/transfer[êe]ncia|TED/iu.test(transacao)) return 'Transferência';
  return null;
}
