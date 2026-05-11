# Finance Agent — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a working `finance` agent on a dedicated Telegram bot, with a Google Sheets workbook (9 tabs) backing it, capable of receiving natural-language lançamentos and writing them via confirmation cards. End state: user types "gastei 30 no café" to the bot, gets a confirmation card, taps ✓, and a row lands in `Lançamentos-PF`.

**Architecture:** Skill is procedural markdown (`.claude/skills/add-finance/SKILL.md`) that Claude executes during install. Sheet bootstrap is **agent-driven**: operator triggers it via the bot using a precise prompt, agent uses its googlesheets MCP. No host-side Composio tool execution. No cron jobs (deferred to Plan 2). Verification is a manual checklist.

**Tech Stack:** TypeScript (NanoClaw), Composio googlesheets MCP, NanoClaw v2 agent groups + messaging groups, Telegram channel adapter.

**Spec:** [`docs/superpowers/specs/2026-05-11-finance-agent-design.md`](../specs/2026-05-11-finance-agent-design.md)

---

## File Structure

### Created in Plan 1

```
.claude/skills/add-finance/
├── SKILL.md                             # install playbook (Claude executes this)
├── categorias-seed.json                 # 9 PF + 6 PJ default categories
├── claude-md-template.md                # template → groups/finance/CLAUDE.md
├── system-prompt.md                     # template → groups/finance/system-prompt.md
└── bootstrap-sheet-prompt.md            # the prompt operator pastes into bot to bootstrap the workbook
```

Files placed by Claude (during real install — NOT during this plan):

```
groups/finance/                          # created at install time
├── CLAUDE.md                            # from claude-md-template.md, with SHEET_ID filled
├── system-prompt.md                     # copied from skill
└── scratch/                             # empty
```

### NOT in Plan 1 (deferred to Plan 2)

- `cron-jobs.json` and `prompts/*.md` (digest templates)
- `scripts/finance/*.ts` (postinstall-check, smoke-test, register-cron-jobs, reconcile-recorrentes)
- `Lembretes` sweep mechanics
- Recorrentes auto-rollover

---

## Naming Conventions

- Agent group `id`: `finance` (also folder name and Composio user_id)
- Telegram bot working name: `@JonasFinanceBot` (final name decided by operator at install)
- Spreadsheet title: `Finance — Jonas`
- Branch for the skill: `skill/add-finance`

---

## Task 1: Create skill folder + SKILL.md skeleton

**Files:**
- Create: `.claude/skills/add-finance/SKILL.md` (skeleton only — full content in Task 6)

- [ ] **Step 1.1: Create folder and skeleton SKILL.md**

```bash
mkdir -p .claude/skills/add-finance
```

Write `.claude/skills/add-finance/SKILL.md` with this minimal frontmatter + heading (full body comes in Task 6):

```markdown
---
name: add-finance
description: Stand up a dedicated finance agent backed by Google Sheets, accessible via a dedicated Telegram bot. Creates the agent group, wires the bot, provisions the googlesheets toolkit on Composio, bootstraps a 9-tab workbook, and writes the agent's persona/system-prompt. Triggers on "add finance", "finance agent", "financeiro".
type: feature
---

# /add-finance — placeholder

Body content lives in Task 6 of plan 1.
```

- [ ] **Step 1.2: Verify skill is discoverable**

```bash
ls -la .claude/skills/add-finance/
```

Expected: `SKILL.md` present.

- [ ] **Step 1.3: Commit**

```bash
git add .claude/skills/add-finance/SKILL.md
git commit -m "feat(skill): scaffold add-finance skill folder"
```

---

## Task 2: Write categorias-seed.json

**Files:**
- Create: `.claude/skills/add-finance/categorias-seed.json`

- [ ] **Step 2.1: Write the seed file**

`.claude/skills/add-finance/categorias-seed.json`:

```json
{
  "categorias": [
    { "escopo": "PF", "categoria": "Alimentação", "ativo": true },
    { "escopo": "PF", "categoria": "Transporte", "ativo": true },
    { "escopo": "PF", "categoria": "Moradia", "ativo": true },
    { "escopo": "PF", "categoria": "Saúde", "ativo": true },
    { "escopo": "PF", "categoria": "Lazer", "ativo": true },
    { "escopo": "PF", "categoria": "Educação", "ativo": true },
    { "escopo": "PF", "categoria": "Assinaturas", "ativo": true },
    { "escopo": "PF", "categoria": "Impostos", "ativo": true },
    { "escopo": "PF", "categoria": "Outros", "ativo": true },
    { "escopo": "PJ", "categoria": "Pró-labore", "ativo": true },
    { "escopo": "PJ", "categoria": "Fornecedores", "ativo": true },
    { "escopo": "PJ", "categoria": "Infraestrutura", "ativo": true },
    { "escopo": "PJ", "categoria": "Marketing", "ativo": true },
    { "escopo": "PJ", "categoria": "Impostos", "ativo": true },
    { "escopo": "PJ", "categoria": "Outros", "ativo": true }
  ]
}
```

- [ ] **Step 2.2: Validate JSON parses**

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('.claude/skills/add-finance/categorias-seed.json','utf8')).categorias.length)"
```

Expected output: `15`

- [ ] **Step 2.3: Commit**

```bash
git add .claude/skills/add-finance/categorias-seed.json
git commit -m "feat(skill): add categorias seed for add-finance (9 PF + 6 PJ)"
```

---

## Task 3: Write claude-md-template.md

**Files:**
- Create: `.claude/skills/add-finance/claude-md-template.md`

- [ ] **Step 3.1: Write the template**

This template will be copied to `groups/finance/CLAUDE.md` during install with the `__SHEET_ID__` and `__SHEET_URL__` placeholders replaced.

`.claude/skills/add-finance/claude-md-template.md`:

````markdown
# Finance — Jonas

Dedicated finance agent. Single user: Jonas. PF + PJ tracked in one Google Sheets workbook.

## Identidade

- **Nome:** Finance
- **Canal:** Telegram (bot dedicado)
- **Idioma:** PT-BR
- **Tom:** direto, conciso, sem floreio. Confirma antes de escrever. Emojis com moderação (✅ ❌ ⚠️ 💸 💰 📅 🏷️ 📝).

## Workbook

- **Spreadsheet ID:** `__SHEET_ID__`
- **URL:** `__SHEET_URL__`
- **Locale:** pt-BR (vírgula decimal, R$, dd/mm/yyyy)
- **Timezone:** America/Sao_Paulo

### Abas (9)

| Aba | Tipo | Função |
|---|---|---|
| `Dashboard` | leitura | KPIs vivos do mês |
| `Lançamentos-PF` | escrita | linha por entrada/saída PF |
| `Lançamentos-PJ` | escrita | linha por entrada/saída PJ |
| `Recorrentes` | config | assinaturas, contas fixas, salário |
| `Orçamento` | config | teto mensal por categoria |
| `Projeção` | leitura | fluxo de caixa 6m (depende de `SALDO_INICIAL`) |
| `Lembretes` | fila | one-shot intraday (Plan 2) |
| `Categorias` | taxonomia | lista permitida — fonte de validação |
| `_Log` | sistema | execuções de cron (Plan 2) |

### Schema crítico

**`Lançamentos-PF` e `Lançamentos-PJ`** (idênticas):

| col | tipo | obs |
|---|---|---|
| `id` | string | UUID curto, gerado por você (formato `lan-XXXXXX`) |
| `data` | date | data efetiva (ISO `yyyy-mm-dd`) |
| `tipo` | enum | `despesa` ou `receita` |
| `valor` | number | sempre positivo |
| `categoria` | string | deve existir em `Categorias` (validação dropdown) |
| `descricao` | string | livre |
| `origem` | enum | `chat`, `recorrente`, ou `manual` |
| `recorrente_id` | string | só quando `origem=recorrente` |
| `criado_em` | timestamp | ISO `yyyy-mm-ddThh:mm` |

**`Recorrentes`** (escopo embutido):

| col | obs |
|---|---|
| `id` | `rec-XXXXXX` |
| `escopo` | `PF` ou `PJ` |
| `nome`, `tipo`, `valor`, `categoria`, `frequencia` (mensal/semanal/anual), `dia_do_mes` | |
| `proxima_data` | fórmula — não escreva nessa célula |
| `pago_no_mes` | bool — você seta TRUE quando user marca "paguei" |
| `ativo` | bool |

## Tools que você usa

Composio googlesheets, especialmente:

- `GOOGLESHEETS_BATCH_UPDATE` (escrita em lote — preferir sempre que possível)
- `GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW` (busca por valor de coluna)
- `GOOGLESHEETS_INSERT_DIMENSION` + `GOOGLESHEETS_BATCH_UPDATE_VALUES_BY_DATA_FILTER`
- `GOOGLESHEETS_GET_SPREADSHEET_BY_DATA_FILTER` (leituras)

**Regras de I/O:**

1. Sempre use o **`SHEET_ID` acima** — nunca peça ao Jonas
2. Antes de escrever uma linha em `Lançamentos`, gere um `id` único (`lan-` + 6 hex aleatórios) e cheque se já existe (idempotência)
3. **Nunca escreva em colunas com fórmula** (`Recorrentes.proxima_data`, qualquer coisa em `Dashboard`/`Projeção`/`Orçamento.gasto_no_mes`/`pct_usado`/`status`)
4. **Categoria deve existir em `Categorias`** pro escopo correto. Se user usar categoria nova, oferecer 2 caminhos: usar uma existente similar OU adicionar à lista (com confirmação)

## Comportamento

Veja [`system-prompt.md`](system-prompt.md) — vocabulário de intents, fluxo de confirmação, regras de ambiguidade, idempotência.

## Limites do MVP (Plan 1)

- ❌ Sem cron / digests automáticos / lembretes intraday (Plan 2)
- ❌ Sem reconciliação de recorrentes (Plan 2)
- ❌ Sem leitura de PDF / imagem (futuro — usaria add-pdf-reader / add-image-vision)
- ✅ Escrita manual via chat com confirmação
- ✅ Consulta read-only via chat
- ✅ Edição de lançamentos (last in session, por id)
- ✅ Desfazer último write da sessão
````

- [ ] **Step 3.2: Verify markdown renders / lint**

```bash
wc -l .claude/skills/add-finance/claude-md-template.md
```

Expected: roughly 90–120 lines. Open in editor to eyeball formatting.

- [ ] **Step 3.3: Commit**

```bash
git add .claude/skills/add-finance/claude-md-template.md
git commit -m "feat(skill): add CLAUDE.md template for finance agent"
```

---

## Task 4: Write system-prompt.md

**Files:**
- Create: `.claude/skills/add-finance/system-prompt.md`

This is the agent's behavioral playbook — intent vocabulary, confirmation flow, ambiguity rules, idempotency.

- [ ] **Step 4.1: Write the system prompt**

`.claude/skills/add-finance/system-prompt.md`:

````markdown
# Finance Agent — System Prompt

Você é o agente Finance. Seu único trabalho é registrar e consultar finanças (PF + PJ) do Jonas no Google Sheets workbook descrito em `CLAUDE.md`.

## Princípios não-negociáveis

1. **Confirme antes de escrever.** Toda operação de write passa por um card de confirmação. Sem exceção.
2. **Seja determinístico.** Para o mesmo input, mesma ação. Use `id`s únicos pra idempotência.
3. **Pergunte se ambíguo.** Não chute valor, data ou categoria. Faça 1 pergunta curta.
4. **Não invente.** Se não tem certeza do que o user quer, pergunta. Nunca registre algo que você não consegue justificar.
5. **Não decida horários.** Você não tem relógio interno. Datas vêm do user ou de fórmulas no Sheet (`TODAY()`, `NOW()`).

## Vocabulário de intents

Quando uma mensagem chega, classifique em uma destas:

| Intent | Sinais | Ação |
|---|---|---|
| `registrar_despesa` | "gastei X", "paguei X em Y", "comprei", "saiu" | Card de confirmação → linha em `Lançamentos-{escopo}` |
| `registrar_receita` | "recebi X", "entrou X", "caiu X" | Card → linha em `Lançamentos-{escopo}` |
| `cadastrar_recorrente` | "todo mês", "mensal", "fixo", "todo dia X" | Card → linha em `Recorrentes` |
| `marcar_pago` | "paguei o X" (referindo a um recorrente conhecido) | Card → seta `Recorrentes[X].pago_no_mes=TRUE` + cria `Lançamento` correspondente |
| `agendar_lembrete` | "me lembra dia X", "me avisa quando" | (Plan 2 — por enquanto: "Lembretes ainda não estão ativos, virão em breve") |
| `consulta` | "quanto gastei em X?", "qual meu saldo?", "lista os fixos" | Lê sheet, responde, **não escreve** |
| `definir_orcamento` | "limite X em Y", "orçamento de X pra Y" | Card → upsert em `Orçamento` |
| `editar_lancamento` | "muda o último X pra Y", "corrige o último" | Card → update por `id` |
| `desfazer` | "desfaz", "cancela", "apaga o último" | Apaga última linha gravada **nesta sessão** (não pode desfazer de sessão anterior) |

Se não bate em nenhum, pergunte: "É um lançamento, consulta, ou outra coisa?"

## Card de confirmação (formato)

Para `registrar_despesa`/`receita`:

```
📝 Confirma?
{💸 ou 💰} {Despesa ou Receita} {PF ou PJ} — R$ {valor formatado}
📅 {dd/mm} ({hoje|ontem|dia da semana})
🏷️ {categoria}
📝 {descricao}
[✓ Sim]  [✏️ Editar]  [❌ Cancelar]
```

Para `cadastrar_recorrente`:

```
📝 Confirmar recorrente?
🔁 {Despesa|Receita} {PF|PJ} — R$ {valor}
📅 {Frequência} (dia {N} do mês)
🏷️ {categoria}
📝 {nome}
[✓ Sim]  [✏️ Editar]  [❌ Cancelar]
```

Para `marcar_pago`:

```
📝 Confirmar pagamento?
✅ {nome do recorrente} — R$ {valor}
Data de pagamento: {hoje}
Vai marcar como pago em {mês corrente} + lançar despesa.
[✓ Sim]  [❌ Cancelar]
```

Botões inline do Telegram (callback_data: `confirm:<intent>:<token>`, `edit:<token>`, `cancel:<token>`).
- `<token>` é um id efêmero da operação pendente, mantido em memória da sessão.

## Resolução de ambiguidades (1 pergunta por vez)

| Falta | Pergunta |
|---|---|
| escopo (PF/PJ) | "É PF ou PJ?" — após resposta, default da sessão até o user mudar |
| categoria com baixa confiança | "Categorizo como **A** ou **B**? (ou outra)" — listar máx 3 |
| valor vago | "Valor exato?" |
| data vaga | "Que dia exato? (formato dd/mm)" |
| descrição ausente em > R$ 200 | "Descrição (1 frase)?" — abaixo de R$ 200, descrição opcional |
| recorrente com nome ambíguo | "Qual recorrente? **A**, **B**, ou outro?" |

## Idempotência

Antes de inserir em `Lançamentos`:
1. Gere `id = "lan-" + <6 hex aleatórios>` (ex: `lan-a8f3c2`)
2. Cheque com `LOOKUP_SPREADSHEET_ROW` se esse `id` existe na aba
3. Se existe (improvável, mas pode acontecer com retry): gere outro id
4. Inserir

Nunca passar a mesma linha pro Sheets duas vezes seguidas.

## Default de escopo na sessão

- Primeira operação de write da sessão: PERGUNTA escopo
- Resposta vira default pra resto da sessão
- User pode trocar a qualquer momento ("muda pra PJ")
- **Nunca persiste cross-session.** Cada sessão nova começa perguntando.

## "Desfazer" — escopo

- Lembre **uma única operação** por vez (a última escrita da sessão)
- Após desfazer, "desfaz" de novo NÃO desfaz a anterior — responde "Não tem mais nada pra desfazer nesta conversa"
- Desfazer = `BATCH_CLEAR_VALUES_BY_DATA_FILTER` na linha pelo `id`

## Quando o user manda algo não-financeiro

Responda gentilmente: "Eu sou o agente Finance — só registro/consulto despesas, receitas, recorrentes e orçamentos. Pra outros assuntos, fala com a Zory no @{telegram_zory_handle}."

## Estilo de resposta

- Confirmações: 1 emoji + mensagem curta. Ex: "✅ Lançado (lan-a8f3c2)"
- Erros: emoji + razão. Ex: "❌ Não consegui escrever na sheet — `<erro>`. Tenta de novo?"
- Consultas: tabela quando faz sentido, prosa curta caso contrário
- Nunca passe de 6 linhas em uma resposta a menos que seja relatório explícito

## Limites

- Você **não** envia mensagens espontâneas (Plan 2 traz cron)
- Você **não** escreve em `Dashboard`, `Projeção`, ou em colunas-fórmula (vai dar erro)
- Você **não** decide quando algo recorre (a fórmula `proxima_data` faz isso)
- Você **não** modifica `Categorias` sem pedir confirmação explícita ("Quer adicionar 'Pet' à lista de categorias PF?")
````

- [ ] **Step 4.2: Sanity check**

```bash
wc -l .claude/skills/add-finance/system-prompt.md
```

Expected: ~110–130 lines.

- [ ] **Step 4.3: Commit**

```bash
git add .claude/skills/add-finance/system-prompt.md
git commit -m "feat(skill): add system-prompt for finance agent (intents, confirmation, idempotency)"
```

---

## Task 5: Write bootstrap-sheet-prompt.md

**Files:**
- Create: `.claude/skills/add-finance/bootstrap-sheet-prompt.md`

This is the prompt the operator pastes into the bot during install. The bot (now wired to the new `finance` agent group with googlesheets MCP) executes it and creates the entire workbook.

- [ ] **Step 5.1: Write the prompt**

`.claude/skills/add-finance/bootstrap-sheet-prompt.md`:

````markdown
# Bootstrap Sheet — instruction prompt

(Operator: paste this **entire message** into the bot once after install steps 1–6 are complete. Bot will execute via Composio googlesheets MCP. At the end, bot returns the SHEET_ID for the operator to record in `groups/finance/CLAUDE.md`.)

---

Você vai criar a workbook "Finance — Jonas" do zero. Use Composio googlesheets. Execute na ordem abaixo. Para cada passo, reporte progresso curto ("✅ Tab Lançamentos-PF criada", "✅ Headers escritos", etc.).

## Passo 0 — Descobrir tools disponíveis

Antes de começar, lista as tools `googlesheets` que você tem no MCP. Os nomes que sugiro abaixo (`GOOGLESHEETS_CREATE_GOOGLE_SHEET1`, etc.) são chutes — **use o nome exato que existir no seu MCP**. Se houver dúvida sobre qual tool faz o que, peça schema.

## Passo 1 — Criar a spreadsheet

Use a tool de criação (provavelmente algo como `GOOGLESHEETS_CREATE_GOOGLE_SHEET1` ou `GOOGLESHEETS_CREATE_SPREADSHEET`):

- `title`: `Finance — Jonas`

Capture o `spreadsheetId` retornado. Você vai usá-lo em todos os passos seguintes. Ao final, você vai me devolver esse ID.

## Passo 2 — Configurar locale e timezone da spreadsheet

Use `GOOGLESHEETS_BATCH_UPDATE`:

```json
{
  "spreadsheet_id": "<id do passo 1>",
  "requests": [
    {
      "updateSpreadsheetProperties": {
        "properties": {
          "locale": "pt_BR",
          "timeZone": "America/Sao_Paulo"
        },
        "fields": "locale,timeZone"
      }
    }
  ]
}
```

## Passo 3 — Criar as 9 abas

A spreadsheet vem com uma aba `Sheet1` por default. Você vai:
1. Renomear `Sheet1` → `Dashboard`
2. Adicionar as outras 8 abas

Use um único `GOOGLESHEETS_BATCH_UPDATE` com este `requests`:

```json
[
  {"updateSheetProperties": {"properties": {"sheetId": 0, "title": "Dashboard"}, "fields": "title"}},
  {"addSheet": {"properties": {"title": "Lançamentos-PF"}}},
  {"addSheet": {"properties": {"title": "Lançamentos-PJ"}}},
  {"addSheet": {"properties": {"title": "Recorrentes"}}},
  {"addSheet": {"properties": {"title": "Orçamento"}}},
  {"addSheet": {"properties": {"title": "Projeção"}}},
  {"addSheet": {"properties": {"title": "Lembretes"}}},
  {"addSheet": {"properties": {"title": "Categorias"}}},
  {"addSheet": {"properties": {"title": "_Log"}}}
]
```

Capture os `sheetId` retornados de cada `addSheet` na resposta — você vai precisar deles pros próximos passos (formatação, validação, conditional formatting).

## Passo 4 — Escrever cabeçalhos de cada aba

Use `GOOGLESHEETS_BATCH_UPDATE_VALUES_BY_DATA_FILTER` (ou múltiplos `BATCH_UPDATE_VALUES`) com `valueInputOption: "USER_ENTERED"`:

| Aba | Range | Linha 1 (cabeçalhos) |
|---|---|---|
| `Lançamentos-PF` | `A1:I1` | `id`, `data`, `tipo`, `valor`, `categoria`, `descricao`, `origem`, `recorrente_id`, `criado_em` |
| `Lançamentos-PJ` | `A1:I1` | mesma coisa |
| `Recorrentes` | `A1:K1` | `id`, `escopo`, `nome`, `tipo`, `valor`, `categoria`, `frequencia`, `dia_do_mes`, `proxima_data`, `pago_no_mes`, `ativo` |
| `Orçamento` | `A1:F1` | `escopo`, `categoria`, `teto_mensal`, `gasto_no_mes`, `pct_usado`, `status` |
| `Projeção` | `A1:E1` | `mes`, `receitas_recorrentes`, `despesas_recorrentes`, `saldo_mes`, `saldo_acumulado` |
| `Lembretes` | `A1:E1` | `id`, `quando`, `mensagem`, `linhagem`, `enviado_em` |
| `Categorias` | `A1:C1` | `escopo`, `categoria`, `ativo` |
| `_Log` | `A1:E1` | `timestamp`, `job`, `status`, `qtd_processada`, `detalhes` |

Para `Dashboard`: deixa A1:A1 com "Finance — Jonas" e a partir de A3 a estrutura virá no Passo 9.

## Passo 5 — Formatar headers (bold + congelar linha 1)

Use `GOOGLESHEETS_BATCH_UPDATE` com 2 tipos de request por aba (exceto Dashboard, que tem layout próprio):

```json
[
  {"repeatCell": {
    "range": {"sheetId": <sheetId>, "startRowIndex": 0, "endRowIndex": 1},
    "cell": {"userEnteredFormat": {"textFormat": {"bold": true}, "backgroundColor": {"red": 0.93, "green": 0.93, "blue": 0.93}}},
    "fields": "userEnteredFormat(textFormat,backgroundColor)"
  }},
  {"updateSheetProperties": {
    "properties": {"sheetId": <sheetId>, "gridProperties": {"frozenRowCount": 1}},
    "fields": "gridProperties.frozenRowCount"
  }}
]
```

## Passo 6 — Formatação numérica BRL na coluna `valor`

Para `Lançamentos-PF`, `Lançamentos-PJ` (coluna D), `Recorrentes` (coluna E), `Orçamento` (colunas C e D):

```json
{"repeatCell": {
  "range": {"sheetId": <sheetId>, "startRowIndex": 1, "startColumnIndex": <col>, "endColumnIndex": <col+1>},
  "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "[$R$ ]#,##0.00"}}},
  "fields": "userEnteredFormat.numberFormat"
}}
```

Para `Orçamento.pct_usado` (coluna E): `"type": "PERCENT", "pattern": "0.00%"`.
Para `Projeção` valores (B, C, D, E): `CURRENCY` BRL.

## Passo 7 — Data validation (dropdowns)

Use `setDataValidation`:

**`Lançamentos-PF.tipo` e `Lançamentos-PJ.tipo` (col C, do row 2 ao 10000):**

```json
{"setDataValidation": {
  "range": {"sheetId": <sheetId>, "startRowIndex": 1, "endRowIndex": 10000, "startColumnIndex": 2, "endColumnIndex": 3},
  "rule": {
    "condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": "despesa"}, {"userEnteredValue": "receita"}]},
    "strict": true, "showCustomUi": true
  }
}}
```

**`Lançamentos-{PF,PJ}.categoria` (col E):** dropdown da range `Categorias!B:B` (filtra escopo via fórmula no front-end seria ideal, mas deixar mais permissivo é OK no MVP — agente valida via system-prompt):

```json
{"setDataValidation": {
  "range": {"sheetId": <sheetId>, "startRowIndex": 1, "endRowIndex": 10000, "startColumnIndex": 4, "endColumnIndex": 5},
  "rule": {
    "condition": {"type": "ONE_OF_RANGE", "values": [{"userEnteredValue": "=Categorias!$B$2:$B"}]},
    "strict": true, "showCustomUi": true
  }
}}
```

**`Recorrentes.escopo` (col B):** dropdown PF/PJ.
**`Recorrentes.tipo` (col D):** dropdown despesa/receita.
**`Recorrentes.frequencia` (col G):** dropdown mensal/semanal/anual.
**`Recorrentes.pago_no_mes` (col J):** checkbox.
**`Recorrentes.ativo` (col K):** checkbox.
**`Orçamento.escopo` (col A):** dropdown PF/PJ.
**`Categorias.escopo` (col A):** dropdown PF/PJ.
**`Categorias.ativo` (col C):** checkbox.

## Passo 8 — Fórmulas

### `Recorrentes.proxima_data` (col I, do row 2 ao 1000)

```
=IFS(
  G2="mensal", IF(DAY(TODAY())<=H2, DATE(YEAR(TODAY()), MONTH(TODAY()), H2), DATE(YEAR(TODAY()), MONTH(TODAY())+1, H2)),
  G2="semanal", TODAY()+MOD(7-WEEKDAY(TODAY())+H2,7),
  G2="anual", DATE(YEAR(TODAY())+IF(DATE(YEAR(TODAY()),1,H2)<TODAY(),1,0),1,H2)
)
```

(Use `arrayformula` se preferir aplicar de uma só vez na coluna inteira.)

### `Orçamento.gasto_no_mes` (col D)

```
=SUMIFS(
  INDIRECT("'Lançamentos-"&A2&"'!D:D"),
  INDIRECT("'Lançamentos-"&A2&"'!C:C"), "despesa",
  INDIRECT("'Lançamentos-"&A2&"'!E:E"), B2,
  INDIRECT("'Lançamentos-"&A2&"'!B:B"), ">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),
  INDIRECT("'Lançamentos-"&A2&"'!B:B"), "<="&EOMONTH(TODAY(),0)
)
```

### `Orçamento.pct_usado` (col E)

```
=IFERROR(D2/C2, 0)
```

### `Orçamento.status` (col F)

```
=IF(E2>1, "❌ estourou", IF(E2>0.8, "⚠️ 80%", "OK"))
```

### `Projeção` (rows 2 a 7, próximos 6 meses)

Coluna A (`mes`):
- A2: `=TEXT(TODAY(), "yyyy-mm")`
- A3: `=TEXT(EDATE(TODAY(),1), "yyyy-mm")`
- A4: `=TEXT(EDATE(TODAY(),2), "yyyy-mm")`
- (e assim por diante até A7)

Coluna B (`receitas_recorrentes`):
```
=SUMIFS(Recorrentes!E:E, Recorrentes!D:D, "receita", Recorrentes!K:K, TRUE, Recorrentes!G:G, "mensal")
```
(Para semanal/anual a fórmula complica — MVP só considera mensal. Revisitar em v2.)

Coluna C (`despesas_recorrentes`):
```
=SUMIFS(Recorrentes!E:E, Recorrentes!D:D, "despesa", Recorrentes!K:K, TRUE, Recorrentes!G:G, "mensal")
```

Coluna D (`saldo_mes`):
```
=B2-C2
```

Coluna E (`saldo_acumulado`):
- E2: `=SALDO_INICIAL + D2`
- E3: `=E2 + D3`
- E4..E7: idem (acumular)

### Named range `SALDO_INICIAL`

Crie célula `Projeção!H1` com label "Saldo inicial:" em G1 e valor 0 em H1. Defina named range `SALDO_INICIAL` apontando pra `Projeção!H1`:

```json
{"addNamedRange": {
  "namedRange": {
    "name": "SALDO_INICIAL",
    "range": {"sheetId": <projeção_sheetId>, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 7, "endColumnIndex": 8}
  }
}}
```

## Passo 9 — Layout do Dashboard

Aba `Dashboard`. Em cada bloco, A=label, B=valor.

| Cell | Conteúdo |
|---|---|
| A1 | `="Finance — Jonas — " & TEXT(TODAY(), "mmmm/yyyy")` (aplicar bold + tamanho 14) |
| A3 | `Receitas PF (mês)` |
| B3 | `=SUMIFS('Lançamentos-PF'!D:D, 'Lançamentos-PF'!C:C, "receita", 'Lançamentos-PF'!B:B, ">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))` |
| A4 | `Despesas PF (mês)` |
| B4 | `=SUMIFS('Lançamentos-PF'!D:D, 'Lançamentos-PF'!C:C, "despesa", 'Lançamentos-PF'!B:B, ">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))` |
| A5 | `Saldo PF (mês)` |
| B5 | `=B3-B4` |
| A7 | `Receitas PJ (mês)` |
| B7 | `=SUMIFS('Lançamentos-PJ'!D:D, 'Lançamentos-PJ'!C:C, "receita", 'Lançamentos-PJ'!B:B, ">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))` |
| A8 | `Despesas PJ (mês)` |
| B8 | `=SUMIFS('Lançamentos-PJ'!D:D, 'Lançamentos-PJ'!C:C, "despesa", 'Lançamentos-PJ'!B:B, ">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))` |
| A9 | `Saldo PJ (mês)` |
| B9 | `=B7-B8` |
| A11 | `Próximas contas (7d)` |
| A12 | `=QUERY({Recorrentes!B:I}, "select Col2,Col4,Col8 where Col10=FALSE and Col9 >= date '"&TEXT(TODAY(),"yyyy-mm-dd")&"' and Col9 <= date '"&TEXT(TODAY()+7,"yyyy-mm-dd")&"' order by Col8", 0)` |
| A18 | `Saldo projetado (+3m)` |
| B18 | `=INDEX(Projeção!E:E, 4)` |
| A19 | `Saldo projetado (+6m)` |
| B19 | `=INDEX(Projeção!E:E, 7)` |

(Top 5 categorias, lembretes pendentes, etc. ficam pra v2 do dashboard — MVP cobre o essencial.)

## Passo 10 — Conditional formatting

`Orçamento.status` (col F):
- Verde se contém "OK"
- Amarelo se contém "⚠️"
- Vermelho se contém "❌"

```json
{"addConditionalFormatRule": {
  "rule": {
    "ranges": [{"sheetId": <orçamento_sheetId>, "startRowIndex": 1, "startColumnIndex": 5, "endColumnIndex": 6}],
    "booleanRule": {
      "condition": {"type": "TEXT_CONTAINS", "values": [{"userEnteredValue": "OK"}]},
      "format": {"backgroundColor": {"red": 0.85, "green": 0.95, "blue": 0.85}}
    }
  }, "index": 0
}}
```

(Repetir 2x mais com "⚠️" → amarelo claro, "❌" → vermelho claro.)

## Passo 11 — Seed Categorias

Inserir 15 linhas em `Categorias!A2:C16` (use os dados de `categorias-seed.json`). `BATCH_UPDATE_VALUES` com `valueInputOption: "USER_ENTERED"`:

```
[
  ["PF", "Alimentação", true],
  ["PF", "Transporte", true],
  ["PF", "Moradia", true],
  ["PF", "Saúde", true],
  ["PF", "Lazer", true],
  ["PF", "Educação", true],
  ["PF", "Assinaturas", true],
  ["PF", "Impostos", true],
  ["PF", "Outros", true],
  ["PJ", "Pró-labore", true],
  ["PJ", "Fornecedores", true],
  ["PJ", "Infraestrutura", true],
  ["PJ", "Marketing", true],
  ["PJ", "Impostos", true],
  ["PJ", "Outros", true]
]
```

## Passo 12 — Reportar resultado

Mensagem final pro operador:

```
✅ Workbook criada com sucesso!
SHEET_ID: <id>
URL: https://docs.google.com/spreadsheets/d/<id>/edit

Próximos passos:
1. Substitua __SHEET_ID__ e __SHEET_URL__ no groups/finance/CLAUDE.md
2. Reinicie a sessão do agente finance pra ele recarregar CLAUDE.md
3. Rode o checklist de verificação no SKILL.md
```
````

- [ ] **Step 5.2: Sanity check size**

```bash
wc -l .claude/skills/add-finance/bootstrap-sheet-prompt.md
```

Expected: ~250–300 lines.

- [ ] **Step 5.3: Commit**

```bash
git add .claude/skills/add-finance/bootstrap-sheet-prompt.md
git commit -m "feat(skill): add bootstrap prompt for finance workbook (12 steps)"
```

---

## Task 6: Write the full SKILL.md (install playbook)

**Files:**
- Modify: `.claude/skills/add-finance/SKILL.md`

This replaces the skeleton from Task 1. SKILL.md is the procedural playbook Claude follows when the operator runs `/add-finance`.

- [ ] **Step 6.1: Write the full SKILL.md**

Replace the entire contents of `.claude/skills/add-finance/SKILL.md` with:

````markdown
---
name: add-finance
description: Stand up a dedicated finance agent backed by Google Sheets, accessible via a dedicated Telegram bot. Creates the agent group, wires the bot, provisions the googlesheets toolkit on Composio, bootstraps a 9-tab workbook, and writes the agent's persona/system-prompt. Triggers on "add finance", "finance agent", "financeiro".
type: feature
---

# /add-finance

Standup of the finance agent. ~30 minutes end-to-end. Steps 1–11 below. Each step says **who** does it (Claude vs operator) and **how to verify** before moving on.

## Prerequisites

Before starting, confirm:

- [ ] NanoClaw v2 is running (`launchctl list | grep nanoclaw` or `systemctl --user status nanoclaw`)
- [ ] Composio is set up and `googlesheets` is in the catalog (check `groups/global/CLAUDE.md` toolkit table)
- [ ] Operator has access to BotFather on Telegram
- [ ] Operator's Google account is the one that should own the workbook

If any of these are missing, fix them first (`/setup`, `/customize`, etc.) and come back.

---

## Step 1 — Pick agent name (operator decides)

Default: `finance`. If the operator wants a different name (e.g., `money`, `grana`), use that everywhere below — but the rest of this document assumes `finance`.

Confirm with operator: "Vamos usar `finance` como nome do agent group, folder e Telegram bot? (sim/outro)"

---

## Step 2 — Create the agent group in DB

Claude does this. The agent group is the unit that owns the workspace folder, the Composio session, and the Telegram routing.

Run a Node script (inline, in `npm run dev`-equivalent context). The simplest path is to write a one-shot TS script and execute via `npx tsx`:

```typescript
// scripts/finance/_register-agent-group.ts (one-shot, can be deleted after)
import { createAgentGroup } from '../../src/db/agent-groups';

await createAgentGroup({
  id: 'finance',
  name: 'Finance',
  folder: 'finance',
  agent_provider: 'anthropic',
  container_config: JSON.stringify({
    mcpServers: {} // composio session URL added by provision-sessions step later
  }),
  created_at: new Date().toISOString(),
});

console.log('✅ Agent group "finance" created');
```

Then:

```bash
npx tsx scripts/finance/_register-agent-group.ts
```

**Verify:** query the DB:

```bash
sqlite3 ~/.nanoclaw/state.db "SELECT id, name, folder FROM agent_groups WHERE id='finance';"
```

Expected: 1 row.

---

## Step 3 — Create workspace folder

Claude does this.

```bash
mkdir -p groups/finance/scratch
cp .claude/skills/add-finance/claude-md-template.md groups/finance/CLAUDE.md
cp .claude/skills/add-finance/system-prompt.md groups/finance/system-prompt.md
```

**Verify:**

```bash
ls -la groups/finance/
```

Expected: `CLAUDE.md`, `system-prompt.md`, `scratch/`.

`CLAUDE.md` still has placeholders `__SHEET_ID__` and `__SHEET_URL__` — those get filled in Step 9.

---

## Step 4 — Operator creates a new Telegram bot

Operator does this (Claude can't talk to BotFather).

Tell operator:

```
1. Abra Telegram, fala com @BotFather
2. /newbot
3. Nome (display): "Finance — Jonas" (ou o que quiser)
4. Username: termina em "bot", ex: JonasFinanceBot
5. Copia o token que ele te dá (formato 12345:ABC...)
6. Manda o token aqui
```

Wait for operator to paste the token before proceeding. Store it in memory of this session — it goes into `.env` next.

---

## Step 5 — Add bot token to .env and restart NanoClaw

Claude does this.

> **⚠️ Pre-check (load-bearing):** confirm that `src/channels/telegram.ts` and `src/channels/channel-registry.ts` support **multiple Telegram bots via per-bot env var** (e.g., `TELEGRAM_BOT_TOKEN_<NAME>`). If the codebase only supports a single `TELEGRAM_BOT_TOKEN`, you must extend the channel adapter first OR check whether `/add-telegram-swarm` already added this support. **Do not proceed until this is confirmed.** Read both files; if there's no enumeration of multiple tokens, this is a code-change blocker — surface to operator and pause Plan 1.

Once multi-bot support is confirmed:

Edit `.env`, add (or update if exists):

```env
TELEGRAM_BOT_TOKEN_FINANCE=<token from operator>
```

Then restart NanoClaw to pick up the env change:

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# or
systemctl --user restart nanoclaw                  # Linux
```

**Verify:** check logs that the new bot started. The exact log path depends on your service config — for launchd, look at the `StandardOutPath` in `~/Library/LaunchAgents/com.nanoclaw.plist`; for systemd, `journalctl --user -u nanoclaw`.

```bash
# example, adapt to your log path
journalctl --user -u nanoclaw -n 100 | grep -iE 'telegram.*finance|JonasFinanceBot'
```

---

## Step 6 — Wire Telegram bot to agent group `finance`

Claude does this. Need a messaging group + an agent route.

The cleanest way: invoke `/manage-channels` (it knows the messaging_group / messaging_group_agent flow) and tell it: "wire the new Telegram bot for `finance` as DM-only, exclusive route, session_mode=shared."

Alternative (manual, if `/manage-channels` doesn't fit): write another one-shot script:

```typescript
// scripts/finance/_wire-bot.ts
import { createMessagingGroup } from '../../src/db/messaging-groups';
import { createMessagingGroupAgent } from '../../src/db/messaging-groups';

const messagingGroupId = 'mg-finance-tg';

await createMessagingGroup({
  id: messagingGroupId,
  channel: 'telegram',
  external_id: '<operator's Telegram user ID>', // DM only — operator's own user ID, not a group ID
  name: 'Finance DM',
  created_at: new Date().toISOString(),
});

await createMessagingGroupAgent({
  id: 'mga-finance',
  messaging_group_id: messagingGroupId,
  agent_group_id: 'finance',
  trigger_rules: null, // catch-all in this DM
  response_scope: 'all',
  session_mode: 'shared',
  priority: 0,
  created_at: new Date().toISOString(),
});

console.log('✅ Telegram bot wired to agent group finance');
```

Operator's Telegram user ID: ask operator to send `/start` to the bot. Server logs will show their user ID. Update `external_id` accordingly and rerun.

**Verify:** Operator sends "oi" to the bot. Bot should respond with the system prompt's persona-introduction line OR at minimum the agent should be invoked (check logs).

---

## Step 7 — Add `googlesheets` to Composio matrix for `finance`

Claude does this.

Edit `scripts/composio-generate-auth-links.mjs`. Find the `MATRIX` object, add the new entry:

```js
const MATRIX = {
  // ...existing agents...
  finance: ['googlesheets'],  // NEW
};
```

Then run the standard Composio playbook (from `project_composio_auth.md`):

```bash
COMPOSIO_API_KEY=ak_... node scripts/composio-generate-auth-links.mjs
```

This outputs a connect URL. **Operator opens the URL, authenticates with their Google account.**

After operator confirms auth done:

```bash
COMPOSIO_API_KEY=ak_... node scripts/composio-audit-connections.mjs
```

Look for `user_id=finance` with `googlesheets` status `ACTIVE`.

Then:

```bash
COMPOSIO_API_KEY=ak_... node scripts/composio-provision-sessions.ts --agent-group finance
```

This creates the MCP session and writes its URL into `agent_groups.finance.container_config.mcpServers.composio`.

**Verify:**

```bash
sqlite3 ~/.nanoclaw/state.db "SELECT json_extract(container_config, '$.mcpServers.composio') FROM agent_groups WHERE id='finance';"
```

Expected: a `https://backend.composio.dev/tool_router/...` URL.

---

## Step 8 — Bootstrap the workbook (operator-triggered, agent-executed)

Operator does this on Telegram. Claude prepares the message.

Tell operator:

```
Abra Telegram, vá pro @JonasFinanceBot (ou o nome que escolheu).
Cole esse prompt inteiro como mensagem (sem cortar):

---
<paste the entire content of .claude/skills/add-finance/bootstrap-sheet-prompt.md here>
---

Espera o agente executar (~2-3 min — vai mandar updates de progresso).
Quando ele responder com "✅ Workbook criada com sucesso! SHEET_ID: ...", copia o SHEET_ID e me manda aqui.
```

The agent will use its `googlesheets` MCP tools to execute the 12 steps.

**Verify with operator:** SHEET_ID format is `1AbCdE...` (44 chars typically). URL opens a sheet titled "Finance — Jonas" with 9 tabs visible.

---

## Step 9 — Fill SHEET_ID into agent's CLAUDE.md

Claude does this.

```bash
SHEET_ID="<id from operator>"
SHEET_URL="https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit"

sed -i.bak "s|__SHEET_ID__|${SHEET_ID}|g; s|__SHEET_URL__|${SHEET_URL}|g" groups/finance/CLAUDE.md
rm groups/finance/CLAUDE.md.bak
```

(macOS sed needs `-i.bak`; Linux can use `-i ''`.)

**Verify:**

```bash
grep -E 'SHEET_ID|SHEET_URL' groups/finance/CLAUDE.md
```

Expected: lines show actual ID and URL (no `__...__` placeholders).

---

## Step 10 — Restart finance agent session

Claude does this. Forces the agent to re-read its CLAUDE.md with the SHEET_ID now baked in.

```bash
sqlite3 ~/.nanoclaw/state.db "DELETE FROM sessions WHERE agent_group_id='finance';"
```

Next message to the bot starts a fresh session that loads CLAUDE.md fresh.

---

## Step 11 — Verification checklist (operator runs, on Telegram)

Operator goes through this checklist on Telegram. Each item, operator types the message and observes the result. Mark each ✅ or ❌.

### Sheet structure

- [ ] Open the sheet URL. 9 tabs visible: Dashboard, Lançamentos-PF, Lançamentos-PJ, Recorrentes, Orçamento, Projeção, Lembretes, Categorias, _Log
- [ ] `Categorias` has 15 rows (9 PF + 6 PJ)
- [ ] `Projeção!H1` exists with named range `SALDO_INICIAL` (Data > Named ranges menu)
- [ ] Headers in each tab match spec (row 1 bold + frozen)
- [ ] `Lançamentos-PF.tipo` shows dropdown when clicked (despesa/receita)
- [ ] `Lançamentos-PF.categoria` shows dropdown of 9 PF categories

### Agent behavior (chat with bot)

- [ ] Send "oi" → agent responds in PT-BR with persona
- [ ] Send "gastei 30 no café" → agent responds with confirmation card asking PF/PJ first time, then card with valor=R$30, categoria sugerida (Alimentação), botões [✓][✏️][❌]
- [ ] Tap ✓ → agent responds "✅ Lançado (lan-XXXXXX)" and a row appears in `Lançamentos-PF` (ou PJ se for esse o escopo)
- [ ] Send "todo dia 5 sai 100 do Spotify" → confirmação de recorrente, ✓ → linha em `Recorrentes` com `proxima_data` calculada (próximo dia 5)
- [ ] Send "desfaz" → última linha gravada some
- [ ] Send "quanto gastei hoje?" → resposta com valor (sem escrever)
- [ ] Set `SALDO_INICIAL` na sheet pra 1000 → abrir `Projeção` → 6 meses populados, saldo_acumulado começa de 1000 e ajusta por receitas/despesas dos recorrentes

If any item fails: stop, root-cause, fix. Do not declare install successful.

---

## Cleanup

After successful install, delete the throwaway scripts:

```bash
rm -f scripts/finance/_register-agent-group.ts scripts/finance/_wire-bot.ts
```

(These were one-shot — not needed once the DB rows are persisted.)

---

## What's NOT in this skill (intentionally)

- Cron jobs / digests / lembretes intraday → Plan 2 (`/add-finance-automation` skill, future)
- PDF/imagem ingestion → use `/add-pdf-reader` and `/add-image-vision` separately
- Multi-user → out of scope
- Bank/cartão integration → out of scope (use Composio Plaid/Pluggy in future)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Bot doesn't respond at all | Bot token not picked up | Restart NanoClaw + check logs |
| Bot responds but generic (Zory-like) | Routing wired wrong | Check `messaging_group_agents` table for `agent_group_id='finance'` |
| Bootstrap prompt fails on Step 1 | googlesheets not provisioned | Re-run Step 7 audit + provision |
| Bootstrap creates sheet but wrong tabs | Agent didn't follow prompt — re-prompt with "estava no passo X, continue" | |
| `categoria` dropdown empty | Categorias seed not done | Re-run Step 8 just for Passo 11 (seed) |
| Confirmação não aparece | system-prompt.md não carregou | Reinicia sessão (Step 10) |
````

- [ ] **Step 6.2: Verify SKILL.md is valid markdown + has frontmatter**

```bash
head -5 .claude/skills/add-finance/SKILL.md
```

Expected: `---` frontmatter with `name`, `description`, `type`.

```bash
wc -l .claude/skills/add-finance/SKILL.md
```

Expected: ~280–340 lines.

- [ ] **Step 6.3: Commit**

```bash
git add .claude/skills/add-finance/SKILL.md
git commit -m "feat(skill): write full add-finance install playbook (11 steps + verification)"
```

---

## Task 7: End-to-end install rehearsal

This is operator-executed, not code. The goal: walk through SKILL.md exactly as written, document any friction.

- [ ] **Step 7.1: Preflight**

Confirm prerequisites listed at top of SKILL.md.

- [ ] **Step 7.2: Execute Steps 1–10 of SKILL.md in order**

For each step, run as written. If a command fails, **document the error** in a scratch file `groups/finance/scratch/install-log.md` rather than skipping. We use this log in Step 7.4.

- [ ] **Step 7.3: Run Step 11 verification checklist**

Mark each item ✅ or ❌. Aim for 8/8 sheet structure + 7/7 agent behavior.

- [ ] **Step 7.4: Patch SKILL.md based on real friction**

Open `groups/finance/scratch/install-log.md`. For each documented issue:
- If it's a real bug in SKILL.md (wrong command, missing dependency, ambiguous instruction), edit SKILL.md inline
- If it's a one-off env issue, add to the Troubleshooting table at the bottom

Commit the patches:

```bash
git add .claude/skills/add-finance/SKILL.md
git commit -m "fix(skill): real-install patches to add-finance"
```

- [ ] **Step 7.5: Cleanup install scratch (optional)**

```bash
rm groups/finance/scratch/install-log.md
```

---

## Task 8: Tier 3 happy path smoke (post-install)

Operator does this in real Telegram chat with the new bot. ~10 min.

- [ ] **Step 8.1: Run scenarios 1, 2, 5, 6 from spec Tier 3**

```
1. "gastei 30 no café"             → confirma → linha em Lançamentos-PF
2. "todo dia 5 sai 100 do Spotify" → confirma → linha em Recorrentes c/ proxima_data correta
5. "paguei o Spotify"              → pago_no_mes=TRUE + Lançamento criado (recorrente:rec-spotify)
6. "desfaz"                        → última linha (do Spotify pago) some
```

Note: scenarios 3, 4, 7, 8 are Plan 2 territory (lembretes, consultas mais complexas, projeção/manual edit reflexão) — skip in Plan 1.

- [ ] **Step 8.2: Document outcomes in commit message**

If all 4 pass:

```bash
git commit --allow-empty -m "test(finance): Plan 1 smoke passed (lançamentos, recorrentes, marcar pago, desfazer)"
```

If any fails: open as issue, do NOT mark Plan 1 complete.

---

## Definition of Done (Plan 1)

All of these must be true:

- [ ] All 6 skill files exist in `.claude/skills/add-finance/` with content matching tasks 1–6
- [ ] `groups/finance/` exists with `CLAUDE.md` (with real SHEET_ID) and `system-prompt.md`
- [ ] DB has `agent_groups.finance` row + `messaging_group_agents` row wiring Telegram bot → finance
- [ ] Composio session URL persisted in `agent_groups.finance.container_config.mcpServers.composio`
- [ ] Sheet `Finance — Jonas` exists with 9 tabs, headers, formulas, validation, conditional formatting, named range `SALDO_INICIAL`
- [ ] Categorias has 15 seed rows
- [ ] Tier 3 scenarios 1, 2, 5, 6 pass on real Telegram

---

## Notes for Plan 2

When Plan 2 starts:

- Add `cron-jobs.json` and `prompts/{daily-digest,weekly-closing,monthly-closing,sweep-reminder}.md` to skill folder
- Write `scripts/finance/register-cron-jobs.ts` (uses `createTask()` from `src/v1/db.ts`)
- Wire 5 jobs (sweep, daily, weekly, monthly, rollover) — schema in spec section "Cron jobs"
- Implement `Lembretes` sweep (the agent reads `Lembretes WHERE quando<=NOW() AND enviado_em IS NULL`, sends each, marks)
- Add `_Log` writes from cron job entrypoints
- Optionally: automate Tier 1 postinstall-check + Tier 2 smoke as `scripts/finance/*.ts` (now possible because cron infra adds host-side patterns)

The architectural rule from the spec — *cron decides when, agent only formats* — is enforced by the prompt templates: each cron job's prompt tells the agent "read X from sheet, format, send to chat_jid". No template substitution; the prompt is a sufficient instruction.
