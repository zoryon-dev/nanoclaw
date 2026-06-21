---
name: r2-upload
description: Sobe um arquivo no Cloudflare R2 e devolve a URL pública (leitura). Use quando precisar de uma URL pública direta de uma imagem/arquivo — ex.: hospedar os PNGs de slide do carrossel pra publicar no Instagram (a API do IG busca por URL), ou a brand-ref do Magnific. Upload via API v4 do Cloudflare (Bearer injetado pelo gateway); leitura pública no domínio custom do bucket.
---

# r2-upload — hospedar arquivo no R2 (URL pública)

```bash
python3 /app/skills/r2-upload/scripts/r2_upload.py <arquivo-local> <key>
# imprime: https://bucket-nanoclaw.zoryon.co/<key>
```

- A key é o caminho do objeto no bucket `nanoclaw` (ex.: `carrosseis/<slug>/slide-1.png`).
- Sem credencial no comando — o **gateway injeta o Bearer** do token Cloudflare (host `api.cloudflare.com`).
- A URL impressa é **pública e direta** (serve a imagem) — pronta pra passar ao Instagram/Composio.
- CORS não é necessário (consumo é server-side).

## Receita — hospedar slides de um carrossel pra publicar
```bash
for n in 1 2 3 4 5; do
  python3 /app/skills/r2-upload/scripts/r2_upload.py /tmp/caio-slide-$n.png carrosseis/<slug>/slide-$n.png
done
```
Coleta as URLs em ordem → passa pro `INSTAGRAM_CREATE_CAROUSEL_CONTAINER`.

## Erros
- 401/403 → o token Cloudflare não está concedido a este agente no OneCLI; avise o Jonas.
