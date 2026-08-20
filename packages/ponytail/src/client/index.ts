import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { PonytailCard, type PonytailInjected } from './SettingsSection.tsx'
import { NS, en, zh } from './locales.ts'
import { adoptStyles } from './styles.ts'

export const inject = ['slots', 'connection', 'locale', 'remote']

/** Persist one level into the ponytail namespace with an optional revision fence. */
async function saveDefaultMode(
  connection: ConnectionHandle,
  mode: string,
  expectedRevision?: number,
): Promise<SettingsNamespaceView> {
  const ops: SettingsPathOpView[] = [{ op: 'set', path: ['defaultMode'], value: mode }]
  const response = await connection.api.settings.mutate({
    ns: NS,
    ops,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  })
  if (!response.result.ok) {
    throw new Error(response.result.error.message)
  }
  return response.result.value
}

/** Injected face for the settings card. */
function injected(ctx: ClientContext): PonytailInjected {
  const connection = ctx.get('connection') as ConnectionHandle
  return {
    connection,
    saveDefaultMode: (mode, expectedRevision) => saveDefaultMode(connection, mode, expectedRevision),
    subscribeSettingsUpdates: (listener) =>
      ctx.get('remote')!.$on('settings/document-updated', listener),
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => adoptStyles(), 'dsh-ponytail: stylesheet')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ponytail: dictionaries')
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: NS,
    locale: NS,
    inject: () => injected(ctx),
  }, PonytailCard))
}
