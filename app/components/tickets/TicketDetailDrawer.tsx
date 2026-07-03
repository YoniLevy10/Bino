'use client'

import { useState, type CSSProperties } from 'react'
import { Drawer, Button, Select, theme } from '../ui'
import { TicketChat } from './TicketChat'
import { TicketWhatsAppThread } from './TicketWhatsAppThread'
import { TicketAttachmentThumb } from '../shared/TicketAttachmentThumb'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TICKET_STATUSES, ticketStatusLabelHe } from '@/lib/ticket-status'
import { ForwardToProfessionalBlock, type ProfessionalOption } from './ForwardToProfessionalBlock'
import { TabBar } from '../ui/TabBar'
import type {
  TicketDetailAttachment,
  TicketDetailLog,
  TicketDetailRow,
  TicketMergeCandidate,
} from '@/lib/ticket-detail-types'

export type { TicketDetailRow, TicketDetailAttachment, TicketDetailLog }

type Tab = 'details' | 'chat' | 'whatsapp'

const PRIORITY_OPTIONS = [
  { label: 'נמוכה', value: 'LOW' },
  { label: 'בינונית', value: 'MEDIUM' },
  { label: 'גבוהה', value: 'HIGH' },
  { label: 'דחופה', value: 'URGENT' },
]

interface TicketDetailDrawerProps {
  selectedTicket: TicketDetailRow | null
  isMobile: boolean
  draftDescription: string
  draftWorkerId: string
  draftStatus: string
  draftPriority?: string
  selectedTicketAttachments: TicketDetailAttachment[]
  ticketLogs: TicketDetailLog[]
  drawerLoading: boolean
  loadingAttachments?: boolean
  recoveringMedia?: boolean
  savingTicket: boolean
  workersMap: Record<string, string>
  professionals?: ProfessionalOption[]
  tenantClientId?: string | null
  reporterName?: string | null
  /** When true, description is display-only (tickets list save does not edit description). */
  descriptionReadOnly?: boolean
  descriptionTranslation?: string
  translating?: boolean
  mergeCandidates?: TicketMergeCandidate[]
  mergeLoading?: boolean
  deletingTicket?: boolean
  onTicketForwarded?: () => void | Promise<void>
  onClose: () => void
  onDescriptionChange: (value: string) => void
  onWorkerChange: (value: string) => void
  onStatusChange: (value: string) => void
  onPriorityChange?: (value: string) => void
  onSave: () => void
  onSelectImage: (url: string) => void
  onCloseTicket: () => void
  getImageUrl: (attachment: TicketDetailAttachment) => string
  onRecoverMedia?: () => void | Promise<void>
  onTranslateDescription?: () => void | Promise<void>
  onLoadMergeCandidates?: () => void | Promise<void>
  onMerge?: (targetTicketId: string) => void | Promise<void>
  onDelete?: () => void | Promise<void>
  onCancel?: () => void
}

export function TicketDetailDrawer({
  selectedTicket,
  isMobile,
  draftDescription,
  draftWorkerId,
  draftStatus,
  draftPriority = 'LOW',
  selectedTicketAttachments,
  ticketLogs,
  drawerLoading,
  loadingAttachments = false,
  recoveringMedia = false,
  savingTicket,
  workersMap,
  professionals = [],
  tenantClientId = null,
  reporterName,
  descriptionReadOnly = false,
  descriptionTranslation = '',
  translating = false,
  mergeCandidates = [],
  mergeLoading = false,
  deletingTicket = false,
  onTicketForwarded,
  onClose,
  onDescriptionChange,
  onWorkerChange,
  onStatusChange,
  onPriorityChange,
  onSave,
  onSelectImage,
  onCloseTicket,
  getImageUrl,
  onRecoverMedia,
  onTranslateDescription,
  onLoadMergeCandidates,
  onMerge,
  onDelete,
  onCancel,
}: TicketDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [internalTranslation, setInternalTranslation] = useState('')

  const translation = descriptionTranslation || internalTranslation
  const showRecover =
    !!selectedTicket?.reporter_phone && selectedTicket.status !== 'CLOSED' && !!onRecoverMedia
  const showAttachmentsBlock =
    loadingAttachments ||
    selectedTicketAttachments.length > 0 ||
    (!!selectedTicket?.reporter_phone && selectedTicket.status !== 'CLOSED')

  async function translateDescriptionInternal() {
    if (onTranslateDescription) {
      await onTranslateDescription()
      return
    }
    const text = descriptionReadOnly ? selectedTicket?.description : draftDescription
    if (!text?.trim()) return
    setInternalTranslation('')
    try {
      const res = await fetchWithTimeout('/api/translate-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const json = (await res.json()) as { translation?: string; error?: string }
      if (!res.ok) throw new Error(json.error || 'תרגום נכשל')
      setInternalTranslation(json.translation || '')
    } catch {
      setInternalTranslation('')
    }
  }

  function formatLogTitle(actionType: string) {
    switch (actionType) {
      case 'TICKET_CREATED':
        return 'תקלה נוצרה'
      case 'USER_MESSAGE':
        return 'הודעת משתמש'
      case 'ASSIGNED_TO_WORKER':
        return 'שויך לעובד'
      case 'FORWARDED_TO_PROFESSIONAL':
        return 'הועבר לאיש מקצוע'
      case 'TICKET_CLOSED':
        return 'תקלה נסגרה'
      case 'AUTO_ASSIGNED':
        return 'שיוך אוטומטי'
      default:
        return actionType
    }
  }

  return (
    <Drawer
      open={!!selectedTicket}
      onClose={onClose}
      title={`תקלה #${selectedTicket?.ticket_number}`}
      subtitle={selectedTicket?.project_name || selectedTicket?.project_code || 'פרטי בניין'}
      isMobile={isMobile}
    >
      {selectedTicket && (
        <div style={styles.drawerContent}>
          {showAttachmentsBlock && (
            <div style={styles.drawerSection}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={styles.drawerLabel}>
                  קבצים מצורפים
                  {selectedTicketAttachments.length > 0 ? ` (${selectedTicketAttachments.length})` : ''}
                </div>
                {showRecover && (
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    loading={recoveringMedia}
                    onClick={() => void onRecoverMedia?.()}
                  >
                    שחזר תמונה/וידאו מ-WhatsApp
                  </Button>
                )}
              </div>
              {loadingAttachments ? (
                <p style={styles.loadingState}>טוען קבצים…</p>
              ) : selectedTicketAttachments.length > 0 ? (
                <div style={styles.attachmentGrid}>
                  {selectedTicketAttachments.map((attachment) => (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() => {
                        if (attachment.mime_type?.startsWith('image/')) {
                          onSelectImage(getImageUrl(attachment))
                        }
                      }}
                      style={styles.attachmentThumb}
                    >
                      <TicketAttachmentThumb
                        mimeType={attachment.mime_type || ''}
                        url={getImageUrl(attachment)}
                        fileName={attachment.file_name || ''}
                        imageStyle={styles.attachmentImg}
                        videoStyle={styles.attachmentVideo}
                        fileStyle={styles.attachmentFile}
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p style={styles.emptyAttachments}>
                  אין קבצים — לחצו «שחזר תמונה/וידאו מ-WhatsApp» (גם בטאב WhatsApp דייר).
                </p>
              )}
            </div>
          )}

          <TabBar
            tabs={[
              {
                id: 'details' as const,
                label: `פרטים${selectedTicketAttachments.length > 0 ? ` · ${selectedTicketAttachments.length}` : ''}`,
              },
              { id: 'chat' as const, label: 'צ׳אט פנימי' },
              { id: 'whatsapp' as const, label: 'WhatsApp דייר' },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            ariaLabel="פרטי תקלה"
          />

          {activeTab === 'details' && (
            <>
              <div style={styles.drawerSection}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={styles.drawerLabel}>תיאור</div>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    loading={translating}
                    onClick={() => void translateDescriptionInternal()}
                  >
                    תרגם לעברית
                  </Button>
                </div>
                {descriptionReadOnly ? (
                  <div style={styles.descriptionBox}>{selectedTicket.description || '—'}</div>
                ) : (
                  <textarea
                    value={draftDescription}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                    style={styles.drawerTextarea}
                    rows={4}
                  />
                )}
                {translation ? (
                  <div style={styles.translationBox}>
                    <div style={styles.translationLabel}>תרגום</div>
                    {translation}
                  </div>
                ) : null}
              </div>

              {onLoadMergeCandidates && selectedTicket.status !== 'CLOSED' && (
                <div style={styles.drawerSection}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={styles.drawerLabel}>מיזוג תקלות</div>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      loading={mergeLoading}
                      onClick={() => void onLoadMergeCandidates()}
                    >
                      טען תקלות פתוחות מאותו בניין
                    </Button>
                  </div>
                  {mergeCandidates.length > 0 && (
                    <div style={styles.mergeList}>
                      {mergeCandidates.map((c) => (
                        <div key={c.id} style={styles.mergeRow}>
                          <span style={styles.mergeText}>
                            #{c.ticket_number} — {(c.description || '').slice(0, 60)}
                            {(c.description?.length || 0) > 60 ? '…' : ''}
                          </span>
                          <Button
                            variant="primary"
                            size="sm"
                            type="button"
                            loading={savingTicket}
                            onClick={() => void onMerge?.(c.id)}
                          >
                            מזג לכאן
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={styles.formRow}>
                <div style={styles.drawerSection}>
                  <div style={styles.drawerLabel}>מדווח</div>
                  <div style={styles.drawerValue}>
                    {reporterName || selectedTicket.reporter_name || selectedTicket.reporter_phone || '—'}
                  </div>
                </div>
                <div style={styles.drawerSection}>
                  <div style={styles.drawerLabel}>נוצר</div>
                  <div style={styles.drawerValue}>
                    {selectedTicket.created_at
                      ? new Date(selectedTicket.created_at).toLocaleDateString('he-IL', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </div>
                </div>
              </div>

              {selectedTicket.reporter_phone && (
                <div style={styles.drawerSection}>
                  <div style={styles.drawerLabel}>טלפון מדווח</div>
                  <a href={`tel:${selectedTicket.reporter_phone}`} style={styles.phoneLink}>
                    {selectedTicket.reporter_phone}
                  </a>
                </div>
              )}

              {onPriorityChange && (
                <div style={styles.drawerSection}>
                  <div style={styles.drawerLabel}>עדיפות</div>
                  <Select
                    value={draftPriority}
                    onChange={onPriorityChange}
                    options={PRIORITY_OPTIONS}
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              <div style={styles.drawerSection}>
                <div style={styles.drawerLabel}>סטטוס</div>
                <select
                  className="app-select-input"
                  value={draftStatus}
                  onChange={(e) => onStatusChange(e.target.value)}
                  style={styles.drawerSelect}
                >
                  {TICKET_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ticketStatusLabelHe(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.drawerSection}>
                <div style={styles.drawerLabel}>עובד משויך</div>
                <select
                  className="app-select-input"
                  value={draftWorkerId}
                  onChange={(e) => onWorkerChange(e.target.value)}
                  style={styles.drawerSelect}
                >
                  <option value="">לא משויך</option>
                  {Object.entries(workersMap).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {onTicketForwarded && (
                <ForwardToProfessionalBlock
                  ticketId={selectedTicket.id}
                  professionals={professionals}
                  onForwarded={onTicketForwarded}
                />
              )}

              <div style={styles.drawerActions}>
                {onCancel && (
                  <Button variant="secondary" onClick={onCancel} style={{ width: '100%' }}>
                    ביטול
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="danger"
                    onClick={() => void onDelete()}
                    loading={deletingTicket}
                    style={{ width: '100%' }}
                  >
                    מחק תקלה
                  </Button>
                )}
                {selectedTicket.status !== 'CLOSED' && (
                  <Button variant="danger" onClick={onCloseTicket} style={{ width: '100%' }}>
                    סגירת תקלה
                  </Button>
                )}
                <Button variant="primary" onClick={onSave} loading={savingTicket} style={{ width: '100%' }}>
                  שמירה
                </Button>
              </div>

              <div style={styles.drawerSection}>
                <div style={styles.drawerLabel}>היסטוריה</div>
                {drawerLoading ? (
                  <div style={styles.loadingState}>טוען...</div>
                ) : ticketLogs.length === 0 ? (
                  <div style={styles.emptyLogs}>אין היסטוריה</div>
                ) : (
                  <div style={styles.logsList}>
                    {ticketLogs.map((log) => (
                      <div key={log.id} style={styles.logItem}>
                        <div style={styles.logHeader}>
                          <span style={styles.logAction}>{formatLogTitle(log.action_type)}</span>
                          <span style={styles.logTime}>
                            {new Date(log.created_at).toLocaleDateString('he-IL', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {log.notes && <div style={styles.logNotes}>{log.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'chat' && (
            <TicketChat
              ticketId={selectedTicket.id}
              clientId={tenantClientId || selectedTicket.client_id || null}
            />
          )}

          {activeTab === 'whatsapp' && selectedTicket.reporter_phone && (
            <TicketWhatsAppThread
              reporterPhone={selectedTicket.reporter_phone}
              ticketId={selectedTicket.id}
              attachments={selectedTicketAttachments}
              recoveringMedia={recoveringMedia}
              onRecoverMedia={onRecoverMedia}
            />
          )}
          {activeTab === 'whatsapp' && !selectedTicket.reporter_phone && (
            <p style={{ color: theme.colors.textMuted, fontSize: 13 }}>אין טלפון דייר לתקלה זו.</p>
          )}
        </div>
      )}
    </Drawer>
  )
}

const styles: Record<string, CSSProperties> = {
  drawerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  tabActive: {
    background: theme.colors.surface,
    color: theme.colors.primary,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  tabInactive: {
    background: 'transparent',
    color: theme.colors.textMuted,
  },
  drawerSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  drawerLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  drawerValue: {
    fontSize: '14px',
    color: theme.colors.textPrimary,
  },
  descriptionBox: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    fontSize: '14px',
    color: theme.colors.textPrimary,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  phoneLink: {
    fontSize: '14px',
    color: theme.colors.primary,
    textDecoration: 'none',
    fontWeight: 500,
  },
  drawerSelect: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    padding: '10px 14px',
    fontSize: '16px',
    color: theme.colors.textPrimary,
    outline: 'none',
    cursor: 'pointer',
  },
  drawerTextarea: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    padding: '12px 14px',
    fontSize: '16px',
    color: theme.colors.textPrimary,
    outline: 'none',
    resize: 'vertical',
    minHeight: '100px',
    lineHeight: 1.5,
  },
  drawerActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    paddingTop: '12px',
    borderTop: `1px solid ${theme.colors.border}`,
  },
  attachmentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
    gap: '10px',
  },
  attachmentThumb: {
    width: '100%',
    aspectRatio: '1',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    padding: 0,
  },
  attachmentImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  attachmentVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    background: '#000',
  },
  attachmentFile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '11px',
    color: theme.colors.textMuted,
    padding: '8px',
    textAlign: 'center',
    wordBreak: 'break-word',
  },
  mergeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  mergeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  mergeText: {
    fontSize: '14px',
    flex: 1,
  },
  emptyLogs: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    padding: '16px 0',
  },
  logsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  logItem: {
    padding: '12px',
    borderRadius: theme.radius.md,
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
  },
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  logAction: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  logTime: {
    fontSize: '11px',
    color: theme.colors.textMuted,
  },
  logNotes: {
    fontSize: '13px',
    color: theme.colors.textSecondary,
    lineHeight: 1.4,
  },
  loadingState: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    padding: '16px 0',
  },
  emptyAttachments: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    margin: 0,
  },
  translationBox: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
    borderInlineStart: `3px solid ${theme.colors.primary}`,
    fontSize: '14px',
    color: theme.colors.textPrimary,
    lineHeight: 1.5,
  },
  translationLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
}
