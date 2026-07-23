import { timingSafeEqual } from 'node:crypto'

/** Constant-time string compare for shared secrets (pads via length check first). */
export function secureStringEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, 'utf8')
    const right = Buffer.from(b, 'utf8')
    if (left.length !== right.length) return false
    return timingSafeEqual(left, right)
  } catch {
    return false
  }
}
