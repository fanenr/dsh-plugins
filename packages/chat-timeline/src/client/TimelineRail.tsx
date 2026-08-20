import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { conversationContextKey, type ISessions, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input.dock entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TimelineEntry } from '../types.ts'
import { NS } from './locales.ts'
import { styles } from './styles.ts'

/** The input-message node kind the conversation view routes user rows under. */
const INPUT_MESSAGE_KIND = 'input-message'

/** Abort after this many frames while waiting for a paged-back row to render. */
const ROW_WAIT_FRAMES = 600

/** Abort after this many frames while guarding the written scroll position. */
const SCROLL_GUARD_FRAMES = 72

/** Injected business face: the sessions service (binding lookup for the live session face). */
export interface TimelineRailInjected {
  sessionsService: ISessions
}

/** Full props: session standard kit + injected face + the locale seat. */
export type TimelineRailProps = import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & TimelineRailInjected
  & PropsLocale<typeof NS>

/** Reconstruct the chat node key from the durable message id via the engine's own key scheme. */
function anchorKeyOf(message: TimelineEntry): string | undefined {
  if (message.id !== undefined && message.id !== '') return conversationContextKey(INPUT_MESSAGE_KIND, message.id)
  return undefined
}

/** Scroll only the timeline page itself, by the minimum distance needed to reveal the item. */
function scrollPageToReveal(page: HTMLElement, item: HTMLElement): void {
  const pageRect = page.getBoundingClientRect()
  const itemRect = item.getBoundingClientRect()
  if (itemRect.top < pageRect.top) {
    page.scrollTop -= pageRect.top - itemRect.top
  } else if (itemRect.bottom > pageRect.bottom) {
    page.scrollTop += itemRect.bottom - pageRect.bottom
  }
}

/** Find the anchor row whose `data-chat-anchor-key` equals `key`, or null. */
function rowFor(scrollport: HTMLElement, key: string): HTMLElement | null {
  for (const row of scrollport.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
    if (row.getAttribute('data-chat-anchor-key') === key) return row
  }
  return null
}

/** Cancel-aware setTimeout: rejects once `signal` aborts instead of sleeping on. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) { reject(new DOMException('aborted', 'AbortError')); return }
    const onAbort = (): void => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')) }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Cancel-aware rAF wait: rejects once `signal` aborts instead of looping on. */
function frame(signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) { reject(new DOMException('aborted', 'AbortError')); return }
    const onAbort = (): void => { cancelAnimationFrame(id); reject(new DOMException('aborted', 'AbortError')) }
    const id = requestAnimationFrame(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Ensure the message node is in the loaded window, then scroll to its row. */
async function jumpToMessage(
  sessionsService: ISessions,
  sessionId: SessionId,
  key: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const session = sessionsService.binding(sessionId)?.session
  if (session === undefined) return false
  // The projection carries the full history, but the chat window only holds
  // the newest pages — clicking a message far above the window must first page
  // back until the window covers the target node. getSnapshot() rebuilds the
  // cache when dirty, so hasMore / loadingOlder are always live.
  let guard = 0
  while (guard++ < 120) {
    if (signal?.aborted === true) return false
    const snapshot = session.getSnapshot()
    if (snapshot?.chat?.nodes?.get(key) !== undefined) break
    if (snapshot?.hasMore !== true) return false
    if (snapshot?.loadingOlder === true) { await delay(50, signal); continue }
    await session.loadOlder()
  }
  // loadOlder returns once the window data is in place, but the render chain
  // is async: notifier frame batching -> ChatView re-render -> the target row
  // enters the DOM. Wait for the render to land.
  let row: HTMLElement | null = null
  const scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
  if (scrollport !== null) {
    for (let frames = 0; row === null && frames < ROW_WAIT_FRAMES; frames++) {
      await frame(signal)
      row = rowFor(scrollport, key)
    }
  }
  if (row === null) return false
  // The reader's pinned-at-bottom follow effect can snap scrollTop back to the
  // floor after a prepend, so write scrollTop straight to the target row (no
  // smooth animation) and watch a few frames, rewriting any external move
  // until the position stays stable. The target row can reflow briefly after
  // prepend, so the watch rewrites any drift back to the target for ~1.2s;
  // dsh's bottom-follow can still re-snap the scrollport after the watch ends.
  const scroller = scrollport
  if (scroller === null) return false
  const targetTop = (): number => Math.max(0, row!.offsetTop - (scroller.clientHeight - row!.offsetHeight) / 2)
  scroller.scrollTop = targetTop()
  let stable = 0
  let last = scroller.scrollTop
  for (let i = 0; i < SCROLL_GUARD_FRAMES && stable < 8; i++) {
    await frame(signal)
    const want = targetTop()
    if (Math.abs(scroller.scrollTop - want) > 4) {
      scroller.scrollTop = want
      stable = 0
      last = scroller.scrollTop
      continue
    }
    if (Math.abs(scroller.scrollTop - last) > 2) { stable = 0; last = scroller.scrollTop; continue }
    stable++
  }
  return true
}

export function TimelineRail({ useProjection, sessionId, sessionsService, t }: TimelineRailProps): ReactElement | null {
  const projected = useProjection('dshChatTimeline')
  const messages = projected?.messages ?? []

  const [activeIndex, setActiveIndex] = useState(-1)
  const [show, setShow] = useState(false)
  const [rightOffset, setRightOffset] = useState(12)
  const [jumpFailed, setJumpFailed] = useState(false)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const activeItemRef = useRef<HTMLButtonElement | null>(null)
  // One controller per rail mount: every in-flight jump aborts when the rail
  // unmounts (session switch, plugin unload) or when a new jump supersedes it.
  const jumpAbortRef = useRef<AbortController | null>(null)
  const jumpFailureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    jumpAbortRef.current?.abort()
    jumpAbortRef.current = null
    if (jumpFailureTimerRef.current !== null) clearTimeout(jumpFailureTimerRef.current)
  }, [])

  const flagJumpFailure = (): void => {
    setJumpFailed(true)
    if (jumpFailureTimerRef.current !== null) clearTimeout(jumpFailureTimerRef.current)
    jumpFailureTimerRef.current = setTimeout(() => { setJumpFailed(false) }, 2000)
  }

  const [chatActive, setChatActive] = useState(true)
  // On expand, scroll the active item into view — the list is a scroll
  // container that only appears on expand, so its scrollTop starts at 0
  // (first item) regardless of the reader's position.
  useEffect(() => {
    if (!show) return
    const page = pageRef.current
    if (page === null) return
    const items = page.querySelectorAll<HTMLElement>(`.${styles.item}`)
    const index = activeIndex >= 0 ? activeIndex : messages.length - 1
    const target = items[index]
    if (target !== undefined) scrollPageToReveal(page, target)
  }, [show])

  // Only show on the chat view. The chat flow is the one column carrying
  // `[data-chat-flow]` (ChatView.tsx) and `conversation.view` mounts exactly
  // one view at a time, so a present flow column is the structural proof the
  // chat view is active — no dependence on localized tab labels. A
  // MutationObserver catches tab switches (React removes the column
  // synchronously) instead of polling.
  useEffect(() => {
    const read = (): void => {
      const active = document.querySelector<HTMLElement>('[data-chat-flow]') !== null
      setChatActive(active)
    }
    read()
    const mo = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { read() })
      : null
    mo?.observe(document.body, { childList: true, subtree: true })
    return () => { mo?.disconnect() }
  }, [sessionId])

  // Track the reading position (the active item). The rail's own jump writes
  // scrollTop directly and guards the position for a few frames, so a finished
  // click re-runs the spy one frame later through the ref.
  const updateActiveRef = useRef<() => void>(() => {})
  useEffect(() => {
    if (messages.length === 0) return
    const messageIndexByKey = new Map<string, number>()
    for (let i = 0; i < messages.length; i++) {
      const key = anchorKeyOf(messages[i]!)
      if (key !== undefined) messageIndexByKey.set(key, i)
    }
    const updateActive = (): void => {
      const sp = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      if (sp === null) return
      const rect = sp.getBoundingClientRect()
      if (rect.height === 0) return
      const line = rect.top + rect.height * 0.4
      // Scan every anchor row and keep only the ones in our message key set —
      // matching by membership (not a `^=` prefix) so the key scheme stays an
      // engine detail owned by conversationContextKey.
      const rows = sp.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')
      let best = -1
      let bestDist = Number.POSITIVE_INFINITY
      for (const row of rows) {
        const key = row.getAttribute('data-chat-anchor-key')
        if (key === null) continue
        const idx = messageIndexByKey.get(key) ?? -1
        if (idx === -1) continue
        const r = row.getBoundingClientRect()
        const dist = Math.abs(r.top + r.height / 2 - line)
        if (dist < bestDist) { bestDist = dist; best = idx }
      }
      setActiveIndex(best)
    }
    updateActiveRef.current = updateActive
    updateActive()
    const el = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    let scrollTimer: ReturnType<typeof setTimeout> | null = null
    const onScroll = (): void => {
      if (scrollTimer !== null) return
      scrollTimer = setTimeout(() => { scrollTimer = null; updateActive() }, 60)
    }
    el?.addEventListener('scroll', onScroll, { passive: true })
    const timer = setInterval(updateActive, 2000)
    return () => {
      if (scrollTimer !== null) clearTimeout(scrollTimer)
      el?.removeEventListener('scroll', onScroll)
      clearInterval(timer)
    }
  }, [sessionId, messages.length])

  // Keep the active item visible inside the timeline without moving the
  // conversation or document scrollports.
  useLayoutEffect(() => {
    const page = pageRef.current
    const item = activeItemRef.current
    if (page !== null && item !== null) scrollPageToReveal(page, item)
  }, [activeIndex, messages.length])

  // Dynamically avoid right-side workbenches: compute the rail's right offset
  // from the conversation scrollport's right edge.
  useEffect(() => {
    let raf = 0
    const measure = (): void => {
      raf = 0
      const sp = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      if (sp === null) return
      const rect = sp.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const next = Math.max(8, Math.round(window.innerWidth - rect.right + 12))
      setRightOffset(prev => Math.abs(prev - next) > 0.5 ? next : prev)
    }
    const schedule = (): void => {
      if (raf !== 0) return
      raf = window.requestAnimationFrame(measure)
    }
    const sp = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    const ro = typeof ResizeObserver === 'function' && sp !== null ? new ResizeObserver(schedule) : null
    if (ro !== null && sp !== null) ro.observe(sp)
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null
    if (mo !== null && sp !== null) mo.observe(sp, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', schedule)
    const timer = window.setInterval(schedule, 2000)
    measure()
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', schedule)
      window.clearInterval(timer)
    }
  }, [sessionId])

  if (sessionId === undefined || messages.length < 2 || !chatActive) return null

  return createPortal(
    <div
      className={styles.nav}
      style={{ right: `${rightOffset}px` }}
      role="navigation"
      aria-label={t('railLabel')}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div className={`${styles.bg}${show ? ` ${styles.bgHide}` : ''}`} />
      <div
        className={`${styles.wrap}${messages.length > 8 ? ` ${styles.wrapMax}` : ''}${show ? ` ${styles.wrapShow}` : ''}`}
      >
        <div className={styles.page} ref={pageRef}>
          {jumpFailed && (
            <div className={styles.jumpError} role="status" aria-live="polite">
              {t('jumpFailed')}
            </div>
          )}
          {messages.map((message, index) => {
            const key = anchorKeyOf(message)
            const active = activeIndex === index
            return (
              <button
                key={message.seq}
                type="button"
                ref={active ? activeItemRef : undefined}
                className={`${styles.item}${active ? ` ${styles.itemActive}` : ''}`}
                title={message.text === '' ? t('noText') : message.text.slice(0, 200)}
                aria-label={`${t('roleUser')}: ${message.text.slice(0, 60) || t('noText')}`}
                aria-current={active ? 'location' : undefined}
                onClick={() => {
                  if (key === undefined) return
                  jumpAbortRef.current?.abort()
                  const controller = new AbortController()
                  jumpAbortRef.current = controller
                  void jumpToMessage(sessionsService, sessionId, key, controller.signal).then((ok) => {
                    if (ok) {
                      // Re-run the spy a frame after the jump settles — the guarded
                      // scroll writes can starve the listener.
                      requestAnimationFrame(() => { updateActiveRef.current() })
                    } else {
                      flagJumpFailure()
                    }
                  }).catch(() => {
                    // An abort (rail unmount or a newer click) is expected; anything
                    // else is still a failed jump the user should see.
                    if (!controller.signal.aborted) flagJumpFailure()
                  })
                }}
              >
                <span className={`${styles.title}${show ? ` ${styles.titleShow}` : ''}`}>
                  {message.text === '' ? t('noText') : message.text}
                </span>
                <span className={styles.ind} aria-hidden>
                  <span className={styles.line} />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
