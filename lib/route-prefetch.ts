/** Prefetch App Router pages on hover/touch for snappier navigation. */
export function navLinkPrefetchHandlers(
  href: string,
  prefetch: (href: string) => void
) {
  return {
    onMouseEnter: () => prefetch(href),
    onTouchStart: () => prefetch(href),
  }
}
