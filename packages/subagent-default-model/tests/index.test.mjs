import { strict as assert } from 'node:assert'
import test from 'node:test'

// The host bundle is ESM and built; the test runs against the built artifact
// so it exercises the shipped module, not the source.
const { applyDefault, withReasoningEffort } = await import('../lib/index.js')

test('applyDefault leaves explicit agentOptions untouched, including an empty object', () => {
  const settings = {
    get: () => ({ provider: 'cpa', model: 'deepseek-v4-flash' }),
  }
  const pinned = { agentOptions: { provider: 'other', model: 'other-model' } }
  assert.strictEqual(applyDefault(pinned, settings), pinned)
  const explicitlyEmpty = { agentOptions: {} }
  assert.strictEqual(applyDefault(explicitlyEmpty, settings), explicitlyEmpty)
})

test('applyDefault injects the configured selection only when the request carries none', () => {
  const settings = {
    get: () => ({ provider: 'cpa', model: 'deepseek-v4-flash' }),
  }
  const bare = { prompt: [] }
  const out = applyDefault(bare, settings)
  assert.deepStrictEqual(out, {
    prompt: [],
    agentOptions: { provider: 'cpa', model: 'deepseek-v4-flash' },
  })
  assert.strictEqual(out.agentOptions.provider, 'cpa')
  assert.strictEqual(out.agentOptions.model, 'deepseek-v4-flash')
})

test('applyDefault forwards unchanged when settings has no selection', () => {
  const settings = { get: () => undefined }
  const bare = { prompt: [] }
  assert.strictEqual(applyDefault(bare, settings), bare)
})

test('withReasoningEffort overrides an inherited effort and skips an already-matching one', () => {
  const proposed = { provider: 'cpa', model: 'deepseek-v4-flash', reasoningEffort: 'inherited' }
  const out = withReasoningEffort(proposed, 'medium')
  assert.strictEqual(out.reasoningEffort, 'medium')
  assert.notStrictEqual(out, proposed)
  const already = { provider: 'cpa', model: 'deepseek-v4-flash', reasoningEffort: 'medium' }
  assert.strictEqual(withReasoningEffort(already, 'medium'), already)
})
