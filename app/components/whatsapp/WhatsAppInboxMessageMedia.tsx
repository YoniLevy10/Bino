'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { whatsappUiFetch } from '@/lib/whatsapp-ui-fetch'
import { parseWhatsAppMessageMediaPayload } from '@/lib/whatsapp-message-media'

type Msg = {
  id: string
  message_type?: string | null
  body?: string | null
  interactive_payload?: Record<string, unknown> | null
}

type Props = {
  message: Msg
  fallbackText: string
}

export function WhatsAppInboxMessageMedia({ message, fallbackText }: Props) {
  const ref = parseWhatsAppMessageMediaPayload(message.interactive_payload)
  const isVisual =
    ref &&
    (ref.kind === 'image' || ref.kind === 'document') &&
    (message.message_type === 'image' ||
      message.message_type === 'document' ||
      message.message_type === 'video')

  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!isVisual || !ref) return
    let active = true
    let objectUrl: string | null = null

    void (async () => {
      try {
        const res = await whatsappUiFetch(
          `/api/whatsapp/media?message_id=${encodeURIComponent(message.id)}`
        )
        if (!res.ok) {
          if (active) setFailed(true)
          return
        }
        const blob = await res.blob()
        objectUrl = URL.createObjectURL(blob)
        if (active) setBlobUrl(objectUrl)
      } catch {
        if (active) setFailed(true)
      }
    })()

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isVisual, message.id, ref])

  if (!isVisual || failed) {
    return <span style={styles.text}>{fallbackText}</span>
  }

  if (!blobUrl) {
    return <span style={styles.muted}>טוען מדיה…</span>
  }

  if (ref!.kind === 'document') {
    return (
      <a href={blobUrl} target="_blank" rel="noopener noreferrer" style={styles.docLink}>
        {message.body?.trim() || 'מסמך PDF'}
      </a>
    )
  }

  return (
    <img
      src={blobUrl}
      alt={message.body?.trim() || 'תמונה'}
      style={styles.image}
      loading="lazy"
    />
  )
}

const styles: Record<string, CSSProperties> = {
  text: { whiteSpace: 'pre-wrap' },
  muted: { fontSize: 13, color: '#667781' },
  image: {
    maxWidth: '100%',
    maxHeight: 'min(280px, 45dvh)',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    borderRadius: 6,
    display: 'block',
    marginBottom: 4,
  },
  docLink: {
    color: '#027eb5',
    fontWeight: 600,
    textDecoration: 'underline',
    fontSize: 14,
  },
}