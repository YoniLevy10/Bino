import React from 'react'
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { loadFont } from '@remotion/google-fonts/Heebo'

const { fontFamily } = loadFont()

const BLUE = '#0066FF'
const BG_TOP = '#0B1220'
const BG_BOTTOM = '#152238'
const TEXT = '#F8FAFC'
const MUTED = '#94A3B8'

function fadeSlide(
  frame: number,
  fps: number,
  start: number,
  enterDuration = 12
) {
  const local = frame - start
  const opacity = interpolate(local, [0, enterDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const y = interpolate(local, [0, enterDuration], [28, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = spring({
    frame: Math.max(0, local),
    fps,
    config: { damping: 18, stiffness: 120 },
  })
  return { opacity, transform: `translateY(${y}px) scale(${0.96 + scale * 0.04})` }
}

function SceneShell({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(165deg, ${BG_TOP} 0%, ${BG_BOTTOM} 100%)`,
        fontFamily,
        direction: 'rtl',
        color: TEXT,
        padding: '96px 64px',
        justifyContent: 'center',
        alignItems: 'stretch',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(0,102,255,0.28), transparent 60%)',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 28 }}>
        {children}
      </div>
    </AbsoluteFill>
  )
}

export const BamakorPromo: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Scene windows (frames)
  const s1 = 0
  const s2 = 3 * fps
  const s3 = 8 * fps
  const s4 = 13 * fps

  const show1 = frame < s2 + 8
  const show2 = frame >= s2 - 6 && frame < s3 + 8
  const show3 = frame >= s3 - 6 && frame < s4 + 8
  const show4 = frame >= s4 - 6

  return (
    <AbsoluteFill style={{ background: BG_TOP }}>
      {show1 && (
        <AbsoluteFill style={{ opacity: interpolate(frame, [s2 - 6, s2 + 4], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <SceneShell>
            <div style={fadeSlide(frame, fps, s1)}>
              <div style={{ fontSize: 72, fontWeight: 900, color: BLUE, letterSpacing: '-0.04em', marginBottom: 20 }}>
                במקור
              </div>
              <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.25, letterSpacing: '-0.03em', maxWidth: 900 }}>
                תקלות, דיירים ועובדים — בלי לנהל את זה בצ׳אטים פזורים
              </div>
            </div>
          </SceneShell>
        </AbsoluteFill>
      )}

      {show2 && (
        <AbsoluteFill
          style={{
            opacity: interpolate(
              frame,
              [s2 - 4, s2 + 6, s3 - 6, s3 + 4],
              [0, 1, 1, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            ),
          }}
        >
          <SceneShell>
            <div style={{ ...fadeSlide(frame, fps, s2), fontSize: 40, fontWeight: 800, marginBottom: 12 }}>
              מה מקבלים ביומיום
            </div>
            {[
              'דיווח עם תמונה וסרטון',
              'תרגום תקלות למשתמשי המערכת',
              'שיחה עם דיירים מתוך המערכת',
            ].map((line, i) => (
              <div
                key={line}
                style={{
                  ...fadeSlide(frame, fps, s2 + 8 + i * 10),
                  fontSize: 36,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  padding: '18px 22px',
                  borderRight: `4px solid ${BLUE}`,
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                {line}
              </div>
            ))}
          </SceneShell>
        </AbsoluteFill>
      )}

      {show3 && (
        <AbsoluteFill
          style={{
            opacity: interpolate(
              frame,
              [s3 - 4, s3 + 6, s4 - 6, s4 + 4],
              [0, 1, 1, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            ),
          }}
        >
          <SceneShell>
            <div style={{ ...fadeSlide(frame, fps, s3), fontSize: 40, fontWeight: 800 }}>
              איך זה עובד
            </div>
            <div
              style={{
                ...fadeSlide(frame, fps, s3 + 10),
                display: 'flex',
                flexDirection: 'column',
                gap: 22,
                marginTop: 12,
              }}
            >
              {['דייר מדווח ב-WhatsApp', 'המשרד מנהל את התקלה', 'עובד שטח מקבל ומטפל'].map(
                (step, i) => (
                  <div
                    key={step}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 18,
                      fontSize: 38,
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 14,
                        background: BLUE,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 28,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                )
              )}
            </div>
          </SceneShell>
        </AbsoluteFill>
      )}

      {show4 && (
        <AbsoluteFill
          style={{
            opacity: interpolate(frame, [s4 - 4, s4 + 8], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <SceneShell style={{ justifyContent: 'center' }}>
            <div style={{ ...fadeSlide(frame, fps, s4), textAlign: 'center', alignItems: 'center' }}>
              <div style={{ fontSize: 64, fontWeight: 900, color: BLUE, marginBottom: 24 }}>במקור</div>
              <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.4, marginBottom: 28, color: TEXT }}>
                הקמה חד־פעמית + מנוי חודשי
                <br />
                <span style={{ color: MUTED, fontSize: 32, fontWeight: 500 }}>לפי היקף הבניינים</span>
              </div>
              <div
                style={{
                  ...fadeSlide(frame, fps, s4 + 14),
                  marginTop: 20,
                  padding: '22px 28px',
                  borderRadius: 16,
                  background: BLUE,
                  fontSize: 34,
                  fontWeight: 800,
                  display: 'inline-block',
                }}
              >
                לחצו על כפתור יצירת הקשר בדף
              </div>
            </div>
          </SceneShell>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
