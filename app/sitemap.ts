import type { MetadataRoute } from 'next'
import { SEO_GUIDES_HE } from '@/lib/seo-guides-he'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getMarketingSiteOrigin()
  const lastModified = new Date()

  const guides: MetadataRoute.Sitemap = [
    {
      url: `${origin}/guides`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    ...SEO_GUIDES_HE.map((guide) => ({
      url: `${origin}/guides/${guide.slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]

  return [
    {
      url: `${origin}/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: {
        languages: {
          he: `${origin}/`,
          en: `${origin}/en`,
        },
      },
    },
    {
      url: `${origin}/en`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.95,
      alternates: {
        languages: {
          he: `${origin}/`,
          en: `${origin}/en`,
        },
      },
    },
    ...guides,
    {
      url: `${origin}/contact`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${origin}/savings-report`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.75,
    },
    {
      url: `${origin}/vaad-pay`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
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
  ]
}
