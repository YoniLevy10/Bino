import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MarketingAnalytics } from '@/app/components/marketing/MarketingAnalytics'
import { SeoGuideArticle } from '@/app/components/marketing/SeoGuideArticle'
import { buildSeoGuideJsonLd } from '@/lib/seo-guide-jsonld'
import { getAllSeoGuideSlugs, getSeoGuide } from '@/lib/seo-guides-he'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return getAllSeoGuideSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const guide = getSeoGuide(slug)
  if (!guide) return {}

  const origin = getMarketingSiteOrigin()
  const url = `${origin}/guides/${guide.slug}`

  return {
    title: guide.title,
    description: guide.description,
    keywords: [guide.primaryKeyword, ...guide.secondaryKeywords],
    alternates: { canonical: url },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url,
      locale: 'he_IL',
      type: 'article',
      siteName: 'BINO',
    },
    twitter: {
      card: 'summary_large_image',
      title: guide.title,
      description: guide.description,
    },
    robots: { index: true, follow: true },
  }
}

export default async function SeoGuidePage({ params }: Props) {
  const { slug } = await params
  const guide = getSeoGuide(slug)
  if (!guide) notFound()

  const jsonLd = buildSeoGuideJsonLd(guide)

  return (
    <>
      <MarketingAnalytics pagePath={`/guides/${guide.slug}`} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SeoGuideArticle guide={guide} />
    </>
  )
}
