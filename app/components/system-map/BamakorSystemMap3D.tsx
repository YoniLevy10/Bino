'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { theme } from '../ui'

type NodeGroup = 'core' | 'people' | 'integrations' | 'data' | 'platform'

type SystemNode = {
  id: string
  label: string
  sub?: string
  x: number
  y: number
  z: number
  group: NodeGroup
}

type SystemEdge = { from: string; to: string }

const GROUP_COLORS: Record<NodeGroup, string> = {
  core: theme.colors.primary,
  people: '#7C3AED',
  integrations: '#0EA5E9',
  data: '#34C759',
  platform: '#FF9500',
}

const GROUP_LABELS: Record<NodeGroup, string> = {
  core: 'ליבה — ניהול תקלות',
  people: 'אנשים ונכסים',
  integrations: 'ערוצי תקשורת',
  data: 'נתונים',
  platform: 'תשתית',
}

const NODES: SystemNode[] = [
  { id: 'dashboard', label: 'לוח בקרה', sub: '/', x: -3.2, y: 0.6, z: -0.8, group: 'core' },
  { id: 'tickets', label: 'תקלות', sub: '/tickets', x: -1.6, y: 0.6, z: 0.4, group: 'core' },
  { id: 'summary', label: 'סיכום', sub: '/summary', x: 0, y: 0.6, z: -0.2, group: 'core' },
  { id: 'projects', label: 'פרויקטים', sub: '/projects', x: 1.6, y: 0.6, z: 0.6, group: 'core' },
  { id: 'calendar', label: 'יומן', sub: '/calendar', x: 3.2, y: 0.6, z: -0.4, group: 'core' },

  { id: 'workers', label: 'עובדים', sub: '/workers', x: -2.8, y: -0.5, z: 1.2, group: 'people' },
  { id: 'residents', label: 'דיירים', sub: '/residents', x: -1, y: -0.5, z: 1.6, group: 'people' },
  { id: 'professionals', label: 'אנשי מקצוע', sub: '/professionals', x: 1, y: -0.5, z: 1.4, group: 'people' },
  { id: 'attendance', label: 'נוכחות', sub: '/attendance', x: 2.8, y: -0.5, z: 1, group: 'people' },

  { id: 'whatsapp', label: 'WhatsApp', sub: 'Meta webhook', x: -2.4, y: 1.8, z: -1.2, group: 'integrations' },
  { id: 'sms', label: 'SMS', sub: '019SMS', x: -0.8, y: 1.8, z: -1.6, group: 'integrations' },
  { id: 'push', label: 'Web Push', sub: 'VAPID', x: 0.8, y: 1.8, z: -1.4, group: 'integrations' },
  { id: 'cron', label: 'Cron', sub: 'SLA · retry', x: 2.4, y: 1.8, z: -1, group: 'integrations' },

  { id: 'supabase', label: 'Supabase', sub: 'Postgres + RLS', x: 0, y: -1.6, z: 0, group: 'data' },
  { id: 'auth', label: 'Auth', sub: 'multi-tenant', x: -1.8, y: -1.6, z: -0.6, group: 'data' },
  { id: 'storage', label: 'Storage', sub: 'קבצים', x: 1.8, y: -1.6, z: 0.4, group: 'data' },

  { id: 'vercel', label: 'Vercel', sub: 'App + API', x: -1.2, y: -2.8, z: -0.8, group: 'platform' },
  { id: 'billing', label: 'חיוב', sub: '/billing', x: 1.2, y: -2.8, z: 0.6, group: 'platform' },
]

const EDGES: SystemEdge[] = [
  { from: 'dashboard', to: 'tickets' },
  { from: 'tickets', to: 'summary' },
  { from: 'tickets', to: 'workers' },
  { from: 'tickets', to: 'residents' },
  { from: 'tickets', to: 'projects' },
  { from: 'tickets', to: 'whatsapp' },
  { from: 'tickets', to: 'sms' },
  { from: 'tickets', to: 'push' },
  { from: 'cron', to: 'tickets' },
  { from: 'cron', to: 'whatsapp' },
  { from: 'cron', to: 'sms' },
  { from: 'whatsapp', to: 'supabase' },
  { from: 'sms', to: 'supabase' },
  { from: 'workers', to: 'supabase' },
  { from: 'residents', to: 'supabase' },
  { from: 'projects', to: 'supabase' },
  { from: 'auth', to: 'supabase' },
  { from: 'storage', to: 'supabase' },
  { from: 'vercel', to: 'auth' },
  { from: 'billing', to: 'supabase' },
  { from: 'attendance', to: 'workers' },
  { from: 'professionals', to: 'tickets' },
]

const CUBE = 72
const GAP = 28

function nodePosition(node: SystemNode) {
  return {
    x: node.x * (CUBE + GAP),
    y: -node.y * (CUBE + GAP),
    z: node.z * (CUBE + GAP),
  }
}

function WireCube({
  node,
  selected,
  onSelect,
}: {
  node: SystemNode
  selected: boolean
  onSelect: (id: string) => void
}) {
  const color = GROUP_COLORS[node.group]
  const { x, y, z } = nodePosition(node)
  const half = CUBE / 2

  const faceBase: CSSProperties = {
    position: 'absolute',
    width: CUBE,
    height: CUBE,
    border: `1.5px solid ${color}`,
    background: selected ? `${color}22` : `${color}08`,
    boxShadow: selected ? `0 0 24px ${color}55` : 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: 6,
    boxSizing: 'border-box',
    backfaceVisibility: 'visible',
    pointerEvents: 'none',
  }

  return (
    <button
      type="button"
      aria-label={node.label}
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
      style={{
        position: 'absolute',
        width: CUBE,
        height: CUBE,
        transformStyle: 'preserve-3d',
        transform: `translate3d(${x - half}px, ${y - half}px, ${z}px)`,
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <div style={{ ...faceBase, transform: `rotateY(0deg) translateZ(${half}px)` }}>
        <span style={cubeLabelStyle}>{node.label}</span>
      </div>
      <div style={{ ...faceBase, transform: `rotateY(180deg) translateZ(${half}px)` }} />
      <div style={{ ...faceBase, transform: `rotateY(90deg) translateZ(${half}px)` }}>
        <span style={cubeSubStyle}>{node.sub}</span>
      </div>
      <div style={{ ...faceBase, transform: `rotateY(-90deg) translateZ(${half}px)` }} />
      <div style={{ ...faceBase, transform: `rotateX(90deg) translateZ(${half}px)` }} />
      <div style={{ ...faceBase, transform: `rotateX(-90deg) translateZ(${half}px)` }} />
      {/* wireframe edges glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          border: `1px solid ${color}66`,
          transform: `translateZ(${half}px)`,
          pointerEvents: 'none',
        }}
      />
    </button>
  )
}

const cubeLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#E8EEF9',
  textAlign: 'center',
  lineHeight: 1.2,
}

const cubeSubStyle: CSSProperties = {
  fontSize: 9,
  color: '#94A3B8',
  direction: 'ltr',
  textAlign: 'center',
}

export function BamakorSystemMap3D() {
  const [rotX, setRotX] = useState(-18)
  const [rotY, setRotY] = useState(32)
  const [selectedId, setSelectedId] = useState<string | null>('tickets')
  const [dragging, setDragging] = useState(false)
  const [autoRotate, setAutoRotate] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const dragRef = useRef({ x: 0, y: 0, rotX: -18, rotY: 32 })
  const frameRef = useRef<number | null>(null)

  const tick = useCallback(() => {
    if (autoRotate && !dragging) {
      setRotY((y) => y + 0.12)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [autoRotate, dragging])

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [tick])

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    setDragging(true)
    setAutoRotate(false)
    dragRef.current = { x: e.clientX, y: e.clientY, rotX, rotY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setRotY(dragRef.current.rotY + dx * 0.4)
    setRotX(Math.max(-60, Math.min(60, dragRef.current.rotX - dy * 0.35)))
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const selected = NODES.find((n) => n.id === selectedId)
  const connected = selected
    ? EDGES.filter((e) => e.from === selected.id || e.to === selected.id).map((e) =>
        e.from === selected.id ? e.to : e.from
      )
    : []

  return (
    <div style={styles.page} dir="rtl">
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>שלד ויזואלי 3D — Bamakor</h1>
          <p style={styles.subtitle}>
            מפת ארכיטקטורה אינטראקטיבית: מודולים, ערוצי תקשורת ושכבת נתונים. גררו לסיבוב.
          </p>
        </div>
        <div style={styles.headerActions}>
          <button
            type="button"
            style={styles.chip}
            onClick={() => {
              setRotX(-18)
              setRotY(32)
              setAutoRotate(true)
            }}
          >
            איפוס מבט
          </button>
          <button
            type="button"
            style={{ ...styles.chip, ...(autoRotate ? styles.chipActive : {}) }}
            onClick={() => setAutoRotate((v) => !v)}
          >
            {autoRotate ? 'סיבוב אוטומטי · פעיל' : 'סיבוב אוטומטי · כבוי'}
          </button>
        </div>
      </header>

      <div
        style={{
          ...styles.layout,
          gridTemplateColumns: isMobile ? '1fr' : '1fr 300px',
        }}
      >
        <div
          style={{
            ...styles.viewport,
            minHeight: isMobile ? 380 : 520,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div style={styles.gridFloor} aria-hidden />
          <div
            style={{
              ...styles.world,
              transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            }}
          >
            {NODES.map((node) => (
              <WireCube
                key={node.id}
                node={node}
                selected={selectedId === node.id || connected.includes(node.id)}
                onSelect={setSelectedId}
              />
            ))}
          </div>
          <p style={styles.hint}>גררו לסיבוב · לחצו על קוביה לפרטים</p>
        </div>

        <aside style={styles.panel}>
          <h2 style={styles.panelTitle}>שכבות המערכת</h2>
          {(Object.keys(GROUP_LABELS) as NodeGroup[]).map((group) => (
            <div key={group} style={styles.legendRow}>
              <span style={{ ...styles.legendDot, background: GROUP_COLORS[group] }} />
              <span style={styles.legendText}>{GROUP_LABELS[group]}</span>
              <span style={styles.legendCount}>
                {NODES.filter((n) => n.group === group).length}
              </span>
            </div>
          ))}

          {selected && (
            <div style={styles.detailCard}>
              <div
                style={{
                  ...styles.detailAccent,
                  background: GROUP_COLORS[selected.group],
                }}
              />
              <h3 style={styles.detailTitle}>{selected.label}</h3>
              {selected.sub && <p style={styles.detailSub}>{selected.sub}</p>}
              <p style={styles.detailMeta}>{GROUP_LABELS[selected.group]}</p>
              {connected.length > 0 && (
                <>
                  <p style={styles.detailLinksTitle}>מחובר ל־</p>
                  <ul style={styles.detailLinks}>
                    {connected.map((id) => {
                      const n = NODES.find((x) => x.id === id)
                      if (!n) return null
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            style={styles.linkBtn}
                            onClick={() => setSelectedId(id)}
                          >
                            {n.label}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          <div style={styles.flowBox}>
            <p style={styles.flowTitle}>זרימה עיקרית</p>
            <p style={styles.flowText}>
              דייר / QR → WhatsApp או SMS → Webhook → תקלה ב-Supabase → לוח בקרה / תקלות →
              עובד → SMS / WhatsApp → סגירה
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: 'linear-gradient(165deg, #0B1020 0%, #121A2E 45%, #0A0F1C 100%)',
    color: '#E8EEF9',
    padding: '24px 20px 40px',
    boxSizing: 'border-box',
  },
  header: {
    maxWidth: 1280,
    margin: '0 auto 20px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: 14,
    color: '#94A3B8',
    maxWidth: 520,
    lineHeight: 1.5,
  },
  headerActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    padding: '10px 14px',
    minHeight: 44,
    borderRadius: theme.radius.md,
    border: '1px solid #334155',
    background: '#1E293B',
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  chipActive: {
    borderColor: theme.colors.primary,
    background: `${theme.colors.primary}22`,
    color: '#BFDBFE',
  },
  layout: {
    maxWidth: 1280,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: '1fr 300px',
    gap: 20,
    alignItems: 'stretch',
  },
  viewport: {
    position: 'relative',
    minHeight: 520,
    borderRadius: theme.radius.xl,
    border: '1px solid #1E293B',
    background: 'radial-gradient(ellipse at 50% 40%, #1a2744 0%, #0d1324 70%)',
    overflow: 'hidden',
    touchAction: 'none',
    cursor: 'grab',
  },
  gridFloor: {
    position: 'absolute',
    left: '50%',
    top: '58%',
    width: '120%',
    height: '120%',
    transform: 'translate(-50%, -50%) rotateX(78deg)',
    backgroundImage:
      'linear-gradient(#1e3a5f55 1px, transparent 1px), linear-gradient(90deg, #1e3a5f55 1px, transparent 1px)',
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
    opacity: 0.5,
  },
  world: {
    position: 'absolute',
    left: '50%',
    top: '48%',
    width: 0,
    height: 0,
    transformStyle: 'preserve-3d',
    transition: 'transform 0.05s linear',
  },
  hint: {
    position: 'absolute',
    bottom: 14,
    left: '50%',
    transform: 'translateX(-50%)',
    margin: 0,
    fontSize: 12,
    color: '#64748B',
    pointerEvents: 'none',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 18,
    borderRadius: theme.radius.xl,
    border: '1px solid #1E293B',
    background: '#0F172A',
    minHeight: 520,
  },
  panelTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 13,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  legendText: {
    flex: 1,
    color: '#CBD5E1',
  },
  legendCount: {
    color: '#64748B',
    fontVariantNumeric: 'tabular-nums',
  },
  detailCard: {
    position: 'relative',
    padding: '14px 14px 14px 18',
    borderRadius: theme.radius.lg,
    background: '#1E293B',
    border: '1px solid #334155',
    overflow: 'hidden',
  },
  detailAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 4,
    bottom: 0,
  },
  detailTitle: {
    margin: '0 0 4px',
    fontSize: 18,
    fontWeight: 700,
  },
  detailSub: {
    margin: '0 0 8px',
    fontSize: 12,
    color: '#94A3B8',
    direction: 'ltr',
    textAlign: 'right',
  },
  detailMeta: {
    margin: 0,
    fontSize: 12,
    color: '#64748B',
  },
  detailLinksTitle: {
    margin: '12px 0 6px',
    fontSize: 12,
    fontWeight: 600,
    color: '#94A3B8',
  },
  detailLinks: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  linkBtn: {
    padding: '6px 10px',
    borderRadius: theme.radius.sm,
    border: '1px solid #475569',
    background: 'transparent',
    color: '#E2E8F0',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  flowBox: {
    marginTop: 'auto',
    padding: 12,
    borderRadius: theme.radius.md,
    background: '#0B1220',
    border: '1px dashed #334155',
  },
  flowTitle: {
    margin: '0 0 6px',
    fontSize: 12,
    fontWeight: 700,
    color: '#94A3B8',
  },
  flowText: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.55,
    color: '#CBD5E1',
  },
}
