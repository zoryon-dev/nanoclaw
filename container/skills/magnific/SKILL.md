---
name: magnific
description: Geração de imagem via Magnific (Freepik AI) — PRINCIPAL via MCP (tools images_generate / creations_wait, token OAuth injetado pelo gateway), com fallback REST. Use na criação de carrossel para gerar as imagens de slide (fundos/visuais — o texto do slide é renderizado por HTML, não pela IA). Catálogo completo (46 modelos): Nano Banana Pro (marca/reference-guided), GPT 2 (tipografia), Seedream (fundos). Também há vídeo/upscale/áudio para formatos futuros.
---

# magnific — geração de imagem (MCP principal · REST fallback)

## Via MCP (principal)
O servidor **Magnific** está conectado como MCP (tools `mcp__magnific__*` / `images_generate`,
`images_models_list`, `creations_wait`, `creations_get`, `images_upscale`, `video_generate`…).
O token OAuth é injetado pelo gateway (host `mcp.magnific.com`) — **não há login a fazer**.
Cada resposta de tool pode trazer um campo `instruction` — **siga-o**.

**Fluxo de geração de imagem (por slide):**
1. `images_generate` com:
   - `prompt`: o prompt do Lad (inglês) + **"no readable text"** (a imagem é FUNDO; o texto vem do HTML).
   - `mode`: o slug do modelo (ver hierarquia abaixo). Omitir/`auto` deixa o servidor escolher.
   - `aspectRatio`: `1:1` (capa padrão) / `16:9` / `9:16` / `4:5`.
   - `references` (opcional, marca): `[{ "type":"style", "identifier":"<creation-id da brand-ref>" }]` quando houver uma brand-ref subida (`creations_upload_image`). Até lá, reforce a paleta Zoryon no prompt.
2. `creations_wait` com os `identifiers` retornados → pega a **URL final** do asset.
3. **Baixe a URL pro disco** (o render do carrossel precisa do arquivo): `curl -sL "<url>" -o /tmp/caio-slide-<N>.png`.

**Hierarquia de modelos (`mode`):**
- **`imagen-nano-banana-2`** (Nano Banana Pro) — capa + slides com peso de marca + reference-guided. Melhor fidelidade de marca.
- **`seedream-4-5`** — fundos/visuais gerais dos demais slides.
- **`gpt-2`** (GPT 2) — só se precisar de tipografia/infográfico legível NA imagem (raro: o texto do carrossel é HTML).

## 🚨 Permission gate (inegociável)
ANTES de gerar um lote, confirme o escopo com o Jonas:
> "Vou gerar [N] imagens em [modelo], [proporção]. Posso seguir?"
Só gere após "sim". Em plano ilimitado é confirmação de escopo; em pay-per-use, controle de custo.
Confira saldo com `account_balance` se houver dúvida.

## Log de uso
Registre cada lote em `/workspace/agent/logs/magnific/AAAA-MM.md` (modelo, qtd, finalidade/peça).

## Fallback REST (se o MCP estiver indisponível)
```bash
python3 /app/skills/magnific/scripts/magnific_image.py <model> --prompt "<en> , no readable text" \
  [--ref-url <URL>] --aspect <ratio> --resolution 2K --out /tmp/caio-slide-<N>.png
```
REST: modelos `nano-banana-pro` / `seedream-v4-5` (key `x-magnific-api-key` injetada pelo gateway).
Sem brandKit nem gpt na REST — use só se o MCP falhar.

## Erros
- MCP sem auth / token inválido → o gateway renova o token a cada 2 dias (cron). Se persistir, avise o Jonas (re-auth do device flow).
- task falhou/timeout → relate ao Jonas; ofereça seguir sem aquela imagem OU refazer o prompt (via Lad).
