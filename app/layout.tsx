import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "./components/ToastContainer";
import { RegisterServiceWorker } from "./components/RegisterServiceWorker";
import { initializeLogger, LogLevel } from "@/lib/logging";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#2563eb",
  colorScheme: "light",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "במקור — ניהול תקלות ואחזקה",
  description: "מערכת ניהול נכסים, תקלות בזמן אמת, שיבוץ עובדים ואינטגרציה לוואטסאפ",
  applicationName: "Bamakor",
  keywords: ["property management", "maintenance", "tickets", "project management", "real-time"],
  authors: [{ name: "Yoni Levy" }],
  creator: "Yoni Levy",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "במקור",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
    apple: "/apple-icon.png",
    shortcut: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: "https://bamakor.vercel.app",
    siteName: "Bamakor",
    title: "במקור — ניהול תקלות ואחזקה",
    description: "מערכת ניהול נכסים ותקלות",
    images: [
      {
        url: "/apple-icon.png",
        width: 180,
        height: 180,
        alt: "Bamakor Logo",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "במקור — ניהול תקלות ואחזקה",
    description: "מערכת ניהול נכסים ותקלות",
    images: ["/apple-icon.png"],
  },
  category: "productivity",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "במקור",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize logger on app startup
  initializeLogger({
    minLevel: process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG,
    enableConsole: true,
    enableFile: true,
    enableRemote: process.env.NODE_ENV === 'production',
    defaultCategory: 'APP',
  });

  return (
    <html
      lang="he"
      dir="rtl"
      className={`${inter.variable} font-sans antialiased bg-background`}
    >
      <body className="min-h-screen flex flex-col bg-background text-foreground" dir="rtl">
        <RegisterServiceWorker />
        {children}
        <ToastContainer />
        <SpeedInsights />
      </body>
    </html>
  );
}
