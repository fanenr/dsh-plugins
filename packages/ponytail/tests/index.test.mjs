import { strict as assert } from 'node:assert'
import test from 'node:test'

// Tests run against the built artifact so they exercise the shipped module.
const {
  Config,
  DEFAULT_MODE,
  RUNTIME_MODES,
  SKILLS,
  normalizeMode,
  sectionText,
} = await import('../lib/index.js')

test('sectionText prepends the mode header and returns empty for off', () => {
  const full = sectionText('full')
  assert.match(full, /^PONYTAIL MODE ACTIVE — level: full\n\n# Ponytail/)
  assert.match(full, /The ladder runs after you understand the problem/)
  assert.strictEqual(sectionText('off'), '')
  for (const mode of ['lite', 'ultra']) {
    assert.match(sectionText(mode), new RegExp(`level: ${mode}`))
  }
})

test('normalizeMode accepts only the four runtime levels', () => {
  assert.strictEqual(normalizeMode('full'), 'full')
  assert.strictEqual(normalizeMode('ULTRA'), 'ultra')
  assert.strictEqual(normalizeMode(' off '), 'off')
  assert.strictEqual(normalizeMode('review'), undefined)
  assert.strictEqual(normalizeMode(''), undefined)
  assert.strictEqual(normalizeMode(undefined), undefined)
  assert.deepStrictEqual([...RUNTIME_MODES], ['off', 'lite', 'full', 'ultra'])
})

test('Config defaults to full and rejects unknown levels', () => {
  assert.deepStrictEqual(Config['~standard'].validate({}).value, { defaultMode: DEFAULT_MODE })
  const invalid = Config['~standard'].validate({ defaultMode: 'extreme' })
  assert.ok(invalid.issues)
})

test('registers six skills with the ponytail skill model-invocable only', () => {
  assert.strictEqual(SKILLS.length, 6)
  const names = SKILLS.map(skill => skill.name)
  assert.deepStrictEqual(names, ['ponytail', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help'])
  const main = SKILLS.find(skill => skill.name === 'ponytail')
  assert.ok(main)
  assert.strictEqual(main.invocation.modelInvocable, true)
  assert.strictEqual(main.invocation.userInvocable, false)
  assert.match(main.content, /# Ponytail/)
  for (const skill of SKILLS.slice(1)) {
    assert.strictEqual(skill.invocation.modelInvocable, true)
    assert.strictEqual(skill.invocation.userInvocable, true)
    assert.ok(skill.content.length > 0)
  }
})
