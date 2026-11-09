/**
 * Multiview — a real multi-pane workspace inside the main window.
 *
 * The main slot gains a `multiview` panel. The left navigation and all stock
 * slots stay intact; the single conversation surface is replaced by one to
 * three side-by-side panes. Each pane owns a retained Session reference, a
 * Chat or Trajectory view, a trajectory toggle and a close control.
 *
 * Double-click a session row to add a pane. A single click navigates the
 * focused pane. The workspace is capped at three equal-width columns and
 * scrolls horizontally when the viewport is narrower than the pane minimum.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-multiview',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const NS = 'multiview'
    const PLUGIN_ID = '@local/dsh-multiview'
    const STYLE_ID = PLUGIN_ID + '/style.css'
    const STORAGE_KEY = 'dsh.multiview.main.v1'
    const MAIN_PANEL = 'multiview'
    const MAX_PANES = 3
    const VIEW_CHAT = 'chat'
    const VIEW_TRAJECTORY = 'trajectory'

    // ------------------------------------------------------------------
    // Copy
    // ------------------------------------------------------------------
    const zh = {
      emptyTitle: '多栏工作区',
      emptyHint: '双击左侧任意会话，在当前窗口打开第二栏；单机切换当前栏。',
      openCurrent: '打开当前会话',
      closePane: '关闭此栏',
      showTrajectory: '显示轨迹',
      showChat: '显示对话',
      chat: '对话',
      trajectory: '轨迹',
      loading: '正在载入会话…',
      retainFailed: '无法载入会话：{message}',
      pane: '第 {n} 栏',
      mainTitle: '多栏工作区',
      active: '当前栏',
      noSession: '请在左侧选择或新建一个会话。',
    }
    const en = {
      emptyTitle: 'Multi-pane workspace',
      emptyHint: 'Double-click any session on the left to open another pane. A single click navigates the focused pane.',
      openCurrent: 'Open current session',
      closePane: 'Close this pane',
      showTrajectory: 'Show trajectory',
      showChat: 'Show chat',
      chat: 'Chat',
      trajectory: 'Trajectory',
      loading: 'Loading session…',
      retainFailed: 'Could not load session: {message}',
      pane: 'Pane {n}',
      mainTitle: 'Multi-pane workspace',
      active: 'Focused',
      noSession: 'Choose or create a session on the left.',
    }

    function translate(t, key, params) {
      let value
      if (typeof t === 'function') {
        try {
          value = t(key, params)
        } catch {
          value = undefined
        }
      }
      if (typeof value !== 'string' || value.length === 0 || value === key) {
        const navLang = typeof navigator === 'undefined' ? '' : navigator.language
        const lang = typeof document === 'undefined'
          ? String(navLang || '').toLowerCase()
          : String(document.documentElement.lang || navLang || '').toLowerCase()
        value = (lang.startsWith('en') ? en : zh)[key] ?? key
      }
      if (params && typeof value === 'string') {
        value = value.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match)
      }
      return value
    }

    // ------------------------------------------------------------------
    // Workspace store: panes survive an app reload
    // ------------------------------------------------------------------
    function isView(value) {
      return value === VIEW_CHAT || value === VIEW_TRAJECTORY
    }

    function validPane(value) {
      return value !== null && typeof value === 'object' &&
        typeof value.sessionId === 'string' && value.sessionId.length > 0 &&
        isView(value.view)
    }

    function readStore() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return { panes: [], focused: 0 }
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.panes)) {
          return { panes: [], focused: 0 }
        }
        const panes = parsed.panes.filter(validPane).slice(0, MAX_PANES)
        const focused = Number.isSafeInteger(parsed.focused)
          ? Math.max(0, Math.min(parsed.focused, Math.max(0, panes.length - 1)))
          : 0
        return { panes, focused }
      } catch {
        return { panes: [], focused: 0 }
      }
    }

    let snapshot = readStore()
    const listeners = new Set()

    function publish(next, persist = true) {
      snapshot = {
        panes: next.panes.slice(0, MAX_PANES),
        focused: Math.max(0, Math.min(next.focused, Math.max(0, next.panes.length - 1))),
      }
      if (persist) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
        } catch {
          // The live workspace still works without storage.
        }
      }
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch {
          // A subscriber must not break the store.
        }
      }
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }

    function getSnapshot() {
      return snapshot
    }

    function focusPane(index) {
      if (index < 0 || index >= snapshot.panes.length || snapshot.focused === index) return
      publish({ panes: snapshot.panes, focused: index })
    }

    function setPaneView(index, view) {
      if (!isView(view) || index < 0 || index >= snapshot.panes.length) return
      if (snapshot.panes[index].view === view) return
      const panes = snapshot.panes.map((pane, paneIndex) =>
        paneIndex === index ? { ...pane, view } : pane,
      )
      publish({ panes, focused: snapshot.focused })
    }

    function replaceFocused(sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return
      const existing = snapshot.panes.findIndex((pane) => pane.sessionId === sessionId)
      if (existing >= 0) {
        focusPane(existing)
        return
      }
      if (snapshot.panes.length === 0) {
        publish({ panes: [{ sessionId, view: VIEW_CHAT }], focused: 0 })
        return
      }
      const panes = snapshot.panes.map((pane, index) =>
        index === snapshot.focused ? { sessionId, view: VIEW_CHAT } : pane,
      )
      publish({ panes, focused: snapshot.focused })
    }

    function addPane(sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return
      const existing = snapshot.panes.findIndex((pane) => pane.sessionId === sessionId)
      if (existing >= 0) {
        focusPane(existing)
        return
      }
      if (snapshot.panes.length === 0) {
        publish({ panes: [{ sessionId, view: VIEW_CHAT }], focused: 0 })
        return
      }
      if (snapshot.panes.length < MAX_PANES) {
        const panes = [...snapshot.panes, { sessionId, view: VIEW_CHAT }]
        publish({ panes, focused: panes.length - 1 })
        return
      }
      // Three panes is the workspace budget. A fourth open replaces the
      // focused column, like opening a page in the current browser column.
      replaceFocused(sessionId)
    }

    function closePane(index) {
      if (snapshot.panes.length <= 1) return undefined
      if (index < 0 || index >= snapshot.panes.length) return undefined
      const panes = snapshot.panes.filter((_, paneIndex) => paneIndex !== index)
      const focused = index < snapshot.focused
        ? snapshot.focused - 1
        : Math.min(snapshot.focused, panes.length - 1)
      publish({ panes, focused })
      return panes[focused]?.sessionId
    }

    function ensureSession(sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return
      const existing = snapshot.panes.findIndex((pane) => pane.sessionId === sessionId)
      if (existing >= 0) {
        focusPane(existing)
        return
      }
      replaceFocused(sessionId)
    }

    function useWorkspace() {
      return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    }

    // ------------------------------------------------------------------
    // Session helpers
    // ------------------------------------------------------------------
    function mainSessionId(map) {
      if (map === null || typeof map !== 'object') return undefined
      return Object.values(map).find((session) => (session?.retainedBy?.mainView ?? 0) > 0)?.id
    }

    function sessionTitle(map, id) {
      const session = map?.[id]
      if (typeof session?.title === 'string' && session.title.length > 0) return session.title
      if (typeof session?.projectionValues?.title === 'string' && session.projectionValues.title.length > 0) {
        return session.projectionValues.title
      }
      return typeof id === 'string' ? id : ''
    }

    // ------------------------------------------------------------------
    // Runtime handles and row gestures
    // ------------------------------------------------------------------
    let runtimeCtx = null
    let pendingTimer = null
    let pendingSessionId = null

    function selectMultiviewPanel() {
      try {
        const layout = runtimeCtx?.get('layout')
        if (layout === undefined || layout === null) return false
        layout.selectPanel(MAIN_PANEL)
        return true
      } catch {
        return false
      }
    }

    function openSessionById(sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return
      try {
        runtimeCtx?.get('uiWorkspace')?.openSession(sessionId)
      } catch {
        // The pane still opens even if the stock selection path refuses.
      }
      selectMultiviewPanel()
    }

    function sessionRowInfo(target) {
      if (!(target instanceof Element)) return undefined
      const row = target.closest('[data-row-key^="session:"]')
      if (row === null) return undefined
      const key = row.getAttribute('data-row-key')
      if (typeof key !== 'string' || !key.startsWith('session:')) return undefined
      const sessionId = key.slice('session:'.length)
      if (sessionId.length === 0) return undefined
      return { row, sessionId }
    }

    function clearPendingClick() {
      if (pendingTimer !== null) {
        window.clearTimeout(pendingTimer)
        pendingTimer = null
      }
      pendingSessionId = null
    }

    function installSessionRowClicks() {
      const onClick = (event) => {
        if (event.defaultPrevented || event.button !== 0) return
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
        const target = event.target
        if (!(target instanceof Element)) return
        const info = sessionRowInfo(target)
        if (info === undefined) {
          clearPendingClick()
          return
        }
        if (target.closest('button, a, input, textarea, select, [role="menu"], [role="menuitem"]')) {
          clearPendingClick()
          return
        }

        // The stock row opens on single click and renames on double click.
        // This workspace owns both gestures: double adds a pane, single
        // navigates the focused pane.
        event.preventDefault()
        event.stopPropagation()

        if (event.detail >= 2) {
          clearPendingClick()
          addPane(info.sessionId)
          openSessionById(info.sessionId)
          return
        }

        clearPendingClick()
        pendingSessionId = info.sessionId
        pendingTimer = window.setTimeout(() => {
          const sessionId = pendingSessionId
          pendingSessionId = null
          pendingTimer = null
          if (sessionId !== null) openSessionById(sessionId)
        }, 300)
      }

      const onDoubleClick = (event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        if (target.closest('button, a, input, textarea, select, [role="menu"], [role="menuitem"]')) return
        if (sessionRowInfo(target) === undefined) return
        event.preventDefault()
        event.stopPropagation()
      }

      document.addEventListener('click', onClick, true)
      document.addEventListener('dblclick', onDoubleClick, true)
      return () => {
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('dblclick', onDoubleClick, true)
        clearPendingClick()
      }
    }

    // ------------------------------------------------------------------
    // Per-session retained reference
    // ------------------------------------------------------------------
    function useSessionReference(sessionId) {
      const [state, setState] = useState({ reference: null, error: null })
      useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          setState({ reference: null, error: null })
          return undefined
        }
        let reference
        try {
          const sessions = runtimeCtx?.sessions
          if (sessions?.retain === undefined) throw new Error('sessions service unavailable')
          reference = sessions.retain(sessionId, { source: 'multiview-main' })
        } catch (error) {
          setState({ reference: null, error })
          return undefined
        }
        setState({ reference, error: null })
        try {
          reference.ready?.catch(() => {})
        } catch {
          // A reference without a ready promise is still usable.
        }
        return () => {
          try {
            reference.release()
          } catch {
            // Already released by the controller generation.
          }
        }
      }, [sessionId])
      return state
    }

    // ------------------------------------------------------------------
    // Conversation content
    // ------------------------------------------------------------------
    function FixedChatView(props) {
      return h(React.Fragment, null, props.renderSlot('conversation.session', { view: VIEW_CHAT }))
    }

    function FixedTrajectoryView(props) {
      return h(React.Fragment, null, props.renderSlot('conversation.session', { view: VIEW_TRAJECTORY }))
    }

    function PaneContent(props) {
      const { view, renderFactorySlot, useSession, useConversation, useSessions, sessionId } = props
      const session = useSession((value) => value)
      const conversation = useConversation((value) => value)
      const summaryBlank = useSessions((state) => state?.byId?.[sessionId]?.blank)

      if (session === undefined || conversation === undefined) {
        return h('div', { className: 'mv-pane-loading' }, '…')
      }

      if (view === VIEW_TRAJECTORY) {
        return h('div', { className: 'mv-pane-content', 'data-view': VIEW_TRAJECTORY },
          renderFactorySlot('conversation.content', {
            variant: 'embedded',
            phase: 'active',
            hero: false,
          }, { slots: { views: FixedTrajectoryView } }),
        )
      }

      const shellPhase = (conversation.activeTargets?.size ?? 0) > 0 ||
        (!session.blank && !session.awaitingFirstTurn) ||
        session.running
        ? 'active'
        : session.promptAttempted
          ? 'engaging'
          : 'blank'
      const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
      const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true

      return h('div', { className: 'mv-pane-content', 'data-view': VIEW_CHAT },
        renderFactorySlot('conversation.content', {
          variant: 'embedded',
          phase: settling ? 'settling' : hero ? 'hero' : 'active',
          hero,
        }, { slots: { views: FixedChatView } }),
      )
    }

    class PaneErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        try {
          console.error('[multiview] pane render failed', error, info)
        } catch {
          // Console is best-effort.
        }
      }

      render() {
        if (this.state.error !== null) {
          return h('div', { className: 'mv-pane-error' },
            String(this.state.error?.message ?? this.state.error),
          )
        }
        return this.props.children
      }
    }

    // ------------------------------------------------------------------
    // One pane
    // ------------------------------------------------------------------
    function PaneHost(props) {
      const {
        pane, index, title, active, canClose, SessionProvider, renderSlot,
        onFocus, onClose, onToggleView, t,
      } = props
      const referenceState = useSessionReference(pane.sessionId)
      const closeLabel = translate(t, 'closePane')
      const viewLabel = pane.view === VIEW_TRAJECTORY
        ? translate(t, 'showChat')
        : translate(t, 'showTrajectory')

      return h('section', {
        className: 'mv-pane',
        'data-active': active || undefined,
        'data-view': pane.view,
        onPointerDown: onFocus,
      }, [
        h('header', { className: 'mv-pane-head', key: 'head' }, [
          h('span', { className: 'mv-pane-index', key: 'index', 'aria-hidden': 'true' },
            String(index + 1).padStart(2, '0'),
          ),
          h('span', { className: 'mv-pane-title', key: 'title', title }, title),
          h('span', { className: 'mv-pane-actions', key: 'actions' }, [
            h('button', {
              key: 'view',
              type: 'button',
              className: 'mv-pane-btn mv-pane-view',
              title: viewLabel,
              'aria-label': viewLabel,
              'data-on': pane.view === VIEW_TRAJECTORY || undefined,
              onClick: (event) => {
                event.stopPropagation()
                onToggleView()
              },
            }, pane.view === VIEW_TRAJECTORY ? translate(t, 'chat') : translate(t, 'trajectory')),
            canClose
              ? h('button', {
                  key: 'close',
                  type: 'button',
                  className: 'mv-pane-btn mv-pane-close',
                  title: closeLabel,
                  'aria-label': closeLabel,
                  onClick: (event) => {
                    event.stopPropagation()
                    onClose()
                  },
                }, '×')
              : null,
          ]),
        ]),
        h('div', { className: 'mv-pane-body', key: 'body' },
          referenceState.reference !== null
            ? h(SessionProvider, { session: referenceState.reference },
                h(PaneErrorBoundary, null,
                  renderSlot('multiview.pane', {
                    view: pane.view,
                    index,
                  }),
                ),
              )
            : referenceState.error !== null
              ? h('div', { className: 'mv-pane-error' },
                  translate(t, 'retainFailed', {
                    message: String(referenceState.error?.message ?? referenceState.error),
                  }),
                )
              : h('div', { className: 'mv-pane-loading' }, translate(t, 'loading')),
        ),
      ])
    }

    // ------------------------------------------------------------------
    // Main panel
    // ------------------------------------------------------------------
    class MainErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        try {
          console.error('[multiview] main panel failed', error, info)
        } catch {
          // Console is best-effort.
        }
      }

      render() {
        if (this.state.error !== null) {
          return h('div', { className: 'mv-main mv-main-error' },
            h('div', { className: 'mv-pane-error' }, String(this.state.error?.message ?? this.state.error)),
          )
        }
        return this.props.children
      }
    }

    function MultiviewMain(props) {
      const { SessionProvider, renderSlot, useSessions, t } = props
      const store = useWorkspace()
      const sessionMap = useSessions((state) => state?.byId)
      const activeSessionId = mainSessionId(sessionMap)
      const tr = useCallback((key, params) => translate(t, key, params), [t])

      useEffect(() => {
        document.body.dataset.multiviewMain = 'on'
        try {
          const rightbar = runtimeCtx?.get('sidebarRight')
          if (rightbar?.isExpanded?.()) rightbar.toggleExpanded()
        } catch {
          // The stock right column may not be in this composition.
        }
        return () => {
          delete document.body.dataset.multiviewMain
        }
      }, [])

      const openSession = (sessionId) => {
        if (sessionId !== activeSessionId) openSessionById(sessionId)
      }

      const focus = (index) => {
        focusPane(index)
        const pane = store.panes[index]
        if (pane !== undefined) openSession(pane.sessionId)
      }

      const close = (index) => {
        const nextSessionId = closePane(index)
        if (nextSessionId !== undefined && nextSessionId !== activeSessionId) {
          openSessionById(nextSessionId)
        }
      }

      const toggleView = (index) => {
        const pane = store.panes[index]
        if (pane === undefined) return
        setPaneView(index, pane.view === VIEW_CHAT ? VIEW_TRAJECTORY : VIEW_CHAT)
      }

      if (store.panes.length === 0) {
        return h('div', { className: 'mv-main' },
          h('div', { className: 'mv-empty' }, [
            h('div', { className: 'mv-empty-kicker', key: 'kicker' }, 'MULTIVIEW'),
            h('div', { className: 'mv-empty-title', key: 'title' }, tr('emptyTitle')),
            h('div', { className: 'mv-empty-hint', key: 'hint' },
              activeSessionId === undefined ? tr('noSession') : tr('emptyHint'),
            ),
            activeSessionId === undefined
              ? null
              : h('button', {
                  key: 'open',
                  type: 'button',
                  className: 'mv-empty-action',
                  onClick: () => {
                    addPane(activeSessionId)
                    openSessionById(activeSessionId)
                  },
                }, tr('openCurrent')),
          ]),
        )
      }

      return h('div', { className: 'mv-main' },
        h('div', {
          className: 'mv-panes',
          style: { '--mv-pane-count': String(store.panes.length) },
        }, store.panes.map((pane, index) => h(PaneHost, {
          key: pane.sessionId,
          pane,
          index,
          title: sessionTitle(sessionMap, pane.sessionId),
          active: store.focused === index,
          canClose: store.panes.length > 1,
          SessionProvider,
          renderSlot,
          t,
          onFocus: () => focus(index),
          onClose: () => close(index),
          onToggleView: () => toggleView(index),
        }))),
      )
    }

    function MultiviewMainEntry(props) {
      return h(MainErrorBoundary, null, h(MultiviewMain, props))
    }

    // ------------------------------------------------------------------
    // Root controller: select the multi-pane panel and keep panes in step
    // ------------------------------------------------------------------
    function MultiviewRuntime({ usePanelInfo, useSessions }) {
      const activePanel = usePanelInfo((info) => info.activePanelId)
      const sessionMap = useSessions((state) => state?.byId)
      const activeSessionId = mainSessionId(sessionMap)
      const [attempt, setAttempt] = useState(0)

      useEffect(() => {
        if (activeSessionId === undefined) return undefined
        if (activePanel !== null && activePanel !== MAIN_PANEL && activePanel !== 'conversation') return undefined
        ensureSession(activeSessionId)
        if (activePanel !== null && activePanel !== 'conversation') return undefined
        if (selectMultiviewPanel() || attempt >= 20) return undefined
        const timer = window.setTimeout(() => setAttempt((value) => value + 1), 100)
        return () => window.clearTimeout(timer)
      }, [activePanel, activeSessionId, attempt])

      return null
    }

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------
    const css = `
body[data-multiview-main="on"] .ark-dock { opacity: 0; visibility: hidden; pointer-events: none; }

.mv-main {
  width: 100%; height: 100%; min-width: 0; min-height: 0;
  display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #111);
  font-family: var(--dsw-font-family, sans-serif);
  overflow: hidden;
}
.mv-panes {
  display: flex; flex: 1; min-width: 0; min-height: 0;
  gap: 1px; overflow-x: auto; overflow-y: hidden;
  background: var(--dsw-alias-border-l2, rgba(127,127,127,.2));
  scrollbar-width: thin;
}
.mv-pane {
  position: relative; flex: 1 1 0; min-width: 320px; min-height: 0;
  display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base, #fff);
  overflow: hidden;
}
.mv-pane[data-active="true"] {
  box-shadow: inset 0 2px 0 var(--dsw-alias-state-business-primary, #a67a2b);
}
.mv-pane-head {
  flex: none; height: 32px; box-sizing: border-box;
  display: flex; align-items: center; gap: 7px; padding: 0 7px 0 9px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 88%, transparent), var(--dsw-alias-bg-base, #fff));
  user-select: none;
}
.mv-pane[data-active="true"] .mv-pane-head {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-business-primary, #a67a2b) 10%, var(--dsw-alias-bg-layer-1, #fff)), var(--dsw-alias-bg-base, #fff));
}
.mv-pane-index {
  flex: none; color: var(--dsw-alias-state-business-primary, #a67a2b);
  font-family: var(--ds-font-family-code, monospace); font-size: 9px;
  letter-spacing: .08em; opacity: .9;
}
.mv-pane-title {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary, #667);
}
.mv-pane[data-active="true"] .mv-pane-title { color: var(--dsw-alias-label-primary, #111); }
.mv-pane-actions { flex: none; display: inline-flex; align-items: center; gap: 3px; }
.mv-pane-btn {
  box-sizing: border-box; width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0; border: 1px solid transparent; border-radius: var(--dsw-radius-sm, 3px);
  background: transparent; color: var(--dsw-alias-label-tertiary, #888);
  font: inherit; font-size: 13px; line-height: 1; cursor: pointer;
}
.mv-pane-btn:hover {
  border-color: var(--dsw-alias-border-l2, rgba(127,127,127,.2));
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color: var(--dsw-alias-label-primary, #111);
}
.mv-pane-view {
  width: auto; min-width: 22px; padding: 0 5px;
  font-family: var(--ds-font-family-code, monospace); font-size: 11px;
}
.mv-pane-view[data-on="true"] {
  border-color: var(--dsw-alias-state-business-primary, #a67a2b);
  color: var(--dsw-alias-state-business-primary, #a67a2b);
  background: var(--dsw-alias-state-business-tertiary, rgba(166,122,43,.12));
}
.mv-pane-close { font-size: 15px; }
.mv-pane-close:hover {
  color: var(--dsw-alias-state-error-primary, #a13d3d);
  border-color: var(--dsw-alias-state-error-primary, #a13d3d);
}
.mv-pane-body { flex: 1; min-height: 0; min-width: 0; display: flex; overflow: hidden; }
.mv-pane-body > * { flex: 1; min-height: 0; min-width: 0; }
.mv-pane-content {
  width: 100%; height: 100%; min-height: 0;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--dsw-alias-bg-base, #fff);
}
.mv-pane-content > * { flex: 1; min-height: 0; }
.mv-pane-content [data-conversation-content][data-content-phase="active"] [data-composer-seat] {
  position: sticky; bottom: 0; z-index: 7;
  background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-base, #fff) 0%, transparent) 0, var(--dsw-alias-bg-base, #fff) 36px);
}
.mv-pane-content[data-view="trajectory"] [data-composer-seat] { display: none; }
.mv-pane-content[data-view="trajectory"] [data-composer-dock] { display: none; }
.mv-pane-loading, .mv-pane-error {
  box-sizing: border-box; width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center; padding: 18px;
  text-align: center; font-size: 12px; line-height: 1.5;
}
.mv-pane-loading { color: var(--dsw-alias-label-tertiary, #888); }
.mv-pane-error {
  color: var(--dsw-alias-state-error-primary, #a13d3d);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #a13d3d) 6%, transparent);
}
.mv-empty {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 7px; padding: 24px;
  text-align: center;
  background:
    radial-gradient(600px 360px at 50% 42%, color-mix(in srgb, var(--dsw-alias-state-business-primary, #a67a2b) 7%, transparent), transparent 70%);
}
.mv-empty-kicker {
  font-family: var(--ds-font-family-code, monospace); font-size: 8px;
  letter-spacing: .24em; color: var(--dsw-alias-state-business-primary, #a67a2b);
}
.mv-empty-title { font-size: 18px; font-weight: 500; letter-spacing: .06em; }
.mv-empty-hint {
  max-width: 42ch; color: var(--dsw-alias-label-tertiary, #888);
  font-size: 12px; line-height: 1.6;
}
.mv-empty-action {
  margin-top: 6px; height: 30px; padding: 0 14px;
  border: 1px solid var(--dsw-alias-state-business-primary, #a67a2b);
  border-radius: var(--dsw-radius-sm, 3px);
  background: var(--dsw-alias-state-business-primary, #a67a2b);
  color: #fff; font: inherit; font-size: 11px; cursor: pointer;
}
.mv-empty-action:hover { filter: brightness(1.06); }
.mv-main-error { padding: 20px; }

@media (max-width: 900px) {
  .mv-pane { min-width: 280px; }
  .mv-pane-title { font-size: 11px; }
}
`
    // ------------------------------------------------------------------
    // Plugin
    // ------------------------------------------------------------------
    return {
      inject: ['slots', 'locale', 'sessions'],
      apply(ctx) {
        runtimeCtx = ctx
        const t = ctx.locale.bind(NS)

        ctx.effect(() => {
          const existing = document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]')
          const tag = document.createElement('style')
          tag.dataset.plugin = PLUGIN_ID
          tag.dataset.pluginCss = STYLE_ID
          tag.textContent = css
          if (existing !== null) existing.replaceWith(tag)
          else document.head.appendChild(tag)
          return () => tag.remove()
        }, 'multiview: stylesheet')

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'multiview: dictionaries')
        ctx.effect(() => installSessionRowClicks(), 'multiview: session-row gestures')

        // The main panel declares a session-scoped child, so the slot renderer
        // hands the component SessionProvider and renderSlot. That is what lets
        // one main panel render several independently bound conversations.
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: MAIN_PANEL,
          label: () => t('mainTitle'),
          locale: NS,
          children: {
            'multiview.pane': { kind: 'single', scope: 'session' },
          },
        }, MultiviewMainEntry))

        ctx.slots.inject('multiview.pane', () => ctx.slots.register({
          name: 'multiview.pane',
        }, PaneContent))

        // A silent root controller keeps the stock conversation selection in
        // sync with the workspace and redirects the conversation surface here.
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'multiview-runtime',
          order: 60,
        }, MultiviewRuntime))
      },
    }
  },
})
