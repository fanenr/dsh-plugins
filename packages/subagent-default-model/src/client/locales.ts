export const NS = 'subagent-default-model'

/** Locale key union for the section. */
export type SubagentModelKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: '子代理模型',
  desc: '设置子代理默认使用的模型。',
  provider: 'Provider',
  model: '模型',
  reasoning: '推理级别',
  reasoningDesc: '子代理请求使用的推理级别',
  inherit: '继承父代理',
  loading: '正在加载模型目录…',
  partialFailure: '部分 Provider 加载失败（{providers}），其模型未列出。',
  empty: '暂无可用模型。请先在「模型」页配置 provider。',
  loadError: '模型目录加载失败：{message}',
  saveError: '保存失败：{message}',
  modelDesc: '使用 {provider} 提供的模型',
}

/** English dictionary. */
export const en: typeof zh = {
  title: 'Subagent model',
  desc: 'Set the default model for subagents.',
  provider: 'Provider',
  model: 'Model',
  reasoning: 'Reasoning effort',
  reasoningDesc: 'Reasoning level used for subagent requests',
  inherit: 'Inherit parent',
  loading: 'Loading model catalog…',
  partialFailure: 'Some providers failed to load ({providers}); their models are not listed.',
  empty: 'No models available. Configure a provider on the Models page first.',
  loadError: 'Failed to load model catalog: {message}',
  saveError: 'Failed to save: {message}',
  modelDesc: 'Models served by {provider}',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The subagent-default-model settings copy. */
    [NS]: SubagentModelKey
  }
}
