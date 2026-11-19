import { describe, expect, it, afterEach } from 'vitest'
import {
  BAMAKOR_PALGATE_PILOT_CLIENT_ID,
  SAVION_PALGATE_PILOT_CLIENT_ID,
  isPalGatePilotClient,
  resolvePalGatePilotClientId,
  resolvePalGatePilotClientIds,
} from '@/lib/palgate/pilot'
import { normalizeParkingPlate } from '@/lib/palgate/parking-vehicles'
import {
  PalGateTokenType,
  generatePalGateDerivedToken,
  parsePalGateTokenType,
  sessionTokenFromHex,
} from '@/lib/palgate/token'

describe('PalGate pilot gate', () => {
  const prev = process.env.PALGATE_PILOT_CLIENT_ID

  afterEach(() => {
    if (prev === undefined) delete process.env.PALGATE_PILOT_CLIENT_ID
    else process.env.PALGATE_PILOT_CLIENT_ID = prev
  })

  it('allows Savion + Bamakor by default', () => {
    delete process.env.PALGATE_PILOT_CLIENT_ID
    expect(resolvePalGatePilotClientIds()).toEqual([
      SAVION_PALGATE_PILOT_CLIENT_ID,
      BAMAKOR_PALGATE_PILOT_CLIENT_ID,
    ])
    expect(resolvePalGatePilotClientId()).toBe(SAVION_PALGATE_PILOT_CLIENT_ID)
    expect(isPalGatePilotClient(SAVION_PALGATE_PILOT_CLIENT_ID)).toBe(true)
    expect(isPalGatePilotClient(BAMAKOR_PALGATE_PILOT_CLIENT_ID)).toBe(true)
    expect(isPalGatePilotClient('00000000-0000-0000-0000-000000000000')).toBe(false)
    expect(isPalGatePilotClient(null)).toBe(false)
  })

  it('honors PALGATE_PILOT_CLIENT_ID override (single or comma-separated)', () => {
    process.env.PALGATE_PILOT_CLIENT_ID = '11111111-1111-1111-1111-111111111111'
    expect(isPalGatePilotClient('11111111-1111-1111-1111-111111111111')).toBe(true)
    expect(isPalGatePilotClient(SAVION_PALGATE_PILOT_CLIENT_ID)).toBe(false)

    process.env.PALGATE_PILOT_CLIENT_ID =
      '11111111-1111-1111-1111-111111111111, 22222222-2222-2222-2222-222222222222'
    expect(isPalGatePilotClient('11111111-1111-1111-1111-111111111111')).toBe(true)
    expect(isPalGatePilotClient('22222222-2222-2222-2222-222222222222')).toBe(true)
    expect(isPalGatePilotClient(SAVION_PALGATE_PILOT_CLIENT_ID)).toBe(false)
  })
})

describe('parking plate normalize', () => {
  it('strips spaces and dashes', () => {
    expect(normalizeParkingPlate('12-345-67')).toBe('1234567')
    expect(normalizeParkingPlate(' ab 12 ')).toBe('AB12')
  })
})

describe('PalGate token helpers', () => {
  it('parses token types', () => {
    expect(parsePalGateTokenType('secondary')).toBe(PalGateTokenType.SECONDARY)
    expect(parsePalGateTokenType('1')).toBe(PalGateTokenType.PRIMARY)
    expect(parsePalGateTokenType(2)).toBe(PalGateTokenType.SECONDARY)
  })

  it('generates a stable 46-char hex token for a fixed timestamp', () => {
    const session = sessionTokenFromHex('00112233445566778899aabbccddeeff')
    const a = generatePalGateDerivedToken(session, 972501234567, PalGateTokenType.SECONDARY, 1_700_000_000)
    const b = generatePalGateDerivedToken(session, 972501234567, PalGateTokenType.SECONDARY, 1_700_000_000)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9A-F]{46}$/)
    expect(a.startsWith('21')).toBe(true)
  })
})
