/**
 * Diagnóstico rápido: lista contas CONECTADAS (OAuth feito) por agent group.
 * Usa connectedAccounts.list, que filtra por user_id no servidor.
 */
import { Composio } from '@composio/core';
import Database from 'better-sqlite3';

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.error('Set COMPOSIO_API_KEY=ak_... first');
  process.exit(1);
}

const db = new Database('/root/nanoclaw/data/v2.db', { readonly: true });
const groups = db.prepare('SELECT id, name, folder FROM agent_groups').all();

const composio = new Composio({ apiKey });

// Raw client also lists across all user_ids (útil pra descobrir se contas
// antigas existem em outros user_ids, ex: "default").
console.log('=== TODAS as connected accounts na conta Composio ===');
const all = await composio.client.connectedAccounts.list({ limit: 50 });
for (const a of all.items) {
  console.log(
    `  ${a.toolkit?.slug?.padEnd(20) || '(no-toolkit)'.padEnd(20)} user_id=${a.user_id || '(none)'}  status=${a.status}  account=${a.id}`,
  );
}
console.log(`  (total nessa página: ${all.items.length}, nextCursor=${all.next_cursor || '-'})`);

console.log('\n=== POR AGENT GROUP (user_id = group.id) ===');
for (const g of groups) {
  const res = await composio.client.connectedAccounts.list({
    user_ids: [g.id],
    limit: 50,
  });
  console.log(`\n${g.name} (${g.folder}) — user_id=${g.id}`);
  if (res.items.length === 0) {
    console.log('  (nenhuma conta conectada neste user_id)');
    continue;
  }
  for (const a of res.items) {
    console.log(`  ✓ ${a.toolkit?.slug?.padEnd(20)} status=${a.status}  account=${a.id}`);
  }
}
