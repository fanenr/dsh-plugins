/**
 * Session list projection: the Host half's read-only view over
 * `ctx.sessionQuery` (authoritative corpus), `ctx.agents` (running state)
 * and the workspace registry (archive state).
 *
 * Titles ride the projection cache (the harness's own fast path); the cached
 * `title` cell is the latest logged `session/title` text or null. A title
 * missing from the cache is null — never a per-row persistence read.
 *
 * @module dsh-session-manager/host-list
 */

import type { Context } from '@deepseek-ai/cordis'
import { basename } from 'node:path'
import type { SessionRecord } from '@deepseek-ai/dsh-session-query'
import { asNumber, asRecord, asString } from './parsing.ts'

/** Generic service faces read through `ctx.get` — never assumed to exist. */
interface AgentsFace {
  get(id: string): { status?: string } | undefined
}

interface StorageDomainFace {
  get(name: string): {
    table(name: string): {
      get(key: string): unknown
    }
  } | undefined
}

interface WorkspaceRegistryFace {
  archivedSessionIds: readonly string[]
}

/** One cell of a projection-cache record (proved field-wise). */
interface ProjCacheRow {
  val?: unknown
}

/** One projection-cache record for a session (proved field-wise). */
interface ProjCacheRecord {
  identity?: {
    createdAt?: unknown
  }
  rows?: Record<string, ProjCacheRow>
}

/** Output of the list projection. */
export interface ListedSession {
  sessionId: string
  title: string | null
  lastActivity: number
  running: boolean
  archived: boolean
  project: string | null
}

/**
 * Project one corpus record into the wire row. All reads are guarded; a
 * hostile record degrades cell by cell, never throws.
 * @param record - corpus record (live-preferred by the query).
 * @param agents - live agent registry, when present.
 * @param proj - projection-cache domain, when present.
 * @param archived - archived session id set.
 */
export function rowOf(
  record: SessionRecord,
  agents: AgentsFace | undefined,
  proj: StorageDomainFace | undefined,
  archived: Set<string>,
): ListedSession {
  const header = record.header
  const id = String(header.id)
  const agent = agents?.get(id)
  const running = agent?.status === 'running'
  const cacheRecord = projRecord(proj, id)
  const identity = asRecord(cacheRecord?.identity)
  const createdAt = asNumber(identity?.createdAt) ?? header.createdAt
  return {
    sessionId: id,
    title: projTitle(cacheRecord),
    // Activity time = the projection cache's sessionListMetadata lastPromptAt,
    // folded like the host sidebar does (Math.max(header.createdAt,
    // lastPromptAt ?? 0)). The max matters because a fork's inherited events
    // may carry timestamps older than its new header.createdAt.
    lastActivity: Math.max(createdAt, projLastActivity(cacheRecord) ?? createdAt),
    running,
    archived: archived.has(id),
    project: header.cwd === undefined || header.cwd === '' ? null : basename(header.cwd),
  }
}

function projRecord(proj: StorageDomainFace | undefined, id: string): ProjCacheRecord | null {
  try {
    const domain = proj?.get('session_projcache')
    const table = domain?.table('sessions')
    const value = table?.get(id)
    return asRecord(value) as ProjCacheRecord | null
  } catch {
    return null
  }
}

/** The cached `title` cell is the latest logged title text or null. */
function projTitle(record: ProjCacheRecord | null): string | null {
  const title = record?.rows?.title
  const val = title?.val
  return typeof val === 'string' && val.length > 0 ? val : null
}

/** The cached `sessionListMetadata` cell's lastPromptAt, when present. */
function projLastActivity(record: ProjCacheRecord | null): number | null {
  const row = record?.rows?.sessionListMetadata
  const val = asRecord(row?.val)
  if (val === null) return null
  return asNumber(val.lastPromptAt)
}

/**
 * List every logical session from the corpus. The corpus list itself may
 * fail (a storage fault); the caller surfaces that error.
 * @param ctx - Host context.
 * @returns rows ordered newest-first (corpus order preserved).
 */
export async function listAll(ctx: Context): Promise<ListedSession[]> {
  const query = ctx.get('sessionQuery') as { listSessions?(signal?: AbortSignal): Promise<SessionRecord[]> } | undefined
  if (query === undefined || typeof query.listSessions !== 'function') {
    throw new Error('session list is unavailable: no sessionQuery service')
  }
  const records = await query.listSessions.call(query)
  const agents = ctx.get('agents') as AgentsFace | undefined
  const proj = ctx.get('storageDomain') as StorageDomainFace | undefined
  const workspace = ctx.get('workspaceRegistry') as WorkspaceRegistryFace | undefined
  const archived = new Set((workspace?.archivedSessionIds ?? []).map(String))
  // Subagent sessions (`origin: 'subagent'`) are excluded from the manager
  // list — they are numerous and managed through their parent. FORK sessions
  // stay: a fork carries a parentSession lineage but is an independent
  // top-level conversation, so parentSession alone must not filter it.
  // Deletion still covers subagents: the recursive walk reads the corpus.
  return records
    .filter(record => record.header.origin !== 'subagent')
    .map(record => rowOf(record, agents, proj, archived))
}

/**
 * Read one persisted session log without making it live. `ctx.sessionQuery`
 * revalidates the log on every read, so a corrupted log surfaces as a read
 * failure instead of a silent empty preview.
 * @param ctx - Host context.
 * @param sessionId - logical session id.
 * @returns the complete raw event log.
 */
export async function rawEventsOf(ctx: Context, sessionId: string): Promise<Array<{ type: string; data: unknown }>> {
  const query = ctx.get('sessionQuery') as { readSession?(id: string): Promise<{ events?: unknown }> } | undefined
  if (query?.readSession === undefined) {
    throw new Error('session preview is unavailable: no sessionQuery reader')
  }
  const snapshot = await query.readSession(sessionId)
  const events = snapshot.events
  if (!Array.isArray(events)) return []
  const out: Array<{ type: string; data: unknown }> = []
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue
    const record = event as { type?: unknown; data?: unknown }
    const type = asString(record.type)
    if (type === null) continue
    out.push({ type, data: record.data })
  }
  return out
}

/** Maximum preview messages returned for one session. */
export const PREVIEW_MESSAGE_LIMIT = 80

/** Maximum preview text length per message, in UTF-16 code units. */
export const PREVIEW_TEXT_LIMIT = 1200

/** Text blocks of one message content array, bounded per block. */
function contentText(content: unknown, maxChars: number): string[] {
  if (!Array.isArray(content)) return []
  const parts: string[] = []
  for (const block of content) {
    const text = textOfBlockSafe(block, maxChars)
    if (text !== null) parts.push(text)
  }
  return parts
}

/**
 * Fold a bounded list of raw events into preview messages, mirroring the
 * harness context extractor (handoff L1) for text projection, then keeping
 * per user turn only its FINAL surfaced assistant reply:
 *   - `user/message` authored by a human (`source.kind === 'user'` with an
 *     rpcId — browser prompts) opens a turn; injected context (plugin /
 *     agent-instructions / skill-catalog) and subagent task instructions
 *     (bare {kind:'user'}) never do;
 *   - `assistant/message` carries the step message under `data.message`;
 *     text blocks are projected like handoff L1 (reasoning and tool-call
 *     blocks never surface); a later step of the same turn overwrites the
 *     pending answer, so only the turn's last text-bearing reply is kept;
 *   - turns are committed whole: a turn that does not fit the remaining
 *     budget is dropped rather than split, so a user message never dangles
 *     without its answer.
 *
 * Malformed events are skipped whole. Returns the messages plus the distinct
 * event types seen — the client uses that to distinguish "empty
 * conversation" from "metadata-only session".
 */
export function previewOf(
  events: Array<{ type: string; data: unknown }>,
  limit = PREVIEW_MESSAGE_LIMIT,
  maxChars = PREVIEW_TEXT_LIMIT,
): { messages: Array<{ role: 'user' | 'assistant'; text: string }>; eventTypes: string[] } {
  const messages: Array<{ role: 'user' | 'assistant'; text: string }> = []
  const eventTypes: string[] = []
  // One in-progress turn: user text + pending final answer. Committed whole.
  let pendingUser: string | null = null
  let pendingAssistant: string | null = null
  let budgetExhausted = false

  const commit = (): void => {
    if (pendingUser === null && pendingAssistant === null) return
    const room = limit - messages.length
    if (!budgetExhausted && room >= (pendingUser !== null ? 1 : 0) + (pendingAssistant !== null ? 1 : 0)) {
      if (pendingUser !== null) messages.push({ role: 'user', text: pendingUser })
      if (pendingAssistant !== null) messages.push({ role: 'assistant', text: pendingAssistant })
    } else {
      budgetExhausted = true
    }
    pendingUser = null
    pendingAssistant = null
  }

  for (const event of events) {
    if (eventTypes.length < 12 && !eventTypes.includes(event.type)) eventTypes.push(event.type)
    if (budgetExhausted) break
    if (event.type === 'turn/end') {
      commit()
      continue
    }
    const data = asRecord(event.data)
    if (data === null) continue
    if (event.type === 'user/message') {
      // Only real human turns: a browser prompt carries an rpcId. Injected
      // context rides other source kinds (plugin/...), and subagent task
      // instructions arrive as bare {kind:'user'} without an rpcId.
      const source = asRecord(data.source)
      if (source?.kind !== 'user' || !('rpcId' in source)) continue
      commit() // a new user turn after an unclosed one
      const text = contentText(data.content, maxChars).join('\n').slice(0, maxChars)
      if (text.length === 0) continue
      pendingUser = text
      continue
    }
    if (event.type === 'assistant/message') {
      // The step message nests under data.message; older logs may carry
      // content directly on data.
      const nested = asRecord(data.message)
      const content = Array.isArray(nested?.content) ? nested?.content : data.content
      const text = contentText(content, maxChars).join('\n').slice(0, maxChars)
      if (text.length === 0) continue // pure reasoning/tool step: not surfaced
      // Overwrite: the last text-bearing step of this turn is the final answer.
      pendingAssistant = text
      continue
    }
  }
  commit()
  return { messages, eventTypes }
}

function textOfBlockSafe(block: unknown, maxChars: number): string | null {
  try {
    const record = asRecord(block)
    if (record === null) return null
    // ONLY the model-visible text block is the answer body; a reasoning
    // block also carries `text` but is internal monologue, never surfaced.
    if (record.type === 'text' && typeof record.text === 'string') return record.text.slice(0, maxChars)
    if (record.type === 'image' || record.type === 'file') return `[${record.type}]`
    return null
  } catch {
    return null
  }
}
