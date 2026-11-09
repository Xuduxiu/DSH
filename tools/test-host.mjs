/**
 * Host-half integration test with fake Harness services.
 *
 * It exercises the real plugin module: tool registration, program launch,
 * forum broadcast and directed delivery, cursors, route updates, the browser
 * state route, and re-attachment after a simulated Host restart.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const home = await mkdtemp(join(tmpdir(), 'dsh-saturation-test-'))
process.env.DSH_HOME = home

const { apply } = await import('../plugin/index.js')

const SCHEMA_KEYWORDS = new Set([
  'type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'description', 'title', 'default', 'examples',
])

/** Check a tool definition against the documented supported schema subset. */
function assertSchemaSubset(node, path, seen = new Set()) {
  assert.equal(typeof node, 'object', `${path} must be an object`)
  assert.ok(!seen.has(node), `${path} must not be circular`)
  seen.add(node)
  for (const key of Object.keys(node)) {
    assert.ok(SCHEMA_KEYWORDS.has(key), `${path}.${key} is outside the supported subset`)
  }
  if (node.properties !== undefined) {
    for (const [name, child] of Object.entries(node.properties)) assertSchemaSubset(child, `${path}.${name}`, seen)
  }
  if (node.items !== undefined) assertSchemaSubset(node.items, `${path}[]`, seen)
}

/** One fake live agent. */
function makeAgent(id, header = { version: 4, id }) {
  const inbox = []
  return {
    id,
    session: { id, header },
    status: 'idle',
    injected: inbox,
    inject(message) { inbox.push({ how: 'inject', message }) },
    followup(message) { inbox.push({ how: 'followup', message }) },
  }
}

/** Build a fake plugin context and its captured registrations. */
function makeContext(agents) {
  const tools = new Map()
  const routes = []
  const spawned = []
  return {
    tools: { register(definition) { tools.set(definition.name, definition) } },
    agents: { get(id) { return agents.get(id) }, list() { return [...agents.values()] } },
    subagents: {
      async startContinuable(spec) {
        const childId = `child-${spawned.length + 1}-${Math.random().toString(36).slice(2, 8)}`
        spawned.push({ spec, childId })
        return { childId, messageId: `m-${spawned.length}` }
      },
    },
    webServer: { register(route) { routes.push(route); return () => {} } },
    connection: { requestRejection() { return undefined } },
    effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    logger() { return { warn() {}, info() {} } },
    registered: { tools, routes, spawned },
  }
}

/** Invoke one registered tool the way the runtime would. */
async function callTool(ctx, name, args, agent) {
  const definition = ctx.registered.tools.get(name)
  assert.ok(definition !== undefined, `tool ${name} is registered`)
  return definition.execute(args, { agent, signal: new AbortController().signal, callId: 'test' })
}

/** Drive one web route handler with a fake request. */
async function callRoute(ctx, path, { method = 'GET', url = path, body } = {}) {
  const route = ctx.registered.routes.find((candidate) => candidate.path === path)
  assert.ok(route !== undefined, `route ${path} is registered`)
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8')
  const req = {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      if (payload !== undefined) yield payload
    },
    resume() {},
  }
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    end(text) { this.body = text === undefined ? undefined : JSON.parse(text) },
  }
  await route.handler(req, res)
  return res
}

const results = []
async function check(name, fn) {
  try {
    await fn()
    results.push(`PASS ${name}`)
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`)
  }
}

// ---------------------------------------------------------------- round 1
const leadId = 'session-lead'
const lead = makeAgent(leadId)
const agents = new Map([[leadId, lead]])
const ctx = makeContext(agents)
apply(ctx)

await check('five tools register', () => {
  assert.deepEqual(
    [...ctx.registered.tools.keys()].sort(),
    ['forum_post', 'forum_read', 'route_update', 'saturation_launch', 'saturation_status'],
  )
})

await check('every tool schema stays inside the supported subset', () => {
  for (const [name, definition] of ctx.registered.tools) {
    assert.equal(typeof definition.description, 'string')
    assertSchemaSubset(definition.parameters, `${name}.parameters`)
    assertSchemaSubset(definition.output.schema, `${name}.output`)
    assert.equal(typeof definition.output.render, 'function')
  }
})

await check('three web routes register', () => {
  assert.deepEqual(
    ctx.registered.routes.map((route) => route.path).sort(),
    ['/saturation/launch', '/saturation/post', '/saturation/state'],
  )
})

const launched = await callTool(ctx, 'saturation_launch', {
  goal: '把仓库的增量分析做到亚秒级',
  routes: [
    { name: 'tree-sitter', approach: '用增量语法树' },
    { name: 'lsif', approach: '用 LSIF 预索引' },
    { name: 'cache', approach: '用已有 AST 缓存' },
  ],
}, lead)

await check('launch output names every route', () => {
  assert.match(launched, /tree-sitter/)
  assert.match(launched, /lsif/)
  assert.match(launched, /cache/)
})

await check('one child per route, parented on the lead', () => {
  assert.equal(ctx.registered.spawned.length, 3)
  for (const { spec } of ctx.registered.spawned) {
    assert.equal(spec.provider, 'spawn')
    assert.equal(spec.request.parent, lead)
    assert.equal(typeof spec.label, 'string')
    assert.equal(spec.request.label, undefined)
    assert.equal(spec.request.prompt[0].type, 'text')
  }
})

// Register the spawned children as live agents, as the runtime would.
const children = ctx.registered.spawned.map((spawned, index) =>
  makeAgent(spawned.childId, { version: 4, id: spawned.childId, parentSession: leadId, origin: 'subagent' }),
)
for (const [index, child] of children.entries()) {
  child.status = 'running'
  agents.set(child.id, child)
  void index
}

await check('launching twice is refused', async () => {
  await assert.rejects(
    callTool(ctx, 'saturation_launch', { goal: 'again', routes: [{ name: 'x', approach: 'y' }] }, lead),
    /already runs saturation program/u,
  )
})

const broadcast = await callTool(ctx, 'forum_post', {
  body: '我的路线已跑通，增量解析为 300ms',
  kind: 'finding',
}, children[0])

await check('a post without recipients reaches every other member', () => {
  assert.match(broadcast, /→ 全体/u)
  assert.equal(children[1].injected.length, 1)
  assert.equal(children[2].injected.length, 1)
  assert.equal(lead.injected.length, 1)
  assert.equal(children[0].injected.length, 0, 'the author is not notified twice')
  assert.equal(children[1].injected[0].how, 'inject', 'a running agent is not woken')
})

const directed = await callTool(ctx, 'forum_post', {
  body: '这个结论你那边需要吗',
  to: ['cache'],
  kind: 'question',
}, children[0])

await check('a directed post reaches only the named member', () => {
  assert.match(directed, /cache/u)
  assert.equal(children[2].injected.length, 2)
  assert.equal(children[1].injected.length, 1, 'the unnamed route receives nothing')
  assert.match(children[2].injected[1].message.content[0].text, /定向 cache/u)
})

await check('an unknown recipient is rejected', async () => {
  await assert.rejects(
    callTool(ctx, 'forum_post', { body: 'x', to: ['nope'] }, children[0]),
    /unknown forum member/u,
  )
})

const read = await callTool(ctx, 'forum_read', {}, children[1])
await check('forum_read returns unread posts of others', () => {
  assert.match(read, /post-1/u)
  assert.doesNotMatch(read, /post-2/u, 'a directed post to another member is not unread for this one')
})

const reread = await callTool(ctx, 'forum_read', {}, children[1])
await check('a second read reports no new posts', () => {
  assert.match(reread, /没有新帖/u)
})

const updated = await callTool(ctx, 'route_update', { status: 'done', progress: '300ms' }, children[0])
await check('a route agent may update its own route', () => {
  assert.match(updated, /tree-sitter: done/u)
})

await check('a route agent may not update another route', async () => {
  await assert.rejects(
    callTool(ctx, 'route_update', { status: 'done', route: 'lsif' }, children[0]),
    /only the lead may update another route/u,
  )
})

const status = await callTool(ctx, 'saturation_status', { posts: 5 }, lead)
await check('status lists routes, progress, and unread counts', () => {
  assert.match(status, /tree-sitter \[done\/运行中\]/u)
  assert.match(status, /论坛 2 条，你还有 1 条未读/u)
})

// ---------------------------------------------------------------- browser
const stateResponse = await callRoute(ctx, '/saturation/state', { url: `/saturation/state?sessionId=${leadId}` })
await check('the state route serves the program, routes, and posts', () => {
  assert.equal(stateResponse.statusCode, 200)
  assert.equal(stateResponse.body.program.id.startsWith('sat-'), true)
  assert.equal(stateResponse.body.routes.length, 3)
  assert.equal(stateResponse.body.posts.length, 2)
  assert.equal(stateResponse.body.routes[0].live, true)
  assert.equal(stateResponse.body.routes[0].running, true)
})

const posted = await callRoute(ctx, '/saturation/post', {
  method: 'POST',
  body: { sessionId: leadId, body: '人类广播一条', to: ['lsif'] },
})
await check('the human can post through the browser route', () => {
  assert.equal(posted.statusCode, 200)
  assert.equal(posted.body.post.author, 'user')
  assert.deepEqual(posted.body.post.to, ['lsif'])
  assert.equal(children[1].injected.length, 2)
})

const badState = await callRoute(ctx, '/saturation/state', { url: '/saturation/state' })
await check('the state route rejects a missing session', () => {
  assert.equal(badState.statusCode, 400)
})

await check('concurrent posts commit distinct, gapless sequence numbers', async () => {
  const bodies = ['并发 1', '并发 2', '并发 3', '并发 4', '并发 5']
  await Promise.all(
    bodies.map((body, index) => callTool(ctx, 'forum_post', { body }, children[index % children.length])),
  )
  const { readFile } = await import('node:fs/promises')
  const raw = await readFile(join(home, 'storages', 'saturation', `${leadId}.log.jsonl`), 'utf8')
  const lines = raw.split('\n').filter((line) => line.trim().length > 0)
  const records = lines.map((line) => JSON.parse(line))
  assert.equal(records.length, lines.length, 'every line is one complete JSON record')
  const posts = records.filter((record) => record.t === 'saturation/post').map((record) => record.d.post)
  assert.equal(posts.length, 8, 'three earlier posts plus five concurrent ones')
  assert.deepEqual(
    posts.map((post) => post.seq),
    [1, 2, 3, 4, 5, 6, 7, 8],
    'sequence numbers stay unique and ordered under concurrency',
  )
  assert.equal(new Set(posts.map((post) => post.id)).size, 8)
})

// ---------------------------------------------------------------- restart
// A fresh apply() has empty in-memory state: everything must come back from
// the sidecar through the child's durable lineage.
const restartedAgents = new Map([[leadId, makeAgent(leadId)]])
const restartedChild = makeAgent(children[2].id, { version: 4, id: children[2].id, parentSession: leadId, origin: 'subagent' })
restartedAgents.set(restartedChild.id, restartedChild)
const ctx2 = makeContext(restartedAgents)
apply(ctx2)

const afterRestart = await callTool(ctx2, 'forum_read', {}, restartedChild)
await check('a child re-attaches to its program after a Host restart', () => {
  assert.match(afterRestart, /论坛新帖/u)
  assert.match(afterRestart, /post-1/u)
})

const restartedStatus = await callTool(ctx2, 'saturation_status', {}, restartedChild)
await check('recovered state keeps route identity and progress', () => {
  assert.match(restartedStatus, /你是: cache/u)
  assert.match(restartedStatus, /tree-sitter \[done/u)
})

await rm(home, { recursive: true, force: true })
console.log(results.join('\n'))
const failures = results.filter((line) => line.startsWith('FAIL'))
console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
if (failures.length > 0) process.exitCode = 1
