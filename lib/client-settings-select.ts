import { CLIENT_GROW_LEGAL_SETTINGS_SELECT } from '@/lib/client-grow-legal'
import { CLIENT_GROW_PAYMENTS_SELECT } from '@/lib/grow-credentials'

/** Safe client fields for browser / tenant reads (no API secrets). */
export const CLIENT_SETTINGS_SAFE_SELECT = [
  'id',
  'name',
  'logo_url',
  'whatsapp_business_phone',
  'manager_phone',
  'default_worker_phone',
  'sms_on_ticket_open',
  'sms_on_ticket_close',
  'whatsapp_phone_number_id',
  'sms_sender_name',
  'sidebar_nav_order',
  CLIENT_GROW_LEGAL_SETTINGS_SELECT,
  CLIENT_GROW_PAYMENTS_SELECT,
].join(', ')

/** Server-only select — used to derive *_set flags, never returned to the client. */
export const CLIENT_SETTINGS_SECRET_PROBE_SELECT = 'whatsapp_access_token'

export const CLIENT_SETTINGS_READ_SELECT = `${CLIENT_SETTINGS_SAFE_SELECT}, ${CLIENT_SETTINGS_SECRET_PROBE_SELECT}`
