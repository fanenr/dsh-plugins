/**
 * The client half's bridge to the Host route (`POST /api/session-manager`).
 *
 * Calls ride Connection's authenticated exact fetch route rather than
 * `ctx.connection.rpc.call`: the harness's `connection.rpc.handle()` cannot
 * mount a channel for a third-party plugin on 0.1.5 (it reads `webServer` off
 * the connection plugin's own context, which no longer injects it), so the
 * route keeps the same Host/Origin fence and browser authentication without
 * that broken verb. Responses are re-proved at the boundary: a malformed
 * payload becomes a typed failure, never a half-merged render.
 *
 * @module dsh-session-manager/client-bridge
 */

import type {
  SessionArchiveValue, SessionDeleteValue, SessionManagerListValue, SessionPreviewValue,
} from '../shared/types'
import { ENDPOINT, ROUTE } from '../shared/types'
import type { SessionManagerRow } from '../shared/types'
/** Narrow any value to a plain record, or null. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
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

/** A completed Host call, proved. */
type CallResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string }

/**
 * POST one endpoint to the Host route and re-prove the reply.
 *
 * The route answers with the same `{ ok, value }` / `{ ok, error }` envelope
 * the RPC channel used, so every caller below is unchanged. Transport faults
 * (offline, 4xx/5xx, non-JSON) become typed failures instead of throwing.
 */
async function callHost<T>(endpoint: string, payload: unknown, prove: (value: unknown) => T | null): Promise<CallResult<T>> {
  try {
    const response = await fetch(ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint, payload }),
    })
    if (!response.ok) {
      return { ok: false, message: `transport failure for ${ROUTE}/${endpoint}: HTTP ${response.status}` }
    }
    const result = asRecord(await response.json())
    if (result === null) {
      return { ok: false, message: 'host returned an invalid response' }
    }
    if (result.ok !== true) {
      // Surface the host's own error (e.g. a live-session refusal) instead
      // of replacing it with a generic placeholder.
      const error = asRecord(result.error)
      return { ok: false, message: typeof error?.message === 'string' && error.message.length > 0 ? error.message : 'host call failed' }
    }
    const value = prove(result.value)
    if (value === null) return { ok: false, message: 'host returned a malformed value' }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/** List every session through the Host. */
export function listSessions(): Promise<CallResult<SessionManagerListValue>> {
  return callHost(ENDPOINT.list, {}, (value) => {
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
export function previewSession(sessionId: string): Promise<CallResult<SessionPreviewValue>> {
  return callHost(ENDPOINT.preview, { sessionId }, (value) => {
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
export function deleteSession(sessionId: string): Promise<CallResult<SessionDeleteValue>> {
  return callHost(ENDPOINT.delete, { sessionId }, (value) => {
    const record = asRecord(value)
    if (record === null) return null
    const outcomes = record.outcomes
    if (!Array.isArray(outcomes)) return null
    return { outcomes: outcomes.filter(o => asRecord(o)?.sessionId !== undefined) as SessionDeleteValue['outcomes'] }
  })
}

/** Toggle one session's archive membership through the Host. */
export function setArchived(sessionId: string, archived: boolean): Promise<CallResult<SessionArchiveValue>> {
  return callHost(ENDPOINT.setArchived, { sessionId, archived }, (value) => {
    const record = asRecord(value)
    if (record === null) return null
    const ids = record.archivedSessionIds
    if (!Array.isArray(ids)) return null
    return { archivedSessionIds: ids.filter(id => typeof id === 'string') }
  })
}
