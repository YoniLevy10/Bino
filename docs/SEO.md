# SEO & Analytics — BINO

Production origin: **https://bino.casa**

## Analytics status

| Tool | Status |
|------|--------|
| **Vercel Analytics** | Connected (root layout, production only) |
| **Vercel Speed Insights** | Connected (root layout, production only) |
| **Google Analytics 4** | Wired on **marketing pages only** (`/` + `/en`) via `MarketingAnalytics` — needs `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| **Google Search Console** | HTML verification tag already in `app/layout.tsx` |

Google Analytics is **not** collecting until you create a GA4 property and set the env var.

**Scope note:** GA4 is intentionally limited to the public landing (`MarketingAnalytics`). Private app routes and tokenized URLs are not tracked. Vercel Analytics remains sitewide for performance.

### Connect GA4 (required once)

1. [Google Analytics](https://analytics.google.com/) → Admin → Create property (GA4) for `bino.casa`
2. Data stream → Web → URL `https://bino.casa` → copy Measurement ID (`G-XXXXXXXX`)
3. Vercel → Project `bino` → Settings → Environment Variables:
   - `NEXT_PUBLIC_GA_MEASUREMENT_ID` = `G-XXXXXXXX`
   - Environments: Production (+ Preview optional)
4. Redeploy production
5. Search Console → add `https://bino.casa` (DNS TXT now possible on your domain) → submit sitemap `https://bino.casa/sitemap.xml`

## What the codebase ships for SEO

- Canonical URLs + `hreflang` (`/` Hebrew, `/en` English)
- Dynamic Open Graph / Twitter image (`app/opengraph-image.tsx`)
- JSON-LD: Organization, WebSite, WebPage, SoftwareApplication, FAQPage
- FAQ section on the landing (crawlable answers)
- `robots.txt` allows public pages, blocks app/API surfaces
- `sitemap.xml` with locale alternates
- `public/llms.txt` for AI crawlers
- Richer metadata on contact / privacy / terms / vaad-pay

## Manual checklist after deploy

1. https://bino.casa/robots.txt
2. https://bino.casa/sitemap.xml
3. https://bino.casa/opengraph-image
4. [Rich Results Test](https://search.google.com/test/rich-results) on `/` and `/en`
5. [PageSpeed Insights](https://pagespeed.web.dev/) on `/`
6. Search Console → Coverage / Enhancements after sitemap submit
