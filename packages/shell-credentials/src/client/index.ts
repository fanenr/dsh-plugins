/**
 * dsh-shell-credentials — Client half (browser bundle entry).
 *
 * Registers this bundle's configuration page: the forwarded-name allowlist and
 * the never-forward denylist, rendered on the bundle's own Plugins page. The
 * page exists exactly while the Host serves this entry's settings namespace, so
 * a deployment that never composed the Host half shows no trace of it.
 *
 * @module dsh-shell-credentials/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the Plugins page's SlotMap merge (the
// 'plugins.bundle.config' entry) and the ctx.configForms Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ShellCredentialsCardController, type ShellCredentialsSettings } from './card-controller.ts'
import { ShellCredentialsCard } from './ConfigCard.tsx'
import { en, NS, zh } from './locales.ts'

export { ShellCredentialsCard } from './ConfigCard.tsx'
export type { ShellCredentialsCardProps } from './ConfigCard.tsx'
export { ShellCredentialsCardController } from './card-controller.ts'
export type {
  ShellCredentialsCardFace, ShellCredentialsCardState, ShellCredentialsSettings,
} from './card-controller.ts'

/** Client bundle id; also the dictionary namespace and the row's package key. */
const PLUGIN_ID = 'dsh-shell-credentials'

/**
 * The settings namespace, which is the PROFILE ENTRY ID the bundle's patch
 * declares — the ROW id, not the package name. A form is keyed by the
 * namespace `settings.describe` reports for the mounted entry, and
 * `whileServed` gates the page on it, so a namespace that no entry owns
 * silently never registers.
 */
const SETTINGS_NS = 'shell-credentials'

/** Required services: the slot registry, the locale shell, and shared config forms. */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Mount this bundle's configuration page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${PLUGIN_ID}: dictionaries`)
  const controller = new ShellCredentialsCardController(ctx.configForms.get<ShellCredentialsSettings>(SETTINGS_NS))
  ctx.effect(() => () => { controller.dispose() }, `${PLUGIN_ID}: form subscription`)
  ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NS], () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: PLUGIN_ID,
    locale: NS,
    inject: () => controller.inject(),
  }, ShellCredentialsCard)), `${PLUGIN_ID}: page`)
}
