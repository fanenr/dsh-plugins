import { strict as assert } from 'node:assert'
import test from 'node:test'

// Tests run against the built artifact so they exercise the shipped module.
const {
  Config,
  applyDefault,
  applySpec,
  hasExplicitRoute,
} = await import('../lib/index.js')

/** Project a live Config into the plain snapshot the wrappers read. */
function read(config) {
  return {
    provider: config.provider.get(),
    model: config.model.get(),
    reasoningEffort: config.reasoningEffort.get(),
  }
}

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

test('applySpec folds the route onto a continuable spec request', () => {
  const spec = { provider: 'spawn', label: 'x', request: { agentOptions: { provider: 'p' } } }
  const result = applySpec(spec, { provider: 'p2', model: 'm2', reasoningEffort: '' })
  assert.deepStrictEqual(result.request.agentOptions, { provider: 'p2', model: 'm2' })
  assert.strictEqual(result.provider, 'spawn')
  assert.strictEqual(result.label, 'x')
})

test('the live schema resolves an empty route to the built-in marker', () => {
  assert.deepStrictEqual(read(Config({})), { provider: '', model: '', reasoningEffort: '' })
})

test('the schema defaults to an empty route and admits a configured one', () => {
  assert.deepStrictEqual(read(Config({})), { provider: '', model: '', reasoningEffort: '' })
  assert.deepStrictEqual(read(Config({ provider: 'p', model: 'm', reasoningEffort: 'high' })), {
    provider: 'p',
    model: 'm',
    reasoningEffort: 'high',
  })
})

test('every field is volatile, so the configuration form can edit it live', () => {
  for (const field of ['provider', 'model', 'reasoningEffort']) {
    assert.equal(Config.dict[field].meta.volatile, true, `${field} must be volatile`)
  }
  // The root stays plain, so the schema projects a form instead of being one.
  assert.equal(Config.meta.volatile, undefined)
})
