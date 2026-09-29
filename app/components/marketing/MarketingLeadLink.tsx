'use client'

import type { ComponentProps } from 'react'
import {
  trackMarketingLead,
  type MarketingLeadMethod,
} from '@/lib/marketing-analytics'

type MarketingLeadLinkProps = ComponentProps<'a'> & {
  method: MarketingLeadMethod
  locale?: string
  placement?: string
}

/** Anchor that fires GA4 `generate_lead` before navigation. */
export function MarketingLeadLink({
  method,
  locale,
  placement,
  onClick,
  children,
  ...rest
}: MarketingLeadLinkProps) {
  return (
    <a
      {...rest}
      onClick={(event) => {
        trackMarketingLead(method, { locale, placement })
        onClick?.(event)
      }}
    >
      {children}
    </a>
  )
}
