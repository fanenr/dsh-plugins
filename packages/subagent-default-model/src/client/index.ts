import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the Plugins page's SlotMap merge (the
// 'plugins.bundle.config' entry), whose owner share carries `view`.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// Type-only: pulls the ctx.configForms Context merge and the ConfigForm face.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.remote merge (the model catalog read).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import { SubagentModelCard, type SubagentModelInjected } from './SettingsSection.tsx'
import { NS, en, zh } from './locales.ts'
import { adoptStyles } from './styles.ts'

export { SubagentModelCard } from './SettingsSection.tsx'
export type { SubagentModelInjected, SubagentModelCardProps } from './SettingsSection.tsx'

/** The `subagent-default-model` entry's live configuration as the card edits it. */
export interface SubagentDefaultModelSettings {
  /** Provider route; empty means built-in (defer to dsh). */
  provider?: string
  /** Model id; kept in lockstep with `provider`. */
  model?: string
  /** Adapter-owned reasoning effort; empty defers to the route default. */
  reasoningEffort?: string
}

export const inject = ['slots', 'locale', 'configForms', 'remote', 'remote.session']

/** Client bundle id, stamped onto owned style tags for HMR bookkeeping. */
const PLUGIN_ID = 'dsh-subagent-default-model'

/** Load the Host model catalog (providers, their models, reasoning efforts). */
async function loadCatalog(ctx: ClientContext): Promise<ModelCatalog> {
  const response = await ctx.remote.session.modelCatalog()
  if (!response.ok) {
    throw new Error(`${response.error.code}: ${response.error.message}`)
  }
  return response.value
}

/**
 * The bundle page exists exactly while the Host serves this entry: a deployment
 * that never composed the Host half shows no trace of it.
 *
 * The registration is keyed by the bundle's package name and rides
 * `plugins.bundle.config`, which the Plugins page renders on this bundle's own
 * page between its description and its rows. `plugins.item` would list the
 * entry in the Official group instead — that slot belongs to the official
 * settings pages, one companion package per host-plane namespace.
 */
const BUNDLE_NAME = 'dsh-subagent-default-model'

export function apply(ctx: ClientContext): void {
  ctx.effect(() => adoptStyles(PLUGIN_ID), 'dsh-subagent-default-model: stylesheet')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-subagent-default-model: dictionaries')
  const configForm: ConfigForm<SubagentDefaultModelSettings> = ctx.configForms.get<SubagentDefaultModelSettings>(NS)
  ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: BUNDLE_NAME,
    locale: NS,
    inject: (): SubagentModelInjected => ({
      configForm,
      loadCatalog: () => loadCatalog(ctx),
    }),
  }, SubagentModelCard))), 'dsh-subagent-default-model: page')
}
