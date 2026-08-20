import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.dock entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TimelineRail, type TimelineRailInjected } from './TimelineRail.tsx'
import { NS, en, zh } from './locales.ts'
import { adoptStyles } from './styles.ts'

export { TimelineRail } from './TimelineRail.tsx'
export type { TimelineRailInjected, TimelineRailProps } from './TimelineRail.tsx'

export const inject = ['slots', 'locale', 'sessions']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => adoptStyles(), 'chat-timeline: stylesheet')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'chat-timeline: dictionaries')
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'chat-timeline',
    order: 40,
    locale: NS,
    inject: (): TimelineRailInjected => ({ sessionsService: ctx.sessions }),
  }, TimelineRail))
}
