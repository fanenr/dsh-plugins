export const STYLE_ID = 'dsh-sdm-style'

export const cssText = `
.dsh_sdm_card {
  border: 0.5px solid var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 16px;
  list-style: none;
  transition: border-color 0.16s, background 0.16s;
}
.dsh_sdm_card:hover {
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_sdm_cardOpen {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_sdm_header {
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
.dsh_sdm_header:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dsh_sdm_headText {
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
  display: flex;
}
.dsh_sdm_name {
  color: var(--dsw-alias-label-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}
.dsh_sdm_description {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 1.5;
}
.dsh_sdm_chevron {
  color: var(--dsw-alias-label-tertiary);
  flex: none;
  transition: transform 0.16s;
}
.dsh_sdm_chevronOpen {
  transform: rotate(180deg);
}
.dsh_sdm_pending {
  color: var(--dsw-alias-label-tertiary);
  flex: none;
  font-size: 12px;
  line-height: 1.5;
}
.dsh_sdm_body {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  margin: 0 16px;
  padding: 4px 0 8px;
}
.dsh_sdm_muted {
  color: var(--dsw-alias-label-tertiary);
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
}
.dsh_sdm_row {
  box-sizing: border-box;
  align-items: center;
  gap: 8px;
  padding: 14px 0;
  display: flex;
}
.dsh_sdm_row + .dsh_sdm_row {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh_sdm_rowText {
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
  padding-right: 48px;
  display: flex;
}
.dsh_sdm_rowTitle {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.dsh_sdm_selector {
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
  max-width: 320px;
}
.dsh_sdm_selector:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh_sdm_selector:disabled {
  cursor: default;
  opacity: 0.6;
}
.dsh_sdm_selectorText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_sdm_footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 4px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh_sdm_failed {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-error);
}
.dsh_sdm_discard,
.dsh_sdm_save {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
.dsh_sdm_discard {
  border-color: var(--dsw-alias-border-l2);
  background: none;
  color: var(--dsw-alias-label-secondary);
}
.dsh_sdm_discard:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_sdm_save {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-layer-3);
}
.dsh_sdm_discard:disabled,
.dsh_sdm_save:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh_sdm_discard:focus-visible,
.dsh_sdm_save:focus-visible {
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
