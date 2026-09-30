import type { SupabaseClient } from '@supabase/supabase-js'

export type SalesOperator = {
  id: string
  displayName: string
  email: string | null
  active: boolean
  sortOrder: number
}

export type OperatorActor = {
  id: string
  displayName: string
  label: string
}

type EnvOperator = { id: string; name: string; email?: string | null }

/**
 * Parse BINO_SALES_OPERATORS env.
 * Format: JSON array [{"id":"uuid","name":"…","email":"…"}]
 * Or CSV lines: uuid:Name:email
 */
export function parseSalesOperatorsEnv(
  raw = process.env.BINO_SALES_OPERATORS,
): EnvOperator[] {
  if (!raw?.trim()) return []
  const text = raw.trim()
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (!Array.isArray(parsed)) return []
      const out: EnvOperator[] = []
      for (const row of parsed) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        const id = String(r.id ?? '').trim()
        const name = String(r.name ?? r.displayName ?? '').trim()
        if (!id || !name) continue
        out.push({
          id,
          name,
          email: r.email != null ? String(r.email) : null,
        })
      }
      return out
    } catch {
      return []
    }
  }
  const out: EnvOperator[] = []
  for (const part of text.split(/[\n,]+/)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const [id, name, email] = trimmed.split(':').map((s) => s.trim())
    if (!id || !name) continue
    out.push({ id, name, email: email || null })
  }
  return out
}

function rowToOperator(row: Record<string, unknown>): SalesOperator {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    email: (row.email as string | null) ?? null,
    active: Boolean(row.active ?? true),
    sortOrder: Number(row.sort_order ?? 0),
  }
}

/** Upsert operators from env into DB so all instances share the same roster. */
export async function syncOperatorsFromEnv(admin: SupabaseClient): Promise<SalesOperator[]> {
  const fromEnv = parseSalesOperatorsEnv()
  if (fromEnv.length > 0) {
    for (let i = 0; i < fromEnv.length; i++) {
      const op = fromEnv[i]
      const { error } = await admin.from('sales_operators').upsert(
        {
          id: op.id,
          display_name: op.name,
          email: op.email ?? null,
          active: true,
          sort_order: i,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      if (error) throw error
    }
  }
  return listActiveOperators(admin)
}

export async function listActiveOperators(admin: SupabaseClient): Promise<SalesOperator[]> {
  const { data, error } = await admin
    .from('sales_operators')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => rowToOperator(r as Record<string, unknown>))
}

export async function resolveOperatorActor(
  admin: SupabaseClient,
  operatorId: string | null | undefined,
): Promise<OperatorActor | null> {
  const id = operatorId?.trim()
  if (!id) return null
  const { data, error } = await admin
    .from('sales_operators')
    .select('*')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const op = rowToOperator(data as Record<string, unknown>)
  return {
    id: op.id,
    displayName: op.displayName,
    label: op.displayName,
  }
}

export function operatorIdFromRequest(req: Request): string | null {
  return (
    req.headers.get('x-sales-operator-id')?.trim() ||
    req.headers.get('x-bino-operator-id')?.trim() ||
    null
  )
}
