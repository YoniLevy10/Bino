import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  // Session Replay adds ~100KB+ JS and hurts FCP/LCP; keep errors + traces only.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  enabled: process.env.NODE_ENV === 'production',
})
