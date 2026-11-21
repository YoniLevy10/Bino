import {
  BINO_OG_ALT,
  BINO_OG_SIZE,
  renderBinoOgPng,
} from '@/lib/marketing/og-card'

/** Node runtime: Satori 0.63 RTL + @resvg/resvg-js (bundled next/og Satori lacks Hebrew bidi). */
export const runtime = 'nodejs'
export const alt = BINO_OG_ALT
export const size = BINO_OG_SIZE
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  const png = await renderBinoOgPng()
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
