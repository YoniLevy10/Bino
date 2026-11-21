import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Keep web-push as a Node require. Bundling it makes Node 24 treat
  // its legacy url.parse() as app code and print DEP0169 on the WhatsApp webhook.
  // @resvg/resvg-js ships native bindings; satori stays external so the OG route
  // does not pull an outdated next/og Satori (no Hebrew bidi) into the bundle.
  serverExternalPackages: ['web-push', '@resvg/resvg-js', 'satori'],
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project (set via env or Sentry wizard)
  silent: true, // suppress build output noise

  // Upload source maps only in CI / production builds
  widenClientFileUpload: true,

  // Tree-shake Sentry logger statements
  disableLogger: true,
});
