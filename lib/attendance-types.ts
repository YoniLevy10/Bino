export const ATTENDANCE_EVENT_TYPES = [
  'clock_in',
  'clock_out',
  'project_arrival',
  'project_departure',
  'project_visit',
] as const

export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number]

export const ATTENDANCE_TAG_TYPES = ['office', 'project'] as const
export type AttendanceTagType = (typeof ATTENDANCE_TAG_TYPES)[number]

export const ATTENDANCE_SYNC_STATUSES = ['synced', 'pending_review', 'conflict', 'rejected'] as const
export type AttendanceSyncStatus = (typeof ATTENDANCE_SYNC_STATUSES)[number]

export const ATTENDANCE_EVENT_SOURCES = ['online', 'offline'] as const
export type AttendanceEventSource = (typeof ATTENDANCE_EVENT_SOURCES)[number]

export type NfcTagRow = {
  id: string
  client_id: string
  project_id: string | null
  tag_code: string
  tag_type: AttendanceTagType
  label: string | null
  is_active: boolean
}

export type WorkerOfflineProfile = {
  worker_id: string
  client_id: string
  full_name: string
  access_token: string
  device_id: string
  saved_at: string
}

export type LocalAttendanceState = {
  has_open_shift: boolean
  open_shift_id: string | null
  last_event_type: AttendanceEventType | null
  last_event_at: string | null
  last_tag_code: string | null
}

export type PendingAttendanceEvent = {
  client_action_id: string
  tag_code: string
  event_type: AttendanceEventType
  client_recorded_at: string
  client_timezone: string | null
  device_id: string | null
  user_agent: string | null
  lat: number | null
  lng: number | null
  note: string | null
  source: AttendanceEventSource
  sync_state: 'pending' | 'failed'
  last_error: string | null
  created_at: string
}

export type AttendanceSyncEventInput = {
  client_action_id: string
  tag_code: string
  event_type: AttendanceEventType
  client_recorded_at: string
  client_timezone?: string | null
  device_id?: string | null
  user_agent?: string | null
  lat?: number | null
  lng?: number | null
  note?: string | null
  source: AttendanceEventSource
}

export type AttendanceSyncEventResult = {
  client_action_id: string
  status: 'synced' | 'conflict' | 'rejected' | 'pending_review'
  event_id?: string
  message?: string
}

/** Max minutes between client time and server before flagging review (6 hours). */
export const ATTENDANCE_SYNC_DELAY_REVIEW_MINUTES = 6 * 60

/** Client time more than this many minutes in the future vs server → suspicious. */
export const ATTENDANCE_FUTURE_SKEW_MINUTES = 5
