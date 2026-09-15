import { ImageResponse } from 'next/og'

export const alt = 'BINO — זיכרון תפעולי חכם לבניינים'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

async function loadHeebo(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/fontsource/fonts/heebo@5.2.5/hebrew-700-normal.woff',
      { next: { revalidate: 60 * 60 * 24 * 30 } }
    )
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

export default async function OpenGraphImage() {
  const fontData = await loadHeebo()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '64px 72px',
          background:
            'linear-gradient(165deg, #0b1220 0%, #123a7a 48%, #0066ff 100%)',
          color: '#fff',
          fontFamily: fontData ? 'Heebo' : 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.35,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            maxWidth: 900,
          }}
        >
          <div
            style={{
              fontSize: 92,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 0.95,
            }}
          >
            BINO
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 600,
              lineHeight: 1.25,
              letterSpacing: '-0.02em',
              maxWidth: 760,
            }}
          >
            זיכרון תפעולי חכם לכל בניין
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 400,
              opacity: 0.9,
              lineHeight: 1.4,
              maxWidth: 720,
            }}
          >
            לומדת · מחליטה · מונעת כשלים · מוכיחה חיסכון
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [
            {
              name: 'Heebo',
              data: fontData,
              style: 'normal' as const,
              weight: 700 as const,
            },
          ]
        : [],
    }
  )
}
