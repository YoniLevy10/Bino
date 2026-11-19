/** Next internal building code. BMK21 → BMK22. Codes that are not BMK + digits are ignored. */
export function nextBmkProjectCode(existingCodes: Iterable<string>): string {
  let max = 0
  for (const raw of existingCodes) {
    const match = String(raw || '')
      .trim()
      .toUpperCase()
      .match(/^BMK(\d+)$/)
    if (!match) continue
    const n = Number(match[1])
    if (Number.isFinite(n) && n > max) max = n
  }
  return `BMK${max + 1}`
}
