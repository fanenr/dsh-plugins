import { strict as assert } from 'node:assert'
import test from 'node:test'

// The built host half is exercised against a stub Cordis context, so the live
// Config schema and the presentation opt-out are validated as the process sees them.
const { Config, apply, name, PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN } = await import('../lib/index.js')

/** Minimal Host context: records the settings injection and its presentation call. */
function stubContext() {
  const calls = []
  const ctx = {
    fiber: { marker: 'owner-fiber' },
    inject(services, fn) {
      calls.push({ services })
      fn({
        effect: (fn2, label) => { calls.push({ effectLabel: label }); return fn2() },
        settings: { configure: (presentation, owner) => { calls.push({ presentation, owner }) } },
      })
    },
  }
  return { ctx, calls }
}

test('the host half declares its bundle name', () => {
  assert.equal(name, 'dsh-ui-patch')
})

test('apply opts this entry out of the generated configuration page', () => {
  const { ctx, calls } = stubContext()
  apply(ctx)
  assert.deepEqual(calls[0].services, ['settings'])
  const configure = calls.find(call => call.presentation !== undefined)
  assert.deepEqual(configure.presentation, { auto: false })
  assert.equal(configure.owner, ctx.fiber)
})

test('a volatile field resolves to a live reference, not a copied value', () => {
  const resolved = Config({ [PERCENT_FIELD]: 80 })
  assert.equal(typeof resolved[PERCENT_FIELD].get, 'function')
  assert.equal(resolved[PERCENT_FIELD].get(), 80)
})

test('an adaptive section leaves the percentage undefined instead of inventing one', () => {
  const resolved = Config({})
  assert.equal(resolved[PERCENT_FIELD].get(), undefined)
})

test('the schema admits a valid percentage and rejects an out-of-range one', () => {
  assert.equal(Config({ [PERCENT_FIELD]: 80 })[PERCENT_FIELD].get(), 80)
  assert.throws(() => Config({ [PERCENT_FIELD]: PERCENT_MAX + 1 }))
  assert.throws(() => Config({ [PERCENT_FIELD]: PERCENT_MIN - 1 }))
})

test('the field is volatile, so the configuration form can edit it live', () => {
  assert.equal(Config.dict[PERCENT_FIELD].meta.volatile, true)
  // The root stays plain: only declared fields are form-editable.
  assert.equal(Config.meta.volatile, undefined)
})
