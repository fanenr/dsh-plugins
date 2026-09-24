/**
 * The browser half's locale dictionaries. The client re-registers them on
 * locale change; every label resolves through the framework's `t` seat.
 *
 * The namespace key is spelled as a literal here (not through `NS`) because
 * `LocaleNamespaceMap` is a declaration-merged table the TypeScript compiler
 * must resolve statically; `shared.ts` owns the same value for runtime use.
 */

/** Locale key union for the width row. */
export type ChatWidthKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The conversation width row's copy. */
    'chat-width': ChatWidthKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: '对话区宽度',
  desc: '对话内容宽度占对话栏的百分比。',
  unit: '%',
  auto: '自适应',
  invalid: '请输入 {min}–{max} 之间的整数',
  unavailable: '此命名空间当前不可用（宿主端未装载或仅内存模式）。',
}

/** English dictionary. */
export const en: typeof zh = {
  title: 'Conversation width',
  desc: 'Content width as a percentage of the conversation column.',
  unit: '%',
  auto: 'Adaptive',
  invalid: 'Enter an integer between {min} and {max}',
  unavailable: 'This namespace is currently unavailable (host half not mounted, or memory-only mode).',
}
