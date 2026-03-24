#!/bin/bash
# Script para criar um novo cliente
# Uso: ./scripts/create-client.sh "Nome do Cliente" "telegram_group_id" [template] [plan]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

NAME="${1:?Uso: $0 \"Nome do Cliente\" \"telegram_group_id\" [template] [plan]}"
TELEGRAM_ID="${2:?Informe o ID do grupo Telegram}"
TEMPLATE="${3:-}"
PLAN="${4:-starter}"

cd "$PROJECT_DIR"

node -e "
const { createClient } = require('./src/teams/client-manager');
const config = createClient({
  name: '$NAME',
  telegramGroupId: '$TELEGRAM_ID',
  templateName: '$TEMPLATE' || undefined,
  plan: '$PLAN',
});
console.log(JSON.stringify(config, null, 2));
" 2>/dev/null || npx ts-node -e "
import { createClient } from './src/teams/client-manager';
const config = createClient({
  name: '$NAME',
  telegramGroupId: '$TELEGRAM_ID',
  templateName: '$TEMPLATE' || undefined,
  plan: '$PLAN',
});
console.log(JSON.stringify(config, null, 2));
"

echo ""
echo "🎉 Cliente criado com sucesso!"
echo ""
echo "Próximos passos:"
echo "  1. Adicione documentos em clients/$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g')/docs/"
echo "  2. Configure os agentes em clients/$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g')/config.json"
echo "  3. Reinicie o NanoClaw para aplicar: npm run dev"
