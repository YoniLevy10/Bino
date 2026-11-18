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
}

/** Read pilot credentials from Vercel/env — never expose secrets to the browser. */
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
  }
}

export function loadPalGatePilotCredentials(): PalGatePilotCredentials {
  const status = readPalGateCredentialsStatus()
  if (!status.configured) {
    throw new Error(
      `חסרים משתני סביבה ל־PalGate: ${status.missing.join(', ')}. הגדירו ב־Vercel (Production) לפיילוט סביון בלבד.`
    )
  }

  const deviceRaw = (process.env.PALGATE_DEVICE_ID || '').trim()
  let deviceId = deviceRaw
  let outputNum = 1
  if (deviceRaw.includes(':')) {
    const [base, out] = deviceRaw.split(':')
    if (base && /^\d+$/.test(out || '')) {
      deviceId = base
      outputNum = parseInt(out, 10)
    }
  }

  const phoneDigits = (process.env.PALGATE_PHONE_NUMBER || '').trim().replace(/\D/g, '')
  const phoneNumber = Number(phoneDigits)
  if (!Number.isSafeInteger(phoneNumber) || phoneDigits.length < 10) {
    throw new Error('PALGATE_PHONE_NUMBER לא תקין (ספרות בינלאומיות בלי +)')
  }

  return {
    sessionToken: sessionTokenFromHex(process.env.PALGATE_SESSION_TOKEN_HEX || ''),
    phoneNumber,
    tokenType: parsePalGateTokenType(process.env.PALGATE_TOKEN_TYPE),
    deviceId,
    outputNum,
    baseUrl: (process.env.PALGATE_BASE_URL || 'https://api1.pal-es.com').replace(/\/$/, ''),
  }
}
