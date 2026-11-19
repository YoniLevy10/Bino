import type { ClientTask, TabMode } from './types'
import { clampLaunchStep, type LaunchWizardStepId } from './launchSteps'

export type SuperadminRoute =
  | { kind: 'tab'; tab: TabMode }
  | { kind: 'launch_new'; step: LaunchWizardStepId }
  | { kind: 'client'; clientId: string; task: ClientTask; launchStep?: LaunchWizardStepId }

const TASKS: readonly ClientTask[] = [
  'hub',
  'launch',
  'onboarding',
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
  if (raw === 'sandbox') return { kind: 'tab', tab: 'sandbox' }
  if (raw === 'leads') return { kind: 'tab', tab: 'leads' }
  if (raw === 'ops') return { kind: 'tab', tab: 'ops' }
  if (raw === 'usage') return { kind: 'tab', tab: 'usage' }
  if (raw === 'intelligence') return { kind: 'tab', tab: 'intelligence' }
  if (raw === 'settings') return { kind: 'tab', tab: 'settings' }

  if (raw === 'launch' || raw === 'launch/new') {
    return { kind: 'launch_new', step: 1 }
  }
  if (raw.startsWith('launch/')) {
    const stepPart = raw.split('/')[1]
    const stepNum = stepPart ? Number(stepPart) : 1
    return { kind: 'launch_new', step: clampLaunchStep(stepNum) }
  }

  const parts = raw.split('/').filter(Boolean)
  if (parts[0] === 'client' && parts[1]) {
    if (parts[2] === 'onboarding') {
      const step = clampLaunchStep(parts[3] ? Number(parts[3]) : 2)
      return { kind: 'client', clientId: parts[1], task: 'onboarding', launchStep: step }
    }
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

export function launchNewHash(step: LaunchWizardStepId = 1): string {
  return step <= 1 ? '#launch/new' : `#launch/${step}`
}

export function onboardingHash(clientId: string, step: LaunchWizardStepId = 2): string {
  return `#client/${clientId}/onboarding/${step}`
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
