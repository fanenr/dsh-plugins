import { strict as assert } from 'node:assert'
import test from 'node:test'

// Tests run against the built artifact so they exercise the shipped module.
const { apply, Config, CREDENTIAL_SHAPE, installResolveWrapper, resolveForwarded, withForwardedEnv } = await import('../lib/index.js')
// The renderer-free pieces the card shares; they ship in the host build
// because the browser bundle is a closure factory Node cannot import.
const { formatNames, parseNames } = await import('../lib/shared.js')

const source = {
  PATH: '/usr/bin',
  HOME: '/home/me',
  VENDOR_API_TOKEN: 'vendor-value',
  SEARCH_API_KEY: 'search-value',
  DEEPSEEK_API_KEY: 'harness-value',
  EMPTY_TOKEN: '',
  VENDOR_CLI_CONFIG: '/tmp/vendor-cli.json',
}

test('no include: forwards exactly the credential-shaped, non-empty names the scrub drops', () => {
  assert.deepEqual(resolveForwarded(source, { include: [], exclude: [] }), {
    VENDOR_API_TOKEN: 'vendor-value',
    SEARCH_API_KEY: 'search-value',
    DEEPSEEK_API_KEY: 'harness-value',
  })
})

test('a name that matches the scrub shape is the same set the plugin forwards', () => {
  const forwarded = Object.keys(resolveForwarded(source, { include: [], exclude: [] }))
  const scrubbed = Object.keys(source).filter(key => CREDENTIAL_SHAPE.test(key))
  assert.deepEqual(forwarded, scrubbed.filter(key => source[key] !== ''))
})

test('exclude wins over the heuristic', () => {
  const forwarded = resolveForwarded(source, { include: [], exclude: ['DEEPSEEK_API_KEY'] })
  assert.equal(forwarded.DEEPSEEK_API_KEY, undefined)
  assert.equal(forwarded.VENDOR_API_TOKEN, 'vendor-value')
})

test('a non-empty include is an allowlist that reaches past the heuristic', () => {
  assert.deepEqual(resolveForwarded(source, { include: ['VENDOR_CLI_CONFIG'], exclude: [] }), {
    VENDOR_CLI_CONFIG: '/tmp/vendor-cli.json',
  })
  // An allowlisted name is still subject to exclusion, and an unset allowlisted name forwards nothing.
  assert.deepEqual(resolveForwarded(source, { include: ['VENDOR_CLI_CONFIG', 'ABSENT'], exclude: ['VENDOR_CLI_CONFIG'] }), {})
})

test('an empty or absent value forwards nothing', () => {
  assert.equal(resolveForwarded(source, { include: [], exclude: [] }).EMPTY_TOKEN, undefined)
})

test('the caller env wins per name, and a request with nothing to add is passed through', () => {
  const forwarded = { VENDOR_API_TOKEN: 'from-host' }
  assert.deepEqual(withForwardedEnv({ command: 'true' }, forwarded), {
    command: 'true',
    env: { VENDOR_API_TOKEN: 'from-host' },
  })
  assert.deepEqual(withForwardedEnv({ command: 'true', env: { VENDOR_API_TOKEN: 'from-caller' } }, forwarded), {
    command: 'true',
    env: { VENDOR_API_TOKEN: 'from-caller' },
  })
  const untouched = { command: 'true' }
  assert.equal(withForwardedEnv(untouched, {}), untouched)
})

/** A stand-in executor: `resolve` records the request it was handed and stamps a spec. */
function fakeShell() {
  const seen = []
  return {
    seen,
    resolve(request) {
      seen.push(request)
      return { ...request, workdir: '/tmp', timeoutMs: 1, onExpiry: 'kill', stdoutMaxBytes: 1, sandboxPolicy: undefined }
    },
    sandboxMode: undefined,
  }
}

test('the wrapper folds forwarded names into every request and uninstalls cleanly', () => {
  const shell = fakeShell()
  const original = shell.resolve
  const uninstall = installResolveWrapper({ shell }, { VENDOR_API_TOKEN: 'host-value' })

  shell.resolve({ command: 'one' })
  shell.resolve({ command: 'two', env: { VENDOR_API_TOKEN: 'caller-value', CLAUDE_PLUGIN_ROOT: '/p' } })

  assert.deepEqual(shell.seen[0].env, { VENDOR_API_TOKEN: 'host-value' })
  assert.deepEqual(shell.seen[1].env, { VENDOR_API_TOKEN: 'caller-value', CLAUDE_PLUGIN_ROOT: '/p' })

  uninstall()
  assert.equal(shell.resolve, original)
})

test('parseNames reads one name per line, ignoring blanks and repeats', () => {
  assert.deepEqual(parseNames('VENDOR_API_TOKEN\nSEARCH_API_KEY\n'), ['VENDOR_API_TOKEN', 'SEARCH_API_KEY'])
  assert.deepEqual(parseNames('  A  \n\n\n B \nA\n'), ['A', 'B'], 'whitespace trims and a repeat keeps its first position')
  assert.deepEqual(parseNames(''), [])
  assert.deepEqual(parseNames('\n  \n'), [], 'a blank list forwards nothing')
})

test('formatNames round-trips through parseNames', () => {
  const names = ['A', 'B']
  assert.equal(formatNames(names), 'A\nB\n')
  assert.deepEqual(parseNames(formatNames(names)), names)
  assert.equal(formatNames(undefined), '')
  assert.equal(formatNames([]), '')
})

test('the Config schema keeps the lists live, which is what makes the Host serve the namespace', () => {
  // `settings.describe` publishes a namespace only for an entry whose schema
  // yields a volatile form (dsh-settings `volatileForm`): a volatile node
  // projects itself, an object projects the children that do, anything else
  // contributes nothing. The browser half's registration is gated on that
  // namespace, so a schema without live fields would leave the card permanently
  // absent — the algorithm is inlined here because it is not exported.
  const json = Config.toJSON()
  const refs = json.refs
  const root = refs[json.uid]
  assert.equal(root.type, 'object')

  const volatileForm = (node) => {
    if (node.meta?.volatile === true) return node
    if (node.type !== 'object') return undefined
    const dict = Object.fromEntries(Object.entries(node.dict ?? {}).flatMap(([key, uid]) => {
      const field = volatileForm(refs[uid])
      return field === undefined ? [] : [[key, field]]
    }))
    return Object.keys(dict).length === 0 ? undefined : { ...node, dict }
  }

  const form = volatileForm(root)
  assert.notEqual(form, undefined, 'no volatile field means describe() skips the entry and the page never renders')
  assert.deepEqual(Object.keys(form.dict), ['include', 'exclude'])
  for (const [field, node] of Object.entries(form.dict)) {
    assert.equal(node.type, 'array', `${field} is a list of names`)
    assert.equal(node.meta.volatile, true, `${field} must carry its own volatile flag, not just an inner node`)
    assert.equal(refs[node.inner].type, 'string')
  }
})

test('apply() reads the live process environment, logs names only, and unloads cleanly', () => {
  const shell = fakeShell()
  const messages = []
  const effects = []
  const ctx = {
    shell,
    logger: {
      info: message => messages.push(message),
      warn: message => messages.push(message),
    },
    effect: execute => {
      effects.push(execute())
      return () => {}
    },
  }
  const name = 'DSH_BASH_TOOL_ENV_TEST_TOKEN'
  const value = 'do-not-log-this-value'
  process.env[name] = value
  try {
    apply(ctx, { include: { get: () => [name] }, exclude: { get: () => [] } })
  } finally {
    delete process.env[name]
  }

  assert.deepEqual(shell.resolve({ command: 'true' }).env, { [name]: value })
  assert.equal(effects.length, 1, 'the wrapper is registered as one disposable effect')

  const logged = messages.join('\n')
  assert.match(logged, new RegExp(name))
  assert.doesNotMatch(logged, new RegExp(value), 'names are logged, never values')
})
