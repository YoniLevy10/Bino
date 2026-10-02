import { PageTransitionLoader } from '@/app/components/page-skeleton'

/** Soft in-shell loading frame for manager route transitions (no full-viewport remount). */
export default function ManagerLoading() {
  return <PageTransitionLoader />
}
