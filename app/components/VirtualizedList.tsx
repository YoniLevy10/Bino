'use client'

import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

type Props<T> = {
  items: T[]
  estimateSize: number
  overscan?: number
  getKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  style?: CSSProperties
  className?: string
  /** Max height of the scrollport; defaults to filling available viewport. */
  maxHeight?: number | string
}

/**
 * Lightweight windowed list for long manager tables/cards (RTL-safe).
 */
export function VirtualizedList<T>({
  items,
  estimateSize,
  overscan = 8,
  getKey,
  renderItem,
  style,
  className,
  maxHeight = 'min(70vh, 720px)',
}: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  })

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        overflow: 'auto',
        maxHeight,
        width: '100%',
        ...style,
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          return (
            <div
              key={getKey(item, virtualRow.index)}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                insetInline: 0,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
