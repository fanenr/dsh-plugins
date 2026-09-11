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

interface SessionsFace {
  get(id: string): unknown
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
  /** Workspace entities in display order, for the editable-title label. */
  list?(): ReadonlyArray<{ path?: string; title?: string }>
}

/**
 * Live projection registry face (`ctx.sessionProjections`). The harness folds
 * `sessionListMetadata` (its own `blank` signal) over every committed event,
 * so this is the supported read for a fact the manager used to recompute from
 * the raw log.
 */
interface SessionProjectionsFace {
  /** Current folded host state for one registered unit; `undefined` when unregistered. */
  stateOf?(session: unknown, key: 'sessionListMetadata'): unknown
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
 * @param projectTitles - cwd → workspace title, for the editable group label.
 */
export function rowOf(
  record: SessionRecord,
  agents: AgentsFace | undefined,
  proj: StorageDomainFace | undefined,
  archived: Set<string>,
  projectTitles: ReadonlyMap<string, string> | undefined,
): ListedSession {
  const header = record.header
  const id = String(header.id)
  const agent = agents?.get(id)
  const running = agent?.status === 'running'
  const cacheRecord = projRecord(proj, id)
  const identity = asRecord(cacheRecord?.identity)
  const createdAt = asNumber(identity?.createdAt) ?? header.createdAt
  const cwd = header.cwd === undefined || header.cwd === '' ? null : header.cwd
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
    // Group label is the workspace's editable title when the cwd belongs to a
    // registered workspace; otherwise the directory basename (ungrouped rows
    // whose directory is not a workspace still group by name).
    project: cwd === null ? null : (projectTitles?.get(cwd) ?? basename(cwd)),
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
  const sessions = ctx.get('sessions') as SessionsFace | undefined
  const proj = ctx.get('storageDomain') as StorageDomainFace | undefined
  const workspace = ctx.get('workspaceRegistry') as WorkspaceRegistryFace | undefined
  const projections = ctx.get('sessionProjections') as SessionProjectionsFace | undefined
  const archived = new Set((workspace?.archivedSessionIds ?? []).map(String))
  // cwd → editable workspace title, so the group label follows a rename. A
  // directory that is not a registered workspace falls back to its basename.
  const projectTitles = new Map<string, string>()
  for (const entity of workspace?.list?.() ?? []) {
    if (entity.path !== undefined && entity.title !== undefined && entity.title !== '') {
      projectTitles.set(entity.path, entity.title)
    }
  }
  // Subagent sessions (`origin: 'subagent'`) are excluded from the manager
  // list — they are numerous and managed through their parent. FORK sessions
  // stay: a fork carries a parentSession lineage but is an independent
  // top-level conversation, so parentSession alone must not filter it.
  // Blank drafts (live, idle store entries whose log has never opened a
  // turn) are excluded too, mirroring the harness sidebar: they are the
  // provisional New Session placeholders and disappear once they receive
  // input. They also have no reliable delete path while live, so hiding
  // them keeps the manager honest about what it can actually delete.
  // Deletion still covers subagents: the recursive walk reads the corpus.
  return records
    .filter(record => record.header.origin !== 'subagent')
    .filter(record => !isBlankDraft(String(record.header.id), sessions, agents, projections))
    .map(record => rowOf(record, agents, proj, archived, projectTitles))
}

/**
 * True for a live, idle store entry whose log has never opened a turn — the
 * harness's own `blank` signal, read from the `sessionListMetadata`
 * projection rather than recomputed from the raw log.
 *
 * The projection folds the FULL log, so a fork — which inherits its parent's
 * turns — is judged on the inherited prefix too, exactly as this check
 * requires: a fork's own suffix may carry no `turn/start` while the
 * conversation is real. `ctx.sessionProjections.stateOf` materializes at the
 * live cursor, so the value never trails the session (the durable
 * `session_projcache` is throttled write-behind and must not be used here).
 *
 * An unavailable projection (service absent, unit unregistered, or a hostile
 * value) degrades to "visible": hiding a real conversation is worse than
 * showing a draft.
 */
function isBlankDraft(
  id: string,
  sessions: SessionsFace | undefined,
  agents: AgentsFace | undefined,
  projections: SessionProjectionsFace | undefined,
): boolean {
  const session = sessions?.get(id)
  if (session === undefined) return false
  if (agents?.get(id)?.status === 'running') return false
  return asRecord(stateOfSafe(projections, session))?.blank === true
}

/**
 * Read one unit's live state without letting a materialization fault escape.
 * `stateOf` folds the session log, so a session the registry cannot prepare
 * throws; the list must degrade per row (matching this module's guarded-read
 * contract) rather than fail the whole listing.
 */
function stateOfSafe(projections: SessionProjectionsFace | undefined, session: unknown): unknown {
  try {
    return projections?.stateOf?.(session, 'sessionListMetadata')
  } catch {
    return undefined
  }
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
