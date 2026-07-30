import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Conservative security headers only.
 * Full CSP is intentionally omitted for now — it can break Analytics/Sentry/fonts/OAuth
 * for live tenants; enable in a follow-up after Preview verification.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
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
