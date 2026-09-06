import { getPublicAppUrl } from '@/lib/public-app-url'

export type LegalSiteConfig = {
  businessName: string
  phone: string
  phoneDisplay: string
  address: string
  email: string
  publicBaseUrl: string
  /** True when phone + address look configured (not empty placeholders). */
  readyForGrowAudit: boolean
}

function trimEnv(name: string): string {
  return (process.env[name] || '').trim()
}

function emailFromMailto(raw: string): string {
  const v = raw.trim()
  if (v.toLowerCase().startsWith('mailto:')) return v.slice(7).trim()
  return v
}

/** Format 972… / 05… for display on public pages. */
export function formatLegalPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (/^972\d{8,9}$/.test(digits)) {
    return `0${digits.slice(3)}`
  }
  return phone.trim()
}

/**
 * Public legal / Grow-compliance contact details.
 * Set LEGAL_PHONE + LEGAL_ADDRESS in Vercel before submitting the site to Grow.
 */
export function getLegalSiteConfig(): LegalSiteConfig {
  const businessName = trimEnv('LEGAL_BUSINESS_NAME') || 'Bino'
  const phone = trimEnv('LEGAL_PHONE')
  const address = trimEnv('LEGAL_ADDRESS')
  const email =
    trimEnv('LEGAL_EMAIL') ||
    emailFromMailto(trimEnv('RESEND_FROM_EMAIL')) ||
    emailFromMailto(trimEnv('VAPID_SUBJECT')) ||
    'office@bamakor.com'
  const publicBaseUrl = getPublicAppUrl() || 'https://bamakor.vercel.app'

  const readyForGrowAudit = Boolean(phone && address)

  return {
    businessName,
    phone: phone || 'טלפון יושלם בהגדרות LEGAL_PHONE',
    phoneDisplay: phone ? formatLegalPhoneDisplay(phone) : 'טלפון יושלם בהגדרות LEGAL_PHONE',
    address: address || 'כתובת יושלם בהגדרות LEGAL_ADDRESS',
    email,
    publicBaseUrl,
    readyForGrowAudit,
  }
}

export function legalTelHref(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return '#'
  if (digits.startsWith('972')) return `tel:+${digits}`
  if (digits.startsWith('0')) return `tel:+972${digits.slice(1)}`
  return `tel:${digits}`
}
