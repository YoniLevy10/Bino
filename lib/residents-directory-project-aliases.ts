import { normalizeProjectNameForMatch } from '@/lib/parse-residents-directory-pdf'

/**
 * PDF directory uses "מקור חיים NN" but Bamakor projects may be named "קוואדרה … NN".
 * Keys = exact project_name from parsed PDF.
 */
export const RESIDENTS_DIRECTORY_PDF_TO_DB_PROJECT: Record<string, string> = {
  'מקור חיים 37': 'קוואדרה- קוואדרה 37',
  'מקור חיים 39': 'קוואדרה- קוואדרה 39',
  'מקור חיים 41': 'קוואדרה- קוואדרה 41',
  'מקור חיים 43': 'קוואדרה- קוואדרה 43',
}

/** DB project name to match for a PDF building header (alias or same name). */
export function dbProjectNameForPdfImport(pdfName: string): string {
  return RESIDENTS_DIRECTORY_PDF_TO_DB_PROJECT[pdfName] ?? pdfName
}

/** Normalized name used when joining PDF rows to projects.name. */
export function matchNormForPdfProject(pdfName: string): string {
  return normalizeProjectNameForMatch(dbProjectNameForPdfImport(pdfName))
}
