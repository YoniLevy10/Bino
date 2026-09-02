/**
 * Image generation provider interface — template-first, generative optional.
 */
export type ImageAspectRatio = '1:1' | '4:5' | '9:16'

export type ImageGenerationRequest = {
  prompt: string
  aspectRatio: ImageAspectRatio
  brandId: string
  hypothesisId?: string
  referenceAssetUrls?: string[]
  /** For template provider */
  headline?: string
  subheadline?: string
  cta?: string
  logoUrl?: string
  screenshotUrl?: string
}

export type ImageGenerationResult = {
  provider: string
  /** SVG or HTML markup for template; binary path for generative */
  kind: 'svg' | 'url' | 'storage_path'
  content: string
  prompt: string
  aspectRatio: ImageAspectRatio
  estimatedCostUsd: number
  width: number
  height: number
}

export interface ImageGenerationProvider {
  readonly id: string
  generate(req: ImageGenerationRequest): Promise<ImageGenerationResult>
}

const SIZE: Record<ImageAspectRatio, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
}

/** Near-zero-cost SVG template creatives. */
export class TemplateImageProvider implements ImageGenerationProvider {
  readonly id = 'template'

  async generate(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const { width, height } = SIZE[req.aspectRatio]
    const headline = escapeXml(req.headline ?? 'במקור')
    const sub = escapeXml(req.subheadline ?? req.prompt.slice(0, 120))
    const cta = escapeXml(req.cta ?? 'לתיאום הדגמה')
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1F3A"/>
      <stop offset="100%" stop-color="#123A5C"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="64" y="64" width="${width - 128}" height="${height - 128}" rx="24" fill="none" stroke="#7EB6FF" stroke-opacity="0.35" stroke-width="2"/>
  <text x="96" y="180" fill="#E8F1FF" font-family="Heebo, Arial, sans-serif" font-size="64" font-weight="700">${headline}</text>
  <foreignObject x="96" y="220" width="${width - 192}" height="${Math.floor(height * 0.35)}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#C9D9EF;font-family:Heebo,Arial,sans-serif;font-size:36px;line-height:1.35;direction:rtl;text-align:right">${sub}</div>
  </foreignObject>
  <rect x="96" y="${height - 220}" width="360" height="88" rx="12" fill="#2F80ED"/>
  <text x="276" y="${height - 162}" text-anchor="middle" fill="#FFFFFF" font-family="Heebo, Arial, sans-serif" font-size="32" font-weight="600">${cta}</text>
</svg>`

    return {
      provider: this.id,
      kind: 'svg',
      content: svg,
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
      estimatedCostUsd: 0,
      width,
      height,
    }
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function getImageGenerationProvider(): ImageGenerationProvider {
  const provider = (process.env.IMAGE_PROVIDER ?? 'template').toLowerCase()
  if (provider === 'template') return new TemplateImageProvider()
  // local / openai implementations land in later phases behind same interface
  if (provider === 'local' || provider === 'openai') {
    // Fail soft to template until those providers are wired with credentials.
    return new TemplateImageProvider()
  }
  return new TemplateImageProvider()
}
