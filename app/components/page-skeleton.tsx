'use client'

import { PageTransitionLoader } from './PageTransitionLoader'

/**
 * In-page loading — logo + progress bar (same visual as route transition loader).
 * Replaces legacy pulse skeleton bars app-wide.
 */
export function PageListSkeleton(_props?: { rows?: number }) {
  return <PageTransitionLoader />
}

export function PageKpiSkeleton() {
  return <PageTransitionLoader />
}

export function PageKpiSkeletonN(_props?: { columns?: number }) {
  return <PageTransitionLoader />
}

/** Inline section loader — keeps tabs/filters visible while content loads. */
export function SectionLoader() {
  return <PageTransitionLoader compact />
}

export { PageTransitionLoader }
