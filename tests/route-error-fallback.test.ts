import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { RouteErrorFallback } from '@/app/components/RouteErrorFallback'

describe('RouteErrorFallback', () => {
  it('renders Hebrew retry + dashboard link without stack traces', () => {
    const onRetry = vi.fn()
    const html = renderToStaticMarkup(
      createElement(RouteErrorFallback, { onRetry, linkAsAnchor: true })
    )
    expect(html).toContain('BINO')
    expect(html).toContain('נסה שוב')
    expect(html).toContain('חזרה ללוח הבקרה')
    expect(html).toContain('/dashboard')
    expect(html).not.toContain('Error:')
    expect(html).not.toContain('at ')
    expect(html).not.toContain('stack')
  })
})
