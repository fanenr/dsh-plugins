export const NS = 'subagent-default-model'

/** Locale key union for the settings card. */
export type SubagentDefaultModelKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: 'Subagent 默认模型',
  desc: 'Subagent 委托使用的模型：选中即最高优先，内置跟随 dsh。',
  builtin: '内置',
  model: '模型',
  effort: '推理强度',
  effortEmpty: '模型默认',
  loading: '正在加载配置…',
  loadingCatalog: '正在加载模型目录…',
  catalogError: '模型目录加载失败：{message}',
  partialFailure: '部分 Provider 加载失败（{providers}），其模型未列出。',
  unavailable: '此命名空间当前不可用（宿主端未装载或仅内存模式）。',
  unsaved: '未保存',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  saveError: '本部署没有接受这些值，已保留供你修改。',
}

/** English dictionary. */
export const en: typeof zh = {
  title: 'Subagent default model',
  desc: 'Model for subagent delegations: explicit wins, built-in defers to dsh.',
  builtin: 'Built-in',
  model: 'Model',
  effort: 'Reasoning effort',
  effortEmpty: 'Model default',
  loading: 'Loading configuration…',
  loadingCatalog: 'Loading model catalog…',
  catalogError: 'Failed to load model catalog: {message}',
  partialFailure: 'Some providers failed to load ({providers}); their models are not listed.',
  unavailable: 'This namespace is currently unavailable (host half not mounted, or memory-only mode).',
  unsaved: 'Unsaved',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  saveError: 'The deployment did not accept these values; they were left for you to correct.',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The subagent-default-model settings copy. */
    [NS]: SubagentDefaultModelKey
  }
}
