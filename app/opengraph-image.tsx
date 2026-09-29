import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'BINO — זיכרון תפעולי חכם לבניינים'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage() {
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
          background: 'linear-gradient(155deg, #07111f 0%, #0d2748 45%, #0a84ff 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            opacity: 0.45,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
          <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: '-0.06em', lineHeight: 0.9 }}>
            BINO
          </div>
          <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em', maxWidth: 820 }}>
            זיכרון תפעולי חכם לכל בניין
          </div>
          <div style={{ fontSize: 24, opacity: 0.88, maxWidth: 780, lineHeight: 1.35 }}>
            לומדת · מחליטה · מונעת תקלות חוזרות · מוכיחה חיסכון
          </div>
          <div style={{ marginTop: 12, fontSize: 20, opacity: 0.7, letterSpacing: '0.04em' }}>
            bino.casa
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
