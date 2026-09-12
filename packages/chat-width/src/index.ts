/**
 * dsh-chat-width — Host half.
 *
 * Registers the `chat-width` settings namespace (the transcript content width
 * as a percentage of the conversation column). Every visual effect lives in
 * the browser half; this half only gives the preference a durable home in the
 * user-settings document.
 *
 * @module dsh-chat-width
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { NS, PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN, type ChatWidthSettings } from './shared.ts'

export { NS, PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN, type ChatWidthSettings } from './shared.ts'

/** Plugin identity, used as the cordis bundle entry name. */
export const name = 'dsh-chat-width'

/**
 * Durable schema. The field carries no default — an absent value means
 * "adaptive", so clearing the input restores dsh's own clamp instead of
 * pinning a percentage.
 */
export const ChatWidthSettingsSchema: Schema<ChatWidthSettings> = z.object({
  [PERCENT_FIELD]: z.number().step(1).min(PERCENT_MIN).max(PERCENT_MAX),
})

/**
 * Register the durable section when the optional settings service is
 * composed; a profile without it simply serves no namespace.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NS, ChatWidthSettingsSchema)
  })
}
