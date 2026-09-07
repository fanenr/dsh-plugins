/**
 * Durable state mutations for the manager's write endpoints.
 *
 * Archive toggling routes through the harness's OWN storage domain so the
 * change rides the standard `domain/changed` pipeline — the workspace feed
 * turns it into a live `archived` frame and every connected client refreshes
 * without a reload. The registry's in-memory `state` cache is repaired after
 * a direct write because `WorkspaceRegistry.setState` never re-reads the
 * domain: a later native `archiveSession` would otherwise expand its stale
 * list and silently drop our unarchive.
 *
 * @module dsh-session-manager/host-store
 */

import type { Context } from '@deepseek-ai/cordis'

/** Workspace global value shape (fields this module touches). */
export interface WorkspaceGlobalState {
  initialized: boolean
  workspaceIds: unknown[]
  archivedSessionIds: string[]
  /** Recoverable two-write mutation marker (`create`/`delete`); preserved verbatim. */
  pendingMutation?: { operation: string; workspaceId: string }
}

/** The workspace domain global handle face. */
interface DomainGlobalFace {
  get(): unknown
  set(value: unknown): Promise<void>
}

/** The domain facility face. */
interface StorageDomainFace {
  get(name: string): { global: DomainGlobalFace } | undefined
}

/** The workspace registry face (with its private state cache). */
interface WorkspaceRegistryFace {
  archivedSessionIds: readonly string[]
  state?: WorkspaceGlobalState
}

/** Archive toggle result. */
export interface ArchiveResult {
  /** The committed archive set. */
  archivedSessionIds: string[]
}

/**
 * Toggle one session's archive membership through the workspace domain.
 * @param ctx - Host context carrying the storage domain.
 * @param sessionId - session identity to add or remove.
 * @param archived - target membership.
 * @returns the committed archive set.
 * @throws when the workspace domain is not available (the caller surfaces it).
 */
export async function setArchived(ctx: Context, sessionId: string, archived: boolean): Promise<ArchiveResult> {
  const domain = resolveWorkspaceDomain(ctx)
  if (domain === undefined) {
    throw new Error('archive toggling is unavailable: no workspace storage domain')
  }
  const current = normalizeGlobal(domain.global.get())
  const set = new Set(current.archivedSessionIds)
  if (archived) set.add(sessionId)
  else set.delete(sessionId)
  const next: WorkspaceGlobalState = {
    ...current,
    archivedSessionIds: [...set],
  }
  await domain.global.set(next)
  repairRegistryState(ctx, next)
  return { archivedSessionIds: next.archivedSessionIds }
}

function resolveWorkspaceDomain(ctx: Context): { global: DomainGlobalFace } | undefined {
  try {
    const facility = ctx.get('storageDomain') as StorageDomainFace | undefined
    return facility?.get('workspace')
  } catch {
    return undefined
  }
}

function normalizeGlobal(value: unknown): WorkspaceGlobalState {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const ids = Array.isArray(record.archivedSessionIds)
    ? record.archivedSessionIds.filter((id): id is string => typeof id === 'string')
    : []
  const workspaceIds = Array.isArray(record.workspaceIds) ? record.workspaceIds : []
  const pendingMutation = (typeof record.pendingMutation === 'object' && record.pendingMutation !== null
    && typeof (record.pendingMutation as { operation?: unknown }).operation === 'string')
    ? record.pendingMutation as WorkspaceGlobalState['pendingMutation']
    : undefined
  return {
    initialized: record.initialized === true,
    workspaceIds,
    archivedSessionIds: ids,
    ...(pendingMutation === undefined ? {} : { pendingMutation }),
  }
}

/**
 * Repair the workspace registry's in-memory state after a direct domain
 * write. The registry keeps a private `state` cache and offers no public
 * refresh; re-pointing it at the value we just committed keeps the two
 * authoritative for future native writes. If the shape ever changes the cast
 * degrades to a no-op (the domain is already correct; only the registry's
 * cache would lag until restart).
 *
 * Race note: the registry's own mutations serialise on its operation queue,
 * but this plugin's direct global write does not. Both writers, however, run
 * on the domain's single write chain, and `domain.changed` fires only after
 * each write's in-memory value is already the committed one. Setting the
 * cache after our `await domain.global.set(next)` therefore always hands the
 * registry the value that is current at that instant — the same guarantee
 * the registry gives its own queued writers. Any interleaved registry write
 * that lands later re-points the cache to itself.
 */
function repairRegistryState(ctx: Context, next: WorkspaceGlobalState): void {
  try {
    const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryFace | undefined
    if (registry === undefined) return
    registry.state = next
  } catch { /* registry absent or sealed: domain write already committed */ }
}
