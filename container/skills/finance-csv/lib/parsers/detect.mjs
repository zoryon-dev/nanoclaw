const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

// Order matters — first match wins. More specific signatures should come first.
const CSV_SIGNATURES = [
  { bank: 'hotmart', pattern: /Data\s+do\s+lan[çc]amento.*Categoria/iu },
  { bank: 'btg_pj', pattern: /^"Data"\s*,\s*"Descricao"\s*,\s*"Valor"\s*,\s*"Saldo"/iu },
  { bank: 'inter', pattern: /Extrato\s+Conta\s+Corrente|Data\s+Lan[çc]amento\s*;\s*Hist[óo]rico\s*;\s*Descri/iu },
];

/**
 * Auto-detect the bank/source of a statement file.
 *
 * @param {Buffer | string} input
 * @returns {'btg_pf' | 'btg_pj' | 'inter' | 'hotmart' | null}
 */
export function detectBank(input) {
  if (!input || (Buffer.isBuffer(input) && input.length === 0) || input.length === 0) {
    return null;
  }

  // Buffer: check OLE2 magic first
  if (Buffer.isBuffer(input)) {
    if (input.length >= 8 && input.subarray(0, 8).equals(OLE2_MAGIC)) {
      return 'btg_pf';
    }
    // Fall through to text-based detection
    input = input.toString('utf-8');
  }

  const head = input.slice(0, 500); // enough for first line + preamble
  for (const { bank, pattern } of CSV_SIGNATURES) {
    if (pattern.test(head)) return bank;
  }
  return null;
}
