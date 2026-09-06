export const NS = 'ponytail'

/** Locale key union for the settings card. */
export type PonytailKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: 'Ponytail',
  desc: '懒人高级工程师模式：默认编码强度。',
  defaultMode: '默认强度',
  modeLite: 'Lite · 照做，但点明更省的替代',
  modeFull: 'Full · 阶梯全开（默认）',
  modeUltra: 'Ultra · YAGNI 极简主义',
  modeOff: 'Off · 不注入规则',
  inherit: '继承',
  loading: '正在加载配置…',
  unavailable: '此命名空间当前不可用（宿主端未装载或仅内存模式）。',
  unsaved: '未保存',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  saveError: '本部署没有接受这些值，已保留供你修改。',
}

/** English dictionary. */
export const en: typeof zh = {
  title: 'Ponytail',
  desc: 'Lazy senior dev mode: default coding intensity.',
  defaultMode: 'Default intensity',
  modeLite: 'Lite · build as asked, name the lazier alternative',
  modeFull: 'Full · ladder enforced (default)',
  modeUltra: 'Ultra · YAGNI extremist',
  modeOff: 'Off · inject no ruleset',
  inherit: 'Inherit',
  loading: 'Loading configuration…',
  unavailable: 'This namespace is currently unavailable (host half not mounted, or memory-only mode).',
  unsaved: 'Unsaved',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  saveError: 'The deployment did not accept these values; they were left for you to correct.',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The ponytail settings copy. */
    [NS]: PonytailKey
  }
}
