/**
 * ui-patch — the conversation width rules.
 *
 * Pure: no Schemastery, no DOM. The browser half inlines these when it builds
 * the owned stylesheet, and every rule here is unit-testable from the build
 * output.
 *
 * @module dsh-ui-patch/width
 */

/** Field carrying the transcript content width as a percentage of the column. */
export const PERCENT_FIELD = 'percent'

/** Smallest accepted percentage of the conversation column. */
export const PERCENT_MIN = 30

/** Largest accepted percentage of the conversation column. */
export const PERCENT_MAX = 100

/**
 * Content width floor (px). The percentage is taken against a custom property
 * the conversation root publishes from a ResizeObserver, so it is briefly
 * absent on first paint; without a floor `calc(0px * p)` would collapse the
 * transcript for that frame. dsh's own clamp is protected the same way by its
 * 680px floor.
 */
const CONTENT_FLOOR_PX = 320

/**
 * The conversation root: the element ui-conversation stamps `data-phase` on
 * and publishes `--dsh-conversation-column-width` on. Scoped through the
 * scroll body it contains, because `data-phase` is also used by unrelated
 * chrome (the connection indicator).
 */
const ROOT_SELECTOR = 'div[data-phase]:has([data-conversation-scroll])'

/**
 * Removes the transcript width drag handles. They are hover-revealed overlays
 * with no other purpose, so hiding them drops the affordance without touching
 * layout.
 */
const HANDLE_HIDE_RULE = '[data-width-handle] {\n  display: none !important;\n}'

/**
 * Neutralizes the built-in `localStorage` preference. `initial` makes the
 * custom property guaranteed-invalid, which beats the inline style the
 * component writes, so a stale dragged width cannot outrank this plugin's
 * percentage; the root's own `var(--dsh-chat-user-width, clamp(…))` then falls
 * back to dsh's adaptive width whenever no percentage is set.
 */
const PREFERENCE_OVERRIDE_RULE = `${ROOT_SELECTOR} {\n  --dsh-chat-user-width: initial !important;\n}`

/** The two rules above, in stylesheet order; the percentage rule follows them. */
export const WIDTH_RULES = `${HANDLE_HIDE_RULE}\n${PREFERENCE_OVERRIDE_RULE}`

/** Durable section as the browser reads it: the Host entry's live `Config`. */
export interface WidthSettings {
  /**
   * Transcript content width as a percentage of the conversation column.
   * Absent means "adaptive": dsh's own clamp decides the width.
   */
  percent?: number
}

/**
 * Narrow a value to a settable percentage.
 * @param value - value crossing the input or settings boundary.
 * @returns whether it is an integer within {@link PERCENT_MIN}..{@link PERCENT_MAX}.
 */
export function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= PERCENT_MIN && value <= PERCENT_MAX
}

/**
 * The declaration that replaces the conversation root's content width, keyed
 * by the column width dsh already publishes on that element — so the value
 * tracks live window and sidebar resizes with no observer of our own.
 * @param percent - stored percentage, or undefined for the adaptive default.
 * @returns one CSS rule, or '' when no percentage is set.
 */
export function contentWidthRule(percent: number | undefined): string {
  if (!isPercent(percent)) return ''
  const ratio = percent / 100
  const width = `calc(var(--dsh-conversation-column-width, 0px) * ${ratio})`
  return `${ROOT_SELECTOR} {\n  --dsh-chat-content-width: max(${CONTENT_FLOOR_PX}px, ${width});\n}`
}
