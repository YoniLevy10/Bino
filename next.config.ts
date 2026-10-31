import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Keep web-push as a Node require. Bundling it makes Node 24 treat
  // its legacy url.parse() as app code and print DEP0169 on the WhatsApp webhook.
  serverExternalPackages: ['web-push'],
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project (set via env or Sentry wizard)
  silent: true, // suppress build output noise

  // Upload source maps only in CI / production builds
  widenClientFileUpload: true,

  // Tree-shake Sentry logger statements
  disableLogger: true,
});
