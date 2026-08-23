import { formatLegalPhoneDisplay, type LegalSiteConfig } from '@/lib/legal-site-config'
import { getPublicAppUrl } from '@/lib/public-app-url'

export const CLIENT_GROW_LEGAL_SELECT =
  'id, name, is_active, grow_legal_business_name, grow_legal_phone, grow_legal_address, grow_legal_email'

export const CLIENT_GROW_LEGAL_SETTINGS_SELECT =
  'grow_legal_business_name, grow_legal_phone, grow_legal_address, grow_legal_email'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isClientGrowPageId(raw: string): boolean {
  return UUID_RE.test(raw.trim())
}

export type ClientGrowLegalRow = {
  id: string
  name?: string | null
  is_active?: boolean | null
  grow_legal_business_name?: string | null
  grow_legal_phone?: string | null
  grow_legal_address?: string | null
  grow_legal_email?: string | null
}

export type ClientGrowLegal = {
  clientId: string
  businessName: string
  phone: string
  address: string
  email: string
  ready: boolean
}

function trimOrEmpty(v: string | null | undefined): string {
  return (v || '').trim()
}

/** Legal name Grow sees — explicit field, else the Bamakor client name. */
export function resolveGrowBusinessName(row: ClientGrowLegalRow): string {
  return trimOrEmpty(row.grow_legal_business_name) || trimOrEmpty(row.name)
}

export function growLegalFromClientRow(row: ClientGrowLegalRow): ClientGrowLegal {
  const businessName = resolveGrowBusinessName(row)
  const phone = trimOrEmpty(row.grow_legal_phone)
  const address = trimOrEmpty(row.grow_legal_address)
  const email = trimOrEmpty(row.grow_legal_email)
  return {
    clientId: row.id,
    businessName,
    phone,
    address,
    email,
    ready: Boolean(businessName && phone && address),
  }
}

export function isGrowLegalReady(legal: Pick<ClientGrowLegal, 'businessName' | 'phone' | 'address'>): boolean {
  return Boolean(legal.businessName.trim() && legal.phone.trim() && legal.address.trim())
}

export function getClientGrowPagePath(clientId: string): string {
  return `/vaad-pay/${encodeURIComponent(clientId.trim())}`
}

export function getClientGrowContactPath(clientId: string): string {
  return `${getClientGrowPagePath(clientId)}/contact`
}

export function getClientGrowPageUrl(clientId: string): string {
  const base = getPublicAppUrl() || 'https://bamakor.vercel.app'
  return `${base}${getClientGrowPagePath(clientId)}`
}

/** Map tenant legal fields onto the public Grow page shape. */
export function growLegalToSiteConfig(legal: ClientGrowLegal): LegalSiteConfig {
  const phone = legal.phone
  return {
    businessName: legal.businessName || 'שם העסק יושלם בהגדרות',
    phone: phone || 'טלפון יושלם בהגדרות הלקוח',
    phoneDisplay: phone ? formatLegalPhoneDisplay(phone) : 'טלפון יושלם בהגדרות הלקוח',
    address: legal.address || 'כתובת יושלם בהגדרות הלקוח',
    email: legal.email || '',
    publicBaseUrl: getPublicAppUrl() || 'https://bamakor.vercel.app',
    readyForGrowAudit: legal.ready,
  }
}
