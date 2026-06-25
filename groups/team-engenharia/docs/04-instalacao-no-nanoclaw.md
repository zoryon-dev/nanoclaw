# 04 — Instalação no seu fork do NanoClaw

Passo a passo para plugar o `team-engenharia` como um agent group do seu NanoClaw v2.

> Observação importante: o NanoClaw evolui rápido (estrutura de `groups/`, nomes de skills e
> comandos de gestão de canais podem mudar entre versões). Trate os comandos abaixo como o
> caminho esperado e **confirme com o Claude Code do seu fork** (`/customize`, `/debug`) se algo
> divergir. Quando em dúvida sobre a forma exata, peça ao Claude Code: *"como adiciono um novo
> agent group chamado team-engenharia a este fork?"*.

## Pré-requisitos
- NanoClaw v2 já instalado e funcionando (você já usa para negócios).
- Docker rodando, Claude Code disponível (necessário para `/customize` e skills).
- Os repositórios que o time vai tocar acessíveis no host.

## Passo 1 — Copiar a pasta para o grupo
Coloque esta pasta dentro de `groups/` no seu checkout do NanoClaw:

```bash
cp -R team-engenharia /caminho/do/seu/nanoclaw-v2/groups/team-engenharia
```

A estrutura esperada de um grupo: `CLAUDE.md`, `.claude/` (agents, commands, skills), memória e
arquivos do grupo. Se o seu fork usa um layout um pouco diferente, ajuste os caminhos — o
conteúdo (CLAUDE.md, agentes, skills, templates) é o que importa.

## Passo 2 — Registrar o grupo e parear um canal
Crie/registre o agent group e conecte um canal (Telegram/Discord/WhatsApp/CLI) a ele. No
NanoClaw isso é feito pela gestão de grupos/canais — pelo próprio assistente:

```
@Andy crie um novo agent group chamado "team-engenharia" a partir da pasta groups/team-engenharia
@Andy conecte o canal <seu canal de dev> a esse grupo
```

ou via Claude Code no fork (`/manage-channels`, `/customize`), conforme a sua versão.

## Passo 3 — Montar (mount) só os repositórios certos
O time só enxerga o que você montar no container do grupo. Monte **apenas** os repositórios que
ele pode tocar — nada mais. Exemplo conceitual de mounts do grupo:

```
/caminho/host/repos/api-pedidos   →  /workspace/api-pedidos   (rw)
/caminho/host/repos/web           →  /workspace/web           (rw)
/caminho/host/repos/infra         →  /workspace/infra         (ro)   # só leitura
```

Peça ao Claude Code do fork para wirear esses mounts no `container-runner`/config do grupo.
Use **read-only** para repositórios que o time só deve auditar, não alterar.

## Passo 4 — Credenciais via Agent Vault
Não coloque chaves no container. Tokens de Git/GitHub, registries, etc. devem sair pelo OneCLI
Agent Vault (injeção no momento da requisição, com políticas por agente). Para operações de Git
que precisam de token (push, abrir PR), configure o token no Vault do seu fork — nunca em
arquivo dentro do grupo.

## Passo 5 — Validar
Mande no canal do grupo:

```
@team-engenharia /audit-repo api-pedidos
```

Você deve receber um relatório de auditoria preenchido. Em seguida teste um fluxo de escrita
pequeno:

```
@team-engenharia /feature adicione um healthcheck GET /healthz na api-pedidos
```

Confirme que: o código foi escrito, os testes rodaram, e o `qa-reviewer` revisou antes do resumo.

## Passo 6 — Tornar mudanças duráveis (skills)
No NanoClaw, **toda customização que você quer manter vira uma skill** — assim sobrevive a
`/update-nanoclaw`. Se você ajustar este grupo (novo papel, nova convenção, novo command), peça
ao Claude Code para converter a mudança em skill, seguindo o `skill-guidelines.md` do fork.

## Ajustes comuns
- **Trocar provider/modelo por papel:** edite o frontmatter `model:` de cada agente, ou use
  `/add-opencode`/`/add-ollama-provider` no fork para rodar papéis em backends diferentes.
- **Renomear o gatilho:** "mude a trigger word para @dev" (via `/customize`).
- **Adicionar um papel novo:** crie `.claude/agents/<novo>.md` no mesmo formato e adicione a
  linha de delegação no `CLAUDE.md`.
