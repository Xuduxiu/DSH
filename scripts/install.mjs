import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'

export const bundles = ['plugin', 'arknights-ui', 'multiview']
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))

function sourceFiles(dir, rel = '') {
  return readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = join(rel, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${path}`)
    return entry.isDirectory() ? sourceFiles(dir, path) : [path]
  })
}

export function install({ home, profile, runDsh, sourceRoot = root, check = false, log = console.log }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(profile)) throw new Error('Invalid profile name.')
  home = resolve(home)
  const env = { ...process.env, DSH_HOME: home }
  // A shell may carry another profile's directory; let DSH resolve the selected profile.
  delete env.DSH_PROFILE_DIR
  delete env.DSH_PROFILE
  const runtimeVersion = runDsh(['--version'], env).trim()
  const manifests = bundles.map(dir => ({ dir, ...json(join(sourceRoot, dir, 'package.json')) }))
  log(`DSH runtime: ${runtimeVersion}; profile: ${profile}; home: ${home}`)
  if (!runtimeVersion.includes('0.2.1-rc.5')) log('NOTICE: qualified runtime is 0.2.1-rc.5; this runtime needs separate compatibility verification.')
  if (check) return { runtimeVersion, profile, home, bundles: manifests.map(m => m.name) }
  const profileDir = join(home, 'profiles', profile)
  if (profile === 'desktop' && !existsSync(join(profileDir, 'package.json'))) {
    throw new Error('Open DeepSeek Harness Desktop once to initialize its profile, then quit it and retry.')
  }
  const hash = createHash('sha256')
  for (const dir of bundles) for (const file of sourceFiles(join(sourceRoot, dir))) {
    hash.update(dir + '/' + file.replaceAll('\\', '/')).update('\0').update(readFileSync(join(sourceRoot, dir, file)))
  }
  const revision = hash.digest('hex').slice(0, 16)
  const toolkitDir = join(home, 'toolkit')
  const destination = join(toolkitDir, 'versions', revision)
  const backup = join(toolkitDir, 'backups', `${profile}-${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`)
  mkdirSync(backup, { recursive: true })
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml']) {
    if (existsSync(join(profileDir, file))) copyFileSync(join(profileDir, file), join(backup, file))
  }
  log(`Configuration backup: ${backup}`)
  for (const dir of bundles) {
    mkdirSync(join(destination, dir), { recursive: true })
    // Only source plugin files are copied; no DSH credentials or sessions.
    for (const file of sourceFiles(join(sourceRoot, dir))) {
      mkdirSync(dirname(join(destination, dir, file)), { recursive: true })
      const target = join(destination, dir, file)
      const source = join(sourceRoot, dir, file)
      if (existsSync(target)) {
        if (!readFileSync(target).equals(readFileSync(source))) throw new Error(`Modified plugin cache: ${target}`)
      } else copyFileSync(source, target)
    }
  }
  try {
    const targets = bundles.map(dir => 'link:' + join(destination, dir).replaceAll('\\', '/'))
    log(runDsh(['plugin', '--profile', profile, 'add', ...targets], env))
    const saved = json(join(profileDir, 'package.json'))
    const selected = saved.dsh?.profile?.bundles ?? []
    for (const manifest of manifests) {
      if (!saved.dependencies?.[manifest.name] || !selected.includes(manifest.name)) {
        throw new Error(`DSH did not register and enable ${manifest.name}`)
      }
      const installed = json(join(profileDir, 'node_modules', ...manifest.name.split('/'), 'package.json'))
      if (installed.name !== manifest.name || installed.version !== manifest.version) {
        throw new Error(`Installed package verification failed: ${manifest.name}`)
      }
    }
    const receipt = { installedAt: new Date().toISOString(), runtimeVersion, profile, revision, destination, backup, bundles: manifests.map(m => m.name) }
    writeFileSync(join(toolkitDir, `installed-${profile}.json`), JSON.stringify(receipt, null, 2) + '\n')
    log(`Installed ${manifests.length} plugins. Restart DSH and refresh its page. Backup: ${backup}`)
    return receipt
  } catch (error) {
    throw new Error(`Installation incomplete: ${error.message}\nProfile changes may be partial. Configuration backup: ${backup}`)
  }
}

function cli() {
  const { values } = parseArgs({ options: {
    profile: { type: 'string', default: process.platform === 'win32' ? 'desktop' : 'web' },
    home: { type: 'string', default: process.env.DSH_HOME || join(homedir(), '.dsh') },
    'desktop-exe': { type: 'string' },
    command: { type: 'string', default: 'dsh' },
    check: { type: 'boolean', default: false },
  } })
  const executable = values['desktop-exe'] ? resolve(values['desktop-exe']) : values.command
  const prefix = values['desktop-exe'] ? ['--expose-internals', join(dirname(executable), 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')] : []
  const runDsh = (args, env) => {
    const result = spawnSync(executable, [...prefix, ...args], {
      env: values['desktop-exe'] ? { ...env, ELECTRON_RUN_AS_NODE: '1' } : env,
      encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`DSH exited ${result.status}: ${result.stderr || result.stdout}`)
    return [result.stdout, result.stderr].filter(Boolean).join('\n')
  }
  install({ home: values.home, profile: values.profile, check: values.check, runDsh })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
