export const NS = 'chat-timeline'

/** Locale key union for the rail. */
export type ChatTimelineKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  railLabel: '对话时间线',
  roleUser: '用户',
  noText: '（无文本内容）',
  jumpFailed: '未找到该消息',
}

/** English dictionary. */
export const en: typeof zh = {
  railLabel: 'Chat timeline',
  roleUser: 'User',
  noText: '(no text)',
  jumpFailed: 'Message not found',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The chat-timeline rail copy. */
    [NS]: ChatTimelineKey
  }
}
