/**
 * Levy Marketing Brain navigation — Hebrew RTL executive cockpit.
 */
export type BrainNavItem = {
  href: string
  label: string
  id: string
}

export const BRAIN_NAV: BrainNavItem[] = [
  { id: 'dashboard', href: '/brain/dashboard', label: 'לוח בקרה' },
  { id: 'leads', href: '/brain/leads', label: 'לידים' },
  { id: 'brands', href: '/brain/brands', label: 'מותגים' },
  { id: 'strategy', href: '/brain/strategy', label: 'אסטרטגיה' },
  { id: 'campaigns', href: '/brain/campaigns', label: 'קמפיינים' },
  { id: 'creatives', href: '/brain/creatives', label: 'קריאייטיב' },
  { id: 'performance', href: '/brain/performance', label: 'ביצועים' },
  { id: 'approvals', href: '/brain/approvals', label: 'אישורים' },
  { id: 'ai-operator', href: '/brain/ai-operator', label: 'מפעיל AI' },
  { id: 'integrations', href: '/brain/settings/integrations', label: 'אינטגרציות' },
  { id: 'guardrails', href: '/brain/settings/guardrails', label: 'מגבלות הוצאה' },
]
