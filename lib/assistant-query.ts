import type { SupabaseClient } from '@supabase/supabase-js'

export type AssistantAnswer = {
  answer: string
  facts: string[]
}

/** Rule-based assistant MVP — queries tenant data without LLM API key. */
export async function answerAssistantQuestion(
  admin: SupabaseClient,
  clientId: string,
  question: string
): Promise<AssistantAnswer> {
  const q = question.trim().toLowerCase()
  const facts: string[] = []

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { count: openTickets } = await admin
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')

  const { count: monthTickets } = await admin
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', monthStart.toISOString())
    .is('deleted_at', null)

  const { count: projects } = await admin
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_active', true)

  const { count: residents } = await admin
    .from('residents')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .is('deleted_at', null)

  facts.push(`תקלות פתוחות: ${openTickets ?? 0}`)
  facts.push(`תקלות החודש: ${monthTickets ?? 0}`)
  facts.push(`בניינים פעילים: ${projects ?? 0}`)
  facts.push(`דיירים בפנקס: ${residents ?? 0}`)

  if (q.includes('פתוח') || q.includes('תקל')) {
    return {
      answer: `יש ${openTickets ?? 0} תקלות פתוחות כרגע, ו-${monthTickets ?? 0} תקלות נפתחו החודש.`,
      facts,
    }
  }

  if (q.includes('בניין') || q.includes('פרויקט')) {
    return {
      answer: `יש ${projects ?? 0} בניינים פעילים בחשבון.`,
      facts,
    }
  }

  if (q.includes('דייר')) {
    return {
      answer: `יש ${residents ?? 0} דיירים רשומים בפנקס.`,
      facts,
    }
  }

  return {
    answer: `תמונת מצב: ${openTickets ?? 0} תקלות פתוחות, ${monthTickets ?? 0} תקלות החודש, ${projects ?? 0} בניינים, ${residents ?? 0} דיירים.`,
    facts,
  }
}
