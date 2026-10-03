import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Tests run against the built artifact so they exercise the shipped module.
// The card itself is a browser closure factory; the renderer-free pieces it
// shares ship in the host build, which is where a test can reach them.
const { formLabels, settingsListField } = await import('../lib/shared.js')

/** The shipped browser bundle, as text. It is a closure factory, not an importable module. */
const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

/** Load the built client bundle and return the factory's exports. */
function loadClientBundle() {
  let loaded
  const loader = { load: (registration) => { loaded = registration } }
  globalThis.window = { __ModuleLoader__: loader }
  try {
    // The bundle is a plain script that calls the global loader on evaluation.
    // eslint-disable-next-line no-new-func -- the bundle is the artifact under test
    new Function('window', bundle)(globalThis.window)
  } finally {
    delete globalThis.window
  }
  assert.ok(loaded !== undefined, 'the bundle registers itself with the module loader')
  return { id: loaded.id, factory: loaded.factory }
}

/**
 * Stand-in for the shared settings form model. The real one ships in the
 * primitives bundle; only the constructor and the surface the controller calls
 * are exercised here.
 */
class FakeSettingsFormModel {
  constructor(scope, specs) {
    this.scope = scope
    this.specs = specs
  }

  bind(project) {
    return { getSnapshot: project, set: () => {} }
  }

  shell() {
    return {
      available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false,
    }
  }

  field(name) {
    return { text: `${name}-text`, overridden: false, invalid: false }
  }

  actions() {
    return { edit: () => {}, resetField: () => {}, save: () => {}, discard: () => {} }
  }

  dispose() {}
}

/** React stub: enough for the bundle to import without a DOM. */
function requireShim(specifier) {
  if (specifier === 'react' || specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime') {
    return {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
      Fragment: 'Fragment',
    }
  }
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
    return { SettingsFormModel: FakeSettingsFormModel, SettingsForm: () => null, Tag: () => null }
  }
  if (specifier === '@deepseek-ai/dsh-client-store' || specifier === 'react-dom' || specifier === 'scheduler') return {}
  throw new Error(`unexpected runtime import in the client bundle: ${specifier}`)
}

test('settingsListField stores a line-per-name list, and clears by unset', () => {
  const spec = settingsListField('include')
  assert.equal(spec.field, 'include')
  assert.equal(spec.format(['A', 'B']), 'A\nB\n')
  assert.equal(spec.format(undefined), '')
  assert.deepEqual(spec.parse('A\nB\n'), { kind: 'set', value: ['A', 'B'] })
  assert.deepEqual(spec.parse('  A  \n\nA\nB\n'), { kind: 'set', value: ['A', 'B'] })
  // An empty box clears the override instead of pinning an empty array over the
  // schema default — the model turns `clear` into an `unset` write.
  assert.deepEqual(spec.parse(''), { kind: 'clear' })
  assert.deepEqual(spec.parse('\n  \n'), { kind: 'clear' })
})

test('formLabels reads every frame string from the card dictionary', () => {
  const labels = formLabels(key => `t:${key}`)
  assert.deepEqual(labels, {
    save: 't:save',
    saving: 't:saving',
    saveFailed: 't:saveFailed',
    readOnly: 't:readOnly',
    unavailable: 't:unavailable',
  })
})

test('the client bundle registers under the package id', () => {
  assert.equal(loadClientBundle().id, 'dsh-shell-credentials')
})

test('the bundle requires only platform-seeded modules', () => {
  const required = [...new Set([...bundle.matchAll(/require\((["'])([^"']+)\1\)/g)].map(match => match[2]))].sort()
  // The shell seeds the platform table before any row loads; a require the
  // table cannot answer is a guaranteed runtime throw, so every runtime
  // import must be one of those names.
  const PLATFORM_SEEDED = new Set([
    'react', 'react/jsx-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-store',
  ])
  assert.deepEqual(required.filter(name => !PLATFORM_SEEDED.has(name)), [], 'every runtime import is platform-seeded')
  // `dsh.client.inject` names modules the shell must load BEFORE this row.
  // Platform-seeded modules need no such edge, so the list stays empty.
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.deepEqual(manifest.dsh.client.inject, [], 'a declared edge the bundle never requires is a false dependency')
})

test('the stylesheet ships as a hashed CSS module that injects its own style tag', () => {
  // The class map is hashed with the framework's `[hash]_[local]` pattern, so
  // the card's rules cannot collide with another plugin's and the artifact
  // carries its own CSS the way a builtin plugin's does.
  const hashed = [...bundle.matchAll(/\.([A-Za-z0-9_-]{6}_(?:columns|field|head|label|badges|reset|list|hint|invalid))\b/g)]
    .map(match => match[1])
  assert.equal(new Set(hashed).size, 9, 'every local class is emitted hashed')
  assert.match(bundle, /data-plugin-css/, 'the style tag is tagged for ownership')
  assert.match(bundle, /dsh-shell-credentials\/ConfigCard\.module\.css/, 'and named for its source stylesheet')
  // Design tokens, not literal colors: the card follows the theme.
  assert.match(bundle, /--dsw-alias-border-l4/)
  assert.match(bundle, /--dsw-alias-label-primary/)
  assert.match(bundle, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'two equal columns, allowed to shrink')
  // lightningcss rewrites the query to the range syntax, so assert the width
  // bound rather than the authored `max-width` spelling.
  assert.match(bundle, /@media \(width<=640px\)/, 'and one column when the card is too narrow')
})

test('apply registers the bundle page under its own package key', () => {
  const { factory } = loadClientBundle()
  const exports = factory(requireShim)
  assert.equal(exports.name, undefined, 'a client bundle needs no cordis name of its own')
  assert.deepEqual(exports.inject, ['slots', 'locale', 'configForms'])

  const registered = []
  const watched = []
  const scope = {
    subscribe: () => () => {},
    getSnapshot: () => ({ status: 'ready', writable: true, value: {}, base: {}, user: {}, revision: 1 }),
    mutate: () => Promise.resolve(true),
  }
  const ctx = {
    effect: fn => fn(),
    locale: { register: () => () => {} },
    configForms: {
      get: () => scope,
      whileServed: (namespaces, register) => {
        watched.push(...namespaces)
        register(new Set(namespaces))
        return () => {}
      },
    },
    slots: {
      register: (options, component) => {
        registered.push({ options, component })
        return () => {}
      },
    },
  }
  exports.apply(ctx)

  // The form is keyed by the namespace the Host reports for the mounted entry,
  // which is the patch's row id — not the package name. Getting this wrong
  // makes whileServed wait forever and the page silently never registers.
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const rowId = /- id: (\S+)/.exec(patch)?.[1]
  assert.equal(rowId, 'shell-credentials')
  assert.deepEqual(watched, [rowId], 'the page is gated on the profile row id')
  assert.equal(registered.length, 1)
  assert.equal(registered[0].options.name, 'plugins.bundle.config')
  assert.equal(registered[0].options.key, 'dsh-shell-credentials', 'keyed by the bundle package name the page opens')
  assert.equal(registered[0].options.locale, 'dsh-shell-credentials')
  // The row id and the package name are deliberately different (the `dsh-`
  // prefix belongs to the package), which is exactly the shape that makes
  // confusing them a live hazard rather than a hypothetical one.
  assert.notEqual(rowId, registered[0].options.key, 'the row id is not the package name')
  assert.equal(typeof registered[0].component, 'function')
  // The owner share of a configuration slot carries a `form` of its own, so the
  // business face must not inject under that name.
  const face = registered[0].options.inject()
  assert.deepEqual(Object.keys(face).sort(), ['discard', 'edit', 'hooks', 'resetField', 'save'])
  // The card's projected state carries the shared shell plus one entry per
  // field, which is what the component reads through its bound selector.
  const card = face.hooks.card.getSnapshot()
  assert.deepEqual(Object.keys(card).sort(), [
    'available', 'dirty', 'exclude', 'failed', 'include', 'invalid', 'saving', 'writable',
  ])
  assert.deepEqual(card.include, { text: 'include-text', overridden: false, invalid: false })
  assert.deepEqual(card.exclude, { text: 'exclude-text', overridden: false, invalid: false })
})
