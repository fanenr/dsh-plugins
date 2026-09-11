/**
 * Host-facing wire shapes shared between the Host half and the Client half.
 * Every shape here is lossless JSON: it crosses the authenticated
 * `/api/session-manager` route and is re-proved by the client before rendering.
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

/**
 * The authenticated Host route every manager call rides.
 *
 * A Connection *exact fetch route* under `/api`, not a dedicated RPC channel.
 * `connection.rpc.handle()` mounts its physical route through
 * `owner.webServer.register(...)` — a strict read evaluated on the *connection
 * plugin's own* context, which declares only `credentials` since
 * 0.1.5-alpha.1. That read throws inside cordis's isolated effect: the plugin
 * still activates, the channel silently never mounts, and every call falls
 * through to the static fallback's 405. Exact fetch routes never touch
 * `webServer`, and Connection still applies its Host/Origin fence and browser
 * authentication before dispatch.
 */
export const ROUTE = '/api/session-manager'

/** Endpoint names under {@link ROUTE}. */
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
