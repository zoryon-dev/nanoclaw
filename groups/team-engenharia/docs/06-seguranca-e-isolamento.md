# 06 — Segurança e isolamento

Um time de engenharia tem mais poder que um agente de negócios: ele lê e **escreve** código,
roda comandos e mexe em repositórios. Por isso os limites importam tanto quanto as capacidades.

## O modelo de isolamento do NanoClaw (recap)
- O grupo roda em um **container Linux isolado**, com filesystem e processos próprios.
- O time **só vê o que você montar**. Nada de outros grupos cruza a fronteira.
- `bash` é seguro porque roda **dentro** do container, não no seu host.
- Opcionalmente, Docker Sandboxes (micro-VM) ou Apple Container reforçam o isolamento.

Tudo neste pacote opera dentro dessa caixa. As regras abaixo são as salvaguardas adicionais
embutidas no comportamento do time.

## Salvaguardas embutidas

### Mounts mínimos
Monte **apenas** os repositórios que o time pode tocar. Use **read-only** para o que ele só
deve auditar (ex.: `infra`). O `repo-auditor`, `architect` e `security-reviewer` são read-only
por design — não recebem `Edit`/`Write` sobre código.

### Operações destrutivas exigem confirmação
O orquestrador e os devs **não** executam, sem confirmação explícita do dono:
- `git push --force`, reescrita de histórico, deleção de branch/tag;
- deleção em massa de arquivos;
- comandos que apagam ou migram dados de forma irreversível.

### Segredos
- Nunca em código, log ou mensagem. Sempre via env/Vault.
- Credenciais saem pelo **OneCLI Agent Vault** — injeção no momento da requisição, com políticas
  e rate limits por agente. Chave bruta não entra no container.
- Se o `security-reviewer` ou qualquer papel encontrar um segredo vazado: **parar**, redigir o
  valor na resposta (nunca ecoar o segredo) e sinalizar para rotação.

### Gate antes de "pronto"
Nenhuma mudança é declarada pronta sem verificação: testes/type-check/lint, review do
`qa-reviewer` e, em superfície sensível, `security-reviewer`. O `/ship-check` é o gate final.

### Princípio do menor privilégio
Cada sub-agente recebe só as ferramentas necessárias (ver
[`01-arquitetura-do-team.md`](01-arquitetura-do-team.md)). Papéis de decisão/auditoria não
alteram código; papéis de execução alteram e testam.

## O que NUNCA vai para a memória
Em `memory/`, salve convenções, quirks de repo, ADRs e achados recorrentes. **Nunca** salve:
- secrets, tokens, chaves de API ou de assinatura;
- dados sensíveis/PII de usuários;
- detalhes efêmeros de uma única conversa.

## Checklist de hardening ao instalar
- [ ] Só os repositórios necessários estão montados; o resto, fora do container.
- [ ] Repositórios "só auditar" estão montados como read-only.
- [ ] Token de Git/GitHub está no Agent Vault, não em arquivo do grupo.
- [ ] O canal conectado a este grupo é restrito a quem deve operar o time de engenharia.
- [ ] Você testou um fluxo de escrita pequeno e confirmou o gate de review antes de liberar fluxos maiores.

## Por que separar este grupo do seu grupo de negócios
Isolamento de blast radius: o agente de negócios não deve poder alterar código, e o time de
engenharia não deve enxergar dados de negócio que não precisa. Grupos separados, mounts
separados, canais separados — exatamente o que o modelo do NanoClaw favorece.
