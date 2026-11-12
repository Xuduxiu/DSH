// Run the shipped client through its module/slot contract, without an account.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const client = readFileSync(new URL('../arknights-ui/client.js', import.meta.url), 'utf8')
const key = 'arknights-ui:theme'
const protocols = ['day', 'night', 'glass', 'xlab']
function boot(stored, prefersDark = false) {
  const picked = new Map(), events = new Map(), listeners = new Map(), cleanups = []
  const store = new Map(stored ? [[key, stored]] : []), styles = [], stockSchemes = []
  const dataset = {}, root = { dataset, lang: 'en', removeAttribute(name) {
    if (name === 'data-arknights-theme') delete dataset.arknightsTheme
  }}
  const document = {
    documentElement: root, querySelector: () => null,
    createElement: () => ({ dataset: {}, remove() { styles.splice(styles.indexOf(this),1) } }),
    head: { appendChild(style) { styles.push(style) } },
  }
  let registration
  const window = {
    __ModuleLoader__: { load(mod) { registration = mod } },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v) },
    addEventListener: (name, cb) => listeners.set(name,cb),
    removeEventListener: (name, cb) => { if (listeners.get(name) === cb) listeners.delete(name) },
    matchMedia: () => ({ matches: prefersDark, addEventListener() {}, removeEventListener() {} }),
  }
  runInNewContext(client, { window, document })
  const React = {
    createElement(type,props,...children) { return { type, props: props ?? {}, children: children.flat() } },
    useState(initial) { return [initial,()=>{}] }, useCallback(fn) { return fn }, useEffect() {},
  }
  const plugin = registration.factory(name => { assert.equal(name,'react'); return React })
  const stock = { setTheme(scheme) {
    stockSchemes.push(scheme)
    events.get('theme/change')?.({ active: { colorScheme: scheme } })
  } }
  plugin.apply({
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') cleanups.push(dispose) },
    get: () => stock, on: (name,cb) => events.set(name,cb), locale: {register() {}},
    slots: { inject: (name,cb) => cb(), register: (info,widget) => picked.set(info.name,widget) },
  })
  function buttons() {
    const tree = picked.get('settings.general.item')({})
    const walk = el => typeof el === 'object' && el !== null
      ? [el, ...el.children.flatMap(walk)] : []
    return walk(tree).filter(el => el.type === 'button')
  }
  return { store, styles, dataset, listeners, stockSchemes, buttons, clean: () => cleanups.reverse().forEach(fn=>fn()) }
}

test('previous choices round-trip; xLab is optional and synchronizes with stock dark mode', () => {
  for (const old of protocols) {
    const s = boot(old)
    assert.equal(s.dataset.arknightsTheme,old)
    assert.deepEqual(s.buttons().map(b=>b.props['data-theme']),protocols)
    assert.deepEqual(s.buttons().filter(b=>b.props['aria-pressed']).map(b=>b.props['data-theme']),[old])
    const choice = s.buttons().find(b=>b.props['data-theme'] === 'xlab')
    choice.props.onClick()
    assert.equal(s.dataset.arknightsTheme,'xlab')
    assert.equal(s.store.get(key),'xlab')
    assert.equal(s.stockSchemes.at(-1),'dark')
    s.clean()
    assert.equal(s.dataset.arknightsTheme,undefined)
    assert.equal(s.styles.length,0)
    assert.equal(s.listeners.size,0)
  }
})

test('a new profile follows the OS; an open second window follows an explicit saved selection', () => {
  const s = boot(null,true)
  assert.equal(s.dataset.arknightsTheme,'night')
  assert.equal(s.store.has(key),false)
  s.store.set(key,'xlab')
  s.listeners.get('storage')({key})
  assert.equal(s.dataset.arknightsTheme,'xlab')
  s.store.set(key,'day')
  s.listeners.get('storage')({key})
  assert.equal(s.dataset.arknightsTheme,'day')
  assert.equal(s.stockSchemes.at(-1),'light')
  s.clean()
})

test('console defines every protocol colour; foreground, focus and warning clear contrast targets', () => {
  const s = boot('xlab')
  function palette(id) {
    const block = s.styles[0].textContent.match(new RegExp('html\\[data-arknights-theme="'+id+'"\\] \\{([^}]*)\\}'))[1]
    return new Map(Array.from(block.matchAll(/(--ark-[\w-]+):\s*([^;]+);/g), m=>[m[1],m[2]]))
  }
  const day = palette('day'), xlab = palette('xlab')
  for (const k of day.keys()) assert.ok(xlab.has(k),k)
  const luminance = raw => raw.slice(1).match(/../g).map(n=>Number.parseInt(n,16)/255)
    .map(c=> c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4)
    .reduce((total,c,i)=>total+c*[.2126,.7152,.0722][i],0)
  for(const [fg,bg,min] of [['ink','layer1',4.5],['ink2','layer1',4.5],['ink3','layer2',4.5],['warn','layer2',4.5],
    ['brand-ink','brand',4.5],['accent','layer2',3],['line3','field',3]]) {
    const colors = [fg,bg].map(k=>luminance(xlab.get('--ark-'+k))).sort((a,b)=>b-a)
    assert.ok((colors[0]+.05)/(colors[1]+.05)>=min,fg+'/'+bg)
  }
  s.clean()
})
