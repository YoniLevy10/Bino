import type {
  LocalAttendanceState,
  NfcTagRow,
  PendingAttendanceEvent,
  WorkerOfflineProfile,
} from '@/lib/attendance-types'

const DB_NAME = 'bamakor_offline_attendance'
const DB_VERSION = 1

const STORES = {
  profile: 'worker_profile',
  tags: 'nfc_tags',
  pending: 'pending_attendance_events',
  state: 'local_attendance_state',
} as const

type StoreName = (typeof STORES)[keyof typeof STORES]

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORES.profile)) {
          db.createObjectStore(STORES.profile, { keyPath: 'access_token' })
        }
        if (!db.objectStoreNames.contains(STORES.tags)) {
          db.createObjectStore(STORES.tags, { keyPath: 'client_id' })
        }
        if (!db.objectStoreNames.contains(STORES.pending)) {
          const s = db.createObjectStore(STORES.pending, { keyPath: 'client_action_id' })
          s.createIndex('sync_state', 'sync_state', { unique: false })
        }
        if (!db.objectStoreNames.contains(STORES.state)) {
          db.createObjectStore(STORES.state, { keyPath: 'worker_id' })
        }
      }
    })
  }
  return dbPromise
}

function txStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const os = tx.objectStore(store)
        const req = fn(os)
        tx.oncomplete = () => {
          if (req && 'result' in req) resolve((req as IDBRequest<T>).result)
          else resolve(undefined)
        }
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      })
  )
}

export async function initOfflineAttendanceDB(): Promise<void> {
  await openDb()
}

export async function saveWorkerOfflineProfile(profile: WorkerOfflineProfile): Promise<void> {
  await txStore(STORES.profile, 'readwrite', (s) => s.put(profile))
}

export async function getWorkerOfflineProfile(
  accessToken: string
): Promise<WorkerOfflineProfile | null> {
  const row = await txStore<WorkerOfflineProfile | undefined>(
    STORES.profile,
    'readonly',
    (s) => s.get(accessToken)
  )
  return row ?? null
}

export async function saveOfflineNfcTags(clientId: string, tags: NfcTagRow[]): Promise<void> {
  await txStore(STORES.tags, 'readwrite', (s) => s.put({ client_id: clientId, tags, saved_at: new Date().toISOString() }))
}

export async function getOfflineNfcTags(clientId: string): Promise<NfcTagRow[]> {
  const row = await txStore<{ tags?: NfcTagRow[] } | undefined>(STORES.tags, 'readonly', (s) =>
    s.get(clientId)
  )
  return row?.tags ?? []
}

export async function addPendingAttendanceEvent(event: PendingAttendanceEvent): Promise<void> {
  await txStore(STORES.pending, 'readwrite', (s) => s.put(event))
}

export async function getPendingAttendanceEvents(): Promise<PendingAttendanceEvent[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.pending, 'readonly')
    const req = tx.objectStore(STORES.pending).getAll()
    req.onsuccess = () => {
      const all = (req.result as PendingAttendanceEvent[]) ?? []
      resolve(all.filter((e) => e.sync_state === 'pending' || e.sync_state === 'failed'))
    }
    req.onerror = () => reject(req.error)
  })
}

export async function markPendingEventSynced(clientActionId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.pending, 'readwrite')
    const os = tx.objectStore(STORES.pending)
    const getReq = os.get(clientActionId)
    getReq.onsuccess = () => {
      const row = getReq.result as PendingAttendanceEvent | undefined
      if (row) os.delete(clientActionId)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function markPendingEventFailed(clientActionId: string, error: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.pending, 'readwrite')
    const os = tx.objectStore(STORES.pending)
    const getReq = os.get(clientActionId)
    getReq.onsuccess = () => {
      const row = getReq.result as PendingAttendanceEvent | undefined
      if (row) {
        os.put({ ...row, sync_state: 'failed' as const, last_error: error })
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getLocalAttendanceState(workerId: string): Promise<LocalAttendanceState | null> {
  const row = await txStore<LocalAttendanceState | undefined>(STORES.state, 'readonly', (s) =>
    s.get(workerId)
  )
  return row ?? null
}

export async function updateLocalAttendanceState(state: LocalAttendanceState & { worker_id: string }): Promise<void> {
  await txStore(STORES.state, 'readwrite', (s) => s.put(state))
}

export async function clearSyncedEvents(): Promise<void> {
  const pending = await getPendingAttendanceEvents()
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.pending, 'readwrite')
    const os = tx.objectStore(STORES.pending)
    for (const e of pending) {
      if (e.sync_state !== 'pending' && e.sync_state !== 'failed') {
        os.delete(e.client_action_id)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server'
  const key = 'bamakor_attendance_device_id'
  try {
    let id = localStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(key, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}
