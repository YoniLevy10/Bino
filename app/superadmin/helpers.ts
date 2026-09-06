import {
  effectiveMaxBuildings,
  effectiveMaxTicketsPerMonth,
  effectiveMaxWorkers,
  normalizeTier,
  type PlanCatalogLimits,
} from '@/lib/plan-limits'
import type { ClientRow, EditState, PlanCatalogRow } from './types'

export type NewClientForm = {
  name: string
  email: string
  password: string
  phone: string
  plan_tier: string
  max_workers: string
  buildings_allowed: string
  max_tickets_per_month: string
}

export function parseOptionalLimitInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 1) throw new Error('מכסות חייבות להיות מספר חיובי')
  return Math.floor(n)
}

export function formatEffectiveLimit(value: number | null): string {
  return value == null ? 'ללא הגבלה' : value.toLocaleString('he-IL')
}

function toCatalogLimits(row: PlanCatalogRow | null | undefined): PlanCatalogLimits | null {
  if (!row) return null
  return {
    buildings_max: row.buildings_max,
    workers_max: row.workers_max,
    tickets_per_month_max: row.tickets_per_month_max,
  }
}

export function previewClientLimits(
  editState: EditState,
  catalog: PlanCatalogRow[]
): { workers: number | null; buildings: number | null; tickets: number | null } {
  const tier = normalizeTier(editState.plan_tier)
  const catalogRow = catalog.find((row) => row.plan_tier === tier) ?? null
  let maxWorkers: number | null = null
  let maxBuildings: number | null = null
  let maxTickets: number | null = null
  try {
    maxWorkers = parseOptionalLimitInput(editState.max_workers)
    maxBuildings = parseOptionalLimitInput(editState.buildings_allowed)
    maxTickets = parseOptionalLimitInput(editState.max_tickets_per_month)
  } catch {
    return { workers: null, buildings: null, tickets: null }
  }
  const clientRow = {
    id: '',
    plan_tier: editState.plan_tier,
    max_workers: maxWorkers,
    buildings_allowed: maxBuildings,
    max_tickets_per_month: maxTickets,
  }
  const limits = toCatalogLimits(catalogRow)
  return {
    workers: effectiveMaxWorkers(clientRow, limits),
    buildings: effectiveMaxBuildings(clientRow, limits),
    tickets: effectiveMaxTicketsPerMonth(clientRow, limits),
  }
}

export function effectiveLimitsForClient(client: ClientRow, catalog: PlanCatalogRow[]) {
  const tier = normalizeTier(client.plan_tier)
  const catalogRow = catalog.find((row) => row.plan_tier === tier) ?? null
  const clientRow = {
    id: client.id,
    plan_tier: client.plan_tier,
    max_workers: client.max_workers,
    buildings_allowed: client.buildings_allowed,
    max_tickets_per_month: client.max_tickets_per_month,
  }
  const limits = toCatalogLimits(catalogRow)
  return {
    workers: effectiveMaxWorkers(clientRow, limits),
    buildings: effectiveMaxBuildings(clientRow, limits),
    tickets: effectiveMaxTicketsPerMonth(clientRow, limits),
  }
}

export function editStateFromClient(c: ClientRow): EditState {
  return {
    name: c.name,
    plan_tier: c.plan_tier,
    whatsapp_phone_number_id: c.whatsapp_phone_number_id ?? '',
    manager_phone: c.manager_phone ?? '',
    sms_sender_name: c.sms_sender_name ?? '',
    max_workers: c.max_workers != null ? String(c.max_workers) : '',
    buildings_allowed: c.buildings_allowed != null ? String(c.buildings_allowed) : '',
    max_tickets_per_month: c.max_tickets_per_month != null ? String(c.max_tickets_per_month) : '',
  }
}

export function emptyEditState(): EditState {
  return {
    name: '',
    plan_tier: 'starter',
    whatsapp_phone_number_id: '',
    manager_phone: '',
    sms_sender_name: '',
    max_workers: '',
    buildings_allowed: '',
    max_tickets_per_month: '',
  }
}

export function adminHeaders(secret: string): HeadersInit {
  return { 'x-admin-secret': secret }
}
