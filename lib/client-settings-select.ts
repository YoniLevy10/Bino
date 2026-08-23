import { CLIENT_GROW_LEGAL_SETTINGS_SELECT } from '@/lib/client-grow-legal'
import { CLIENT_GREENINVOICE_SETTINGS_SELECT } from '@/lib/greeninvoice-credentials'

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
  CLIENT_GREENINVOICE_SETTINGS_SELECT,
  CLIENT_GROW_LEGAL_SETTINGS_SELECT,
].join(', ')

/** Server-only select — used to derive *_set flags, never returned to the client. */
export const CLIENT_SETTINGS_SECRET_PROBE_SELECT =
  'whatsapp_access_token, greeninvoice_api_secret'

export const CLIENT_SETTINGS_READ_SELECT = `${CLIENT_SETTINGS_SAFE_SELECT}, ${CLIENT_SETTINGS_SECRET_PROBE_SELECT}`
