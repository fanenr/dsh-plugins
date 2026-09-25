/**
 * Settings → General row for the conversation content width: a percentage of
 * the conversation column, or empty for dsh's adaptive width.
 */

import { useCallback, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { NS } from '../shared.ts'
import { PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN, isPercent, type WidthSettings } from '../width.ts'

/** Injected business face: the shared configuration form for this entry. */
export interface WidthRowInjected {
  /** The `ui-patch` profile entry's form the row reads and writes. */
  form: ConfigForm<WidthSettings>
}

/** Full component props: runtime share + locale seat + injected face. */
export type WidthRowProps =
  PropsRuntime<'settings.general.item'> & PropsLocale<typeof NS> & WidthRowInjected

/**
 * Render the width row.
 * @param props - composed slot props.
 * @returns the preference row.
 */
export function WidthRow({ t, form }: WidthRowProps): ReactElement {
  const snapshot = useSyncExternalStore(
    useCallback(listener => form.subscribe(listener), [form]),
    useCallback(() => form.getSnapshot(), [form]),
  )
  const stored = snapshot.value?.[PERCENT_FIELD]
  // Draft is undefined while the field mirrors storage; an edit holds it until
  // a commit (Enter/blur) or an Escape reverts.
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const text = draft ?? (stored === undefined ? '' : String(stored))
  const trimmed = text.trim()
  const parsed = trimmed === '' ? undefined : Number(trimmed)
  const invalid = trimmed !== '' && !isPercent(parsed)
  const disabled = snapshot.status === 'unavailable' || !snapshot.writable

  const commit = (): void => {
    setDraft(undefined)
    if (trimmed === '') {
      if (stored !== undefined) void form.unset(PERCENT_FIELD)
    } else if (isPercent(parsed) && parsed !== stored) {
      void form.set(PERCENT_FIELD, parsed)
    }
  }

  const hint = invalid
    ? t('invalid', { min: PERCENT_MIN, max: PERCENT_MAX })
    : snapshot.status === 'unavailable' ? t('unavailable') : t('desc')

  return (
    <div className="dsh_up_row">
      <div className="dsh_up_rowText">
        <div className="dsh_up_title">{t('title')}</div>
        <div className={`dsh_up_desc${invalid ? ' dsh_up_descBad' : ''}`}>{hint}</div>
      </div>
      <div className="dsh_up_control">
        <input
          type="text"
          inputMode="numeric"
          className={`dsh_up_input${invalid ? ' dsh_up_inputBad' : ''}`}
          value={text}
          placeholder={t('auto')}
          aria-label={t('title')}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          onChange={(event) => { setDraft(event.target.value) }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); commit() }
            else if (event.key === 'Escape') setDraft(undefined)
          }}
        />
        <span className="dsh_up_unit">{t('unit')}</span>
      </div>
    </div>
  )
}
