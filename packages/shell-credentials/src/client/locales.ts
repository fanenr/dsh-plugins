/**
 * Locale dictionaries for the browser half.
 *
 * The dictionaries carry two faces: `meta` is read by the Host's package-meta
 * reader (the Plugins page title and one-liner), while the flat keys below are
 * the card's own copy — field labels and hints, plus the shared settings form's
 * frame (save, reset, and the read-only and unavailable lines).
 *
 * Style injection is not here: the card's stylesheet is a CSS Module, so it
 * ships hashed and self-injecting from the bundle like a builtin plugin's.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'dsh-shell-credentials'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    [NS]: ShellCredentialsKey
  }
}

/** Locale key union for the card, derived from the key-set source of truth. */
type ShellCredentialsKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  include: '只转发这些变量',
  includeHint: '每行一个变量名。留空则按 dsh 的凭据特征自动选择;填写后作为白名单。',
  exclude: '永不转发',
  excludeHint: '每行一个变量名。优先级高于白名单,用于拦住 harness 自己的密钥。',
  overridden: '已覆盖',
  reset: '重置',
  invalid: '内容无法解析为变量名。',
  save: '保存',
  saving: '保存中',
  saveFailed: '保存被拒绝,当前存储值保持不变。',
  readOnly: '此客户端无法写入配置。',
  unavailable: '未提供此配置项。',
}

/** English dictionary, complete against the Chinese key set. */
export const en: Record<ShellCredentialsKey, string> = {
  include: 'Forward only these names',
  includeHint: 'One variable name per line. Empty selects by dsh’s credential shape; a filled list is an allowlist.',
  exclude: 'Never forward',
  excludeHint: 'One variable name per line. Wins over the allowlist; use it to hold back the harness’s own keys.',
  overridden: 'Overridden',
  reset: 'Reset',
  invalid: 'Not a readable list of variable names.',
  save: 'Save',
  saving: 'Saving',
  saveFailed: 'The write was refused; the stored value stands.',
  readOnly: 'This client cannot write configuration.',
  unavailable: 'This configuration entry is not served.',
}
