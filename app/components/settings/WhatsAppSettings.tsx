'use client'

import { useState } from 'react'
import { theme } from '../ui'
import { WHATSAPP_COEXISTENCE_NOTE } from '@/lib/wa-broadcast'

export interface WhatsAppSettingsProps {
  isConnected?: boolean
  phoneNumberId?: string
  accessToken?: string
  onUpdate?: (phoneId: string, token: string) => void
  onTestConnection?: () => Promise<boolean>
  onDisconnect?: () => void
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error'

export default function WhatsAppSettings({
  isConnected = false,
  phoneNumberId = '',
  accessToken = '',
  onUpdate,
  onTestConnection,
  onDisconnect,
}: WhatsAppSettingsProps) {
  const [phoneId, setPhoneId] = useState(phoneNumberId)
  const [token, setToken] = useState(accessToken)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  const maskValue = (value: string, showLast = 4) => {
    if (!value || value.length <= showLast) return value
    return '•'.repeat(Math.min(value.length - showLast, 20)) + value.slice(-showLast)
  }

  const handleTestConnection = async () => {
    setTestStatus('testing')
    try {
      const success = await onTestConnection?.()
      setTestStatus(success ? 'success' : 'error')
    } catch {
      setTestStatus('error')
    }
  }

  const handleUpdate = () => {
    onUpdate?.(phoneId, token)
  }

  const handleDisconnect = () => {
    onDisconnect?.()
    setShowDisconnectConfirm(false)
    setPhoneId('')
    setToken('')
  }

  return (
    <div style={styles.container}>
      {/* Connection Status Card */}
      <div style={{
        ...styles.statusCard,
        borderColor: isConnected ? theme.colors.success : theme.colors.error,
        background: isConnected ? theme.colors.successMuted : theme.colors.errorMuted,
      }}>
        <div style={styles.statusRow}>
          <div style={styles.statusIndicator}>
            <div style={{
              ...styles.statusDot,
              background: isConnected ? theme.colors.success : theme.colors.error,
            }} />
            <span style={{
              ...styles.statusText,
              color: isConnected ? theme.colors.success : theme.colors.error,
            }}>
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
          {isConnected && (
            <span style={styles.statusLabel}>WhatsApp Business API</span>
          )}
        </div>
      </div>

      <p style={styles.coexistenceNote} role="note">
        {WHATSAPP_COEXISTENCE_NOTE}
      </p>

      {/* Configuration Form */}
      <div style={styles.formSection}>
        <h3 style={styles.sectionTitle}>Connection Details</h3>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Phone Number ID</label>
          <div style={styles.inputWrapper}>
            <input
              type="text"
              value={phoneId}
              onChange={(e) => setPhoneId(e.target.value)}
              placeholder="Enter Phone Number ID"
              style={styles.input}
              dir="ltr"
            />
            {isConnected && phoneNumberId && (
              <span style={styles.maskedPreview}>
                Current: {maskValue(phoneNumberId)}
              </span>
            )}
          </div>
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Access Token</label>
          <div style={styles.inputWrapper}>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter Access Token"
              style={styles.input}
              dir="ltr"
            />
            {isConnected && accessToken && (
              <span style={styles.maskedPreview}>
                Current: {'•'.repeat(24)}
              </span>
            )}
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button
            type="button"
            onClick={handleUpdate}
            style={{
              ...styles.updateButton,
              opacity: (phoneId && token) ? 1 : 0.5,
            }}
            disabled={!phoneId || !token}
          >
            Update Connection
          </button>

          <button
            type="button"
            onClick={handleTestConnection}
            style={{
              ...styles.testButton,
              opacity: testStatus === 'testing' ? 0.6 : 1,
            }}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {/* Test Result Badge */}
        {testStatus === 'success' && (
          <div style={styles.resultBadgeSuccess}>
            <CheckIcon />
            Connection test successful
          </div>
        )}
        {testStatus === 'error' && (
          <div style={styles.resultBadgeError}>
            <XIcon />
            Connection test failed
          </div>
        )}
      </div>

      {/* Disconnect Section */}
      {isConnected && (
        <div style={styles.dangerSection}>
          <h3 style={styles.dangerTitle}>Danger Zone</h3>
          <p style={styles.dangerDescription}>
            Disconnecting will stop all WhatsApp notifications for your tenants.
          </p>
          
          {!showDisconnectConfirm ? (
            <button
              type="button"
              onClick={() => setShowDisconnectConfirm(true)}
              style={styles.disconnectButton}
            >
              Disconnect WhatsApp
            </button>
          ) : (
            <div style={styles.confirmRow}>
              <span style={styles.confirmText}>Are you sure?</span>
              <button
                type="button"
                onClick={handleDisconnect}
                style={styles.confirmDisconnect}
              >
                Yes, Disconnect
              </button>
              <button
                type="button"
                onClick={() => setShowDisconnectConfirm(false)}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Icons
function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  statusCard: {
    padding: '16px 20px',
    borderRadius: theme.radius.md,
    border: '1px solid',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  statusLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
  },
  coexistenceNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: 0,
    lineHeight: 1.5,
    padding: '12px 16px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '24px',
    background: theme.colors.surface,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  inputWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: theme.typography.fontSize.base,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    outline: 'none',
  },
  maskedPreview: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    fontFamily: 'monospace',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  updateButton: {
    padding: '12px 20px',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textInverse,
    background: theme.colors.primary,
    border: 'none',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
  },
  testButton: {
    padding: '12px 20px',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
    background: theme.colors.primaryMuted,
    border: 'none',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
  },
  resultBadgeSuccess: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: theme.colors.successMuted,
    color: theme.colors.success,
    borderRadius: theme.radius.md,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  resultBadgeError: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: theme.colors.errorMuted,
    color: theme.colors.error,
    borderRadius: theme.radius.md,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  dangerSection: {
    padding: '20px',
    background: theme.colors.errorMuted,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.error}20`,
  },
  dangerTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.error,
    margin: 0,
    marginBottom: '8px',
  },
  dangerDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: 0,
    marginBottom: '16px',
  },
  disconnectButton: {
    padding: '10px 16px',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.error,
    background: 'transparent',
    border: `1px solid ${theme.colors.error}`,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
  },
  confirmRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  confirmText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  confirmDisconnect: {
    padding: '10px 16px',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textInverse,
    background: theme.colors.error,
    border: 'none',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '10px 16px',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
    background: theme.colors.muted,
    border: 'none',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
  },
}
