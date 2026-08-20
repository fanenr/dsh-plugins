import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ConnectionHandle,
  ModelCatalogFailure,
  ModelProviderGroup,
  ModelReasoningEffort,
  SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from './locales.ts'

/** One model inside a provider group (derived from the wire catalog type). */
type CatalogModel = ModelProviderGroup['models'][number]

/** The llm.models catalog response value. */
interface ModelCatalog {
  groups: ModelProviderGroup[]
  failures: ModelCatalogFailure[]
}

/** Injected business face: connection plus the namespace write verb. */
export interface SubagentModelInjected {
  connection: ConnectionHandle
  saveSelection: (
    provider: string,
    model: string,
    reasoningEffort?: string,
    expectedRevision?: number,
  ) => Promise<SettingsNamespaceView>
  subscribeSettingsUpdates: (listener: (ns: string, revision: number) => void) => () => void
}

/** Card props: owner share is empty for plugin cards. */
export type SubagentModelCardProps =
  PropsRuntime<'settings.plugin.item'>
  & InjectFace<SubagentModelInjected>
  & PropsLocale<typeof NS>

interface Snapshot {
  provider?: string
  model?: string
  reasoningEffort?: string
  /** Settings namespace revision at load; fences the next write. */
  revision?: number
  catalog?: ModelCatalog
  status: 'loading' | 'ready' | 'error'
  error?: string
}

/** Minimal settings describe wire shape used here. */
interface SettingsView {
  ns: string
  revision: number
  value: { provider?: string; model?: string; reasoningEffort?: string }
}

/** Load the model catalog plus the current namespace value. */
async function loadSnapshot(connection: ConnectionHandle): Promise<Snapshot> {
  const [modelsResponse, settingsResponse] = await Promise.all([
    connection.api.llm.models({}),
    connection.api.settings.describe({}),
  ])
  if (!modelsResponse.result.ok) throw new Error(modelsResponse.result.error.message)
  const catalog = modelsResponse.result.value as ModelCatalog
  let provider: string | undefined
  let model: string | undefined
  let reasoningEffort: string | undefined
  let revision: number | undefined
  if (settingsResponse.result.ok) {
    const view = (settingsResponse.result.value as { namespaces: SettingsView[] }).namespaces
      .find(candidate => candidate.ns === 'subagent-default-model')
    provider = view?.value?.provider
    model = view?.value?.model
    reasoningEffort = view?.value?.reasoningEffort
    revision = view?.revision
  }
  return {
    ...(provider === undefined ? {} : { provider }),
    ...(model === undefined ? {} : { model }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(revision === undefined ? {} : { revision }),
    catalog,
    status: 'ready',
  }
}

export function SubagentModelCard({ t, connection, saveSelection, subscribeSettingsUpdates }: SubagentModelCardProps): ReactElement | null {
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: 'loading' })
  const [open, setOpen] = useState(false)
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [effortOpen, setEffortOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadSnapshot(connection)
      .then(next => { if (!cancelled) setSnapshot(next) })
      .catch(error => {
        if (cancelled) return
        setSnapshot({ status: 'error', error: error instanceof Error ? error.message : String(error) })
      })
    return () => { cancelled = true }
  }, [connection])

  // Reload when the namespace's raw section changes anywhere — another tab's
  // write or an external settings.yaml edit. The reload re-reads the revision
  // so the next write fences against the freshest document.
  useEffect(() => {
    const dispose = subscribeSettingsUpdates((ns) => {
      if (ns !== NS) return
      void loadSnapshot(connection)
        .then(next => setSnapshot(prev => ({ ...next, ...(prev.error === undefined ? {} : { error: prev.error }) })))
        .catch(error => setSnapshot({ status: 'error', error: error instanceof Error ? error.message : String(error) }))
    })
    return dispose
  }, [connection, subscribeSettingsUpdates])

  const providerOptions = useMemo(
    () => snapshot.catalog?.groups.map(group => ({ id: group.id, name: group.name })) ?? [],
    [snapshot.catalog],
  )
  const currentGroup = useMemo(
    () => snapshot.catalog?.groups.find(candidate => candidate.id === snapshot.provider),
    [snapshot.catalog, snapshot.provider],
  )
  const modelOptions = useMemo(
    () => currentGroup?.models.map(model => ({ id: model.id, name: model.name })) ?? [],
    [currentGroup],
  )
  const currentModel = useMemo(
    () => currentGroup?.models.find(candidate => candidate.id === snapshot.model),
    [currentGroup, snapshot.model],
  )
  const effortOptions = useMemo(
    () => currentModel?.reasoning?.efforts.map((effort: ModelReasoningEffort) => ({ id: effort.id, name: effort.name })) ?? [],
    [currentModel],
  )

  /** Persist one complete selection immediately; optimistic UI with revert on failure. */
  const pick = async (provider: string, model: string, reasoningEffort?: string): Promise<void> => {
    const previous = snapshot
    setSnapshot(prev => ({ ...prev, provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }))
    try {
      const view = await saveSelection(provider, model, reasoningEffort, snapshot.revision)
      const value = view.value as { provider?: string; model?: string; reasoningEffort?: string }
      setSnapshot(prev => ({
        ...prev,
        provider: value.provider ?? provider,
        model: value.model ?? model,
        ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }),
        revision: view.revision,
      }))
    } catch (error) {
      // A refused write (revision moved) or a transport failure restores the
      // pre-pick state; the update subscription reloads the real section.
      setSnapshot({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Resolve the effort to keep after a model switch: keep the current effort
   * when the new model offers it, else fall back to the model's default, else
   * clear (inherit).
   */
  const effortForModel = (model: CatalogModel | undefined, current: string | undefined): string | undefined => {
    if (model?.reasoning === undefined) return undefined
    if (current !== undefined && model.reasoning.efforts.some(effort => effort.id === current)) return current
    return model.reasoning.defaultEffort
  }

  const currentProvider = providerOptions.find(option => option.id === snapshot.provider)

  return (
    <li className={`dsh_sdm_card${open ? ' dsh_sdm_cardOpen' : ''}`}>
      <button
        type="button"
        className="dsh_sdm_header"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span className="dsh_sdm_headText">
          <span className="dsh_sdm_name">{t('title')}</span>
          <span className="dsh_sdm_description">{t('desc')}</span>
        </span>
        <IconChevronDownOutline14 className={`dsh_sdm_chevron${open ? ' dsh_sdm_chevronOpen' : ''}`} />
      </button>

      {open && (
        <div className="dsh_sdm_body">
          {snapshot.status === 'loading' && <p className="dsh_sdm_muted">{t('loading')}</p>}
          {snapshot.status === 'error' && (
            <p className="dsh_sdm_error" role="alert">{t('loadError', { message: snapshot.error ?? '' })}</p>
          )}

          {snapshot.status === 'ready' && (
            <>
              {(snapshot.catalog?.failures.length ?? 0) > 0 && (
                <p className="dsh_sdm_muted">
                  {t('partialFailure', {
                    providers: snapshot.catalog!.failures
                      .map(failure => failure.name)
                      .join(', '),
                  })}
                </p>
              )}
              {providerOptions.length === 0 ? (
                <p className="dsh_sdm_muted">{t('empty')}</p>
              ) : (
                <>
                  <div className="dsh_sdm_row">
                    <div className="dsh_sdm_rowText">
                      <div className="dsh_sdm_rowTitle">{t('provider')}</div>
                    </div>
                    <Menu
                      open={providerOpen}
                      onClose={() => setProviderOpen(false)}
                      items={providerOptions.map(option => ({
                        id: option.id,
                        label: option.name,
                      }))}
                      selectedId={snapshot.provider}
                      onSelect={(id) => {
                        setProviderOpen(false)
                        const group = snapshot.catalog?.groups.find(candidate => candidate.id === id)
                        const firstModel = group?.models[0]
                        if (firstModel !== undefined) {
                          void pick(id, firstModel.id, effortForModel(firstModel, snapshot.reasoningEffort))
                        }
                      }}
                      align="end"
                      portal
                      anchor={(
                        <button
                          type="button"
                          className="dsh_sdm_selector"
                          aria-haspopup="menu"
                          aria-expanded={providerOpen}
                          onClick={() => setProviderOpen(value => !value)}
                        >
                          {currentProvider?.name ?? t('inherit')}
                          <IconChevronDownOutline14 className="dsh_sdm_chevron" />
                        </button>
                      )}
                    />
                  </div>

                  <div className="dsh_sdm_row">
                    <div className="dsh_sdm_rowText">
                      <div className="dsh_sdm_rowTitle">{t('model')}</div>
                      <div className="dsh_sdm_rowDesc">{t('modelDesc', { provider: currentProvider?.name ?? t('inherit') })}</div>
                    </div>
                    <Menu
                      open={modelOpen}
                      onClose={() => setModelOpen(false)}
                      items={modelOptions.map(option => ({
                        id: option.id,
                        label: option.name,
                      }))}
                      selectedId={snapshot.model}
                      onSelect={(id) => {
                        setModelOpen(false)
                        if (snapshot.provider === undefined) return
                        const model = currentGroup?.models.find(candidate => candidate.id === id)
                        void pick(snapshot.provider, id, effortForModel(model, snapshot.reasoningEffort))
                      }}
                      align="end"
                      portal
                      anchor={(
                        <button
                          type="button"
                          className="dsh_sdm_selector"
                          aria-haspopup="menu"
                          aria-expanded={modelOpen}
                          disabled={modelOptions.length === 0}
                          onClick={() => setModelOpen(value => !value)}
                        >
                          {currentModel?.name ?? t('inherit')}
                          <IconChevronDownOutline14 className="dsh_sdm_chevron" />
                        </button>
                      )}
                    />
                  </div>

                  {currentModel?.reasoning !== undefined && (
                    <div className="dsh_sdm_row">
                      <div className="dsh_sdm_rowText">
                        <div className="dsh_sdm_rowTitle">{t('reasoning')}</div>
                        <div className="dsh_sdm_rowDesc">{t('reasoningDesc')}</div>
                      </div>
                      <Menu
                        open={effortOpen}
                        onClose={() => setEffortOpen(false)}
                        items={[
                          { id: '', label: t('inherit') },
                          ...effortOptions.map(option => ({
                            id: option.id,
                            label: option.name,
                          })),
                        ]}
                        selectedId={snapshot.reasoningEffort ?? ''}
                        onSelect={(id) => {
                          setEffortOpen(false)
                          if (snapshot.provider !== undefined && snapshot.model !== undefined) {
                            void pick(snapshot.provider, snapshot.model, id === '' ? undefined : id)
                          }
                        }}
                        align="end"
                        portal
                        anchor={(
                          <button
                            type="button"
                            className="dsh_sdm_selector"
                            aria-haspopup="menu"
                            aria-expanded={effortOpen}
                            onClick={() => setEffortOpen(value => !value)}
                          >
                            {snapshot.reasoningEffort !== undefined
                              ? effortOptions.find(option => option.id === snapshot.reasoningEffort)?.name ?? snapshot.reasoningEffort
                              : t('inherit')}
                            <IconChevronDownOutline14 className="dsh_sdm_chevron" />
                          </button>
                        )}
                      />
                    </div>
                  )}

                  {snapshot.error !== undefined && (
                    <p className="dsh_sdm_error" role="alert">{t('saveError', { message: snapshot.error })}</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}
