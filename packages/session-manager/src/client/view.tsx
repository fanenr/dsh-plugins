/**
 * The manager's Settings page: session table with preview drawer, archive
 * toggle, and permanent delete (risk confirmation). Registered on the
 * `settings.section` slot — one nav row in the settings panel.
 *
 * Data flows through the authenticated Host channel (bridge.ts); after any
 * mutation the page re-lists from the Host, so archive state is live and
 * deletes disappear immediately.
 *
 * @module dsh-session-manager/client-view
 */

import * as React from 'react'
import {
  Button, IconArchiveOutlineRegular, IconBrowseOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconCloseOutlineRegular, IconFolderOpenOutlineRegular, IconTrashOutlineRegular, Modal, relativeTime,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionManagerRow } from '../shared/types'
import { groupRowsByProject } from '../shared/group'
import {
  deleteSession, listSessions, previewSession, setArchived,
} from './bridge'
import type { SessionManagerKey } from './i18n'

/** Locale binding face the section receives. */
export type TFace = (key: SessionManagerKey, params?: Record<string, unknown>) => string

/** The page's own state machine. */
type ListState =
  | { phase: 'loading' }
  | { phase: 'ready'; rows: SessionManagerRow[]; archiveAvailable: boolean }
  | { phase: 'failed'; message: string }

/** One preview drawer state. */
type PreviewState =
  | { phase: 'closed' }
  | { phase: 'loading'; sessionId: string }
  | { phase: 'ready'; sessionId: string; messages: Array<{ role: 'user' | 'assistant'; text: string }>; eventTypes: string[] }
  | { phase: 'failed'; sessionId: string; message: string }

/** One delete flow state. */
type DeleteState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'failed'; failures: Array<{ id: string; message: string }> }

/**
 * The row's trailing age: the shared `relativeTime` bucket (so this page and
 * the sidebar date a session the same way) rendered through this plugin's own
 * dictionary.
 */
function ageLabel(t: TFace, lastActivity: number, now: number): string {
  const { unit, n } = relativeTime(lastActivity, now)
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
}

/**
 * The section component. Pure React: every Host interaction goes through the
 * bridge, every state transition is local.
 */
export function makeSessionManagerView(t: TFace): () => React.ReactElement {
  return function SessionManagerView(): React.ReactElement {
    const [list, setList] = React.useState<ListState>({ phase: 'loading' })
    const [preview, setPreview] = React.useState<PreviewState>({ phase: 'closed' })
    const [del, setDel] = React.useState<DeleteState>({ phase: 'idle' })
    const [confirmIds, setConfirmIds] = React.useState<readonly string[]>([])
    const [selected, setSelected] = React.useState<Set<string>>(new Set())
    // Group keys whose rows are hidden. A group with no key to name it (no cwd)
    // is not collapsible, so it never enters this set.
    const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
    const [now, setNow] = React.useState(Date.now())
    // The registry refuses to archive a session with running work (stopping a
    // turn is destructive and needs a confirmation this page does not offer),
    // so the refusal is shown rather than swallowed.
    const [archiveError, setArchiveError] = React.useState<string | undefined>(undefined)

    const allIds = list.phase === 'ready' ? list.rows.map(row => row.sessionId) : []
    const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id))
    const toggleAll = (): void => {
      setSelected(allSelected ? new Set() : new Set(allIds))
    }
    const toggleOne = (id: string): void => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
    const toggleGroup = (key: string): void => {
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    }

    const reload = React.useCallback(async (silent = false) => {
      if (!silent) setList({ phase: 'loading' })
      const result = await listSessions()
      if (!result.ok) {
        if (!silent) setList({ phase: 'failed', message: result.message })
        return
      }
      setList({ phase: 'ready', rows: result.value.rows, archiveAvailable: result.value.archiveAvailable })
    }, [])

    React.useEffect(() => {
      void reload()
      const timer = setInterval(() => { setNow(Date.now()) }, 60_000)
      return () => { clearInterval(timer) }
    }, [reload])

    const openPreview = React.useCallback(async (row: SessionManagerRow) => {
      setPreview({ phase: 'loading', sessionId: row.sessionId })
      const result = await previewSession(row.sessionId)
      if (!result.ok) {
        setPreview({ phase: 'failed', sessionId: row.sessionId, message: result.message })
        return
      }
      setPreview({ phase: 'ready', sessionId: row.sessionId, messages: result.value.messages, eventTypes: result.value.eventTypes })
    }, [])

    const toggleArchive = React.useCallback(async (row: SessionManagerRow) => {
      const result = await setArchived(row.sessionId, !row.archived)
      setArchiveError(result.ok ? undefined : result.message)
      if (result.ok) void reload(true)
    }, [reload])

    const runDelete = React.useCallback(async (sessionIds: readonly string[]) => {
      setDel({ phase: 'running' })
      const failures: Array<{ id: string; message: string }> = []
      for (const id of sessionIds) {
        const result = await deleteSession(id)
        if (!result.ok) failures.push({ id, message: result.message })
      }
      if (failures.length > 0) {
        setDel({ phase: 'failed', failures })
      } else {
        setDel({ phase: 'idle' })
      }
      setConfirmIds([])
      setSelected(new Set())
      void reload(true)
    }, [reload])

    return (
      <div className="sm-manager">
        <p className="sm-desc">{t('desc')}</p>
        {list.phase === 'ready' && list.rows.length > 0 && (
          <div className="sm-bulk-bar">
            <label className="sm-check">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t('selectAll')} />
            </label>
            <span className="sm-bulk-count">{selected.size} / {list.rows.length}</span>
            <span className="sm-bulk-actions">
              <Button variant="outline" size="sm" className="sm-delete-btn" disabled={selected.size === 0} onClick={() => { setConfirmIds([...selected]) }}>{t('deleteSelected')}</Button>
            </span>
          </div>
        )}
        {list.phase === 'loading' && <p className="sm-note">{t('retry')}…</p>}
        {list.phase === 'failed' && (
          <div className="sm-note">
            <span>{t('loadFailed')}: {list.message}</span>
            <Button variant="outline" onClick={() => { void reload() }}>{t('retry')}</Button>
          </div>
        )}
        {list.phase === 'ready' && (
          list.rows.length === 0
            ? <p className="sm-note">{t('empty')}</p>
            : groupRowsByProject(list.rows).map(group => {
              const groupIds = group.rows.map(row => row.sessionId)
              const groupSelected = groupIds.length > 0 && groupIds.every(id => selected.has(id))
              const groupKey = group.project
              const isCollapsed = groupKey !== null && collapsed.has(groupKey)
              // Mouse toggles from anywhere on the head; the arrow is the
              // focusable control, so the checkbox keeps its own clicks.
              const toggleIfNotControl = (event: React.MouseEvent): void => {
                if (groupKey === null) return
                const target = event.target as HTMLElement
                if (target.closest('button, input, label') !== null) return
                toggleGroup(groupKey)
              }
              return (
                <div key={group.project ?? ''} className="sm-group">
                  <h3 className="sm-group-head" onClick={toggleIfNotControl}>
                    <label className="sm-check">
                      <input
                        type="checkbox"
                        checked={groupSelected}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (groupSelected) groupIds.forEach(id => next.delete(id))
                            else groupIds.forEach(id => next.add(id))
                            return next
                          })
                        }}
                        aria-label={`${t('selectAll')} · ${group.project ?? t('ungrouped')}`}
                      />
                    </label>
                    <span className="sm-group-name">{group.project ?? t('ungrouped')}</span>
                    <span className="sm-group-count">{group.rows.length}</span>
                    {groupKey !== null && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="sm-disclose"
                        icon={isCollapsed ? <IconChevronRightOutlineRegular /> : <IconChevronDownOutlineRegular />}
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? t('expand') : t('collapse')} · ${groupKey}`}
                        title={isCollapsed ? t('expand') : t('collapse')}
                        onClick={() => { toggleGroup(groupKey) }}
                      />
                    )}
                  </h3>
                  {!isCollapsed && (
                    <table className="sm-table">
                      <tbody>
                        {group.rows.map(row => (
                          <tr key={row.sessionId} className={selected.has(row.sessionId) ? 'sm-row-selected' : undefined}>
                            <td className="sm-col-check">
                              <label className="sm-check">
                                <input type="checkbox" checked={selected.has(row.sessionId)} onChange={() => { toggleOne(row.sessionId) }} aria-label={row.title ?? row.sessionId} />
                              </label>
                            </td>
                            <td className="sm-title-cell">
                              <span className="sm-title-row">
                                <span className="sm-title">{row.title ?? row.sessionId}</span>
                                {row.running && <span className="sm-badge sm-badge-running">{t('running')}</span>}
                                {row.archived && <span className="sm-badge">{t('archived')}</span>}
                              </span>
                              <span className="sm-id">{row.sessionId}</span>
                            </td>
                            <td className="sm-col-activity">{ageLabel(t, row.lastActivity, now)}</td>
                            <td className="sm-actions sm-col-actions">
                              <Button variant="ghost" size="sm" icon={<IconBrowseOutlineRegular />} aria-label={t('preview')} title={t('preview')} onClick={() => { void openPreview(row) }} />
                              {list.archiveAvailable && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  icon={row.archived ? <IconFolderOpenOutlineRegular /> : <IconArchiveOutlineRegular size={16} />}
                                  aria-label={row.archived ? t('unarchive') : t('archive')}
                                  title={row.archived ? t('unarchive') : t('archive')}
                                  onClick={() => { void toggleArchive(row) }}
                                />
                              )}
                              <Button variant="ghost" size="sm" className="sm-delete-btn" icon={<IconTrashOutlineRegular />} aria-label={t('confirmDelete')} title={t('confirmDelete')} onClick={() => { setConfirmIds([row.sessionId]) }} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })
        )}
        {list.phase === 'ready' && !list.archiveAvailable && list.rows.length > 0 && (
          <p className="sm-note">{t('noArchive')}</p>
        )}

        {preview.phase === 'loading' && (
          <PreviewPane t={t} loading sessionId={preview.sessionId} title={list.phase === 'ready' ? list.rows.find(row => row.sessionId === preview.sessionId)?.title ?? null : null} onClose={() => { setPreview({ phase: 'closed' }) }} />
        )}
        {preview.phase === 'ready' && (
          <PreviewPane
            t={t}
            sessionId={preview.sessionId}
            title={list.phase === 'ready' ? list.rows.find(row => row.sessionId === preview.sessionId)?.title ?? null : null}
            messages={preview.messages}
            eventTypes={preview.eventTypes}
            onClose={() => { setPreview({ phase: 'closed' }) }}
          />
        )}
        {preview.phase === 'failed' && (
          <PreviewPane t={t} failed={preview.message} sessionId={preview.sessionId} title={list.phase === 'ready' ? list.rows.find(row => row.sessionId === preview.sessionId)?.title ?? null : null} onClose={() => { setPreview({ phase: 'closed' }) }} />
        )}

        {archiveError !== undefined && (
          <div className="sm-note">
            <span>{t('archiveFailed')}: {archiveError}</span>
            <Button variant="outline" onClick={() => { setArchiveError(undefined) }}>{t('close')}</Button>
          </div>
        )}

        {del.phase === 'failed' && (
          <div className="sm-note">
            <span>{t('deleteFailed')}: {del.failures.map(f => f.message).join(' · ')}</span>
            <Button variant="outline" onClick={() => { setDel({ phase: 'idle' }) }}>{t('close')}</Button>
          </div>
        )}
        {confirmIds.length > 0 && (
          <Modal
            open
            onClose={() => { if (del.phase !== 'running') setConfirmIds([]) }}
            title={t('confirmTitle')}
            description={confirmIds.length > 1 ? t('confirmDescMulti', { count: String(confirmIds.length) }) : t('confirmDesc')}
            closeLabel={t('close')}
            footer={(
              <>
                <Button variant="outline" data-modal-autofocus disabled={del.phase === 'running'} onClick={() => { setConfirmIds([]) }}>{t('cancel')}</Button>
                <Button
                  variant="outline"
                  className="sm-delete-confirm"
                  disabled={del.phase === 'running'}
                  onClick={() => {
                    const ids = confirmIds
                    void runDelete(ids)
                  }}
                >
                  {del.phase === 'running' ? t('deleting') : t('confirmDelete')}
                </Button>
              </>
            )}
          />
        )}
      </div>
    )
  }
}

interface PreviewPaneProps {
  t: TFace
  sessionId: string
  title: string | null
  loading?: boolean
  failed?: string
  messages?: Array<{ role: 'user' | 'assistant'; text: string }>
  eventTypes?: string[]
  onClose: () => void
}

function PreviewPane(props: PreviewPaneProps): React.ReactElement {
  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.title ?? props.sessionId}
      headless
      className="sm-preview-pane"
    >
      <div className="sm-preview-wrap">
        <div className="sm-preview-head">
        <div className="sm-preview-heading">
          <span className="sm-preview-title">{props.title ?? props.sessionId}</span>
          <span className="sm-preview-id">{props.sessionId}</span>
        </div>
        <button type="button" className="sm-preview-close" aria-label={props.t('close')} onClick={props.onClose}>
          <IconCloseOutlineRegular size={14} />
        </button>
      </div>
      {props.loading === true && <p className="sm-note">{props.t('loading')}…</p>}
      {props.failed !== undefined && <p className="sm-note">{props.t('previewFailed')}: {props.failed}</p>}
      {props.messages !== undefined && (
        props.messages.length === 0
          ? (
            <div className="sm-note">
              <span>{props.eventTypes !== undefined && props.eventTypes.length > 0
                ? props.t('previewEmptyMeta')
                : props.t('previewEmpty')}</span>
              {props.eventTypes !== undefined && props.eventTypes.length > 0 && (
                <span className="sm-event-types">{props.eventTypes.join(' · ')}</span>
              )}
            </div>
          )
          : (
            <div className="sm-preview-body">
              {props.messages.map((message, index) => (
                <div key={index} className={'sm-msg sm-msg-' + message.role}>
                  <span className="sm-msg-spine" aria-hidden="true" />
                  <div className="sm-msg-content">
                    <span className="sm-msg-role">{message.role === 'user' ? props.t('roleUser') : props.t('roleAssistant')}</span>
                    <span className="sm-msg-text">{message.text}</span>
                  </div>
                </div>
              ))}
            </div>
          )
      )}
      </div>
    </Modal>
  )
}
