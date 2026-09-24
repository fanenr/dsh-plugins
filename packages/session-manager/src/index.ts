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
import { asRecord, asString } from './host/parsing.ts'
import { listAll, previewOf, rawEventsOf } from './host/list.ts'
import { setArchived } from './host/store.ts'
import { deleteSession, descendantsOf, idVariants, type DeleteHost } from './host/delete.ts'
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

export { deleteSession, descendantsOf, idVariants }
export { groupRowsByProject } from './shared/group.ts'
export { previewOf } from './host/list.ts'
export { setArchived } from './host/store.ts'
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
    logs: {
      findDir: id => findLogDir(logs, id),
      removeDir: dir => logs.rm(dir),
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
 * Mount the authenticated `/api/session-manager` route on Connection.
 *
 * An exact fetch route, deliberately not `connection.rpc.handle()`: that verb
 * mounts its physical route through `owner.webServer.register(...)`, where
 * `owner` is the connection plugin's own context. Since 0.1.5-alpha.1 that
 * context declares only `credentials`, so the strict `webServer` read throws
 * inside cordis's isolated effect — this plugin activates, the channel never
 * mounts, and every call reaches the static fallback's 405. Exact fetch routes
 * avoid `webServer` entirely while still running behind Connection's
 * Host/Origin fence and browser authentication, and an absent `connection`
 * keeps the route off profiles with no web surface.
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
          const result = await handler(endpoint, envelope?.payload, request.signal)
          return jsonResponse(result, 200)
        },
      })
      return () => { void unregister() }
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
