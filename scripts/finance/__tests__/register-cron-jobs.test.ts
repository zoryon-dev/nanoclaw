import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerCronJobs, type RegisterOptions } from '../register-cron-jobs';

describe('registerCronJobs', () => {
  let tmpDir: string;
  let inboundPath: string;
  let promptsDir: string;
  let opts: RegisterOptions;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-cron-'));
    inboundPath = path.join(tmpDir, 'inbound.db');

    // Create empty inbound.db with messages_in schema
    const db = new Database(inboundPath);
    db.exec(`
      CREATE TABLE messages_in (
        id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        platform_id TEXT,
        channel_type TEXT,
        thread_id TEXT,
        content TEXT NOT NULL,
        process_after TEXT,
        recurrence TEXT
      );
    `);
    db.close();

    // Create prompt files (procedural markers used in T3 assertions)
    promptsDir = path.join(tmpDir, 'prompts');
    fs.mkdirSync(promptsDir);
    fs.writeFileSync(
      path.join(promptsDir, '_override-block.md'),
      [
        '[SYSTEM TASK — NON-INTERACTIVE]',
        '',
        'Rule 1: NÃO cumprimente. NÃO peça confirmação. NÃO pergunte esclarecimento.',
        'Rule 2: NÃO mostre cards de confirmação.',
        'Rule 3: princípios de confirmação NÃO se aplicam.',
        'Rule 4: Output: <message to="jonas">…</message> ou <internal>silent run: …</internal>.',
        'Rule 5: SEMPRE registre 1 linha em `_Log!A:E`.',
        'Rule 6: Erro → log + <message ⚠️>.',
        'Rule 7: Não tente "recuperar criativamente".',
        '',
        '---',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(promptsDir, 'sweep-reminder.md'), '[CRON: finance-sweep]\n\n**Step 1 — Ler Lembretes**');
    fs.writeFileSync(path.join(promptsDir, 'daily-digest.md'), '[CRON: finance-daily]\n\n**Step 1 — Coletar dados**');
    fs.writeFileSync(path.join(promptsDir, 'weekly-closing.md'), '[CRON: finance-weekly]\n\n**Step 1 — Coletar dados**');
    fs.writeFileSync(path.join(promptsDir, 'monthly-closing.md'), '[CRON: finance-monthly]\n\n**Step 1 — Verificar se hoje é o último dia do mês**');
    fs.writeFileSync(path.join(promptsDir, 'rollover.md'), '[CRON: finance-rollover]\n\n**Step 1 — Ler Recorrentes**');

    // Create cron-jobs.json
    fs.writeFileSync(
      path.join(tmpDir, 'cron-jobs.json'),
      JSON.stringify({
        jobs: [
          { id: 'task-finance-sweep', kind: 'task', recurrence: '0 8-22 * * *', promptFile: 'sweep-reminder.md', firstRunOffsetMs: 60000 },
          { id: 'task-finance-daily', kind: 'task', recurrence: '0 8 * * *', promptFile: 'daily-digest.md', firstRunOffsetMs: 60000 },
          { id: 'task-finance-weekly', kind: 'task', recurrence: '0 19 * * 0', promptFile: 'weekly-closing.md', firstRunOffsetMs: 60000 },
          { id: 'task-finance-monthly', kind: 'task', recurrence: '0 21 28-31 * *', promptFile: 'monthly-closing.md', firstRunOffsetMs: 60000 },
          { id: 'task-finance-rollover', kind: 'task', recurrence: '30 0 1 * *', promptFile: 'rollover.md', firstRunOffsetMs: 60000 },
        ],
      }),
    );

    opts = {
      inboundDbPath: inboundPath,
      configPath: path.join(tmpDir, 'cron-jobs.json'),
      promptsDir,
    };
  });

  it('T1 schema — inserts 5 rows with kind=task and JSON content', () => {
    registerCronJobs(opts);

    const db = new Database(inboundPath, { readonly: true });
    const rows = db.prepare(
      "SELECT id, kind, recurrence, content, process_after FROM messages_in WHERE recurrence IS NOT NULL ORDER BY id",
    ).all() as Array<{ id: string; kind: string; recurrence: string; content: string; process_after: string }>;
    db.close();

    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.id).sort()).toEqual([
      'task-finance-daily', 'task-finance-monthly', 'task-finance-rollover',
      'task-finance-sweep', 'task-finance-weekly',
    ]);
    for (const r of rows) {
      expect(r.kind).toBe('task');
      expect(() => JSON.parse(r.content)).not.toThrow();
      const parsed = JSON.parse(r.content);
      expect(typeof parsed.prompt).toBe('string');
      expect(parsed.prompt.length).toBeGreaterThan(0);
      // SQLite-friendly UTC format: 'YYYY-MM-DD HH:MM:SS'
      expect(r.process_after).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    }
    expect(rows.find(r => r.id === 'task-finance-sweep')!.recurrence).toBe('0 8-22 * * *');
    expect(rows.find(r => r.id === 'task-finance-daily')!.recurrence).toBe('0 8 * * *');
  });

  it('T2 override block — every prompt starts with the 7 rules', () => {
    registerCronJobs(opts);

    const db = new Database(inboundPath, { readonly: true });
    const rows = db.prepare("SELECT content FROM messages_in WHERE recurrence IS NOT NULL").all() as Array<{ content: string }>;
    db.close();

    for (const r of rows) {
      const prompt = JSON.parse(r.content).prompt as string;
      expect(prompt.startsWith('[SYSTEM TASK — NON-INTERACTIVE]')).toBe(true);
      // 7 enumerated rules from the override block
      expect(prompt).toContain('Rule 1');
      expect(prompt).toContain('Rule 7');
    }
  });

  it('T3 procedural prompt included — each job has its [CRON: …] header + a Step', () => {
    registerCronJobs(opts);

    const db = new Database(inboundPath, { readonly: true });
    const rows = db.prepare("SELECT id, content FROM messages_in WHERE recurrence IS NOT NULL").all() as Array<{ id: string; content: string }>;
    db.close();

    const cases: Array<[string, string, string]> = [
      ['task-finance-sweep', '[CRON: finance-sweep]', '**Step 1 — Ler Lembretes**'],
      ['task-finance-daily', '[CRON: finance-daily]', '**Step 1 — Coletar dados**'],
      ['task-finance-weekly', '[CRON: finance-weekly]', '**Step 1 — Coletar dados**'],
      ['task-finance-monthly', '[CRON: finance-monthly]', '**Step 1 — Verificar se hoje é o último dia do mês**'],
      ['task-finance-rollover', '[CRON: finance-rollover]', '**Step 1 — Ler Recorrentes**'],
    ];

    for (const [id, header, step] of cases) {
      const row = rows.find(r => r.id === id);
      expect(row, `missing row ${id}`).toBeDefined();
      const prompt = JSON.parse(row!.content).prompt as string;
      expect(prompt).toContain(header);
      expect(prompt).toContain(step);
    }
  });

  it('T4 idempotency — re-running keeps 5 rows, seq stable per id, process_after refreshed', () => {
    registerCronJobs(opts);

    const db1 = new Database(inboundPath, { readonly: true });
    const first = db1.prepare("SELECT id, seq, process_after FROM messages_in WHERE recurrence IS NOT NULL ORDER BY seq").all() as Array<{ id: string; seq: number; process_after: string }>;
    db1.close();

    // Wait > 1 sec so process_after differs noticeably on second run
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    return sleep(1100).then(() => {
      registerCronJobs(opts);

      const db2 = new Database(inboundPath, { readonly: true });
      // Sort by seq so the spacing-by-2 assertion is valid (config insertion order, not alphabetical)
      const second = db2.prepare("SELECT id, seq, process_after FROM messages_in WHERE recurrence IS NOT NULL ORDER BY seq").all() as Array<{ id: string; seq: number; process_after: string }>;
      const count = (db2.prepare("SELECT COUNT(*) AS c FROM messages_in WHERE recurrence IS NOT NULL").get() as { c: number }).c;
      db2.close();

      expect(count).toBe(5);
      expect(second).toHaveLength(5);
      // The script recomputes seq from MAX(seq), so on a re-run each seq is maxSeq+2, maxSeq+4, …
      // When sorted by seq the consecutive difference must be exactly 2.
      for (let i = 1; i < second.length; i++) {
        expect(second[i].seq - second[i - 1].seq).toBe(2);
      }
      // process_after refreshed (later than first run)
      for (const row of second) {
        const firstRow = first.find(f => f.id === row.id)!;
        expect(row.process_after >= firstRow.process_after).toBe(true);
      }
    });
  });
});
