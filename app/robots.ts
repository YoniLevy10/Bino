import type { MetadataRoute } from 'next'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

const DISALLOW = [
  '/api/',
  '/login',
  '/dashboard',
  '/tickets',
  '/settings',
  '/superadmin',
  '/admin/',
  '/worker',
  '/workers',
  '/worker-login',
  '/whatsapp-inbox',
  '/calendar',
  '/campaigns',
  '/billing',
  '/residents',
  '/pending-residents',
  '/attendance',
  '/collections',
  '/professionals',
  '/projects',
  '/project-documents',
  '/addons',
  '/qr',
  '/summary',
  '/intake',
  '/report',
  '/pilot-sms',
  '/savings-report',
  '/tasks',
  '/site-tours',
  '/onboarding',
  '/pay/',
  '/auth/',
] as const

export default function robots(): MetadataRoute.Robots {
  const origin = getMarketingSiteOrigin()

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/en', '/contact', '/privacy', '/terms', '/vaad-pay'],
        disallow: [...DISALLOW],
      },
      {
        userAgent: 'GPTBot',
        allow: ['/', '/en', '/contact', '/privacy', '/terms'],
        disallow: [...DISALLOW],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}
