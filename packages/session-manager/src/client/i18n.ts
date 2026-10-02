/**
 * The client half's locale dictionaries and theme-native style adoption.
 * `bind` reads the active locale at call time, so the registered dictionaries
 * need no reload on a locale change.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'dsh-session-manager'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    [NS]: SessionManagerKey
  }
}

/** Locale key union for the manager page. */
export type SessionManagerKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  nav: '会话管理',
  desc: '管理此 profile 的所有会话：预览对话、切换归档状态、永久删除会话（含其子会话）。删除会一并停掉该会话名下的定时提醒与后台任务。',
  empty: '暂无会话',
  loadFailed: '会话列表加载失败',
  retry: '重试',
  loading: '加载中',
  running: '运行中',
  archived: '已归档',
  preview: '预览',
  close: '关闭',
  roleUser: '用户',
  roleAssistant: '助手',
  archive: '归档',
  unarchive: '取消归档',
  archiveFailed: '归档失败',
  previewEmpty: '没有可预览的消息',
  previewEmptyMeta: '空会话（仅元数据，无对话内容）',
  previewFailed: '预览加载失败',
  confirmTitle: '永久删除会话？',
  confirmDesc: '将删除该会话及其所有子会话的日志文件、投影缓存和工作区记账。此操作不可恢复。',
  confirmDescMulti: '将删除 {count} 个会话及其所有子会话的日志文件、投影缓存和工作区记账。此操作不可恢复。',
  confirmDelete: '删除',
  cancel: '取消',
  deleting: '正在删除…',
  deleteFailed: '删除失败',
  noArchive: '此 profile 不支持归档切换（缺少 workspace 域）',
  ungrouped: '未分组',
  selectAll: '全选',
  deleteSelected: '删除',
  expand: '展开',
  collapse: '折叠',
  // Relative-time bucket words. The bucketing itself is the shared
  // `relativeTime` in ui-primitives, so this page and the sidebar date a
  // session identically; only the words are this plugin's.
  'time.now': '刚刚',
  'time.minutes': '{n}分钟',
  'time.hours': '{n}小时',
  'time.days': '{n}天',
  'time.months': '{n}个月',
  'time.years': '{n}年',
}

/** English dictionary. */
export const en: typeof zh = {
  nav: 'Sessions',
  desc: 'Manage every session of this profile: preview conversations, toggle archive state, and permanently delete sessions (including their children, their scheduled reminders and their jobs).',
  empty: 'No sessions yet',
  loadFailed: 'Failed to load sessions',
  retry: 'Retry',
  loading: 'Loading',
  running: 'Running',
  archived: 'Archived',
  preview: 'Preview',
  close: 'Close',
  roleUser: 'You',
  roleAssistant: 'Assistant',
  archive: 'Archive',
  unarchive: 'Unarchive',
  archiveFailed: 'Archive failed',
  previewEmpty: 'Nothing to preview',
  previewEmptyMeta: 'Empty session (metadata only, no conversation)',
  previewFailed: 'Preview failed',
  confirmTitle: 'Permanently delete this session?',
  confirmDesc: 'This deletes the log files, projection cache and workspace accounting of this session and all its child sessions. This cannot be undone.',
  confirmDescMulti: 'This deletes the log files, projection cache and workspace accounting of {count} sessions and all their child sessions. This cannot be undone.',
  confirmDelete: 'Delete',
  cancel: 'Cancel',
  deleting: 'Deleting…',
  deleteFailed: 'Delete failed',
  noArchive: 'Archive toggling is unavailable on this profile (no workspace domain)',
  ungrouped: 'Ungrouped',
  selectAll: 'Select all',
  deleteSelected: 'Delete',
  expand: 'Expand',
  collapse: 'Collapse',
  'time.now': 'now',
  'time.minutes': '{n}min',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n}mo',
  'time.years': '{n}y',
}

/** The registered dictionary pair, in the locale registry's shape. */
export const dict = { zh, en }

/** Style tag id for HMR bookkeeping. */
export const STYLE_ID = 'dsh-session-manager-style'

/** Theme-native styles, adopted via the client-bundle style contract. */
export const cssText = `
.sm-manager { display: flex; flex-direction: column; gap: 8px; min-width: 0; width: 100%; }
.sm-desc { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.sm-note { margin: 4px 0; font-size: 13px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--dsw-alias-label-secondary); }
.sm-event-types { font-size: 11px; color: var(--dsw-alias-label-tertiary); }

/* Bulk action bar: aligns with the table's first (selection) column. Its height
   is the rows' own, so the gap to the first group head stays one step. */
.sm-bulk-bar { display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 0 0 0 6px; }
.sm-bulk-count { margin: 0 auto 0 10px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }
.sm-bulk-actions { display: inline-flex; align-items: center; gap: 4px; flex: none; min-height: 28px; }
.sm-bulk-actions button[disabled] { opacity: 0.35; }

/* Group container + header: checkbox, project name, count, disclosure. The
   head carries NO vertical padding — flex centering works on the content box,
   so a bottom-only pad lifts every control (and the disclosure's hover fill)
   off the row's true centre. The gap above the table is the table's margin. */
.sm-group { display: flex; flex-direction: column; }
.sm-group + .sm-group { margin-top: 6px; }
.sm-group-head { display: flex; align-items: center; gap: 6px; margin: 0; padding: 0 6px; font-size: 12px; font-weight: 600; line-height: 20px; color: var(--dsw-alias-label-secondary); border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.sm-group-head .sm-check { margin-right: 12px; }
.sm-group-count { font-weight: 400; color: var(--dsw-alias-label-tertiary); }
/* Disclosure at the head's trailing edge, where the head's own actions live:
   the name stays a label, the arrow is the control. */
.sm-group-head .sm-disclose { flex: none; margin-left: auto; }
.sm-group-name { cursor: pointer; }
.sm-group-name:hover { color: var(--dsw-alias-label-primary); }

/* Table: fixed layout lets the title column shrink with ellipsis; hover rounds the row (dsh interactive-row convention). */
.sm-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; margin-top: 4px; font-size: 13px; }
.sm-table td { padding: 4px 6px; vertical-align: middle; overflow: hidden; }
.sm-table tbody tr { border-radius: 8px; transition: background 0.1s; }
.sm-table tbody tr:hover { background: var(--dsw-alias-interactive-bg-hover); }
.sm-table tbody tr + tr td { border-top: 0.5px solid var(--dsw-alias-border-l1); }
.sm-row-selected { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent) !important; }
/* A fully selected group tints its head too, so the head checkbox and the tint
   never disagree about what is selected. */
.sm-group:not(:has(tr:not(.sm-row-selected))) .sm-group-head { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); }

/* Selection column. */
.sm-col-check { width: 20px; }
.sm-check { display: inline-flex; align-items: center; }
.sm-check input { margin: 0; width: 14px; height: 14px; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }

/* Title column: main title + small id line; the fixed layout gives it the remaining width. */
.sm-title-cell { min-width: 0; max-width: 0; }
.sm-title-cell > span { display: block; }
.sm-title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.sm-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.sm-id { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-tertiary); }

/* Badges: pills following the dsh badge convention (corner-shape round / 999px). */
.sm-badge { display: inline-block; padding: 0 6px; margin-left: 2px; border-radius: 999px; corner-shape: round; font-size: 11px; line-height: 16px; font-weight: 500; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); flex: none; }
.sm-badge-running { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); }

/* Activity and action columns. */
.sm-col-activity { white-space: nowrap; width: 28px; font-size: 12px; color: var(--dsw-alias-label-tertiary); text-align: right; }
.sm-col-actions { width: 80px; text-align: right; }
.sm-actions { white-space: nowrap; text-align: right; }
.sm-actions button + button { margin-left: 2px; }

/* Action icon buttons: subdued by default, brighten on hover. */
.sm-actions button { opacity: 0.55; transition: opacity 0.12s; }
.sm-actions button:hover { opacity: 1; }
.sm-actions .sm-delete-btn:hover { color: var(--dsw-alias-state-error-primary); }
/* Delete confirmation follows the dsh delete-dialog convention (outline + error color). */
.sm-delete-confirm:not(:disabled) { color: var(--dsw-alias-state-error-primary); }

/* Preview: inherits the Modal mask/portal/animation and widens the panel. */
.sm-preview-pane { width: min(640px, calc(100vw - 48px)); max-height: min(70vh, 640px); padding: 0; border-radius: 16px; }
.sm-preview-wrap { display: flex; flex-direction: column; min-height: 0; max-height: min(70vh, 640px); }
.sm-preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 14px 18px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.sm-preview-heading { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sm-preview-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.sm-preview-close { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; border-radius: 8px; background: transparent; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.sm-preview-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.sm-preview-id { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-preview-wrap > .sm-note { margin: 14px 18px; flex: none; }
.sm-preview-body { display: flex; flex-direction: column; padding: 10px 18px 14px; overflow-y: auto; min-height: 0; }
/* Preview messages: the two speakers are separated by a shape, not only by a
   label. A message is [spine][content]; only the human's prompt fills the
   spine, and it is vertically centered on that message's content. The divider
   belongs to the message that OPENS a turn, so a question and its answer stay
   one block. */
.sm-msg { display: flex; align-items: center; gap: 10px; }
.sm-msg-spine { flex: none; align-self: stretch; width: 2px; border-radius: 1px; }
.sm-msg-user .sm-msg-spine { background: var(--dsw-alias-brand-primary); }
.sm-msg-content { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.sm-msg-role { font-size: 11px; line-height: 16px; font-weight: 500; letter-spacing: 0.04em; color: var(--dsw-alias-label-tertiary); }
.sm-msg-user .sm-msg-role { color: var(--dsw-alias-brand-primary); }
.sm-msg-text { white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.55; color: var(--dsw-alias-label-primary); }
/* Every message is separated from the one above it, and the gap is the
   divider's own padding — equal on both sides, so the rule sits centered
   between two messages instead of hugging one of them. */
.sm-msg + .sm-msg { border-top: 0.5px solid var(--dsw-alias-border-l1); padding-top: 12px; margin-top: 12px; }
`

/** Adopt the plugin's style tag; disposer removes exactly this fiber's tag. */
export function adoptStyles(pluginId: string): () => void {
  if (typeof document === 'undefined') return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = pluginId
  tag.dataset.pluginCss = `${pluginId}/${STYLE_ID}`
  tag.textContent = cssText
  document.head.appendChild(tag)
  return () => { tag.remove() }
}
