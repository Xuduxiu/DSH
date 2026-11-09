/**
 * Browser-half smoke test.
 *
 * There is no browser here, so this file fakes the module loader, `document`,
 * `fetch`, and just enough of React's hook model (state slots, dependency-aware
 * effects, cleanups) to mount the component the way a renderer would. It
 * catches factory-time crashes, bad slot registrations, undefined props, and a
 * broken render tree in every branch.
 */
import assert from 'node:assert/strict'

const results = []
async function check(name, fn) {
  try {
    await fn()
    results.push(`PASS ${name}`)
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`)
  }
}

// ---------------------------------------------------------------- harness
let captured
const styleTags = []
globalThis.window = {
  __ModuleLoader__: {
    load(registration) {
      assert.equal(registration.id, '@local/dsh-saturation', 'the module id must equal the package name')
      assert.equal(typeof registration.factory, 'function')
      captured = registration
    },
  },
}
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: '' }),
  head: { appendChild: (tag) => styleTags.push(tag) },
}

const routeResponses = new Map()
const requested = []
globalThis.fetch = async (path, init) => {
  requested.push({ path, init })
  const key = path.split('?')[0]
  const body = routeResponses.get(key)
  if (body === undefined) return { ok: false, status: 404, json: async () => ({ error: 'not found' }) }
  return { ok: true, status: 200, json: async () => body }
}

/** Minimal hook model: sequential slots, dependency-aware effects, cleanups. */
const slots = []
const effectDeps = []
const cleanups = new Map()
let cursor = 0
let pending = []

const React = {
  createElement(type, props, children) {
    return { type, props: props ?? {}, children }
  },
  useState(initial) {
    const index = cursor++
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
    const set = (value) => {
      slots[index] = typeof value === 'function' ? value(slots[index]) : value
    }
    return [slots[index], set]
  },
  useRef(initial) {
    const index = cursor++
    if (!(index in slots)) slots[index] = { current: initial }
    return slots[index]
  },
  useEffect(fn, deps) {
    const index = cursor++
    const previous = effectDeps[index]
    const changed =
      previous === undefined ||
      deps === undefined ||
      previous === null ||
      deps.length !== previous.length ||
      deps.some((value, at) => !Object.is(value, previous[at]))
    if (changed) {
      effectDeps[index] = deps
      pending.push({ index, fn })
    }
  },
  useCallback(fn) {
    cursor += 1
    return fn
  },
}

await import('../plugin/client.js')

const module = captured.factory((id) => {
  assert.equal(id, 'react', `unexpected require(${id}); a third-party plugin may only require react`)
  return React
})

await check('the client module exposes inject and apply', () => {
  assert.deepEqual(module.inject, ['slots', 'locale', 'uiWorkspace'])
  assert.equal(typeof module.apply, 'function')
})

// ---------------------------------------------------------------- apply
const registered = []
let localeRegistered
const ctx = {
  effect(fn) {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  locale: {
    register(namespace, dictionaries) {
      localeRegistered = { namespace, dictionaries }
    },
  },
  uiWorkspace: {
    openSession() {},
  },
  slots: {
    inject(name, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      registered.push({ options, component })
      return () => {}
    },
  },
}

module.apply(ctx)

await check('styles are injected once under the plugin id', () => {
  assert.equal(styleTags.length, 1)
  assert.equal(styleTags[0].dataset.plugin, '@local/dsh-saturation')
  assert.match(styleTags[0].textContent, /\.dssat-dock/u)
})

await check('the locale dictionaries register zh and en', () => {
  assert.equal(localeRegistered.namespace, 'dsh-saturation')
  assert.equal(typeof localeRegistered.dictionaries.zh.title, 'string')
  assert.equal(typeof localeRegistered.dictionaries.en.title, 'string')
})

await check('one dock entry registers with a stable id and namespace', () => {
  assert.equal(registered.length, 1)
  const { options } = registered[0]
  assert.equal(options.name, 'conversation.input.dock')
  assert.equal(options.id, 'saturation')
  assert.equal(typeof options.order, 'number')
  assert.equal(options.locale, 'dsh-saturation')
})

// ---------------------------------------------------------------- rendering
const Component = registered[0].component
const t = (key, params) => {
  const template = localeRegistered.dictionaries.zh[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (_match, name) => String(params[name] ?? ''))
}

const sleep = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Flush pending effects inside one render pass. */
function flush() {
  const batch = pending
  pending = []
  for (const { index, fn } of batch) {
    const previous = cleanups.get(index)
    if (typeof previous === 'function') previous()
    const cleanup = fn()
    cleanups.set(index, typeof cleanup === 'function' ? cleanup : undefined)
  }
}

/** Render without resetting state slots. */
function rerender(props) {
  cursor = 0
  const tree = Component(props)
  flush()
  return tree
}

/** Fresh mount: clears state, runs effects, and returns the settled tree. */
async function mount(props) {
  for (const cleanup of cleanups.values()) if (typeof cleanup === 'function') cleanup()
  cleanups.clear()
  effectDeps.length = 0
  slots.length = 0
  cursor = 0
  pending = []
  Component(props)
  flush()
  await sleep()
  await sleep()
  const tree = rerender(props)
  await sleep()
  return tree
}

/** Collect every string in a render tree. */
function texts(node, out = []) {
  if (node === null || node === undefined || node === false || node === true) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out)
    return out
  }
  if (node.children !== undefined) texts(node.children, out)
  return out
}

/** Find the first element matching a predicate. */
function find(node, predicate) {
  if (node === null || node === undefined || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, predicate)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (predicate(node)) return node
  return find(node.children, predicate)
}

const baseProps = {
  sessionId: 'session-lead',
  openConversation: () => {},
  t,
}

// ---------------------------------------------------------------- scenarios
routeResponses.set('saturation/state', { sessionId: 'session-lead', program: null, routes: [], posts: [], total: 0 })
const emptyTree = await mount(baseProps)
await check('a session without a program offers the launcher', () => {
  const strings = texts(emptyTree).join(' | ')
  assert.match(strings, /饱和式科研/u)
  assert.match(strings, /开始/u)
})

const noSessionTree = await mount({ ...baseProps, sessionId: undefined })
await check('an unbound session renders nothing', () => {
  assert.equal(noSessionTree, null)
})

routeResponses.set('saturation/state', {
  sessionId: 'session-lead',
  program: { id: 'sat-1', goal: '把增量分析做到亚秒级', mode: 'saturation', createdAt: '2026-01-01T00:00:00.000Z' },
  routes: [
    { id: 'route-1', name: 'tree-sitter', approach: '增量语法树', status: 'running', progress: '', revision: 2, childId: 'child-1', live: true, running: true },
    { id: 'route-2', name: 'lsif', approach: '预索引', status: 'done', progress: '完成', revision: 3, childId: 'child-2', live: false, running: false },
  ],
  posts: [{ id: 'post-1', seq: 1, author: 'tree-sitter', kind: 'finding', to: [], body: '300ms', createdAt: '2026-01-01T00:01:00.000Z' }],
  total: 1,
})

const OPENED = []
const runningProps = { ...baseProps, openConversation: (id) => OPENED.push(id) }
const runningTree = await mount(runningProps)

await check('a running program shows its goal, counts, and route chips', () => {
  const strings = texts(runningTree).join(' | ')
  assert.match(strings, /把增量分析做到亚秒级/u)
  assert.match(strings, /2 条路线/u)
  assert.match(strings, /1 帖/u)
  assert.match(strings, /tree-sitter/u)
  assert.match(strings, /lsif/u)
})

await check('a route chip opens that route conversation', () => {
  const chip = find(runningTree, (node) => node.props?.className === 'dssat-chip')
  assert.ok(chip !== undefined)
  chip.props.onClick()
  assert.equal(OPENED.at(-1), 'child-1')
})

await check('expanding shows the forum feed and the composer', async () => {
  const toggle = find(runningTree, (node) => node.children === '展开')
  assert.ok(toggle !== undefined, 'the expand button is present')
  toggle.props.onClick()
  const tree = rerender(runningProps)
  await sleep()
  const strings = texts(tree).join(' | ')
  assert.match(strings, /300ms/u, 'the post body renders')
  assert.match(strings, /finding/u, 'the post kind renders')
  assert.ok(find(tree, (node) => node.props?.className === 'dssat-textarea') !== undefined, 'the composer renders')
})

await check('posting sends the addressed member list', async () => {
  const tree = rerender(runningProps)
  const area = find(tree, (node) => node.props?.className === 'dssat-textarea')
  assert.ok(area !== undefined, 'the composer textarea exists')
  area.props.onChange({ target: { value: '我来广播一条' } })
  const typed = rerender(runningProps)
  const toInput = find(typed, (node) => node.props?.placeholder === '全体')
  assert.ok(toInput !== undefined, 'the recipient input exists')
  toInput.props.onChange({ target: { value: 'lsif, tree-sitter' } })
  const afterTyping = rerender(runningProps)
  const send = find(afterTyping, (node) => node.children === '发布')
  assert.ok(send !== undefined, 'the post button is present')
  assert.equal(send.props.disabled, false)
  routeResponses.set('saturation/post', { post: { id: 'post-2' }, delivered: [] })
  await send.props.onClick()
  const post = requested.filter((entry) => entry.path === 'saturation/post').at(-1)
  const body = JSON.parse(post.init.body)
  assert.equal(body.body, '我来广播一条')
  assert.deepEqual(body.to, ['lsif', 'tree-sitter'])
})

await check('the launcher validates its route lines', async () => {
  routeResponses.set('saturation/state', { sessionId: 'session-lead', program: null, routes: [], posts: [], total: 0 })
  const tree = await mount(baseProps)
  const start = find(tree, (node) => node.children === '开始')
  assert.ok(start !== undefined)
  start.props.onClick()
  const form = rerender(baseProps)
  const goal = find(form, (node) => node.props?.placeholder?.startsWith('要攻克的问题') === true)
  assert.ok(goal !== undefined, 'the goal input exists')
  goal.props.onChange({ target: { value: '选一个解析器' } })
  const routes = find(form, (node) => node.props?.className === 'dssat-textarea')
  routes.props.onChange({ target: { value: 'tree-sitter: 增量树\nregex: 兜底' } })
  const ready = rerender(baseProps)
  routeResponses.set('saturation/launch', { program: { id: 'sat-2' }, routes: [], started: 2 })
  const go = find(ready, (node) => node.children === '启动')
  assert.ok(go !== undefined, 'the launch button is present')
  await go.props.onClick()
  const call = requested.filter((entry) => entry.path === 'saturation/launch').at(-1)
  const payload = JSON.parse(call.init.body)
  assert.equal(payload.goal, '选一个解析器')
  assert.deepEqual(payload.routes, [
    { name: 'tree-sitter', approach: '增量树' },
    { name: 'regex', approach: '兜底' },
  ])
})

for (const cleanup of cleanups.values()) if (typeof cleanup === 'function') cleanup()
console.log(results.join('\n'))
const failures = results.filter((line) => line.startsWith('FAIL'))
console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
process.exit(failures.length > 0 ? 1 : 0)
