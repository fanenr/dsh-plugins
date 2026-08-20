import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'

/** One user-sent message as enumerated by the timeline projection. */
export interface TimelineEntry {
  /** Sort key: the source event's durable sequence number. */
  seq: number
  /** Preview text (text blocks joined, trimmed, capped at {@link MAX_TEXT_CHARS}). */
  text: string
  /** Durable message id, when the source event carries one. */
  id?: string
}

/** Value of the `dshChatTimeline` projection — the fold state and wire view are the same shape. */
export interface TimelineProjection {
  messages: TimelineEntry[]
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Durable enumeration of every directly user-sent message in the session. */
    dshChatTimeline: TimelineProjection
  }
  interface SessionProjectionStateMap {
    dshChatTimeline: TimelineProjection
  }
}

/** Preview cap (characters) for the wire value. */
export const MAX_TEXT_CHARS = 80

/** Join the text blocks of a host-side ContentBlock list into a capped preview. */
export function textOf(content: readonly ContentBlock[] | undefined): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      const text = block.text.trim()
      if (text !== '') parts.push(text)
    }
  }
  return parts.join(' ').slice(0, MAX_TEXT_CHARS)
}
