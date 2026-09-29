/**
 * Fire-and-forget push of a new BINO sales lead into OpsBrain hub.
 * Requires Vercel env:
 *   OPSBRAIN_INGEST_URL=https://individual-opsbrain.base44.app/api/functions/ingestExternalLead
 *   OPSBRAIN_INGEST_SECRET=<same as OpsBrain secret OPSBRAIN_INGEST_SECRET>
 */
export type OpsBrainLeadPayload = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  businessName?: string | null
  notes?: string | null
  city?: string | null
}

const DEFAULT_URL =
  'https://individual-opsbrain.base44.app/api/functions/ingestExternalLead'

export async function notifyOpsBrainNewLead(lead: OpsBrainLeadPayload): Promise<void> {
  const secret = process.env.OPSBRAIN_INGEST_SECRET?.trim()
  if (!secret) return

  const url = (process.env.OPSBRAIN_INGEST_URL || DEFAULT_URL).trim()
  const notes = [lead.notes, lead.city && `עיר: ${lead.city}`, lead.businessName && `חברה: ${lead.businessName}`]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-opsbrain-ingest-secret': secret,
      },
      body: JSON.stringify({
        project_name: 'BINO',
        source: 'bino_sales_leads',
        name: lead.name,
        phone: lead.phone || undefined,
        email: lead.email || undefined,
        notes: notes || undefined,
        external_id: `bino:${lead.id}`,
        create_task: true,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn('[opsbrain-notify] non-OK', res.status, await res.text().catch(() => ''))
    }
  } catch (e) {
    console.warn('[opsbrain-notify] failed', e instanceof Error ? e.message : e)
  }
}
