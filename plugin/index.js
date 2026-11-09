/**
 * Saturation Research (饱和式科研) — Host half.
 *
 * Turns one Session into a saturation-research program: a goal, N technical
 * routes, one continuable child agent per route, and a task-scoped forum every
 * member can broadcast into and address specific members from.
 *
 * Storage: an append-only JSONL sidecar per lead Session under
 * `$DSH_HOME/storages/saturation/`. The Harness refuses unknown Session event
 * types on reload unless they are `ignorable: true`, and `Session.append()`
 * cannot set that marker, so this plugin keeps its own log instead of writing
 * Session events.
 *
 * Browser transport: two `webServer` routes. The Client never reads plugin
 * state out of the Session log, because none of it is there.
 */
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  EVENT,
  POST_KINDS,
  ROUTE_STATUS,
  VERSION,
  apply as applyEvent,
  emptyState,
  findRoute,
  isName,
  makePost,
  makeRoute,
  text,
  unreadPosts,
} from './lib/state.js'

/** Services this plugin cannot work without. */
export const inject = ['tools', 'agents', 'subagents', 'webServer', 'connection']

/**
 * Route limits. One route costs one continuable child, and the composed
 * `dsh-subagent` row admits 8 by default (`maxActiveSubagents`), refusing
 * rather than queueing past it — so the default cap matches that pool and a
 * deployment that raises the pool can raise this constant with it.
 */
const MAX_ROUTES = 8
/** One forum post ceiling, in characters. */
const MAX_BODY_CHARS = 8000
/** One route directive ceiling, in characters. */
const MAX_DIRECTIVE_CHARS = 2000
/** One goal ceiling, in characters. */
const MAX_GOAL_CHARS = 2000

/** Browser-relative routes; the Client fetches them without a leading slash. */
const STATE_PATH = '/saturation/state'
const POST_PATH = '/saturation/post'
const LAUNCH_PATH = '/saturation/launch'

/** Resolve the Harness home the same way the launcher does. */
function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  if (typeof process.env.DSH_PROFILE_DIR === 'string' && process.env.DSH_PROFILE_DIR.length > 0) {
    return dirname(dirname(process.env.DSH_PROFILE_DIR))
  }
  return join(homedir(), '.dsh')
}

/** Directory holding one log file per lead Session. */
function storageDir() {
  return join(dshHome(), 'storages', 'saturation')
}

/** Filesystem-safe file name for a Session identity. */
function logPathFor(sessionId) {
  const safe = String(sessionId).replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 120)
  return join(storageDir(), `${safe}.log.jsonl`)
}

/** A plugin logger when the composition provides one. */
function loggerOf(ctx) {
  try {
    const logger = ctx.logger?.('saturation')
    if (logger !== undefined) return logger
  } catch {}
  return undefined
}

/** Build a user-role message carrying a forum notice from this plugin. */
function forumMessage(post, program) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [
      {
        type: 'text',
        text:
          `[饱和式科研论坛] ${post.id} · ${post.kind} · 来自 ${post.author}` +
          (post.to.length > 0 ? ` · 定向 ${post.to.join(', ')}` : ' · 广播') +
          `\n\n${post.body}\n\n` +
          `(任务: ${program.goal}。用 forum_read 查看上下文，用 forum_post 回复；` +
          `广播给全部路线，或在 to 中指定路线名。)`,
      },
    ],
    source: { kind: 'cordis-host-runner' },
  }
}

/** Trim a list of addresses, rejecting unknown route names. */
function resolveRecipients(state, addresses) {
  const names = []
  for (const raw of addresses) {
    const name = String(raw).trim()
    if (name.length === 0) continue
    if (name === 'lead') {
      names.push('lead')
      continue
    }
    const route = findRoute(state, name)
    if (route === undefined) throw new Error(`unknown forum member "${name}"; members are: lead, ${state.routes.map((r) => r.agentName).join(', ')}`)
    if (!names.includes(route.agentName)) names.push(route.agentName)
  }
  return names
}

/** The system brief handed to one route agent when it starts. */
function routeBrief(program, route, routes) {
  const roster = routes.map((candidate) => `- ${candidate.agentName}: ${candidate.approach}`).join('\n')
  return [
    `你是「饱和式科研」任务中的技术路线负责人。`,
    ``,
    `## 总体目标`,
    program.goal,
    ``,
    `## 你的路线：${route.name}`,
    route.approach,
    ...(route.directive.length > 0 ? ['', '## 额外要求', route.directive] : []),
    ``,
    `## 全部路线（同一个任务，并行推进）`,
    roster,
    ``,
    `## 论坛协议`,
    `任务论坛是这个团队的共享黑板，**所有路线都能看到你在上面写的内容**。`,
    `- \`forum_post\`：发帖。默认是广播（所有路线 + 主控都能收到）；在 \`to\` 中填路线名（如 ${routes.filter((r) => r.agentName !== route.agentName).map((r) => r.agentName).join(', ') || 'lead'}）可定向只通知指定路线。`,
    `- \`forum_read\`：读取你还没读过的帖子。`,
    `- \`route_update\`：更新你这条路线的工作进展与状态。`,
    ``,
    `## 工作要求`,
    `1. 先独立判断，不要为了迎合其他路线而收敛。`,
    `2. 做出可验证的结论：给出证据、命令、数据或最小复现。`,
    `3. 有实质进展、可复用的发现、或需要其他路线配合时，立刻 forum_post，不要攒到最后。`,
    `4. 发现别的路线已解决的问题时，把结论定向发给它，避免重复劳动。`,
    `5. 完成后用 route_update 把状态置为 done，并在论坛广播最终结论。`,
    ``,
    `你是 ${route.agentName}；你的工作目录与主控相同。`,
  ].join('\n')
}

/**
 * Mount the saturation service, the agent tools, and the browser routes.
 * @param ctx - plugin context with the injected services.
 */
export function apply(ctx) {
  const log = loggerOf(ctx)
  /** sessionId -> { state, chain } loaded sidecars. */
  const programs = new Map()

  /** Serialize one Session's mutations so concurrent tool calls cannot interleave. */
  async function withProgram(sessionId, operation) {
    const existing = programs.get(sessionId)
    const entry = existing ?? { state: undefined, chain: Promise.resolve(), sessionId, leadSessionId: sessionId }
    if (existing === undefined) programs.set(sessionId, entry)
    entry.sessionId = sessionId
    entry.leadSessionId = sessionId
    const run = entry.chain.then(async () => {
      if (entry.state === undefined) entry.state = await loadState(sessionId)
      return operation(entry)
    })
    entry.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /** Read one Session sidecar, folding every record. */
  async function loadState(sessionId) {
    let raw
    try {
      raw = await readFile(logPathFor(sessionId), 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyState()
      throw error
    }
    let state = emptyState()
    for (const line of raw.split('\n')) {
      if (line.trim().length === 0) continue
      let record
      try {
        record = JSON.parse(line)
      } catch {
        continue
      }
      if (record === null || typeof record !== 'object') continue
      state = applyEvent(state, { type: record.t, data: record.d })
    }
    return state
  }

  /** Append one record and fold it into memory. */
  async function commit(entry, type, data) {
    const path = logPathFor(entry.sessionId)
    const payload = JSON.stringify({ v: VERSION, t: type, d: data, at: Date.now() }) + '\n'
    await mkdir(dirname(path), { recursive: true })
    await appendFile(path, payload, 'utf8')
    entry.state = applyEvent(entry.state, { type, data })
    return entry.state
  }

  /** Look one Session up among the loaded programs. */
  function lookupParticipant(sessionId, agent) {
    for (const [leadSessionId, entry] of programs) {
      if (entry.state === undefined) continue
      if (leadSessionId === sessionId) {
        return { state: entry.state, leadSessionId, member: 'lead', agent, isLead: true }
      }
      const route = entry.state.routes.find((candidate) => candidate.agentSessionId === sessionId)
      if (route !== undefined) {
        return { state: entry.state, leadSessionId, member: route.agentName, route, agent, isLead: false }
      }
    }
    return undefined
  }

  /**
   * Resolve which program a calling agent belongs to. A child agent that
   * outlived a Host restart is re-attached through its durable lineage: the
   * Session header names its direct parent, and that parent owns the sidecar.
   */
  async function participantOf(agent) {
    if (agent === undefined || agent === null) throw new Error('this tool requires a calling agent')
    const sessionId = agent.session.id
    const direct = lookupParticipant(sessionId, agent)
    if (direct !== undefined) return direct
    const parentSession = agent.session.header?.parentSession
    if (typeof parentSession === 'string' && parentSession.length > 0 && parentSession !== sessionId) {
      await withProgram(parentSession, async () => undefined)
      const recovered = lookupParticipant(sessionId, agent)
      if (recovered !== undefined) return recovered
    }
    throw new Error(
      'this session is not part of a saturation program; the lead runs saturation_launch first (or the user starts it from the 饱和式科研 panel)',
    )
  }

  /** The Agent instance for one route, when it is live. */
  function liveAgentOf(route) {
    if (route.childId === null) return undefined
    try {
      return ctx.agents.get(route.childId)
    } catch {
      return undefined
    }
  }

  /** Deliver one post into every addressed member's inbox. */
  async function deliver(state, leadSessionId, post) {
    const targets = post.to.length > 0 ? post.to : ['lead', ...state.routes.map((route) => route.agentName)]
    const outcomes = []
    for (const name of targets) {
      if (name === post.author) continue
      if (name === 'lead') {
        const lead = ctx.agents.get(leadSessionId)
        if (lead === undefined) {
          outcomes.push({ to: 'lead', result: 'not-live' })
          continue
        }
        outcomes.push({ to: 'lead', result: wake(lead, forumMessage(post, state.program)) })
        continue
      }
      const route = findRoute(state, name)
      const target = route === undefined ? undefined : liveAgentOf(route)
      if (target === undefined) {
        outcomes.push({ to: name, result: 'not-live' })
        continue
      }
      outcomes.push({ to: name, result: wake(target, forumMessage(post, state.program)) })
    }
    return outcomes
  }

  /**
   * Hand one message to a live agent: a running agent receives it at its next
   * step without being woken, an idle agent starts a turn for it.
   */
  function wake(agent, message) {
    try {
      if (agent.status === 'running') {
        agent.inject(message)
        return 'injected'
      }
      agent.followup(message)
      return 'woken'
    } catch (error) {
      log?.warn?.(`delivery to ${agent.id} failed: ${String(error)}`)
      return 'failed'
    }
  }

  /**
   * Append and publish one forum post, then deliver it.
   *
   * The append runs inside the Session's transaction so concurrent agents
   * cannot interleave two posts into one log record; delivery runs after the
   * commit because it only reads the committed state.
   */
  async function publish(sessionId, author, body, kind, addresses) {
    const committed = await withProgram(sessionId, async (entry) => {
      const state = entry.state
      if (state.program === null) throw new Error('no saturation program in this session yet')
      const to = resolveRecipients(state, addresses)
      const post = makePost(state.program.id, state.nextPostNumber, {
        author,
        kind: POST_KINDS.includes(kind) ? kind : 'broadcast',
        to,
        body,
        createdAt: new Date().toISOString(),
      })
      await commit(entry, EVENT.post, { version: VERSION, post })
      return { post, state: entry.state, leadSessionId: entry.leadSessionId }
    })
    const outcomes = await deliver(committed.state, committed.leadSessionId, committed.post)
    return { post: committed.post, outcomes }
  }

  /** Start one continuable child agent for a route and record its identity. */
  async function startRoute(entry, parent, route, signal) {
    const state = entry.state
    const started = await ctx.subagents.startContinuable({
      provider: 'spawn',
      label: `${route.agentName} · ${route.name}`.slice(0, 120),
      request: {
        prompt: [{ type: 'text', text: routeBrief(state.program, route, state.routes) }],
        parent,
      },
      signal,
    })
    const next = {
      ...route,
      childId: started.childId,
      agentSessionId: started.childId,
      status: 'running',
      revision: route.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    await commit(entry, EVENT.route, { version: VERSION, route: next })
    return next
  }

  /** Create the program and its routes; optionally start one agent per route. */
  async function launch(editor, { goal, routes, start }) {
    const unique = new Set()
    const prepared = routes.map((raw, index) => {
      const name = text(raw.name ?? `route-${index + 1}`, 'route name', 32).toLowerCase()
      if (!isName(name)) throw new Error(`route name "${name}" must match ${'^[a-z0-9][a-z0-9._-]{0,31}$'}`)
      if (unique.has(name)) throw new Error(`duplicate route name "${name}"`)
      if (name === 'lead') throw new Error('"lead" is reserved for the session agent')
      unique.add(name)
      return {
        name,
        approach: text(raw.approach, 'route approach', 400),
        directive: typeof raw.directive === 'string' ? raw.directive.trim().slice(0, MAX_DIRECTIVE_CHARS) : '',
      }
    })
    if (prepared.length === 0) throw new Error('a saturation program needs at least one route')
    if (prepared.length > MAX_ROUTES) {
      throw new Error(
        `at most ${MAX_ROUTES} routes per program: each route starts one continuable child agent and the composed subagent pool admits ${MAX_ROUTES}; raise maxActiveSubagents on the dsh-subagent row first`,
      )
    }

    const programId = `sat-${randomUUID().slice(0, 8)}`
    const createdAt = new Date().toISOString()

    await withProgram(editor.sessionId, async (entry) => {
      if (entry.state.program !== null) {
        throw new Error(`this session already runs saturation program "${entry.state.program.id}"; one program per session`)
      }
      await commit(entry, EVENT.program, {
        version: VERSION,
        programId,
        goal: text(goal, 'goal', MAX_GOAL_CHARS),
        mode: 'saturation',
        createdAt,
      })
      let number = 1
      for (const route of prepared) {
        await commit(entry, EVENT.route, {
          version: VERSION,
          route: makeRoute(programId, number, {
            ...route,
            updatedAt: createdAt,
          }),
        })
        number += 1
      }
    })

    const entry = programs.get(editor.sessionId)
    const started = []
    if (start !== false) {
      const lead = editor.agent
      for (const route of entry.state.routes) {
        try {
          started.push(await startRoute(entry, lead, route, editor.signal))
        } catch (error) {
          const failed = {
            ...route,
            status: 'blocked',
            progress: `启动失败: ${String(error?.message ?? error)}`.slice(0, 500),
            revision: route.revision + 1,
            updatedAt: new Date().toISOString(),
          }
          await commit(entry, EVENT.route, { version: VERSION, route: failed })
          started.push(failed)
        }
      }
    }
    return { state: entry.state, started, programId, at: createdAt }
  }

  // ---------------------------------------------------------------------
  // Browser routes
  // ---------------------------------------------------------------------

  /** Answer an untrusted or unauthenticated request; true when it was rejected. */
  function rejected(ctx, req, res) {
    let rejection
    try {
      rejection = ctx.connection.requestRejection(req)
    } catch {
      rejection = 401
    }
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  /** Send one JSON response. */
  function sendJson(res, status, payload) {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(payload))
  }

  /** Read a bounded JSON request body. */
  async function readJson(req, limit) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.byteLength
      if (size > limit) {
        req.resume()
        return undefined
      }
      chunks.push(chunk)
    }
    try {
      return JSON.parse(Buffer.concat(chunks, size).toString('utf8'))
    } catch {
      return undefined
    }
  }

  /** The live identity of one session, for the panel's open buttons. */
  function identityOf(state, leadSessionId) {
    const lead = ctx.agents.get(leadSessionId)
    return {
      leadLive: lead !== undefined,
      routes: state.routes.map((route) => {
        const live = liveAgentOf(route)
        return {
          id: route.id,
          name: route.agentName,
          approach: route.approach,
          status: route.status,
          progress: route.progress,
          revision: route.revision,
          childId: route.childId,
          live: live !== undefined,
          running: live?.status === 'running',
        }
      }),
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: STATE_PATH,
        handler: async (req, res) => {
          if (rejected(ctx, req, res)) return
          if (req.method !== 'GET') {
            res.statusCode = 405
            res.setHeader('allow', 'GET')
            res.end()
            return
          }
          const url = new URL(req.url ?? STATE_PATH, 'http://localhost')
          const sessionId = url.searchParams.get('sessionId')
          if (sessionId === null || sessionId.length === 0) {
            sendJson(res, 400, { error: 'sessionId is required' })
            return
          }
          try {
            const entry = await withProgram(sessionId, async () => undefined)
            const state = programs.get(sessionId).state
            sendJson(res, 200, {
              sessionId,
              program: state.program,
              posts: state.posts.length > 200 ? state.posts.slice(-200) : state.posts,
              total: state.posts.length,
              ...identityOf(state, sessionId),
            })
          } catch (error) {
            log?.warn?.(`state read failed: ${String(error)}`)
            sendJson(res, 500, { error: String(error?.message ?? error) })
          }
        },
      }),
    `saturation: GET ${STATE_PATH}`,
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: POST_PATH,
        handler: async (req, res) => {
          if (rejected(ctx, req, res)) return
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('allow', 'POST')
            res.end()
            return
          }
          const body = await readJson(req, 64 * 1024)
          if (body === null || typeof body !== 'object') {
            sendJson(res, 400, { error: 'a JSON body is required' })
            return
          }
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
          const content = typeof body.body === 'string' ? body.body.trim() : ''
          const to = Array.isArray(body.to) ? body.to.filter((item) => typeof item === 'string') : []
          if (sessionId.length === 0 || content.length === 0) {
            sendJson(res, 400, { error: 'sessionId and body are required' })
            return
          }
          if (content.length > MAX_BODY_CHARS) {
            sendJson(res, 413, { error: `body must be at most ${MAX_BODY_CHARS} characters` })
            return
          }
          try {
            const result = await publish(sessionId, 'user', content, 'broadcast', to)
            sendJson(res, 200, { post: result.post, delivered: result.outcomes })
          } catch (error) {
            sendJson(res, 400, { error: String(error?.message ?? error) })
          }
        },
      }),
    `saturation: POST ${POST_PATH}`,
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: LAUNCH_PATH,
        handler: async (req, res) => {
          if (rejected(ctx, req, res)) return
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('allow', 'POST')
            res.end()
            return
          }
          const body = await readJson(req, 64 * 1024)
          if (body === null || typeof body !== 'object') {
            sendJson(res, 400, { error: 'a JSON body is required' })
            return
          }
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
          const goal = typeof body.goal === 'string' ? body.goal : ''
          const routes = Array.isArray(body.routes) ? body.routes : undefined
          if (sessionId.length === 0 || goal.length === 0 || routes === undefined) {
            sendJson(res, 400, { error: 'sessionId, goal, and routes are required' })
            return
          }
          const lead = ctx.agents.get(sessionId)
          if (lead === undefined) {
            sendJson(res, 409, { error: 'this session is not live; open it before starting a program' })
            return
          }
          try {
            const controller = new AbortController()
            const result = await launch(
              { sessionId, agent: lead, signal: controller.signal },
              { goal, routes, start: body.start !== false },
            )
            const state = programs.get(sessionId).state
            sendJson(res, 200, {
              program: state.program,
              ...identityOf(state, sessionId),
              started: result.started.length,
            })
          } catch (error) {
            sendJson(res, 400, { error: String(error?.message ?? error) })
          }
        },
      }),
    `saturation: POST ${LAUNCH_PATH}`,
  )

  // ---------------------------------------------------------------------
  // Agent tools
  // ---------------------------------------------------------------------

  /** The shared text result renderer. */
  const renderText = (value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]

  ctx.tools.register({
    name: 'saturation_launch',
    description:
      'Start a saturation-research program (饱和式科研) in this session: split one research goal into N independent technical routes and start one agent per route. Each route agent works in parallel, gets its own conversation, and shares a task forum. Call it from the session agent (the lead) before any forum tool. Safe to call at most once per session.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['goal', 'routes'],
      properties: {
        goal: {
          type: 'string',
          description: 'The research goal every route attacks; state the question and the bar for a convincing answer.',
        },
        routes: {
          type: 'array',
          description: `Independent technical routes, 2-${MAX_ROUTES} recommended. Give each route a distinct angle so the routes are genuinely parallel, not three copies of one idea.`,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'approach'],
            properties: {
              name: {
                type: 'string',
                description: 'Short lowercase address used in the forum, e.g. "tree-sitter" or "regex-fallback".',
              },
              approach: {
                type: 'string',
                description: 'What this route investigates and what evidence would settle it.',
              },
              directive: {
                type: 'string',
                description: 'Optional extra constraint for this route only.',
              },
            },
          },
        },
        start: {
          type: 'boolean',
          description: 'Start one agent per route now (default true). false records the plan only.',
        },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => renderText(value),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('saturation_launch requires a calling agent')
      const result = await launch(
        { sessionId: exec.agent.session.id, agent: exec.agent, signal: exec.signal },
        { goal: args.goal, routes: args.routes, start: args.start },
      )
      const state = programs.get(exec.agent.session.id).state
      const lines = [
        `饱和式科研已启动: ${state.program.id}`,
        `目标: ${state.program.goal}`,
        `路线 ${state.routes.length} 条:`,
        ...state.routes.map(
          (route) =>
            `- ${route.agentName} (${route.status}) 会话 ${route.childId ?? '未启动'} — ${route.approach}`,
        ),
        '',
        '每个路线 agent 已收到自己的任务书和论坛协议。用 forum_post 广播进展，用 forum_read 跟进。',
      ]
      return lines.join('\n')
    },
  })

  ctx.tools.register({
    name: 'forum_post',
    description:
      'Publish one message to the shared task forum. Plain posts are broadcasts: every other route and the lead receive it. Put route names in `to` to notify only those members. Use it for findings the other routes need, questions, blockers, decisions, and the final conclusion of your route.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['body'],
      properties: {
        body: { type: 'string', description: 'The message. Keep it self-contained: what you found, the evidence, and what others should do with it.' },
        kind: {
          type: 'string',
          enum: POST_KINDS,
          description: 'broadcast (default), finding, question, answer, blocked, or decision.',
        },
        to: {
          type: 'array',
          description: 'Exact member names to address. Omit or leave empty to broadcast to everyone.',
          items: { type: 'string' },
        },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => renderText(value),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const participant = await participantOf(exec.agent)
      const result = await publish(
        participant.leadSessionId,
        participant.member,
        text(args.body, 'body', MAX_BODY_CHARS),
        args.kind ?? 'broadcast',
        args.to ?? [],
      )
      const delivered = result.outcomes.map((outcome) => `${outcome.to}:${outcome.result}`).join(', ')
      return `${result.post.id} 已发布(${result.post.kind})${result.post.to.length > 0 ? ` → ${result.post.to.join(', ')}` : ' → 全体'}。投递: ${delivered || '无其他成员'}`
    },
  })

  ctx.tools.register({
    name: 'forum_read',
    description:
      'Read the task forum posts you have not seen yet, oldest first, and advance your read cursor. Call it before answering a forum notice or when you need the current state of the other routes.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', description: 'Maximum posts to return (default 20, max 100).' },
        all: { type: 'boolean', description: 'Ignore the read cursor and return the most recent posts.' },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => renderText(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const participant = await participantOf(exec.agent)
      const limit = Number.isSafeInteger(args.limit) ? Math.min(Math.max(args.limit, 1), 100) : 20
      const state = participant.state
      const posts = args.all === true ? state.posts.slice(-limit) : unreadPosts(state, participant.member).slice(0, limit)
      if (posts.length > 0) {
        const last = posts[posts.length - 1]
        const entry = await withProgram(participant.leadSessionId, async (next) => next)
        await commit(entry, EVENT.cursor, { version: VERSION, member: participant.member, seq: last.seq })
      }
      if (posts.length === 0) return '论坛没有新帖。'
      const lines = [`论坛新帖 ${posts.length} 条(共 ${state.posts.length} 条):`, '']
      for (const post of posts) {
        lines.push(
          `${post.id} · ${post.kind} · ${post.author}${post.to.length > 0 ? ` → ${post.to.join(', ')}` : ' → 全体'} · ${post.createdAt}`,
          post.body,
          '',
        )
      }
      return lines.join('\n')
    },
  })

  ctx.tools.register({
    name: 'route_update',
    description:
      'Update the status and progress of the technical route you own. Use it when you start, hit a blocker, finish, and at meaningful milestones so the user and the other routes can see where this route stands.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ROUTE_STATUS, description: 'New route status.' },
        progress: { type: 'string', description: 'One or two sentences on the current state of this route.' },
        route: { type: 'string', description: 'Lead only: the route name to update instead of your own.' },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => renderText(value),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const participant = await participantOf(exec.agent)
      const targetName = typeof args.route === 'string' ? args.route : participant.member
      if (!participant.isLead && targetName !== participant.member) throw new Error('only the lead may update another route')
      const entry = await withProgram(participant.leadSessionId, async (next) => next)
      const route = findRoute(entry.state, targetName)
      if (route === undefined) throw new Error(`unknown route "${targetName}"`)
      const status = args.status ?? route.status
      if (!ROUTE_STATUS.includes(status)) throw new Error(`status must be one of ${ROUTE_STATUS.join(', ')}`)
      const next = {
        ...route,
        status,
        progress: typeof args.progress === 'string' ? args.progress.trim().slice(0, 2000) : route.progress,
        revision: route.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      await commit(entry, EVENT.route, { version: VERSION, route: next })
      return `${next.agentName}: ${next.status}${next.progress.length > 0 ? ` — ${next.progress}` : ''}`
    },
  })

  ctx.tools.register({
    name: 'saturation_status',
    description:
      'Summarize the saturation program: the goal, every route with its status and progress, the live conversation id of each route agent, and the newest forum posts. Use it to decide what to do next instead of re-reading the whole forum.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        posts: { type: 'integer', description: 'How many recent posts to include (default 10, max 50).' },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => renderText(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const participant = await participantOf(exec.agent)
      const count = Number.isSafeInteger(args.posts) ? Math.min(Math.max(args.posts, 0), 50) : 10
      const state = participant.state
      const lines = [
        `程序 ${state.program.id} · 目标: ${state.program.goal}`,
        `你是: ${participant.member}`,
        '',
        `路线 ${state.routes.length} 条:`,
        ...state.routes.map((route) => {
          const live = liveAgentOf(route)
          const activity = live === undefined ? '未加载' : live.status === 'running' ? '运行中' : '空闲'
          const progress = route.progress.length > 0 ? ` — ${route.progress}` : ''
          return `- ${route.agentName} [${route.status}/${activity}] ${route.childId ?? '未启动'}${progress}`
        }),
        '',
        `论坛 ${state.posts.length} 条，你还有 ${unreadPosts(state, participant.member).length} 条未读。`,
      ]
      if (count > 0 && state.posts.length > 0) {
        lines.push('', '最新帖子:')
        for (const post of state.posts.slice(-count)) {
          lines.push(`- ${post.id} · ${post.kind} · ${post.author}${post.to.length > 0 ? ` → ${post.to.join(', ')}` : ''}: ${post.body.slice(0, 160)}`)
        }
      }
      return lines.join('\n')
    },
  })

  // Warm the sidecars of every live session so `participantOf` resolves a child
  // agent that outlived a Host restart: the mapping is restored from the log.
  for (const agent of ctx.agents.list()) {
    const sessionId = agent.session.id
    void withProgram(sessionId, async () => undefined).catch(() => undefined)
  }
}
