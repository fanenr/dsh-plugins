/**
 * dsh-chat-width — Host half.
 *
 * Declares the live `chat-width` plugin configuration (the transcript content
 * width as a percentage of the conversation column) and turns off the
 * auto-generated configuration page, because this plugin ships its own row in
 * Settings → General. The live field is what gives the preference a durable
 * home in the active profile's patch document.
 *
 * Every visual effect lives in the browser half.
 *
 * @module dsh-chat-width
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { NS, PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN } from './shared.ts'

export { NS, PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN, type ChatWidthSettings } from './shared.ts'

/** Plugin identity, used as the cordis bundle entry name. */
export const name = 'dsh-chat-width'

/**
 * Live configuration. The field carries no default — an absent value means
 * "adaptive", so clearing the input restores dsh's own clamp instead of
 * pinning a percentage.
 */
export interface Config {
  /** Transcript content width as a percentage of the conversation column. */
  percent?: Volatile<number | undefined>
}

/** Live configuration schema; `volatile()` is what makes the field form-editable. */
export const Config = z.object({
  [PERCENT_FIELD]: z.number().step(1).min(PERCENT_MIN).max(PERCENT_MAX).volatile(),
})

/**
 * Opt out of the auto-generated configuration page; this plugin renders its
 * own Settings row through the browser half.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
}
