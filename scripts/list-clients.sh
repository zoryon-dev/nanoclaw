#!/bin/bash
# Script para listar todos os clientes
# Uso: ./scripts/list-clients.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

node -e "
const { listClients } = require('./src/teams/client-manager');
const clients = listClients();
if (clients.length === 0) {
  console.log('Nenhum cliente cadastrado.');
  process.exit(0);
}
console.log('\\n📋 Clientes Cadastrados:\\n');
clients.forEach(c => {
  const agentCount = c.agents.length;
  const status = c.status === 'active' ? '🟢' : c.status === 'paused' ? '🟡' : '🔴';
  console.log(\`  \${status} \${c.name} (\${c.slug})\`);
  console.log(\`     Plano: \${c.plan} | Agentes: \${agentCount} | Telegram: \${c.telegramGroupId}\`);
  c.agents.forEach(a => {
    const aStatus = a.status === 'active' ? '✅' : '⏸️';
    console.log(\`     \${aStatus} \${a.name} (\${a.triggerPattern}) - \${a.role}\`);
  });
  console.log('');
});
" 2>/dev/null || npx ts-node -e "
import { listClients } from './src/teams/client-manager';
const clients = listClients();
if (clients.length === 0) {
  console.log('Nenhum cliente cadastrado.');
  process.exit(0);
}
console.log('\\n📋 Clientes Cadastrados:\\n');
clients.forEach(c => {
  const agentCount = c.agents.length;
  const status = c.status === 'active' ? '🟢' : c.status === 'paused' ? '🟡' : '🔴';
  console.log(\`  \${status} \${c.name} (\${c.slug})\`);
  console.log(\`     Plano: \${c.plan} | Agentes: \${agentCount} | Telegram: \${c.telegramGroupId}\`);
  c.agents.forEach(a => {
    const aStatus = a.status === 'active' ? '✅' : '⏸️';
    console.log(\`     \${aStatus} \${a.name} (\${a.triggerPattern}) - \${a.role}\`);
  });
  console.log('');
});
"
