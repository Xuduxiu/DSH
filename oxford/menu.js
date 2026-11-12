// Browser source included in the DSH client module at build time.
// DSH's main panel and sidebar use the public layout/slot API. The Windows
// preload owns the two-item caption bar (no public caption slot in rc.2);
// append only our button to its open shadow root. Web/Mac use the sidebar.
function installOxfordMenu(ctx, React, Workbench) {
  const panel = 'oxford-measurement'
  const ns = 'oxford-menu'
  const h = React.createElement
  const layout = ctx.get('layout')
  const current = () => layout.panelInfo.getSnapshot().activePanelId
  let previous = current() === panel ? null : current()
  let focusEntry = () => {}

  const label = ctx.locale.bind(ns)
  ctx.effect(() => ctx.locale.register(ns, {
    zh: { measure: '测量' }, en: { measure: 'Measurement' },
  }), 'Oxford: menu label')

  function leave(restoreFocus) {
    if (current() !== panel) return
    // A plugin that owned the previous panel might have been disabled.
    const target = previous && ctx.slots.entries('main').some(e => e.options.key === previous)
      ? previous : null
    layout.selectPanel(target)
    if (restoreFocus) requestAnimationFrame(() => focusEntry())
  }
  function toggle() {
    if (current() === panel) leave(true)
    else { previous = current(); layout.selectPanel(panel) }
  }

  function Panel() {
    return h(Workbench, {onClose: () => leave(true)})
  }
  function SpectrometerIcon({ size = 16 }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 20 20', fill: 'none',
      'data-oxford-sidebar-icon': '', 'aria-hidden': true, focusable: false },
      h('path', { d: 'M2 15.5h16M2 12h3l2.5-6 3.2 8 2.3-5h4',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' }))
  }
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: panel, label: () => label('measure'), locale: ns,
  }, Panel))
  // Also works when the desktop caption bar is missing or its implementation
  // changes. DSH renders the button and its selected state, as for Plugins.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: panel, order: -10, label: () => label('measure'), locale: ns,
  }, SpectrometerIcon))

  ctx.effect(() => {
    let bar, button, shadowStyle, setKey, originalRoving
    const focusSidebar = () => document.querySelector('[data-oxford-sidebar-icon]')?.closest('button')?.focus()
    focusEntry = () => button?.isConnected ? button.focus() : focusSidebar()
    const syncState = () => {
      const active = current()
      if (active !== panel) previous = active
      if (!button) return
      button.textContent = label('measure')
      if (active === panel) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    }
    const detach = () => {
      if (!button) return
      bar.removeEventListener('keydown', setKey, true)
      // Keep the stock roving tabindex valid if the removed item had focus.
      if (button.tabIndex === 0 && originalRoving?.isConnected) originalRoving.tabIndex = 0
      button.remove(); shadowStyle.remove()
      bar = button = shadowStyle = setKey = originalRoving = undefined
    }
    const mount = () => {
      const root = document.querySelector('[data-windows-menu]')?.shadowRoot
      const target = root?.querySelector('[role="menubar"]')
      if (target === bar && button?.isConnected) return
      detach()
      // Bind only to the known official Application + Edit pair. A future
      // caption contract can fall back to the official panel list untouched.
      const nativeItems = target ? [...target.querySelectorAll(':scope > button[role="menuitem"][aria-haspopup="menu"]')] : []
      if (nativeItems.length !== 2 || target.querySelector('[data-oxford-menu]')) return
      bar = target
      originalRoving = nativeItems.find(x => x.tabIndex === 0) || nativeItems[0]
      button = document.createElement('button')
      button.type = 'button'
      button.dataset.oxfordMenu = ''
      button.setAttribute('role', 'menuitem')
      button.tabIndex = -1
      button.addEventListener('click', toggle)
      nativeItems[1].after(button)
      shadowStyle = document.createElement('style')
      shadowStyle.textContent = '[data-oxford-menu][aria-current=page] {color:var(--dsw-alias-label-primary);box-shadow:inset 0 -2px 0 var(--dsw-alias-state-business-primary)}'
      root.append(shadowStyle)
      // The preload's arrow handler knows two items. Handle only transitions
      // involving our third item; original mouse/down-arrow popup IPC stays intact.
      const items = [...nativeItems, button]
      setKey = event => {
        const i = items.indexOf(event.target)
        if (i === -1 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
        let next
        if (event.key === 'ArrowRight') next = items[(i + 1) % 3]
        else if (event.key === 'ArrowLeft') next = items[(i + 2) % 3]
        if (next && (event.target === button || next === button)) {
          event.preventDefault(); event.stopPropagation()
          items.forEach(item => {item.tabIndex = item === next ? 0 : -1})
          next.focus()
        }
      }
      bar.addEventListener('keydown', setKey, true)
      syncState()
    }
    // Windows preload appends its host directly to body after shell.overlay
    // mounts; observe just direct children, never all conversation mutations.
    const observer = new MutationObserver(mount)
    observer.observe(document.body, {childList: true})
    const unsubPanel = layout.panelInfo.subscribe(syncState)
    const unsubLocale = ctx.locale.subscribe(syncState)
    mount(); syncState()
    return () => {
      observer.disconnect(); unsubPanel(); unsubLocale()
      leave(false); detach(); focusEntry = () => {}
    }
  }, 'Oxford: desktop caption and panel navigation')
}
