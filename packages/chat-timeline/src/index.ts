import type { Context } from '@deepseek-ai/cordis'
// Type-only: resolves ctx.sessionProjections for the optional unit child.
import type {} from '@deepseek-ai/dsh-session-projection'
import { timelineProjectionDefinition } from './projection.ts'

// This re-export keeps the SessionProjectionMap merge on the package root.
export type * from './types.ts'

export { timelineProjectionDefinition } from './projection.ts'

export const name = 'chat-timeline'

export const inject = ['sessionProjections']

export function apply(ctx: Context): void {
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register(timelineProjectionDefinition)
  })
}
