/**
 * Deterministic sandbox bot replies — mirrors portal bot intents without DB.
 */
import { SANDBOX_AMENITIES, SANDBOX_ANNOUNCEMENTS, SANDBOX_CHARGES, SANDBOX_TICKETS } from '@/lib/resident-portal/sandbox-fixtures'
import type { ResidentBotAction } from '@/lib/resident-portal/bot-ui'

export type SandboxBotTurn = {
  reply: string
  actions?: ResidentBotAction[]
  pendingConfirm?: { message: string; scope: string } | null
}

function classifyScope(text: string): 'common' | 'private' | 'unclear' {
  const t = text.trim()
  if (/דירה|בבית שלי|אצלי|בדירה|פרטי/.test(t)) return 'private'
  if (/לובי|מעלית|חניה|גינה|גג|משותף|בניין|מחסן משותף|חדר מדרגות/.test(t)) {
    return 'common'
  }
  return 'unclear'
}

export function handleSandboxBotTurn(opts: {
  message: string
  confirmCreate?: boolean
  scope?: string | null
}): SandboxBotTurn {
  const message = opts.message.trim()
  if (!message) {
    return { reply: 'כתבו בקצרה במה אפשר לעזור — תקלה, תשלום, הודעות או שעות מתקנים.' }
  }

  if (/תשלום|חיוב|ועד|יתרה|חשבונית|קבלה/.test(message)) {
    const open = SANDBOX_CHARGES.filter((c) => c.can_pay)
    const balance = open.reduce((s, c) => s + c.amount, 0)
    return {
      reply:
        open.length === 0
          ? 'אין חיובים פתוחים בהדגמה. היסטוריה מלאה במסך התשלומים.'
          : `יתרה פתוחה (הדגמה): ₪${balance.toLocaleString('he-IL')} (${open.length} חיובים). לתשלום עברו למסך התשלומים.`,
      actions: [{ type: 'open_payments', label: 'מעבר לתשלומים', href: '#payments' }],
    }
  }

  if (/הודעה|הודעות|מודעה|עדכון מההנהלה/.test(message)) {
    const list = SANDBOX_ANNOUNCEMENTS
    return {
      reply:
        list.length === 0
          ? 'אין הודעות בהדגמה.'
          : `הודעות אחרונות:\n${list
              .slice(0, 3)
              .map((a) => `• ${a.title}`)
              .join('\n')}`,
    }
  }

  if (/בריכה|כושר|מתקן|שעות|מתי פתוח/.test(message)) {
    const lines = SANDBOX_AMENITIES.map((a) => {
      if (a.today.is_closed) return `• ${a.name}: סגור היום`
      return `• ${a.name}: ${a.today.opens_at}–${a.today.closes_at}`
    })
    return { reply: `שעות להיום (הדגמה):\n${lines.join('\n')}` }
  }

  if (/סטטוס|מה עם הקריאה|מצב התקלה|מספר קריאה|#\d+/.test(message)) {
    if (!SANDBOX_TICKETS.length) {
      return { reply: 'לא נמצאו קריאות בהדגמה.' }
    }
    return {
      reply: `הקריאות שלכם (הדגמה):\n${SANDBOX_TICKETS.map(
        (t) => `#${t.ticket_number}: ${t.status}`
      ).join('\n')}`,
      actions: [{ type: 'none', label: 'למעקב תקלות', href: '#tickets' }],
    }
  }

  const scope =
    opts.scope && ['common', 'private', 'unclear'].includes(opts.scope)
      ? opts.scope
      : classifyScope(message)

  if (opts.confirmCreate) {
    const ticketNumber = 1043 + SANDBOX_TICKETS.length
    return {
      reply: `Sandbox: נפתחה קריאה מספר ${ticketNumber} (לא נשמר בשרת).`,
      actions: [{ type: 'none', label: 'למעקב תקלות', href: '#tickets' }],
      pendingConfirm: null,
    }
  }

  const scopeLabel =
    scope === 'common' ? 'שטח משותף' : scope === 'private' ? 'דירה פרטית' : 'לא ברור'
  return {
    reply: `נשמע כמו תקלה (${scopeLabel}). אפשר לאשר פתיחת קריאה בהדגמה — או לעבור לטופס התקלות.`,
    actions: [
      {
        type: 'create_ticket',
        label: 'אישור ופתיחת קריאה',
        payload: { confirmCreate: true, scope, message },
      },
      { type: 'none', label: 'טופס תקלות', href: '#tickets' },
    ],
    pendingConfirm: { message, scope },
  }
}
