import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { SubagentModelCard, type SubagentModelInjected } from './SettingsSection.tsx'
import { NS, en, zh } from './locales.ts'
import { adoptStyles } from './styles.ts'

export const inject = ['slots', 'connection', 'locale', 'remote']

async function saveSelection(
  connection: ConnectionHandle,
  provider: string,
  model: string,
  reasoningEffort: string | undefined,
  expectedRevision?: number,
): Promise<SettingsNamespaceView> {
  const ops: SettingsPathOpView[] = [
    { op: 'set', path: ['provider'], value: provider },
    { op: 'set', path: ['model'], value: model },
  ]
  if (reasoningEffort !== undefined && reasoningEffort !== '') {
    ops.push({ op: 'set', path: ['reasoningEffort'], value: reasoningEffort })
  } else {
    ops.push({ op: 'unset', path: ['reasoningEffort'] })
  }
  const response = await connection.api.settings.mutate({
    ns: 'subagent-default-model',
    ops,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  })
  if (!response.result.ok) {
    throw new Error(response.result.error.message)
  }
  return response.result.value
}

function injected(ctx: ClientContext): SubagentModelInjected {
  const connection = ctx.get('connection') as ConnectionHandle
  return {
    connection,
    saveSelection: (provider: string, model: string, reasoningEffort?: string, expectedRevision?: number) =>
      saveSelection(connection, provider, model, reasoningEffort, expectedRevision),
    subscribeSettingsUpdates: (listener: (ns: string, revision: number) => void) =>
      ctx.get('remote')!.$on('settings/document-updated', listener),
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => adoptStyles(), 'dsh-subagent-default-model: stylesheet')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-subagent-default-model: dictionaries')
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: NS,
    locale: NS,
    inject: () => injected(ctx),
  }, SubagentModelCard))
}
