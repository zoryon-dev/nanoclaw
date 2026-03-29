import Database from 'better-sqlite3';
import { CronExpressionParser } from 'cron-parser';

const db = new Database('/root/nanoclaw/store/messages.db');

function createTask(name, cronExpr, prompt) {
  const taskId = 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const interval = CronExpressionParser.parse(cronExpr, { tz: 'UTC' });
  const nextRun = interval.next().toISOString();
  db.prepare(`
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, script, schedule_type, schedule_value, context_mode, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(taskId, 'whatsapp_main', '5511964399429@s.whatsapp.net', prompt, null, 'cron', cronExpr, 'isolated', nextRun, 'active', new Date().toISOString());
  console.log(`${name}: ${taskId} | next: ${nextRun} | cron: ${cronExpr}`);
}

// Segunda 7h BRT = 10h UTC
const cron = '0 10 * * 1';

// 1. Anthropic updates
createTask('Anthropic Updates', cron,
`Tarefa semanal: atualizacoes da Anthropic.

Use o Firecrawl para pesquisar as novidades mais recentes da Anthropic da ultima semana:
1. Pesquisar "Anthropic news" e "Claude update" da ultima semana
2. Verificar https://docs.anthropic.com/en/docs/about-claude/models para mudancas de modelos
3. Verificar https://www.anthropic.com/news para anuncios oficiais

Compile um relatorio com:
- Novos modelos ou atualizacoes de modelos existentes
- Mudancas na API ou SDKs
- Novos features do Claude (Code, Desktop, etc)
- Anuncios de negocio relevantes

Depois:
1. Envie o relatorio completo por email para jonas.silva@zoryon.dev com assunto "Anthropic Updates — Semana de [data]"
2. No WhatsApp, envie apenas: "Relatorio Anthropic da semana enviado no email. Destaques: [1-2 frases com o mais importante]"

Formato email: pode usar markdown/HTML rico. Formato WhatsApp: curto, *negrito* simples.`);

// 2. NanoClaw updates
createTask('NanoClaw Updates', cron,
`Tarefa semanal: verificar atualizacoes do NanoClaw upstream.

Use o Firecrawl para verificar o repositorio upstream do NanoClaw:
1. Pesquisar commits recentes em https://github.com/anthropics/claude-code (ou o upstream relevante)
2. Verificar se ha novas skills, features ou breaking changes
3. Comparar com a versao atual instalada

Compile um relatorio com:
- Novos commits/features desde a ultima verificacao
- Skills novas disponiveis
- Breaking changes que exigem acao
- Recomendacao: precisa atualizar? urgente ou pode esperar?

Depois:
1. Envie o relatorio por email para jonas.silva@zoryon.dev com assunto "NanoClaw Updates — Semana de [data]"
2. No WhatsApp, envie apenas: "Verificacao NanoClaw enviada no email. [Precisa atualizar / Tudo em dia]"

Formato email: detalhado com links. Formato WhatsApp: 1-2 linhas.`);

// 3. Top 3 AI market
createTask('Top 3 IA', cron,
`Tarefa semanal: top 3 noticias do mercado de IA.

Use o Firecrawl para pesquisar as noticias mais relevantes da semana no mercado de IA:
1. Pesquisar "AI news this week" e "inteligencia artificial novidades semana"
2. Focar em: novos modelos, ferramentas, startups, regulacao, tendencias
3. Filtrar o que e relevante para quem trabalha com marketing digital + IA (contexto da Zoryon)

Selecione as TOP 3 noticias mais impactantes e compile:
- Titulo e resumo de cada noticia
- Por que importa para a Zoryon / marketing digital
- Link da fonte original
- Uma analise breve: oportunidade ou ameaca?

Depois:
1. Envie o relatorio por email para jonas.silva@zoryon.dev com assunto "Top 3 IA — Semana de [data]"
2. No WhatsApp, envie apenas: "Top 3 IA da semana no email. Destaque: [noticia mais importante em 1 frase]"

Formato email: rico, com links e analise. Formato WhatsApp: 1-2 linhas.`);

console.log('Done!');
