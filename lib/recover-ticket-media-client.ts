import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

/** Ask server to attach stashed WhatsApp media to an open ticket. */
export async function recoverWhatsAppMediaForTicket(ticketId: string): Promise<{
  recovered: boolean
  error?: string
}> {
  try {
    const res = await fetchWithTimeout('/api/tickets/recover-whatsapp-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId }),
    })
    const json = (await res.json()) as { recovered?: boolean; error?: string }
    if (!res.ok || !json.recovered) {
      return { recovered: false, error: json.error }
    }
    return { recovered: true }
  } catch {
    return { recovered: false, error: 'שגיאת רשת' }
  }
}
