import { strict as assert } from 'node:assert'
import test from 'node:test'

// The built host half is exercised against a stub Cordis context, so the
// namespace registration and its schema are validated as the process sees them.
const { ChatWidthSettingsSchema, apply, name, NS, PERCENT_FIELD, PERCENT_MAX, PERCENT_MIN } =
  await import('../lib/index.js')

/** Minimal Host context: records the settings registration. */
function stubContext() {
  const calls = []
  const ctx = {
    inject(services, fn) {
      calls.push({ services })
      fn({ settings: { register: (ns, schema, options) => { calls.push({ ns, schema, options }) } } })
    },
  }
  return { ctx, calls }
}

test('the host half declares its bundle name', () => {
  assert.equal(name, 'dsh-chat-width')
})

test('apply registers the namespace through the settings service', () => {
  const { ctx, calls } = stubContext()
  apply(ctx)
  assert.deepEqual(calls[0].services, ['settings'])
  const registration = calls.find(call => call.ns !== undefined)
  assert.equal(registration.ns, NS)
  assert.ok(registration.schema, 'a schema accompanies the registration')
})

test('the schema resolves an adaptive section without inventing a percentage', () => {
  const value = ChatWidthSettingsSchema({})
  assert.equal(value[PERCENT_FIELD], undefined)
})

test('the schema admits a valid percentage and rejects an out-of-range one', () => {
  assert.equal(ChatWidthSettingsSchema({ [PERCENT_FIELD]: 80 })[PERCENT_FIELD], 80)
  assert.throws(() => ChatWidthSettingsSchema({ [PERCENT_FIELD]: PERCENT_MAX + 1 }))
  assert.throws(() => ChatWidthSettingsSchema({ [PERCENT_FIELD]: PERCENT_MIN - 1 }))
})
