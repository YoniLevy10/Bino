/**
 * Soft navigations between authenticated client pages should not flash a full-page
 * logo loader — React Query / localStorage already paint cached content.
 * Keep a tiny non-blocking placeholder for rare RSC delays.
 */
export default function RootLoading() {
  return null
}
