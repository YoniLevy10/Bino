'use client'

/**
 * Per-BINO-client Financy connection.
 * Financy never returns API keys after a bank link — user must paste
 * Settings → API access (paid plan) into BINO, then we verify + sync.
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import {
  fetchWithTimeout,
  LONG_RUNNING_FETCH_TIMEOUT_MS,
  MUTATION_FETCH_TIMEOUT_MS,
} from '@/lib/shared/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/errors/error-handler'
import { getIsMobileViewport } from '@/lib/shared/mobile-viewport'
import { Button, LoadingSpinner, theme } from '@/app/components/ui'

const FINANCY_SETTINGS = 'https://financy.open-finance.ai/settings'
const FINANCY_HOME = 'https://financy.open-finance.ai/'

type Props = {
  compact?: boolean
  onConnected?: () => void
  isMobile?: boolean
}

export function FinancyConnectCard({
  compact = false,
  onConnected,
  isMobile: isMobileProp,
}: Props) {
  const [isMobile, setIsMobile] = useState(Boolean(isMobileProp))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [connectionCount, setConnectionCount] = useState(0)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [userId, setUserId] = useState('')
  const [hasSecret, setHasSecret] = useState(false)
  const [showKeys, setShowKeys] = useState(true)

  useEffect(() => {
    if (isMobileProp !== undefined) {
      setIsMobile(isMobileProp)
      return
    }
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [isMobileProp])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/building-finance/bank/status')
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast.error(errorMessageFromResponseJson(json, 'טעינת סטטוס חיבור נכשלה'))
        return
      }
      const isConfigured = json.configured === true
      const isEnabled = json.enabled === true
      setEnabled(isEnabled)
      setConfigured(isConfigured)
      setHasSecret(json.has_secret === true)
      setClientId(typeof json.financy_client_id === 'string' ? json.financy_client_id : '')
      setUserId(typeof json.financy_user_id === 'string' ? json.financy_user_id : '')
      const conns = Array.isArray(json.connections) ? json.connections : []
      setConnectionCount(conns.length)
      // Keep keys form open until BINO has credentials — bank link in Financy alone is not enough
      setShowKeys(!(isEnabled && isConfigured))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openFinancyBank() {
    window.open(FINANCY_SETTINGS, '_blank', 'noopener,noreferrer')
    setShowKeys(true)
  }

  async function onConnect(e: FormEvent) {
    e.preventDefault()
    if (!clientId.trim() || !userId.trim() || !clientSecret.trim()) {
      toast.error('מלאו userId, clientId ו־clientSecret מ־Financy ← הגדרות ← גישה ל-API')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithTimeout(
        '/api/building-finance/bank/connect',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            financy_client_id: clientId.trim(),
            financy_user_id: userId.trim(),
            financy_client_secret: clientSecret.trim(),
            verify: true,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast.error(errorMessageFromResponseJson(json, 'חיבור נכשל'))
        return
      }

      setClientSecret('')
      toast.success(
        typeof json.message === 'string' ? json.message : 'החשבון חובר — מסנכרן תנועות…'
      )
      await load()
      onConnected?.()

      // Sync is slow (Financy AIS); don't block connect success on the 10s default.
      try {
        const syncRes = await fetchWithTimeout(
          '/api/building-finance/bank/sync',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: null }),
          },
          LONG_RUNNING_FETCH_TIMEOUT_MS
        )
        const syncJson = (await syncRes.json().catch(() => ({}))) as Record<string, unknown>
        if (!syncRes.ok) {
          toast.warning(
            errorMessageFromResponseJson(
              syncJson,
              'מחובר — הסנכרון נכשל, לחצו «סנכרון» במסך הבנק'
            )
          )
        } else {
          toast.success(
            `סונכרן: ${syncJson.accountsUpserted ?? 0} חשבונות, ${syncJson.transactionsUpserted ?? 0} תנועות`
          )
          onConnected?.()
        }
      } catch {
        toast.warning('מחובר — הסנכרון לוקח זמן, לחצו «סנכרון» במסך הבנק')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSaving(false)
    }
  }

  async function onDisconnect() {
    if (!window.confirm('לנתק את חשבון Financy מלקוח BINO זה?')) return
    setDisconnecting(true)
    try {
      const res = await fetchWithTimeout('/api/building-finance/bank/connect', {
        method: 'DELETE',
      })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast.error(errorMessageFromResponseJson(json, 'ניתוק נכשל'))
        return
      }
      toast.success('החיבור נותק')
      setClientId('')
      setUserId('')
      setClientSecret('')
      setShowKeys(true)
      await load()
      onConnected?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24, width: '100%' }}>
        <LoadingSpinner />
      </div>
    )
  }

  const connected = enabled && configured
  const styles = cardStyles(isMobile, compact)
  const btnStyle: CSSProperties = isMobile ? { width: '100%', minHeight: 48 } : {}
  const linkWrap: CSSProperties = isMobile ? { display: 'block', width: '100%' } : {}

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>חיבור חשבון Financy (עסקי — לכל הבניינים)</h3>

      {!connected ? (
        <div style={styles.warning}>
          חיבור בנק ב־Financy <strong>לא</strong> מעביר מפתחות ל־BINO אוטומטית — אין OAuth
          שמחזיר clientSecret לאפליקציות. אחרי חיבור הבנק: העתיקו מ־Financy ← הגדרות ←{' '}
          <strong>גישה ל-API</strong> (תוכנית בתשלום) את userId / clientId / clientSecret
          והדביקו למטה.
        </div>
      ) : null}

      {connected ? (
        <div style={styles.stack}>
          <p style={{ margin: 0, fontWeight: 600, color: theme.colors.success, overflowWrap: 'anywhere' }}>
            מחובר ל־BINO
            {connectionCount > 0
              ? ` · ${connectionCount} חיבורי בנק/כרטיס ב־Financy`
              : ' · אין עדיין חיבור בנק ב־Financy — חברו בנק שם ואז סנכרנו'}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: theme.colors.textSecondary,
              overflowWrap: 'anywhere',
            }}
          >
            userId: {userId || '—'} · clientId: {clientId ? `${clientId.slice(0, 8)}…` : '—'}
          </p>
          <div style={styles.actions}>
            <a href={FINANCY_SETTINGS} target="_blank" rel="noopener noreferrer" style={linkWrap}>
              <Button type="button" variant="secondary" style={btnStyle}>
                ניהול ב־Financy
              </Button>
            </a>
            <Button type="button" variant="secondary" onClick={() => setShowKeys(true)} style={btnStyle}>
              עדכון מפתחות
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={disconnecting}
              onClick={() => void onDisconnect()}
              style={btnStyle}
            >
              {disconnecting ? 'מנתק…' : 'נתק'}
            </Button>
          </div>
        </div>
      ) : (
        <div style={styles.stack}>
          <ol style={styles.steps}>
            <li>חברו בנק (וספרים) ב־Financy.</li>
            <li>העתיקו מפתחות מ־הגדרות ← גישה ל-API (Starter/Pro — לא Free).</li>
            <li>הדביקו כאן ← «אמת ושמור» — רק אז יופיע מסך הבנק ב־BINO.</li>
          </ol>
          <div style={styles.actions}>
            <Button type="button" onClick={openFinancyBank} style={btnStyle}>
              1. פתח Financy (חיבור בנק)
            </Button>
            <a href={FINANCY_SETTINGS} target="_blank" rel="noopener noreferrer" style={linkWrap}>
              <Button type="button" variant="secondary" style={btnStyle}>
                2. גישה ל-API (מפתחות)
              </Button>
            </a>
            <a href={FINANCY_HOME} target="_blank" rel="noopener noreferrer" style={linkWrap}>
              <Button type="button" variant="ghost" style={btnStyle}>
                אתר Financy
              </Button>
            </a>
          </div>
        </div>
      )}

      {showKeys ? (
        <form onSubmit={onConnect} style={styles.form}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
            3. הדבקת מפתחות ללקוח BINO זה
          </p>
          <label style={styles.fieldLabel}>
            מזהה משתמש (userId)
            <input
              style={styles.input}
              value={userId}
              onChange={(ev) => setUserId(ev.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label style={styles.fieldLabel}>
            מזהה לקוח (clientId)
            <input
              style={styles.input}
              value={clientId}
              onChange={(ev) => setClientId(ev.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label style={styles.fieldLabel}>
            מפתח סודי (clientSecret)
            <input
              style={styles.input}
              type="password"
              value={clientSecret}
              onChange={(ev) => setClientSecret(ev.target.value)}
              autoComplete="new-password"
              required
              placeholder={hasSecret ? 'הזינו מחדש לאימות' : ''}
            />
          </label>
          <div style={styles.actions}>
            <Button type="submit" disabled={saving} style={btnStyle}>
              {saving ? 'מאמת ושומר…' : 'אמת ושמור — פתח מסך בנק'}
            </Button>
            {connected ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowKeys(false)}
                style={btnStyle}
              >
                ביטול
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  )
}

function cardStyles(isMobile: boolean, compact: boolean): Record<string, CSSProperties> {
  return {
    card: {
      direction: 'rtl',
      border: `1px solid ${theme.colors.border}`,
      borderRadius: 12,
      padding: isMobile ? 14 : compact ? 14 : 18,
      background: theme.colors.surface,
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      boxSizing: 'border-box',
      overflowWrap: 'anywhere',
    },
    title: {
      margin: '0 0 8px',
      fontSize: isMobile ? 15 : compact ? 16 : 18,
      fontWeight: 700,
      lineHeight: 1.35,
    },
    warning: {
      marginBottom: 14,
      padding: isMobile ? '10px 12px' : '10px 12px',
      borderRadius: 8,
      background: theme.colors.warningMuted,
      border: `1px solid ${theme.colors.border}`,
      fontSize: isMobile ? 12 : 13,
      lineHeight: 1.55,
      color: theme.colors.textPrimary,
      overflowWrap: 'anywhere',
    },
    stack: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      minWidth: 0,
    },
    steps: {
      margin: 0,
      paddingInlineStart: 20,
      fontSize: isMobile ? 12 : 13,
      lineHeight: 1.6,
      color: theme.colors.textPrimary,
    },
    actions: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      width: '100%',
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 16,
      paddingTop: 14,
      borderTop: `1px solid ${theme.colors.border}`,
      width: '100%',
      minWidth: 0,
    },
    fieldLabel: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontSize: 13,
      fontWeight: 600,
      color: theme.colors.textSecondary,
      width: '100%',
      minWidth: 0,
    },
    input: {
      border: `1px solid ${theme.colors.border}`,
      borderRadius: 8,
      padding: isMobile ? '12px 12px' : '10px 12px',
      fontSize: isMobile ? 16 : 14,
      fontWeight: 400,
      color: theme.colors.textPrimary,
      background: theme.colors.surface,
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      boxSizing: 'border-box',
      minHeight: isMobile ? 48 : undefined,
    },
  }
}
