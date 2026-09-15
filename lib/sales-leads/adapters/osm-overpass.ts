import type { SalesLeadSourceAdapter } from '@/lib/sales-leads/adapters/types'
import type { SalesLeadSourceRecord } from '@/lib/sales-leads/types'
import {
  getCityGeoProfile,
  getDiscoveryCity,
  getDiscoveryMappingsForSlugs,
  type DiscoverySegmentMapping,
} from '@/lib/sales-leads/discovery-mapping'
import { getSalesSegmentSlugs } from '@/lib/sales-leads/config'
import { assessBuyerFit, shouldKeepDiscoveredLead } from '@/lib/sales-leads/fit-score'
import { fetchWithTimeout } from '@/lib/fetch-timeout'

type OsmElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: Record<string, string>
}

type OverpassResponse = { elements?: OsmElement[] }

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const

export type OsmAdapterOptions = {
  segmentSlugs?: string[]
  city?: string
  perSegmentLimit?: number
}

export class OsmOverpassSalesLeadAdapter implements SalesLeadSourceAdapter {
  readonly name = 'osm'
  private readonly mappings: DiscoverySegmentMapping[]
  private readonly city: string
  private readonly perSegmentLimit: number
  lastCategoryErrors: string[] = []

  constructor(options: OsmAdapterOptions = {}) {
    this.city = options.city ?? getDiscoveryCity()
    this.perSegmentLimit = Math.min(options.perSegmentLimit ?? 40, 80)
    this.mappings = getDiscoveryMappingsForSlugs(
      options.segmentSlugs ?? getSalesSegmentSlugs(),
    )
  }

  async fetchRecords(): Promise<SalesLeadSourceRecord[]> {
    const out: SalesLeadSourceRecord[] = []
    const seen = new Set<string>()
    const categoryErrors: string[] = []

    for (const mapping of this.mappings) {
      if (mapping.osmFilters.length === 0) continue
      let elements: OsmElement[] = []
      try {
        elements = await this.queryCategory(mapping)
      } catch (e) {
        categoryErrors.push(
          `${mapping.slug}: ${e instanceof Error ? e.message : 'Overpass failed'}`,
        )
        continue
      }

      for (const el of elements.slice(0, this.perSegmentLimit)) {
        const externalId = `${el.type}/${el.id}`
        if (seen.has(externalId)) continue
        seen.add(externalId)

        const tags = el.tags ?? {}
        const phone = (tags.phone || tags['contact:phone'] || tags.mobile || '').trim()
        const name =
          tags.name?.trim() ||
          tags['name:he']?.trim() ||
          tags['name:en']?.trim() ||
          tags.operator?.trim() ||
          mapping.placesQueryHe
        const website = tags.website || tags['contact:website'] || null
        const address = tags['addr:street']
          ? `${tags['addr:street']}${tags['addr:housenumber'] ? ' ' + tags['addr:housenumber'] : ''}`
          : null

        const assessment = assessBuyerFit({
          name,
          businessName: name,
          phone: phone || null,
          websiteUrl: website,
          address,
          segmentSlug: mapping.slug,
        })

        if (
          !shouldKeepDiscoveredLead({
            name,
            businessName: name,
            phone: phone || null,
            websiteUrl: website,
            address,
            segmentSlug: mapping.slug,
          })
        ) {
          continue
        }

        out.push({
          name,
          businessName: name,
          phone: phone || null,
          whatsappPhone: assessment.contactability === 'mobile' ? phone || null : null,
          city: this.city,
          searchCity: this.city,
          businessAddress: address,
          segmentSlug: mapping.slug,
          sourceName: 'osm',
          sourceUrl: website,
          websiteUrl: website,
          externalId,
          notes: 'מקור: OpenStreetMap (ODbL)',
          outreachAngle: mapping.outreachAngleHe,
          fitScore: assessment.score,
          fitClass: assessment.fitClass,
          fitConfidence: assessment.confidence,
          fitReasons: assessment.reasons,
          contactability: assessment.contactability,
          estimatedMrrIls: assessment.estimatedMrrIls,
        })
      }
    }

    this.lastCategoryErrors = categoryErrors
    out.sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0))
    return out
  }

  private buildOverpassQuery(mapping: DiscoverySegmentMapping): string {
    const { south, west, north, east } = getCityGeoProfile(this.city).bbox
    const bbox = `${south},${west},${north},${east}`
    const parts = mapping.osmFilters.flatMap((filter) => {
      const [k, v] = filter.split('=')
      if (!k || !v) return []
      return [`node["${k}"="${v}"](${bbox});`, `way["${k}"="${v}"](${bbox});`]
    })
    return `
[out:json][timeout:25];
(
  ${parts.join('\n  ')}
);
out center tags;
`.trim()
  }

  private async queryCategory(mapping: DiscoverySegmentMapping): Promise<OsmElement[]> {
    const query = this.buildOverpassQuery(mapping)
    const body = `data=${encodeURIComponent(query)}`
    const errors: string[] = []

    for (const endpoint of OVERPASS_ENDPOINTS) {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        },
        35_000,
      )
      if (!res) {
        errors.push(`${endpoint}: timeout`)
        continue
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = `Overpass (${res.status}): ${text.slice(0, 200)}`
        if ([429, 502, 503, 504, 509].includes(res.status)) {
          errors.push(`${endpoint}: ${err}`)
          continue
        }
        throw new Error(err)
      }
      const json = (await res.json()) as OverpassResponse
      return json.elements ?? []
    }

    throw new Error(`Overpass failed for all mirrors: ${errors[0] ?? 'unknown'}`)
  }
}
