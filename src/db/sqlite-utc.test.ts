import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { toSqliteUtc } from './sqlite-utc.js';

describe('toSqliteUtc', () => {
  it('formats a Date as YYYY-MM-DD HH:MM:SS in UTC', () => {
    const d = new Date('2026-05-12T13:00:00Z');
    expect(toSqliteUtc(d)).toBe('2026-05-12 13:00:00');
  });

  it('strips milliseconds and the trailing Z', () => {
    const d = new Date('2026-05-12T13:00:00.456Z');
    expect(toSqliteUtc(d)).toBe('2026-05-12 13:00:00');
  });

  it("compares correctly against SQLite's datetime('now') (Bug C regression)", () => {
    // A row whose process_after is in the past must be returned by
    // `WHERE process_after <= datetime('now')`. ISO format like
    // '2026-05-12T13:00:00.000Z' would NOT, because 'T' (0x54) > ' ' (0x20)
    // in ASCII makes the lex compare return FALSE.
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE t (id TEXT PRIMARY KEY, process_after TEXT NOT NULL);`);

    const past = toSqliteUtc(new Date(Date.now() - 60_000)); // 60s in the past
    db.prepare('INSERT INTO t (id, process_after) VALUES (?, ?)').run('past', past);

    const future = toSqliteUtc(new Date(Date.now() + 60_000)); // 60s in the future
    db.prepare('INSERT INTO t (id, process_after) VALUES (?, ?)').run('future', future);

    const dueRows = db
      .prepare("SELECT id FROM t WHERE process_after <= datetime('now') ORDER BY id")
      .all() as Array<{ id: string }>;
    db.close();

    expect(dueRows.map((r) => r.id)).toEqual(['past']);
  });
});
