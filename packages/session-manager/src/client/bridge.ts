/**
 * The client half's RPC bridge to the Host channel (`/session-manager`).
 *
 * Reads ride the harness's generic Connection RPC (`ctx.connection.rpc.call`)
 * — resolved through a reflect read so a hostile or absent connection service
 * degrades to undefined instead of throwing. Responses are re-proved at the
 * boundary: a malformed payload becomes a typed failure, never a half-merged
 * render.
 *
 * @module dsh-session-manager/client-bridge
 */

import type {
  SessionArchiveValue, SessionDeleteValue, SessionManagerListValue, SessionPreviewValue,
} from '../shared/types'
import { CHANNEL, ENDPOINT } from '../shared/types'
import type { SessionManagerRow } from '../shared/types'
/** Narrow any value to a plain record, or null. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** The client-side connection rpc face (call via POST envelope). */
interface RpcFace {
  call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown>
}

/** The generic client context face this bridge reads. */
export interface BridgeCtx {
  get(name: string): unknown
}

/** One proved list row. */
function rowOf(value: unknown): SessionManagerRow | null {
  const record = asRecord(value)
  if (record === null) return null
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId : null
  if (sessionId === null) return null
  return {
    sessionId,
    title: typeof record.title === 'string' ? record.title : null,
    lastActivity: typeof record.lastActivity === 'number' && Number.isFinite(record.lastActivity) ? record.lastActivity : 0,
    running: record.running === true,
    archived: record.archived === true,
    project: typeof record.project === 'string' ? record.project : null,
  }
}

/** One proved preview message. */
function messageOf(value: unknown): { role: 'user' | 'assistant'; text: string } | null {
  const record = asRecord(value)
  if (record === null) return null
  const role = record.role
  if (role !== 'user' && role !== 'assistant') return null
  if (typeof record.text !== 'string') return null
  return { role, text: record.text }
}

/** Resolve the connection rpc caller once, defensively. */
function callerOf(ctx: BridgeCtx): ((channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<unknown>) | undefined {
  try {
    const connection = ctx.get('connection')
    const rpc = asRecord(connection)?.rpc
    const call = rpc !== null ? (rpc as { call?: unknown }).call : undefined
    if (typeof call === 'function') return (call as RpcFace['call']).bind(rpc)
  } catch { /* hostile service read: no caller */ }
  return undefined
}

/** A completed Host call, proved. */
type CallResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string }

async function callHost<T>(ctx: BridgeCtx, endpoint: string, payload: unknown, prove: (value: unknown) => T | null): Promise<CallResult<T>> {
  const call = callerOf(ctx)
  if (call === undefined) {
    return { ok: false, message: 'host channel unavailable' }
  }
  try {
    const result = asRecord(await call(CHANNEL, endpoint, payload))
    if (result === null || result.ok !== true) {
      return { ok: false, message: 'host call failed' }
    }
    const value = prove(result.value)
    if (value === null) return { ok: false, message: 'host returned a malformed value' }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/** List every session through the Host. */
export function listSessions(ctx: BridgeCtx): Promise<CallResult<SessionManagerListValue>> {
  return callHost(ctx, ENDPOINT.list, {}, (value) => {
    const record = asRecord(value)
    if (record === null) return null
    const rowsRaw = record.rows
    if (!Array.isArray(rowsRaw)) return null
    const rows: SessionManagerRow[] = []
    for (const raw of rowsRaw) {
      const row = rowOf(raw)
      if (row !== null) rows.push(row)
    }
    return {
      rows,
      archiveAvailable: record.archiveAvailable === true,
    }
  })
}

/** Preview one session through the Host. */
export function previewSession(ctx: BridgeCtx, sessionId: string): Promise<CallResult<SessionPreviewValue>> {
  return callHost(ctx, ENDPOINT.preview, { sessionId }, (value) => {
    const record = asRecord(value)
    if (record === null) return null
    if (typeof record.sessionId !== 'string') return null
    const rawMessages = record.messages
    if (!Array.isArray(rawMessages)) return null
    const messages: Array<{ role: 'user' | 'assistant'; text: string }> = []
    for (const raw of rawMessages) {
      const message = messageOf(raw)
      if (message !== null) messages.push(message)
    }
    return {
      sessionId: record.sessionId,
      messages,
      eventTypes: Array.isArray(record.eventTypes)
        ? record.eventTypes.filter(t => typeof t === 'string')
        : [],
    }
  })
}

/** Delete one session (and descendants) through the Host. */
export function deleteSession(ctx: BridgeCtx, sessionId: string): Promise<CallResult<SessionDeleteValue>> {
  return callHost(ctx, ENDPOINT.delete, { sessionId }, (value) => {
    const record = asRecord(value)
    if (record === null) return null
    const outcomes = record.outcomes
    if (!Array.isArray(outcomes)) return null
    return { outcomes: outcomes.filter(o => asRecord(o)?.sessionId !== undefined) as SessionDeleteValue['outcomes'] }
  })
}

/** Toggle one session's archive membership through the Host. */
export function setArchived(ctx: BridgeCtx, sessionId: string, archived: boolean): Promise<CallResult<SessionArchiveValue>> {
  return callHost(ctx, ENDPOINT.setArchived, { sessionId, archived }, (value) => {
    const record = asRecord(value)
    if (record === null) return null
    const ids = record.archivedSessionIds
    if (!Array.isArray(ids)) return null
    return { archivedSessionIds: ids.filter(id => typeof id === 'string') }
  })
}
