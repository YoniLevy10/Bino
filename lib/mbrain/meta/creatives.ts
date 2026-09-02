/**
 * Upload images + create Meta Ad Creatives (official Marketing API).
 */
import { getMetaGraphBaseUrl, getMetaMode, getMetaDataLabel, type MetaDataLabel } from './client'
import { mbrainLog } from '@/lib/mbrain/logging'

function mockId(prefix: string, key: string): string {
  const hash = Array.from(key).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  return `${prefix}_mock_${hash.toString(16)}`
}

export async function uploadAdImagePng(opts: {
  adAccountId: string
  accessToken: string | null
  pngBuffer: Buffer
  filename: string
  idempotencyKey: string
}): Promise<{ label: MetaDataLabel; imageHash: string }> {
  const label = getMetaDataLabel()
  if (getMetaMode() === 'mock' || !opts.accessToken) {
    return { label, imageHash: mockId('imghash', opts.idempotencyKey) }
  }

  const accountId = opts.adAccountId.startsWith('act_') ? opts.adAccountId : `act_${opts.adAccountId}`
  const form = new FormData()
  form.append('filename', new Blob([new Uint8Array(opts.pngBuffer)], { type: 'image/png' }), opts.filename)
  form.append('access_token', opts.accessToken)

  const res = await fetch(`${getMetaGraphBaseUrl()}/${accountId}/adimages`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  })
  const json = (await res.json()) as {
    images?: Record<string, { hash?: string }>
    error?: { message?: string }
  }
  if (!res.ok) {
    mbrainLog('error', 'meta_upload_image_failed', { status: res.status, error: json.error })
    throw new Error(json.error?.message || `Meta image upload failed (${res.status})`)
  }
  const first = Object.values(json.images ?? {})[0]
  if (!first?.hash) throw new Error('Meta image upload returned no hash')
  return { label, imageHash: first.hash }
}

export async function createLinkAdCreative(opts: {
  adAccountId: string
  accessToken: string | null
  pageId: string
  name: string
  message: string
  headline: string
  description?: string
  link: string
  imageHash: string
  callToActionType?: string
  idempotencyKey: string
}): Promise<{ label: MetaDataLabel; creativeId: string; raw: Record<string, unknown> }> {
  const label = getMetaDataLabel()
  if (getMetaMode() === 'mock' || !opts.accessToken) {
    return {
      label,
      creativeId: mockId('cr', opts.idempotencyKey),
      raw: { mock: true },
    }
  }

  const accountId = opts.adAccountId.startsWith('act_') ? opts.adAccountId : `act_${opts.adAccountId}`
  const body = new URLSearchParams({
    name: opts.name,
    object_story_spec: JSON.stringify({
      page_id: opts.pageId,
      link_data: {
        message: opts.message,
        name: opts.headline,
        description: opts.description ?? '',
        link: opts.link,
        image_hash: opts.imageHash,
        call_to_action: {
          type: opts.callToActionType ?? 'LEARN_MORE',
          value: { link: opts.link },
        },
      },
    }),
  })

  const res = await fetch(`${getMetaGraphBaseUrl()}/${accountId}/adcreatives`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.accessToken}` },
    body,
    signal: AbortSignal.timeout(45_000),
  })
  const json = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || `Meta create creative failed (${res.status})`)
  }
  return { label, creativeId: json.id, raw: json as Record<string, unknown> }
}
