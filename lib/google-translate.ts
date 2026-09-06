import { fetchWithTimeout } from '@/lib/fetch-timeout'

/**
 * Google Translate gtx endpoint (auto-detect → Hebrew).
 * Shared by manager translate, worker translate, and WhatsApp webhook search.
 */
export async function translateToHebrew(text: string, timeoutMs = 8_000): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=he&dt=t&q=` +
    encodeURIComponent(text)
  const res = await fetchWithTimeout(url, {}, timeoutMs)
  if (!res) throw new Error('Google Translate timeout')
  if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`)
  // Response: [ [ ["translated","original",...], ... ], null, "detected_lang" ]
  const data = (await res.json()) as unknown[][]
  const segments = data[0] as unknown[][]
  return segments.map((s) => String((s as unknown[])[0] ?? '')).join('').trim()
}
