/**
 * dsh-session-manager — Client half (installed package bundle entry).
 *
 * Registers the Sessions section in the settings panel
 * (`settings.section` slot): session table, preview drawer, archive toggle,
 * and permanent delete. All Host interactions ride the authenticated
 * `/session-manager` channel (bridge.ts).
 *
 * @module dsh-session-manager/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the settings slot declarations (`settings.section`).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { adoptStyles, dict, NS } from './i18n'
import { makeSessionManagerView } from './view'

/** Client bundle id, stamped onto owned style tags for HMR bookkeeping. */
const PLUGIN_ID = 'dsh-session-manager'

/** Required services (the slot and locale shells). */
export const inject = ['slots', 'locale']

/** Client half body: dictionaries + styles + the settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => adoptStyles(PLUGIN_ID), 'dsh-session-manager: stylesheet')
  ctx.effect(() => ctx.locale.register(NS, dict), 'dsh-session-manager: dictionaries')
  const t = ctx.locale.bind(NS) as TranslateNS<typeof NS>

  const view = makeSessionManagerView(t)

  ctx.slots.inject('settings.section', () => {
    return ctx.slots.register(
      { name: 'settings.section', id: 'session-manager', order: 20, label: () => t('nav'), locale: NS },
      view,
    )
  })
}

module.exports = {
  name: 'dsh-session-manager',
  inject,
  apply,
}
