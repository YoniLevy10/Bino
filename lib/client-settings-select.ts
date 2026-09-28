import { CLIENT_GROW_LEGAL_SETTINGS_SELECT } from '@/lib/client-grow-legal'
import { CLIENT_GROW_PAYMENTS_SELECT } from '@/lib/grow-credentials'

/** GetLink / onboarding status fields safe for settings UI (no secrets). */
export const CLIENT_GROW_ONBOARDING_SELECT = [
  'grow_onboarding_status',
  'grow_onboarding_url',
  'grow_onboarding_phone',
  'grow_business_number',
  'grow_onboarding_started_at',
  'grow_onboarding_completed_at',
  'grow_package_name',
  'grow_encrypted_lead',
].join(', ')

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
  CLIENT_GROW_ONBOARDING_SELECT,
].join(', ')

/** Server-only select — used to derive *_set flags, never returned to the client. */
export const CLIENT_SETTINGS_SECRET_PROBE_SELECT = 'whatsapp_access_token'

export const CLIENT_SETTINGS_READ_SELECT = `${CLIENT_SETTINGS_SAFE_SELECT}, ${CLIENT_SETTINGS_SECRET_PROBE_SELECT}`
