/**
 * Transparent limited topic map for recurring-issue recommendations.
 * Same reporter alone is NOT enough. A single arbitrary word is NOT enough.
 * Only these multi-signal topic keys count as "same issue class".
 */

export type TopicMatch = {
  topicKey: string
  labelHe: string
}

const TOPIC_RULES: Array<{ topicKey: string; labelHe: string; patterns: RegExp[] }> = [
  {
    topicKey: 'lighting',
    labelHe: 'תאורה',
    patterns: [/תאור/, /נור[הת]/, /מנור/, /חש[כּ]ה/, /פנס/, /lighting|light\b|bulb/i],
  },
  {
    topicKey: 'plumbing',
    labelHe: 'אינסטלציה',
    patterns: [/אינסטל/, /ברז/, /סתימ/, /ביוב/, /דל[יפ]פ/, /מים/, /ניאגר/, /plumbing|leak|pipe/i],
  },
  {
    topicKey: 'elevator',
    labelHe: 'מעלית',
    patterns: [/מעלית/, /מעליות/, /elevator|lift\b/i],
  },
  {
    topicKey: 'hvac',
    labelHe: 'מיזוג',
    patterns: [/מיזוג/, /מזגן/, /מזגנ/, /hvac|air.?cond/i],
  },
  {
    topicKey: 'electrical',
    labelHe: 'חשמל',
    patterns: [/חשמל/, /קצר/, /לוח חשמל/, /שקע/, /electrical|electric|power out/i],
  },
  {
    topicKey: 'door_gate',
    labelHe: 'דלת / שער',
    patterns: [/אינטרקום/, /דלת כניסה/, /שער/, /קודן/, /intercom|gate\b/i],
  },
  {
    topicKey: 'cleaning',
    labelHe: 'ניקיון',
    patterns: [/ניקיון/, /אשפ/, /זבל/, /clean(ing)?/i],
  },
]

/** Returns at most one topic when exactly one rule matches with confidence. */
export function matchTicketTopic(description: string | null | undefined): TopicMatch | null {
  const text = (description || '').trim()
  if (!text) return null
  const hits: TopicMatch[] = []
  for (const rule of TOPIC_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      hits.push({ topicKey: rule.topicKey, labelHe: rule.labelHe })
    }
  }
  if (hits.length === 1) return hits[0]
  // Ambiguous multi-match → do not claim same issue class
  return null
}

export function topicLabelHe(topicKey: string): string {
  return TOPIC_RULES.find((r) => r.topicKey === topicKey)?.labelHe ?? topicKey
}
