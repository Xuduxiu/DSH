import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { install, root } from '../scripts/install.mjs'

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsh toolkit test '))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const profileDir = join(home, 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  const original = { private: true, dependencies: { 'existing-plugin': '1.0.0' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'existing-plugin'] } } }
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify(original))
  const calls = []
  const runDsh = (args, env) => {
    calls.push(args)
    assert.equal(env.DSH_HOME, home)
    assert.equal(env.DSH_PROFILE_DIR, undefined)
    if (args[0] === '--version') return '0.2.1-rc.5'
    assert.deepEqual(args.slice(0, 4), ['plugin', '--profile', 'web', 'add'])
    const saved = JSON.parse(readFileSync(join(profileDir, 'package.json')))
    for (const target of args.slice(4)) {
      const source = target.slice(5)
      const manifest = JSON.parse(readFileSync(join(source, 'package.json')))
      saved.dependencies[manifest.name] = target
      if (!saved.dsh.profile.bundles.includes(manifest.name)) saved.dsh.profile.bundles.push(manifest.name)
      const installed = join(profileDir, 'node_modules', ...manifest.name.split('/'))
      if (!existsSync(installed)) cpSync(source, installed, { recursive: true })
    }
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify(saved))
    return 'installed'
  }
  return { home, profileDir, calls, original, runDsh, profile: 'web', log() {} }
}

test('copies into persistent home and preserves existing plugins; repeat install is idempotent', t => {
  const f = fixture(t)
  const result = install(f)
  assert.ok(result.destination.startsWith(f.home))
  assert.deepEqual(JSON.parse(readFileSync(join(result.backup, 'package.json'))), f.original)
  install(f)
  const saved = JSON.parse(readFileSync(join(f.profileDir, 'package.json')))
  assert.equal(saved.dependencies['existing-plugin'], '1.0.0')
  assert.equal(saved.dsh.profile.bundles.length, 7)
  assert.ok(saved.dsh.profile.bundles.includes('@local/dsh-oxford'))
  assert.ok(existsSync(join(result.destination, 'plugin', 'lib', 'state.js')))
})

test('check mode writes no toolkit files or profile changes', t => {
  const f = fixture(t)
  install({ ...f, check: true })
  assert.equal(existsSync(join(f.home, 'toolkit')), false)
  assert.deepEqual(JSON.parse(readFileSync(join(f.profileDir, 'package.json'))), f.original)
})

test('rejects path traversal before invoking DSH', t => {
  const f = fixture(t)
  assert.throws(() => install({ ...f, profile: '../desktop' }), /Invalid profile/)
  assert.equal(f.calls.length, 0)
})

test('desktop must already be initialized', t => {
  const f = fixture(t)
  assert.throws(() => install({ ...f, profile: 'desktop' }), /initialize its profile/)
  assert.equal(existsSync(join(f.home, 'toolkit')), false)
})

test('failed package operation reports incomplete state and leaves a usable configuration backup', t => {
  const f = fixture(t)
  assert.throws(() => install({ ...f, runDsh(args) { if (args[0] === '--version') return '0.2.1-rc.5'; throw new Error('simulated failure') } }), /Installation incomplete.*simulated failure[\s\S]*Configuration backup/)
  assert.deepEqual(JSON.parse(readFileSync(join(f.profileDir, 'package.json'))), f.original)
  assert.equal(existsSync(join(f.home, 'toolkit', 'installed-web.json')), false)
})
