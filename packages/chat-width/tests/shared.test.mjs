import { strict as assert } from 'node:assert'
import test from 'node:test'

// Tests run against the built artifact so they exercise the shipped module.
const { NS, PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN, WIDTH_RULES, contentWidthRule, isPercent } =
  await import('../lib/shared.js')

test('namespace and field are the documented ones', () => {
  assert.equal(NS, 'chat-width')
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
