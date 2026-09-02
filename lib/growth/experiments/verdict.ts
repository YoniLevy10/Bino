/**
 * Experiment helpers — treat growth as tests with winner / loser / inconclusive.
 */
export type ArmMetrics = {
  spend: number
  leads: number
  qualified: number
  demos: number
}

export type ExperimentVerdict = 'winner' | 'loser' | 'inconclusive'

export function verdictForArms(
  arms: Array<{ key: string; metrics: ArmMetrics }>,
  opts?: { minSpend?: number; minDemos?: number }
): { verdict: ExperimentVerdict; winnerKey: string | null; reasonHe: string } {
  const minSpend = opts?.minSpend ?? 200
  const minDemos = opts?.minDemos ?? 2
  const ready = arms.filter((a) => a.metrics.spend >= minSpend)
  if (ready.length < 2) {
    return {
      verdict: 'inconclusive',
      winnerKey: null,
      reasonHe: 'אין מספיק הוצאה/דאטה להכרעה',
    }
  }
  const scored = ready.map((a) => ({
    key: a.key,
    rate: a.metrics.spend > 0 ? a.metrics.demos / a.metrics.spend : 0,
    demos: a.metrics.demos,
  }))
  scored.sort((a, b) => b.rate - a.rate)
  const best = scored[0]
  const second = scored[1]
  if (best.demos < minDemos) {
    return {
      verdict: 'inconclusive',
      winnerKey: null,
      reasonHe: `פחות מ־${minDemos} דמואים בזרוע המובילה`,
    }
  }
  if (second && best.rate < second.rate * 1.2) {
    return {
      verdict: 'inconclusive',
      winnerKey: null,
      reasonHe: 'הפער בין הזרועות קטן מדי (<20%)',
    }
  }
  return {
    verdict: 'winner',
    winnerKey: best.key,
    reasonHe: `זרוע ${best.key} מובילה ב־דמואים/₪`,
  }
}
