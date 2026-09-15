import type { Metadata, Viewport } from "next";
import { Inter, Heebo } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "./components/ToastContainer";
import { RegisterServiceWorker } from "./components/RegisterServiceWorker";
import { ClearAppBadgeOnActivate } from "./components/ClearAppBadgeOnActivate";
import { UpdateNotification } from "./components/UpdateNotification";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { InstallPromptBanner } from "./components/InstallPromptBanner";
import { initializeLogger } from "@/lib/logging";
import { AppProviders } from "./components/AppProviders";
import { WorkTimer } from "./components/WorkTimer";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import {
  BINO_MARKETING_DESCRIPTION,
  BINO_MARKETING_OG_DESCRIPTION,
  BINO_MARKETING_TITLE,
  getMarketingSiteOrigin,
} from "@/lib/marketing-site";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#0066FF",
  colorScheme: "light",
  interactiveWidget: "resizes-content",
};

const siteOrigin = getMarketingSiteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: BINO_MARKETING_TITLE,
    template: "%s | BINO",
  },
  description: BINO_MARKETING_DESCRIPTION,
  applicationName: "BINO",
  keywords: [
    "BINO",
    "Building Intelligence",
    "זיכרון תפעולי",
    "ניהול בניינים",
    "תחזוקה",
    "חברת ניהול",
    "תקלות חוזרות",
    "SLA",
  ],
  authors: [{ name: "Yoni Levy" }],
  creator: "Yoni Levy",
  // Search Console: DNS TXT is not available on *.vercel.app (Vercel owns DNS).
  // Use HTML-tag verification after deploy.
  verification: {
    google: "KWe0L5esKCrG5HbUBOUB-EJlZcIylSsilC8XkNurxjg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BINO",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/apple-icon.png", sizes: "1254x1254", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "1254x1254", type: "image/png" }],
    shortcut: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: siteOrigin,
    siteName: "BINO",
    title: BINO_MARKETING_TITLE,
    description: BINO_MARKETING_OG_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: BINO_MARKETING_TITLE,
    description: BINO_MARKETING_OG_DESCRIPTION,
  },
  category: "productivity",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "BINO",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  initializeLogger({ defaultCategory: 'APP' });

  return (
    <html
      lang="he"
      dir="rtl"
      className={`${inter.variable} ${heebo.variable} font-sans antialiased bg-background`}
    >
      <body className="min-h-screen flex flex-col bg-background text-foreground" dir="rtl">
        <RegisterServiceWorker />
        <ClearAppBadgeOnActivate />
        <OfflineIndicator />
        <InstallPromptBanner />
        <UpdateNotification />
        <AppProviders>
          {children}
        </AppProviders>
        <WorkTimer />
        <ToastContainer />
        {process.env.NODE_ENV === 'production' ? <SpeedInsights /> : null}
        {process.env.NODE_ENV === 'production' ? <Analytics /> : null}
      </body>
    </html>
  );
}
