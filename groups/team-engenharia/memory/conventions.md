# Convenções de código e PR — defaults do time

> Estes são os **defaults** do time. Quando o repositório-alvo tiver convenção própria, a
> convenção do repositório vence. Detecte sempre antes de escrever código.

## TypeScript / Node.js
- TypeScript em modo `strict`. Sem `any` em fronteiras; prefira tipos explícitos e `unknown` + narrowing.
- ES Modules, `async/await` (sem `.then()` encadeado), sem callbacks soltos.
- Validar input externo na fronteira (ex.: `zod`). Nunca confiar em dado de cliente.
- Erros: nunca engolir silenciosamente. Propagar com contexto ou tratar explicitamente.
- Lint/format: seguir `eslint` + `prettier` do repo. Sem desabilitar regra sem justificativa em comentário.
- Testes: `vitest` ou `jest` (o que o repo usar). Determinísticos e isolados.

## React / Next.js
- Componentes função + hooks. Props tipadas. Nada de `any` na fronteira do componente.
- Respeitar o router e o modelo de renderização do projeto (App Router vs Pages; server vs client components). Não misturar paradigmas.
- Estilo: seguir o que o repo usa (Tailwind, CSS modules…). Reusar design system/tokens existentes.
- Sempre tratar os estados: loading, empty, error, success.
- Acessibilidade é requisito: HTML semântico, controles rotulados, operável por teclado, contraste.

## Python
- Type hints sempre. Formatação com `black`/`ruff`. Lint com `ruff`.
- Testes com `pytest`, determinísticos. Preferir stdlib + libs consagradas.
- Sem mutabilidade global escondida; funções puras quando possível.

## Git / PR
- Mudanças pequenas e revisáveis. Aditivas > reescritas in place.
- Mensagens de commit no imperativo, descrevendo o porquê quando não óbvio.
- Nada de force-push, reescrita de histórico ou deleção de branch/tag sem confirmação explícita do dono.
- Toda mudança não-trivial passa pelo `qa-reviewer` antes de "pronto". Tocou auth/input/dado → também `security-reviewer`.

## Segredos
- Nunca em código, log, ou mensagem. Sempre via env/vault.
- No NanoClaw, credenciais saem pelo OneCLI Agent Vault — chave bruta não entra no container.
