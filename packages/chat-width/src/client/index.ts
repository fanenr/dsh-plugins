/**
 * dsh-chat-width — browser half.
 *
 * One owned stylesheet carries the whole visual effect:
 *
 * - It hides the built-in transcript width drag handles and neutralizes their
 *   `localStorage` preference, so the width axis answers to this plugin alone.
 * - Its trailing rule redefines the conversation root's
 *   `--dsh-chat-content-width` from the column width dsh already publishes on
 *   that element, so the percentage tracks live window and sidebar resizes
 *   with no ResizeObserver of our own.
 *
 * The same half registers the Settings row that writes the preference; the
 * form subscription rewrites the tag's text in place.
 *
 * @module dsh-chat-width/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the config-forms Context merge (ctx.configForms) and the
// ConfigForm face.
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { NS, PERCENT_FIELD, type ChatWidthSettings } from '../shared.ts'
import { ChatWidthRow, type ChatWidthRowInjected } from './SettingsRow.tsx'
import { en, zh } from './locales.ts'
import { adoptStyles, styleText } from './styles.ts'

export { ChatWidthRow } from './SettingsRow.tsx'
export type { ChatWidthRowInjected, ChatWidthRowProps } from './SettingsRow.tsx'
export type { ChatWidthSettings } from '../shared.ts'

/** Client bundle id, stamped onto owned style tags for HMR bookkeeping. */
const PLUGIN_ID = 'dsh-chat-width'

/** Services this client half requires. */
export const inject = ['slots', 'locale', 'configForms']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-chat-width: dictionaries')

  const form: ConfigForm<ChatWidthSettings> = ctx.configForms.get<ChatWidthSettings>(NS)
  ctx.effect(() => {
    const tag = adoptStyles(PLUGIN_ID)
    if (tag === undefined) return () => {}
    const publish = (): void => { tag.textContent = styleText(form.getSnapshot().value?.[PERCENT_FIELD]) }
    const unsubscribe = form.subscribe(publish)
    publish()
    return () => { unsubscribe(); tag.remove() }
  }, 'dsh-chat-width: stylesheet and width rule')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'chat-width',
    order: 13,
    locale: NS,
    inject: (): ChatWidthRowInjected => ({ form }),
  }, ChatWidthRow))
}
