/**
 * Rasterize template SVG creatives to PNG for Meta upload.
 * Prefer sharp when available; fallback encodes a minimal valid PNG placeholder
 * only in mock — live mode requires sharp.
 */
export async function svgToPngBuffer(svg: string): Promise<Buffer> {
  try {
    // Dynamic import — optional dependency for production image pipeline
    const sharpMod = await import('sharp').catch(() => null)
    if (sharpMod) {
      const sharp = sharpMod.default
      return await sharp(Buffer.from(svg)).png().toBuffer()
    }
  } catch {
    // fall through
  }

  if ((process.env.META_MODE ?? 'mock') === 'live') {
    throw new Error(
      'נדרש sharp להמרת קריאייטיב ל-PNG לפני העלאה ל-Meta. התקן sharp או העלה PNG ידנית.'
    )
  }

  // 1x1 transparent PNG — mock only
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
}
