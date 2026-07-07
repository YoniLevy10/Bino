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

function buildPdfEnrichedCte(clientId: string, valueLines: string[]): string {
  const cid = sqlStr(clientId)
  return `WITH pdf_rows (
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
  WHERE p.client_id = ${cid}::uuid
    AND p.is_active = true
),
matched AS (
  SELECT
    pr.*,
    pn.id AS project_id,
    pn.name AS db_project_name
  FROM pdf_rows pr
  LEFT JOIN projects_norm pn ON pn.norm_name = pr.pdf_project_norm
),
enriched AS (
  SELECT
    m.*,
    (
      m.project_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM residents r
        WHERE r.client_id = ${cid}::uuid
          AND r.deleted_at IS NULL
          AND r.project_id = m.project_id
          AND (
            (
              m.normalized_phone IS NOT NULL
              AND (r.normalized_phone = m.normalized_phone OR r.phone = m.phone)
              AND lower(trim(coalesce(r.apartment_number, ''))) = lower(trim(m.apartment_number))
            )
            OR (
              m.normalized_phone IS NULL
              AND lower(trim(coalesce(r.apartment_number, ''))) = lower(trim(m.apartment_number))
              AND lower(trim(r.full_name)) = lower(trim(m.full_name))
            )
          )
      )
    ) AS in_db
  FROM matched m
)`
}

function writeVerifySqlFiles(
  clientId: string,
  valueLines: string[],
  rowCount: number,
  buildingCount: number
) {
  const cte = buildPdfEnrichedCte(clientId, valueLines)
  const header = `-- Bamakor PDF vs DB (${rowCount} rows, ${buildingCount} buildings)
-- client_id: ${clientId}
-- Supabase: העתק והרץ קובץ אחד בכל פעם (שאילתה בודדת).
`

  fs.writeFileSync(
    path.resolve('data/verify-residents-summary.sql'),
    `${header}-- שלב 1: סיכום — כמה חסרים?
${cte}
SELECT
  COUNT(*) AS pdf_total_rows,
  COUNT(*) FILTER (WHERE project_id IS NOT NULL) AS pdf_matched_to_project,
  COUNT(*) FILTER (WHERE in_db) AS already_in_db,
  COUNT(*) FILTER (WHERE project_id IS NOT NULL AND NOT in_db) AS missing_count,
  COUNT(*) FILTER (WHERE project_id IS NULL) AS pdf_unmatched_building_rows
FROM enriched;
`
  )

  fs.writeFileSync(
    path.resolve('data/verify-residents-missing-list.sql'),
    `${header}-- שלב 2: רשימת חסרים (ריק = הכל קיים)
${cte}
SELECT
  db_project_name AS building,
  apartment_number AS apt,
  full_name,
  phone,
  is_renter
FROM enriched
WHERE project_id IS NOT NULL AND NOT in_db
ORDER BY db_project_name, apartment_number, full_name;
`
  )

  fs.writeFileSync(
    path.resolve('data/verify-residents-by-building.sql'),
    `${header}-- שלב 3: לפי בניין
${cte}
SELECT
  COALESCE(db_project_name, pdf_project) AS building,
  COUNT(*) AS pdf_rows,
  COUNT(*) FILTER (WHERE in_db) AS in_db_rows,
  COUNT(*) FILTER (WHERE project_id IS NOT NULL AND NOT in_db) AS missing_rows
FROM enriched
GROUP BY COALESCE(db_project_name, pdf_project)
ORDER BY 1;
`
  )

  fs.writeFileSync(
    path.resolve('data/verify-residents-missing.sql'),
    `${header}-- השתמשו ב-3 הקבצים הנפרדים (כל אחד = Run אחד):
--   1) verify-residents-summary.sql
--   2) verify-residents-missing-list.sql
--   3) verify-residents-by-building.sql
`
  )
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

  const sql = `-- Bamakor: import residents from directory PDF (${rows.length} rows, ${pdfProjects.size} buildings)
-- Run in Supabase SQL Editor. Does NOT create projects — only matches existing project names.
-- client_id: ${clientId}
--
-- 1) Run data/drop-resident-global-phone-unique.sql (allows same phone in multiple apartments).
-- 2) Review unmatched buildings (should return 0 rows): data/preview-unmatched-buildings.sql
-- 3) Run full script (BEGIN…COMMIT).

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
      AND (
        (
          m.normalized_phone IS NOT NULL
          AND (r.normalized_phone = m.normalized_phone OR r.phone = m.phone)
          AND lower(trim(coalesce(r.apartment_number, ''))) = lower(trim(m.apartment_number))
        )
        OR (
          m.normalized_phone IS NULL
          AND lower(trim(coalesce(r.apartment_number, ''))) = lower(trim(m.apartment_number))
          AND lower(trim(r.full_name)) = lower(trim(m.full_name))
        )
      )
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

-- ── Verification (run after commit) ────────────────────────────────────────

-- Count by building
SELECT p.name, COUNT(r.id) AS residents
FROM projects p
LEFT JOIN residents r ON r.project_id = p.id AND r.deleted_at IS NULL
WHERE p.client_id = ${sqlStr(clientId)}::uuid
  AND p.is_active = true
GROUP BY p.name
ORDER BY p.name;

-- PDF buildings with no matching project (should be empty)
WITH pdf_projects AS (
  SELECT unnest(ARRAY[
${[...pdfProjects].map((p) => `    ${sqlStr(normalizeProjectNameForMatch(p))}`).join(',\n')}
  ]) AS match_norm
),
projects_norm AS (
  SELECT lower(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(trim(regexp_replace(name, '\\s+', ' ', 'g')), '\\s+([א-ת])$', '\\1'),
          '([0-9])\\s+([א-ת])', '\\1\\2', 'g'
        ),
        '\\s*-\\s*', ' ', 'g'
      )
    )
  ) AS norm_name
  FROM projects
  WHERE client_id = ${sqlStr(clientId)}::uuid AND is_active = true
)
SELECT pp.match_norm AS unmatched_pdf_building_norm
FROM pdf_projects pp
LEFT JOIN projects_norm pn ON pn.norm_name = pp.match_norm
WHERE pn.norm_name IS NULL;
`

  fs.writeFileSync(path.resolve(out), sql, 'utf-8')

  const previewLines = [...pdfProjects].map((p) => {
    return `    (${sqlStr(p)}, ${sqlStr(normalizeProjectNameForMatch(p))})`
  })

  const previewSql = `-- Run BEFORE import — should return 0 rows.
-- Rename קוואדרה → מקור חיים first: data/rename-kvadrat-to-makor-chaim.sql
WITH pdf_map AS (
  SELECT * FROM (VALUES
${previewLines.join(',\n')}
  ) AS t(pdf_name, match_norm)
),
db_norm AS (
  SELECT
    name,
    lower(trim(regexp_replace(regexp_replace(
      regexp_replace(trim(regexp_replace(name, '\\s+', ' ', 'g')), '\\s+([א-ת])$', '\\1'),
      '([0-9])\\s+([א-ת])', '\\1\\2', 'g'), '\\s*-\\s*', ' ', 'g'))) AS norm
  FROM projects
  WHERE client_id = ${sqlStr(clientId)}::uuid AND is_active = true
)
SELECT p.pdf_name AS building_in_pdf_not_in_db
FROM pdf_map p
LEFT JOIN db_norm d ON d.norm = p.match_norm
WHERE d.norm IS NULL;
`
  fs.writeFileSync(path.resolve('data/preview-unmatched-buildings.sql'), previewSql, 'utf-8')

  writeVerifySqlFiles(clientId, valueLines, rows.length, pdfProjects.size)

  console.log(`Wrote ${rows.length} rows -> ${out}`)
  console.log(`Wrote verify -> data/verify-residents-summary.sql (+ missing-list, by-building)`)
  console.log(`PDF buildings: ${pdfProjects.size}`)
}

main()
