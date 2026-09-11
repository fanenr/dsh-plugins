/**
 * The session deleter: removes one logical session (and, recursively, its
 * subagent children) across all three durable locations — the JSONL log
 * directory, the projection-cache domain, and workspace accounting (table +
 * archive set).
 *
 * Live sessions refuse deletion up front: the harness keeps no public
 * teardown path for a live agent, so removing a live session's files would
 * strand the running agent on a ghost log. Only sessions without a live
 * store entry — and whose subagent children are likewise not live — can be
 * deleted. This includes blank drafts: they live in the store until the
 * profile restarts, so the manager list hides them (like the sidebar does)
 * instead of offering a delete that would refuse.
 *
 * Failure policy: a log removal failure aborts before storage accounting is
 * touched, so a half-deleted session never falls out of its group. Storage
 * accounting is best-effort after the log is gone.
 *
 * All filesystem work is delegated to injected facades so the ordering and
 * failure policy are unit-testable without touching real disks.
 *
 * @module dsh-session-manager/host-delete
 */

import type { SessionRecord } from '@deepseek-ai/dsh-session-query'

/** Outcome of one deleted identity. */
export interface DeleteOutcome {
  sessionId: string
  logRemoved: boolean
  cacheRemoved: boolean
  workspaceRemoved: boolean
}

/** The host services this deleter consumes, as narrow facades. */
export interface DeleteHost {
  /** ctx.get('sessions'): live session store, probed for liveness only. */
  sessions?: {
    get(id: string): unknown
  }
  /** ctx.get('sessionQuery'): corpus listing. */
  sessionQuery?: {
    listSessions?(signal?: AbortSignal): Promise<SessionRecord[]>
  }
  /** ctx.get('storageDomain'): projection-cache + workspace domains. */
  storageDomain?: {
    get(name: string): {
      table(name: string): {
        get(key: string): unknown
        put(key: string, value: unknown): Promise<unknown>
        delete(key: string): Promise<boolean>
        entries?(): IterableIterator<[string, unknown]>
      }
      global?: {
        get(): unknown
        set(value: unknown): Promise<void>
      }
    } | undefined
  }
  /** Physical log directory operations (DI seam). */
  logs: {
    /** Find the session's log directory, if one exists. */
    findDir(sessionId: string): string | null
    /** Recursively remove one directory. */
    removeDir(dir: string): void
  }
}

/** The minimal record shape the workspace table stores. */
interface WorkspaceRecordLike {
  sessionIds?: string[]
}

/** Minimal archive-set state of the workspace global. */
interface WorkspaceGlobalLike {
  archivedSessionIds?: string[]
}

/** List the corpus once for the recursive family walk. */
async function familyOf(host: DeleteHost): Promise<SessionRecord[]> {
  const query = host.sessionQuery
  if (query === undefined || typeof query.listSessions !== 'function') return []
  return await query.listSessions.call(query)
}

/**
 * Collect one id and all its descendant subagents (by parentSessionId).
 * @param records - the corpus snapshot.
 * @param rootId - the root identity.
 */
export function descendantsOf(records: SessionRecord[], rootId: string): string[] {
  const ids = new Set<string>([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const record of records) {
      // Only SUBAGENT children are deleted with their parent. A fork carries
      // parentSession too but is an independent top-level conversation —
      // deleting the fork source must never delete its forked siblings.
      if (record.header.origin !== 'subagent') continue
      const id = String(record.header.id)
      const parent = record.header.parentSession
      if (parent === undefined) continue
      if (ids.has(String(parent)) && !ids.has(id)) {
        ids.add(id)
        grew = true
      }
    }
  }
  return [...ids]
}

/** Session id variant spellings: raw uuid and `session-` prefixed. */
export function idVariants(sessionId: string): string[] {
  if (sessionId.startsWith('session-')) return [sessionId, sessionId.slice('session-'.length)]
  return [sessionId, `session-${sessionId}`]
}

/** Remove the projection-cache row for every spelling of one id. */
async function stripCache(host: DeleteHost, sessionId: string): Promise<boolean> {
  let removed = false
  try {
    const domain = host.storageDomain?.get('session_projcache')
    const table = domain?.table('sessions')
    if (table !== undefined) {
      for (const variant of idVariants(sessionId)) {
        if (table.get(variant) !== undefined) {
          await table.delete(variant)
          removed = true
        }
      }
    }
  } catch { /* domain closed: nothing to strip */ }
  return removed
}

/** Remove workspace accounting (table + archive set) for every spelling. */
async function stripWorkspace(host: DeleteHost, sessionId: string): Promise<boolean> {
  let removed = false
  try {
    const domain = host.storageDomain?.get('workspace')
    if (domain !== undefined) {
      const table = domain.table('workspaces')
      if (table !== undefined) {
        const variants = idVariants(sessionId)
        // Snapshot the iterator's pairs before mutating (iteration is a snapshot anyway).
        for (const [wid, raw] of [...tableEntriesSafe(table)]) {
          const record = raw as WorkspaceRecordLike | null
          if (record === null || !Array.isArray(record.sessionIds)) continue
          const ids = record.sessionIds as unknown[]
          if (!ids.some(id => variants.includes(String(id)))) continue
          await table.put(wid, {
            ...record,
            sessionIds: ids.filter(id => !variants.includes(String(id))),
          })
          removed = true
        }
      }
      const global = domain.global
      if (global !== undefined) {
        const state = global.get() as WorkspaceGlobalLike | null
        const archived = state?.archivedSessionIds
        if (Array.isArray(archived)) {
          const variants = idVariants(sessionId)
          const next = archived.filter(id => !variants.includes(String(id)))
          if (next.length !== archived.length) {
            await global.set({ ...(state as Record<string, unknown>), archivedSessionIds: next })
            removed = true
          }
        }
      }
    }
  } catch { /* domain closed: nothing to strip */ }
  return removed
}

function tableEntriesSafe(table: { entries?(): IterableIterator<[string, unknown]> }): Array<[string, unknown]> {
  if (typeof table.entries !== 'function') return []
  try {
    return [...table.entries()]
  } catch {
    return []
  }
}

/**
 * Delete one logical session and its descendants.
 *
 * @throws before any removal when the id is not a uuid spelling, when any id
 *   in the family is live in the session store, or when a log directory
 *   cannot be found or fully removed — a half-deleted session must never fall
 *   out of its group.
 */
export async function deleteSession(host: DeleteHost, rootId: string): Promise<DeleteOutcome[]> {
  if (!/^(session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rootId)) {
    throw new Error(`invalid session id: ${rootId}`)
  }
  const records = await familyOf(host)
  const ids = descendantsOf(records, rootId)
  // The whole family must be non-live before anything is removed — a live
  // session refuses deletion, and a partial walk would orphan its children.
  // The message names the ROOT (visible in the UI), never the live child:
  // subagent sessions don't surface in the sidebar, so a child id here would
  // be an unactionable address.
  for (const id of ids) {
    if (host.sessions?.get(id) !== undefined) {
      throw new Error(id === rootId
        ? `session "${rootId}" is live; stop the conversation and retry`
        : `session "${rootId}" has a live subagent; wait for its conversation to end and retry`)
    }
  }
  const outcomes: DeleteOutcome[] = []
  for (const id of ids) {
    outcomes.push(await deleteOne(host, id))
  }
  return outcomes
}

/**
 * Remove one non-live identity: remove its log directory (a missing or
 * re-materialized directory refuses the delete), then strip storage
 * accounting best-effort.
 */
async function deleteOne(host: DeleteHost, id: string): Promise<DeleteOutcome> {
  const dir = host.logs.findDir(id)
  if (dir === null) {
    throw new Error(`session "${id}" has no log directory; refusing a half-delete`)
  }
  host.logs.removeDir(dir)
  const second = host.logs.findDir(id)
  if (second !== null) {
    host.logs.removeDir(second)
  }
  if (host.logs.findDir(id) !== null) {
    throw new Error(`session "${id}" log directory could not be fully removed`)
  }

  const cacheRemoved = await stripCache(host, id)
  const workspaceRemoved = await stripWorkspace(host, id)
  return {
    sessionId: id,
    logRemoved: true,
    cacheRemoved,
    workspaceRemoved,
  }
}
