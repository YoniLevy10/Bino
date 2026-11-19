#!/usr/bin/env node
/**
 * Move flat lib/<prefix>*.ts files into lib/<domain>/ and leave thin compat shims.
 *
 * Usage:
 *   node scripts/fold-lib-domain.mjs --domain whatsapp --glob 'whatsapp-*,wa-*'
 *   node scripts/fold-lib-domain.mjs --domain attendance --glob 'attendance-*'
 *
 * Does not touch existing directories named like the domain.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const libRoot = path.join(root, 'lib')

function parseArgs(argv) {
  /** @type {{ domain?: string, globs: string[] }} */
  const out = { globs: [] }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--domain') out.domain = argv[++i]
    else if (a === '--glob') out.globs.push(argv[++i])
    else throw new Error(`Unknown arg: ${a}`)
  }
  if (!out.domain || out.globs.length === 0) {
    throw new Error('Usage: --domain <name> --glob <pat> [--glob <pat>...]')
  }
  return out
}

/** @param {string} pattern e.g. whatsapp-* */
function matchGlob(name, pattern) {
  if (!pattern.includes('*')) return name === pattern
  const [pre, ...rest] = pattern.split('*')
  if (rest.length !== 1) throw new Error(`Unsupported glob: ${pattern}`)
  const suf = rest[0]
  return name.startsWith(pre) && name.endsWith(suf) && name.length >= pre.length + suf.length
}

const { domain, globs } = parseArgs(process.argv)
const destDir = path.join(libRoot, domain)
fs.mkdirSync(destDir, { recursive: true })

const entries = fs.readdirSync(libRoot, { withFileTypes: true })
/** @type {string[]} */
const moved = []

for (const ent of entries) {
  if (!ent.isFile()) continue
  if (!ent.name.endsWith('.ts')) continue
  const matched = globs.some((g) => matchGlob(ent.name, g))
  if (!matched) continue

  const from = path.join(libRoot, ent.name)
  const to = path.join(destDir, ent.name)
  if (fs.existsSync(to)) {
    throw new Error(`Destination already exists: ${to}`)
  }

  try {
    execSync(`git mv "${from}" "${to}"`, { cwd: root, stdio: 'pipe' })
  } catch {
    fs.renameSync(from, to)
    try {
      execSync(`git add -A -- "${from}" "${to}"`, { cwd: root, stdio: 'pipe' })
    } catch {
      /* untracked ok */
    }
  }

  const isTest = ent.name.endsWith('.test.ts')
  if (!isTest) {
    const shimPath = path.join(libRoot, ent.name)
    const base = ent.name.replace(/\.ts$/, '')
    const shim = `/** @deprecated Compat shim — import from \`@/lib/${domain}/${base}\` instead. */\nexport * from './${domain}/${base}'\n`
    fs.writeFileSync(shimPath, shim, 'utf8')
    try {
      execSync(`git add -- "${shimPath}"`, { cwd: root, stdio: 'pipe' })
    } catch {
      /* ignore */
    }
  }

  moved.push(ent.name)
}

console.log(`Moved ${moved.length} file(s) into lib/${domain}/`)
for (const m of moved) console.log(`  - ${m}`)
