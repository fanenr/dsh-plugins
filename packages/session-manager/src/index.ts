/**
 * dsh-session-manager — Host half.
 *
 * Registers the authenticated `/session-manager` RPC channel (list, preview,
 * delete, setArchived) over the harness's Connection transport.
 *
 * The RPC channel is preferred over raw webServer routes because Connection
 * applies the Host/Origin fence and browser authentication before dispatch
 * — the manager exposes destructive operations and must not accept
 * unauthenticated requests. The channel is an inject-scoped registration,
 * so a profile without a web surface never mounts it.
 *
 * @module dsh-session-manager
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { asRecord, asString } from './host/parsing.ts'
import { listAll, previewOf, rawEventsOf } from './host/list.ts'
import { setArchived } from './host/store.ts'
import { deleteSession, descendantsOf, idVariants, type DeleteHost } from './host/delete.ts'
import {
  CHANNEL, ENDPOINT,
  type SetArchivedRequest,
} from './shared/types.ts'

/** Plugin identity, used as the cordis bundle entry name. */
export const name = 'dsh-session-manager'

/** Services this plugin requires unconditionally. The RPC channel mounts
 *  lazily through `ctx.inject(['connection'])`, so a profile without a web
 *  surface never mounts it. */
export const inject: string[] = []

export { deleteSession, descendantsOf, idVariants }
export { groupRowsByProject } from './shared/group.ts'
export { previewOf } from './host/list.ts'
export type { DeleteHost }

/** Resolve the harness home the same way the base bundle does. */
export function dshHomePath(...segments: string[]): string {
  const override = process.env.DSH_HOME
  const root = override !== undefined && override.trim().length > 0
    ? override
    : join(homedir(), '.dsh')
  return join(root, ...segments)
}

/** Physical log directory facade (node:fs, DI-seamable for tests). */
export interface LogDirHost {
  /** Project buckets under the session root. */
  buckets(): string[]
  exists(path: string): boolean
  rm(path: string): void
}

/** The real filesystem facade over `$DSH_HOME/sessions`. */
export function nodeLogs(root: string): LogDirHost {
  return {
    buckets: () => {
      try {
        return readdirSync(root, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => join(root, e.name))
      } catch {
        return []
      }
    },
    exists: path => existsSync(path),
    rm: path => rmSync(path, { recursive: true, force: true }),
  }
}

/** Find one session's log directory by scanning project buckets. */
export function findLogDir(logs: LogDirHost, sessionId: string): string | null {
  for (const bucket of logs.buckets()) {
    for (const variant of idVariants(sessionId)) {
      const candidate = join(bucket, variant)
      if (logs.exists(candidate)) return candidate
    }
  }
  return null
}

/** Build the delete host facade from the live ctx. */
function deleteHostOf(ctx: Context): DeleteHost {
  const logs = nodeLogs(dshHomePath('sessions'))
  const sessions = ctx.get('sessions') as { get(id: string): unknown } | undefined
  return {
    sessions: { get: (id) => sessions?.get(id) },
    sessionQuery: ctx.get('sessionQuery') as DeleteHost['sessionQuery'],
    storageDomain: ctx.get('storageDomain') as DeleteHost['storageDomain'],
    logs: {
      findDir: id => findLogDir(logs, id),
      removeDir: dir => logs.rm(dir),
    },
  }
}

/** Wire the RPC channel onto the connection service. */
function watchChannel(ctx: Context): void {
  ctx.inject(['connection'], (c) => {
    const connection = c.get('connection') as {
      rpc?: {
        handle(channel: string, handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>): () => Promise<void>
      }
    } | undefined
    const handle = connection?.rpc?.handle
    if (typeof handle !== 'function') return
    const bound = handle.bind(connection?.rpc)

    const handler = async (endpoint: string, payload: unknown, _signal: AbortSignal): Promise<unknown> => {
      try {
        switch (endpoint) {
          case ENDPOINT.list: {
            const rows = await listAll(ctx)
            return {
              ok: true,
              value: {
                rows: rows.map(r => ({ ...r, sessionId: String(r.sessionId) })),
                archiveAvailable: ctx.get('workspaceRegistry') !== undefined,
              },
            }
          }
          case ENDPOINT.preview: {
            const sessionId = sessionIdOf(payload)
            if (sessionId === null) return badRequest('missing sessionId')
            const events = await rawEventsOf(ctx, sessionId)
            const preview = previewOf(events)
            return {
              ok: true,
              value: {
                sessionId,
                messages: preview.messages,
                eventTypes: preview.eventTypes,
              },
            }
          }
          case ENDPOINT.delete: {
            const sessionId = sessionIdOf(payload)
            if (sessionId === null) return badRequest('missing sessionId')
            const outcomes = await deleteSession(deleteHostOf(ctx), sessionId)
            // Forward the harness's own removed event so every connected
            // client drops the row from its local list snapshot. Without it
            // the session stays in the sidebar until the next full list pull,
            // and workspace mutations make it surface under Ungrouped.
            for (const outcome of outcomes) {
              ctx.emit('api-session/removed', outcome.sessionId as never)
            }
            return { ok: true, value: { outcomes } }
          }
          case ENDPOINT.setArchived: {
            const request = asRecord(payload) as SetArchivedRequest | null
            const sessionId = asString(request?.sessionId)
            if (sessionId === null || typeof request?.archived !== 'boolean') {
              return badRequest('missing sessionId or archived')
            }
            const result = await setArchived(ctx, sessionId, request.archived)
            return { ok: true, value: result }
          }
          default:
            return {
              ok: false,
              error: { code: 'dsh-session-manager/unknown-endpoint', message: `unknown endpoint: ${endpoint}`, details: {} },
            }
        }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'gateway/internal',
            message: error instanceof Error ? error.message : String(error),
            details: {},
          },
        }
      }
    }

    c.effect(() => {
      const unregister = bound(CHANNEL, handler)
      return () => { void unregister() }
    }, 'dsh-session-manager: rpc channel')
  })
}

function sessionIdOf(payload: unknown): string | null {
  const request = asRecord(payload)
  return asString(request?.sessionId)
}

function badRequest(message: string): unknown {
  return { ok: false, error: { code: 'gateway/bad-request', message, details: {} } }
}

/** Host plugin body. */
export function apply(ctx: Context): void {
  watchChannel(ctx)
}
