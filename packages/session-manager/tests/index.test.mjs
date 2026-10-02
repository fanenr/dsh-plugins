import { strict as assert } from 'node:assert'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

// Tests run against the built artifact so they exercise the shipped module.
const {
  descendantsOf,
  deleteSession,
  dshHomeRoot,
  findLogDir,
  groupRowsByProject,
  logDirName,
  previewOf,
  setArchived,
} = await import('../lib/index.js')

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

/** Minimal SessionRecord for the corpus fake (header.createdAt is required by the harness). */
function record(id, parent, origin) {
  return { header: { id, createdAt: 1, ...(parent === undefined ? {} : { parentSession: parent }), ...(origin === undefined ? {} : { origin }) }, live: false, persisted: true }
}

/** In-memory log dir fake: `dirs` are full directory paths. */
function makeLogs(dirs = []) {
  const present = new Set(dirs)
  const removed = []
  // The corpus and the log directory spell an id the same way; the bare uuid is
  // accepted too so a test can name either.
  const bare = id => String(id).replace(/^session-/, '')
  return {
    present,
    removed,
    findDir(id) {
      for (const dir of present) {
        if (bare(dir.split('/').pop()) === bare(id)) return dir
      }
      return null
    },
    removeDir(dir) {
      if (!present.delete(dir)) throw new Error(`missing dir ${dir}`)
      removed.push(dir)
    },
    exists: dir => present.has(dir),
  }
}

/** The `logs` facade a DeleteHost takes. */
const logsFace = logs => ({
  findDir: logs.findDir.bind(logs),
  removeDir: logs.removeDir.bind(logs),
  exists: logs.exists.bind(logs),
})

/** In-memory table fake. */
function makeTable(rows = {}) {
  const map = new Map(Object.entries(rows))
  return {
    get: key => map.get(key),
    put: (key, value) => { map.set(key, value) },
    delete: async (key) => { const had = map.has(key); map.delete(key); return had },
    entries: () => map.entries(),
    map,
  }
}

/**
 * Build a fake workspace registry: `workspaces` is `{ id: sessionIds }`,
 * `archived` / `pinned` the registry-global sets.
 */
function makeRegistry(workspaces = {}, archived = [], pinned = []) {
  const archivedSet = new Set(archived)
  const pinnedSet = new Set(pinned)
  const entities = Object.entries(workspaces).map(([id, sessionIds]) => ({
    id,
    sessionIds: [...sessionIds],
    async detachSession(sessionId) {
      this.sessionIds = this.sessionIds.filter(existing => String(existing) !== String(sessionId))
    },
  }))
  return {
    entities,
    archivedSet,
    pinnedSet,
    get archivedSessionIds() { return [...archivedSet] },
    get pinnedSessionIds() { return [...pinnedSet] },
    list: () => entities,
    async unarchiveSession(sessionId) { archivedSet.delete(sessionId) },
    async unpinSession(sessionId) { pinnedSet.delete(sessionId) },
  }
}

test('dshHomeRoot resolves through the harness resolver the boot half publishes', () => {
  const ctx = { get: name => (name === 'dshHomePath' ? (...segments) => ['/custom/home', ...segments].join('/') : undefined) }
  assert.equal(dshHomeRoot(ctx, 'sessions'), '/custom/home/sessions')
})

test('dshHomeRoot falls back to $DSH_HOME when the host publishes no resolver', () => {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = '/from-env'
  try {
    assert.equal(dshHomeRoot({ get: () => undefined }, 'sessions'), '/from-env/sessions')
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})

test('logDirName encodes exactly what the persistence backend writes', () => {
  assert.equal(logDirName(SESSION_ID), SESSION_ID)
  // Custom ids are legitimate session ids; unsafe code units take the
  // backend's `~XXXX` escape instead of being rejected.
  assert.equal(logDirName('webhook-3f2b'), 'webhook-3f2b')
  assert.equal(logDirName('agent/one'), 'agent~002Fone')
  assert.equal(logDirName('..'), '~002E~002E')
})

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

test('deleteSession refuses an id that could name a sibling of the session directory', async () => {
  const host = { logs: logsFace(makeLogs()) }
  for (const id of ['', '.', '..', 'session.lock', 'x'.repeat(201)]) {
    await assert.rejects(() => deleteSession(host, id), /invalid session id/)
  }
})

test('deleteSession removes log, cache and workspace rows', async () => {
  const logs = makeLogs([`/root/bucket-a/session-${SESSION_ID}`])
  const cache = makeTable({ [`session-${SESSION_ID}`]: { identity: {} } })
  const registry = makeRegistry(
    { w1: [`session-${SESSION_ID}`, 'other'] },
    [`session-${SESSION_ID}`],
  )
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(`session-${SESSION_ID}`)] },
    storageDomain: { get: name => name === 'session_projcache' ? { table: () => cache } : undefined },
    workspaceRegistry: registry,
  }
  const outcomes = await deleteSession(host, `session-${SESSION_ID}`)
  assert.deepStrictEqual(outcomes, [{ sessionId: `session-${SESSION_ID}` }])
  assert.strictEqual(cache.map.size, 0)
  assert.deepStrictEqual(registry.entities[0].sessionIds, ['other'])
  assert.deepStrictEqual([...registry.archivedSet], [])
  assert.strictEqual(logs.removed.length, 1)
})

test('deleteSession needs no accounting to delete a session nothing else knows about', async () => {
  const logs = makeLogs([`/root/bucket-a/session-${SESSION_ID}`])
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(`session-${SESSION_ID}`)] },
  }
  const outcomes = await deleteSession(host, `session-${SESSION_ID}`)
  assert.deepStrictEqual(outcomes, [{ sessionId: `session-${SESSION_ID}` }])
  assert.strictEqual(logs.removed.length, 1)
})

test('deleteSession drops a dangling archive entry for a session with no membership', async () => {
  // An archived session keeps its accounting slot only while the id is still
  // indexed; a dangling archive entry must still go.
  const logs = makeLogs([`/root/bucket-a/session-${OTHER_ID}`])
  const registry = makeRegistry({}, [`session-${OTHER_ID}`])
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(`session-${OTHER_ID}`)] },
    workspaceRegistry: registry,
  }
  await deleteSession(host, `session-${OTHER_ID}`)
  assert.deepStrictEqual([...registry.archivedSet], [])
})

test('deleteSession drops the pin of a deleted session', async () => {
  // The registry never prunes its pin set on its own, and the sidebar keeps a
  // pin slot for every pinned id, so a deleted pin would leave a ghost row.
  const logs = makeLogs([`/root/bucket-a/session-${OTHER_ID}`])
  const registry = makeRegistry({}, [], [`session-${OTHER_ID}`, 'session-keep'])
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(`session-${OTHER_ID}`)] },
    workspaceRegistry: registry,
  }
  await deleteSession(host, `session-${OTHER_ID}`)
  assert.deepStrictEqual([...registry.pinnedSet], ['session-keep'])
})

test('deleteSession refuses an invalid id before touching anything', async () => {
  const logs = makeLogs([`/root/bucket-a/session-${SESSION_ID}`])
  const host = { logs: logsFace(logs) }
  await assert.rejects(() => deleteSession(host, '..'), /invalid session id/)
  assert.strictEqual(logs.removed.length, 0)
})

test('deleteSession deletes a custom (non-uuid) session id', async () => {
  // Webhook and configured-agent sessions carry ids like `webhook-<uuid>` or
  // `<agent>-session-<uuid>` and are listed by the manager like any other.
  const id = 'webhook-2f1c9d4e'
  const logs = makeLogs([`/root/bucket-a/${id}`])
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(id)] },
  }
  const [outcome] = await deleteSession(host, id)
  assert.strictEqual(outcome.sessionId, id)
  assert.strictEqual(logs.removed.length, 1)
})

test('deleteSession fails before accounting when the log directory is missing', async () => {
  const cache = makeTable({ [`session-${OTHER_ID}`]: { identity: {} } })
  const host = {
    logs: logsFace(makeLogs()),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(`session-${OTHER_ID}`)] },
    storageDomain: { get: name => name === 'session_projcache' ? { table: () => cache } : undefined },
  }
  await assert.rejects(
    () => deleteSession(host, `session-${OTHER_ID}`),
    /refusing a half-delete/,
  )
  // Cache row must survive the aborted delete.
  assert.strictEqual(cache.map.size, 1)
})

test('deleteSession refuses a session that is live in the host, before any removal', async () => {
  const id = '33333333-3333-4333-8333-333333333333'
  const logs = makeLogs([`/root/session-${id}`])
  const cache = makeTable({})
  const host = {
    logs: logsFace(logs),
    sessions: { get: key => key === id ? {} : undefined },
    sessionQuery: { listSessions: async () => [record(id)] },
    storageDomain: { get: name => name === 'session_projcache' ? { table: () => cache } : undefined },
  }
  await assert.rejects(
    () => deleteSession(host, id),
    // The refusal must name the only thing that works — restarting the host.
    // No RPC, button, or setting can stop a live session.
    /is live in this host .*restart dsh web/,
  )
  // Nothing was touched: log dir and cache rows must survive the refusal.
  assert.strictEqual(logs.removed.length, 0)
  assert.strictEqual(cache.map.size, 0)
})

test('deleteSession distinguishes a running session from an idle-but-live one', async () => {
  const id = '33333333-3333-4333-8333-333333333333'
  const make = agents => ({
    logs: logsFace(makeLogs([`/root/session-${id}`])),
    sessions: { get: key => (key === id ? {} : undefined) },
    agents,
    sessionQuery: { listSessions: async () => [record(id)] },
  })
  // Running: a turn is executing, and restarting is what aborts it.
  await assert.rejects(
    () => deleteSession(make({ get: () => ({ status: 'running' }) }), id),
    /is running; restarting dsh web aborts that turn/,
  )
  // Idle: live all the same (the host never evicts), so restart is still the move.
  await assert.rejects(
    () => deleteSession(make({ get: () => ({ status: 'idle' }) }), id),
    /is live in this host/,
  )
})

test('deleteSession refuses when a descendant subagent is live in the host', async () => {
  const logs = makeLogs([
    '/root/session-44444444-4444-4444-8444-444444444444',
    '/root/session-55555555-5555-4555-8555-555555555555',
  ])
  const host = {
    logs: logsFace(logs),
    sessions: { get: id => id === '55555555-5555-4555-8555-555555555555' ? {} : undefined },
    sessionQuery: { listSessions: async () => [
      record('44444444-4444-4444-8444-444444444444'),
      record('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', 'subagent'),
    ] },
  }
  await assert.rejects(
    () => deleteSession(host, '44444444-4444-4444-8444-444444444444'),
    /session "44444444-4444-4444-8444-444444444444" has a subagent that is still live in this host/,
  )
  assert.strictEqual(logs.removed.length, 0)
})

test('deleteSession claims the write lease across the whole family and releases it', async () => {
  const root = '88888888-8888-4888-8888-888888888888'
  const child = '99999999-9999-4999-8999-999999999999'
  const logs = makeLogs([`/root/session-${root}`, `/root/session-${child}`])
  const claimed = []
  const released = []
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(root), record(child, root, 'subagent')] },
    writeLease: {
      claim: async (id) => { claimed.push(id); return async () => { released.push(id) } },
    },
  }
  const outcomes = await deleteSession(host, root)
  assert.deepStrictEqual(claimed, [root, child], 'every family id must be claimed before removal')
  assert.deepStrictEqual(released, [root, child], 'every claim must be released')
  assert.strictEqual(outcomes.length, 2)
  assert.strictEqual(logs.removed.length, 2)
})

test('deleteSession aborts before removal when another process holds the lease', async () => {
  const id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  const logs = makeLogs([`/root/session-${id}`])
  const released = []
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(id)] },
    writeLease: {
      // The harness's own wording for a taken write handle. The in-process
      // store is empty, so only this claim can catch a sibling process.
      claim: async () => {
        const error = new Error('session is already owned by an active write handle')
        error.name = 'SessionAlreadyOwnedError'
        throw error
      },
    },
  }
  await assert.rejects(
    () => deleteSession(host, id),
    /is being written by another dsh process/,
  )
  assert.strictEqual(logs.removed.length, 0, 'nothing may be removed once the lease is refused')
  assert.deepStrictEqual(released, [])
})

test('deleteSession still deletes when the log is corrupt (non-ownership claim failure)', async () => {
  // A corrupt log is exactly what a user needs to delete. The backend takes
  // the kernel lock before it parses the artifact, so a corruption failure
  // also proves no other process holds it: the walk must proceed without a
  // lease rather than refusing on the backend's parse error.
  const id = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee'
  const logs = makeLogs([`/root/session-${id}`])
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(id)] },
    writeLease: {
      claim: async () => {
        const error = new Error(`stored session "${id}" is corrupt`)
        error.name = 'SessionPersistenceCorruptionError'
        throw error
      },
    },
  }
  const outcomes = await deleteSession(host, id)
  assert.strictEqual(outcomes.length, 1)
  assert.strictEqual(logs.removed.length, 1, 'a corrupt session must remain deletable')
})

test('deleteSession unwinds earlier claims when a later family member is leased elsewhere', async () => {
  const root = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'
  const child = 'cccccccc-1111-4111-8111-cccccccccccc'
  const logs = makeLogs([`/root/session-${root}`, `/root/session-${child}`])
  const released = []
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(root), record(child, root, 'subagent')] },
    writeLease: {
      claim: async (id) => {
        if (id === child) { const e = new Error('already owned'); e.name = 'SessionAlreadyOwnedError'; throw e }
        return async () => { released.push(id) }
      },
    },
  }
  await assert.rejects(() => deleteSession(host, root), /has a subagent being written by another dsh process/)
  assert.deepStrictEqual(released, [root], 'the root claim must be released when the child refuses')
  assert.strictEqual(logs.removed.length, 0)
})

test('deleteSession proceeds when a claim reports the log is already absent', async () => {
  // The real backend raises not-found from open(); deleteOne owns that
  // refusal, so the claim step must not pre-empt it with a confusing lease error.
  const id = 'dddddddd-1111-4111-8111-dddddddddddd'
  const host = {
    logs: logsFace(makeLogs()),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(id)] },
    writeLease: {
      claim: async () => {
        const error = new Error(`session "${id}" not found`)
        error.name = 'SessionPersistenceNotFoundError'
        throw error
      },
    },
  }
  await assert.rejects(() => deleteSession(host, id), /has no log directory; refusing a half-delete/)
})

test('deleteSession asks the work owners to stop before the files go', async () => {
  const id = 'abababab-1111-4111-8111-abababababab'
  const logs = makeLogs([`/root/session-${id}`])
  const stopped = []
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(id)] },
    stopActivity: {
      request: async (sessionId) => {
        // The order matters: reminders must be cancelled while the session is
        // still deletable, and the fan-out must precede removal.
        assert.strictEqual(logs.removed.length, 0, 'stop must precede removal')
        stopped.push(sessionId)
      },
    },
  }
  await deleteSession(host, id)
  assert.deepStrictEqual(stopped, [id])
})

test('deleteSession deletes anyway when a work owner refuses to stop', async () => {
  const id = 'acacacac-1111-4111-8111-acacacacacac'
  const logs = makeLogs([`/root/session-${id}`])
  const host = {
    logs: logsFace(logs),
    sessions: { get: () => undefined },
    sessionQuery: { listSessions: async () => [record(id)] },
    stopActivity: { request: async () => { throw new Error('provider exploded') } },
  }
  const outcomes = await deleteSession(host, id)
  assert.deepStrictEqual(outcomes, [{ sessionId: id }])
  assert.strictEqual(logs.removed.length, 1)
})

test('findLogDir matches the backend directory name in any bucket', () => {
  const logs = {
    buckets: () => ['/root/bucket-a', '/root/bucket-b'],
    exists: path => path === `/root/bucket-b/session-${OTHER_ID}`,
    rm: () => {},
  }
  assert.strictEqual(findLogDir(logs, `session-${OTHER_ID}`), `/root/bucket-b/session-${OTHER_ID}`)
})

test('findLogDir returns null when nothing matches', () => {
  const logs = {
    buckets: () => ['/root/bucket-a'],
    exists: () => false,
    rm: () => {},
  }
  assert.strictEqual(findLogDir(logs, SESSION_ID), null)
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

test('previewOf keeps the NEWEST turns when the budget cannot hold them all', () => {
  // A preview answers "what did we just talk about", so the tail is what
  // survives; the oldest turns are the ones dropped.
  const um = (text) => ({ type: 'user/message', data: { content: [{ type: 'text', text }], source: { kind: 'user', rpcId: 'r' } } })
  const am = (text) => ({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } })
  const events = []
  for (let turn = 1; turn <= 6; turn++) {
    events.push(um(`q${turn}`), am(`a${turn}`), { type: 'turn/end', data: { turn } })
  }
  const result = previewOf(events, 5)
  assert.deepStrictEqual(result.messages, [
    { role: 'user', text: 'q5' },
    { role: 'assistant', text: 'a5' },
    { role: 'user', text: 'q6' },
    { role: 'assistant', text: 'a6' },
  ], 'the newest whole turns win the budget')
})

test('previewOf never splits a turn at the budget edge', () => {
  const um = (text) => ({ type: 'user/message', data: { content: [{ type: 'text', text }], source: { kind: 'user', rpcId: 'r' } } })
  const am = (text) => ({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } })
  const events = [
    um('q1'), am('a1'), { type: 'turn/end', data: { turn: 1 } },
    um('q2'), am('a2'), { type: 'turn/end', data: { turn: 2 } },
  ]
  // Three slots cannot hold two two-message turns: the newest whole turn wins
  // the budget, and the older one is dropped rather than split in half.
  const odd = previewOf(events, 3)
  assert.deepStrictEqual(odd.messages, [
    { role: 'user', text: 'q2' },
    { role: 'assistant', text: 'a2' },
  ])
  const single = previewOf(events, 1)
  assert.deepStrictEqual(single.messages, [], 'a lone slot fits no whole turn')
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

/**
 * Build the ctx a Host route mount needs, with `list`-endpoint data fakes.
 * `services` supplies the host faces the list projection reads.
 */
function routeCtx(services = {}) {
  const registered = []
  const connection = { fetch: { register: route => { registered.push(route); return async () => {} } } }
  const ctx = {
    // The route mounts through `ctx.inject(['connection'], ...)`; the injected
    // context must resolve `connection` exactly as the host's does.
    inject: (_services, cb) => cb({
      get: name => (name === 'connection' ? connection : undefined),
      effect: fn => { fn(); return () => {} },
    }),
    get: name => {
      if (name === 'connection') return connection
      return services[name]
    },
    effect: fn => { fn(); return () => {} },
    emit: () => {},
    parallel: async () => {},
  }
  return { ctx, registered }
}

/** Call one endpoint through the registered route and return its envelope. */
async function callRoute(route, endpoint, payload = {}) {
  const response = await route.fetch(new Request('http://x/api/session-manager', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint, payload }),
  }))
  return response.json()
}

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

  const { ctx, registered } = routeCtx()
  const { apply } = await import('../lib/index.js')
  apply(ctx)

  assert.equal(registered.length, 1, 'the Host half must register exactly one route')
  assert.equal(registered[0].path, '/api/session-manager')
  assert.deepEqual([...registered[0].methods], ['POST'])
  assert.equal(registered[0].requestBody, 'buffered')

  // The route answers the same { ok, value } / { ok, error } envelope the callers prove.
  const bad = await callRoute(registered[0], 'nope')
  assert.deepEqual(bad, {
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
 * Drive the `list` endpoint over one live session and a chosen
 * `sessionListMetadata` projection result. `stateOf` may be absent, may
 * return a value, or may throw — every case must degrade to a decision, never
 * a failed listing.
 */
async function listRows({ stateOf, running = false }) {
  const id = '77777777-7777-4777-8777-777777777777'
  const { ctx, registered } = routeCtx({
    sessionQuery: { listSessions: async () => [record(id)] },
    sessions: { get: key => (key === id ? { id } : undefined) },
    agents: { get: () => ({ status: running ? 'running' : 'idle' }) },
    sessionProjections: stateOf === undefined ? undefined : { stateOf },
  })
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  const body = await callRoute(registered[0], 'list')
  assert.equal(body.ok, true, 'the list endpoint must not fail')
  return body.value.rows
}

test('list hides a blank live draft read from the sessionListMetadata projection', async () => {
  // The harness folds `blank` over the FULL log, so this is the supported
  // signal; the manager must not recompute it from raw events.
  const rows = await listRows({ stateOf: () => ({ blank: true, lastPromptAt: null }) })
  assert.deepStrictEqual(rows.map(row => row.sessionId), [], 'a blank draft must be hidden')
})

test('list keeps a live session whose projection reports blank: false', async () => {
  const rows = await listRows({ stateOf: () => ({ blank: false, lastPromptAt: 1 }) })
  assert.deepStrictEqual(rows.map(row => row.sessionId), ['77777777-7777-4777-8777-777777777777'])
})

test('list degrades to visible when the projection service is absent', async () => {
  const rows = await listRows({ stateOf: undefined })
  assert.deepStrictEqual(rows.map(row => row.sessionId), ['77777777-7777-4777-8777-777777777777'], 'a missing projection must never hide a real conversation')
})

test('list degrades to visible when the projection read throws or is malformed', async () => {
  const throwing = await listRows({ stateOf: () => { throw new Error('cannot prepare session') } })
  assert.deepStrictEqual(throwing.map(row => row.sessionId), ['77777777-7777-4777-8777-777777777777'])
  const malformed = await listRows({ stateOf: () => 'not-an-object' })
  assert.deepStrictEqual(malformed.map(row => row.sessionId), ['77777777-7777-4777-8777-777777777777'])
})

test('list keeps a running session even when the projection reports blank', async () => {
  const rows = await listRows({ stateOf: () => ({ blank: true }), running: true })
  assert.deepStrictEqual(rows.map(row => row.sessionId), ['77777777-7777-4777-8777-777777777777'])
})

test('list dates a live session from the live fold, not the write-behind cache', async () => {
  const live = 5_000
  const stale = 1_000
  const { ctx, registered } = routeCtx({
    sessionQuery: { listSessions: async () => [record('77777777-7777-4777-8777-777777777777')] },
    sessions: { get: () => ({ id: '77777777-7777-4777-8777-777777777777' }) },
    sessionProjections: { stateOf: () => ({ blank: false, lastPromptAt: live }) },
    storageDomain: {
      get: () => ({ table: () => makeTable({ '77777777-7777-4777-8777-777777777777': { rows: { sessionListMetadata: { val: { blank: false, lastPromptAt: stale } } } } }) }),
    },
  })
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  const body = await callRoute(registered[0], 'list')
  assert.equal(body.value.rows[0].lastActivity, live, 'a live row must use the live fold')
})

test('list falls back to the cache row when a live fold reports no prompt time', async () => {
  const stale = 1_000
  const { ctx, registered } = routeCtx({
    sessionQuery: { listSessions: async () => [record('77777777-7777-4777-8777-777777777777')] },
    sessions: { get: () => ({ id: '77777777-7777-4777-8777-777777777777' }) },
    sessionProjections: { stateOf: () => ({ blank: false, lastPromptAt: null }) },
    storageDomain: {
      get: () => ({ table: () => makeTable({ '77777777-7777-4777-8777-777777777777': { rows: { sessionListMetadata: { val: { blank: false, lastPromptAt: stale } } } } }) }),
    },
  })
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  const body = await callRoute(registered[0], 'list')
  assert.equal(body.value.rows[0].lastActivity, stale)
})

test('list keeps forks and hides subagents', async () => {
  const fork = record('fork-1', 'parent-1')
  const subagent = record('sub-1', 'fork-1', 'subagent')
  const top = record('top-1')
  const { ctx, registered } = routeCtx({
    sessionQuery: { listSessions: async () => [top, fork, subagent] },
  })
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  const body = await callRoute(registered[0], 'list')
  assert.deepStrictEqual(body.value.rows.map(row => row.sessionId).sort(), ['fork-1', 'top-1'])
  assert.equal(body.value.archiveAvailable, false)
})

test('the list endpoint serves a fork and hides a subagent, with live activity', async () => {
  const fork = '14141414-1111-4111-8111-141414141414'
  const sub = '15151515-1111-4111-8111-151515151515'
  const top = '16161616-1111-4111-8111-161616161616'
  const { ctx, registered } = routeCtx({
    sessionQuery: { listSessions: async () => [record(top), record(fork, top), record(sub, fork, 'subagent')] },
    sessions: { get: key => (key === fork ? { id: fork } : undefined) },
    sessionProjections: { stateOf: () => ({ blank: false, lastPromptAt: 4_242 }) },
    agents: { get: () => undefined },
  })
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  const body = await callRoute(registered[0], 'list')
  assert.deepStrictEqual(body.value.rows.map(row => row.sessionId).sort(), [fork, top].sort())
  assert.equal(body.value.rows.find(row => row.sessionId === fork).lastActivity, 4_242)
  assert.equal(body.value.archiveAvailable, false)
})

test('the delete endpoint stops each family member, removes the logs and reports the ids', async () => {
  const root = `session-12121212-1111-4111-8111-121212121212`
  const child = `session-13131313-1111-4111-8111-131313131313`
  const sessionsRoot = await mkdtemp(join(tmpdir(), 'dsh-session-manager-'))
  const bucket = join(sessionsRoot, '--tmp-project--')
  await mkdir(join(bucket, root), { recursive: true })
  await mkdir(join(bucket, child), { recursive: true })
  await writeFile(join(bucket, root, 'session.v4.jsonl.zstd'), 'log')
  const stopped = []
  const emitted = []
  const cache = makeTable({ [root]: { identity: {} } })
  const { ctx, registered } = routeCtx({
    sessionQuery: { listSessions: async () => [record(root), record(child, root, 'subagent')] },
    sessions: { get: () => undefined },
    dshHomePath: () => sessionsRoot,
    storageDomain: { get: () => ({ table: () => cache }) },
    workspaceRegistry: makeRegistry({ w1: [root] }, [], [root]),
  })
  ctx.emit = (event, id) => { emitted.push([event, id]) }
  ctx.parallel = async (event, payload) => { stopped.push([event, payload.sessionId]) }
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  const body = await callRoute(registered[0], 'delete', { sessionId: root })
  assert.deepStrictEqual(body.value.outcomes.map(o => o.sessionId), [root, child])
  assert.deepStrictEqual(stopped, [
    ['workspace/session-stop', root],
    ['workspace/session-stop', child],
  ])
  assert.deepStrictEqual(emitted, [
    ['api-session/removed', root],
    ['api-session/removed', child],
  ])
  assert.equal(cache.map.size, 0)
  assert.deepStrictEqual([...ctx.get('workspaceRegistry').pinnedSet], [])
  assert.equal(existsSync(join(bucket, root)), false, 'the log directory must be gone')
  await rm(sessionsRoot, { recursive: true, force: true })
})

/** Build a ctx serving a fake workspace registry over `archived`, recording calls. */
function archiveCtx(archived = [], options = {}) {
  const calls = []
  const state = new Set(archived)
  const registry = {
    get archivedSessionIds() { return [...state] },
    async archiveSession(sessionId, opts) {
      calls.push({ op: 'archive', sessionId, options: opts })
      if (options.refuseArchive === true) throw new Error('cannot archive: the session is active (turn)')
      state.add(sessionId)
    },
    async unarchiveSession(sessionId) {
      calls.push({ op: 'unarchive', sessionId })
      state.delete(sessionId)
    },
  }
  const ctx = {
    get: name => name === 'workspaceRegistry' ? registry : undefined,
  }
  return { ctx, calls, state }
}

test('archiving goes through the registry archive API and reports the committed set', async () => {
  const { ctx, calls, state } = archiveCtx(['old-1'])

  const result = await setArchived(ctx, 'new-x', true)

  assert.deepStrictEqual(calls, [{ op: 'archive', sessionId: 'new-x', options: undefined }])
  assert.deepStrictEqual(result.archivedSessionIds, ['old-1', 'new-x'])
  assert.deepStrictEqual([...state], ['old-1', 'new-x'])
})

test('unarchiving goes through the registry unarchive API', async () => {
  const { ctx, calls } = archiveCtx(['old-1', 'old-2'])

  const result = await setArchived(ctx, 'old-1', false)

  assert.deepStrictEqual(calls, [{ op: 'unarchive', sessionId: 'old-1' }])
  assert.deepStrictEqual(result.archivedSessionIds, ['old-2'])
})

test('archiving never asks the registry to stop running work', async () => {
  // Stopping a turn is destructive and the harness only does it behind a
  // confirmation naming the running activity (the sidebar's flow). This page
  // has no such confirmation, so it must let the registry refuse instead of
  // silently cancelling the user's work.
  const { ctx, calls } = archiveCtx([])

  await setArchived(ctx, 'busy-1', true)

  assert.strictEqual(calls[0].options, undefined)
})

test('archiving surfaces a registry refusal instead of swallowing it', async () => {
  const { ctx } = archiveCtx([], { refuseArchive: true })
  await assert.rejects(() => setArchived(ctx, 'new-x', true), /the session is active/)
})

test('archiving reports unavailable instead of writing when the registry is absent', async () => {
  const ctx = { get: () => undefined }
  await assert.rejects(() => setArchived(ctx, 'new-x', true), /no workspace registry/)
})
