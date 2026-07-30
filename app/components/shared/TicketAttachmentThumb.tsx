'use client'

import type { CSSProperties } from 'react'

type TicketAttachmentThumbProps = {
  mimeType: string | null | undefined
  url: string
  fileName?: string | null
  onImageClick?: () => void
  imageStyle?: CSSProperties
  videoStyle?: CSSProperties
  fileStyle?: CSSProperties
}

export function TicketAttachmentThumb({
  mimeType,
  url,
  fileName,
  onImageClick,
  imageStyle,
  videoStyle,
  fileStyle,
}: TicketAttachmentThumbProps) {
  if (mimeType?.startsWith('image/')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={fileName || 'attachment'}
        style={imageStyle}
        crossOrigin="anonymous"
        loading="lazy"
        decoding="async"
        onClick={onImageClick}
      />
    )
  }

  if (mimeType?.startsWith('video/')) {
    return (
      <video
        src={url}
        muted
        preload="metadata"
        playsInline
        style={{ ...videoStyle, pointerEvents: 'none' }}
        aria-label={fileName || 'סרטון מצורף'}
      />
    )
  }

  return (
    <div style={fileStyle}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      {fileName ? <span>{fileName}</span> : null}
    </div>
  )
}
