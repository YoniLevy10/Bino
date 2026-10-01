/** Turn "Bamakor_Residents_Notice.pdf" into a readable title for residents. */
export function residentDocumentDisplayName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  const spaced = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return spaced || fileName
}
