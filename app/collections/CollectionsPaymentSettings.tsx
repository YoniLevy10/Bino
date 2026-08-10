'use client'

/**
 * Morning payment connection — part of the unified גבייה ותשלומים product.
 * Lives on /collections?tab=connection (settings?tab=morning redirects here).
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { toast, asyncHandler } from '@/lib/error-handler'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import {
  GREENINVOICE_CLEARING_LABELS,
  GREENINVOICE_DOC_TYPE_LABELS,
  GREENINVOICE_VAT_TYPE_LABELS,
  type GreenInvoiceBusinessSummary,
  type GreenInvoiceClearingPlugin,
  type GreenInvoiceEnv,
} from '@/lib/greeninvoice-config'
import { COLLECTIONS_PRODUCT_NAME_HE } from '@/lib/collection-charges'
import { Button, Card, LoadingSpinner, theme } from '@/app/components/ui'
import { LoadingButton } from '@/app/components/LoadingButton'
import { CollapsibleSection } from '@/app/components/shared/CollapsibleSection'

type ClientRow = {
  id: string
  greeninvoice_enabled?: boolean | null
  greeninvoice_env?: string | null
  greeninvoice_api_key_id?: string | null
  greeninvoice_api_secret_set?: boolean
  greeninvoice_business_id?: string | null
  greeninvoice_clearing_plugin?: string | null
  greeninvoice_default_doc_type?: number | null
  greeninvoice_vat_type?: number | null
  greeninvoice_send_invoice_email?: boolean | null
  greeninvoice_remarks_template?: string | null
  greeninvoice_payment_success_url?: string | null
  greeninvoice_payment_failure_url?: string | null
}

export function CollectionsPaymentSettings() {
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState('')
  const [giEnabled, setGiEnabled] = useState(false)
  const [giEnv, setGiEnv] = useState<GreenInvoiceEnv>('production')
  const [giApiKeyId, setGiApiKeyId] = useState('')
  const [giApiSecret, setGiApiSecret] = useState('')
  const [giSecretLoaded, setGiSecretLoaded] = useState(false)
  const [giBusinessId, setGiBusinessId] = useState('')
  const [giBusinesses, setGiBusinesses] = useState<GreenInvoiceBusinessSummary[]>([])
  const [giClearingPlugin, setGiClearingPlugin] = useState<GreenInvoiceClearingPlugin | ''>('')
  const [giDocType, setGiDocType] = useState<300 | 305 | 320>(300)
  const [giVatType, setGiVatType] = useState<0 | 1 | 2>(0)
  const [giSendEmail, setGiSendEmail] = useState(true)
  const [giRemarksTemplate, setGiRemarksTemplate] = useState('')
  const [giPaymentSuccessUrl, setGiPaymentSuccessUrl] = useState('')
  const [giPaymentFailureUrl, setGiPaymentFailureUrl] = useState('')
  const [giAdvancedOpen, setGiAdvancedOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only origin for webhook URL
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '')
  }, [])

  const webhookUrl = useMemo(
    () => (origin ? `${origin}/api/webhook/greeninvoice` : '/api/webhook/greeninvoice'),
    [origin]
  )
  const defaultPaySuccessUrl = useMemo(
    () => (origin ? `${origin}/pay/success` : '/pay/success'),
    [origin]
  )
  const defaultPayFailureUrl = useMemo(
    () => (origin ? `${origin}/pay/failure` : '/pay/failure'),
    [origin]
  )

  async function load() {
    setLoading(true)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout('/api/settings/read')
        const row = (await res.json().catch(() => ({}))) as ClientRow & { error?: string }
        if (!res.ok) throw new Error(row.error || 'טעינת הגדרות נכשלה')
        if (!row?.id) throw new Error('לא נמצא רשומת לקוח')

        setClientId(row.id)
        setGiEnabled(row.greeninvoice_enabled === true)
        setGiEnv(row.greeninvoice_env === 'sandbox' ? 'sandbox' : 'production')
        setGiApiKeyId(row.greeninvoice_api_key_id || '')
        setGiApiSecret('')
        setGiSecretLoaded(row.greeninvoice_api_secret_set === true)
        setGiBusinessId(row.greeninvoice_business_id || '')
        setGiClearingPlugin(
          row.greeninvoice_clearing_plugin === 'cardcom' ||
            row.greeninvoice_clearing_plugin === 'isracard' ||
            row.greeninvoice_clearing_plugin === 'grow'
            ? row.greeninvoice_clearing_plugin
            : ''
        )
        setGiDocType(
          row.greeninvoice_default_doc_type === 305 || row.greeninvoice_default_doc_type === 320
            ? row.greeninvoice_default_doc_type
            : 300
        )
        setGiVatType(
          row.greeninvoice_vat_type === 1 || row.greeninvoice_vat_type === 2
            ? row.greeninvoice_vat_type
            : 0
        )
        setGiSendEmail(row.greeninvoice_send_invoice_email !== false)
        setGiRemarksTemplate(row.greeninvoice_remarks_template || '')
        setGiPaymentSuccessUrl(row.greeninvoice_payment_success_url || '')
        setGiPaymentFailureUrl(row.greeninvoice_payment_failure_url || '')
        setGiBusinesses([])
        return true
      },
      { context: 'טעינת חיבור תשלומים נכשלה', showErrorToast: true }
    )
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial settings load
    void load()
  }, [])

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      toast.success('הועתק')
    } catch {
      toast.error('העתקה נכשלה')
    }
  }

  async function save() {
    if (!clientId) return
    setSaving(true)
    await asyncHandler(
      async () => {
        const payload: Record<string, string | number | boolean | null> = {
          greeninvoice_enabled: giEnabled,
          greeninvoice_env: giEnv,
          greeninvoice_api_key_id: giApiKeyId.trim() || null,
          greeninvoice_business_id: giBusinessId.trim() || null,
          greeninvoice_clearing_plugin: giClearingPlugin || null,
          greeninvoice_default_doc_type: giDocType,
          greeninvoice_vat_type: giVatType,
          greeninvoice_send_invoice_email: giSendEmail,
          greeninvoice_remarks_template: giRemarksTemplate.trim() || null,
          greeninvoice_payment_success_url: giPaymentSuccessUrl.trim() || null,
          greeninvoice_payment_failure_url: giPaymentFailureUrl.trim() || null,
        }
        if (giApiSecret.trim()) {
          payload.greeninvoice_api_secret = giApiSecret.trim()
        }
        const res = await fetchWithTimeout(
          '/api/settings/update',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((json as { error?: string }).error || 'שמירה נכשלה')
        toast.success(TM.settingsSaved)
        await load()
        return true
      },
      { context: 'שמירת חיבור תשלומים נכשלה', showErrorToast: true }
    )
    setSaving(false)
  }

  async function testConnection() {
    setTesting(true)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout('/api/settings/test-greeninvoice', { method: 'POST' })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          businesses?: GreenInvoiceBusinessSummary[]
          currentBusiness?: GreenInvoiceBusinessSummary | null
        }
        if (!res.ok) throw new Error(json.error || 'בדיקת חיבור נכשלה')
        const list = json.businesses ?? []
        setGiBusinesses(list)
        if (!giBusinessId.trim() && json.currentBusiness?.id) {
          setGiBusinessId(json.currentBusiness.id)
        }
        const names = list.map((b) => b.name).join(', ')
        toast.success(names ? `חיבור תקין — עסקים: ${names}` : 'חיבור תקין')
        return true
      },
      { context: 'בדיקת חיבור ל-Morning נכשלה', showErrorToast: true }
    )
    setTesting(false)
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <Card noPadding>
      <div style={styles.cardInner}>
        <p style={styles.intro}>
          חיבור חשבון Morning לסליקה ולמסמכים — חלק מ«{COLLECTIONS_PRODUCT_NAME_HE}». אחרי שמירה
          ובדיקת חיבור אפשר לחזור לטאב «מעקב חיובים» ולשלוח קישורי תשלום לדיירים.
        </p>

        <div style={styles.formGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={giEnabled}
              onChange={(e) => setGiEnabled(e.target.checked)}
              style={styles.checkbox}
            />
            הפעל חיבור Morning
          </label>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.formLabel}>סביבת API</label>
          <select
            value={giEnv}
            onChange={(e) => setGiEnv(e.target.value as GreenInvoiceEnv)}
            style={styles.input}
          >
            <option value="production">פרודקשן (חי)</option>
            <option value="sandbox">Sandbox (בדיקות)</option>
          </select>
          <span style={styles.formHint}>
            Sandbox: הרשמה ב-lp.sandbox.d.greeninvoice.co.il — מפתחות נפרדים מפרודקשן.
          </span>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.formLabel}>מפתח API (Key ID)</label>
          <input
            value={giApiKeyId}
            onChange={(e) => setGiApiKeyId(e.target.value)}
            style={styles.input}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            autoComplete="off"
          />
          <span style={styles.formHint}>Morning → הגדרות → מתקדם → מפתחות API → צור מפתח API</span>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.formLabel}>סוד API (Secret)</label>
          <input
            type="password"
            value={giApiSecret}
            onChange={(e) => setGiApiSecret(e.target.value)}
            style={styles.input}
            placeholder={
              giSecretLoaded ? 'הזינו סוד חדש להחלפה' : 'מוצג פעם אחת ביצירת המפתח — הדביקו כאן'
            }
            autoComplete="off"
          />
          <span style={styles.formHint}>השאירו ריק אם אינכם משנים את הסוד השמור. שמרו לפני «בדוק חיבור».</span>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.formLabel}>עסק ב-Morning</label>
          {giBusinesses.length > 0 ? (
            <select
              value={giBusinessId}
              onChange={(e) => setGiBusinessId(e.target.value)}
              style={styles.input}
            >
              <option value="">— בחרו עסק —</option>
              {giBusinesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={giBusinessId}
              onChange={(e) => setGiBusinessId(e.target.value)}
              style={styles.input}
              placeholder="מזהה עסק (אופציונלי — הריצו בדיקת חיבור לרשימה)"
            />
          )}
        </div>

        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Webhook URL (עדכון אוטומטי כששולם)</label>
          <div style={styles.readonlyRow}>
            <input readOnly value={webhookUrl} style={{ ...styles.input, flex: 1 }} />
            <Button variant="secondary" type="button" onClick={() => void copyWebhook()}>
              העתק
            </Button>
          </div>
          <span style={styles.formHint}>
            הגדירו ב-Morning → Webhooks. אם הוגדר GREENINVOICE_WEBHOOK_SECRET בשרת, הוסיפו
            ?token=... לכתובת.
          </span>
        </div>

        <CollapsibleSection
          title="הגדרות מתקדמות"
          open={giAdvancedOpen}
          onToggle={() => setGiAdvancedOpen((v) => !v)}
        >
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>פלאגין סליקה ב-Morning</label>
            <select
              value={giClearingPlugin}
              onChange={(e) =>
                setGiClearingPlugin(e.target.value as GreenInvoiceClearingPlugin | '')
              }
              style={styles.input}
            >
              <option value="">— לא נבחר / לא ידוע —</option>
              {(Object.keys(GREENINVOICE_CLEARING_LABELS) as GreenInvoiceClearingPlugin[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {GREENINVOICE_CLEARING_LABELS[key]}
                  </option>
                )
              )}
            </select>
            <span style={styles.formHint}>
              מידע לתיעוד בלבד — הסליקה מוגדרת בחשבון Morning, לא במערכת Bamakor.
            </span>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>סוג מסמך ברירת מחדל לחיוב</label>
            <select
              value={giDocType}
              onChange={(e) => setGiDocType(Number(e.target.value) as 300 | 305 | 320)}
              style={styles.input}
            >
              {Object.entries(GREENINVOICE_DOC_TYPE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>הצהרת מע&quot;מ במסמך</label>
            <select
              value={giVatType}
              onChange={(e) => setGiVatType(Number(e.target.value) as 0 | 1 | 2)}
              style={styles.input}
            >
              {Object.entries(GREENINVOICE_VAT_TYPE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>הערות קבועות במסמך (תבנית)</label>
            <textarea
              value={giRemarksTemplate}
              onChange={(e) => setGiRemarksTemplate(e.target.value)}
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
              placeholder="למשל: דמי ועד בית — חודש {month}/{year}"
              maxLength={2000}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={giSendEmail}
                onChange={(e) => setGiSendEmail(e.target.checked)}
                style={styles.checkbox}
              />
              שלח מסמך במייל לדייר (כש-Morning תומך)
            </label>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>כתובת חזרה אחרי תשלום מוצלח</label>
            <input
              value={giPaymentSuccessUrl}
              onChange={(e) => setGiPaymentSuccessUrl(e.target.value)}
              style={styles.input}
              placeholder={defaultPaySuccessUrl}
              dir="ltr"
            />
            <span style={styles.formHint}>
              ריק = ברירת מחדל של Bamakor ({defaultPaySuccessUrl}).
            </span>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>כתובת חזרה אחרי תשלום שנכשל</label>
            <input
              value={giPaymentFailureUrl}
              onChange={(e) => setGiPaymentFailureUrl(e.target.value)}
              style={styles.input}
              placeholder={defaultPayFailureUrl}
              dir="ltr"
            />
            <span style={styles.formHint}>
              ריק = ברירת מחדל של Bamakor ({defaultPayFailureUrl}).
            </span>
          </div>
        </CollapsibleSection>

        <div style={styles.actions}>
          <LoadingButton
            variant="secondary"
            type="button"
            onClick={() => void testConnection()}
            loading={testing}
            loadingText="בודק..."
          >
            בדוק חיבור
          </LoadingButton>
          <LoadingButton
            variant="primary"
            onClick={() => void save()}
            loading={saving}
            loadingText="שומר..."
          >
            שמור שינויים
          </LoadingButton>
        </div>
      </div>
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 0',
  },
  cardInner: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  intro: {
    margin: 0,
    fontSize: '14px',
    color: theme.colors.textSecondary,
    lineHeight: 1.6,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  input: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: '16px',
    color: theme.colors.textPrimary,
  },
  formHint: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    margin: '4px 0 0',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    color: theme.colors.textPrimary,
    cursor: 'pointer',
  },
  checkbox: {
    width: 18,
    height: 18,
    accentColor: theme.colors.primary,
  },
  readonlyRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  actions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
}
