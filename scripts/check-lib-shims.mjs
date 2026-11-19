#!/usr/bin/env node
/**
 * Ensures lib compat-shim .ts files (deluxe organization) contain only a
 * re-export (plus optional comments / blank lines).
 *
 * Usage:
 *   node scripts/check-lib-shims.mjs
 *   node scripts/check-lib-shims.mjs --list   # print shim paths only
 *
 * Exit 1 if a marked shim has extra logic.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const libRoot = path.join(root, 'lib')
const listOnly = process.argv.includes('--list')

const SHIM_MARKERS = [
  'Compat shim',
  '@deprecated Compat shim',
  "export * from './whatsapp/",
  "export * from './attendance/",
  "export * from './maintenance/",
  "export * from './collections/",
  "export * from './payments/",
  "export * from './worker/",
  "export * from './tenant/",
  "export * from './auth-api/",
  "export * from './shared/",
  "export * from './tickets/",
  "export * from './sms/",
  "export * from './marketing/",
  "export * from './reporter/",
  "export * from './push/",
  "export * from './dashboard/",
  "export * from './projects/",
  "export * from './google/",
  "export * from './excel/",
  "export * from './summary/",
  "export * from './nfc/",
  "export * from './merge/",
  "export * from './notify/",
  "export * from './client/",
  "export * from './plans/",
  "export * from './addons/",
  "export * from './errors/",
  "export * from './composio/",
  "export * from './seo/",
  "export * from './sandbox/",
  "export * from './superadmin/",
  "export * from './residents/",
  "export * from './ops/",
  "export * from './hooks/",
]

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walk(p))
    else if (ent.isFile() && ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) {
      out.push(p)
    }
  }
  return out
}

/**
 * Thin shim: only comments, blanks, and a single `export * from '...'`
 * (optional `export type * from` not used here).
 * @param {string} src
 */
function isThinShim(src) {
  const lines = src.split(/\r?\n/)
  let exportCount = 0
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.endsWith('*/')) continue
    if (/^export\s+\*\s+from\s+['"][^'"]+['"]\s*;?\s*$/.test(t)) {
      exportCount += 1
      continue
    }
    return false
  }
  return exportCount === 1
}

/** @param {string} src */
function looksLikeShim(src) {
  return SHIM_MARKERS.some((m) => src.includes(m))
}

const files = walk(libRoot)
/** @type {string[]} */
const shims = []
/** @type {string[]} */
const fat = []

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  if (!looksLikeShim(src)) continue
  const rel = path.relative(root, file)
  shims.push(rel)
  if (!isThinShim(src)) fat.push(rel)
}

if (listOnly) {
  for (const s of shims) console.log(s)
  process.exit(0)
}

console.log(`Found ${shims.length} lib compat shim(s).`)
if (fat.length) {
  console.error('Fat shims (must be export-only):')
  for (const f of fat) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('All shims are thin.')
