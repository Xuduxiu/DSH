/**
 * Saturation Research (饱和式科研) — Web Client half.
 *
 * One dock entry under the composer: the program's routes as chips, the task
 * forum feed, a composer that broadcasts or addresses members, and a launcher
 * for starting a program without asking the model.
 *
 * The Host serves this data from its own routes; nothing here reads the
 * Session log, because the plugin keeps its state in its own sidecar.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-saturation',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const NS = 'dsh-saturation'
    const PLUGIN_ID = '@local/dsh-saturation'
    const STATE_ROUTE = 'saturation/state'
    const POST_ROUTE = 'saturation/post'
    const LAUNCH_ROUTE = 'saturation/launch'
    const POLL_MS = 4000

    // ------------------------------------------------------------------
    // Styles: one owned <style> tag, removed by the module loader on unload.
    // ------------------------------------------------------------------
    const css = `
.dssat-dock { display: flex; flex-direction: column; gap: 8px; padding: 6px 2px 2px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dssat-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dssat-title { font-weight: 600; color: var(--dsw-alias-label-primary); display: inline-flex; align-items: center; gap: 6px; }
.dssat-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-brand-primary); display: inline-block; }
.dssat-meta { color: var(--dsw-alias-label-tertiary); }
.dssat-goal { color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40ch; }
.dssat-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: var(--dsw-radius-sm, 6px); padding: 2px 8px; font: inherit; cursor: pointer; }
.dssat-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dssat-btn[disabled] { opacity: 0.5; cursor: default; }
.dssat-btn-primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dssat-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dssat-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 999px; padding: 2px 10px; cursor: pointer; color: var(--dsw-alias-label-primary); font: inherit; }
.dssat-chip:hover { border-color: var(--dsw-alias-brand-primary); }
.dssat-chip[data-status="done"] { border-color: var(--dsw-alias-state-success-primary); }
.dssat-chip[data-status="blocked"] { border-color: var(--dsw-alias-state-error-primary); }
.dssat-chip[data-status="planned"] { opacity: 0.75; }
.dssat-chipName { font-weight: 600; }
.dssat-panel { border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md, 8px); background: var(--dsw-alias-bg-layer-1); padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.dssat-feed { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
.dssat-post { border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 8px; }
.dssat-post:last-child { border-bottom: none; padding-bottom: 0; }
.dssat-postHead { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); }
.dssat-author { font-weight: 600; color: var(--dsw-alias-label-primary); }
.dssat-kind { border-radius: 999px; padding: 0 6px; border: 1px solid var(--dsw-alias-border-l1); }
.dssat-kind[data-kind="question"], .dssat-kind[data-kind="blocked"] { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
.dssat-kind[data-kind="finding"], .dssat-kind[data-kind="decision"] { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
.dssat-body { white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-secondary); margin-top: 4px; }
.dssat-empty { color: var(--dsw-alias-label-tertiary); padding: 6px 0; }
.dssat-composer { display: flex; flex-direction: column; gap: 6px; }
.dssat-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.dssat-input, .dssat-textarea, .dssat-select { width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-sm, 6px); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: 5px 8px; font: inherit; }
.dssat-textarea { resize: vertical; min-height: 54px; }
.dssat-error { color: var(--dsw-alias-state-error-primary); }
.dssat-hint { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dssat-label { min-width: 4em; color: var(--dsw-alias-label-tertiary); }
`

    if (typeof document !== 'undefined') {
      const tagId = PLUGIN_ID + '/dock.css'
      if (document.querySelector(`style[data-plugin-css="${tagId}"]`) === null) {
        const tag = document.createElement('style')
        tag.dataset.plugin = PLUGIN_ID
        tag.dataset.pluginCss = tagId
        tag.textContent = css
        document.head.appendChild(tag)
      }
    }

    // ------------------------------------------------------------------
    // Dictionaries
    // ------------------------------------------------------------------
    const zh = {
      title: '饱和式科研',
      routes: '{n} 条路线',
      posts: '{n} 帖',
      expand: '展开',
      collapse: '收起',
      start: '开始',
      cancel: '取消',
      launch: '启动',
      launching: '启动中…',
      goal: '任务目标',
      goalPlaceholder: '要攻克的问题，以及什么算有说服力的答案',
      routesLabel: '技术路线',
      routesHint: '每行一条：名称: 这条路线怎么做。名称只能用小写字母、数字、-、_、.。',
      noProgram: '把一项任务铺成多条并行技术路线，每条路线一个 agent，共用一个任务论坛。',
      emptyForum: '论坛还没有帖子。广播一条，所有路线都会收到。',
      placeholder: '写点什么：发现、问题、决策…',
      directed: '定向',
      toNone: '全体',
      send: '发布',
      sending: '发布中…',
      statusPlanned: '已计划',
      statusRunning: '进行中',
      statusBlocked: '受阻',
      statusDone: '完成',
      failed: '请求失败：{msg}',
      refresh: '刷新',
      body_routeCount: '按行填写路线，至少一条。',
    }

    const en = {
      title: 'Saturation Research',
      routes: '{n} routes',
      posts: '{n} posts',
      expand: 'Expand',
      collapse: 'Collapse',
      start: 'Start',
      cancel: 'Cancel',
      launch: 'Launch',
      launching: 'Launching…',
      goal: 'Goal',
      goalPlaceholder: 'The problem to settle, and what counts as a convincing answer',
      routesLabel: 'Technical routes',
      routesHint: 'One per line: name: how this route attacks it. Names allow lowercase letters, digits, - _ .',
      noProgram: 'Spread one task across parallel technical routes, one agent each, sharing a task forum.',
      emptyForum: 'No posts yet. Broadcast one and every route receives it.',
      placeholder: 'A finding, a question, a decision…',
      directed: 'Directed',
      toNone: 'Everyone',
      send: 'Post',
      sending: 'Posting…',
      statusPlanned: 'planned',
      statusRunning: 'running',
      statusBlocked: 'blocked',
      statusDone: 'done',
      failed: 'Request failed: {msg}',
      refresh: 'Refresh',
      body_routeCount: 'Give at least one route, one per line.',
    }

    // ------------------------------------------------------------------
    // Transport
    // ------------------------------------------------------------------
    async function requestJson(path, init) {
      const response = await fetch(path, {
        credentials: 'same-origin',
        ...init,
        headers: { accept: 'application/json', ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }), ...init?.headers },
      })
      let payload
      try {
        payload = await response.json()
      } catch {
        payload = undefined
      }
      if (!response.ok) {
        const message = payload !== undefined && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
        throw new Error(message)
      }
      return payload
    }

    /** Parse the launcher textarea into route objects. */
    function parseRoutes(text) {
      const routes = []
      for (const line of String(text).split('\n')) {
        const trimmed = line.trim()
        if (trimmed.length === 0) continue
        const match = /^([A-Za-z0-9._-]+)\s*[:：]\s*(.*)$/u.exec(trimmed)
        if (match === null) {
          throw new Error(`路线「${trimmed.slice(0, 40)}」格式不对：每行写成 名称: 做法，名称只能用字母、数字、- _ .`)
        }
        routes.push({ name: match[1].toLowerCase(), approach: match[2].length > 0 ? match[2] : match[1] })
      }
      return routes
    }

    const STATUS_KEY = {
      planned: 'statusPlanned',
      blocked: 'statusBlocked',
      done: 'statusDone',
    }

    // ------------------------------------------------------------------
    // Component
    // ------------------------------------------------------------------
    /**
     * @param props - slot framework props plus the injected open-session helper.
     */
    function SaturationDock(props) {
      const { sessionId, openConversation, t } = props
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [expanded, setExpanded] = useState(false)
      const [launching, setLaunching] = useState(false)
      const [goal, setGoal] = useState('')
      const [routesText, setRoutesText] = useState('')
      const [draft, setDraft] = useState('')
      const [directed, setDirected] = useState('')
      const mounted = useRef(true)

      const enabled = typeof sessionId === 'string' && sessionId.length > 0

      const load = useCallback(async () => {
        if (!enabled) return
        try {
          const payload = await requestJson(`${STATE_ROUTE}?sessionId=${encodeURIComponent(sessionId)}`)
          if (!mounted.current) return
          setData(payload)
          setError(null)
        } catch (failure) {
          if (!mounted.current) return
          setError(String(failure?.message ?? failure))
        }
      }, [enabled, sessionId])

      useEffect(() => {
        mounted.current = true
        return () => {
          mounted.current = false
        }
      }, [])

      useEffect(() => {
        if (!enabled) return undefined
        void load()
        const timer = setInterval(() => {
          void load()
        }, POLL_MS)
        return () => clearInterval(timer)
      }, [enabled, load])

      const program = data?.program ?? null
      const routes = data?.routes ?? []
      const posts = data?.posts ?? []
      const total = typeof data?.total === 'number' ? data.total : posts.length

      const post = useCallback(async () => {
        const body = draft.trim()
        if (body.length === 0) return
        setBusy(true)
        try {
          await requestJson(POST_ROUTE, {
            method: 'POST',
            body: JSON.stringify({
              sessionId,
              body,
              to: directed.trim().length === 0 ? [] : directed.split(/[,\s]+/u).filter(Boolean),
            }),
          })
          setDraft('')
          await load()
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }, [directed, draft, load, sessionId])

      const launch = useCallback(async () => {
        setBusy(true)
        setError(null)
        try {
          const routes = parseRoutes(routesText)
          if (routes.length === 0) throw new Error(t('body_routeCount'))
          await requestJson(LAUNCH_ROUTE, {
            method: 'POST',
            body: JSON.stringify({ sessionId, goal: goal.trim(), routes }),
          })
          setLaunching(false)
          setGoal('')
          setRoutesText('')
          setExpanded(true)
          await load()
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }, [goal, load, routesText, sessionId, t])

      if (!enabled) return null

      // Nothing configured and no probe result yet: stay invisible so the dock
      // keeps its usual look while the first state request is in flight.
      if (data === null && error === null) return null

      if (program === null) {
        // The launcher sits in every conversation that has no program yet, so it
        // is reachable from the screen a new task starts on. Once open, the form
        // stays until the user cancels or launches.
        if (!launching) {
          if (data === null) return null
          return h('div', { className: 'dssat-dock' }, [
            h('div', { className: 'dssat-head', key: 'head' }, [
              h('span', { className: 'dssat-title', key: 'title' }, [h('span', { className: 'dssat-dot', key: 'dot' }), t('title')]),
              h('span', { className: 'dssat-hint', key: 'hint' }, t('noProgram')),
              h('button', {
                key: 'start',
                type: 'button',
                className: 'dssat-btn dssat-btn-primary',
                onClick: () => setLaunching(true),
              }, t('start')),
            ]),
          ])
        }
        return h('div', { className: 'dssat-dock' }, [
          h('div', { className: 'dssat-head', key: 'head' }, [
            h('span', { className: 'dssat-title', key: 'title' }, [h('span', { className: 'dssat-dot', key: 'dot' }), t('title')]),
          ]),
          h('div', { className: 'dssat-panel', key: 'panel' }, [
            h('label', { className: 'dssat-hint', key: 'gl' }, t('goal')),
            h('input', {
              key: 'goal',
              type: 'text',
              className: 'dssat-input',
              value: goal,
              placeholder: t('goalPlaceholder'),
              onChange: (event) => setGoal(event.target.value),
            }),
            h('label', { className: 'dssat-hint', key: 'rl' }, t('routesLabel')),
            h('textarea', {
              key: 'routes',
              className: 'dssat-textarea',
              value: routesText,
              onChange: (event) => setRoutesText(event.target.value),
            }),
            h('div', { className: 'dssat-hint', key: 'rh' }, t('routesHint')),
            h('div', { className: 'dssat-row', key: 'actions' }, [
              h('button', {
                key: 'go',
                type: 'button',
                className: 'dssat-btn dssat-btn-primary',
                disabled: busy || goal.trim().length === 0 || routesText.trim().length === 0,
                onClick: () => void launch(),
              }, busy ? t('launching') : t('launch')),
              h('button', {
                key: 'cancel',
                type: 'button',
                className: 'dssat-btn',
                onClick: () => {
                  setLaunching(false)
                  setError(null)
                },
              }, t('cancel')),
            ]),
            error === null ? null : h('div', { className: 'dssat-error', key: 'err' }, t('failed', { msg: error })),
          ]),
        ])
      }

      const head = h('div', { className: 'dssat-head', key: 'head' }, [
        h('span', { className: 'dssat-title', key: 'title' }, [h('span', { className: 'dssat-dot', key: 'dot' }), t('title')]),
        h('span', { className: 'dssat-goal', key: 'goal', title: program.goal }, program.goal),
        h('span', { className: 'dssat-meta', key: 'routes' }, t('routes', { n: routes.length })),
        h('span', { className: 'dssat-meta', key: 'posts' }, t('posts', { n: total })),
        h('button', {
          key: 'toggle',
          type: 'button',
          className: 'dssat-btn',
          onClick: () => setExpanded((value) => !value),
        }, expanded ? t('collapse') : t('expand')),
      ])

      const chips = h(
        'div',
        { className: 'dssat-chips', key: 'chips' },
        routes.map((route) =>
          h(
            'button',
            {
              key: route.id,
              type: 'button',
              className: 'dssat-chip',
              'data-status': route.status,
              title: route.progress.length > 0 ? route.progress : route.approach,
              onClick: () => {
                if (typeof route.childId === 'string' && route.childId.length > 0) openConversation(route.childId)
              },
            },
            [
              h('span', { className: 'dssat-chipName', key: 'name' }, route.name),
              h('span', { className: 'dssat-meta', key: 'status' }, t(STATUS_KEY[route.status] ?? 'statusPlanned')),
            ],
          ),
        ),
      )

      if (!expanded) {
        return h('div', { className: 'dssat-dock' }, [head, chips])
      }

      const feed =
        posts.length === 0
          ? h('div', { className: 'dssat-empty', key: 'empty' }, t('emptyForum'))
          : h(
              'div',
              { className: 'dssat-feed', key: 'feed' },
              posts
                .slice()
                .reverse()
                .map((item) =>
                  h('div', { className: 'dssat-post', key: item.id }, [
                    h('div', { className: 'dssat-postHead', key: 'h' }, [
                      h('span', { className: 'dssat-author', key: 'a' }, item.author),
                      h('span', { className: 'dssat-kind', key: 'k', 'data-kind': item.kind }, item.kind),
                      h('span', { key: 'to' }, item.to.length > 0 ? `→ ${item.to.join(', ')}` : t('toNone')),
                      h('span', { key: 't' }, new Date(item.createdAt).toLocaleTimeString()),
                    ]),
                    h('div', { className: 'dssat-body', key: 'b' }, item.body),
                  ]),
                ),
            )

      const composer = h('div', { className: 'dssat-composer', key: 'composer' }, [
        h('textarea', {
          key: 'input',
          className: 'dssat-textarea',
          value: draft,
          placeholder: t('placeholder'),
          onChange: (event) => setDraft(event.target.value),
        }),
        h('div', { className: 'dssat-row', key: 'row' }, [
          h('span', { className: 'dssat-label', key: 'label' }, t('directed')),
          h('input', {
            key: 'to',
            type: 'text',
            className: 'dssat-input',
            style: { flex: '1 1 12ch', minWidth: '12ch' },
            value: directed,
            placeholder: t('toNone'),
            onChange: (event) => setDirected(event.target.value),
          }),
          h('button', {
            key: 'send',
            type: 'button',
            className: 'dssat-btn dssat-btn-primary',
            disabled: busy || draft.trim().length === 0,
            onClick: () => void post(),
          }, busy ? t('sending') : t('send')),
          h('button', { key: 'refresh', type: 'button', className: 'dssat-btn', onClick: () => void load() }, t('refresh')),
        ]),
        h('div', { className: 'dssat-hint', key: 'hint' }, t('routesHint')),
      ])

      return h('div', { className: 'dssat-dock' }, [
        head,
        chips,
        h('div', { className: 'dssat-panel', key: 'panel' }, [
          feed,
          error === null ? null : h('div', { className: 'dssat-error', key: 'err' }, t('failed', { msg: error })),
          composer,
        ]),
      ])
    }

    // ------------------------------------------------------------------
    // Plugin
    // ------------------------------------------------------------------
    return {
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'saturation: dictionaries')

        const openConversation = (sessionId) => {
          try {
            ctx.uiWorkspace.openSession(sessionId)
          } catch {
            // Navigation is best effort: a disposed or archived child session
            // must not take the whole dock down.
          }
        }

        // `conversation.input.dock` renders in the composer stack for BOTH the
        // hero (new conversation) and composer variants, which is where a mode
        // entry has to live: `conversation.composer.dock` is composer-only, so a
        // launcher registered there is invisible on the screen a new task starts
        // from. The todo and goal docks share this slot (order 0 and 10).
        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.dock',
              id: 'saturation',
              order: 20,
              locale: NS,
              inject: () => ({ openConversation }),
            },
            SaturationDock,
          ),
        )
      },
    }
  },
})
