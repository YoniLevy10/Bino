'use client'

/**
 * Mobile-friendly canvas signature pad (RTL-safe). Shared by public token page
 * and authenticated resident portal decisions.
 */

import { useCallback, useEffect, useRef, type CSSProperties } from 'react'

type Props = {
  height?: number
  disabled?: boolean
  strokeWidth?: number
  style?: CSSProperties
  canvasStyle?: CSSProperties
}

export type SignaturePadHandle = {
  clear: () => void
  isBlank: () => boolean
  toDataURL: (type?: string) => string
}

export function useSignaturePad(opts?: {
  height?: number
  disabled?: boolean
  strokeWidth?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const height = opts?.height ?? 220
  const disabled = Boolean(opts?.disabled)
  const strokeWidth = opts?.strokeWidth ?? 2.5

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || disabled) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const ratio = window.devicePixelRatio || 1
    const w = Math.max(1, canvas.clientWidth)
    const h = height
    canvas.width = Math.floor(w * ratio)
    canvas.height = Math.floor(h * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [disabled, height, strokeWidth])

  useEffect(() => {
    setupCanvas()
  }, [setupCanvas])

  useEffect(() => {
    const onResize = () => setupCanvas()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setupCanvas])

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || disabled) return
    e.preventDefault()
    drawing.current = true
    canvas.setPointerCapture(e.pointerId)
    const { x, y } = pointerPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pointerPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.clientWidth, height)
  }

  function isBlank() {
    const canvas = canvasRef.current
    if (!canvas) return true
    const blank = document.createElement('canvas')
    blank.width = canvas.width
    blank.height = canvas.height
    const blankCtx = blank.getContext('2d')
    if (blankCtx) {
      blankCtx.fillStyle = '#ffffff'
      blankCtx.fillRect(0, 0, blank.width, blank.height)
    }
    return canvas.toDataURL() === blank.toDataURL()
  }

  function toDataURL(type = 'image/png') {
    return canvasRef.current?.toDataURL(type) || ''
  }

  const canvasProps = {
    ref: canvasRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    style: {
      width: '100%',
      maxWidth: '100%',
      height,
      display: 'block' as const,
      boxSizing: 'border-box' as const,
      touchAction: 'none' as const,
      background: '#fff',
      cursor: disabled ? 'default' : ('crosshair' as const),
    },
  }

  return { canvasProps, clear, isBlank, toDataURL, height, setupCanvas }
}
