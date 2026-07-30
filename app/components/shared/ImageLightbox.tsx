'use client'

import { type CSSProperties } from 'react'
import { theme } from '../ui'

export type LightboxMediaKind = 'image' | 'video'

interface ImageLightboxProps {
  imageUrl: string | null
  /** Defaults to image — set `video` to play fullscreen like photo enlarge. */
  mediaKind?: LightboxMediaKind | null
  onClose: () => void
}

export function ImageLightbox({ imageUrl, mediaKind = 'image', onClose }: ImageLightboxProps) {
  if (!imageUrl) return null
  const kind = mediaKind === 'video' ? 'video' : 'image'

  return (
    <>
      <div style={styles.lightboxOverlay} onClick={onClose} aria-hidden />
      <div style={styles.lightbox} role="dialog" aria-modal="true">
        <button type="button" onClick={onClose} style={styles.lightboxClose} aria-label="סגור">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        {kind === 'video' ? (
          <video
            src={imageUrl}
            controls
            autoPlay
            playsInline
            style={styles.lightboxMedia}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="קובץ מצורף"
            style={styles.lightboxMedia}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  lightboxOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.9)',
    zIndex: 500,
    cursor: 'pointer',
  },
  lightbox: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 501,
    maxWidth: '90vw',
    maxHeight: '90vh',
  },
  lightboxClose: {
    position: 'absolute',
    top: '-44px',
    right: 0,
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    padding: 8,
  },
  lightboxMedia: {
    maxWidth: '90vw',
    maxHeight: '85vh',
    objectFit: 'contain',
    borderRadius: theme.radius.lg,
    background: '#000',
    display: 'block',
  },
}
