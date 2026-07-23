'use client'

/**
 * דף קודי QR – הצגת קודי QR לכל פרויקט עבור דיווח תקלות.
 *
 * כל פרויקט מקבל שלושה קישורים:
 *  - WhatsApp QR: https://wa.me/{phone}?text=START_{PROJECT_CODE}  → מתחיל שיחת WhatsApp עם הבוט
 *  - Web QR: {APP_URL}/report?project={code}&client={clientId}  → טופס דיווח ווב
 *  - Intake: {APP_URL}/intake?project={code}&client={clientId}  → סקר רישום דיירים
 *
 * מציג: גריד קארדים עם QR גרפי (qrcode.react), כפתורי הורדת PNG, ועמוד הדפסה.
 *
 * ניווט:
 *  - לחיצה "הורד" → שומר PNG
 *  - לחיצה "הדפס" → window.print()
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/error-handler'
import {
  AppShell,
  MobileHeader,
  useMobileMenu,
  PageHeader,
  KpiCard,
  Card,
  Button,
  StatusBadge,
  SearchInput,
  Drawer,
  EmptyState,
  LoadingSpinner,
  theme
} from '../components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { PageTransitionLoader } from '../components/page-skeleton'
import { digitsForWaMeLink } from '@/lib/wa-me-phone'
import { ProjectResidentIntakePanel } from '../components/projects/ProjectResidentIntakePanel'
import { buildResidentIntakeUrl } from '@/lib/resident-intake'

type ProjectRow = {
  id: string
  client_id: string
  name: string
  project_code: string
  address?: string | null
  qr_identifier?: string | null
  is_active?: boolean | null
  created_at?: string
}

export default function QrPage() {
  const { openMenu } = useMobileMenu()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [waMeDigits, setWaMeDigits] = useState<string | null>(null)
  const [waPhoneLoading, setWaPhoneLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [selectedProject, setSelectedProject] = useState<ProjectRow | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const qrRefs = useRef<Record<string, HTMLDivElement | null>>({})

  async function loadProjects() {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('id, client_id, name, project_code, address, qr_identifier, is_active, created_at')
      .order('project_code', { ascending: true })

    if (error) {
      toast.error(error.message || 'Failed to load projects')
      setProjects([])
    } else {
      setProjects((data as ProjectRow[]) || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial projects list
    void loadProjects()
  }, [])

  useEffect(() => {
    void (async () => {
      setWaPhoneLoading(true)
      try {
        const clientId = await resolveBamakorClientIdForBrowser()
        const { data, error } = await supabase
          .from('clients')
          .select('whatsapp_business_phone, manager_phone, default_worker_phone')
          .eq('id', clientId)
          .maybeSingle()

        if (error) throw error
        const row = data as {
          whatsapp_business_phone?: string | null
          manager_phone?: string | null
          default_worker_phone?: string | null
        } | null
        const raw =
          row?.whatsapp_business_phone?.trim() ||
          row?.manager_phone?.trim() ||
          row?.default_worker_phone?.trim() ||
          null
        setWaMeDigits(digitsForWaMeLink(raw))
      } catch {
        setWaMeDigits(null)
      } finally {
        setWaPhoneLoading(false)
      }
    })()
  }, [])

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(label)
    } catch {
      toast.error('ההעתקה נכשלה')
    }
  }

  function buildStartCode(project: ProjectRow) {
    return project.qr_identifier || `START_${project.project_code}`
  }

  function buildWhatsAppLink(project: ProjectRow) {
    if (!waMeDigits) return '#'
    return `https://wa.me/${waMeDigits}?text=${encodeURIComponent(buildStartCode(project))}`
  }

  function buildReportLink(project: ProjectRow) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
    return `${baseUrl}/report?project=${encodeURIComponent(project.project_code)}&client=${encodeURIComponent(project.client_id)}`
  }

  function buildIntakeLink(project: ProjectRow) {
    return buildResidentIntakeUrl({
      projectCode: project.project_code,
      clientId: project.client_id,
      baseUrl:
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        (typeof window !== 'undefined' ? window.location.origin : ''),
    })
  }

  function downloadQr(projectCode: string) {
    const container = qrRefs.current[projectCode]
    if (!container) return

    const canvas = container.querySelector('canvas')
    if (!canvas) return

    const pngUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = pngUrl
    link.download = `${projectCode}-whatsapp-qr.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function openProjectDrawer(project: ProjectRow) {
    setSelectedProject(project)
    setIsDrawerOpen(true)
  }

  function closeProjectDrawer() {
    setIsDrawerOpen(false)
    setSelectedProject(null)
  }

  const stats = useMemo(() => {
    const total = projects.length
    const active = projects.filter((p) => p.is_active !== false).length
    const inactive = projects.filter((p) => p.is_active === false).length
    return { total, active, inactive }
  }, [projects])

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const q = searchTerm.trim().toLowerCase()
      if (!q) return true
      return (
        project.name?.toLowerCase().includes(q) ||
        project.project_code?.toLowerCase().includes(q) ||
        project.address?.toLowerCase().includes(q) ||
        project.qr_identifier?.toLowerCase().includes(q)
      )
    })
  }, [projects, searchTerm])

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="קודי QR"
          subtitle={`${filteredProjects.length} פרויקטים`}
          onMenuClick={openMenu}
        />
      )}


      <div
        style={{
          ...styles.content,
          ...(isMobile
            ? { padding: '16px 16px 8px', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }
            : {}),
        }}
      >
        {!isMobile && (
          <PageHeader
            title="קודי QR"
            subtitle="יצירה וניהול קודי QR לוואטסאפ לדיווח מהיר"
          />
        )}

        {/* KPI Cards */}
        <div style={{
          ...styles.kpiGrid,
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)',
        }}>
          <KpiCard label="סה״כ פרויקטים" value={stats.total} accent="primary" />
          <KpiCard label="פעילים" value={stats.active} accent="success" />
          <KpiCard label="לא פעילים" value={stats.inactive} />
        </div>

        {/* Info Banner */}
        <div style={styles.infoBanner}>
          <div style={styles.infoBannerIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <div>
            <div style={styles.infoBannerTitle}>איך זה עובד</div>
            <div style={styles.infoBannerText}>
              כל קוד QR פותח את וואטסאפ עם קוד ההתחלה המתאים מראש. הדפיסו את הקודים והציבו בכל נכס לדיווח תקלות נוח.
            </div>
          </div>
        </div>

        {!waPhoneLoading && !waMeDigits ? (
          <div
            style={{
              marginBottom: 16,
              padding: '14px 16px',
              borderRadius: 12,
              background: '#FEF3C7',
              border: '1px solid #FCD34D',
              color: '#92400E',
              fontWeight: 600,
              fontSize: 14,
            }}
            role="status"
          >
            לא הוגדר מספר וואטסאפ — פנה להגדרות (מספר עסקי ל־wa.me או מספר מנהל).
          </div>
        ) : null}

        {/* Search + Grid */}
        <Card noPadding>
          <div style={styles.filtersRow}>
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="חיפוש לפי שם פרויקט, קוד או כתובת..."
              style={{ maxWidth: isMobile ? '100%' : '400px' }}
            />
          </div>

          {loading ? (
            <PageTransitionLoader />
          ) : filteredProjects.length === 0 ? (
            <EmptyState
              title="לא נמצאו פרויקטים"
              description="נסו מילת חיפוש אחרת או הוסיפו פרויקטים."
            />
          ) : (
            <div style={{
              ...styles.qrGrid,
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
            }}>
              {filteredProjects.map((project) => {
                const whatsappLink = buildWhatsAppLink(project)
                const startCode = buildStartCode(project)
                const inactive = project.is_active === false

                return (
                  <div
                    key={project.id}
                    style={{
                      ...styles.qrCard,
                      ...(inactive ? styles.qrCardInactive : {}),
                    }}
                    onClick={() => openProjectDrawer(project)}
                    data-ui="card"
                  >
                    <div style={styles.qrCardHeader}>
                      <div>
                        <div style={styles.projectName}>{project.name}</div>
                      </div>
                      <StatusBadge status={inactive ? 'INACTIVE' : 'ACTIVE'} size="sm" />
                    </div>

                    <div style={styles.qrContainerWrap}>
                      <div
                        ref={(el) => { qrRefs.current[project.project_code] = el }}
                        style={{
                          ...styles.qrContainer,
                          ...(inactive ? styles.qrCanvasMuted : {}),
                        }}
                      >
                        <QRCodeCanvas
                          value={whatsappLink}
                          size={140}
                          bgColor="#FFFFFF"
                          fgColor={theme.colors.textPrimary}
                          includeMargin
                          level="M"
                        />
                      </div>
                      {inactive && (
                        <div style={styles.qrInactiveBanner}>
                          פרויקט לא פעיל — QR מושבת
                        </div>
                      )}
                    </div>

                    <div style={styles.startCodeBox}>
                      <span style={styles.startCodeLabel}>קוד התחלה</span>
                      <span style={styles.startCodeValue}>{startCode}</span>
                    </div>

                    <div
                      style={{
                        ...styles.qrCardActions,
                        ...(inactive ? { opacity: 0.45, pointerEvents: 'none' as const } : {}),
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyText(startCode, 'הקוד הועתק')}
                        disabled={inactive}
                      >
                        העתקת קוד
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => downloadQr(project.project_code)}
                        disabled={inactive}
                      >
                        הורדה
                      </Button>
                      <a
                        href={inactive ? '#' : whatsappLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          ...styles.whatsappButton,
                          ...(inactive ? { pointerEvents: 'none', opacity: 0.5 } : {}),
                        }}
                        aria-disabled={inactive}
                        onClick={(e) => {
                          if (inactive) e.preventDefault()
                        }}
                      >
                        פתיחת וואטסאפ
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Project Drawer */}
      <Drawer
        open={isDrawerOpen}
        onClose={closeProjectDrawer}
        title={selectedProject?.name || ''}
        subtitle={selectedProject?.address?.trim() || undefined}
        isMobile={isMobile}
      >
        {selectedProject && (() => {
          const drawerInactive = selectedProject.is_active === false
          return (
          <div style={styles.drawerContent}>
            <div style={styles.drawerQrWrap}>
              <div
                ref={(el) => { if (el) qrRefs.current[selectedProject.project_code] = el }}
                style={{
                  ...styles.drawerQrContainer,
                  ...(drawerInactive ? styles.qrCanvasMuted : {}),
                }}
              >
                <QRCodeCanvas
                  value={buildWhatsAppLink(selectedProject)}
                  size={isMobile ? 200 : 240}
                  level="H"
                  includeMargin
                  bgColor="#FFFFFF"
                  fgColor={theme.colors.textPrimary}
                />
              </div>
              {drawerInactive && (
                <div style={styles.qrInactiveBanner}>פרויקט לא פעיל — QR מושבת</div>
              )}
            </div>

            <div style={styles.detailSection}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>קוד התחלה</span>
                <span style={styles.detailCode}>{buildStartCode(selectedProject)}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>כתובת</span>
                <span style={styles.detailValue}>{selectedProject.address || '-'}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>סטטוס</span>
                <StatusBadge status={selectedProject.is_active === false ? 'INACTIVE' : 'ACTIVE'} size="sm" />
              </div>
            </div>

            <div style={styles.actionButtons}>
              <Button
                variant="secondary"
                onClick={() => copyText(buildStartCode(selectedProject), 'קוד START הועתק')}
                style={{ flex: 1 }}
              >
                העתקת קוד START
              </Button>
              <Button
                variant="secondary"
                onClick={() => copyText(buildWhatsAppLink(selectedProject), 'קישור וואטסאפ הועתק')}
                style={{ flex: 1 }}
              >
                העתקת קישור
              </Button>
            </div>

            <div style={styles.actionButtons}>
              <Button
                variant="secondary"
                onClick={() => copyText(buildReportLink(selectedProject), 'קישור דיווח הועתק')}
                style={{ flex: 1 }}
              >
                העתקת קישור דיווח
              </Button>
              <Button
                variant="secondary"
                onClick={() => copyText(buildIntakeLink(selectedProject), 'קישור סקר דיירים הועתק')}
                style={{ flex: 1 }}
              >
                העתקת סקר דיירים
              </Button>
            </div>

            <div style={styles.actionButtons}>
              <Button
                variant="secondary"
                onClick={() => downloadQr(selectedProject.project_code)}
                style={{ flex: 1 }}
              >
                הורדת QR
              </Button>
            </div>

            {!drawerInactive && (
              <ProjectResidentIntakePanel
                projectCode={selectedProject.project_code}
                clientId={selectedProject.client_id}
                projectName={selectedProject.name}
              />
            )}

            <div style={styles.primaryActions}>
              <a
                href={drawerInactive ? '#' : buildWhatsAppLink(selectedProject)}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...styles.primaryButton,
                  ...(drawerInactive ? { opacity: 0.45, pointerEvents: 'none' } : {}),
                }}
                onClick={(e) => {
                  if (drawerInactive) e.preventDefault()
                }}
              >
                פתיחת וואטסאפ
              </a>
              <a
                href={buildReportLink(selectedProject)}
                target="_blank"
                rel="noreferrer"
                style={styles.secondaryLink}
              >
                דף דיווח
              </a>
              <a
                href={buildIntakeLink(selectedProject)}
                target="_blank"
                rel="noreferrer"
                style={styles.secondaryLink}
              >
                סקר דיירים
              </a>
            </div>
          </div>
          )
        })()}
      </Drawer>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  kpiGrid: {
    display: 'grid',
    gap: '16px',
    marginBottom: '24px',
  },
  infoBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    padding: '20px',
    background: theme.colors.infoMuted,
    borderRadius: theme.radius.lg,
    marginBottom: '24px',
  },
  infoBannerIcon: {
    color: theme.colors.info,
    flexShrink: 0,
    marginTop: '2px',
  },
  infoBannerTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    marginBottom: '4px',
  },
  infoBannerText: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
  filtersRow: {
    padding: '20px 24px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '64px 0',
  },
  qrGrid: {
    display: 'grid',
    gap: '20px',
    padding: '24px',
  },
  qrCard: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: '24px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'center',
  },
  qrCardInactive: {
    opacity: 0.92,
  },
  qrContainerWrap: {
    position: 'relative',
    marginBottom: '16px',
  },
  qrCanvasMuted: {
    opacity: 0.35,
    filter: 'grayscale(1)',
  },
  qrInactiveBanner: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    background: 'rgba(255,255,255,0.82)',
    borderRadius: theme.radius.md,
    pointerEvents: 'none',
  },
  qrCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    textAlign: 'left',
  },
  projectName: {
    fontSize: '17px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  qrContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '16px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  startCodeBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: theme.colors.muted,
    borderRadius: theme.radius.sm,
    marginBottom: '16px',
  },
  startCodeLabel: {
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  startCodeValue: {
    fontSize: '14px',
    fontFamily: 'monospace',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  qrCardActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  whatsappButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 14px',
    borderRadius: theme.radius.md,
    background: '#25D366',
    color: '#FFFFFF',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'all 0.15s ease',
  },
  drawerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  drawerQrWrap: {
    position: 'relative',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  drawerQrContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '24px',
    background: theme.colors.muted,
    borderRadius: theme.radius.lg,
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '16px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  detailValue: {
    fontSize: '14px',
    color: theme.colors.textPrimary,
  },
  detailCode: {
    fontSize: '14px',
    fontFamily: 'monospace',
    fontWeight: 600,
    color: theme.colors.primary,
  },
  actionButtons: {
    display: 'flex',
    gap: '12px',
  },
  primaryActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    paddingTop: '8px',
    borderTop: `1px solid ${theme.colors.border}`,
    marginTop: '4px',
  },
  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 24px',
    borderRadius: theme.radius.md,
    background: '#25D366',
    color: '#FFFFFF',
    fontSize: '15px',
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'all 0.15s ease',
  },
  secondaryLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 24px',
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
    color: theme.colors.textSecondary,
    fontSize: '14px',
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'all 0.15s ease',
  },
}
