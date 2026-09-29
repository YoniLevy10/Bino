import type { SeoGuide } from '@/lib/seo-guides-he'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

export function buildSeoGuideJsonLd(guide: SeoGuide) {
  const origin = getMarketingSiteOrigin()
  const url = `${origin}/guides/${guide.slug}`

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'BINO',
            item: `${origin}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'מדריכים',
            item: `${origin}/guides`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: guide.title,
            item: url,
          },
        ],
      },
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: guide.title,
        description: guide.description,
        inLanguage: 'he-IL',
        mainEntityOfPage: url,
        author: {
          '@type': 'Organization',
          name: 'BINO',
          url: `${origin}/`,
        },
        publisher: {
          '@type': 'Organization',
          name: 'BINO',
          logo: {
            '@type': 'ImageObject',
            url: `${origin}/apple-icon.png`,
          },
        },
        about: {
          '@type': 'Thing',
          name: guide.primaryKeyword,
        },
        keywords: [guide.primaryKeyword, ...guide.secondaryKeywords].join(', '),
        areaServed: {
          '@type': 'Country',
          name: 'Israel',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: guide.faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      },
    ],
  }
}
