import { describe, expect, it } from 'vitest'
import {
  clampFabPosition,
  defaultFabPosition,
  parseFabPosition,
} from './draggable-fab-position'

describe('defaultFabPosition', () => {
  it('places FAB at bottom-start with nav reserve', () => {
    expect(defaultFabPosition(390, 844, { size: 56, margin: 20, bottomReserve: 72 })).toEqual({
      left: 20,
      top: 844 - 56 - 20 - 72,
    })
  })
})

describe('clampFabPosition', () => {
  it('keeps position inside the safe viewport', () => {
    expect(
      clampFabPosition(
        { left: -40, top: 9999 },
        390,
        844,
        { size: 56, margin: 20, bottomReserve: 72 }
      )
    ).toEqual({
      left: 20,
      top: 844 - 56 - 20 - 72,
    })
  })

  it('allows dragging into the upper area', () => {
    expect(
      clampFabPosition(
        { left: 100, top: 40 },
        390,
        844,
        { size: 56, margin: 20, bottomReserve: 72 }
      )
    ).toEqual({ left: 100, top: 40 })
  })
})

describe('parseFabPosition', () => {
  it('accepts valid objects only', () => {
    expect(parseFabPosition({ left: 12, top: 34 })).toEqual({ left: 12, top: 34 })
    expect(parseFabPosition({ left: '12', top: 34 })).toBeNull()
    expect(parseFabPosition(null)).toBeNull()
  })
})
