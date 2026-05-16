#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { detectBank } from './parsers/detect.mjs';
import { parseBtgPf } from './parsers/btg_pf.mjs';
import { parseBtgPj } from './parsers/btg_pj.mjs';
import { parseInter } from './parsers/inter.mjs';
import { parseHotmart } from './parsers/hotmart.mjs';
import { classify } from './classify.mjs';
import { reconcile } from './reconcile.mjs';

const argv = process.argv.slice(2);
const [cmd, ...rest] = argv;
const args = parseArgs(rest);

try {
  switch (cmd) {
    case 'parse': runParse(args); break;
    case 'classify': runClassify(args); break;
    case 'reconcile': runReconcile(args); break;
    case 'help':
    case '--help':
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(err.exitCode ?? 1);
}

function parseArgs(rest) {
  const out = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function runParse(args) {
  const file = args._[0];
  if (!file) {
    const e = new Error('usage: finance-csv parse <file> [--bank ...] [--out ...]');
    e.exitCode = 1;
    throw e;
  }
  if (!existsSync(file)) {
    const e = new Error(`file not found: ${file}`);
    e.exitCode = 4;
    throw e;
  }
  const buf = readFileSync(file);
  const bank = args.bank ?? detectBank(buf);
  if (!bank) {
    const head = buf.toString('utf-8').slice(0, 200);
    const e = new Error(`unknown source — head: ${head}`);
    e.exitCode = 2;
    throw e;
  }

  let result;
  switch (bank) {
    case 'btg_pf':   result = parseBtgPf(buf); break;
    case 'btg_pj':   result = parseBtgPj(buf.toString('utf-8')); break;
    case 'inter':    result = parseInter(buf.toString('utf-8')); break;
    case 'hotmart':  result = parseHotmart(buf.toString('utf-8')); break;
    default: {
      const e = new Error(`unsupported bank: ${bank}`);
      e.exitCode = 1;
      throw e;
    }
  }

  emit(result, args.out);
}

function runClassify(args) {
  const desc = args._[0];
  if (!desc) {
    const e = new Error('usage: finance-csv classify <descricao> --cache <path> [--hotmart-map <path>] [--categoria-hint <text>]');
    e.exitCode = 1;
    throw e;
  }
  if (!args.cache) {
    const e = new Error('--cache <path> is required');
    e.exitCode = 1;
    throw e;
  }
  const cache = readJson(args.cache);
  const hotmartMap = args['hotmart-map'] ? readJson(args['hotmart-map']) : null;
  const categoria_hint = args['categoria-hint'] ?? null;
  const r = classify({ descricao_raw: desc, categoria_hint }, cache, hotmartMap);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
}

function runReconcile(args) {
  if (!args.csv || !args.sheet) {
    const e = new Error('usage: finance-csv reconcile --csv <canonical.json> --sheet <dump.json> [--cache ...] [--hotmart-map ...] [--markers <dir>] [--out ...]');
    e.exitCode = 1;
    throw e;
  }
  const canonical = readJson(args.csv);
  const sheet = readJson(args.sheet);

  let cache;
  if (args.cache && existsSync(args.cache)) {
    cache = readJson(args.cache);
  } else {
    if (args.cache) {
      process.stderr.write(`Warning: cache file not found: ${args.cache} — using empty cache\n`);
    }
    cache = { version: 1, patterns: [] };
  }

  const hotmartMap = args['hotmart-map'] && existsSync(args['hotmart-map']) ? readJson(args['hotmart-map']) : null;
  const markers = loadMarkers(args.markers);
  const result = reconcile(canonical, sheet, cache, hotmartMap, markers);
  emit(result, args.out);
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch (err) {
    const e = new Error(`failed to read JSON from ${p}: ${err.message}`);
    e.exitCode = 4;
    throw e;
  }
}

function loadMarkers(dir) {
  const set = new Set();
  if (!dir || !existsSync(dir)) return set;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.summary.json')) continue;
    try {
      const s = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      for (const id of s?.linha_ids ?? []) set.add(id);
    } catch {
      // ignore corrupt marker
    }
  }
  return set;
}

function emit(obj, outPath) {
  const json = JSON.stringify(obj, null, 2);
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, json);
  } else {
    process.stdout.write(json + '\n');
  }
}

function printHelp() {
  process.stdout.write(`finance-csv — parse/classify/reconcile bank statement files

Commands:
  parse <file> [--bank btg_pf|btg_pj|inter|hotmart] [--out <path>]
  classify <descricao> --cache <path> [--hotmart-map <path>] [--categoria-hint <text>]
  reconcile --csv <canonical.json> --sheet <dump.json> --cache <path>
            [--hotmart-map <path>] [--markers <dir>] [--out <path>]
  help

Exit codes:
  0 success | 1 generic | 2 unknown source | 3 already imported | 4 file missing
`);
}
