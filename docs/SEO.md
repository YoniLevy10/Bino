# SEO & Analytics — BINO

Production origin: **https://bino.casa**  
Google property name: **bino** (GA4 + Search Console for this domain)

## Analytics status

| Tool | Status |
|------|--------|
| **Vercel Analytics** | Connected (root layout, production only) |
| **Vercel Speed Insights** | Connected (root layout, production only) |
| **Google Analytics 4** | Connected — property **bino**, Measurement ID in Vercel `NEXT_PUBLIC_GA_MEASUREMENT_ID` (`G-ZDW0GCWR7N`) |
| **Google Search Console** | HTML verification in `app/layout.tsx` (override with `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`) |

**Scope:** GA4 is limited to public marketing paths (`/`, `/en`, `/contact`, `/savings-report`). Private app routes and tokenized URLs are not tracked. Vercel Analytics remains sitewide for performance.

### Lead / conversion events (GA4)

Mark these as **Conversions** (key events) in GA4 Admin → Events for property **bino**:

| Event | When |
|-------|------|
| `generate_lead` | WhatsApp demo CTA, savings-report WA, contact phone/email/nav |
| `login_click` | Secondary “כניסה למערכת” on landing |
| `page_view` | Marketing page views (manual, path-scoped) |

`generate_lead` params: `method` (`whatsapp_demo` \| `whatsapp_savings` \| `contact_phone` \| `contact_email` \| `contact_nav`), optional `locale` / `placement`.

### Connect GA4 property **bino** (required once)

1. [Google Analytics](https://analytics.google.com/) → property **bino** → Admin → Data streams → Web → `https://bino.casa`
2. Copy Measurement ID (`G-XXXXXXXX`)
3. Vercel → Project `bino` → Settings → Environment Variables:
   - `NEXT_PUBLIC_GA_MEASUREMENT_ID` = `G-XXXXXXXX` (Production + Preview)
4. Redeploy production
5. GA4 → Admin → Events → mark `generate_lead` as a key event
6. Realtime → open `https://bino.casa` → confirm hits

### Connect Search Console property **bino**

1. [Search Console](https://search.google.com/search-console) → add **URL-prefix** property `https://bino.casa` (or Domain `bino.casa` with DNS TXT)
2. If using HTML tag: paste token into Vercel as `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` and redeploy
3. Submit sitemap: `https://bino.casa/sitemap.xml`
4. Request indexing for `/`, `/en`, `/contact`, `/savings-report`

## What the codebase ships for SEO

- Canonical URLs + `hreflang` (`/` Hebrew, `/en` English)
- Dynamic Open Graph / Twitter image (`app/opengraph-image.tsx`)
- JSON-LD: Organization, WebSite, WebPage, SoftwareApplication, FAQPage
- FAQ section on the landing (crawlable answers)
- `robots.txt` allows public pages (incl. savings-report lead magnet), blocks app/API
- `sitemap.xml` with locale alternates + contact + savings-report
- `public/llms.txt` for AI crawlers
- Richer metadata on contact / privacy / terms / vaad-pay

## Manual checklist after deploy

1. https://bino.casa/robots.txt
2. https://bino.casa/sitemap.xml
3. https://bino.casa/opengraph-image
4. [Rich Results Test](https://search.google.com/test/rich-results) on `/` and `/en`
5. [PageSpeed Insights](https://pagespeed.web.dev/) on `/`
6. Search Console → Coverage / Enhancements after sitemap submit
7. GA4 Realtime + `generate_lead` after clicking WhatsApp CTA
