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

// 1. Sexta 17h BRT = 20h UTC
createTask('Weekly Review (sexta)', '0 20 * * 5',
`Revisao semanal — sexta-feira (parte 1: dados).

Puxe os dados do Todoist (via Composio) e prepare o cenario para a revisao semanal do Jonas:

1. *Inbox* — quantas tarefas na inbox? Listar todas
2. *Atrasadas* — listar todas as tarefas com overdue
3. *Entregas da semana* — tarefas dos proximos 7 dias, por projeto
4. *Projetos parados* — algum projeto sem proxima acao?
5. *Ideias* — tarefas com label _ideia para avaliar
6. *Algum Dia* — listar itens do projeto Algum Dia
7. *Metricas da semana* — tarefas concluidas nos ultimos 7 dias (se possivel)

Apresente tudo organizado e pergunte: "Bora fazer a weekly review? Comeco pelo inbox ou pelas atrasadas?"

Formato WhatsApp: *negrito* simples, bullets com -, sem ## headings.`);

// 2. Domingo 20h BRT = 23h UTC
createTask('Weekly Review (domingo)', '0 23 * * 0',
`Revisao semanal — domingo (parte 2: prioridades da semana).

1. Consulte o Todoist (via Composio) — tarefas dos proximos 7 dias
2. Consulte o Google Calendar — compromissos da semana que vem
3. Envie um resumo com:
   - Compromissos importantes da semana
   - Tarefas com deadline na semana
   - Pergunte quais sao as 3-5 prioridades da semana
   - Sugira candidatas baseado em p1/p2 e deadlines proximos
   - Lembre: "Ritual noturno de hoje define as 6 de amanha. Quer fazer agora?"

Tom: parceiro de planejamento, direto. Formato WhatsApp: *negrito* simples, bullets com -.`);

// 3. Dia 28 de cada mes, 10h BRT = 13h UTC
createTask('Monthly Review (dia 28)', '0 13 28 * *',
`Revisao mensal — dia 28.

Puxe dados do Todoist (via Composio) e Google Calendar para a revisao mensal do Jonas:

1. *Entregas do proximo mes* — tarefas com data nos proximos 30 dias, por projeto
2. *Retrospectiva* — tarefas concluidas no mes que passou (se possivel via Todoist). Perguntar:
   - O que funcionou?
   - O que nao funcionou?
   - O que comecar, parar, continuar?
3. *Estrutura* — mudou algum cliente? Precisa ajustar secoes no Todoist?
4. *Metas* — pedir 3 metas para o proximo mes. Criar tarefas no Todoist se Jonas confirmar
5. *Calendario* — compromissos relevantes do proximo mes

Apresente os dados e guie a retrospectiva passo a passo. Tom: estrategico mas pratico.
Formato WhatsApp: *negrito* simples, bullets com -, sem ## headings.`);

console.log('Done!');
