'use client'

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { asyncHandler } from '@/lib/error-handler'
import { Card, EmptyState, LoadingSpinner, Select, theme } from '../ui'

export type AddonProjectOption = {
  id: string
  name: string
  project_code: string
}

type Props = {
  children: (project: AddonProjectOption) => ReactNode
  emptyHint?: string
}

export function AddonProjectPicker({ children, emptyHint }: Props) {
  const [projects, setProjects] = useState<AddonProjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    await asyncHandler(
      async () => {
        const clientId = await resolveBamakorClientIdForBrowser()
        const { data, error } = await supabase
          .from('projects')
          .select('id, name, project_code')
          .eq('client_id', clientId)
          .eq('is_active', true)
          .order('name', { ascending: true })
        if (error) throw error
        const rows = (data as AddonProjectOption[]) || []
        setProjects(rows)
        setSelectedId((prev) => {
          if (prev && rows.some((r) => r.id === prev)) return prev
          return rows[0]?.id ?? ''
        })
      },
      { context: 'טעינת פרויקטים', showErrorToast: true }
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div style={styles.loading}>
        <LoadingSpinner />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <Card>
        <EmptyState
          title="אין פרויקטים פעילים"
          description={emptyHint ?? 'הוסיפו בניין בדף פרויקטים כדי להשתמש בתוסף.'}
        />
      </Card>
    )
  }

  const selected = projects.find((p) => p.id === selectedId) ?? projects[0]

  return (
    <div style={styles.wrap}>
      <div style={styles.pickerRow}>
        <label style={styles.label}>
          בניין
        </label>
        <Select
          value={selected.id}
          onChange={setSelectedId}
          options={projects.map((p) => ({
            label: `${p.name} (${p.project_code})`,
            value: p.id,
          }))}
          style={{ flex: 1, maxWidth: 420 }}
        />
      </div>
      {children(selected)}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 20 },
  pickerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: theme.colors.textSecondary,
    flexShrink: 0,
  },
  loading: { display: 'flex', justifyContent: 'center', padding: 48 },
}
