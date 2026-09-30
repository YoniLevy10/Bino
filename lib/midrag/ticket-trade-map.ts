import { midragSectorsForSelect, type MidragSector } from './catalog'
import { matchTicketTopic } from '@/lib/recommendations/topic-keywords'

export type TradeSuggestion = {
  /** Suggested Midrag sectorId when unambiguous; null → manager must choose */
  sectorId: number | null
  sectorLabel: string | null
  candidates: Array<{ sectorId: number; label: string }>
  confidence: 'high' | 'ambiguous' | 'none'
}

/** Topic → Hebrew keywords to find Midrag sector labels (no electrician default). */
const TOPIC_SECTOR_HINTS: Record<string, string[]> = {
  lighting: ['חשמל', 'תאור'],
  plumbing: ['אינסטל'],
  elevator: ['מעלית', 'מעליות'],
  hvac: ['מזגן', 'מיזוג'],
  electrical: ['חשמל'],
  door_gate: ['מנעול', 'אינטרקום', 'דלת'],
  cleaning: ['ניקיון'],
}

function findSectorsForHints(hints: string[]): MidragSector[] {
  const sectors = midragSectorsForSelect()
  const hits: MidragSector[] = []
  for (const s of sectors) {
    const label = s.label.toLowerCase()
    if (hints.some((h) => label.includes(h.toLowerCase()))) {
      hits.push(s)
    }
  }
  return hits
}

/**
 * Map ticket description → Midrag sector suggestion.
 * Never defaults to electrician when there is no match.
 */
export function suggestTradeFromTicketDescription(
  description: string | null | undefined
): TradeSuggestion {
  const topic = matchTicketTopic(description)
  if (!topic) {
    return { sectorId: null, sectorLabel: null, candidates: [], confidence: 'none' }
  }
  const hints = TOPIC_SECTOR_HINTS[topic.topicKey]
  if (!hints?.length) {
    return { sectorId: null, sectorLabel: null, candidates: [], confidence: 'none' }
  }
  const hits = findSectorsForHints(hints)
  if (hits.length === 0) {
    return { sectorId: null, sectorLabel: null, candidates: [], confidence: 'none' }
  }
  if (hits.length === 1) {
    return {
      sectorId: hits[0].sectorId,
      sectorLabel: hits[0].label,
      candidates: [{ sectorId: hits[0].sectorId, label: hits[0].label }],
      confidence: 'high',
    }
  }
  return {
    sectorId: null,
    sectorLabel: null,
    candidates: hits.slice(0, 8).map((h) => ({ sectorId: h.sectorId, label: h.label })),
    confidence: 'ambiguous',
  }
}
