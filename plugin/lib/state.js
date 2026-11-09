/**
 * Pure saturation-program state fold.
 *
 * Everything here is dependency-free and synchronous: the Host plugin appends
 * `saturation/*` events to the Session log, and this module folds them into the
 * durable program/route/forum state plus the Client wire view.
 *
 * Design rules taken from the Harness plugin practices:
 *  - `apply` is pure and returns the SAME reference for events it ignores.
 *  - `view` returns the same reference when the rendered value is unchanged.
 *  - Stored state is plain JSON only.
 */

/** Session event types owned by this plugin. */
export const EVENT = {
  program: 'saturation/program',
  route: 'saturation/route',
  post: 'saturation/post',
  cursor: 'saturation/cursor',
}

/** Envelope version of every event this plugin writes. */
export const VERSION = 1

/** Route lifecycle states and their display order. */
export const ROUTE_STATUS = ['planned', 'running', 'blocked', 'done']

/** Post kinds an agent may publish. */
export const POST_KINDS = ['broadcast', 'finding', 'question', 'answer', 'blocked', 'decision']

/** Route names and member names share one address space. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/u

/** The name that always addresses the session's own agent. */
export const LEAD_NAME = 'lead'

/** Empty folded state for a Session that has never run a saturation program. */
export function emptyState() {
  return {
    version: VERSION,
    program: null,
    routes: [],
    posts: [],
    cursors: {},
    nextRouteNumber: 1,
    nextPostNumber: 1,
  }
}

/** Whether a string is usable as a route or member name. */
export function isName(value) {
  return typeof value === 'string' && NAME_PATTERN.test(value)
}

/** Clamp and validate one label, returning a trimmed string. */
export function text(value, field, max) {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error(`${field} must not be empty`)
  if (trimmed.length > max) throw new Error(`${field} must be at most ${max} characters`)
  return trimmed
}

/** Build the next route snapshot for one program. */
export function makeRoute(programId, number, fields) {
  return {
    id: `route-${number}`,
    programId,
    name: fields.name,
    approach: fields.approach,
    directive: fields.directive ?? '',
    agentName: fields.name,
    childId: null,
    agentSessionId: null,
    status: 'planned',
    progress: '',
    revision: 1,
    updatedAt: fields.updatedAt,
  }
}

/** Build one forum post. */
export function makePost(programId, number, fields) {
  return {
    id: `post-${number}`,
    programId,
    seq: number,
    author: fields.author,
    kind: fields.kind,
    to: [...fields.to],
    body: fields.body,
    createdAt: fields.createdAt,
  }
}

/** Replace one route snapshot, returning a new array. */
function withRoute(routes, route) {
  const index = routes.findIndex((candidate) => candidate.id === route.id)
  if (index < 0) return [...routes, route]
  const next = routes.slice()
  next[index] = route
  return next
}

/**
 * Fold one Session event into the saturation state.
 * @param state - current folded state.
 * @param event - Session event envelope; only `saturation/*` types are read.
 * @returns the next state, or the same reference when the event is irrelevant.
 */
export function apply(state, event) {
  if (state === undefined || state === null) return state
  const { type, data } = event
  if (typeof type !== 'string' || !type.startsWith('saturation/')) return state
  if (data === null || typeof data !== 'object') return state

  switch (type) {
    case EVENT.program: {
      if (data.version !== VERSION) return state
      const next = {
        ...state,
        program: {
          id: data.programId,
          goal: data.goal,
          mode: data.mode,
          createdAt: data.createdAt,
        },
      }
      return next
    }
    case EVENT.route: {
      if (data.version !== VERSION) return state
      const route = data.route
      if (route === null || typeof route !== 'object') return state
      const next = {
        ...state,
        routes: withRoute(state.routes, route),
        nextRouteNumber: Math.max(state.nextRouteNumber, numberSuffix(route.id) + 1),
      }
      return next
    }
    case EVENT.post: {
      if (data.version !== VERSION) return state
      const post = data.post
      if (post === null || typeof post !== 'object') return state
      const next = {
        ...state,
        posts: [...state.posts, post],
        nextPostNumber: Math.max(state.nextPostNumber, post.seq + 1),
      }
      return next
    }
    case EVENT.cursor: {
      if (data.version !== VERSION) return state
      if (typeof data.member !== 'string' || !Number.isSafeInteger(data.seq)) return state
      if (state.cursors[data.member] === data.seq) return state
      return { ...state, cursors: { ...state.cursors, [data.member]: data.seq } }
    }
    default:
      return state
  }
}

/** Numeric suffix of an `noun-<n>` identity, or 0 when it carries none. */
function numberSuffix(id) {
  if (typeof id !== 'string') return 0
  const match = /-(\d+)$/u.exec(id)
  if (match === null) return 0
  const value = Number(match[1])
  return Number.isSafeInteger(value) ? value : 0
}

/** Look up one route by its member address. */
export function findRoute(state, name) {
  return state.routes.find((route) => route.agentName === name || route.name === name)
}

/**
 * Posts a member has not acknowledged yet, in sequence order.
 *
 * A directed post is on the shared board, but it counts as unread only for the
 * members it addresses: an agent reading its inbox should not page through
 * traffic that was never meant for it.
 */
export function unreadPosts(state, member) {
  const cursor = state.cursors[member] ?? 0
  return state.posts.filter(
    (post) =>
      post.seq > cursor &&
      post.author !== member &&
      (post.to.length === 0 || post.to.includes(member)),
  )
}
