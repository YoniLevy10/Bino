export type ProjectRow = {
  id: string
  name: string
  project_code: string
  address?: string | null
}

export function parseProjectListReplyId(replyId: string): number | null {
  const m = replyId.trim().match(/^proj_(\d+)$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 0 ? n : null
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

export function buildProjectSelectionListPayload(
  to: string,
  projects: ProjectRow[],
  bodyText: string
): Record<string, unknown> {
  const rows = buildProjectListRows(projects)
  return {
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        button: 'בחר בניין',
        sections: [
          {
            title: 'בניינים',
            rows,
          },
        ],
      },
    },
  }
}

export function buildConfirmTicketButtonsPayload(
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
          { type: 'reply', reply: { id: 'ticket_confirm', title: 'פתח תקלה' } },
          { type: 'reply', reply: { id: 'ticket_cancel', title: 'ביטול' } },
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
