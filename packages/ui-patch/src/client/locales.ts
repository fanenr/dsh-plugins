/**
 * ui-patch — the browser half's locale dictionaries.
 *
 * One dictionary for both features, because the two share a namespace and a
 * `t` seat: the width row reads `title`/`desc`/…, and the shortcut reference
 * reads the two menu-movement labels.
 */

import { NS } from '../shared.ts'

/** Locale key union for every row this plugin contributes. */
export type UiPatchKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The width row's copy and the menu-movement rows. */
    [NS]: UiPatchKey
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
  previous: '上移菜单选择',
  next: '下移菜单选择',
  dismiss: '关闭菜单或顶层弹窗',
}

/** English dictionary. */
export const en: typeof zh = {
  title: 'Conversation width',
  desc: 'Content width as a percentage of the conversation column.',
  unit: '%',
  auto: 'Adaptive',
  invalid: 'Enter an integer between {min} and {max}',
  unavailable: 'This namespace is currently unavailable (host half not mounted, or memory-only mode).',
  previous: 'Move menu selection up',
  next: 'Move menu selection down',
  dismiss: 'Close menu or top dialog',
}
