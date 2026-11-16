/**
 * Composio → Meta WhatsApp message templates (UTILITY / service only).
 * Hard ban: no MARKETING / cold outreach templates through this module.
 */

import {
  COMPOSIO_NOT_CONNECTED_HE,
  executeComposioTool,
  getComposioWhatsAppConnectedAccountId,
  isComposioWhatsAppConfigured,
  type ComposioExecuteErr,
} from '@/lib/composio-execute'
import {
  META_WHATSAPP_TEMPLATE_SPECS,
  buildMetaTemplateCreatePayload,
  getMetaTemplateSpecById,
  isMetaTemplateSpecComposable,
  type MetaTemplateSpec,
} from '@/lib/meta-whatsapp-template-specs'

export type MetaLiveTemplateStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED'
  | 'DISABLED'
  | 'PAUSED'
  | 'LIMIT_EXCEEDED'
  | 'UNKNOWN'
  | 'MISSING'

export type MetaLiveTemplateRow = {
  id: string | null
  name: string
  status: MetaLiveTemplateStatus
  category: string | null
  language: string | null
}

export type MetaSpecSyncRow = {
  specId: string
  metaName: string
  purpose: string
  composable: boolean
  localStatus: MetaTemplateSpec['status']
  live: MetaLiveTemplateRow | null
}

function normalizeStatus(raw: unknown): MetaLiveTemplateStatus {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase()
  if (
    s === 'APPROVED' ||
    s === 'PENDING' ||
    s === 'REJECTED' ||
    s === 'DISABLED' ||
    s === 'PAUSED' ||
    s === 'LIMIT_EXCEEDED'
  ) {
    return s
  }
  if (!s) return 'UNKNOWN'
  return 'UNKNOWN'
}

function asTemplateArray(data: unknown): unknown[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>
    if (Array.isArray(o.data)) return o.data
    const nested = o.data
    if (nested && typeof nested === 'object' && Array.isArray((nested as { data?: unknown }).data)) {
      return (nested as { data: unknown[] }).data
    }
  }
  return []
}

function parseTemplateRow(row: unknown): MetaLiveTemplateRow | null {
  if (!row || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (!name) return null
  return {
    id: typeof o.id === 'string' ? o.id : o.id != null ? String(o.id) : null,
    name,
    status: normalizeStatus(o.status),
    category: typeof o.category === 'string' ? o.category : null,
    language: typeof o.language === 'string' ? o.language : null,
  }
}

export function getComposioMetaTemplatesConfig() {
  return {
    configured: isComposioWhatsAppConfigured(),
    connectedAccountId: getComposioWhatsAppConnectedAccountId(),
    messageHe: isComposioWhatsAppConfigured() ? null : COMPOSIO_NOT_CONNECTED_HE,
  }
}

export async function listMetaTemplatesViaComposio(options?: {
  connectedAccountId?: string | null
  nameOrContent?: string | null
  limit?: number
}): Promise<
  | { ok: true; templates: MetaLiveTemplateRow[] }
  | { ok: false; error: ComposioExecuteErr }
> {
  const result = await executeComposioTool({
    toolSlug: 'WHATSAPP_GET_MESSAGE_TEMPLATES',
    connectedAccountId: options?.connectedAccountId,
    arguments: {
      limit: Math.min(100, Math.max(1, options?.limit ?? 50)),
      fields: 'name,status,category,language,id',
      category: 'UTILITY',
      ...(options?.nameOrContent?.trim()
        ? { name_or_content: options.nameOrContent.trim() }
        : {}),
    },
    timeoutMs: 25_000,
  })

  if (!result.ok) return { ok: false, error: result }

  const templates = asTemplateArray(result.data)
    .map(parseTemplateRow)
    .filter((t): t is MetaLiveTemplateRow => Boolean(t))

  return { ok: true, templates }
}

export async function syncMetaTemplateSpecsViaComposio(options?: {
  connectedAccountId?: string | null
}): Promise<
  | { ok: true; rows: MetaSpecSyncRow[]; templates: MetaLiveTemplateRow[] }
  | { ok: false; error: ComposioExecuteErr }
> {
  const listed = await listMetaTemplatesViaComposio({
    connectedAccountId: options?.connectedAccountId,
    limit: 100,
  })
  if (!listed.ok) return listed

  const byName = new Map<string, MetaLiveTemplateRow>()
  for (const t of listed.templates) {
    byName.set(t.name, t)
  }

  const rows: MetaSpecSyncRow[] = META_WHATSAPP_TEMPLATE_SPECS.map((spec) => ({
    specId: spec.id,
    metaName: spec.metaName,
    purpose: spec.purpose,
    composable: isMetaTemplateSpecComposable(spec),
    localStatus: spec.status,
    live: byName.get(spec.metaName) ?? null,
  }))

  return { ok: true, rows, templates: listed.templates }
}

export type CreateMetaTemplateInput = {
  specId: string
  /** Optional Bino client label → name suffix for client-adapted template. */
  nameSuffix?: string | null
  /** Optional customized body (must keep {{n}} vars). UTILITY only. */
  bodyOverride?: string | null
  connectedAccountId?: string | null
  language?: string | null
}

export async function createMetaTemplateViaComposio(
  input: CreateMetaTemplateInput
): Promise<
  | {
      ok: true
      name: string
      category: 'UTILITY'
      language: string
      metaResponse: unknown
    }
  | { ok: false; error: ComposioExecuteErr | { code: 'INVALID_SPEC' | 'NOT_COMPOSABLE'; messageHe: string; message: string } }
> {
  const spec = getMetaTemplateSpecById(input.specId)
  if (!spec) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SPEC',
        messageHe: 'תבנית לא נמצאה',
        message: `Unknown spec id: ${input.specId}`,
      },
    }
  }

  if (!isMetaTemplateSpecComposable(spec)) {
    return {
      ok: false,
      error: {
        code: 'NOT_COMPOSABLE',
        messageHe: 'תבנית זו דורשת הגדרה ידנית ב-Meta (למשל Header תמונה)',
        message: `Spec ${spec.id} is not auto-composable`,
      },
    }
  }

  let payload: ReturnType<typeof buildMetaTemplateCreatePayload>
  try {
    payload = buildMetaTemplateCreatePayload(spec, {
      nameSuffix: input.nameSuffix,
      bodyOverride: input.bodyOverride,
      language: input.language,
    })
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'NOT_COMPOSABLE',
        messageHe: 'רק תבניות שירות (Utility) מותרות',
        message: e instanceof Error ? e.message : String(e),
      },
    }
  }

  const result = await executeComposioTool({
    toolSlug: 'WHATSAPP_CREATE_MESSAGE_TEMPLATE',
    connectedAccountId: input.connectedAccountId,
    arguments: {
      name: payload.name,
      category: payload.category,
      language: payload.language,
      allow_category_change: payload.allow_category_change,
      components: payload.components,
    },
    timeoutMs: 30_000,
  })

  if (!result.ok) return { ok: false, error: result }

  return {
    ok: true,
    name: payload.name,
    category: payload.category,
    language: payload.language,
    metaResponse: result.data,
  }
}
