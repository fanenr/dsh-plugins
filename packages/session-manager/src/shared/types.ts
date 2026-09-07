/**
 * Host-facing wire shapes shared between the Host half and the Client half.
 * Every shape here is lossless JSON: it crosses the authenticated Connection
 * RPC channel and is re-proved by the client before rendering.
 *
 * @module dsh-session-manager/shared
 */

/** One session row in the manager list. */
export interface SessionManagerRow {
  sessionId: string
  /** Latest folded title; absent when the log carries none. */
  title: string | null
  /** Last durable user-activity timestamp. */
  lastActivity: number
  /** Whether a live Host agent owns this session right now. */
  running: boolean
  /** Whether this session is archived (hidden from grouping surfaces). */
  archived: boolean
  /** Project basename for grouping; null when the header carries no cwd. */
  project: string | null
}

/** The complete manager list response. */
export interface SessionManagerListValue {
  rows: SessionManagerRow[]
  /** Whether archive toggling is available on this Host (workspace registry). */
  archiveAvailable: boolean
}

/** One preview message. */
export interface SessionPreviewMessage {
  role: 'user' | 'assistant'
  /** Plain text projection; image/file blocks count as inline references. */
  text: string
}

/** One previewed session. */
export interface SessionPreviewValue {
  sessionId: string
  messages: SessionPreviewMessage[]
  /** Distinct event types seen (capped); distinguishes metadata-only sessions. */
  eventTypes: string[]
}

/** One deleted identity plus its outcome. */
export interface SessionDeleteOutcome {
  sessionId: string
  /** Log directory removed. */
  logRemoved: boolean
  /** Projection-cache row removed. */
  cacheRemoved: boolean
  /** Workspace accounting cleaned. */
  workspaceRemoved: boolean
}

/** The complete delete response. */
export interface SessionDeleteValue {
  outcomes: SessionDeleteOutcome[]
}

/** Archive toggle result. */
export interface SessionArchiveValue {
  archivedSessionIds: string[]
}

/** The authenticated Host channel (connection.rpc). */
export const CHANNEL = '/session-manager'

/** Endpoint names on the channel. */
export const ENDPOINT = {
  list: 'list',
  preview: 'preview',
  delete: 'delete',
  setArchived: 'setArchived',
} as const

/** Request payload for archive toggle. */
export interface SetArchivedRequest {
  sessionId: string
  archived: boolean
}
