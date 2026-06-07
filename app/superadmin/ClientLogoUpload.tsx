'use client'

import { useRef, useState, type CSSProperties } from 'react'
import { theme } from '../components/ui'
import { LoadingButton } from '../components/LoadingButton'

export function ClientLogoUpload({
  clientId,
  clientName,
  currentLogoUrl,
  secret,
  onUploaded,
}: {
  clientId: string
  clientName: string
  currentLogoUrl?: string | null
  secret: string
  onUploaded?: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(currentLogoUrl ?? null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('client_id', clientId)
      const res = await fetch('/api/admin/upload-client-logo', {
        method: 'POST',
        headers: { 'x-admin-secret': secret },
        body: form,
      })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) {
        throw new Error(json.error || `שגיאה ${res.status}`)
      }
      setPreview(json.url)
      onUploaded?.(json.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'העלאה נכשלה')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={wrapStyle}>
      <div style={{ fontWeight: theme.typography.fontWeight.semibold, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.md }}>
        לוגו ושם תצוגה
      </div>
      <p style={{ margin: `0 0 ${theme.spacing.md}`, fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted }}>
        שם הלקוח «{clientName}» מוצג בסרגל ובמסך הפתיחה. העלו לוגו (PNG/JPEG, עד 2MB).
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.lg, flexWrap: 'wrap' }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" style={logoPreviewStyle} />
        ) : (
          <div style={logoPlaceholderStyle}>לוגו</div>
        )}
        <div>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void handleFile(e)} style={{ display: 'none' }} />
          <LoadingButton size="sm" loading={uploading} loadingText="מעלה..." onClick={() => inputRef.current?.click()}>
            {preview ? 'החלף לוגו' : 'העלה לוגו'}
          </LoadingButton>
        </div>
      </div>
      {error ? <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.sm }}>{error}</p> : null}
    </div>
  )
}

const wrapStyle: CSSProperties = {
  marginBottom: theme.spacing.xl,
  background: theme.colors.surface,
  borderRadius: theme.radius.lg,
  padding: theme.spacing.xl,
  border: `1.5px solid ${theme.colors.border}`,
}

const logoPreviewStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: theme.radius.sm,
  objectFit: 'contain',
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.muted,
}

const logoPlaceholderStyle: CSSProperties = {
  ...logoPreviewStyle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.textMuted,
}
