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
 * They guard the `plugins.item` contract. The Plugins page draws the card head
 * and calls an entry for `summary` or `page`; a component that renders its own
 * card frame shows the entry twice, and an injected prop named `form` is
 * silently overwritten by the page's own `form` owner prop (owner props spread
 * last). Both mistakes are invisible to a typecheck, so they are asserted here.
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
  '@deepseek-ai/dsh-client-ui-primitives': { Menu: 'Menu', IconChevronDownOutlineRegular: 'IconChevronDownOutlineRegular' },
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

test('apply registers the page and injects its form under a non-colliding name', () => {
  const { factory } = loadClientBundle()
  const exports = factory(requireShim)

  const registered = []
  const injected = []
  const effects = []
  const ctx = {
    effect: (fn, label) => { effects.push(label); return fn() },
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
      inject: (_key, callback) => { callback(); return () => {} },
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

  assert.equal(registered.length, 1, 'exactly one page is registered')
  const [{ options }] = registered
  assert.equal(options.name, 'plugins.item', 'the page rides the Plugins page contract')
  assert.equal(options.id, 'subagent-default-model')
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

test('the component renders the asked-for view instead of its own card frame', () => {
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
  const Card = captured[0]

  const face = {
    configForm: { subscribe: () => () => {}, getSnapshot: () => ({ status: 'ready', writable: true }) },
    loadCatalog: async () => ({ groups: [], failures: [] }),
  }

  // `summary` is the one-liner the card head renders under its own title.
  const summary = Card({ t: key => key, view: 'summary', ...face })
  assert.equal(summary.type, 'Fragment', 'summary returns the description alone, not a card element')
  assert.equal(summary.props.children, 'desc')

  // `page` is the controls; the page owns the frame around them.
  const page = Card({ t: key => key, view: 'page', ...face })
  assert.notEqual(page.type, 'li', 'page must not render a card list item the page already owns')
  assert.equal(page.type.name, 'SubagentModelPage', 'page renders the controls component')
  // The page-level view must not carry its own headline or disclosure: the
  // Host draws the title, the description, and the open/closed affordance.
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  for (const chrome of ['dsh_sdm_card', 'dsh_sdm_header', 'dsh_sdm_name', 'dsh_sdm_pending']) {
    assert.ok(!source.includes(chrome), `the bundle must not style a nested card frame (${chrome})`)
  }
})
