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

node -e '
const { createClient } = require("./dist/teams/client-manager");
const [name, telegramGroupId, templateName, plan] = process.argv.slice(1);
const config = createClient({
  name,
  telegramGroupId,
  templateName: templateName || undefined,
  plan: plan || "starter",
});
console.log(JSON.stringify(config, null, 2));
' -- "$NAME" "$TELEGRAM_ID" "$TEMPLATE" "$PLAN"

echo ""
echo "Cliente criado com sucesso!"
echo ""
echo "Proximos passos:"
echo "  1. Adicione documentos no diretorio docs/ do cliente"
echo "  2. Configure os agentes no config.json do cliente"
echo "  3. Reinicie o NanoClaw para aplicar: npm run dev"
