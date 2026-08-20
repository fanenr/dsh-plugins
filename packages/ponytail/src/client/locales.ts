export const NS = 'ponytail'

/** Locale key union for the settings card. */
export type PonytailKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: 'Ponytail',
  desc: '懒人高级工程师模式：默认编码强度。',
  defaultMode: '默认强度',
  defaultModeDesc: '新会话起始的编码强度（重启后生效）。',
  modeLite: 'Lite · 照做，但点明更省的替代',
  modeFull: 'Full · 阶梯全开（默认）',
  modeUltra: 'Ultra · YAGNI 极简主义',
  modeOff: 'Off · 不注入规则',
  inherit: '继承',
  loading: '正在加载配置…',
  loadError: '配置加载失败：{message}',
  saveError: '保存失败：{message}',
}

/** English dictionary. */
export const en: typeof zh = {
  title: 'Ponytail',
  desc: 'Lazy senior dev mode: default coding intensity.',
  defaultMode: 'Default intensity',
  defaultModeDesc: 'Intensity new sessions start in (applies on restart).',
  modeLite: 'Lite · build as asked, name the lazier alternative',
  modeFull: 'Full · ladder enforced (default)',
  modeUltra: 'Ultra · YAGNI extremist',
  modeOff: 'Off · inject no ruleset',
  inherit: 'Inherit',
  loading: 'Loading configuration…',
  loadError: 'Failed to load configuration: {message}',
  saveError: 'Failed to save: {message}',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The ponytail settings copy. */
    [NS]: PonytailKey
  }
}
