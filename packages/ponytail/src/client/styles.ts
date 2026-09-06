export const STYLE_ID = 'dsh-ponytail-style'

export const cssText = `
.dsh_ponytail_card {
  border: 0.5px solid var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 16px;
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
.dsh_ponytail_pending {
  color: var(--dsw-alias-label-tertiary);
  flex: none;
  font-size: 12px;
  line-height: 1.5;
}
.dsh_ponytail_body {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  margin: 0 16px;
  padding: 4px 0 8px;
}
.dsh_ponytail_muted {
  color: var(--dsw-alias-label-tertiary);
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
}
.dsh_ponytail_row {
  box-sizing: border-box;
  align-items: center;
  gap: 8px;
  padding: 14px 0;
  display: flex;
}
.dsh_ponytail_row + .dsh_ponytail_row {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
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
.dsh_ponytail_footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 4px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh_ponytail_failed {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-error);
}
.dsh_ponytail_discard,
.dsh_ponytail_save {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
.dsh_ponytail_discard {
  border-color: var(--dsw-alias-border-l2);
  background: none;
  color: var(--dsw-alias-label-secondary);
}
.dsh_ponytail_discard:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_ponytail_save {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-layer-3);
}
.dsh_ponytail_discard:disabled,
.dsh_ponytail_save:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh_ponytail_discard:focus-visible,
.dsh_ponytail_save:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
`

export function adoptStyles(pluginId: string): () => void {
  // Official client-bundle style contract: one tagged tag (data-plugin +
  // data-plugin-css) per owning effect, so HMR's style claiming removes
  // exactly this fiber's tag on rebuild.
  if (typeof document === 'undefined') return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = pluginId
  tag.dataset.pluginCss = `${pluginId}/${STYLE_ID}`
  tag.textContent = cssText
  document.head.appendChild(tag)
  return () => { tag.remove() }
}
