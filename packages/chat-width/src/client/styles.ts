/** Owned stylesheet: the width rules plus the Settings row's chrome. */

import { WIDTH_RULES, contentWidthRule } from '../shared.ts'

/** Style tag id, stamped onto the owned tag for HMR bookkeeping. */
export const STYLE_ID = 'dsh-cw-style'

/** Row chrome, in the plugin's own class namespace. */
export const cssText = `
.dsh_cw_row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh_cw_rowText {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-right: 48px;
}
.dsh_cw_title {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.dsh_cw_desc {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh_cw_descBad {
  color: var(--dsw-alias-state-error-primary);
}
.dsh_cw_control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dsh_cw_input {
  box-sizing: border-box;
  width: 92px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: var(--dsw-alias-bg-module-platform);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--dsw-alias-label-primary);
}
.dsh_cw_input::placeholder {
  color: var(--dsw-alias-label-caption);
}
.dsh_cw_input:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh_cw_input:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dsh_cw_input:disabled {
  cursor: default;
  opacity: 0.6;
}
.dsh_cw_inputBad {
  border-color: var(--dsw-alias-state-error-primary);
}
.dsh_cw_unit {
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-secondary);
}
`

/**
 * Compose the owned stylesheet: the width rules followed by the row chrome
 * and, last, the active percentage rule.
 * @param percent - stored percentage, or undefined for the adaptive default.
 * @returns the full text for the owned style tag.
 */
export function styleText(percent: number | undefined): string {
  return `${WIDTH_RULES}\n${cssText}\n${contentWidthRule(percent)}`
}

/**
 * Append the owned style tag to the document.
 * @param pluginId - bundle id recorded on the tag for HMR style claiming.
 * @returns the created tag, or undefined in a documentless run.
 */
export function adoptStyles(pluginId: string): HTMLStyleElement | undefined {
  if (typeof document === 'undefined') return undefined
  const tag = document.createElement('style')
  tag.dataset.plugin = pluginId
  tag.dataset.pluginCss = `${pluginId}/${STYLE_ID}`
  document.head.appendChild(tag)
  return tag
}
