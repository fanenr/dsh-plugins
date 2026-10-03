import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createRequire } from 'node:module'

/*
 * The browser half is a closed factory registered with the client module
 * loader, so these tests load the built bundle the way the browser does: stub
 * `window.__ModuleLoader__.load`, hand it a `require` shim, and drive the
 * factory's exports directly.
 *
 * They guard the Plugins-page contract. This package is a bundle, so its page
 * rides `plugins.bundle.config` keyed by the bundle's package name and renders
 * on the bundle's own page — registering `plugins.item` instead would list it in
 * the Official group and leave the bundle page with no form. The component must
 * not draw a card frame either, because the page owns the title and description.
 * None of this is visible to a typecheck, so it is asserted against the artifact.
 */

const require_ = createRequire(import.meta.url)

/** Load the built client bundle and return the factory's exports. */
function loadClientBundle() {
  let loaded
  const loader = { load: (registration) => { loaded = registration } }
  globalThis.window = { __ModuleLoader__: loader }
  try {
    // The bundle is a plain script that calls the global loader on evaluation.
    const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
    // eslint-disable-next-line no-new-func -- the bundle is the artifact under test
    new Function('window', source)(globalThis.window)
  } finally {
    delete globalThis.window
  }
  assert.ok(loaded !== undefined, 'the bundle registers itself with the module loader')
  return { id: loaded.id, factory: loaded.factory }
}

/** Stub for the Host-provided externals the bundle requires at runtime. */
const HOST_MODULES = {
  // SettingsForm is a named function so a rendered tree identifies it: React
  // holds the component reference as the element type, and this is the only
  // way to tell the shared frame apart from a hand-rolled div.
  '@deepseek-ai/dsh-client-ui-primitives': {
    Menu: 'Menu',
    IconChevronDownOutlineRegular: 'IconChevronDownOutlineRegular',
    SettingsForm: function SettingsForm() { return null },
  },
  '@deepseek-ai/dsh-client-ui-slots': {},
  '@deepseek-ai/dsh-client-ui-settings': {},
  '@deepseek-ai/dsh-client-ui-plugin-manager': {},
  '@deepseek-ai/dsh-api-remotes': {},
  '@deepseek-ai/dsh-client-locale': {},
  '@deepseek-ai/dsh-client-ui-renderer': {},
}

/** React stub: enough for the bundle to import without a DOM. */
function requireShim(specifier) {
  if (Object.hasOwn(HOST_MODULES, specifier)) return HOST_MODULES[specifier]
  if (specifier === 'react') {
    return {
      useCallback: (fn) => fn,
      useEffect: () => {},
      useId: () => 'id',
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
      useState: (initial) => [initial, () => {}],
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
      createElement: (type, props, ...children) => ({ type, props, children }),
    }
  }
  if (specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime') {
    return {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
      Fragment: 'Fragment',
    }
  }
  if (specifier === 'react-dom' || specifier === 'scheduler') return {}
  throw new Error(`unexpected runtime import in the client bundle: ${specifier}`)
}

test('the client bundle registers under the package id', () => {
  const { id } = loadClientBundle()
  assert.equal(id, 'dsh-subagent-default-model')
})

test('the bundle requires its declared peers and nothing undeclared', () => {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const required = [...new Set([...source.matchAll(/require\((["'])([^"']+)\1\)/g)].map(match => match[2]))]
  // A DSH module the bundle requires at runtime is a real peer edge: it must be
  // declared in peerDependencies or the Host would hand over `undefined`.
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const declared = new Set(Object.keys(manifest.peerDependencies ?? {}))
  const undeclared = required.filter(name => name.startsWith('@deepseek-ai/') && !declared.has(name))
  assert.deepEqual(undeclared, [], 'every runtime DSH import needs a matching peer')
  // React is the Host's shared instance, never bundled.
  assert.ok(required.some(name => name === 'react'), 'react stays external')
})

test('apply registers this bundle\'s page under the bundle-config contract', () => {
  const { factory } = loadClientBundle()
  const exports = factory(requireShim)

  const slots = []
  const registered = []
  const injected = []
  const ctx = {
    effect: (fn) => fn(),
    locale: {
      bind: () => (key) => key,
      register: () => () => {},
      getSnapshot: () => ({ revision: 0 }),
    },
    configForms: {
      get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ status: 'ready', writable: true }) }),
      whileServed: (_namespaces, register) => register(new Set(['subagent-default-model'])),
    },
    slots: {
      inject: (key, callback) => { slots.push(key); callback(); return () => {} },
      register: (options, component) => {
        registered.push({ options, component })
        injected.push(options.inject())
        return () => {}
      },
    },
    remote: {
      session: { modelCatalog: async () => ({ ok: true, value: { groups: [], failures: [] } }) },
    },
  }

  exports.apply(ctx)

  // A bundle's configuration rides plugins.bundle.config; plugins.item is the
  // official settings pages' slot and lists the entry in the Official group.
  assert.deepEqual(slots, ['plugins.bundle.config'])
  assert.equal(registered.length, 1, 'exactly one page is registered')
  const [{ options }] = registered
  assert.equal(options.name, 'plugins.bundle.config')
  // Keyed by the package name, which is how the page addresses the bundle.
  assert.equal(options.key, 'dsh-subagent-default-model')
  assert.equal(options.id, undefined, 'a keyed bundle config carries no list id')
  assert.equal(options.order, undefined, 'a keyed bundle config carries no list order')
  assert.ok(options.locale, 'the registration declares its dictionary namespace')

  const face = injected[0]
  // The page's owner share already carries a `form` and owner props win, so an
  // injected control called `form` would be replaced by the Host's own.
  assert.ok(!Object.hasOwn(face, 'form'), 'the injected face must not use the reserved `form` name')
  assert.equal(typeof face.configForm, 'object', 'the shared configuration form rides as configForm')
  assert.equal(typeof face.configForm.subscribe, 'function')
  assert.equal(typeof face.configForm.getSnapshot, 'function')
  assert.equal(typeof face.loadCatalog, 'function')
})

test('the page renders its controls without drawing its own card frame', () => {
  const { factory } = loadClientBundle()
  const exports = factory(requireShim)
  const captured = []
  const ctx = {
    effect: (fn) => fn(),
    locale: { bind: () => (key) => key, register: () => () => {}, getSnapshot: () => ({ revision: 0 }) },
    configForms: {
      get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ status: 'ready', writable: true }) }),
      whileServed: (_n, register) => register(new Set()),
    },
    slots: {
      inject: (_key, callback) => { callback(); return () => {} },
      register: (_options, component) => { captured.push(component); return () => {} },
    },
    remote: { session: { modelCatalog: async () => ({ ok: true, value: { groups: [], failures: [] } }) } },
  }
  exports.apply(ctx)
  const Page = captured[0]

  const page = Page({
    t: key => key,
    view: 'page',
    configForm: { subscribe: () => () => {}, getSnapshot: () => ({ status: 'ready', writable: true }) },
    loadCatalog: async () => ({ groups: [], failures: [] }),
  })
  assert.equal(page.type, 'div')
  assert.equal(page.props.className, 'dsh_sdm_page')

  // The frame — save control, read-only line, unavailable line — is the shared
  // settings form's, so the card must not draw its own footer or buttons.
  const children = Array.isArray(page.props.children) ? page.props.children : [page.props.children]
  const frame = children.find(child => child && child.type?.name === 'SettingsForm')
  assert.ok(frame !== undefined, 'the card renders inside the shared SettingsForm')
  assert.equal(frame.props.state.available, true, 'and tells it the namespace is served')
  assert.equal(frame.props.state.dirty, false, 'with nothing staged, so the save is blocked')
  assert.deepEqual(Object.keys(frame.props.labels).sort(), ['readOnly', 'save', 'saveFailed', 'saving', 'unavailable'])

  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  // The bundle page draws the title, description, and uninstall chrome itself;
  // a nested frame here would repeat them.
  for (const chrome of ['dsh_sdm_card', 'dsh_sdm_header', 'dsh_sdm_name', 'dsh_sdm_pending']) {
    assert.ok(!source.includes(chrome), `the bundle must not style a nested card frame (${chrome})`)
  }
  // The hand-rolled footer went with it: styling a save button here would be
  // the second visual language the frame exists to remove.
  for (const dead of ['dsh_sdm_footer', 'dsh_sdm_failed', 'dsh_sdm_discard', 'dsh_sdm_save']) {
    assert.ok(!source.includes(dead), `the shared form owns the footer (${dead} must be gone)`)
  }
})

test('the bundle ships localized display metadata for its page title', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  // The Host reads <pkg>/locale/<lang>.json meta.title|description for the
  // bundle page, and resolves it through the package's own exports map.
  assert.ok(Object.hasOwn(manifest.exports, './locale/*.json'), 'the locale files must be exported')
  for (const language of ['en', 'zh']) {
    const file = new URL(`../locale/${language}.json`, import.meta.url)
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(typeof parsed.meta?.title, 'string', `${language} declares meta.title`)
    assert.equal(typeof parsed.meta?.description, 'string', `${language} declares meta.description`)
  }
})
