import type { MetadataRoute } from 'next'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getMarketingSiteOrigin()
  const lastModified = new Date()

  return [
    {
      url: `${origin}/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${origin}/contact`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${origin}/privacy`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${origin}/terms`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${origin}/vaad-pay`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]
}
