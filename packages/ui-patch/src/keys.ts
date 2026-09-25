/**
 * ui-patch — the chords this plugin claims, and what each one replays.
 *
 * The idea the whole keyboard half is built on: menus and dialogs in dsh
 * already navigate and dismiss themselves, and every one of those handlers
 * matches on `event.key` alone — none reads `isTrusted`. Verified in the
 * shared `Menu` primitive, `PopupSelectView`, the Lexical keymap in
 * `ui-conversation`, `ModelSelect`, and the modal layer's `useModalLayer`.
 * So an extra chord never needs a second implementation of anything: it needs
 * the keystroke the handler already knows, replayed into what holds focus.
 *
 * That makes this module DOM-free and table-driven: one row per chord, one
 * matcher, one replay shape. Which key each row replays and which surfaces it
 * is allowed to fire on live in {@link ClaimedChord}.
 *
 * @module dsh-ui-patch/keys
 */

/** The gesture fields this plugin reads; a structural subset of the DOM event. */
export interface KeyGesture {
  readonly code: string
  readonly control: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly meta: boolean
  readonly composing: boolean
  readonly defaultPrevented: boolean
}

/**
 * Whether this is a plain Control chord with nothing else held.
 *
 * Exactness matters in both directions: every chord here declares Control
 * alone, so any extra modifier is a different gesture (on macOS
 * Control-Command-P stays the browser's, and AltGraph reports itself as alt),
 * and a keystroke an IME or an earlier handler already owns belongs to them.
 * @param gesture - physical keystroke as the shortcut service delivered it.
 * @returns whether the gesture is exactly one non-modifier key with Control.
 */
export function isExactControl(gesture: KeyGesture): boolean {
  if (gesture.composing || gesture.defaultPrevented) return false
  return gesture.control && !gesture.alt && !gesture.shift && !gesture.meta
}

/** The keystrokes a claimed chord can replay. */
export type ReplayKey = 'ArrowUp' | 'ArrowDown' | 'Escape'

/**
 * One chord this plugin reserves.
 *
 * - `move` replays an arrow, which every menu already understands.
 * - `dismiss` replays Escape, which is what dsh's `Menu` (document capture) and
 *   its modal layer (document bubble) both listen for, so one replay covers
 *   menus and dialogs alike — and keeps their existing layering: a menu open
 *   inside a dialog closes first, exactly as a real Escape behaves.
 */
export interface ClaimedChord {
  /** Fixed command id, unique within the shortcut catalog. */
  readonly id: string
  /** Physical key pressed together with Control. */
  readonly code: string
  /** Dictionary key naming the row in the shortcut reference. */
  readonly message: 'previous' | 'next' | 'dismiss'
  /** The keystroke this chord replays. */
  readonly replay: ReplayKey
  /** Surfaces this chord may fire on, queried against the document. */
  readonly surfaces: string
}

/**
 * Rows a menu or popup list moves a highlight in: the shared `Menu` primitive,
 * the composer's trigger menu, the command card, the model picker, and the
 * clock picker's columns. All are `[role="menu"]` or `[role="listbox"]`.
 */
export const MENU_SELECTOR = '[role="menu"], [role="listbox"]'

/**
 * Surfaces Escape closes: the menus above plus every `aria-modal` dialog, which
 * is what dsh's own `modalSelector` covers for the dialog case.
 *
 * The permission panel is deliberately absent, and it matters that this is not
 * an oversight: it carries `data-approval-key` on a plain `role="group"`, and
 * its Escape gesture *rejects the request* rather than dismissing anything. A
 * chord that silently answered "no" to a tool permission prompt would be a
 * footgun, so this selector withholds Escape from it by construction.
 */
export const DISMISSIBLE_SELECTOR = `${MENU_SELECTOR}, [role="dialog"][aria-modal="true"]`

/**
 * Every chord, in Emacs order for the movement pair — Control-P previous,
 * Control-N next — because that muscle memory is the whole point, and
 * Control-G to dismiss, matching the accelerator readers coming from Emacs
 * keyboard-quit. Ids are dotted by the surface they act on, like dsh's own
 * `approval.*` rows; they are never persisted (only editable commands can be),
 * so the spelling is free to follow the feature.
 *
 * Control rather than `primary` throughout: on Windows and Linux it is the
 * primary modifier anyway, and on macOS it deliberately is not, because
 * Command belongs to the browser and these are meant as a second route to what
 * the arrow keys and Escape already reach — not as a replacement for any
 * Command chord.
 */
export const CLAIMED_CHORDS: readonly ClaimedChord[] = [
  { id: 'menus.previous', code: 'KeyP', message: 'previous',
    replay: 'ArrowUp', surfaces: MENU_SELECTOR },
  { id: 'menus.next', code: 'KeyN', message: 'next',
    replay: 'ArrowDown', surfaces: MENU_SELECTOR },
  { id: 'menus.dismiss', code: 'KeyG', message: 'dismiss',
    replay: 'Escape', surfaces: DISMISSIBLE_SELECTOR },
]

/**
 * Resolve a keystroke to the chord it fires, or null to leave the key alone.
 *
 * Control-G is free in dsh — nothing binds `KeyG` — and unlike Control-P or
 * Control-N it is not a chord the browser reserves for itself, so the page
 * receives it in every deployment.
 * @param gesture - physical keystroke as the shortcut service delivered it.
 * @returns the claimed chord this gesture fires, or null for an unclaimed key.
 */
export function matchClaimedChord(gesture: KeyGesture): ClaimedChord | null {
  if (!isExactControl(gesture)) return null
  return CLAIMED_CHORDS.find(chord => chord.code === gesture.code) ?? null
}

/** A synthetic keydown, holding no modifier and claiming no native action. */
export interface ReplayKeyInit {
  readonly key: ReplayKey
  readonly code: ReplayKey
  readonly bubbles: true
  readonly cancelable: true
  /** Crosses shadow roots; dsh renders editors and frames inside them. */
  readonly composed: true
  readonly ctrlKey: false
  readonly altKey: false
  readonly shiftKey: false
  readonly metaKey: false
}

/**
 * Describe the keydown that stands in for a claimed chord.
 *
 * `bubbles` is what makes one listener enough: a real key press and this replay
 * travel the same path from the focused element, so whichever layer owns the
 * surface — a document capture listener, a document bubble listener, a React
 * `onKeyDown`, or the Lexical keymap — sees them identically.
 * @param key - the keystroke to replay.
 * @returns initializer with no modifier flags set.
 */
export function replayKeyInit(key: ReplayKey): ReplayKeyInit {
  return { key, code: key, bubbles: true, cancelable: true, composed: true,
    ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }
}
