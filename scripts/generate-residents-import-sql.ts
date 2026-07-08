#!/usr/bin/env npx tsx
/**
 * Generate Supabase SQL to import parsed PDF residents into EXISTING projects only.
 *
 * Usage:
 *   npx tsx scripts/generate-residents-import-sql.ts [--client-id UUID] [--out data/import-residents.sql]
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { normalizeProjectNameForMatch } from '../lib/parse-residents-directory-pdf'
import { normalizePhone } from '../lib/residents-whatsapp'

type ParsedRow = {
  project_name: string
  apartment_number: string
  full_name: string
  phone: string
  email: string
  is_renter: boolean
  notes: string
}

const DEFAULT_CLIENT_ID = '7573f5ad-70e5-4357-8fef-1d96ec38d169'

function sqlStr(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

function formatPhone(raw: string): { phone: string | null; normalized: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { phone: null, normalized: null }
  const digits = normalizePhone(trimmed)
  if (!digits || digits.length < 9) return { phone: trimmed, normalized: null }
  return { phone: `+${digits}`, normalized: digits }
}

function parseArgs() {
  let clientId = process.env.BAMAKOR_CLIENT_ID || DEFAULT_CLIENT_ID
  let out = 'data/import-residents.sql'
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client-id' && argv[i + 1]) clientId = argv[++i]
    else if (argv[i] === '--out' && argv[i + 1]) out = argv[++i]
  }
  return { clientId, out }
}

function main() {
  const { clientId, out } = parseArgs()
  const jsonPath = path.resolve('data/parsed-residents.json')
  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as ParsedRow[]

  const valueLines: string[] = []
  const pdfProjects = new Set<string>()

  for (const r of rows) {
    pdfProjects.add(r.project_name)
    const { phone, normalized } = formatPhone(r.phone)
    valueLines.push(
      `  (${sqlStr(r.project_name)}, ${sqlStr(normalizeProjectNameForMatch(r.project_name))}, ${sqlStr(r.apartment_number)}, ${sqlStr(r.full_name)}, ${phone ? sqlStr(phone) : 'NULL'}, ${normalized ? sqlStr(normalized) : 'NULL'}, ${r.email ? sqlStr(r.email) : 'NULL'}, ${r.is_renter ? 'true' : 'false'}, ${r.notes ? sqlStr(r.notes) : 'NULL'})`
    )
  }

  const sql = `-- Bamakor: import missing residents from directory PDF (${rows.length} rows, ${pdfProjects.size} buildings)
-- client_id: ${clientId}
-- ראה data/README.md — מוסיף רק מי שחסר (לפי בניין+דירה+שם). הרץ BEGIN…COMMIT.

BEGIN;

-- Soft-delete empty placeholder rows from failed Excel import (optional)
UPDATE residents
SET deleted_at = NOW()
WHERE client_id = ${sqlStr(clientId)}::uuid
  AND deleted_at IS NULL
  AND full_name IN ('דייר ללא שם', 'דייר WhatsApp')
  AND (phone IS NULL OR phone = '');

WITH pdf_rows (
  pdf_project,
  pdf_project_norm,
  apartment_number,
  full_name,
  phone,
  normalized_phone,
  email,
  is_renter,
  notes
) AS (
  VALUES
${valueLines.join(',\n')}
),
projects_norm AS (
  SELECT
    p.id,
    p.name,
    lower(
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(trim(regexp_replace(p.name, '\\s+', ' ', 'g')), '\\s+([א-ת])$', '\\1'),
            '([0-9])\\s+([א-ת])', '\\1\\2', 'g'
          ),
          '\\s*-\\s*', ' ', 'g'
        )
      )
    ) AS norm_name
  FROM projects p
  WHERE p.client_id = ${sqlStr(clientId)}::uuid
    AND p.is_active = true
),
matched AS (
  SELECT
    pr.*,
    pn.id AS project_id,
    pn.name AS db_project_name
  FROM pdf_rows pr
  JOIN projects_norm pn ON pn.norm_name = pr.pdf_project_norm
),
not_in_db AS (
  SELECT m.*
  FROM matched m
  WHERE NOT EXISTS (
    SELECT 1 FROM residents r
    WHERE r.client_id = ${sqlStr(clientId)}::uuid
      AND r.deleted_at IS NULL
      AND r.project_id = m.project_id
      AND lower(trim(coalesce(r.apartment_number, ''))) = lower(trim(m.apartment_number))
      AND lower(trim(r.full_name)) = lower(trim(m.full_name))
  )
),
to_insert AS (
  SELECT DISTINCT ON (
    project_id,
    lower(trim(apartment_number)),
    lower(trim(full_name))
  )
    project_id,
    db_project_name,
    full_name,
    phone,
    normalized_phone,
    email,
    apartment_number,
    notes,
    is_renter
  FROM not_in_db
  ORDER BY
    project_id,
    lower(trim(apartment_number)),
    lower(trim(full_name))
)
INSERT INTO residents (
  client_id,
  project_id,
  full_name,
  phone,
  normalized_phone,
  email,
  apartment_number,
  notes,
  is_renter
)
SELECT
  ${sqlStr(clientId)}::uuid,
  project_id,
  full_name,
  phone,
  normalized_phone,
  email,
  NULLIF(trim(apartment_number), ''),
  notes,
  is_renter
FROM to_insert;

COMMIT;
`

  fs.writeFileSync(path.resolve(out), sql, 'utf-8')
  console.log(`Wrote ${rows.length} rows -> ${out}`)
  console.log(`PDF buildings: ${pdfProjects.size}`)
}

main()
