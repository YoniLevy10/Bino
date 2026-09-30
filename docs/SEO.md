# SEO & Analytics — BINO

Production origin: **https://bino.casa**  
Google property name: **bino** (GA4 + Search Console for this domain)  
Primary market: **Israel** · Primary language: **Hebrew**

## Organic growth (no ad spend)

Ranking #1 is not a toggle — Google rewards useful Hebrew pages that match search intent for חברות ניהול, then earn links and engagement over time.

### What ships in the product

| Asset | Role |
|-------|------|
| `/` + `/en` | **Primary** — title/H1/support/audience/FAQ/JSON-LD position BINO as מערכת ניהול פרויקטים / בניינים / שטחים (not ועד-only) |
| `/savings-report` | Lead magnet (sample savings) |
| Sitemap + JSON-LD (Organization, LocalBusiness, FAQ, SoftwareApplication) | Crawl + rich results on the homepage |
| GA4 `generate_lead` | Measure which CTAs convert |
| WebP marketing images | Usability / PageSpeed |

### Target keywords (Israel / HE) — on the live homepage

1. מערכת ניהול פרויקטים
2. מערכת ניהול בניינים
3. ניהול שטחים / ניהול נכסים
4. זיכרון תפעולי
5. תוכנה לחברת ניהול

Positioning: project / building / space ops — **not** “תוכנת ועד בית בלבד” and **not** generic Monday-style PM. Implementation is on `/` metadata + copy + JSON-LD, plus shipped Hebrew guides at `/guides` (`lib/seo-guides-he.ts`).

### What will **not** get you to #1 overnight

- Buying links / PBNs
- Keyword stuffing
- Thin AI pages with no Israel/ops substance
- Expecting English-only content to rank in Israel HE SERPs
- Facebook Pixel (no ad spend)

---

## Wave 2 — owner checklist (Links / overall A+)

Code alone cannot raise **Links F**. Complete these manually:

1. [Search Console](https://search.google.com/search-console) → verify Domain `bino.casa` (DNS TXT already published) or URL-prefix `https://bino.casa`
2. Submit sitemap: `https://bino.casa/sitemap.xml`
3. Request indexing for `https://bino.casa/` and `https://bino.casa/en`
4. Create / verify **Google Business Profile** with website `https://bino.casa`
5. Earn **3–5 real backlinks** (not PBNs):
   - Company LinkedIn post with link
   - Happy customer / partner site link
   - One manual share in a relevant חברות ניהול group (not spam)
6. Keep a live **LinkedIn company page** with link to the site; then set `NEXT_PUBLIC_SOCIAL_LINKEDIN` in Vercel (Wave 3)
7. Re-check SEOptimer Links + Search Console impressions after 1–2 weeks

---

## Wave 3 — DNS + social (low priority)

### SPF + DMARC (Vercel DNS for `bino.casa`)

On [Vercel Domains → bino.casa → DNS](https://vercel.com/yonilevy10s-projects/~/domains/bino.casa), add records required by the outbound mail provider (Resend):

| Type | Name | Value (example — use Resend’s current values) |
|------|------|-----------------------------------------------|
| TXT | `@` or mail subdomain | SPF include from Resend |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:…` |

Verify with `dig TXT bino.casa` / `dig TXT _dmarc.bino.casa`.

### Social `sameAs` (optional env)

Set only **live** profile URLs in Vercel Production:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SOCIAL_LINKEDIN` | LinkedIn company URL → Organization `sameAs` |
| `NEXT_PUBLIC_SOCIAL_FACEBOOK` | Facebook page URL |
| `NEXT_PUBLIC_SOCIAL_INSTAGRAM` | Instagram profile URL |

Empty values are ignored. Do not create dead profiles only for the audit tool.

---

## Analytics status

| Tool | Status |
|------|--------|
| **Vercel Analytics** | Connected (root layout, production only) |
| **Vercel Speed Insights** | Connected (root layout, production only) |
| **Google Analytics 4** | Connected — property **bino**, Measurement ID in Vercel `NEXT_PUBLIC_GA_MEASUREMENT_ID` (`G-ZDW0GCWR7N`) |
| **Google Search Console** | HTML verification in `app/layout.tsx` (override with `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`); prefer DNS TXT on domain |

**Scope:** GA4 is limited to public marketing paths (`/`, `/en`, `/contact`, `/savings-report`, `/guides/*`). Private app routes and tokenized URLs are not tracked.

### Lead / conversion events (GA4)

| Event | When |
|-------|------|
| `generate_lead` | WhatsApp demo CTA, savings-report WA, contact phone/email/nav, guide CTAs |
| `login_click` | Secondary “כניסה למערכת” on landing |
| `page_view` | Marketing page views (manual, path-scoped) |

## What the codebase ships for SEO

- Canonical URLs + `hreflang` (`/` Hebrew, `/en` English)
- Title ~50–60 / meta ~120–160 tuned for SERP tools
- H1 includes brand + keyword headline; keyword-rich H2s + audience section
- Dynamic Open Graph / Twitter image
- JSON-LD: Organization, LocalBusiness (when `LEGAL_*` set), WebSite, WebPage, SoftwareApplication, FAQPage
- NAP in marketing footer when `LEGAL_PHONE` + `LEGAL_ADDRESS` are set
- WebP assets under `/marketing/`
- `robots.txt` / `sitemap.xml` / `public/llms.txt`

## Manual checklist after Wave 1 deploy

1. https://bino.casa — View Source: title, meta length, H1 keywords, WebP, LocalBusiness if LEGAL_* set
2. https://bino.casa/robots.txt + sitemap.xml
3. Re-run SEOptimer On-Page (target A+)
4. Complete Wave 2 owner checklist above
