import { describe, expect, it } from 'vitest'
import {
  buildingAssetPublicPath,
  buildingAssetPublicUrl,
  generateBuildingAssetPublicSlug,
  isValidBuildingAssetSlug,
} from './building-asset-public'

describe('building-asset-public', () => {
  it('generates slug of length 12 from alphabet', () => {
    const slug = generateBuildingAssetPublicSlug(new Uint8Array(12).fill(3))
    expect(slug).toHaveLength(12)
    expect(isValidBuildingAssetSlug(slug)).toBe(true)
  })

  it('builds public path and url', () => {
    expect(buildingAssetPublicPath('abc12345')).toBe('/asset/abc12345')
    expect(buildingAssetPublicUrl('abc12345', 'https://bino.casa')).toBe(
      'https://bino.casa/asset/abc12345'
    )
  })

  it('rejects short/invalid slugs', () => {
    expect(isValidBuildingAssetSlug('short')).toBe(false)
    expect(isValidBuildingAssetSlug('HASCAPS12')).toBe(false)
  })
})
