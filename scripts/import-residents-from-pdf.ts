#!/usr/bin/env npx tsx
/**
 * Parse resident directory PDF/text and bulk-import into Supabase.
 *
 * Usage:
 *   npx tsx scripts/import-residents-from-pdf.ts --file data/residents-directory.txt [--dry-run]
 *   npx tsx scripts/import-residents-from-pdf.ts --pdf data/residents-directory.pdf [--purge-placeholders]
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BAMAKOR_CLIENT_ID
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { bulkImportResidentsFromParsed } from '../lib/bulk-import-residents'
import { parseResidentsDirectoryPdfText } from '../lib/parse-residents-directory-pdf'

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
}

function parseArgs(argv: string[]) {
  let file = ''
  let pdf = ''
  let dryRun = false
  let purgePlaceholders = false
  let clientId = process.env.BAMAKOR_CLIENT_ID || ''
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') dryRun = true
    else if (a === '--purge-placeholders') purgePlaceholders = true
    else if (a === '--file' && argv[i + 1]) file = argv[++i]
    else if (a === '--pdf' && argv[i + 1]) pdf = argv[++i]
    else if (a === '--client-id' && argv[i + 1]) clientId = argv[++i]
  }
  return { file, pdf, dryRun, purgePlaceholders, clientId }
}

async function main() {
  loadEnvLocal()
  const { file, pdf, dryRun, purgePlaceholders, clientId } = parseArgs(process.argv)

  let textPath = file
  if (pdf) {
    textPath = path.join(path.dirname(pdf), `${path.basename(pdf, path.extname(pdf))}.extracted.txt`)
    execFileSync('node', ['scripts/extract-residents-pdf-text.mjs', pdf, textPath], {
      stdio: 'inherit',
    })
  }

  if (!textPath) {
    console.error(
      'Usage: npx tsx scripts/import-residents-from-pdf.ts --file <txt> | --pdf <pdf> [--dry-run] [--purge-placeholders]'
    )
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!clientId) {
    console.error('Missing BAMAKOR_CLIENT_ID or --client-id')
    process.exit(1)
  }

  const text = fs.readFileSync(path.resolve(textPath), 'utf-8')
  const residents = parseResidentsDirectoryPdfText(text)
  console.log(`Parsed ${residents.length} resident rows`)

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const result = await bulkImportResidentsFromParsed(supabase, {
    clientId,
    residents,
    dryRun,
    purgePlaceholders,
  })

  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
