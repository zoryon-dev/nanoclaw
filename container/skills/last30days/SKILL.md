---
name: last30days
description: Pesquisa de tendência social multi-plataforma (Reddit, Hacker News, Polymarket, GitHub) com score por engajamento real. Coleta os dados crus; VOCÊ (o agente) sintetiza. Use para "o que está se falando / tendência social sobre X", sinal de comunidade. Janela padrão 7 dias. NÃO cobre X nem transcrição de YouTube nesta config (YouTube tem a skill `youtube-search`).
---

# last30days — tendência social (janela de 7 dias)

Roda em **Python 3.12** (use `python3.12`, não `python3` — o script exige 3.12+). Zero deps
externas (stdlib + lib vendorizada). **Você é o planner + o sintetizador:** o script coleta
os dados crus (Reddit/HN/GitHub/Polymarket); você lê o `-raw.md` e escreve a síntese. (Não
precisa de key de LLM — o OpenRouter só é usado no modo headless/cron, que não é o nosso.)

```bash
mkdir -p /workspace/agent/research/last30days
python3.12 /app/skills/last30days/scripts/last30days.py "<tema>" --days=7 --agent \
  --emit=compact --save-dir=/workspace/agent/research/last30days
```

Para resultados melhores, gere você mesmo um plano de busca e passe via `--plan '<json>'`
(o script mostra o schema quando rodado sem `--plan`); sem isso ele usa um plano determinístico
que já funciona. Depois, **leia o `<tema>-raw.md`** gerado e sintetize as tendências.

## Regras

- **SEMPRE `--days=7`** (roundup semanal — é a janela que o Jonas quer).
- **Plataformas (zero-config):** Reddit, Hacker News, Polymarket, GitHub. **DESLIGADOS** nesta
  config (sem keys): X/Twitter, transcrições de YouTube (ScrapeCreators), Brave, Perplexity.
  Se precisar de YouTube, use a skill `youtube-search`. **Diga ao Jonas** que a cobertura é
  Reddit/HN/etc — não finja sinal de X/IG que não temos.
- `--agent` = saída sem prompts interativos (modo não-interativo, pra você processar).
- Saída crua vai pra `research/last30days/`. Um brief que vale reusar → salve uma página na sua
  wiki própria: `/workspace/agent/wiki/topicos/tendencias-<nicho>.md`.
- É **pesquisa** — nada publica. Cruze os achados com os pilares/voz em `/workspace/brand-wiki/`.

## Erros

- **"requires Python 3.12+"** → está sendo chamado com `python3` (3.11). Use `python3.12`.
- **Síntese vazia / erro OpenRouter** → a key OpenRouter não está sendo injetada pra este agente
  (vault/gateway). O brief bruto (sem síntese) ainda sai; avise o Jonas pra liberar a key.
