---
name: naia-tracker-sheets
description: Schema operacional e protocolos de leitura/escrita do tracker da Naia no NOTION (6 databases sob "Base | Pessoal"). Use SEMPRE que: (1) precisar registrar uma pesagem da balança Leach (foto ou números soltos); (2) Jonas mandar mensagem de fim de dia descrevendo o que comeu/bebeu/dormiu; (3) Jonas avisar que aplicou o Monjaro semanal; (4) chegar resultado de exame laboratorial; (5) houver decisão clínica nova (Dra. Natália / Isabela) pra registrar na timeline; (6) registrar refeição no fluxo foto→prato; (7) precisar consultar histórico de peso, adesão, sintomas. Carregue antes de chamar o helper `notion-db` no contexto da Naia.
---

# Naia Tracker — Schema operacional do Notion

Documento de referência pra ler e escrever no tracker pessoal do Jonas, que vive no **Notion** (6 databases). **Sempre carregue antes de gravar** — o schema é fixo; chutar campo gera dado quebrado.

> O tracker antigo no Google Sheets está **CONGELADO**. Não escreve, não lê, não cita Sheets/Composio/`gsheets`/`sheets_api`. Notion é a única fonte de verdade.

## Acesso

- **Helper:** `python3 /app/skills/notion-db/scripts/notion_db.py --schema /workspace/agent/migration/schema.naia.json <verbo>`
- **Auth:** automática pelo gateway OneCLI (injeta o bearer do Notion). **Nunca** mande header de Authorization, nunca peça token ao Jonas.
- **Verbos:** `create-row <db> --json '{...}'` · `query <db> [--filter campo=valor]` · `update <db> --match <campo>=<valor> --json '{...}'` · `archive <db> --match <campo>=<valor>`. Use `--dry-run` em qualquer escrita pra ver o payload antes.
- **Payload:** `--json` é **plano** (`{"campo":"valor"}`); nomes lógicos dos campos = nomes de coluna antigos; **todos os valores são strings**. Os databases **não têm coluna `id`** — case/atualize/arquive pela chave natural (o title de cada DB).
- **Time zone:** America/Recife (UTC-3). **Data:** `YYYY-MM-DD`. **Hora:** `HH:MM` 24h.

```bash
PY=/app/skills/notion-db/scripts/notion_db.py
SCHEMA=/workspace/agent/migration/schema.naia.json
```

## Mapa rápido dos 6 databases

| DB key | Chave (title/match) | Você ESCREVE? | Quando |
|---|---|---|---|
| `pesagens` | `data` | ✅ create-row | foto da balança Leach ou pesagem manual |
| `diario` | `data` | ✅ create-row / update | mensagem de fim de dia parseada |
| `refeicoes` | `descricao` | ✅ create-row | fluxo foto→prato (1 linha por prato) |
| `monjaro` | `data_aplicacao` | ✅ create-row | aplicação semanal do Monjaro |
| `exames` | `exame` | ✅ create-row | cada marcador de cada coleta |
| `eventos_clinicos` | `tema` | ✅ create-row | decisão clínica (consulta, ajuste, plano novo) |

---

## DB `pesagens` — schema completo

**Granularidade:** uma linha por pesagem completa na balança Leach. **Chave (title):** `data`.

**31 campos.** Os 4 `delta_*` são snapshots históricos — **recompute na hora** comparando com a pesagem anterior (`query`); grave como texto se quiser. Os demais 27 + `obs` você preenche.

| # | Campo | Tipo | Origem |
|---:|---|---|---|
| 1 | `data` | YYYY-MM-DD (title) | mensagem do Jonas ou EXIF da foto |
| 2 | `hora` | HH:MM | idem |
| 3 | `peso_kg` | número (1 casa) | balança |
| 4 | `musculo_kg` | número (1 casa) | balança |
| 5 | `gordura_kg` | número (1 casa) | balança |
| 6 | `gordura_pct` | número (1 casa) | balança |
| 7 | `imc` | número (1 casa) | balança |
| 8 | `agua_corporal_kg` | número (1 casa) | balança |
| 9 | `tmb_kcal` | número inteiro | balança |
| 10 | `gordura_visceral` | número inteiro (nível °) | balança |
| 11 | `idade_corpo` | número inteiro | balança |
| 12 | `mm_braco_esq_kg` | número (2 casas) | bioimpedância segmentar |
| 13 | `mm_braco_esq_pct` | número (1 casa) | idem |
| 14 | `mm_braco_dir_kg` | número | idem |
| 15 | `mm_braco_dir_pct` | número | idem |
| 16 | `mm_perna_esq_kg` | número | idem |
| 17 | `mm_perna_esq_pct` | número | idem |
| 18 | `mm_perna_dir_kg` | número | idem |
| 19 | `mm_perna_dir_pct` | número | idem |
| 20 | `gor_braco_esq_kg` | número | idem |
| 21 | `gor_braco_esq_pct` | número | idem |
| 22 | `gor_braco_dir_kg` | número | idem |
| 23 | `gor_braco_dir_pct` | número | idem |
| 24 | `gor_perna_esq_kg` | número | idem |
| 25 | `gor_perna_esq_pct` | número | idem |
| 26 | `gor_perna_dir_kg` | número | idem |
| 27 | `gor_perna_dir_pct` | número | idem |
| 28 | `delta_peso_kg` | recomputo na hora | comparar com pesagem anterior |
| 29 | `delta_gordura_kg` | recomputo na hora | idem |
| 30 | `delta_musculo_kg` | recomputo na hora | idem |
| 31 | `delta_visceral` | recomputo na hora | idem |
| — | `obs` | texto livre | suas notas (ex: "primeira pesagem após Monjaro") |

**Gravar:** `python3 $PY --schema $SCHEMA create-row pesagens --json '{"data":"...","hora":"...","peso_kg":"...", ...}'`

### Protocolo de OCR — print da balança Leach

Quando Jonas mandar foto da balança, faça o OCR em duas passadas:

**Passada 1 — corpo principal (visor central):** extrair os 11 campos de medição global (peso até idade do corpo).

**Passada 2 — bioimpedância segmentar:** extrair 16 campos (4 segmentos × 4 valores: massa magra kg/%, gordura kg/%).

Mapeamento direto print → campo:

| Campo na balança | Campo(s) |
|---|---|
| Peso (kg) | `peso_kg` |
| Massa muscular total (kg) | `musculo_kg` |
| Gordura corporal (kg / %) | `gordura_kg`, `gordura_pct` |
| IMC | `imc` |
| Água corporal (kg) | `agua_corporal_kg` |
| Taxa metabólica basal (kcal) | `tmb_kcal` |
| Grau de gordura visceral (°/Nível) | `gordura_visceral` |
| Idade do corpo | `idade_corpo` |
| Massa magra braço esq (kg, %) | `mm_braco_esq_kg`, `mm_braco_esq_pct` |
| Massa magra braço dir (kg, %) | `mm_braco_dir_kg`, `mm_braco_dir_pct` |
| Massa magra perna esq (kg, %) | `mm_perna_esq_kg`, `mm_perna_esq_pct` |
| Massa magra perna dir (kg, %) | `mm_perna_dir_kg`, `mm_perna_dir_pct` |
| Gordura segmentar braço esq (kg, %) | `gor_braco_esq_kg`, `gor_braco_esq_pct` |
| Gordura segmentar braço dir (kg, %) | `gor_braco_dir_kg`, `gor_braco_dir_pct` |
| Gordura segmentar perna esq (kg, %) | `gor_perna_esq_kg`, `gor_perna_esq_pct` |
| Gordura segmentar perna dir (kg, %) | `gor_perna_dir_kg`, `gor_perna_dir_pct` |

**Confirmação antes de gravar:** sempre devolva os números extraídos pro Jonas em formato compacto e peça "ok pra registrar?":

```
Peso 142,7 | gordura 36,1% (51,5kg) | músculo 73,0kg | IMC 41,7 | visceral 19° | idade corpo 48
Bioimpedância: ok extrair também?

Confirma esses valores pra registrar?
```

Se ele responder com correção, ajuste e re-confirme. Só grava após "ok"/"sim"/"manda".

### Leitura comparativa após gravar (OBRIGATÓRIO)

Não basta confirmar "registrado". Sempre puxe a pesagem anterior (`query pesagens`, ordene por `data` desc, pegue a linha antes da atual) e devolva:

```
Pesagem registrada: 142,7 kg em 03/05.
Comparado à última (24/04, 148,2 kg): -5,5 kg em 9 dias.
✅ Massa muscular preservada (delta +0,2 kg).
⚠️ % gordura 36,1% (era 36,3%) — leve queda; visceral ainda em 19°.

Leitura: parte da queda inicial é água. Ritmo a seguir vai ser mais constante.
```

Os `delta_*` você calcula nessa hora (pesagem atual − anterior). Sempre marque com ✅ o que melhorou, ⚠️ o que merece atenção.

---

## DB `diario` — schema completo

**Granularidade:** uma linha por dia. **Chave (title):** `data`.

**34 campos.** `adesao_pct` e os macros do dia (`kcal_total`, `carbo_total_g`, `gordura_total_g`, `proteina_falta_g`) são derivados — você calcula na hora e grava como texto (ou deixa vazio se não der pra estimar).

| # | Campo | Tipo | Notas |
|---:|---|---|---|
| 1 | `data` | YYYY-MM-DD (title) | dia descrito |
| 2 | `cafe_feito` | sim/não | |
| 3 | `cafe_componentes` | texto | "whey, ovo, mamão, chia" |
| 4 | `almoco_feito` | sim/não | |
| 5 | `almoco_proteina_primeiro` | sim/não/vazio | só marca sim se Jonas confirmou |
| 6 | `almoco_componentes` | texto | "frango, arroz integral, salada, abobrinha" |
| 7 | `lanche_feito` | sim/não | |
| 8 | `lanche_componentes` | texto | |
| 9 | `jantar_feito` | sim/não | |
| 10 | `jantar_descricao` | texto | "tapioca com frango" |
| 11 | `jantar_dentro_plano` | sim/não | sim para "lanche-jantar" leve; não para pizza/hambúrguer/etc |
| 12 | `ceia_feita` | sim/não | |
| 13 | `proteina_total_g` | número | estimativa em g (soma das 4 refeições principais) |
| 14 | `agua_ml` | número inteiro | meta diária: ≥1500 ml |
| 15 | `energetico_latas` | número inteiro | meta progressiva: <5 |
| 16 | `doce_qtd` | número inteiro | porções (ex: 2 quadradinhos = 2; 1 brigadeiro = 1) |
| 17 | `doce_descricao` | texto | "2 quadradinhos chocolate 70%" |
| 18 | `besteira_fora_plano` | sim/não | pizza, hambúrguer, fritura, sobremesa pesada |
| 19 | `besteira_descricao` | texto | "2 fatias pizza calabresa" |
| 20 | `intestino` | "ok"/"travado"/"solto" (select) | |
| 21 | `sono_h` | número (1 casa) | horas dormidas |
| 22 | `sono_qualidade_1a5` | inteiro 1–5 | percepção subjetiva |
| 23 | `sintomas_monjaro` | texto | "enjoo leve manhã", "intestino travado", ou vazio |
| 24 | `hipoglicemia` | sim/não | |
| 25 | `hipo_descricao` | texto | "14h30 atrasou almoço, tremedeira" |
| 26 | `atividade_fisica` | texto | "caminhada 20min", "academia", ou vazio |
| 27 | `humor_1a5` | inteiro 1–5 | |
| 28 | `energia_1a5` | inteiro 1–5 | |
| 29 | `adesao_pct` | derivado | recompute na hora |
| 30 | `notas` | texto livre | observações que não encaixam em campo |
| 31 | `kcal_total` | derivado | soma das kcal do dia (via `refeicoes`/foto) |
| 32 | `carbo_total_g` | derivado | idem |
| 33 | `gordura_total_g` | derivado | idem |
| 34 | `proteina_falta_g` | derivado | alvo do plano − `proteina_total_g` |

**Gravar dia novo:** `python3 $PY --schema $SCHEMA create-row diario --json '{"data":"...","cafe_feito":"sim", ...}'`
**Emendar dia já gravado:** `python3 $PY --schema $SCHEMA update diario --match data=<dia> --json '{...}'`

### Protocolo de parsing de fim de dia

Mensagem típica:
> "Hoje café com whey + ovo + mamão, almoço completo, pulei lanche, jantar foi tapioca com frango, 1 doce, 4 energéticos, 700ml de água, dormi 5h, intestino ok, sem hipoglicemia."

Mapeamento:

| Pista linguística | Como preenche |
|---|---|
| "café com X, Y, Z" | `cafe_feito=sim`, `cafe_componentes="X, Y, Z"` |
| "pulei o café" / "não tomei café" | `cafe_feito=não` |
| "almoço completo" | `almoco_feito=sim`; só marque `almoco_proteina_primeiro=sim` se Jonas mencionou ter começado pela proteína |
| "almoço foi X, Y" | `almoco_feito=sim`, `almoco_componentes="X, Y"` |
| "lanche X" / "pulei o lanche" | preenche `lanche_*` |
| "jantar foi X" | `jantar_feito=sim`, `jantar_descricao="X"`, e marque `jantar_dentro_plano` por critério: tapioca/aipim/inhame/pão+patê/peixe leve = SIM; pizza/hambúrguer/fritura/massa pesada = NÃO |
| "1 doce" / "comi um chocolate" | `doce_qtd=1`, `doce_descricao` se especificado |
| "X energéticos" / "X latas" | `energetico_latas=X` |
| "Yml água" / "Y litros" | `agua_ml=Y` (litros × 1000) |
| "dormi Xh" | `sono_h=X` |
| "intestino X" | `intestino=X` |
| "tremedeira" / "suor frio" / "passei mal" / "hipoglicemia" | `hipoglicemia=sim`; pegue contexto (horário, gatilho) e ponha em `hipo_descricao` |
| "comi besteira" / "saí do plano" / "fritei" / "pizza" / "hambúrguer" | `besteira_fora_plano=sim`, `besteira_descricao` |
| "fui treinar" / "caminhei X" | `atividade_fisica="X"` |
| "humor bom/ruim" / "tô animado/desanimado" | `humor_1a5` (1=péssimo, 3=normal, 5=ótimo) — só preencha se ele indicou |
| "tô sem energia" / "energizado" | `energia_1a5` idem |

**Estimativa de proteína** (`proteina_total_g`): some manual dos componentes baseado em `tabela-taco-essencial.md`. Se não der pra estimar (componentes vagos), deixe vazio.

### Confirmação antes de gravar

Sempre reapresenta a interpretação resumida em formato visual:

```
Entendi assim:
✅ Café (whey + ovo + mamão)
✅ Almoço completo
⚠️ Lanche pulado
✅ Jantar — tapioca com frango (dentro do plano)
🍫 1 doce, 🥤 4 energéticos, 💧 700ml água (meta 1500), 😴 5h sono
Sem hipoglicemia, intestino ok.

Posso registrar?
```

Só grava após "ok"/"sim"/"manda". Se Jonas corrigir, ajuste e re-confirme.

### Alertas que disparam APÓS registrar

Sempre que gravar uma linha em `diario`, rode estas checagens:

1. **`hipoglicemia=sim`** → comente o gatilho provável (intervalo longo? salto de refeição?) e lembre o protocolo de socorro do system prompt (Protocolo 9).
2. **`agua_ml < 1000` por 3 dias seguidos** (consulte os últimos 3 dias via `query diario` antes de comentar) → recomende meta semanal de hidratação fracionada.
3. **`energetico_latas > 5`** → reforce o plano gradual de redução (sem cortar abrupto — ele tem dependência cafeínica).
4. **`besteira_fora_plano=sim`** → não julgar; pergunte contexto (foi evento? impulso? estresse?). Aplica Protocolo 7 ou 8 conforme o caso.
5. **`sono_h < 5` por 2 dias seguidos** → comente, mas não cobre — é estrutural pro Jonas.
6. **`almoco_feito=não` ou `lanche_feito=não` em dia útil** → flag de risco hipoglicemia pra próxima janela; sugira lanche estratégico.

Faça **no máximo 1 alerta por gravação** — se tiver vários disparando, escolha o mais crítico (ordem: hipoglicemia > besteira_fora_plano > demais). Não despeje 5 alertas de uma vez.

---

## DB `refeicoes` — schema (fluxo foto→prato)

**Granularidade:** uma linha por prato. **Chave (title):** `descricao`.

**10 campos:**

| # | Campo | Tipo | Notas |
|---:|---|---|---|
| 1 | `data` | YYYY-MM-DD | dia da refeição |
| 2 | `hora` | HH:MM | |
| 3 | `refeicao` | select | café/almoço/lanche/jantar/ceia |
| 4 | `descricao` | texto (title) | "frango grelhado + arroz integral + salada" |
| 5 | `kcal` | número | estimativa |
| 6 | `proteina_g` | número | |
| 7 | `carbo_g` | número | |
| 8 | `gordura_g` | número | |
| 9 | `fonte` | texto | base usada (TACO/USDA/estimativa) |
| 10 | `obs` | texto livre | |

**Gravar:** `python3 $PY --schema $SCHEMA create-row refeicoes --json '{"descricao":"...","data":"...","hora":"...","refeicao":"almoco","kcal":"...","proteina_g":"..."}'`

**Fluxo:** Lobby lê a imagem do prato → me passa os componentes → calculo macros pela base local (`tabela-taco-essencial.md`) → gravo a refeição e atualizo os totais do dia em `diario` (`update diario --match data=<dia>`).

---

## DB `monjaro` — schema

**Granularidade:** uma linha por aplicação semanal. **Chave (title):** `data_aplicacao`.

**7 campos:**

| # | Campo | Tipo | Notas |
|---:|---|---|---|
| 1 | `data_aplicacao` | YYYY-MM-DD (title) | sábado típico |
| 2 | `dose_mg` | número | dose em mg (atual: 7.5) |
| 3 | `local_aplicacao` | texto | "abdômen direito" / "abdômen esquerdo" — Jonas alterna |
| 4 | `efeitos_colaterais` | texto | "enjoo leve dia 2", "intestino travado", vazio se nada |
| 5 | `tomou_vonal` | sim/não | |
| 6 | `intensidade_efeito_1a5` | inteiro 1–5 | 1=imperceptível, 5=incapacitante |
| 7 | `obs` | texto livre | |

**Gravar:** `python3 $PY --schema $SCHEMA create-row monjaro --json '{"data_aplicacao":"...","dose_mg":"7.5","local_aplicacao":"..."}'`

**Trigger:** Jonas avisa "apliquei hoje" (sábado típico) → cria linha. Se ele descrever efeito durante a semana, associe à aplicação anterior (`update monjaro --match data_aplicacao=<sábado>`).

---

## DB `exames` — schema

**Granularidade:** uma linha por marcador laboratorial (não por exame inteiro — explode cada parâmetro). **Chave (title):** `exame`.

**9 campos.** `flag` é texto (alto/baixo/normal) — preencha com base em `resultado` vs `ref_min`/`ref_max`.

| # | Campo | Tipo | Notas |
|---:|---|---|---|
| 1 | `data_coleta` | YYYY-MM-DD | data da coleta de sangue |
| 2 | `exame` | texto (title) | nome do marcador (ex: "Glicemia jejum", "HbA1c", "TSH", "Vit D 25-OH") |
| 3 | `resultado` | número | valor numérico |
| 4 | `unidade` | texto | "mg/dL", "%", "ng/mL", "UI/mL" |
| 5 | `ref_min` | número | limite inferior do laboratório |
| 6 | `ref_max` | número | limite superior |
| 7 | `flag` | alto/baixo/normal (select) | calcule você |
| 8 | `medico_solicitante` | texto | "Dra. Natália" típico |
| 9 | `obs` | texto livre | |

**Gravar:** `python3 $PY --schema $SCHEMA create-row exames --json '{"exame":"Glicemia jejum","data_coleta":"...","resultado":"92","unidade":"mg/dL","ref_min":"70","ref_max":"99","flag":"normal"}'`

> Atenção: a chave é `exame` (nome do marcador). Se a mesma coleta tiver o mesmo marcador em datas diferentes, distinga no nome ou no `data_coleta` ao consultar. Para uma nova coleta, crie linhas novas; não sobrescreva o histórico.

**Trigger:** Jonas manda PDF/foto/texto de resultado. Decomponha cada marcador numa linha. Leia o PDF/imagem direto (o Lobby repassa o anexo).

**Após gravar todos os marcadores de uma coleta:** faça uma síntese — quais flags acenderam (alto/baixo) e o que cada um sugere clinicamente. Sem diagnosticar — só descrever. Se houver flag relevante, sinalize "mostra pra Dra. Natália".

---

## DB `eventos_clinicos` — schema

**Granularidade:** timeline livre — uma linha por evento relevante. **Chave (title):** `tema`.

**6 campos:**

| # | Campo | Tipo | Notas |
|---:|---|---|---|
| 1 | `data` | YYYY-MM-DD | |
| 2 | `profissional` | select | "Dra. Natália" / "Isabela" / "Naia" / "Jonas" |
| 3 | `tipo` | select | `consulta`, `ajuste_dose`, `plano_novo`, `intercorrencia`, `decisao`, `meta_atingida` |
| 4 | `tema` | texto (title) | título curto (ex: "Aumento Monjaro 5→7,5 mg") |
| 5 | `decisao_acao` | texto | resumo do que foi decidido / ação |
| 6 | `obs` | texto livre | |

**Gravar:** `python3 $PY --schema $SCHEMA create-row eventos_clinicos --json '{"tema":"...","data":"...","profissional":"Dra. Natália","tipo":"ajuste_dose","decisao_acao":"..."}'`

**Triggers principais:**
- Jonas relata fala da Dra. Natália → linha com `profissional="Dra. Natália"`, `tipo` apropriado
- Plano alimentar novo da Isabela chega → linha `tipo=plano_novo` + você atualiza `plano-vigente.md` (ver `system-prompt.md`)
- Meta atingida (135, 118, 110, 98–106) → linha `tipo=meta_atingida` + atualiza `perfil-clinico.md`
- Intercorrência (hipoglicemia recorrente, efeito Monjaro persistente) que escalou → linha `tipo=intercorrencia`

---

## Convenções de escrita (todos os databases)

1. **Sempre em America/Recife** — converta horários relativos ("agora", "hoje cedo") pra HH:MM local.
2. **Datas sem hora** = `YYYY-MM-DD`.
3. **Valores são strings.** Decimal: exiba com vírgula pro Jonas (142,7 kg), mas no `--json` mande a string como você quer que apareça na célula (ponto ou vírgula, consistente com o histórico migrado).
4. **Booleanos** sempre minúsculos: `sim` / `não` (com til).
5. **Texto livre vazio** = string vazia (`""`), não `null` nem `N/A`.
6. **Append por padrão** (`create-row`). Use `update --match <chave>=<valor>` só quando Jonas pedir correção de uma linha já gravada, ou pra emendar o `diario` do dia.

## Padrão de chamada (helper `notion-db`)

```bash
PY=/app/skills/notion-db/scripts/notion_db.py
SCHEMA=/workspace/agent/migration/schema.naia.json

# Ler (histórico, ou descobrir a linha anterior pra comparar)
python3 $PY --schema $SCHEMA query pesagens
python3 $PY --schema $SCHEMA query diario --filter data=2026-06-23

# Acrescentar (confirme antes com o Jonas — ver protocolos)
python3 $PY --schema $SCHEMA create-row pesagens --json '{"data":"2026-06-23","hora":"08:30","peso_kg":"124.5"}'

# Emendar uma linha já gravada
python3 $PY --schema $SCHEMA update diario --match data=2026-06-23 --json '{"jantar_feito":"sim"}'
```

Filtragem/lookup: use `--filter`/`--match`. Se uma chamada falhar com erro de not-found / not-granted, o app `notion` não está concedido à Naia no OneCLI **ou** a página "Base | Pessoal" não foi compartilhada com a integração — avise o Jonas (não tente Composio nem Sheets).

## Quando esta skill NÃO se aplica

- Pergunta sobre alimento/macros (sem contexto de tracker) → use `naia-knowledge`
- Análise de adesão pontual ("hoje comi X, Y, Z, está ok?") sem pedido de registro → responde sem gravar; só grava se Jonas confirmar "registra"
- Tudo que sair dos 6 databases de escrita
