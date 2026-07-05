import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', '@supabase/ssr'],
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project (set via env or Sentry wizard)
  silent: true, // suppress build output noise

  // Upload source maps only in CI / production builds
  widenClientFileUpload: true,

  // Tree-shake Sentry logger statements
  disableLogger: true,
});
