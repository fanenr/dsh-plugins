import { z as zod } from 'zod'
import type { ZodType } from 'zod'
// `/types` and `/surface`, not the package root: the root drags the host
// `Context.sessions` merge into this shared host+client program.
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { TimelineEntry, TimelineProjection } from './types.ts'
import { textOf } from './types.ts'

const timelineEntrySchema = zod.object({
  seq: zod.number(),
  text: zod.string(),
  id: zod.string().optional(),
})

/** The projection value's shape — state and wire are identical for this unit. */
const timelineProjectionSchema: ZodType<TimelineProjection> = zod.object({
  messages: zod.array(timelineEntrySchema),
})

/** The one registered projection unit. */
export const timelineProjectionDefinition = {
  key: 'dshChatTimeline',
  stateSchema: timelineProjectionSchema,
  init: () => ({ messages: [] }),
  apply: (state, event: SessionEvent) => {
    // Only directly user-sent append-origin messages join the timeline, matching
    // the chat view's row classification. Plugin- and tool-injected context
    // rides the same `user/message` event type under a non-`user` `source.kind`;
    // a surface-replacement copy is filtered out because the transcript keeps
    // the original row, so the timeline must count the message once.
    if (event.type !== 'user/message') return state
    if (!isAppendSurfaceEvent(event)) return state
    const data = event.data
    if (data?.source?.kind !== 'user') return state
    const entry: TimelineEntry = {
      seq: event.seq,
      text: textOf(data.content),
      ...(typeof data.id === 'string' ? { id: data.id } : {}),
    }
    return { messages: [...state.messages, entry] }
  },
  wire: { viewSchema: timelineProjectionSchema, view: state => state },
  stateVersion: 5,
} satisfies ProjectionDefinition<'dshChatTimeline', TimelineProjection>
