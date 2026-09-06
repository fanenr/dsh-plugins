import { strict as assert } from 'node:assert'
import test from 'node:test'

// Tests run against the built artifact so they exercise the shipped module.
const {
  Config,
  SETTINGS_NS,
  Settings,
  applyDefault,
  applySpec,
  hasExplicitRoute,
} = await import('../lib/index.js')

test('built-in route leaves the request untouched', () => {
  const request = { agentOptions: { provider: 'p', model: 'm' } }
  const settings = { provider: '', model: '', reasoningEffort: '' }
  const result = applyDefault(request, settings)
  assert.strictEqual(result, request)
})

test('built-in route with no request agentOptions stays untouched', () => {
  const request = {}
  assert.strictEqual(applyDefault(request, { provider: '', model: '', reasoningEffort: '' }), request)
})

test('explicit route forces provider and model over existing options', () => {
  const request = { agentOptions: { provider: 'old-p', model: 'old-m' } }
  const result = applyDefault(request, { provider: 'p2', model: 'm2', reasoningEffort: '' })
  assert.deepStrictEqual(result.agentOptions, { provider: 'p2', model: 'm2' })
})

test('explicit route strips a foreign effort when none is configured', () => {
  const request = { agentOptions: { provider: 'old-p', model: 'old-m', reasoningEffort: 'effort-x' } }
  const result = applyDefault(request, { provider: 'p2', model: 'm2', reasoningEffort: '' })
  assert.deepStrictEqual(result.agentOptions, { provider: 'p2', model: 'm2' })
})

test('explicit route keeps a matching configured effort', () => {
  const request = { agentOptions: {} }
  const result = applyDefault(request, { provider: 'p2', model: 'm2', reasoningEffort: 'high' })
  assert.deepStrictEqual(result.agentOptions, {
    provider: 'p2',
    model: 'm2',
    reasoningEffort: 'high',
  })
})

test('explicit route overrides a foreign effort with the configured one', () => {
  const request = { agentOptions: { provider: 'p', model: 'm', reasoningEffort: 'low' } }
  const result = applyDefault(request, { provider: 'p2', model: 'm2', reasoningEffort: 'high' })
  assert.deepStrictEqual(result.agentOptions, {
    provider: 'p2',
    model: 'm2',
    reasoningEffort: 'high',
  })
})

test('forced route supersedes the Host-preflighted route it wraps', () => {
  // tool-subagent preflights the effective child route before calling
  // subagents.start; the wrapper must land the configured route after that.
  const request = {
    label: 'delegate',
    agentOptions: { provider: 'session-p', model: 'session-m', reasoningEffort: 'medium' },
  }
  const result = applyDefault(request, { provider: 'cfg-p', model: 'cfg-m', reasoningEffort: '' })
  assert.deepStrictEqual(result, {
    label: 'delegate',
    agentOptions: { provider: 'cfg-p', model: 'cfg-m' },
  })
})

test('route without agentOptions gains one', () => {
  const result = applyDefault({ label: 'x' }, { provider: 'p', model: 'm', reasoningEffort: '' })
  assert.deepStrictEqual(result.agentOptions, { provider: 'p', model: 'm' })
})

test('hasExplicitRoute requires both provider and model', () => {
  assert.ok(hasExplicitRoute({ provider: 'p', model: 'm' }))
  assert.ok(!hasExplicitRoute({ provider: 'p', model: '' }))
  assert.ok(!hasExplicitRoute({ provider: '', model: 'm' }))
  assert.ok(!hasExplicitRoute({ provider: '', model: '' }))
})

test('schema defaults every field to the empty built-in marker', () => {
  const value = Settings['~standard'].validate({}).value
  assert.deepStrictEqual(value, { provider: '', model: '', reasoningEffort: '' })
})

test('applySpec folds the route onto a continuable spec request', () => {
  const spec = { provider: 'spawn', label: 'x', request: { agentOptions: { provider: 'p' } } }
  const result = applySpec(spec, { provider: 'p2', model: 'm2', reasoningEffort: '' })
  assert.deepStrictEqual(result.request.agentOptions, { provider: 'p2', model: 'm2' })
  assert.strictEqual(result.provider, 'spawn')
  assert.strictEqual(result.label, 'x')
})

test('config schema defaults to an empty route', () => {
  const value = Config['~standard'].validate({}).value
  assert.deepStrictEqual(value, { provider: '', model: '' })
})

test('settings namespace is stable', () => {
  assert.strictEqual(SETTINGS_NS, 'subagent-default-model')
})
