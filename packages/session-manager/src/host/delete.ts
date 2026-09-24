/**
 * The session deleter: removes one logical session (and, recursively, its
 * subagent children) across all three durable locations — the JSONL log
 * directory, the projection-cache domain, and workspace accounting
 * (registry membership + archive set).
 *
 * A session refuses deletion up front on two independent grounds:
 *
 *  - A LIVE store entry cannot be removed. The harness discards the
 *    `AgentHandle` it resumes, `AgentRegistry` has no eviction, and no RPC can
 *    stop one, so an agent that has been opened stays live until the process
 *    exits. Removing its files would strand it writing into a deleted
 *    directory (every later append reopens the log by path and fails ENOENT —
 *    the directory is only created by first materialization).
 *  - A session whose write lease ANOTHER process holds is equally unsafe, and
 *    the in-process store cannot see it. The kernel `flock` lease can, so the
 *    delete claims it for the whole family and holds it through removal.
 *
 * Only an identity with no live store entry and a claimable write lease — and
 * whose subagent children are likewise free — can be deleted. This includes
 * blank drafts: they are live in the store until the profile restarts, so the
 * manager list hides them (like the sidebar does) instead of offering a
 * delete that would refuse.
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
import type { SessionId } from '@deepseek-ai/dsh-session'

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
  /** ctx.get('agents'): live agent registry, for the running/idle distinction. */
  agents?: {
    get(id: string): { status?: string } | undefined
  }
  /** ctx.get('sessionQuery'): corpus listing. */
  sessionQuery?: {
    listSessions?(signal?: AbortSignal): Promise<SessionRecord[]>
  }
  /** ctx.get('storageDomain'): the projection-cache domain (no public API drops a row). */
  storageDomain?: {
    get(name: string): {
      table(name: string): {
        get(key: string): unknown
        delete(key: string): Promise<boolean>
      }
    } | undefined
  }
  /**
   * ctx.get('workspaceRegistry'): workspace accounting and the archive set.
   * Both are mutated through the registry so its in-memory state stays the
   * value that was committed — a direct domain write would leave it stale and
   * a later native write would resurrect the deleted id.
   */
  workspaceRegistry?: {
    archivedSessionIds: readonly SessionId[]
    list(): ReadonlyArray<{
      readonly sessionIds: readonly SessionId[]
      detachSession(sessionId: SessionId): Promise<void>
    }>
    unarchiveSession(sessionId: SessionId): Promise<void>
  }
  /** Physical log directory operations (DI seam). */
  logs: {
    /** Find the session's log directory, if one exists. */
    findDir(sessionId: string): string | null
    /** Recursively remove one directory. */
    removeDir(dir: string): void
  }
  /**
   * Cross-process write-ownership probe (DI seam). Absent, deletion falls back
   * to the in-process liveness check alone.
   */
  writeLease?: {
    /**
     * Claim exclusive write ownership of one session's durable artifact.
     * @param sessionId - session identity to claim.
     * @returns a disposer releasing the claim.
     * @throws when another handle (in this or another process) already holds it.
     */
    claim(sessionId: string): Promise<() => Promise<void>>
  }
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

/** Remove workspace accounting (membership + archive set) through the registry. */
async function stripWorkspace(host: DeleteHost, sessionId: string): Promise<boolean> {
  const registry = host.workspaceRegistry
  if (registry === undefined) return false
  const variants = idVariants(sessionId)
  let removed = false
  try {
    for (const workspace of registry.list()) {
      // Membership is stored under one spelling; detach it where it stands.
      const present = variants.find(variant => workspace.sessionIds.some(id => String(id) === variant))
      if (present === undefined) continue
      await workspace.detachSession(present as SessionId)
      removed = true
    }
    // A deleted session must not stay in the archive set either, or the
    // registry keeps a dangling id. Unarchive is idempotent.
    if (registry.archivedSessionIds.some(id => variants.includes(String(id)))) {
      for (const variant of variants) await registry.unarchiveSession(variant as SessionId)
      removed = true
    }
  } catch { /* registry unavailable or closed: nothing to strip */ }
  return removed
}

/**
 * Delete one logical session and its descendants.
 *
 * @throws before any removal when the id is not a uuid spelling, when any id
 *   in the family is live in the session store, when another process holds a
 *   write lease on any of them, or when a log directory cannot be found or
 *   fully removed — a half-deleted session must never fall out of its group.
 */
export async function deleteSession(host: DeleteHost, rootId: string): Promise<DeleteOutcome[]> {
  if (!/^(session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rootId)) {
    throw new Error(`invalid session id: ${rootId}`)
  }
  const records = await familyOf(host)
  const ids = descendantsOf(records, rootId)
  // The whole family must be free before anything is removed — a live session
  // refuses deletion, and a partial walk would orphan its children. The
  // message names the ROOT (visible in the UI), never the live child:
  // subagent sessions don't surface in the sidebar, so a child id here would
  // be an unactionable address.
  for (const id of ids) {
    if (host.sessions?.get(id) !== undefined) {
      throw new Error(id === rootId
        ? liveMessage(host, rootId)
        : `session "${rootId}" has a subagent that is still live in this host; restart dsh web and delete it before opening that subagent again`)
    }
  }
  // Claim the whole family's write lease BEFORE removing anything, and hold
  // every claim until the last id is gone: the in-process store cannot see a
  // sibling process writing this session, so the kernel lock is the only
  // cross-process exclusion. An ownership conflict aborts with nothing removed.
  const releases = await claimFamily(host, ids, rootId)
  try {
    const outcomes: DeleteOutcome[] = []
    for (const id of ids) {
      outcomes.push(await deleteOne(host, id))
    }
    return outcomes
  } finally {
    for (const release of releases) {
      try {
        await release()
      } catch { /* the files are already gone; a lock-release fault is not actionable here */ }
    }
  }
}

/**
 * Build the refusal for a session that is still live in this host. This is
 * deliberately NOT "running": the host resumes an agent when a session is
 * opened and never evicts it, so an idle session stays live for the life of
 * the process and deleting its files would break every later append. The text
 * is actionable — no RPC, button, or setting can stop a live session, so
 * restarting the host is the only way out — and it distinguishes a turn that
 * is actually executing, because a restart aborts it.
 */
function liveMessage(host: DeleteHost, rootId: string): string {
  const running = host.agents?.get(rootId)?.status === 'running'
  return running
    ? `session "${rootId}" is running; restarting dsh web aborts that turn — do it, then delete the session`
    : `session "${rootId}" is live in this host (dsh web keeps every session it has opened until restart); restart dsh web, then delete it before opening that conversation again`
}

/**
 * Claim every id's write lease, releasing the ones already taken when an id is
 * genuinely owned elsewhere, so a refused delete holds nothing.
 *
 * ONLY an ownership conflict refuses. Every other claim failure means the
 * backend could not hand back a usable handle — a missing log, a corrupt or
 * unsupported artifact, an I/O fault — and in each of those cases deleting the
 * file is the remedy, not a hazard, so the walk proceeds without a lease for
 * that id (deleteOne owns the resulting diagnosis, e.g. "no log directory").
 * The backend parses the artifact only AFTER taking the kernel lock, so a
 * corruption failure also proves no other process holds the session.
 */
async function claimFamily(
  host: DeleteHost,
  ids: string[],
  rootId: string,
): Promise<Array<() => Promise<void>>> {
  const claim = host.writeLease?.claim
  if (claim === undefined) return []
  const releases: Array<() => Promise<void>> = []
  for (const id of ids) {
    let release: () => Promise<void>
    try {
      release = await claim(id)
    } catch (error) {
      if (!isAlreadyOwned(error)) continue
      for (const unwind of releases) {
        try {
          await unwind()
        } catch { /* best-effort unwind; the claim failure is the actionable one */ }
      }
      throw new Error(id === rootId
        ? `session "${rootId}" is being written by another dsh process; stop that process and retry`
        : `session "${rootId}" has a subagent being written by another dsh process; stop that process and retry`)
    }
    releases.push(release)
  }
  return releases
}

/** Whether a claim failed because a write handle already owns the session. */
function isAlreadyOwned(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'SessionAlreadyOwnedError'
}

/**
 * Remove one live-free identity: remove its log directory (a missing or
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
