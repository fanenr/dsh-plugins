import {
  useCallback, useEffect, useMemo, useSyncExternalStore, useState, type ReactElement,
} from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the Plugins page's SlotMap merge for the
// 'plugins.bundle.config' entry this page registers into.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import {
  IconChevronDownOutlineRegular, Menu, SettingsForm, type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelCatalog, ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types'
import { formLabels, NS } from './locales.ts'
import type { SubagentDefaultModelSettings } from './index.ts'

/**
 * Injected business face: the shared configuration form plus the catalog loader.
 *
 * The form is injected as `configForm`, never `form`: the owner share of a
 * configuration slot carries a `form` of its own (the Host-supplied
 * {@link ConfigPageForm}), and owner props are spread last, so an injected
 * `form` would be silently replaced by it.
 */
export interface SubagentModelInjected {
  configForm: ConfigForm<SubagentDefaultModelSettings>
  loadCatalog: () => Promise<ModelCatalog>
}

/**
 * Page props: the slot's owner share (this page renders its `page` view) + the
 * injected business face + the locale seat.
 *
 * The bundle page draws the title and description itself, so this page renders
 * only the controls and their save footer.
 */
export type SubagentModelCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & InjectFace<SubagentModelInjected>
  & PropsLocale<typeof NS>

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; catalog: ModelCatalog }
  | { status: 'error'; message: string }

/** The empty-string menu id meaning "built-in". */
const BUILTIN_ID = ''

/** One flat model-menu row id: provider and model joined opaquely. */
function routeIdOf(provider: string, model: string): string {
  return `${provider}\0${model}`
}

/** Resolve the effective route key of a stored section ('' when built-in). */
function routeIdOfSettings(value: SubagentDefaultModelSettings | undefined): string {
  const provider = value?.provider
  const model = value?.model
  if (provider === undefined || model === undefined || provider === '' || model === '') return BUILTIN_ID
  return routeIdOf(provider, model)
}

/** One model row label: `Provider · model`. */
function modelRowLabel(groups: readonly ModelProviderGroup[], provider: string, model: string): string {
  const group = groups.find(candidate => candidate.id === provider)
  const entry = group?.models.find(candidate => candidate.id === model)
  return `${group?.name ?? provider} · ${entry?.name ?? model}`
}

/**
 * Render this bundle's configuration page: the model route and reasoning
 * effort, staged and written by the shared save.
 * @param props - the locale seat, the shared configuration form, and the catalog loader.
 * @returns the staged form.
 */
export function SubagentModelCard({ t, configForm: form, loadCatalog }: SubagentModelCardProps): ReactElement {
  const [modelOpen, setModelOpen] = useState(false)
  const [effortOpen, setEffortOpen] = useState(false)
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  // The write phase, reported to the shared frame so it can label the save
  // control and show a refused write. The draft itself stays local: it is what
  // the menus stage, and only an accepted write drops it.
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const snapshot = useSyncExternalStore(
    useCallback((listener) => form.subscribe(listener), [form]),
    useCallback(() => form.getSnapshot(), [form]),
  )
  const stored = snapshot.value
  // Draft until the Host confirms the write: a rejected write leaves the
  // selection standing while the card flags it and the mirror stays the
  // source of truth for what is stored.
  const [draft, setDraft] = useState<SubagentDefaultModelSettings | undefined>(undefined)

  const value = draft ?? stored
  const provider = value?.provider ?? ''
  const model = value?.model ?? ''
  const effort = value?.reasoningEffort ?? ''
  const ready = snapshot.status === 'ready'
  const disabled = !snapshot.writable
  // Route drafts are records, so same-content comparison must be structural:
  // selecting back the stored value discards the staged edit, not save it.
  const draftSameAsStored = draft !== undefined && stored !== undefined
    && (draft.provider ?? '') === (stored.provider ?? '')
    && (draft.model ?? '') === (stored.model ?? '')
    && (draft.reasoningEffort ?? '') === (stored.reasoningEffort ?? '')
  const pending = draft !== undefined && !draftSameAsStored

  // Load the catalog once when the page opens: dsh hot-reloads adapter/model
  // lists, so the fetch is repeated per page visit rather than cached across
  // sessions. One RPC per visit is negligible on a settings page.
  useEffect(() => {
    let cancelled = false
    setCatalog({ status: 'loading' })
    void loadCatalog()
      .then(next => { if (!cancelled) setCatalog({ status: 'ready', catalog: next }) })
      .catch(error => {
        if (cancelled) return
        setCatalog({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      })
    return () => { cancelled = true }
  }, [loadCatalog])

  const groups = catalog.status === 'ready' ? catalog.catalog.groups : []
  const failures = catalog.status === 'ready'
    ? catalog.catalog.failures.filter(failure => groups.some(group => group.id === failure.id) === false)
    : []
  const group = groups.find(candidate => candidate.id === provider)
  const entry = group?.models.find(candidate => candidate.id === model)
  const efforts = entry?.reasoning?.efforts ?? []
  const currentRouteId = routeIdOfSettings(value)
  const routePresent = currentRouteId === BUILTIN_ID || entry !== undefined
  const routeMissing = currentRouteId !== BUILTIN_ID && entry === undefined
  const currentRouteLabel = currentRouteId === BUILTIN_ID
    ? t('builtin')
    : modelRowLabel(groups, provider, model)

  // Model rows grouped under a non-interactive provider heading, mirroring
  // dsh's own model menus (group title above each provider's models). A route
  // stored but absent from the catalog stays visible as a pinned row so the
  // selection marker has a home and the user sees why the route is stale.
  const modelEntries = useMemo<readonly MenuEntry[]>(() => {
    const entries: MenuEntry[] = [{ id: BUILTIN_ID, label: t('builtin') }]
    if (routeMissing) {
      entries.push({ id: currentRouteId, label: modelRowLabel(groups, provider, model), disabled: true })
    }
    for (const group of groups) {
      entries.push({ type: 'label', id: `group:${group.id}`, text: group.name })
      for (const model of group.models) {
        entries.push({ id: routeIdOf(group.id, model.id), label: model.name })
      }
    }
    return entries
  }, [groups, routeMissing, currentRouteId, provider, model, t])

  const statusText = !ready
    ? snapshot.status === 'loading' ? t('loading') : t('unavailable')
    : catalog.status === 'loading' ? t('loadingCatalog')
      : catalog.status === 'error' ? t('catalogError', { message: catalog.message })
        : undefined

  /** Stage one flat model row or built-in; save writes provider+model atomically. */
  const pickModel = (id: string): void => {
    setModelOpen(false)
    if (id === currentRouteId) {
      // Selecting the stored route back discards the staged edit.
      setDraft(undefined)
      return
    }
    if (id === BUILTIN_ID) {
      // Built-in: clear the whole route and its effort together.
      setDraft({ provider: '', model: '', reasoningEffort: '' })
      return
    }
    const separator = id.indexOf('\0')
    if (separator === -1) return
    const nextProvider = id.slice(0, separator)
    const nextModel = id.slice(separator + 1)
    const nextGroup = groups.find(candidate => candidate.id === nextProvider)
    const nextEntry = nextGroup?.models.find(candidate => candidate.id === nextModel)
    if (nextEntry === undefined) return
    const nextEfforts = nextEntry.reasoning?.efforts ?? []
    const nextEffort = effort !== '' && nextEfforts.some(candidate => candidate.id === effort)
      ? effort
      : ''
    // A route change without an explicit effort lets the route's default
    // effort take over; only carry an effort the user set when the new
    // route still offers it.
    setDraft({ provider: nextProvider, model: nextModel, reasoningEffort: nextEffort })
  }

  const pickEffort = (id: string): void => {
    setEffortOpen(false)
    if (id === effort && draftSameAsStored) {
      // Selecting the stored effort back discards the staged edit.
      setDraft(undefined)
      return
    }
    // An empty id stores the built-in marker, keeping all three fields on one
    // two-state contract (non-empty = explicit, empty = defer).
    setDraft({
      provider: provider || '',
      model: model || '',
      reasoningEffort: id,
    })
  }

  /**
   * Write the staged route, reporting the phase the shared frame renders.
   *
   * Only an accepted write drops the draft: a refused one leaves the selection
   * standing so the user can correct it instead of retyping it, while the
   * mirror stays the source of truth for what is stored.
   * @returns settlement after the write.
   */
  const save = async (): Promise<void> => {
    if (!pending || !snapshot.writable || saving) return
    const next = draft
    if (next === undefined) return
    const base = value ?? {}
    const ops: SettingsPathOpView[] = []
    const setField = <K extends keyof SubagentDefaultModelSettings>(field: K, nextValue: SubagentDefaultModelSettings[K]): void => {
      if (nextValue === '') {
        if (base[field] !== undefined) ops.push({ op: 'unset', path: [field] })
      } else if (nextValue !== undefined) {
        ops.push({ op: 'set', path: [field], value: nextValue })
      }
    }
    setField('provider', next.provider ?? '')
    setField('model', next.model ?? '')
    setField('reasoningEffort', next.reasoningEffort ?? '')
    setSaving(true)
    try {
      const accepted = await form.mutate(ops)
      setFailed(!accepted)
      if (accepted) setDraft(undefined)
    } catch (_error) {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="dsh_sdm_page">
      {statusText !== undefined && <p className="dsh_sdm_muted">{statusText}</p>}
      {failures.length > 0 && (
        <p className="dsh_sdm_muted">{t('partialFailure', { providers: failures.map(failure => failure.name).join('、') })}</p>
      )}

      <SettingsForm
        labels={formLabels(t)}
        state={{
          available: ready,
          writable: snapshot.writable,
          dirty: pending,
          // A route draft is always a well-formed selection, so the frame own
          // gates are the only thing that can block this save.
          invalid: false,
          saving,
          failed,
        }}
        onSave={() => { void save() }}
        onDiscard={() => { setDraft(undefined) }}
      >
        <>
          <div className="dsh_sdm_row">
            <div className="dsh_sdm_rowText">
              <div className="dsh_sdm_rowTitle">{t('model')}</div>
            </div>
            <Menu
              open={modelOpen && !disabled && !saving}
              onClose={() => setModelOpen(false)}
              items={modelEntries}
              selectedId={routePresent ? currentRouteId : undefined}
              onSelect={(id) => { pickModel(id) }}
              align="end"
              portal
              anchor={(
                <button
                  type="button"
                  className="dsh_sdm_selector"
                  aria-haspopup="menu"
                  aria-expanded={modelOpen}
                  disabled={disabled || saving || modelEntries.length <= 1}
                  onClick={() => setModelOpen(value => !value)}
                >
                  <span className="dsh_sdm_selectorText">{currentRouteLabel}</span>
                  <IconChevronDownOutlineRegular className="dsh_sdm_chevron" />
                </button>
              )}
            />
          </div>

          {currentRouteId !== BUILTIN_ID && (entry?.reasoning !== undefined || routeMissing) && (
            <div className="dsh_sdm_row">
              <div className="dsh_sdm_rowText">
                <div className="dsh_sdm_rowTitle">{t('effort')}</div>
              </div>
              <Menu
                open={effortOpen && !disabled && !saving}
                onClose={() => setEffortOpen(false)}
                items={[
                  { id: '', label: t('effortEmpty') },
                  ...efforts.map(item => ({ id: item.id, label: item.name })),
                ]}
                selectedId={effort}
                onSelect={(id) => { pickEffort(id) }}
                align="end"
                portal
                anchor={(
                  <button
                    type="button"
                    className="dsh_sdm_selector"
                    aria-haspopup="menu"
                    aria-expanded={effortOpen}
                    disabled={disabled || saving || efforts.length === 0}
                    onClick={() => setEffortOpen(value => !value)}
                  >
                    <span className="dsh_sdm_selectorText">
                      {effort === ''
                        ? t('effortEmpty')
                        : efforts.find(item => item.id === effort)?.name ?? effort}
                    </span>
                    <IconChevronDownOutlineRegular className="dsh_sdm_chevron" />
                  </button>
                )}
              />
            </div>
          )}
        </>
      </SettingsForm>
    </div>
  )
}
