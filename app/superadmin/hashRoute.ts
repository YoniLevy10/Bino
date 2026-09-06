import type { ClientTask, TabMode } from './types'

export type SuperadminRoute =
  | { kind: 'tab'; tab: TabMode }
  | { kind: 'client'; clientId: string; task: ClientTask }

const TASKS: readonly ClientTask[] = [
  'hub',
  'plan',
  'nav',
  'addons',
  'buildings',
  'attendance',
  'invite',
  'logo',
  'recover',
  'delete',
]

function isTask(value: string): value is ClientTask {
  return (TASKS as readonly string[]).includes(value)
}

export function parseSuperadminHash(hash: string): SuperadminRoute {
  const raw = hash.replace(/^#/, '').trim()
  if (!raw || raw === 'clients') return { kind: 'tab', tab: 'clients' }
  if (raw === 'ops') return { kind: 'tab', tab: 'ops' }
  if (raw === 'usage') return { kind: 'tab', tab: 'usage' }
  if (raw === 'settings') return { kind: 'tab', tab: 'settings' }

  const parts = raw.split('/').filter(Boolean)
  if (parts[0] === 'client' && parts[1]) {
    const task = parts[2] && isTask(parts[2]) ? parts[2] : 'hub'
    return { kind: 'client', clientId: parts[1], task }
  }
  return { kind: 'tab', tab: 'clients' }
}

export function tabHash(tab: TabMode): string {
  return tab === 'clients' ? '' : `#${tab}`
}

export function clientHash(clientId: string, task: ClientTask = 'hub'): string {
  return task === 'hub' ? `#client/${clientId}` : `#client/${clientId}/${task}`
}

export function writeHash(hash: string) {
  if (typeof window === 'undefined') return
  const next = !hash || hash === '#' ? '' : hash.startsWith('#') ? hash : `#${hash}`
  if ((window.location.hash || '') === next) return
  if (!next) {
    const { pathname, search } = window.location
    window.history.replaceState(null, '', `${pathname}${search}`)
    return
  }
  window.location.hash = next
}
