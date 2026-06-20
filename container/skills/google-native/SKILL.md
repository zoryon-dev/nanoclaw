---
name: google-native
description: Gmail, Google Calendar, Google Docs e Google Drive via OAuth NATIVO do Google (gateway OneCLI) — NÃO via Composio. Use sempre que precisar ler/enviar email (Gmail), consultar/criar eventos (Calendar), ler/editar documentos (Docs) ou listar/buscar arquivos (Drive). Para Google Sheets use a skill `gsheets`. Os toolkits Composio de Google foram descontinuados (os slugs mudam e quebram); estes helpers chamam a REST API oficial direto.
---

# google-native — Gmail / Calendar / Docs / Drive (helpers nativos)

Chamam `*.googleapis.com` **sem header de Authorization**, pelo gateway OneCLI, que injeta o token OAuth do Google. Sem credencial no container — o agente só precisa ter o app correspondente (`gmail` / `google-calendar` / `google-docs` / `google-drive`) **concedido** no OneCLI. Mesmo padrão do `read-post/upload_drive.py` e do `gsheets`.

Diretório: `/app/skills/google-native/scripts/`. **Sheets fica na skill `gsheets`** (`sheets_api.py`).

## Gmail — `gmail_api.py`
```bash
G=/app/skills/google-native/scripts/gmail_api.py
python3 $G labels                              # listar labels
python3 $G search "from:cliente is:unread" 10  # buscar (sintaxe de busca do Gmail) → ids+snippets
python3 $G read  <messageId>                    # headers (From/To/Subject/Date) + corpo texto
python3 $G send  "x@y.com" "Assunto" "Corpo"   # ENVIAR (write — confirme com Jonas antes)
python3 $G draft "x@y.com" "Assunto" "Corpo"   # criar rascunho (não envia)
```

## Calendar — `calendar_api.py`
```bash
C=/app/skills/google-native/scripts/calendar_api.py
python3 $C calendars                                          # listar agendas
python3 $C list primary 2026-06-20T00:00:00-03:00 2026-06-21T00:00:00-03:00   # eventos no intervalo (RFC3339)
python3 $C get  primary <eventId>
python3 $C freebusy <timeMin> <timeMax> primary              # blocos ocupados
python3 $C create primary '{"summary":"Reunião","start":{"dateTime":"2026-06-21T15:00:00-03:00"},"end":{"dateTime":"2026-06-21T16:00:00-03:00"}}'  # criar (write — confirme antes)
```

## Docs — `docs_api.py`
```bash
D=/app/skills/google-native/scripts/docs_api.py
python3 $D text   <docId>            # texto puro do doc (pra ler)
python3 $D get    <docId>            # JSON estrutural completo
python3 $D create "Título"          # novo doc → imprime documentId (write)
python3 $D append <docId> "texto"   # adiciona texto no fim (write)
```

## Drive — `drive_api.py`
```bash
R=/app/skills/google-native/scripts/drive_api.py
python3 $R list 20                   # arquivos recentes (id,name,mimeType,link)
python3 $R search "nome parcial"     # buscar por nome
python3 $R get <fileId>              # metadados
```
(Upload de imagens de carrossel: ver `read-post/upload_drive.py`.)

## Regras
- **Ler = automático. Enviar email / criar evento / criar-editar doc = confirme com o Jonas antes** (são writes).
- HTTP 403/`access_restricted` → o app não está concedido a este agente no OneCLI. Avise o Jonas; **nunca** caia de volta na Composio pra Google.
- Mantenha na Composio só o que NÃO é Google (github, instagram, metaads, neon, cloudflare, short_io, tavily).
