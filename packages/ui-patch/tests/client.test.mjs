import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/*
 * The browser half is a closed factory registered with the client module
 * loader, so these tests load the built bundle the way the browser does: stub
 * `window.__ModuleLoader__.load`, hand it a `require` shim, and drive the
 * factory's exports.
 *
 * They cover what a typecheck cannot see: that the bundle keeps its DSH
 * imports as declared peer edges, that the width stylesheet is installed and
 * rewritten from the form, and that the menu reservation walks the live
 * catalog in both directions — taking Control-P where it is free and backing
 * off where `ui-sidebar-files` already holds it.
 */

const MENU_SELECTOR = '[role="menu"], [role="listbox"]'
const DISMISSIBLE_SELECTOR = `${MENU_SELECTOR}, [role="dialog"][aria-modal="true"]`
const APPROVAL_SELECTOR = '[data-approval-key]'

/** Load the built client bundle and return the factory's exports. */
function loadClientBundle() {
  let loaded
  const loader = { load: (registration) => { loaded = registration } }
  globalThis.window = { __ModuleLoader__: loader }
  try {
    const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
    // eslint-disable-next-line no-new-func -- the bundle is the artifact under test
    new Function('window', source)(globalThis.window)
  } finally {
    delete globalThis.window
  }
  assert.ok(loaded !== undefined, 'the bundle registers itself with the module loader')
  return { id: loaded.id, factory: loaded.factory }
}

/** The Host-provided externals this bundle requires at runtime. */
const HOST_MODULES = {
  '@deepseek-ai/dsh-client-locale': {},
  '@deepseek-ai/dsh-client-shortcuts': {},
  '@deepseek-ai/dsh-client-ui-renderer': {},
  '@deepseek-ai/dsh-client-ui-settings': {},
  '@deepseek-ai/dsh-client-ui-slots': {},
}

/** React stub: enough for the bundle to import without a DOM. */
const React = {
  useCallback: (fn) => fn,
  useEffect: () => {},
  useId: () => 'id',
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useState: (initial) => [initial, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  createElement: (type, props, ...children) => ({ type, props, children }),
}

function requireShim(specifier) {
  if (Object.hasOwn(HOST_MODULES, specifier)) return HOST_MODULES[specifier]
  if (specifier === 'react') return React
  if (specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime') {
    return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }
  }
  throw new Error(`unexpected runtime import in the client bundle: ${specifier}`)
}

/** Same physical combination: identical code and identical modifier set. */
function overlaps(left, right) {
  return left.code === right.code && [...left.modifiers].sort().join('+') === [...right.modifiers].sort().join('+')
}

/**
 * A shortcut service faithful enough to drive the integration: real subscriber
 * plumbing, and a `describeBinding` that answers from whatever is registered
 * right now — which is exactly the question the plugin asks it.
 */
function stubShortcuts(platform = 'macos') {
  const owned = new Map()
  const editable = new Map()
  const listeners = new Set()
  const fixedListeners = new Set()
  const publish = () => { for (const listener of [...listeners]) listener() }
  const conflicts = (binding) => [...owned.values()].flatMap(row =>
    row.bindings.some(other => overlaps(other, binding)) ? [row.id] : [])
    .concat([...editable.values()].flatMap(row => overlaps(row.binding, binding) ? [row.id] : []))
  return {
    runtime: 'web',
    platform,
    catalog: {
      getSnapshot: () => [...owned.values()],
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
    describeBinding: (binding) => ({ binding, keys: [], issue: null, conflicts: conflicts(binding) }),
    registerFixed: (command) => {
      assert.equal(owned.has(command.id), false, `duplicate fixed id ${command.id}`)
      owned.set(command.id, command)
      publish()
      return () => { owned.delete(command.id); publish() }
    },
    observeFixedInput: (listener) => { fixedListeners.add(listener); return () => { fixedListeners.delete(listener) } },
    /** Test seam: install a command owner the way a feature plugin would. */
    addCommand: (id, binding) => { editable.set(id, { id, binding }); publish() },
    /** Test seam: deliver a keystroke the way `installKeyboard` does. */
    deliver: (input) => { for (const listener of [...fixedListeners]) listener(input) },
    reservedIds: () => [...owned.keys()].sort(),
  }
}

/** A configuration-form stub whose stored value the test can change. */
function stubConfigForm(value) {
  const listeners = new Set()
  const state = { value, status: 'ready', writable: true }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    /** Test seam: publish a new stored value, as a committed edit would. */
    setValue: (next) => { state.value = next; for (const listener of [...listeners]) listener() },
  }
}

/**
 * The bundle guards focus with `instanceof HTMLElement`; this is that global.
 *
 * `closest` answers per selector the way the DOM would for a focused element:
 * a menuitem in an open menu matches the menu selectors, a control in an open
 * dialog matches the dialog selectors, and a control in the permission panel
 * matches the approval selector — which is the one the dismissal chord must
 * respect.
 */
class StubHTMLElement {
  constructor({ openMenu, openDialog, focusedIsApproval, dispatched }) {
    this.isConnected = true
    this.openMenu = openMenu
    this.openDialog = openDialog
    this.focusedIsApproval = focusedIsApproval
    this.dispatched = dispatched
  }

  closest(selector) {
    if (selector === APPROVAL_SELECTOR) return this.focusedIsApproval ? this : null
    const menu = selector.includes(MENU_SELECTOR)
    const dialog = selector.includes('[role="dialog"]')
    // A dialog-anchored element sits inside the dialog, which is also where a
    // menu would live; only the surfaces actually open answer.
    if (dialog && this.openDialog) return this
    if (menu && this.openMenu) return this
    return null
  }

  dispatchEvent(event) {
    this.dispatched.push(event)
    return true
  }
}

/** The shape the bundle constructs; recorded so assertions can read it. */
class StubKeyboardEvent {
  constructor(type, init) { this.type = type; Object.assign(this, init) }
}

/** A document stand-in whose focus, open surfaces, and owned style tags the test steers. */
function stubDocument({ focused = false, openMenu = false, openDialog = false, focusedIsApproval = false } = {}) {
  const dispatched = []
  const styles = []
  const element = new StubHTMLElement({ openMenu, openDialog, focusedIsApproval, dispatched })
  return {
    document: {
      activeElement: focused ? element : null,
      // The gate queries the document when focus is not already inside the
      // surface; report one only for the surfaces left open.
      querySelector: (selector) => {
        if (selector.includes('[role="dialog"]')) return openDialog ? element : null
        if (selector.includes(MENU_SELECTOR)) return openMenu ? element : null
        return null
      },
      head: { appendChild: (tag) => { styles.push(tag); return tag } },
      createElement: () => ({
        dataset: {},
        textContent: '',
        remove() { const at = styles.indexOf(this); if (at >= 0) styles.splice(at, 1) },
      }),
    },
    dispatched,
    styles,
  }
}

/**
 * Run `apply` with a stubbed context and run a body against the live plugin.
 *
 * The bundle reads `document`, `KeyboardEvent`, and `HTMLElement` as globals,
 * so they stay installed for the whole body — its listeners read them long
 * after `apply` returns.
 * @param options - service stubs and the document to install.
 * @param body - receives every stub plus the stylesheet registry.
 */
function withBundle({ shortcuts = stubShortcuts(), form = stubConfigForm({}), document } = {}, body) {
  const { factory } = loadClientBundle()
  const exports = factory(requireShim)
  const previous = { document: globalThis.document, KeyboardEvent: globalThis.KeyboardEvent,
    HTMLElement: globalThis.HTMLElement }
  globalThis.document = document
  globalThis.KeyboardEvent = StubKeyboardEvent
  globalThis.HTMLElement = StubHTMLElement
  try {
    exports.apply({
      effect: (fn) => fn(),
      locale: { bind: () => (key) => key, register: () => () => {} },
      configForms: { get: () => form },
      slots: { inject: (_key, register) => register(), register: () => () => {} },
      // `inject` hands the callback a child scope: the services asked for plus
      // its own `effect`, which is how the plugin registers its listeners.
      inject: (_services, callback) => callback({ effect: (fn) => fn(), shortcuts }),
    })
    body({ shortcuts, form, document })
  } finally {
    if (previous.document === undefined) delete globalThis.document
    else globalThis.document = previous.document
    if (previous.KeyboardEvent === undefined) delete globalThis.KeyboardEvent
    else globalThis.KeyboardEvent = previous.KeyboardEvent
    if (previous.HTMLElement === undefined) delete globalThis.HTMLElement
    else globalThis.HTMLElement = previous.HTMLElement
  }
}

/** A keystroke as the shortcut service frames it. */
function press(code, extra = {}) {
  let consumed = false
  return { input: { type: 'keydown',
    gesture: { code, control: true, alt: false, shift: false, meta: false, composing: false, defaultPrevented: false, ...extra },
    context: { region: 'page', modal: null, target: null },
    consume: () => { consumed = true } },
  wasConsumed: () => consumed }
}

test('the client bundle registers under the package id', () => {
  assert.equal(loadClientBundle().id, 'dsh-ui-patch')
})

test('the bundle requires its declared peers and nothing undeclared', () => {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const required = [...new Set([...source.matchAll(/require\((["'])([^"']+)\1\)/g)].map(match => match[2]))]
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const declared = new Set(Object.keys(manifest.peerDependencies ?? {}))
  const undeclared = required.filter(name => name.startsWith('@deepseek-ai/') && !declared.has(name))
  assert.deepEqual(undeclared, [], 'every runtime DSH import needs a matching peer')
})

// ── conversation width ─────────────────────────────────────────────────────

test('the width stylesheet is installed and carries the width rules', () => {
  const page = stubDocument()
  withBundle({ document: page.document }, ({ styles }) => {
    void styles
    assert.equal(page.styles.length, 1)
    assert.match(page.styles[0].textContent, /\[data-width-handle\]/)
    assert.match(page.styles[0].textContent, /--dsh-chat-user-width: initial/)
  })
})

test('no stored percentage leaves the width rule out of the stylesheet', () => {
  const page = stubDocument()
  withBundle({ document: page.document }, () => {
    assert.doesNotMatch(page.styles[0].textContent, /--dsh-chat-content-width:/)
  })
})

test('a stored percentage reaches the stylesheet, and edits rewrite it in place', () => {
  const form = stubConfigForm({ percent: 72 })
  const page = stubDocument()
  withBundle({ form, document: page.document }, () => {
    assert.match(page.styles[0].textContent, /--dsh-chat-content-width:/)
    assert.match(page.styles[0].textContent, /0\.72/)
    form.setValue({ percent: 45 })
    assert.match(page.styles[0].textContent, /0\.45/)
    assert.equal(page.styles.length, 1, 'the edit reuses the owned tag')
  })
})

// ── menu movement ─────────────────────────────────────────────────────────

test('every chord is reserved where it is free', () => {
  withBundle({ document: stubDocument().document }, ({ shortcuts }) => {
    assert.deepEqual(shortcuts.reservedIds(), ['menus.dismiss', 'menus.next', 'menus.previous'])
  })
})

test('a chord another command already holds is left to that command', () => {
  // `ui-sidebar-files` owns `primary+KeyP`, which is Control-P where primary is
  // Control. Reserving it here would disable that row, so the plugin must not.
  const shortcuts = stubShortcuts('linux')
  shortcuts.addCommand('workspace.files', { code: 'KeyP', modifiers: ['control'] })
  withBundle({ shortcuts, document: stubDocument().document }, ({ shortcuts: s }) => {
    assert.deepEqual(s.reservedIds(), ['menus.dismiss', 'menus.next'])
  })
})

test('reservations follow the catalog, so activation order does not matter', () => {
  // The sidebar plugin activating *after* this one must still win Control-P.
  const shortcuts = stubShortcuts('linux')
  withBundle({ shortcuts, document: stubDocument().document }, ({ shortcuts: s }) => {
    assert.deepEqual(s.reservedIds(), ['menus.dismiss', 'menus.next', 'menus.previous'])
    s.addCommand('workspace.files', { code: 'KeyP', modifiers: ['control'] })
    assert.deepEqual(s.reservedIds(), ['menus.dismiss', 'menus.next'])
  })
})

test('a claimed chord replays the arrow into the focused menu', () => {
  const page = stubDocument({ focused: true, openMenu: true })
  withBundle({ document: page.document }, ({ shortcuts }) => {
    const { input, wasConsumed } = press('KeyN')
    shortcuts.deliver(input)
    assert.equal(page.dispatched.length, 1)
    assert.equal(page.dispatched[0].type, 'keydown')
    assert.equal(page.dispatched[0].key, 'ArrowDown')
    assert.equal(page.dispatched[0].bubbles, true)
    assert.equal(wasConsumed(), true, 'the browser must not also act on the chord')
  })
})

test('Control-P replays ArrowUp', () => {
  const page = stubDocument({ focused: true, openMenu: true })
  withBundle({ document: page.document }, ({ shortcuts }) => {
    shortcuts.deliver(press('KeyP').input)
    assert.equal(page.dispatched[0].key, 'ArrowUp')
  })
})

test('with no surface open the chord is passed through untouched', () => {
  // Control-P outside a menu belongs to the page — that is the print dialog.
  const page = stubDocument({ focused: true, openMenu: false })
  withBundle({ document: page.document }, ({ shortcuts }) => {
    const { input, wasConsumed } = press('KeyP')
    shortcuts.deliver(input)
    assert.deepEqual(page.dispatched, [])
    assert.equal(wasConsumed(), false)
  })
})

test('a chord that was never reserved is not replayed', () => {
  // Control-P on Linux stayed the sidebar's, so this plugin must not move a menu with it.
  const shortcuts = stubShortcuts('linux')
  shortcuts.addCommand('workspace.files', { code: 'KeyP', modifiers: ['control'] })
  const page = stubDocument({ focused: true, openMenu: true })
  withBundle({ shortcuts, document: page.document }, ({ shortcuts: s }) => {
    const { input, wasConsumed } = press('KeyP')
    s.deliver(input)
    assert.deepEqual(page.dispatched, [])
    assert.equal(wasConsumed(), false)
  })
})

test('a modified gesture is left alone even with a menu open', () => {
  const page = stubDocument({ focused: true, openMenu: true })
  withBundle({ document: page.document }, ({ shortcuts }) => {
    shortcuts.deliver(press('KeyN', { shift: true }).input)
    assert.deepEqual(page.dispatched, [])
  })
})

test('a keystroke with no focused element cannot move anything', () => {
  const page = stubDocument({ focused: false, openMenu: true })
  withBundle({ document: page.document }, ({ shortcuts }) => {
    const { input, wasConsumed } = press('KeyN')
    shortcuts.deliver(input)
    assert.deepEqual(page.dispatched, [])
    assert.equal(wasConsumed(), false, 'an unclaimed gesture stays the page\'s')
  })
})

// ── Control-G: close menu or top dialog ───────────────────────────────────

test('Control-G replays Escape into an open menu', () => {
  const page = stubDocument({ focused: true, openMenu: true })
  withBundle({ document: page.document }, ({ shortcuts }) => {
    const { input, wasConsumed } = press('KeyG')
    shortcuts.deliver(input)
    assert.equal(page.dispatched.length, 1)
    assert.equal(page.dispatched[0].key, 'Escape')
    assert.equal(page.dispatched[0].bubbles, true)
    assert.equal(wasConsumed(), true)
  })
})

test('Control-G reaches dialogs too, which menus-only selectors would miss', () => {
  const page = stubDocument({ focused: true, openDialog: true })
  withBundle({ document: page.document }, ({ shortcuts }) => {
    shortcuts.deliver(press('KeyG').input)
    assert.equal(page.dispatched.length, 1)
    assert.equal(page.dispatched[0].key, 'Escape')
  })
})

test('Control-G does nothing when no menu or dialog is open', () => {
  // Escape on a bare page is the conversation's Esc-Esc stop gesture, not a
  // dismissal — so the chord must not manufacture one.
  const page = stubDocument({ focused: true, openMenu: false })
  withBundle({ document: page.document }, ({ shortcuts }) => {
    const { input, wasConsumed } = press('KeyG')
    shortcuts.deliver(input)
    assert.deepEqual(page.dispatched, [])
    assert.equal(wasConsumed(), false)
  })
})

test('Control-G never sends Escape into the permission panel', () => {
  // Escape there REJECTS the tool request. The chord must refuse even when the
  // panel is focused inside an open dialog, where the surface gate passes.
  const page = stubDocument({ focused: true, openDialog: true, focusedIsApproval: true })
  withBundle({ document: page.document }, ({ shortcuts }) => {
    const { input, wasConsumed } = press('KeyG')
    shortcuts.deliver(input)
    assert.deepEqual(page.dispatched, [], 'a dismissal chord must not answer a prompt')
    assert.equal(wasConsumed(), false)
  })
})

test('movement chords still work while an approval panel is focused', () => {
  // The panel is a plain role="group" and matches no menu selector, so the
  // movement chords gate it out on their own surface rule.
  const page = stubDocument({ focused: true, openMenu: false, focusedIsApproval: true })
  withBundle({ document: page.document }, ({ shortcuts }) => {
    shortcuts.deliver(press('KeyN').input)
    assert.deepEqual(page.dispatched, [])
  })
})
