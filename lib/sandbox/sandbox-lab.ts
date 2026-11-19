/** Dedicated hands-on sandbox tenant for soft-launch practice. */

export const SANDBOX_CLIENT_NAME = 'BINO Sandbox'

/** Separate Auth user so Bamakor login is not multi-tenant conflicted. */
export const SANDBOX_ADMIN_EMAIL = 'levyyoni5+sandbox@gmail.com'

export const SANDBOX_PROJECT_CODE = 'SANDBOX01'
export const SANDBOX_PROJECT_NAME = 'בניין Sandbox'
export const SANDBOX_WORKER_NAME = 'עובד Sandbox'
export const SANDBOX_RESIDENT_NAME = 'דייר Sandbox'

export type SandboxAction =
  | 'ensure'
  | 'save_channels'
  | 'copy_grow_from_bamakor'
  | 'magic_link'
  | 'create_ticket'
  | 'send_sms'
  | 'send_whatsapp'
  | 'create_pay_link'
  | 'set_test_phone'

export type SandboxStatus = {
  client_id: string | null
  client_name: string
  admin_email: string
  exists: boolean
  project_id: string | null
  project_code: string | null
  worker_id: string | null
  worker_portal_url: string | null
  resident_id: string | null
  manager_phone: string | null
  sms_sender_name: string | null
  whatsapp_phone_number_id: string | null
  whatsapp_access_token_set: boolean
  grow_enabled: boolean
  grow_user_id: string | null
  collections_enabled: boolean
  email_slug: string | null
  report_url: string | null
  vaad_pay_url: string | null
  dashboard_hint: string
  grow_env: string
}

export type SandboxActionResult = {
  ok: boolean
  error?: string
  message?: string
  url?: string
  ticket_id?: string
  ticket_number?: number | null
  charge_id?: string
  status?: SandboxStatus
}
