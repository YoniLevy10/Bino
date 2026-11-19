#!/usr/bin/env node
/**
 * Rewrite @/lib/<file> imports to @/lib/<domain>/<file> for thin compat shims,
 * then delete the shim files.
 *
 * Usage:
 *   node scripts/migrate-lib-shim-imports.mjs           # rewrite + delete
 *   node scripts/migrate-lib-shim-imports.mjs --dry-run
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dry = process.argv.includes('--dry-run')
const libRoot = path.join(root, 'lib')

const DOMAINS = [
  'whatsapp',
  'attendance',
  'maintenance',
  'collections',
  'payments',
  'worker',
  'tenant',
  'auth-api',
  'shared',
  'tickets',
  'sms',
  'marketing',
  'reporter',
  'push',
  'dashboard',
  'projects',
  'google',
  'excel',
  'summary',
  'nfc',
  'merge',
  'notify',
  'client',
  'plans',
  'addons',
  'errors',
  'composio',
  'seo',
  'sandbox',
  'superadmin',
  'residents',
  'ops',
  'hooks',
]

/** @returns {Map<string, string>} oldModule -> newModule (without @/lib prefix path after lib/) */
function collectShimMap() {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const name of fs.readdirSync(libRoot)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
    const full = path.join(libRoot, name)
    if (!fs.statSync(full).isFile()) continue
    const src = fs.readFileSync(full, 'utf8')
    const m = src.match(/export\s+\*\s+from\s+['"]\.\/([^'"]+)['"]/)
    if (!m) continue
    if (!src.includes('Compat shim') && !DOMAINS.some((d) => m[1].startsWith(`${d}/`))) continue
    const base = name.replace(/\.ts$/, '')
    const target = m[1].replace(/\.ts$/, '')
    map.set(base, target)
  }
  return map
}

/** @param {string} dir */
function walkFiles(dir) {
  /** @type {string[]} */
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next' || ent.name === '.git') continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walkFiles(p))
    else if (/\.(ts|tsx|mts|mjs|js|jsx)$/.test(ent.name)) out.push(p)
  }
  return out
}

const shimMap = collectShimMap()
console.log(`Shims to migrate: ${shimMap.size}`)

const files = walkFiles(root).filter((f) => {
  const rel = path.relative(root, f)
  return (
    !rel.startsWith('node_modules') &&
    !rel.startsWith('.next') &&
    !rel.startsWith('scripts/migrate-lib-shim') &&
    !rel.startsWith('scripts/fold-lib')
  )
})

let filesTouched = 0
let replacements = 0

for (const file of files) {
  let text = fs.readFileSync(file, 'utf8')
  let next = text
  for (const [oldBase, newPath] of shimMap) {
    // @/lib/oldBase → @/lib/newPath
    const reAt = new RegExp(`(@/lib/)${escapeReg(oldBase)}(?=['"])`, 'g')
    next = next.replace(reAt, `$1${newPath}`)

    // relative from lib root only: './oldBase' or "../oldBase" when in lib/subdir — careful
    // Only rewrite exact module specs that match shim basenames as @/lib already covered most.
  }
  if (next !== text) {
    filesTouched += 1
    // rough count
    replacements += 1
    if (!dry) fs.writeFileSync(file, next, 'utf8')
  }
}

console.log(`Files updated: ${filesTouched}${dry ? ' (dry-run)' : ''}`)

if (!dry) {
  let deleted = 0
  for (const oldBase of shimMap.keys()) {
    const shimPath = path.join(libRoot, `${oldBase}.ts`)
    if (fs.existsSync(shimPath)) {
      const src = fs.readFileSync(shimPath, 'utf8')
      if (src.includes('Compat shim') || /export\s+\*\s+from\s+['"]\.\/(whatsapp|attendance|maintenance|collections|payments|worker|tenant|auth-api|shared)\//.test(src)) {
        fs.unlinkSync(shimPath)
        deleted += 1
      }
    }
  }
  console.log(`Shims deleted: ${deleted}`)
}

/** @param {string} s */
function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
