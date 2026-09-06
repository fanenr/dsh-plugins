import { useCallback, useEffect, useRef, useSyncExternalStore, useState, type ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from './locales.ts'
import { MODE_ORDER } from '../mode.ts'
import type { PonytailSettings } from './index.ts'

/** Injected business face: the bound settings scope for the ponytail namespace. */
export interface PonytailInjected {
  scope: SettingsScope<PonytailSettings>
}

/** Card props: owner share is empty for plugin cards. */
export type PonytailCardProps =
  PropsRuntime<'settings.plugin.item'>
  & InjectFace<PonytailInjected>
  & PropsLocale<typeof NS>

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

export function PonytailCard({ t, scope }: PonytailCardProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const saveStarted = useRef(false)
  const snapshot = useSyncExternalStore(
    useCallback((listener) => scope.subscribe(listener), [scope]),
    useCallback(() => scope.getSnapshot(), [scope]),
  )
  // Draft until the Host confirms the write: a rejected write leaves the
  // selection standing while the card flags it and the mirror stays the
  // source of truth for what is stored.
  const [draft, setDraft] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (saving) {
      saveStarted.current = true
      return
    }
    if (!saveStarted.current) return
    saveStarted.current = false
    if (!failed) setOpen(false)
  }, [saving, failed])
  const stored = snapshot.value?.defaultMode
  const pending = draft !== undefined && draft !== stored
  const mode = pending ? draft : stored
  const saved = snapshot.status === 'ready'
  const label = mode !== undefined && mode !== '' ? modeLabel(t, mode) : t('inherit')
  const status = snapshot.status === 'loading'
    ? t('loading')
    : snapshot.status === 'unavailable' ? t('unavailable') : undefined

  const pick = (next: string): void => {
    setMenuOpen(false)
    if (!saved) return
    if (next === stored) {
      setDraft(undefined)
      setFailed(false)
      return
    }
    setDraft(next)
    setFailed(false)
  }

  const save = (): void => {
    if (!pending || saving) return
    setSaving(true)
    void scope.mutate([
      draft === ''
        ? { op: 'unset', path: ['defaultMode'] }
        : { op: 'set', path: ['defaultMode'], value: draft },
    ]).then(() => {
      setDraft(undefined)
      setFailed(false)
    }).catch(() => {
      setFailed(true)
    }).finally(() => {
      setSaving(false)
    })
  }

  const discard = (): void => {
    setDraft(undefined)
    setFailed(false)
  }

  const blocked = !saved || !pending || saving

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
        {pending ? <span className="dsh_ponytail_pending">{t('unsaved')}</span> : null}
        <IconChevronDownOutline14 className={`dsh_ponytail_chevron${open ? ' dsh_ponytail_chevronOpen' : ''}`} />
      </button>

      {open && (
        <div className="dsh_ponytail_body">
          {status !== undefined && <p className="dsh_ponytail_muted">{status}</p>}
          {saved && (
            <div className="dsh_ponytail_row">
              <div className="dsh_ponytail_rowText">
                <div className="dsh_ponytail_rowTitle">{t('defaultMode')}</div>
              </div>
              <Menu
                open={menuOpen && !saving}
                onClose={() => setMenuOpen(false)}
                items={MODE_ORDER.map(item => ({
                  id: item,
                  label: item === '' ? t('inherit') : modeLabel(t, item),
                }))}
                selectedId={mode}
                onSelect={(id) => { pick(id) }}
                align="end"
                portal
                anchor={(
                  <button
                    type="button"
                    className="dsh_ponytail_selector"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    disabled={saving}
                    onClick={() => setMenuOpen(value => !value)}
                  >
                    {label}
                    <IconChevronDownOutline14 className="dsh_ponytail_chevron" />
                  </button>
                )}
              />
            </div>
          )}
          <div className="dsh_ponytail_footer">
            {failed ? <p className="dsh_ponytail_failed" role="status">{t('saveError')}</p> : null}
            <button
              type="button"
              className="dsh_ponytail_discard"
              disabled={!pending || saving}
              onClick={discard}
            >
              {t('discard')}
            </button>
            <button
              type="button"
              className="dsh_ponytail_save"
              disabled={blocked}
              onClick={save}
            >
              {t(saving ? 'saving' : 'save')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
