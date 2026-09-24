import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the Plugins page's SlotMap merge (the 'plugins.item' entry).
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

export function apply(ctx: ClientContext): void {
  ctx.effect(() => adoptStyles(PLUGIN_ID), 'dsh-subagent-default-model: stylesheet')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-subagent-default-model: dictionaries')
  const form: ConfigForm<SubagentDefaultModelSettings> = ctx.configForms.get<SubagentDefaultModelSettings>(NS)
  // The page exists exactly while the Host serves this entry: a deployment
  // that never composed the Host half shows no trace of it.
  ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item',
    id: NS,
    order: 30,
    label: () => ctx.locale.bind(NS)('title'),
    locale: NS,
    inject: (): SubagentModelInjected => ({
      form,
      loadCatalog: () => loadCatalog(ctx),
    }),
  }, SubagentModelCard))), 'dsh-subagent-default-model: page')
}
