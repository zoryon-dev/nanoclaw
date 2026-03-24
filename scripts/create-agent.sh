#!/bin/bash
# Script para adicionar um agente a um cliente
# Uso: ./scripts/create-agent.sh "client-slug" "Nome do Agente" "@trigger" "Papel" "Personalidade"

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

CLIENT="${1:?Uso: $0 \"client-slug\" \"Nome\" \"@trigger\" \"Papel\" \"Personalidade\"}"
NAME="${2:?Informe o nome do agente}"
TRIGGER="${3:?Informe o trigger pattern (ex: @agente)}"
ROLE="${4:?Informe o papel do agente}"
PERSONALITY="${5:?Informe a personalidade do agente}"

cd "$PROJECT_DIR"

node -e '
const { addAgent } = require("./dist/teams/client-manager");
const [clientSlug, name, triggerPattern, role, personality] = process.argv.slice(1);
const agent = addAgent(clientSlug, {
  name,
  triggerPattern,
  role,
  personality,
  skills: [],
  documents: [],
  status: "active",
});
console.log(JSON.stringify(agent, null, 2));
' -- "$CLIENT" "$NAME" "$TRIGGER" "$ROLE" "$PERSONALITY"

echo ""
echo "Agente criado com sucesso!"
