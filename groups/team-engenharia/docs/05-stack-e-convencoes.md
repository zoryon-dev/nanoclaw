# 05 — Stack e convenções

Referência das tecnologias que o time deve dominar e os defaults de qualidade. A fonte
operacional (que o orquestrador lê) é `memory/conventions.md`; este documento é o "porquê".

> Regra de ouro: **a convenção do repositório-alvo vence** os defaults do time. Antes de
> escrever código, detecte a convenção real lendo `package.json`, `tsconfig.json`, configs de
> lint/format, lockfiles, `pyproject.toml` e o código ao redor.

## TypeScript / Node.js (primário)
- TS `strict`, sem `any` em fronteiras; `unknown` + narrowing onde o tipo é incerto.
- ES Modules, `async/await`, sem callback solto.
- Validação de input externo na fronteira (ex.: `zod`); nunca confiar em dado de cliente.
- Erros explícitos: nunca engolir; propagar com contexto.
- Testes determinísticos (`vitest`/`jest`), isolados de rede/tempo/random.
- **Por quê:** a maioria dos bugs de produção em Node vem de input não validado e erros
  silenciados. Tipagem forte + validação na borda elimina classes inteiras de falha.

## React / Next.js / TypeScript (frontend)
- Componentes função + hooks, props tipadas.
- Respeitar o router (App vs Pages) e o modelo de renderização (server vs client). Não misturar.
- Estilo conforme o repo (Tailwind/CSS modules…); reusar design system e tokens.
- Tratar sempre loading / empty / error / success.
- Acessibilidade como requisito: HTML semântico, controles rotulados, teclado, foco, contraste.
- Performance: evitar re-render desnecessário, memo onde importa, lazy-load de peças pesadas,
  vigiar bundle de client components.
- **Por quê:** UI que ignora estados de erro/vazio e a11y gera retrabalho e exclui usuários.
  Tratar isso desde o início é mais barato que remendar depois.

## Python (secundário)
- Type hints sempre; `ruff` (lint) + `black` (format); `pytest`.
- Preferir stdlib + libs consagradas; evitar dependência exótica.
- Funções puras quando possível; sem estado global mutável escondido.
- **Por quê:** Python sem types e sem lint vira dívida rápido; o time padroniza para manter
  legibilidade e refatorabilidade.

## Git / Pull Requests
- Mudanças pequenas e revisáveis; aditivas antes de reescritas in place.
- Commits no imperativo, explicando o porquê quando não óbvio.
- Sem operações destrutivas (force-push, reescrita de histórico, deleção de branch/tag) sem
  confirmação explícita do dono.
- Toda mudança não-trivial passa pelo `qa-reviewer`; superfície sensível também por `security-reviewer`.

## Segredos e configuração
- 12-factor: config por env; segredo nunca em código, log ou mensagem.
- No NanoClaw, credenciais saem pelo OneCLI Agent Vault — chave bruta não entra no container.

## Ampliando o domínio
Você escolheu TS/Node, React/Next e Python como foco. Para adicionar uma stack (Go, Rust,
mobile, etc.): atualize `memory/conventions.md` com os defaults da nova stack e, se quiser um
especialista dedicado, crie um `.claude/agents/<linguagem>-dev.md` no mesmo formato e some a
linha de delegação no `CLAUDE.md`.
