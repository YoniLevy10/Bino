# XLSX mitigation — 2026-10-03

## Problem

`npm audit` reported **high** issues in the SheetJS community package `xlsx@0.18.5` with **no fix available** on npm:

| Advisory | Issue |
|----------|--------|
| [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) | Prototype pollution |
| [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) | ReDoS |

Exposure path: **manager browser** Excel parse/export (import residents + styled downloads). Not payments / auth middleware.

`xlsx-js-style` (Apache-2.0 fork used for styled exports) bundled the same SheetJS-era parser and was removed together with `xlsx`.

## Decision

| Option | Choice |
|--------|--------|
| Library | **`exceljs@^4.4.0`** (MIT, maintained) |
| SheetJS Pro / community fork bump | Rejected — no npm fix for `xlsx@0.18.5`; Pro not in ecosystem |
| Server-only parse only | Not preferred — full client replace removes the vulnerable dependency from the bundle |

## Before / after

| | Before | After |
|--|--------|-------|
| Parse/export deps | `xlsx@^0.18.5`, `xlsx-js-style@^1.2.0` | `exceljs@^4.4.0` |
| Import residents | `XLSX.read` in browser | `parseWorkbookToMatrix` (ExcelJS + CSV helper) |
| Styled exports | `xlsx-js-style` cell styles | ExcelJS styles via `lib/excel-workbook.ts` + `lib/excel-style.ts` |

## Code map

- `lib/excel-workbook.ts` — create/add sheets, download, parse with size + magic-byte checks
- `lib/excel-style.ts` — Hebrew/RTL header + status/priority fills
- `lib/csv-matrix.ts` — browser-safe CSV matrix (BOM, `,` / `;`)
- `lib/import-residents-excel.ts` — async `parseResidentsWorkbook`
- Manager UI: tickets / residents / summary / attendance exports

## Hardening on import

- Max upload parse size: **5 MB** (`MAX_IMPORT_BYTES`)
- Reject OLE legacy **`.xls`** (magic `D0 CF 11 E0`) with Hebrew error — save as xlsx/csv
- Accept **`.xlsx`** (ZIP/`PK`) and **`.csv`**
- File picker accept list updated (no `.xls`)

## Residual risk

1. **ExcelJS / transitive deps** — still a large OOXML parser. At mitigation time `npm audit` no longer flags the SheetJS prototype-pollution / ReDoS highs; exceljs may still pull a **moderate** `uuid` advisory (fix would require exceljs major downgrade — not taken).
2. **Legacy `.xls` unsupported** — managers must re-save as `.xlsx` or `.csv`.
3. **Client-side parse remains** — authenticated managers only; size + magic checks reduce abuse surface but do not move parse to the server.
4. **CSV edge cases** — lightweight parser (quoted fields, `,`/`;`); exotic encodings beyond UTF-8 may need save-as-xlsx.

## Tests

- `lib/import-residents-excel.test.ts` — Hebrew mapping + xlsx round-trip via ExcelJS + CSV + reject oversized/OLE
- `lib/csv-matrix.test.ts` — BOM, semicolon, quoted commas

## Out of scope

Payments, auth middleware, customer data migrations — untouched.
