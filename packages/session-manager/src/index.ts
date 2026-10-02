/**
 * dsh-session-manager — Host half.
 *
 * Mounts the authenticated `POST /api/session-manager` route (list, preview,
 * delete, setArchived) as a Connection exact fetch route, which keeps the
 * Host/Origin fence and browser authentication in front of these destructive
 * operations while staying off profiles with no web surface.
 *
 * @module dsh-session-manager
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pulls the workspace event declarations (`workspace/session-stop`).
import type {} from '@deepseek-ai/dsh-workspace'
import { asRecord, asString } from './host/parsing.ts'
import { listAll, previewOf, rawEventsOf } from './host/list.ts'
import { setArchived } from './host/store.ts'
import { deleteSession, descendantsOf, logDirName, type DeleteHost } from './host/delete.ts'
import {
  ROUTE, ENDPOINT,
  type SetArchivedRequest,
} from './shared/types.ts'

/** Plugin identity, used as the cordis bundle entry name. */
export const name = 'dsh-session-manager'

/** Services this plugin requires unconditionally. The API route mounts
 *  lazily through `ctx.inject(['connection'])`, so a profile without a web
 *  surface never mounts it. */
export const inject: string[] = []

export { deleteSession, descendantsOf, logDirName }
export { groupRowsByProject } from './shared/group.ts'
export { previewOf } from './host/list.ts'
export { setArchived } from './host/store.ts'
export type { DeleteHost }

/** Host context member the boot half provides: the harness's own home resolver. */
type DshHomePath = (...segments: string[]) => string

/**
 * Resolve the harness home the way the harness itself does: through the
 * resolver the boot half publishes on the context, which honors a configured
 * home, `$DSH_HOME` (whitespace-only counts as unset), tilde expansion, and
 * normalization. The `$DSH_HOME`-or-`~/.dsh` fallback only covers a context
 * without that member (a unit test, or a host assembled without app-boot).
 */
export function dshHomeRoot(ctx: Context, ...segments: string[]): string {
  const resolve = ctx.get('dshHomePath') as DshHomePath | undefined
  if (typeof resolve === 'function') return resolve(...segments)
  const override = process.env.DSH_HOME
  const home = override !== undefined && override.trim().length > 0
    ? override
    : join(homedir(), '.dsh')
  return join(home, ...segments)
}

/** Physical log directory facade (node:fs, DI-seamable for tests). */
export interface LogDirHost {
  /** Project buckets under the session root. */
  buckets(): string[]
  exists(path: string): boolean
  rm(path: string): void
}

/** The real filesystem facade over `$DSH_HOME/sessions`. */
function nodeLogs(root: string): LogDirHost {
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

/**
 * Find one session's log directory by scanning project buckets. The directory
 * name is the id's encoded path segment, exactly as the persistence backend
 * spells it, so a hit can only be this session's own directory.
 */
export function findLogDir(logs: LogDirHost, sessionId: string): string | null {
  const name = logDirName(sessionId)
  for (const bucket of logs.buckets()) {
    const candidate = join(bucket, name)
    if (logs.exists(candidate)) return candidate
  }
  return null
}

/** Build the delete host facade from the live ctx. */
function deleteHostOf(ctx: Context): DeleteHost {
  const logs = nodeLogs(dshHomeRoot(ctx, 'sessions'))
  const sessions = ctx.get('sessions') as { get(id: string): unknown } | undefined
  const agents = ctx.get('agents') as { get(id: string): { status?: string } | undefined } | undefined
  const persistence = ctx.get('sessionPersistence') as {
    open(id: string, access: 'write'): Promise<{ close(): Promise<void> }>
  } | undefined
  return {
    sessions: { get: (id) => sessions?.get(id) },
    agents: { get: (id) => agents?.get(id) },
    sessionQuery: ctx.get('sessionQuery') as DeleteHost['sessionQuery'],
    storageDomain: ctx.get('storageDomain') as DeleteHost['storageDomain'],
    workspaceRegistry: ctx.get('workspaceRegistry') as DeleteHost['workspaceRegistry'],
    // The harness's own work-stop seam (`ctx.parallel` in the registry's
    // archive-with-stop path): it reaches the schedule and job owners that key
    // their records by session id.
    stopActivity: {
      request: sessionId => ctx.parallel('workspace/session-stop', { sessionId: sessionId as SessionId }),
    },
    logs: {
      findDir: id => findLogDir(logs, id),
      removeDir: dir => logs.rm(dir),
      exists: dir => logs.exists(dir),
    },
    // `open(..., 'write')` is the harness's own single-writer claim: it takes
    // the same in-process slot `sessionPersistence` routes live events through
    // AND the cross-process kernel lease, so a sibling dsh writing this session
    // rejects with SessionAlreadyOwnedError instead of being silently deleted
    // under. Closing it releases both; the caller holds it across removal.
    writeLease: persistence === undefined ? undefined : {
      claim: async (sessionId: string) => {
        const handle = await persistence.open(sessionId, 'write')
        return () => handle.close()
      },
    },
  }
}

/**
 * Mount the authenticated `/api/session-manager` route on Connection (the
 * shared wire module owns why it is an exact fetch route). An absent
 * `connection` keeps the route off profiles with no web surface.
 */
function watchRoute(ctx: Context): void {
  ctx.inject(['connection'], (c) => {
    const connection = c.get('connection') as {
      fetch?: {
        register(route: {
          path: string
          methods: readonly ('GET' | 'HEAD' | 'POST')[]
          requestBody: 'buffered'
          fetch(request: Request): Promise<Response>
        }): () => Promise<void>
      }
    } | undefined
    const register = connection?.fetch?.register
    if (typeof register !== 'function') return
    const bound = register.bind(connection?.fetch)

    const handler = async (endpoint: string, payload: unknown): Promise<unknown> => {
      try {
        switch (endpoint) {
          case ENDPOINT.list: {
            const rows = await listAll(ctx)
            return {
              ok: true,
              value: {
                rows,
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
              ctx.emit('api-session/removed', outcome.sessionId as SessionId)
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
      const unregister = bound({
        path: ROUTE,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let body: unknown
          try {
            body = await request.json()
          } catch {
            return jsonResponse({ ok: false, error: { code: 'gateway/bad-request', message: 'body is not JSON', details: {} } }, 400)
          }
          const envelope = asRecord(body)
          const endpoint = asString(envelope?.endpoint)
          if (endpoint === null) {
            return jsonResponse({ ok: false, error: { code: 'gateway/bad-request', message: 'missing endpoint', details: {} } }, 400)
          }
          const result = await handler(endpoint, envelope?.payload)
          return jsonResponse(result, 200)
        },
      })
      return () => { unregister().catch(() => { /* route already gone: nothing to release */ }) }
    }, 'dsh-session-manager: api route')
  })
}

/** Serialize one handler result as a JSON response. */
function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
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
  watchRoute(ctx)
}
