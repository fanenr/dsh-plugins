import { strict as assert } from 'node:assert'
import test from 'node:test'

// Tests run against the built artifact so they exercise the shipped module.
const {
  descendantsOf,
  deleteSession,
  groupRowsByProject,
  idVariants,
  findLogDir,
  previewOf,
} = await import('../lib/index.js')

/** Minimal SessionRecord for the corpus fake. */
function record(id, parent, origin) {
  return { header: { id, ...(parent === undefined ? {} : { parentSession: parent }), ...(origin === undefined ? {} : { origin }) }, live: false, persisted: true }
}

/** In-memory log dir fake. */
function makeLogs(dirs) {
  const present = new Set(dirs)
  const removed = []
  return {
    present,
    removed,
    findDir(id) {
      const variants = idVariants(id)
      for (const dir of present) {
        if (variants.includes(dir.split('/').pop())) return dir
      }
      return null
    },
    removeDir(dir) {
      if (!present.delete(dir)) throw new Error(`missing dir ${dir}`)
      removed.push(dir)
    },
  }
}

/** In-memory table fake. */
function makeTable(rows) {
  const map = new Map(Object.entries(rows))
  return {
    get: key => map.get(key),
    put: (key, value) => { map.set(key, value) },
    delete: async (key) => { const had = map.has(key); map.delete(key); return had },
    entries: () => map.entries(),
    map,
  }
}

test('descendantsOf collects a root with no children', () => {
  const records = [record('a'), record('b')]
  assert.deepStrictEqual(descendantsOf(records, 'a'), ['a'])
})

test('descendantsOf walks the full subagent tree', () => {
  const records = [
    record('root'),
    record('child-1', 'root', 'subagent'),
    record('child-2', 'root', 'subagent'),
    record('grand', 'child-1', 'subagent'),
    record('unrelated'),
  ]
  const ids = descendantsOf(records, 'root')
  assert.deepStrictEqual(new Set(ids), new Set(['root', 'child-1', 'child-2', 'grand']))
})

test('descendantsOf never collects fork children (independent top-level sessions)', () => {
  const records = [
    record('root'),
    record('fork-a', 'root'),            // fork: parentSession but origin undefined
    record('fork-b', 'root'),            // fork
    record('sub', 'root', 'subagent'),   // real subagent
  ]
  const ids = descendantsOf(records, 'root')
  assert.deepStrictEqual(new Set(ids), new Set(['root', 'sub']))
})

test('deleteSession refuses an invalid id', async () => {
  const host = { logs: makeLogs([]) }
  await assert.rejects(() => deleteSession(host, 'not-a-uuid'), /invalid session id/)
})

test('deleteSession removes log, cache and workspace rows', async () => {
  const logs = makeLogs(['/root/bucket-a/session-11111111-1111-4111-8111-111111111111'])
  const cache = makeTable({
    'session-11111111-1111-4111-8111-111111111111': { identity: {} },
  })
  const workspaces = makeTable({
    w1: { sessionIds: ['11111111-1111-4111-8111-111111111111', 'other'] },
  })
  const globalState = { archivedSessionIds: ['11111111-1111-4111-8111-111111111111'] }
  const host = {
    logs: { findDir: logs.findDir.bind(logs), removeDir: logs.removeDir.bind(logs) },
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record('11111111-1111-4111-8111-111111111111')] },
    storageDomain: {
      get: name => name === 'session_projcache'
        ? { table: () => cache }
        : {
          table: () => workspaces,
          global: {
            get: () => globalState,
            set: async value => { Object.assign(globalState, value) },
          },
        },
    },
  }
  const outcomes = await deleteSession(host, '11111111-1111-4111-8111-111111111111')
  assert.deepStrictEqual(outcomes, [{
    sessionId: '11111111-1111-4111-8111-111111111111',
    logRemoved: true,
    cacheRemoved: true,
    workspaceRemoved: true,
  }])
  assert.strictEqual(cache.map.size, 0)
  assert.deepStrictEqual(workspaces.map.get('w1').sessionIds, ['other'])
  assert.deepStrictEqual(globalState.archivedSessionIds, [])
  assert.strictEqual(logs.removed.length, 1)
})

test('deleteSession fails before accounting when the log directory is missing', async () => {
  const cache = makeTable({ 'session-22222222-2222-4222-8222-222222222222': { identity: {} } })
  const host = {
    logs: makeLogs([]),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record('22222222-2222-4222-8222-222222222222')] },
    storageDomain: {
      get: name => name === 'session_projcache'
        ? { table: () => cache }
        : { table: () => makeTable({}), global: undefined },
    },
  }
  await assert.rejects(
    () => deleteSession(host, '22222222-2222-4222-8222-222222222222'),
    /refusing a half-delete/,
  )
  // Cache row must survive the aborted delete.
  assert.strictEqual(cache.map.size, 1)
})

test('deleteSession refuses a live session before any removal', async () => {
  const logs = makeLogs(['/root/session-33333333-3333-4333-8333-333333333333'])
  const cache = makeTable({})
  const host = {
    logs: { findDir: logs.findDir.bind(logs), removeDir: logs.removeDir.bind(logs) },
    sessions: { get: id => id === '33333333-3333-4333-8333-333333333333' ? {} : undefined },
    sessionQuery: { listSessions: async () => [record('33333333-3333-4333-8333-333333333333')] },
    storageDomain: { get: () => ({ table: () => cache }) },
  }
  await assert.rejects(
    () => deleteSession(host, '33333333-3333-4333-8333-333333333333'),
    /is live; stop the conversation and retry/,
  )
  // Nothing was touched: log dir and cache rows must survive the refusal.
  assert.strictEqual(logs.removed.length, 0)
  assert.strictEqual(cache.map.size, 0)
})

test('deleteSession refuses when a descendant subagent is live', async () => {
  const logs = makeLogs([
    '/root/session-44444444-4444-4444-8444-444444444444',
    '/root/session-55555555-5555-4555-8555-555555555555',
  ])
  const host = {
    logs: { findDir: logs.findDir.bind(logs), removeDir: logs.removeDir.bind(logs) },
    sessions: { get: id => id === '55555555-5555-4555-8555-555555555555' ? {} : undefined },
    sessionQuery: { listSessions: async () => [
      record('44444444-4444-4444-8444-444444444444'),
      record('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', 'subagent'),
    ] },
  }
  await assert.rejects(
    () => deleteSession(host, '44444444-4444-4444-8444-444444444444'),
    /session "44444444-4444-4444-8444-444444444444" has a live subagent; wait for its conversation to end and retry/,
  )
  assert.strictEqual(logs.removed.length, 0)
})

test('findLogDir scans buckets for both id spellings', () => {
  const logs = {
    buckets: () => ['/root/bucket-a', '/root/bucket-b'],
    exists: path => path === '/root/bucket-b/session-55555555-5555-4555-8555-555555555555',
    rm: () => {},
  }
  const found = findLogDir(logs, '55555555-5555-4555-8555-555555555555')
  assert.strictEqual(found, '/root/bucket-b/session-55555555-5555-4555-8555-555555555555')
})

test('findLogDir returns null when nothing matches', () => {
  const logs = {
    buckets: () => ['/root/bucket-a'],
    exists: () => false,
    rm: () => {},
  }
  assert.strictEqual(findLogDir(logs, '66666666-6666-4666-8666-666666666666'), null)
})

test('idVariants produces both spellings', () => {
  assert.deepStrictEqual(idVariants('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'session-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ])
  assert.deepStrictEqual(idVariants('session-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), [
    'session-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ])
})

test('groupRowsByProject groups by project and sorts alphabetically', () => {
  const row = (id, project) => ({ sessionId: id, project, title: null, lastActivity: 0, running: false, archived: false })
  const groups = groupRowsByProject([
    row('a', 'zeta'),
    row('b', 'alpha'),
    row('c', 'Alpha-2'),
    row('d', null),
    row('e', 'zeta'),
  ])
  assert.deepStrictEqual(groups.map(g => g.project), ['alpha', 'Alpha-2', 'zeta', null])
  assert.deepStrictEqual(groups[0].rows.map(r => r.sessionId), ['b'])
  assert.deepStrictEqual(groups[2].rows.map(r => r.sessionId), ['a', 'e'])
  assert.deepStrictEqual(groups[3].rows.map(r => r.sessionId), ['d'])
})

test('previewOf keeps real user text and only the final surfaced assistant answer per turn', () => {
  const um = (text, source = { kind: 'user', rpcId: 'r1' }) => ({ type: 'user/message', data: { content: [{ type: 'text', text }], source } })
  const am = (text, turn, step) => ({ type: 'assistant/message', data: { turn, step, message: { role: 'assistant', content: [{ type: 'text', text }] } } })
  const amNested = () => ({ type: 'assistant/message', data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'tool-call', id: 't1', name: 'x', arguments: '{}' }] } } })
  const end = (turn) => ({ type: 'turn/end', data: { turn } })

  const result = previewOf([
    um('hello'),
    amNested(),                        // pure tool step: no surfaced text, dropped
    am('thinking', 1, 1),              // mid-turn text: overwritten by the final answer
    am('final answer one', 1, 2),
    end(1),
    um('second question'),
    am('final answer two', 2, 1),
    end(2),
  ])
  assert.deepStrictEqual(result.messages, [
    { role: 'user', text: 'hello' },
    { role: 'assistant', text: 'final answer one' },
    { role: 'user', text: 'second question' },
    { role: 'assistant', text: 'final answer two' },
  ])
})

test('previewOf filters injected user/message sources', () => {
  const um = (text, source) => ({ type: 'user/message', data: { content: [{ type: 'text', text }], source } })
  const am = (text) => ({ type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text }] } } })

  const result = previewOf([
    um('real user prompt', { kind: 'user', rpcId: 'r1' }),
    um('plugin injected context', { kind: 'plugin', plugin: 'x', form: 'snapshot' }),
    am('answer'),
    { type: 'turn/end', data: { turn: 1 } },
  ])
  assert.deepStrictEqual(result.messages, [
    { role: 'user', text: 'real user prompt' },
    { role: 'assistant', text: 'answer' },
  ])
})

test('previewOf reads assistant text from the nested message.content', () => {
  const am = () => ({ type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'nested body' }] } } })
  const result = previewOf([
    { type: 'user/message', data: { content: [{ type: 'text', text: 'q' }], source: { kind: 'user', rpcId: 'r1' } } },
    am(),
    { type: 'turn/end', data: { turn: 1 } },
  ])
  assert.deepStrictEqual(result.messages[1], { role: 'assistant', text: 'nested body' })
})

test('previewOf surfaces a trailing user turn without an answer', () => {
  const result = previewOf([
    { type: 'user/message', data: { content: [{ type: 'text', text: 'q' }], source: { kind: 'user', rpcId: 'r1' } } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'second q' }], source: { kind: 'user', rpcId: 'r2' } } },
  ])
  assert.deepStrictEqual(result.messages, [
    { role: 'user', text: 'q' },
    { role: 'user', text: 'second q' },
  ])
})

test('previewOf filters bare {kind:user} task instructions (subagent delegation)', () => {
  const result = previewOf([
    { type: 'user/message', data: { content: [{ type: 'text', text: 'You are a map-data agent. Your task: …' }], source: { kind: 'user' } } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'real prompt' }], source: { kind: 'user', rpcId: 'r9' } } },
    { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'answer' }] } } },
    { type: 'turn/end', data: { turn: 1 } },
  ])
  assert.deepStrictEqual(result.messages, [
    { role: 'user', text: 'real prompt' },
    { role: 'assistant', text: 'answer' },
  ])
})

test('groupRowsByProject sorts unarchived first then by activity within a group', () => {
  const row = (id, project, archived, lastActivity) => ({ sessionId: id, project, title: null, lastActivity, running: false, archived })
  const groups = groupRowsByProject([
    row('old-arch', 'p', true, 300),
    row('new-arch', 'p', true, 900),
    row('mid', 'p', false, 500),
    row('newest', 'p', false, 1000),
    row('oldest', 'p', false, 100),
  ])
  const [group] = groups
  assert.deepStrictEqual(group.rows.map(r => r.sessionId), ['newest', 'mid', 'oldest', 'new-arch', 'old-arch'])
})

test('the Host route is an exact /api fetch route, not an rpc.handle channel', async () => {
  // Regression guard for the 0.1.5-alpha.1 transport break: `connection.rpc.handle()`
  // mounts its physical route through `owner.webServer.register(...)`, a strict read on
  // the connection plugin's OWN context, which stopped injecting `webServer`. The read
  // throws inside cordis's isolated effect, so the plugin activates while the channel
  // silently never mounts and every call falls through to the static fallback's 405.
  // Exact fetch routes never touch `webServer`, so the Host half must register one.
  const types = await import('../lib/shared/types.js')
  assert.equal(types.ROUTE, '/api/session-manager', 'route must live under the authenticated /api channel')
  assert.equal(types.CHANNEL, undefined, 'the broken rpc channel constant must be gone')

  const registered = []
  const connection = {
    fetch: { register: route => { registered.push(route); return async () => {} } },
    // Present to prove the Host half does NOT reach for the broken verb.
    rpc: { handle: () => { throw new Error('rpc.handle must not be used') } },
  }
  const ctx = {
    inject: (_services, cb) => cb({
      get: name => (name === 'connection' ? connection : undefined),
      effect: fn => { fn(); return () => {} },
    }),
    get: name => (name === 'connection' ? connection : undefined),
    effect: fn => { fn(); return () => {} },
    emit: () => {},
  }
  const { apply } = await import('../lib/index.js')
  apply(ctx)

  assert.equal(registered.length, 1, 'the Host half must register exactly one route')
  assert.equal(registered[0].path, '/api/session-manager')
  assert.deepEqual([...registered[0].methods], ['POST'])
  assert.equal(registered[0].requestBody, 'buffered')

  // The route answers the same { ok, value } / { ok, error } envelope the callers prove.
  const call = (body) => registered[0].fetch(new Request('http://x/api/session-manager', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  const bad = await call({ endpoint: 'nope', payload: {} })
  assert.equal(bad.status, 200)
  assert.deepEqual(await bad.json(), {
    ok: false,
    error: { code: 'dsh-session-manager/unknown-endpoint', message: 'unknown endpoint: nope', details: {} },
  })
  const malformed = await registered[0].fetch(new Request('http://x/api/session-manager', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not-json',
  }))
  assert.equal(malformed.status, 400)
  assert.equal((await malformed.json()).error.code, 'gateway/bad-request')
})

/**
 * Drive the `list` endpoint with one live session and a chosen
 * `sessionListMetadata` projection result. `stateOf` may be absent, may
 * return a value, or may throw — every case must degrade to a decision, never
 * a failed listing.
 */
async function listWithLiveSession({ stateOf, running = false }) {
  const id = '77777777-7777-4777-8777-777777777777'
  const registered = []
  const connection = { fetch: { register: route => { registered.push(route); return async () => {} } } }
  const sessionProjections = stateOf === undefined ? undefined : { stateOf }
  const ctx = {
    // The route mounts through `ctx.inject(['connection'], ...)`; the injected
    // context must resolve `connection` exactly as the host's does.
    inject: (_services, cb) => cb({
      get: name => (name === 'connection' ? connection : undefined),
      effect: fn => { fn(); return () => {} },
    }),
    get: name => {
      if (name === 'connection') return connection
      if (name === 'sessionQuery') return { listSessions: async () => [record(id)] }
      if (name === 'sessions') return { get: key => (key === id ? { id } : undefined) }
      if (name === 'agents') return { get: () => ({ status: running ? 'running' : 'idle' }) }
      if (name === 'sessionProjections') return sessionProjections
      return undefined
    },
    effect: fn => { fn(); return () => {} },
    emit: () => {},
  }
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  const response = await registered[0].fetch(new Request('http://x/api/session-manager', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: 'list', payload: {} }),
  }))
  const body = await response.json()
  assert.equal(body.ok, true, 'the list endpoint must not fail')
  return body.value.rows.map(row => row.sessionId)
}

test('list hides a blank live draft read from the sessionListMetadata projection', async () => {
  // The harness folds `blank` over the FULL log, so this is the supported
  // signal; the manager must not recompute it from raw events.
  const ids = await listWithLiveSession({ stateOf: () => ({ blank: true, lastPromptAt: null }) })
  assert.deepStrictEqual(ids, [], 'a blank draft must be hidden')
})

test('list keeps a live session whose projection reports blank: false', async () => {
  const ids = await listWithLiveSession({ stateOf: () => ({ blank: false, lastPromptAt: 1 }) })
  assert.deepStrictEqual(ids, ['77777777-7777-4777-8777-777777777777'])
})

test('list degrades to visible when the projection service is absent', async () => {
  const ids = await listWithLiveSession({ stateOf: undefined })
  assert.deepStrictEqual(ids, ['77777777-7777-4777-8777-777777777777'], 'a missing projection must never hide a real conversation')
})

test('list degrades to visible when the projection read throws or is malformed', async () => {
  const throwing = await listWithLiveSession({ stateOf: () => { throw new Error('cannot prepare session') } })
  assert.deepStrictEqual(throwing, ['77777777-7777-4777-8777-777777777777'])
  const malformed = await listWithLiveSession({ stateOf: () => 'not-an-object' })
  assert.deepStrictEqual(malformed, ['77777777-7777-4777-8777-777777777777'])
})

test('list keeps a running session even when the projection reports blank', async () => {
  const ids = await listWithLiveSession({ stateOf: () => ({ blank: true }), running: true })
  assert.deepStrictEqual(ids, ['77777777-7777-4777-8777-777777777777'])
})
