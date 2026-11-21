/**
 * Regenerates app/opengraph-image.png + app/twitter-image.png from lib/marketing/og-card.tsx.
 * Run: npx tsx scripts/generate-og-image.mts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderBinoOgPng } from '../lib/marketing/og-card'

const png = await renderBinoOgPng()
const root = process.cwd()
writeFileSync(join(root, 'app/opengraph-image.png'), png)
writeFileSync(join(root, 'app/twitter-image.png'), png)
console.log(`wrote opengraph-image.png + twitter-image.png (${png.byteLength} bytes)`)
