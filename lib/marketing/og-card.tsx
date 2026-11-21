import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import {
  BINO_OG_ALT,
  BINO_OG_IMAGE_VERSION,
  BINO_OG_SIZE,
  BINO_PUBLIC_HOST,
} from '@/lib/marketing/marketing-site'

export { BINO_OG_ALT, BINO_OG_IMAGE_VERSION, BINO_OG_SIZE }

/** Logical Hebrew (do not visually reverse — Satori 0.50+ + direction:rtl handles bidi). */
export const BINO_OG_HEADLINE = 'זיכרון תפעולי חכם לכל בניין'
export const BINO_OG_SUBLINE = 'לומדת · מחליטה · מונעת תקלות חוזרות · מוכיחה חיסכון'
export const BINO_OG_EYEBROW = 'לחברות ניהול בישראל'
export const BINO_OG_EN_TAGLINE = 'Building Intelligence & Operations'

type OgAssets = {
  heeboBold: Buffer
  heeboMedium: Buffer
  markPng: Buffer
  shotPng: Buffer
}

async function loadOgAssets(): Promise<OgAssets> {
  const root = process.cwd()
  const [heeboBold, heeboMedium, markPng, shotPng] = await Promise.all([
    readFile(join(root, 'app/fonts/Heebo-Bold.ttf')),
    readFile(join(root, 'app/fonts/Heebo-Medium.ttf')),
    readFile(join(root, 'public/bino-mark.png')),
    readFile(join(root, 'public/marketing/smart-assign.png')),
  ])
  return { heeboBold, heeboMedium, markPng, shotPng }
}

function dataUrlPng(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`
}

/** Build the OG card SVG with proper Hebrew RTL (Satori direction:rtl + Heebo). */
export async function renderBinoOgSvg(assets?: OgAssets): Promise<string> {
  const { heeboBold, heeboMedium, markPng, shotPng } = assets ?? (await loadOgAssets())
  const markSrc = dataUrlPng(markPng)
  const shotSrc = dataUrlPng(shotPng)

  return satori(
    (
      <div
        dir="rtl"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          direction: 'rtl',
          fontFamily: 'Heebo',
          color: '#ffffff',
          background: 'linear-gradient(160deg, #07111f 0%, #0d2748 42%, #0a4f9c 72%, #0a84ff 100%)',
        }}
      >
        {/* Atmosphere — landing hero glows */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            left: -40,
            width: 720,
            height: 520,
            borderRadius: 999,
            background: 'radial-gradient(ellipse at center, rgba(10,132,255,0.55) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -120,
            right: -60,
            width: 640,
            height: 480,
            borderRadius: 999,
            background: 'radial-gradient(ellipse at center, rgba(90,200,250,0.28) 0%, transparent 68%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.28,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 'auto -10% -30% -10%',
            height: '48%',
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.18), transparent 65%)',
            display: 'flex',
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '52px 56px',
            gap: 36,
          }}
        >
          {/* Copy column (RTL start = visual right) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              flex: 1,
              minWidth: 0,
              maxWidth: 620,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <img
                  src={markSrc}
                  width={64}
                  height={64}
                  alt=""
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div
                    dir="ltr"
                    style={{
                      fontSize: 52,
                      fontWeight: 700,
                      letterSpacing: '-0.04em',
                      lineHeight: 1,
                      direction: 'ltr',
                    }}
                  >
                    BINO
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 500, opacity: 0.82 }}>
                    {BINO_OG_EYEBROW}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  marginTop: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 46,
                    fontWeight: 700,
                    lineHeight: 1.22,
                    letterSpacing: '-0.01em',
                    maxWidth: 580,
                  }}
                >
                  {BINO_OG_HEADLINE}
                </div>
                <div
                  style={{
                    fontSize: 23,
                    fontWeight: 500,
                    lineHeight: 1.4,
                    opacity: 0.9,
                    maxWidth: 560,
                  }}
                >
                  {BINO_OG_SUBLINE}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                marginTop: 28,
              }}
            >
              <div
                dir="ltr"
                style={{
                  fontSize: 22,
                  fontWeight: 500,
                  opacity: 0.78,
                  letterSpacing: '0.02em',
                  direction: 'ltr',
                }}
              >
                {BINO_PUBLIC_HOST}
              </div>
              <div
                dir="ltr"
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  opacity: 0.62,
                  direction: 'ltr',
                }}
              >
                {BINO_OG_EN_TAGLINE}
              </div>
            </div>
          </div>

          {/* Product window — landing visual language (chrome stays LTR like a real browser) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 460,
              alignSelf: 'center',
              borderRadius: 22,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.28)',
              boxShadow: '0 32px 70px rgba(0,0,0,0.38)',
            }}
          >
            <div
              dir="ltr"
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'rgba(7,17,31,0.5)',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
                direction: 'ltr',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'row', gap: 7 }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: '#ff5f57' }} />
                <div style={{ width: 10, height: 10, borderRadius: 999, background: '#febc2e' }} />
                <div style={{ width: 10, height: 10, borderRadius: 999, background: '#28c840' }} />
              </div>
              <div style={{ fontSize: 14, opacity: 0.7 }}>{BINO_PUBLIC_HOST}</div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  opacity: 0.85,
                }}
              >
                BINO
              </div>
            </div>
            <img
              src={shotSrc}
              width={460}
              height={300}
              alt=""
              style={{
                width: 460,
                height: 300,
                objectFit: 'cover',
                objectPosition: 'top',
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      width: BINO_OG_SIZE.width,
      height: BINO_OG_SIZE.height,
      fonts: [
        { name: 'Heebo', data: heeboBold, weight: 700, style: 'normal' },
        { name: 'Heebo', data: heeboMedium, weight: 500, style: 'normal' },
      ],
    }
  )
}

export async function renderBinoOgPng(): Promise<Buffer> {
  const assets = await loadOgAssets()
  const svg = await renderBinoOgSvg(assets)
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: BINO_OG_SIZE.width },
    font: { loadSystemFonts: false },
  })
  return Buffer.from(resvg.render().asPng())
}

export function binoOgImagePath(): string {
  return `/opengraph-image?v=${BINO_OG_IMAGE_VERSION}`
}
