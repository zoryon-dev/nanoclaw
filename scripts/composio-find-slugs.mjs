/**
 * Descobre os slugs exatos dos toolkits pedidos pelo Jonas.
 */
import { Composio } from '@composio/core';

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) { console.error('Set COMPOSIO_API_KEY'); process.exit(1); }

const composio = new Composio({ apiKey });

const queries = [
  'gmail', 'google drive', 'google sheets', 'google docs', 'google calendar',
  'github', 'instagram', 'meta ads', 'meta', 'facebook ads',
  'neon', 'cloudflare', 'short', 'tavily',
];

console.log('Buscando slugs...\n');
for (const q of queries) {
  const res = await composio.client.toolkits.list({ search: q, limit: 8 });
  console.log(`[${q}]`);
  for (const t of res.items) {
    console.log(`  ${t.slug.padEnd(30)} ${t.name}  categories=${(t.categories||[]).join(',')}`);
  }
  console.log();
}
