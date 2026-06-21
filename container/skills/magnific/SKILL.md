---
name: magnific
description: Gera imagens via Magnific (REST API, key injetada pelo gateway OneCLI). Use na criação de carrossel para gerar as imagens de slide (fundos/visuais — o texto do slide é renderizado por HTML, não pela IA). Modelos REST disponíveis: nano-banana-pro (capa, marca, reference-guided — alta fidelidade de marca) e seedream-v4-5 (fundos/visuais gerais). Async (gera por task, faz poll). NÃO faz vídeo/áudio. NÃO há gpt-image-2 na REST (é MCP-only).
---

# magnific — geração de imagem (REST)

```bash
python3 /app/skills/magnific/scripts/magnific_image.py <model> --prompt "<en>" \
  [--ref-url <URL>] --aspect <ratio> --resolution 2K --out <file.png>
```

A key é injetada pelo **gateway** (host `api.magnific.com`) — nunca passe key. O script faz
POST → poll da task → download do PNG, e imprime o path no stdout.

## Modelos (REST)
- **`nano-banana-pro`** — capa + slides com peso de marca + quando há referência de marca. Passe
  `--ref-url` com a brand-ref (de `read-post-targets.json` → `magnific_brand_ref_url`). Melhor
  fidelidade de marca / reference-guided.
- **`seedream-v4-5`** — fundos e visuais gerais dos demais slides.
- (`flux-2-pro` / `flux-kontext-pro` também existem na REST se precisar de alternativa.)
- **Não existe gpt-image-2 na REST** (é MCP-only). Não precisamos: as imagens são FUNDOS — o texto
  vem do HTML. Reforce **"no readable text"** no prompt dos fundos (nano-banana/seedream tendem a
  inventar texto).

## 🚨 Permission gate (inegociável)
ANTES de gerar um lote, confirme o escopo com o Jonas:
> "Vou gerar [N] imagens em [modelo], [proporção]. Posso seguir?"
Só gere após "sim". Se "não" → entregue os prompts prontos pra rodar manual.

## Log de uso
Registre cada lote em `/workspace/agent/logs/magnific/AAAA-MM.md` (modelo, qtd, finalidade/peça).

## Aspect / resolução
`--aspect` aceita 1:1 (capa padrão), 16:9, 9:16, 4:5, etc. `--resolution` 1K/2K/4K (default 2K).

## Erros
- `access_restricted`/401 → key Magnific não concedida a este agente no OneCLI; avise o Jonas.
- task falhou/timeout → relate ao Jonas; ofereça seguir sem aquela imagem OU refazer o prompt (via Lad).
