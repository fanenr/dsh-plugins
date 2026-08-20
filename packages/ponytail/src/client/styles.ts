export const STYLE_ID = 'dsh-ponytail-style'

export const cssText = `
.dsh_ponytail_card {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 12px;
  list-style: none;
  transition: border-color 0.16s, background 0.16s;
}
.dsh_ponytail_card:hover {
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_ponytail_cardOpen {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_ponytail_header {
  appearance: none;
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: 0 0;
  border: 0;
  border-radius: 12px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  display: flex;
}
.dsh_ponytail_header:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dsh_ponytail_headText {
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
  display: flex;
}
.dsh_ponytail_name {
  color: var(--dsw-alias-label-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}
.dsh_ponytail_description {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 1.5;
}
.dsh_ponytail_chevron {
  color: var(--dsw-alias-label-tertiary);
  flex: none;
  transition: transform 0.16s;
}
.dsh_ponytail_chevronOpen {
  transform: rotate(180deg);
}
.dsh_ponytail_body {
  border-top: 1px solid var(--dsw-alias-border-l2);
  margin: 0 16px;
  padding: 4px 0 8px;
}
.dsh_ponytail_muted {
  color: var(--dsw-alias-label-tertiary);
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
}
.dsh_ponytail_error {
  color: var(--dsw-alias-state-error-primary);
  margin: 12px 0 0;
  font-size: 12px;
}
.dsh_ponytail_row {
  box-sizing: border-box;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  align-items: center;
  gap: 8px;
  padding: 14px 0;
  display: flex;
}
.dsh_ponytail_row:last-child {
  border-bottom: none;
}
.dsh_ponytail_rowText {
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
  padding-right: 48px;
  display: flex;
}
.dsh_ponytail_rowTitle {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.dsh_ponytail_rowDesc {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
}
.dsh_ponytail_selector {
  background: var(--dsw-alias-bg-module-platform);
  height: 36px;
  font: inherit;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  border: none;
  border-radius: 18px;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  font-size: 14px;
  line-height: 22px;
  display: inline-flex;
}
.dsh_ponytail_selector:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh_ponytail_selector:disabled {
  cursor: default;
}
`

export function adoptStyles(): () => void {
  const selector = `style#${CSS.escape(STYLE_ID)}`
  if (document.querySelector(selector) === null) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = cssText
    document.head.appendChild(style)
  }
  return () => {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      element.remove()
    }
  }
}
