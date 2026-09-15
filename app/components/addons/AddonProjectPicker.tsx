'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { asyncHandler } from '@/lib/error-handler'
import { Card, EmptyState, LoadingSpinner, Select, theme } from '../ui'

export type AddonProjectOption = {
  id: string
  name: string
  project_code: string
}

const LAST_PROJECT_STORAGE_KEY = 'last_addon_project_id'

type Props = {
  children: (project: AddonProjectOption) => ReactNode
  emptyHint?: string
}

function readStoredProjectId(): string | null {
  try {
    return sessionStorage.getItem(LAST_PROJECT_STORAGE_KEY)?.trim() || null
  } catch {
    return null
  }
}

function writeStoredProjectId(id: string) {
  try {
    sessionStorage.setItem(LAST_PROJECT_STORAGE_KEY, id)
  } catch {
    // ignore quota / private mode
  }
}

function resolveSelectedProjectId(
  rows: AddonProjectOption[],
  prev: string,
  urlProjectId: string
): string {
  if (prev && rows.some((r) => r.id === prev)) return prev
  if (urlProjectId && rows.some((r) => r.id === urlProjectId)) return urlProjectId
  const stored = readStoredProjectId()
  if (stored && rows.some((r) => r.id === stored)) return stored
  return rows[0]?.id ?? ''
}

export function AddonProjectPicker({ children, emptyHint }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const projectFromUrl = searchParams.get('project')?.trim() ?? ''
  const initialUrlProjectRef = useRef(projectFromUrl)
  const didInitialUrlSyncRef = useRef(false)

  const [projects, setProjects] = useState<AddonProjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    await asyncHandler(
      async () => {
        const clientId = await resolveBinoClientIdForBrowser()
        const { data, error } = await supabase
          .from('projects')
          .select('id, name, project_code')
          .eq('client_id', clientId)
          .eq('is_active', true)
          .order('name', { ascending: true })
        if (error) throw error
        const rows = (data as AddonProjectOption[]) || []
        setProjects(rows)
        setSelectedId((prev) =>
          resolveSelectedProjectId(rows, prev, initialUrlProjectRef.current)
        )
      },
      { context: 'טעינת פרויקטים', showErrorToast: true }
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (loading || projects.length === 0 || !selectedId || didInitialUrlSyncRef.current) return
    didInitialUrlSyncRef.current = true
    writeStoredProjectId(selectedId)
    if (initialUrlProjectRef.current !== selectedId) {
      router.replace(`${pathname}?project=${encodeURIComponent(selectedId)}`, { scroll: false })
    }
  }, [loading, projects.length, selectedId, pathname, router])

  useEffect(() => {
    if (loading || !projectFromUrl || projects.length === 0) return
    if (!projects.some((p) => p.id === projectFromUrl)) return
    setSelectedId((prev) => (prev === projectFromUrl ? prev : projectFromUrl))
    writeStoredProjectId(projectFromUrl)
  }, [projectFromUrl, loading, projects])

  function handleSelect(id: string) {
    setSelectedId(id)
    writeStoredProjectId(id)
    router.replace(`${pathname}?project=${encodeURIComponent(id)}`, { scroll: false })
  }

  if (loading) {
    return (
      <Card>
        <div style={styles.loading}>
          <LoadingSpinner />
        </div>
      </Card>
    )
  }

  if (projects.length === 0) {
    return (
      <Card>
        <EmptyState
          title="אין פרויקטים פעילים"
          description={emptyHint ?? 'הוסיפו בניין בדף פרויקטים כדי להשתמש בתוסף.'}
          action={
            <Link href="/projects" style={styles.projectsLink}>
              לדף פרויקטים ←
            </Link>
          }
        />
      </Card>
    )
  }

  const selected = projects.find((p) => p.id === selectedId) ?? projects[0]

  return (
    <div style={styles.wrap}>
      <Card title="בחירת בניין" subtitle={`${projects.length} בניינים פעילים`}>
        <div style={styles.pickerRow}>
          <Select
            value={selected.id}
            onChange={handleSelect}
            options={projects.map((p) => ({
              label: `${p.name} (${p.project_code})`,
              value: p.id,
            }))}
            style={{ flex: 1, minWidth: 200 }}
          />
        </div>
      </Card>
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
  loading: { display: 'flex', justifyContent: 'center', padding: 32 },
  projectsLink: {
    display: 'inline-block',
    marginTop: 8,
    fontSize: 14,
    fontWeight: 600,
    color: theme.colors.primary,
    textDecoration: 'none',
  },
}
