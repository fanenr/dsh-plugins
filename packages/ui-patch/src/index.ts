/**
 * ui-patch — Host half.
 *
 * Two jobs, both about giving the browser half something durable to read and
 * write:
 *
 * 1. Declares the live `ui-patch` configuration (the transcript content width
 *    as a percentage of the conversation column). The live field is what gives
 *    the preference a home in the active profile's patch document.
 * 2. Opts out of the auto-generated configuration page, because this plugin
 *    ships its own row in Settings → General instead.
 *
 * Menu movement needs nothing on the Host — it is a browser concern — but it
 * rides the same entry, which is the point of merging the two.
 *
 * @module dsh-ui-patch
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN } from './width.ts'

export { NS } from './shared.ts'
export { PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN, type WidthSettings } from './width.ts'

/** Plugin identity, used as the cordis bundle entry name. */
export const name = 'dsh-ui-patch'

/**
 * Live configuration. The width field carries no default — an absent value
 * means "adaptive", so clearing the input restores dsh's own clamp instead of
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
 * Opt out of the auto-generated configuration page; the browser half renders
 * the Settings row.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
}
