import { useEffect, useState, type ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ConnectionHandle,
  SettingsNamespaceView,
  SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from './locales.ts'
import { MODE_ORDER } from '../mode.ts'

/** Injected business face: connection plus the namespace write verb. */
export interface PonytailInjected {
  connection: ConnectionHandle
  saveDefaultMode: (mode: string, expectedRevision?: number) => Promise<SettingsNamespaceView>
  subscribeSettingsUpdates: (listener: (ns: string, revision: number) => void) => () => void
}

/** Card props: owner share is empty for plugin cards. */
export type PonytailCardProps =
  PropsRuntime<'settings.plugin.item'>
  & InjectFace<PonytailInjected>
  & PropsLocale<typeof NS>

interface Snapshot {
  defaultMode?: string
  revision?: number
  status: 'loading' | 'ready' | 'error'
  error?: string
}

/** Minimal settings describe wire shape used here. */
interface SettingsView {
  ns: string
  revision: number
  value: { defaultMode?: string }
}

/** Load the ponytail namespace value. */
async function loadSnapshot(connection: ConnectionHandle): Promise<Snapshot> {
  const settingsResponse = await connection.api.settings.describe({})
  if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message)
  const view = (settingsResponse.result.value as { namespaces: SettingsView[] }).namespaces
    .find(candidate => candidate.ns === NS)
  if (view === undefined) {
    return { status: 'ready' }
  }
  return {
    ...(view.value.defaultMode === undefined ? {} : { defaultMode: view.value.defaultMode }),
    revision: view.revision,
    status: 'ready',
  }
}

/** The dropdown label for one level. */
function modeLabel(t: PonytailCardProps['t'], mode: string): string {
  switch (mode) {
    case 'lite': return t('modeLite')
    case 'full': return t('modeFull')
    case 'ultra': return t('modeUltra')
    case 'off': return t('modeOff')
    default: return mode
  }
}

export function PonytailCard({ t, connection, saveDefaultMode, subscribeSettingsUpdates }: PonytailCardProps): ReactElement {
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: 'loading' })
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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

  /** Persist one level; optimistic UI with revert on failure. */
  const pick = async (mode: string): Promise<void> => {
    const previous = snapshot
    setSnapshot(prev => ({ ...prev, defaultMode: mode }))
    try {
      const view = await saveDefaultMode(mode, snapshot.revision)
      const value = view.value as { defaultMode?: string }
      setSnapshot(prev => ({
        ...prev,
        defaultMode: value.defaultMode ?? mode,
        revision: view.revision,
      }))
    } catch (error) {
      setSnapshot({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <li className={`dsh_ponytail_card${open ? ' dsh_ponytail_cardOpen' : ''}`}>
      <button
        type="button"
        className="dsh_ponytail_header"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span className="dsh_ponytail_headText">
          <span className="dsh_ponytail_name">{t('title')}</span>
          <span className="dsh_ponytail_description">{t('desc')}</span>
        </span>
        <IconChevronDownOutline14 className={`dsh_ponytail_chevron${open ? ' dsh_ponytail_chevronOpen' : ''}`} />
      </button>

      {open && (
        <div className="dsh_ponytail_body">
          {snapshot.status === 'loading' && <p className="dsh_ponytail_muted">{t('loading')}</p>}
          {snapshot.status === 'error' && (
            <p className="dsh_ponytail_error" role="alert">{t('loadError', { message: snapshot.error ?? '' })}</p>
          )}

          {snapshot.status === 'ready' && (
            <>
              <div className="dsh_ponytail_row">
                <div className="dsh_ponytail_rowText">
                  <div className="dsh_ponytail_rowTitle">{t('defaultMode')}</div>
                  <div className="dsh_ponytail_rowDesc">{t('defaultModeDesc')}</div>
                </div>
                <Menu
                  open={menuOpen}
                  onClose={() => setMenuOpen(false)}
                  items={MODE_ORDER.map(mode => ({
                    id: mode,
                    label: modeLabel(t, mode),
                  }))}
                  selectedId={snapshot.defaultMode}
                  onSelect={(id) => {
                    setMenuOpen(false)
                    void pick(id)
                  }}
                  align="end"
                  portal
                  anchor={(
                    <button
                      type="button"
                      className="dsh_ponytail_selector"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuOpen(value => !value)}
                    >
                      {snapshot.defaultMode !== undefined ? modeLabel(t, snapshot.defaultMode) : t('inherit')}
                      <IconChevronDownOutline14 className="dsh_ponytail_chevron" />
                    </button>
                  )}
                />
              </div>

              {snapshot.error !== undefined && (
                <p className="dsh_ponytail_error" role="alert">{t('saveError', { message: snapshot.error })}</p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}
