/**
 * This bundle's configuration card: the forwarded-name allowlist and the
 * never-forward denylist, staged and written by the shared settings form.
 *
 * The chrome — frame, footer, save control, read-only and unavailable lines —
 * comes from the `SettingsForm` primitive, and each control reproduces the
 * shared settings field's structure (label row, control, hint). Only the
 * control itself differs: the shared value field is a single-line input, and a
 * name list is read and typed as lines.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the Plugins page's SlotMap merge for the
// 'plugins.bundle.config' entry this card renders into.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { formLabels, type Field } from '../shared.ts'
import type { ShellCredentialsCardFace, ShellCredentialsCardState } from './card-controller.ts'
import css from './ConfigCard.module.css'
import { NS } from './locales.ts'

/** Page props: the slot's owner share, the injected form face, and the locale seat. */
export type ShellCredentialsCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & InjectFace<ShellCredentialsCardFace>
  & PropsLocale<typeof NS>

/**
 * One name list. Mirrors the shared settings field's parts — label,
 * overridden badge, reset, control, hint — so the two lists sit in the same
 * frame as any builtin card's fields.
 * @param props - the field's copy, its staged draft, and its edit actions.
 * @returns the labelled list control.
 */
function SettingsListField(props: {
  id: string
  label: string
  hint: string
  text: string
  overridden: boolean
  invalid: boolean
  disabled: boolean
  overriddenLabel: string
  resetLabel: string
  invalidLabel: string
  onEdit: (text: string) => void
  onReset: () => void
}) {
  const messageId = `${props.id}-message`
  const hasMessage = props.invalid || props.hint !== ''
  return (
    <div className={css.field}>
      <div className={css.head}>
        <label className={css.label} htmlFor={props.id}>{props.label}</label>
        {props.overridden
          ? (
            <span className={css.badges}>
              <Tag tone="neutral">{props.overriddenLabel}</Tag>
              <button
                type="button"
                className={css.reset}
                disabled={props.disabled}
                onClick={props.onReset}
              >
                {props.resetLabel}
              </button>
            </span>
          )
          : null}
      </div>
      <textarea
        id={props.id}
        className={css.list}
        rows={4}
        spellCheck={false}
        {...props.invalid ? { 'aria-invalid': true } : {}}
        aria-describedby={hasMessage ? messageId : undefined}
        value={props.text}
        disabled={props.disabled}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
      {hasMessage
        ? <p id={messageId} className={props.invalid ? css.invalid : css.hint}>{props.invalid ? props.invalidLabel : props.hint}</p>
        : null}
    </div>
  )
}

/**
 * Render this bundle's configuration page.
 * @param props - the view asked for, the locale seat, the form snapshot, and its actions.
 * @returns the form, or null for the summary view the page also asks for.
 */
export function ShellCredentialsCard(props: ShellCredentialsCardProps) {
  const { t } = props
  if (props.view === 'summary') return null
  const state = props.useCard(snapshot => snapshot)
  const disabled = !state.writable
  const fields: readonly [Field, ShellCredentialsCardState[Field]][] = [
    ['include', state.include],
    ['exclude', state.exclude],
  ]
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      <div className={css.columns}>
        {fields.map(([field, value]) => (
          <SettingsListField
            key={field}
            id={`plugin-config-shell-credentials-${field}`}
            label={t(field)}
            hint={t(`${field}Hint` as 'includeHint' | 'excludeHint')}
            text={value.text}
            overridden={value.overridden}
            invalid={value.invalid}
            disabled={disabled}
            overriddenLabel={t('overridden')}
            resetLabel={t('reset')}
            invalidLabel={t('invalid')}
            onEdit={(text) => { props.edit(field, text) }}
            onReset={() => { props.resetField(field) }}
          />
        ))}
      </div>
    </SettingsForm>
  )
}
