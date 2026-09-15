import type { MetadataRoute } from 'next'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

export default function robots(): MetadataRoute.Robots {
  const origin = getMarketingSiteOrigin()

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
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
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
