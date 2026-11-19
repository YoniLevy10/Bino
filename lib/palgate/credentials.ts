import type { SupabaseClient } from '@supabase/supabase-js'
import {
  clientRowHasPalGateCredentials,
  type ClientPalGateRow,
} from '@/lib/palgate/access'
import { isPalGatePilotClient } from '@/lib/palgate/pilot'
import {
  parsePalGateTokenType,
  sessionTokenFromHex,
  type PalGateTokenTypeValue,
} from '@/lib/palgate/token'

export type PalGatePilotCredentials = {
  sessionToken: Uint8Array
  phoneNumber: number
  tokenType: PalGateTokenTypeValue
  deviceId: string
  outputNum: number
  baseUrl: string
}

export type PalGateCredentialsStatus = {
  configured: boolean
  deviceIdSet: boolean
  phoneSet: boolean
  tokenSet: boolean
  tokenType: string | null
  missing: string[]
  source: 'env' | 'db' | 'none'
}

function parseDeviceRaw(deviceRaw: string): { deviceId: string; outputNum: number } {
  let deviceId = deviceRaw.trim()
  let outputNum = 1
  if (deviceId.includes(':')) {
    const [base, out] = deviceId.split(':')
    if (base && /^\d+$/.test(out || '')) {
      deviceId = base
      outputNum = parseInt(out!, 10)
    }
  }
  return { deviceId, outputNum }
}

function credentialsFromParts(parts: {
  deviceRaw: string
  phoneRaw: string
  tokenHex: string
  tokenTypeRaw: string
  baseUrlRaw?: string | null
}): PalGatePilotCredentials {
  const { deviceId, outputNum } = parseDeviceRaw(parts.deviceRaw)
  const phoneDigits = parts.phoneRaw.replace(/\D/g, '')
  const phoneNumber = Number(phoneDigits)
  if (!Number.isSafeInteger(phoneNumber) || phoneDigits.length < 10) {
    throw new Error('מספר טלפון PalGate לא תקין (ספרות בינלאומיות בלי +)')
  }
  return {
    sessionToken: sessionTokenFromHex(parts.tokenHex),
    phoneNumber,
    tokenType: parsePalGateTokenType(parts.tokenTypeRaw),
    deviceId,
    outputNum,
    baseUrl: (parts.baseUrlRaw || 'https://api1.pal-es.com').replace(/\/$/, ''),
  }
}

export function readPalGateCredentialsStatus(): PalGateCredentialsStatus {
  const deviceId = (process.env.PALGATE_DEVICE_ID || '').trim()
  const phone = (process.env.PALGATE_PHONE_NUMBER || '').trim()
  const token = (process.env.PALGATE_SESSION_TOKEN_HEX || '').trim()
  const tokenTypeRaw = (process.env.PALGATE_TOKEN_TYPE || '').trim()
  const missing: string[] = []
  if (!deviceId) missing.push('PALGATE_DEVICE_ID')
  if (!phone) missing.push('PALGATE_PHONE_NUMBER')
  if (!token) missing.push('PALGATE_SESSION_TOKEN_HEX')
  if (!tokenTypeRaw) missing.push('PALGATE_TOKEN_TYPE')
  return {
    configured: missing.length === 0,
    deviceIdSet: Boolean(deviceId),
    phoneSet: Boolean(phone),
    tokenSet: Boolean(token),
    tokenType: tokenTypeRaw || null,
    missing,
    source: missing.length === 0 ? 'env' : 'none',
  }
}

export function readPalGateCredentialsStatusFromRow(
  row: ClientPalGateRow | null | undefined
): PalGateCredentialsStatus {
  if (!row || row.palgate_enabled !== true) {
    return {
      configured: false,
      deviceIdSet: false,
      phoneSet: false,
      tokenSet: false,
      tokenType: null,
      missing: ['palgate_enabled'],
      source: 'none',
    }
  }
  const deviceId = (row.palgate_device_id || '').trim()
  const phone = (row.palgate_phone_number || '').trim()
  const token = (row.palgate_session_token_hex || '').trim()
  const tokenTypeRaw = (row.palgate_token_type || '').trim()
  const missing: string[] = []
  if (!deviceId) missing.push('palgate_device_id')
  if (!phone) missing.push('palgate_phone_number')
  if (!token) missing.push('palgate_session_token_hex')
  if (!tokenTypeRaw) missing.push('palgate_token_type')
  return {
    configured: missing.length === 0,
    deviceIdSet: Boolean(deviceId),
    phoneSet: Boolean(phone),
    tokenSet: Boolean(token),
    tokenType: tokenTypeRaw || null,
    missing,
    source: missing.length === 0 ? 'db' : 'none',
  }
}

export function loadPalGatePilotCredentials(): PalGatePilotCredentials {
  const status = readPalGateCredentialsStatus()
  if (!status.configured) {
    throw new Error(
      `חסרים משתני סביבה ל־PalGate: ${status.missing.join(', ')}. הגדירו ב־Vercel או פר־לקוח בסופר־אדמין.`
    )
  }
  return credentialsFromParts({
    deviceRaw: process.env.PALGATE_DEVICE_ID || '',
    phoneRaw: process.env.PALGATE_PHONE_NUMBER || '',
    tokenHex: process.env.PALGATE_SESSION_TOKEN_HEX || '',
    tokenTypeRaw: process.env.PALGATE_TOKEN_TYPE || '',
    baseUrlRaw: process.env.PALGATE_BASE_URL,
  })
}

export function loadPalGateCredentialsFromRow(row: ClientPalGateRow): PalGatePilotCredentials {
  if (!clientRowHasPalGateCredentials(row)) {
    throw new Error('חסרים פרטי PalGate ללקוח')
  }
  return credentialsFromParts({
    deviceRaw: row.palgate_device_id || '',
    phoneRaw: row.palgate_phone_number || '',
    tokenHex: row.palgate_session_token_hex || '',
    tokenTypeRaw: row.palgate_token_type || '',
    baseUrlRaw: row.palgate_base_url,
  })
}

export async function loadPalGateCredentialsForClient(
  admin: SupabaseClient,
  clientId: string
): Promise<PalGatePilotCredentials> {
  const { data, error } = await admin
    .from('clients')
    .select(
      'palgate_enabled, palgate_device_id, palgate_phone_number, palgate_session_token_hex, palgate_token_type, palgate_base_url'
    )
    .eq('id', clientId)
    .maybeSingle()

  if (!error && data && clientRowHasPalGateCredentials(data as ClientPalGateRow)) {
    return loadPalGateCredentialsFromRow(data as ClientPalGateRow)
  }

  if (isPalGatePilotClient(clientId)) {
    return loadPalGatePilotCredentials()
  }

  throw new Error('PalGate לא מוגדר ללקוח זה — הזינו פרטים בסופר־אדמין או הפעילו פיילוט')
}
