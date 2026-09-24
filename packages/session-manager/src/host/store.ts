/**
 * Durable state mutations for the manager's write endpoints.
 *
 * Archive toggling routes through the harness's own `WorkspaceRegistry`, so
 * the write rides the registry's serialized operation chain and the standard
 * `domain/changed` pipeline: the workspace feed turns it into a live
 * `archived` frame and every connected client refreshes without a reload.
 * The registry also owns the pin interaction (archiving drops the session's
 * own pin), so this plugin never has to model fields it does not own.
 *
 * @module dsh-session-manager/host-store
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** The workspace registry surface this module writes through. */
interface WorkspaceRegistryFace {
  archivedSessionIds: readonly string[]
  archiveSession(sessionId: SessionId, options?: { readonly stopActivity?: boolean }): Promise<void>
  unarchiveSession(sessionId: SessionId): Promise<void>
}

/** Archive toggle result. */
export interface ArchiveResult {
  /** The committed archive set. */
  archivedSessionIds: string[]
}

/** Resolve the workspace registry, or undefined on a profile without it. */
function resolveRegistry(ctx: Context): WorkspaceRegistryFace | undefined {
  try {
    return ctx.get('workspaceRegistry') as WorkspaceRegistryFace | undefined
  } catch {
    return undefined
  }
}

/**
 * Toggle one session's archive membership through the workspace registry.
 *
 * A session with running work is refused by the registry rather than archived
 * with its work stopped: stopping a turn is destructive, and the harness
 * reserves that for a surface that confirms it first (the sidebar names the
 * running activity and asks). This page offers no such confirmation, so it
 * passes the refusal through and the caller shows it.
 * @param ctx - Host context carrying the workspace registry.
 * @param sessionId - session identity to add or remove.
 * @param archived - target membership.
 * @returns the committed archive set.
 * @throws when the workspace registry is absent, or the session cannot be archived.
 */
export async function setArchived(ctx: Context, sessionId: string, archived: boolean): Promise<ArchiveResult> {
  const registry = resolveRegistry(ctx)
  if (registry === undefined) {
    throw new Error('archive toggling is unavailable: no workspace registry')
  }
  if (archived) await registry.archiveSession(sessionId as SessionId)
  else await registry.unarchiveSession(sessionId as SessionId)
  return { archivedSessionIds: [...registry.archivedSessionIds] }
}
