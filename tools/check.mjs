import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { root, bundles } from '../scripts/install.mjs'

let count = 0
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(item.name)) continue
    const path = join(dir, item.name)
    if (item.isDirectory()) walk(path)
    else if (/\.(mjs|js)$/.test(item.name)) {
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr || `Invalid JavaScript: ${path}`)
      count++
    }
  }
}
walk(root)
for (const dir of bundles) {
  const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json')))
  for (const key of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'LICENSE']) readFileSync(join(root, dir, key))
  if (!manifest.dsh?.bundle || !manifest.dsh?.client) throw new Error(`Invalid plugin: ${dir}`)
  console.log(`PASS package ${manifest.name}`)
}
console.log(`PASS syntax: ${count} JavaScript files`)
