# SEO & Analytics — BINO

Production origin: **https://bino.casa**  
Google property name: **bino** (GA4 + Search Console for this domain)  
Primary market: **Israel** · Primary language: **Hebrew**

## Organic growth (no ad spend)

Ranking #1 is not a toggle — Google rewards useful Hebrew pages that match search intent for חברות ניהול, then earn links and engagement over time.

### What ships in the product

| Asset | Role |
|-------|------|
| `/` + `/en` | Brand + differentiation (זיכרון תפעולי) |
| `/guides` + 5 Hebrew guides | Long-tail Israel keywords → demos |
| `/savings-report` | Lead magnet (sample savings) |
| Sitemap + JSON-LD Article/FAQ/Breadcrumb | Crawl + rich results |
| GA4 `generate_lead` | Measure which pages convert |

### Target keywords (Israel / HE)

1. מערכת ניהול בניינים
2. זיכרון תפעולי
3. תקלות חוזרות בבניין
4. דיווח תקלות וואטסאפ דיירים
5. SLA תחזוקת בניינים
6. תוכנה לחברת ניהול

### Your free weekly loop (outside the repo)

1. Search Console → submit / re-submit `https://bino.casa/sitemap.xml`
2. Request indexing for `/guides` and each new guide URL
3. Publish **one** new Hebrew guide/month (same folder pattern in `lib/seo-guides-he.ts`)
4. Share each guide once in relevant Facebook/LinkedIn groups for חברות ניהול (manual — not spam)
5. Ask happy customers for a short Hebrew case blurb + link to bino.casa (best free backlink)
6. In GA4: mark `generate_lead` as a key event; watch which guide converts

### What will **not** get you to #1 overnight

- Buying links / PBNs
- Keyword stuffing
- Thin AI pages with no Israel/ops substance
- Expecting English-only content to rank in Israel HE SERPs

## Analytics status

| Tool | Status |
|------|--------|
| **Vercel Analytics** | Connected (root layout, production only) |
| **Vercel Speed Insights** | Connected (root layout, production only) |
| **Google Analytics 4** | Connected — property **bino**, Measurement ID in Vercel `NEXT_PUBLIC_GA_MEASUREMENT_ID` (`G-ZDW0GCWR7N`) |
| **Google Search Console** | HTML verification in `app/layout.tsx` (override with `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`) |

**Scope:** GA4 is limited to public marketing paths (`/`, `/en`, `/contact`, `/savings-report`, `/guides/*`). Private app routes and tokenized URLs are not tracked.

### Lead / conversion events (GA4)

| Event | When |
|-------|------|
| `generate_lead` | WhatsApp demo CTA, savings-report WA, contact phone/email/nav, guide CTAs |
| `login_click` | Secondary “כניסה למערכת” on landing |
| `page_view` | Marketing page views (manual, path-scoped) |

### Connect Search Console property **bino**

1. [Search Console](https://search.google.com/search-console) → add **URL-prefix** `https://bino.casa` (or Domain `bino.casa` with DNS TXT)
2. Submit sitemap: `https://bino.casa/sitemap.xml`
3. Request indexing for `/`, `/guides`, and each `/guides/...` URL

## What the codebase ships for SEO

- Canonical URLs + `hreflang` (`/` Hebrew, `/en` English)
- Dynamic Open Graph / Twitter image
- JSON-LD: Organization (Israel), WebSite, WebPage, SoftwareApplication, FAQPage, Article + Breadcrumb on guides
- Hebrew SEO guides under `/guides`
- `robots.txt` allows public marketing + guides; blocks app/API
- `sitemap.xml` with locale alternates + guides + contact + savings-report
- `public/llms.txt` for AI crawlers

## Manual checklist after deploy

1. https://bino.casa/robots.txt
2. https://bino.casa/sitemap.xml
3. https://bino.casa/guides
4. [Rich Results Test](https://search.google.com/test/rich-results) on a guide URL
5. Search Console → Coverage after sitemap submit
6. GA4 Realtime + `generate_lead` from a guide CTA
