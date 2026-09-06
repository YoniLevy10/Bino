import { fetchWithTimeout } from '@/lib/fetch-timeout'

export async function sendResendEmail(opts: {
  to: string
  subject: string
  body: string
  from?: string
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY לא מוגדר' }
  }

  const from =
    opts.from ||
    (process.env.RESEND_FROM_EMAIL || '').trim() ||
    'Bino <noreply@bino.app>'

  const res = await fetchWithTimeout(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.body,
      }),
    },
    15_000
  )

  if (!res) return { ok: false, error: 'Resend timeout' }
  const json = (await res.json()) as { id?: string; message?: string }
  if (!res.ok) return { ok: false, error: json.message || `Resend ${res.status}` }
  return { ok: true, id: json.id }
}
