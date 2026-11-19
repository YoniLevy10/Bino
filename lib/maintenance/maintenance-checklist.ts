import { z } from 'zod'

export const maintenanceChecklistItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(200),
  done_at: z.string().nullable(),
})

export type MaintenanceChecklistItem = z.infer<typeof maintenanceChecklistItemSchema>

export const maintenanceChecklistItemsSchema = z.array(maintenanceChecklistItemSchema).max(40)

export function normalizeChecklistItems(raw: unknown): MaintenanceChecklistItem[] {
  if (!Array.isArray(raw)) return []
  const out: MaintenanceChecklistItem[] = []
  for (const item of raw.slice(0, 40)) {
    const parsed = maintenanceChecklistItemSchema.safeParse(item)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

export function toggleChecklistItem(
  items: MaintenanceChecklistItem[],
  itemId: string,
  done: boolean,
  nowIso = new Date().toISOString()
): MaintenanceChecklistItem[] {
  return items.map((it) =>
    it.id === itemId ? { ...it, done_at: done ? nowIso : null } : it
  )
}
