'use client'

/**
 * Public building-decision signature page (Wave 4 MVP).
 * Lives under /intake/* so middleware already allows unauthenticated access.
 * Simple canvas pad (no signature_pad package yet — Wave 4b polish).
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useParams } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/shared/fetch-with-timeout'
import { getIsMobileViewport } from '@/lib/shared/mobile-viewport'
import { theme } from '@/app/components/ui'

type Payload = {
  request: {
    id: string
    signer_name: string
    status: string
    signed_at: string | null
  }
  decision: { id: string; title: string; body: string | null; status: string } | null
  project: { id: string; name: string; address: string | null } | null
}

const CANVAS_HEIGHT_DESKTOP = 180
const CANVAS_HEIGHT_MOBILE = 260

export default function BuildingSignPage() {
  const params = useParams()
  const token = typeof params?.token === 'string' ? params.token : ''
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [isMobile, setIsMobile] = useState(false)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const canvasHeight = isMobile ? CANVAS_HEIGHT_MOBILE : CANVAS_HEIGHT_DESKTOP

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(`/api/public/building-sign/${encodeURIComponent(token)}`)
      const json = (await res.json()) as Payload & { error?: string }
      if (!res.ok) throw new Error(json.error || `שגיאה ${res.status}`)
      setData(json)
      if (json.request?.status === 'signed') setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'טעינה נכשלה')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || done) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const ratio = window.devicePixelRatio || 1
    const w = Math.max(1, canvas.clientWidth)
    const h = canvasHeight
    canvas.width = Math.floor(w * ratio)
    canvas.height = Math.floor(h * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = isMobile ? 2.5 : 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [done, data, canvasHeight, isMobile])

  useEffect(() => {
    setupCanvas()
  }, [setupCanvas])

  useEffect(() => {
    const onResize = () => setupCanvas()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setupCanvas])

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || done) return
    e.preventDefault()
    drawing.current = true
    canvas.setPointerCapture(e.pointerId)
    const { x, y } = pointerPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pointerPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  function clearPad() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.clientWidth, canvasHeight)
  }

  async function submit() {
    const canvas = canvasRef.current
    if (!canvas || !token) return
    const blank = document.createElement('canvas')
    blank.width = canvas.width
    blank.height = canvas.height
    const blankCtx = blank.getContext('2d')
    if (blankCtx) {
      blankCtx.fillStyle = '#ffffff'
      blankCtx.fillRect(0, 0, blank.width, blank.height)
    }
    if (canvas.toDataURL() === blank.toDataURL()) {
      setError('נא לחתום על הלוח לפני שליחה')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(`/api/public/building-sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_data_url: canvas.toDataURL('image/png') }),
      })
      const json = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) throw new Error(json.error || `שגיאה ${res.status}`)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main
      style={{
        ...styles.page,
        ...(isMobile ? styles.pageMobile : null),
      }}
      dir="rtl"
    >
      <div
        style={{
          ...styles.card,
          ...(isMobile ? styles.cardMobile : null),
        }}
      >
        <p style={styles.brand}>BINO · חתימה על החלטת בניין</p>
        {loading ? (
          <p style={styles.muted}>טוען…</p>
        ) : error && !data ? (
          <p style={styles.error}>{error}</p>
        ) : data ? (
          <>
            <h1
              style={{
                ...styles.title,
                ...(isMobile ? styles.titleMobile : null),
              }}
            >
              {data.decision?.title || 'החלטה'}
            </h1>
            {data.project?.name ? (
              <p style={styles.muted}>
                {data.project.name}
                {data.project.address ? ` · ${data.project.address}` : ''}
              </p>
            ) : null}
            {data.decision?.body ? <p style={styles.body}>{data.decision.body}</p> : null}
            <p style={styles.signer}>חותם: {data.request.signer_name}</p>

            {done ? (
              <p style={styles.success}>החתימה נקלטה בהצלחה. תודה.</p>
            ) : (
              <>
                <p style={styles.hint}>חתמו באצבע בתוך המסגרת (ניתן לסובב את המכשיר לרוחב):</p>
                <div style={styles.canvasWrap}>
                  <canvas
                    ref={canvasRef}
                    style={{
                      ...styles.canvas,
                      height: canvasHeight,
                    }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  />
                </div>
                {error ? <p style={styles.error}>{error}</p> : null}
                <div
                  style={{
                    ...styles.actions,
                    ...(isMobile ? styles.actionsMobile : null),
                  }}
                >
                  <button
                    type="button"
                    style={{
                      ...styles.secondaryBtn,
                      ...(isMobile ? styles.btnFull : null),
                    }}
                    onClick={clearPad}
                  >
                    ניקוי
                  </button>
                  <button
                    type="button"
                    style={{
                      ...styles.primaryBtn,
                      ...(isMobile ? styles.btnFull : null),
                    }}
                    disabled={submitting}
                    onClick={() => void submit()}
                  >
                    {submitting ? 'שולח…' : 'אישור חתימה'}
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </main>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100dvh',
    margin: 0,
    padding: 20,
    paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
    paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))',
    background: theme.colors.background,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  pageMobile: {
    padding: 12,
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
  },
  card: {
    width: 'min(520px, 100%)',
    marginTop: 24,
    padding: 24,
    borderRadius: theme.radius.xl,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    display: 'grid',
    gap: 12,
    boxSizing: 'border-box',
  },
  cardMobile: {
    marginTop: 8,
    padding: 16,
    width: '100%',
    borderRadius: theme.radius.lg,
  },
  brand: {
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
    color: theme.colors.primary,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: theme.colors.textPrimary,
    lineHeight: 1.3,
    wordBreak: 'break-word',
  },
  titleMobile: {
    fontSize: 20,
  },
  muted: { margin: 0, fontSize: 14, color: theme.colors.textSecondary, wordBreak: 'break-word' },
  body: {
    margin: 0,
    fontSize: 14,
    color: theme.colors.textPrimary,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  signer: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  hint: { margin: 0, fontSize: 13, color: theme.colors.textMuted },
  canvasWrap: {
    width: '100%',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  },
  canvas: {
    width: '100%',
    display: 'block',
    borderRadius: theme.radius.md,
    border: `2px solid ${theme.colors.borderStrong}`,
    touchAction: 'none',
    background: '#fff',
    cursor: 'crosshair',
  },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  actionsMobile: {
    flexDirection: 'column-reverse',
  },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    border: 'none',
    borderRadius: theme.radius.md,
    background: theme.colors.primary,
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  secondaryBtn: {
    minHeight: 48,
    padding: '0 16px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontWeight: 600,
    fontSize: 16,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnFull: {
    width: '100%',
  },
  error: { margin: 0, color: theme.colors.error, fontSize: 14 },
  success: {
    margin: 0,
    padding: 14,
    borderRadius: theme.radius.md,
    background: theme.colors.blueSoft,
    color: theme.colors.primary,
    fontWeight: 600,
  },
}
