import { strict as assert } from 'node:assert'
import test from 'node:test'

// Tests run against the built artifact so they exercise the shipped module.
const { NS } = await import('../lib/shared.js')
const { PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN, WIDTH_RULES, contentWidthRule, isPercent } =
  await import('../lib/width.js')
const { CLAIMED_CHORDS, DISMISSIBLE_SELECTOR, MENU_SELECTOR, matchClaimedChord, replayKeyInit } =
  await import('../lib/keys.js')

/** A gesture with every flag at its resting value. */
function gesture(overrides = {}) {
  return { code: 'KeyP', control: true, alt: false, shift: false, meta: false,
    composing: false, defaultPrevented: false, ...overrides }
}

test('the namespace is the documented one', () => {
  assert.equal(NS, 'ui-patch')
})

// ── conversation width ─────────────────────────────────────────────────────

test('the width field is the documented one', () => {
  assert.equal(PERCENT_FIELD, 'percent')
})

test('isPercent accepts only in-range integers', () => {
  assert.equal(isPercent(PERCENT_MIN), true)
  assert.equal(isPercent(PERCENT_MAX), true)
  assert.equal(isPercent(72), true)
  assert.equal(isPercent(PERCENT_MIN - 1), false)
  assert.equal(isPercent(PERCENT_MAX + 1), false)
  assert.equal(isPercent(72.5), false)
  assert.equal(isPercent('72'), false)
  assert.equal(isPercent(undefined), false)
  assert.equal(isPercent(Number.NaN), false)
})

test('no percentage leaves the width axis to dsh', () => {
  assert.equal(contentWidthRule(undefined), '')
  assert.equal(contentWidthRule(0), '')
  assert.equal(contentWidthRule(200), '')
})

test('a percentage derives the content width from the published column width', () => {
  const rule = contentWidthRule(72)
  assert.match(rule, /--dsh-chat-content-width:/)
  assert.match(rule, /--dsh-conversation-column-width/)
  assert.match(rule, /0\.72/)
})

test('the derived width keeps a floor so a not-yet-published column cannot collapse it', () => {
  // The column width arrives from a ResizeObserver, so it is absent on the
  // first frame: without the floor calc(0px * 0.72) would be the width.
  assert.match(contentWidthRule(72), /max\(320px,/)
})

test('the width rules hide the handles and void the dragged preference', () => {
  assert.match(WIDTH_RULES, /\[data-width-handle\]\s*\{\s*display: none !important;/)
  assert.match(WIDTH_RULES, /--dsh-chat-user-width: initial !important;/)
})

// ── claimed chords ────────────────────────────────────────────────────────

test('the three chords are the documented ones', () => {
  assert.deepEqual(CLAIMED_CHORDS.map(({ id, code, replay }) => ({ id, code, replay })), [
    { id: 'menus.previous', code: 'KeyP', replay: 'ArrowUp' },
    { id: 'menus.next', code: 'KeyN', replay: 'ArrowDown' },
    { id: 'menus.dismiss', code: 'KeyG', replay: 'Escape' },
  ])
})

test('movement chords fire on menus only, dismissal also on dialogs', () => {
  const [previous, next, dismiss] = CLAIMED_CHORDS
  assert.equal(previous.surfaces, MENU_SELECTOR)
  assert.equal(next.surfaces, MENU_SELECTOR)
  assert.equal(dismiss.surfaces, DISMISSIBLE_SELECTOR)
  // A dismissal must cover menus as well as dialogs: the shared Menu primitive
  // is what closes a dropdown, and it is not an aria-modal dialog.
  assert.match(DISMISSIBLE_SELECTOR, /role="menu"/)
  assert.match(DISMISSIBLE_SELECTOR, /role="listbox"/)
  assert.match(DISMISSIBLE_SELECTOR, /role="dialog"\]\[aria-modal="true"/)
})

test('the dismissible selector never adopts the permission panel', () => {
  // Escape in the approval panel REJECTS a tool request. It carries
  // data-approval-key on a plain role="group", so no dismissible selector may
  // match it. The client re-checks this at dispatch time as well.
  assert.doesNotMatch(DISMISSIBLE_SELECTOR, /group/)
  assert.doesNotMatch(DISMISSIBLE_SELECTOR, /data-approval/)
})

test('exactly the three Control chords fire, and nothing else', () => {
  assert.equal(matchClaimedChord(gesture({ code: 'KeyP' })).replay, 'ArrowUp')
  assert.equal(matchClaimedChord(gesture({ code: 'KeyN' })).replay, 'ArrowDown')
  assert.equal(matchClaimedChord(gesture({ code: 'KeyG' })).replay, 'Escape')
  // Nearest neighbours stay the page's: Shift+Control-G is not a dismissal, and
  // a bare G is a character someone is typing.
  assert.equal(matchClaimedChord(gesture({ code: 'KeyG', shift: true })), null)
  assert.equal(matchClaimedChord(gesture({ code: 'KeyG', control: false })), null)
  assert.equal(matchClaimedChord(gesture({ code: 'KeyO' })), null)
})

test('a modified or foreign gesture is left to the page', () => {
  // Command-Control-G on macOS is the browser's; AltGraph and Option-Alt report
  // themselves through alt, so an exact match is the only safe match.
  assert.equal(matchClaimedChord(gesture({ code: 'KeyG', meta: true })), null)
  assert.equal(matchClaimedChord(gesture({ code: 'KeyG', alt: true })), null)
})

test('composition and consumed keystrokes are never taken', () => {
  // An IME in progress owns the keyboard, and a handler that already ran has
  // the stronger claim.
  assert.equal(matchClaimedChord(gesture({ composing: true })), null)
  assert.equal(matchClaimedChord(gesture({ defaultPrevented: true })), null)
})

test('the replayed key carries no modifier and claims no native action', () => {
  const up = replayKeyInit('ArrowUp')
  assert.deepEqual(up, { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true, composed: true,
    ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })
  // cancelable is what lets a surface call preventDefault on the replay exactly
  // as it would on a real key press — which is also what keeps it away from the
  // window-level Escape stop sequence.
  assert.equal(up.cancelable, true)
  assert.equal(replayKeyInit('Escape').key, 'Escape')
  assert.equal(replayKeyInit('ArrowDown').key, 'ArrowDown')
})

test('each chord id is unique, so the catalog cannot collide with itself', () => {
  const ids = CLAIMED_CHORDS.map(chord => chord.id)
  assert.equal(new Set(ids).size, ids.length)
  const codes = CLAIMED_CHORDS.map(chord => chord.code)
  assert.equal(new Set(codes).size, codes.length)
})
