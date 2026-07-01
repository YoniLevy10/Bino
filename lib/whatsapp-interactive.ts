import type { ResidentLang } from '@/lib/whatsapp-bilingual-template'

export type ProjectRow = {
  id: string
  name: string
  project_code: string
  address?: string | null
}

const LIST_LABELS: Record<ResidentLang, { button: string; title: string }> = {
  he: { button: 'בחר בניין', title: 'בניינים' },
  fr: { button: 'Choisir', title: 'Immeubles' },
  en: { button: 'Choose', title: 'Buildings' },
}

const CONFIRM_LABELS: Record<ResidentLang, { confirm: string; cancel: string }> = {
  he: { confirm: 'פתח תקלה', cancel: 'ביטול' },
  fr: { confirm: 'Ouvrir', cancel: 'Annuler' },
  en: { confirm: 'Open ticket', cancel: 'Cancel' },
}

export function parseProjectListReplyId(replyId: string): number | null {
  const m = replyId.trim().match(/^proj_(\d+)$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function parseLanguageButtonReplyId(replyId: string): ResidentLang | null {
  if (replyId === 'lang_he') return 'he'
  if (replyId === 'lang_fr') return 'fr'
  if (replyId === 'lang_en') return 'en'
  return null
}

export function buildProjectListRows(projects: ProjectRow[]) {
  return projects.map((project, index) => {
    const addressText = project.address ? ` — ${project.address}` : ''
    return {
      id: `proj_${index}`,
      title: project.name.slice(0, 24),
      description: `${project.project_code}${addressText}`.slice(0, 72),
    }
  })
}

export function buildLanguageButtonsPayload(
  to: string,
  bodyText: string
): Record<string, unknown> {
  return {
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'lang_he', title: 'עברית' } },
          { type: 'reply', reply: { id: 'lang_fr', title: 'Français' } },
          { type: 'reply', reply: { id: 'lang_en', title: 'English' } },
        ],
      },
    },
  }
}

export function buildProjectSelectionListPayload(
  to: string,
  projects: ProjectRow[],
  bodyText: string,
  lang: ResidentLang = 'he'
): Record<string, unknown> {
  const rows = buildProjectListRows(projects)
  const labels = LIST_LABELS[lang]
  return {
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        button: labels.button.slice(0, 20),
        sections: [
          {
            title: labels.title.slice(0, 24),
            rows,
          },
        ],
      },
    },
  }
}

export function buildConfirmTicketButtonsPayload(
  to: string,
  bodyText: string,
  lang: ResidentLang = 'he'
): Record<string, unknown> {
  const labels = CONFIRM_LABELS[lang]
  return {
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'ticket_confirm', title: labels.confirm.slice(0, 20) } },
          { type: 'reply', reply: { id: 'ticket_cancel', title: labels.cancel.slice(0, 20) } },
        ],
      },
    },
  }
}

export function parseConfirmButtonReplyId(replyId: string): 'confirm' | 'cancel' | null {
  if (replyId === 'ticket_confirm') return 'confirm'
  if (replyId === 'ticket_cancel') return 'cancel'
  return null
}
