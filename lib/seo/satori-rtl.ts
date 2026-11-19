/**
 * next/og (Satori) paints glyphs left-to-right and does not reshape BiDi.
 * For Hebrew-only lines, reverse all code points so the PNG reads correctly.
 * For mixed Latin+Hebrew, reverse only Hebrew letter runs.
 */
export function satoriVisualRtl(text: string): string {
  if (!/[A-Za-z0-9]/.test(text)) {
    return Array.from(text).reverse().join('')
  }
  return text.replace(/[\u0590-\u05FF\uFB1D-\uFB4F]+/g, (run) =>
    Array.from(run).reverse().join('')
  )
}
