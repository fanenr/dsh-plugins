import { strict as assert } from 'node:assert'
import test from 'node:test'

// The host bundle is ESM and built; the test runs against the built artifact
// so it exercises the shipped module, not the source.
const { timelineProjectionDefinition } = await import('../lib/index.js')
const { wire } = timelineProjectionDefinition

const userMessage = (seq, time, text, id) => ({
  type: 'user/message',
  seq,
  time,
  // Append-origin surface marker: every surface-eligible event carries one in
  // the real log; the projection matches the chat view's append-origin rule.
  surfaceOp: 'append',
  data: {
    id,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  },
})

test('folds only directly user-sent messages, in seq order', () => {
  const events = [
    userMessage(1, 1000, 'hello', 'm1'),
    { type: 'assistant/message', seq: 2, time: 1001, surfaceOp: 'append', data: {} },
    {
      type: 'user/message',
      seq: 3,
      time: 1002,
      surfaceOp: 'append',
      data: {
        id: 'm2',
        role: 'user',
        content: [{ type: 'text', text: 'tool context' }],
        source: { kind: 'tool', callId: 'c1' },
      },
    },
    userMessage(4, 1003, 'world', 'm3'),
  ]
  let state = timelineProjectionDefinition.init()
  for (const event of events) state = timelineProjectionDefinition.apply(state, event)
  const view = wire.view(state)
  assert.deepStrictEqual(view.messages.map(m => m.text), ['hello', 'world'])
  assert.deepStrictEqual(view.messages.map(m => m.id), ['m1', 'm3'])
  assert.deepStrictEqual(view.messages.map(m => m.seq), [1, 4])
})

test('caps preview text at 80 characters', () => {
  const long = 'a'.repeat(200)
  let state = timelineProjectionDefinition.init()
  state = timelineProjectionDefinition.apply(state, userMessage(1, 1, long, 'm1'))
  const view = wire.view(state)
  assert.strictEqual(view.messages[0].text.length, 80)
})

test('joins multiple text blocks with a separator instead of running them together', () => {
  let state = timelineProjectionDefinition.init()
  state = timelineProjectionDefinition.apply(state, {
    type: 'user/message',
    seq: 1,
    time: 1,
    surfaceOp: 'append',
    data: {
      id: 'm1',
      role: 'user',
      content: [{ type: 'text', text: 'foo' }, { type: 'text', text: 'bar' }],
      source: { kind: 'user' },
    },
  })
  const view = wire.view(state)
  assert.strictEqual(view.messages[0].text, 'foo bar')
})

test('ignores surface replacements so a replaced message is not double-counted', () => {
  // A replacement copy of a user message (surfaceOp replace) shadows the
  // original on the model surface, but the transcript keeps the original row —
  // so the timeline must count it once. The chat view filters these out via
  // isAppendSurfaceEvent; the projection must match.
  let state = timelineProjectionDefinition.init()
  state = timelineProjectionDefinition.apply(state, userMessage(1, 1000, 'original', 'm1'))
  state = timelineProjectionDefinition.apply(state, {
    type: 'user/message',
    seq: 2,
    time: 1001,
    surfaceOp: { op: 'replace', start: 1, end: 1 },
    sourceEventSeqs: [1],
    data: {
      id: 'm1-copy',
      role: 'user',
      content: [{ type: 'text', text: 'rewritten' }],
      source: { kind: 'user' },
    },
  })
  const view = wire.view(state)
  assert.deepStrictEqual(view.messages.map(m => m.text), ['original'])
  assert.strictEqual(view.messages.length, 1)
})

test('ignores unrelated events without replacing state', () => {
  const initial = timelineProjectionDefinition.init()
  const unrelated = { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } }
  assert.strictEqual(timelineProjectionDefinition.apply(initial, unrelated), initial)
})
