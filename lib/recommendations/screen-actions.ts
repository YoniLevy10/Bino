import { parseActions } from '@/lib/recommendations/entitlements'
import type { ManagementRecommendationRow, RecommendationAction } from '@/lib/recommendations/types'

function isScreenAction(action: RecommendationAction): boolean {
  if (!action.href) return false
  return (
    action.kind === 'navigate' ||
    action.kind === 'create_task' ||
    action.kind === 'midrag' ||
    action.kind == null
  )
}

/**
 * Primary screen from the stored action, plus one extra navigate / create-task link.
 * Snooze and dismiss stay out of this list — dismiss is a separate control.
 */
export function pickRecommendationScreenActions(row: ManagementRecommendationRow): {
  primary: RecommendationAction | null
  secondary: RecommendationAction | null
} {
  const actions = parseActions(row.actions)
  const primaryMatch = actions.find((action) => action.id === row.primary_action && isScreenAction(action))
  const storedLabel = actions.find((action) => action.id === row.primary_action)?.label

  const primary: RecommendationAction | null =
    primaryMatch ??
    (row.primary_action_href
      ? {
          id: row.primary_action || 'open',
          label: storedLabel || 'למסך הרלוונטי',
          href: row.primary_action_href,
          kind: 'navigate',
        }
      : (actions.find(isScreenAction) ?? null))

  const secondary =
    actions.find(
      (action) =>
        action.id !== primary?.id &&
        !!action.href &&
        (action.kind === 'navigate' || action.kind === 'create_task')
    ) ?? null

  return { primary, secondary }
}
