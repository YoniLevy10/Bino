import { describe, expect, it } from 'vitest'
import { pickRecommendationScreenActions } from '@/lib/recommendations/screen-actions'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'

function row(partial: Partial<ManagementRecommendationRow>): ManagementRecommendationRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    client_id: '22222222-2222-2222-2222-222222222222',
    recommendation_type: 'building_ticket_volume',
    entity_type: 'project',
    entity_id: '33333333-3333-3333-3333-333333333333',
    dedupe_key: 'building_ticket_volume:33333333-3333-3333-3333-333333333333',
    urgency: 'medium',
    reason: 'נפתחו 10 קריאות',
    facts: {},
    primary_action: 'view_tickets',
    primary_action_href: '/tickets?project=BMK17',
    actions: [],
    status: 'active',
    detected_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    snoozed_until: null,
    acted_by: null,
    acted_at: null,
    resolved_by: null,
    resolved_at: null,
    resolution_source: null,
    last_validated_at: null,
    ...partial,
  }
}

describe('pickRecommendationScreenActions', () => {
  it('uses the stored primary label and a create-task link', () => {
    const picked = pickRecommendationScreenActions(
      row({
        actions: [
          { id: 'view_tickets', label: 'צפייה בקריאות הרלוונטיות', href: '/tickets?project=BMK17', kind: 'navigate' },
          { id: 'create_maintenance_task', label: 'יצירת משימת אחזקה', href: '/tasks?create=1', kind: 'create_task' },
          { id: 'dismiss', label: 'דחיית ההמלצה', kind: 'dismiss' },
          { id: 'snooze', label: 'הזכר לי מאוחר יותר', kind: 'snooze' },
        ],
      })
    )
    expect(picked.primary?.label).toBe('צפייה בקריאות הרלוונטיות')
    expect(picked.primary?.href).toBe('/tickets?project=BMK17')
    expect(picked.secondary?.id).toBe('create_maintenance_task')
  })

  it('falls back to primary_action_href when the action list has no matching href', () => {
    const picked = pickRecommendationScreenActions(
      row({
        primary_action: 'assign_worker',
        primary_action_href: '/dashboard?ticket=abc&focus=assign',
        actions: [{ id: 'snooze', label: 'הזכר לי מאוחר יותר', kind: 'snooze' }],
      })
    )
    expect(picked.primary?.href).toBe('/dashboard?ticket=abc&focus=assign')
    expect(picked.primary?.label).toBe('למסך הרלוונטי')
    expect(picked.secondary).toBeNull()
  })
})
