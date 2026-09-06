import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the keyed slot declaration (`settings.plugin.item`).
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
// Type-only: pulls the settings scope service merge (`ctx.settingsScope`).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { PonytailCard, type PonytailInjected } from './SettingsSection.tsx'
import { NS, en, zh } from './locales.ts'
import { adoptStyles } from './styles.ts'

export { PonytailCard } from './SettingsSection.tsx'
export type { PonytailInjected, PonytailCardProps } from './SettingsSection.tsx'

/** The `ponytail` namespace section as the settings card edits it. */
export interface PonytailSettings {
  /** Session-start intensity level; blank inherits the composition base. */
  defaultMode?: string
}

export const inject = ['slots', 'locale', 'settingsScope']

/** Client bundle id, stamped onto owned style tags for HMR bookkeeping. */
const PLUGIN_ID = 'dsh-ponytail'

export function apply(ctx: ClientContext): void {
  ctx.effect(() => adoptStyles(PLUGIN_ID), 'dsh-ponytail: stylesheet')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ponytail: dictionaries')
  // One bound scope for the plugin fiber: the card reads the mirror snapshot
  // and writes through revision-fenced field ops.
  const scope = ctx.settingsScope.bind<PonytailSettings>({ namespace: NS })
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: NS,
    locale: NS,
    inject: (): PonytailInjected => ({ scope }),
  }, PonytailCard))
}
