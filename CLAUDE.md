# CLAUDE.md — bamakor-dashboard

Next.js 16 App Router, React 19, TypeScript, Supabase, Tailwind CSS, RTL Hebrew UI.
Multi-tenant SaaS for building maintenance management; SMS via 019SMS, WhatsApp via Meta API.

---

## Standard API Route Pattern

Every protected API route MUST follow this order — no exceptions:

```
1. requireSessionClientId()              → auth + clientId
2. checkAuthenticatedPostRouteLimit()    → rate limit (return 429 if limited)
3. validate body with zod schema         → lib/api-body-schemas.ts
4. business logic using getSupabaseAdmin()
```

---

## Supabase Client Rules — CRITICAL

| Client | Location | Use for |
|--------|----------|---------|
| `supabase` (browser) | `lib/supabase.ts` | **Reads only** from frontend. RLS blocks writes to `clients`, `organizations`, and admin tables. Writes silently succeed (no error thrown) but the row is never changed. |
| `getSupabaseAdmin()` | `lib/supabase-admin.ts` | All server-side writes. Bypasses RLS. Use in API routes only. |
| route handler client | `lib/supabase-route-handler.ts` | Used inside `requireSessionClientId()` only — do not use elsewhere. |

**Never call `supabase.from('clients').update(...)` from the browser — it will silently no-op.**

---

## SMS Rules (019SMS)

- **No emoji in messages.** 019SMS returns HTTP 200 but a non-zero XML status for emoji — triggers all 3 retries and ultimate failure. Use plain Hebrew + ASCII only.
- **019SMS only accepts phone numbers as sender** (`972xxxxxxxxx`), NOT alphanumeric names like "Bamakor". Alphabetic senders return HTTP 200 but XML status 515 — silent failure, all 3 retries fire, SMS never sent. The hardcoded fallback sender is `'972559899132'` in `lib/sms.ts` and `lib/sms-019-core.ts`. Do NOT change this to any name string. Keep `sms_sender_name = null` in DB unless you have a registered alphanumeric sender ID from 019SMS.
- **Retry config** (`lib/sms.ts`): 3 attempts, 2 s backoff, 10 s timeout each. After all 3 fail, inserts to `failed_notifications`.
- **Phone format**: `972xxxxxxxxx` (9 digits after 972). `normalizePhone019()` in `lib/sms-019-core.ts` converts `05x`, `+972`, etc.

---

## Translation

Use **Google Translate gtx endpoint** — `sl=auto` works for auto-detection:

```
https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=he&dt=t&q=…
```

Do NOT use MyMemory or similar — they reject `auto` as source language.
Reference: `app/api/translate-ticket/route.ts`

---

## Mobile Viewport Detection

Every page that gates UI on `isMobile` MUST wire `setIsMobile` in a `useEffect`:

```typescript
useEffect(() => {
  const check = () => setIsMobile(getIsMobileViewport())
  check()
  window.addEventListener('resize', check)
  return () => window.removeEventListener('resize', check)
}, [])
```

Forgetting the `useEffect` means `isMobile` stays `false` → desktop sidebar always renders on mobile.

---

## tenant-resolution.ts — SELECT Must Be Complete

`resolveClientIdByWhatsAppPhoneNumberId()` in `lib/tenant-resolution.ts` returns the `row` used as `waClient` in the webhook. **Any field accessed in `app/api/webhook/whatsapp/route.ts` must be in the SELECT.** Missing fields are `undefined` at runtime — no TS error, silent bug.

Current required fields:
```
id, name, sms_sender_name, whatsapp_phone_number_id, whatsapp_access_token,
manager_phone, default_worker_phone, sms_on_ticket_open, sms_on_ticket_close
```

---

## Settings Save

Settings writes (phones, SMS toggles, WhatsApp credentials) go through `/api/settings/update` which uses `getSupabaseAdmin()`. Never write from the browser client — RLS blocks it silently.

---

## WhatsApp Location Messages

**Archived.** Do not implement location parsing. On `messageType === 'location'`, send the `redirect_to_text` template and return immediately. Dead GPS attach/stash handlers were removed; keep it that way.
Reference: `app/api/webhook/whatsapp/route.ts` / `lib/whatsapp-webhook/dispatch-inbound.ts`

---

## Fetch Helpers

| Helper | Import path | Behavior on timeout |
|--------|-------------|---------------------|
| Client-side | `lib/fetch-with-timeout.ts` | **Throws** Hebrew error message |
| Server-side (external APIs) | `lib/fetch-timeout.ts` | **Returns `null`** |

Do NOT use raw `fetch()` directly anywhere in the codebase.

---

## Vercel Environment Variables

All vars are set in Vercel Dashboard → Settings → Environment Variables.
Auth token is at `%APPDATA%\com.vercel.cli\Data\auth.json` — use with REST API if needed.

### Currently configured (production)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (server only) |
| `NEXT_PUBLIC_APP_URL` | `https://bamakor.vercel.app` |
| `SMS_019_USERNAME` | 019SMS API username |
| `SMS_019_PASSWORD` | 019SMS API password |
| `SMS_019_SENDER` | SMS sender phone (`972xxxxxxxxx`) |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook verification token |
| `WHATSAPP_ACCESS_TOKEN` | Meta API access token (also stored in DB) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number ID (also stored in DB) |
| `VAPID_PUBLIC_KEY` | Web push server public key |
| `VAPID_PRIVATE_KEY` | Web push server private key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push browser key (same as public) |
| `VAPID_SUBJECT` | `mailto:levyyoni5@gmail.com` |
| `CRON_SECRET` | Cron job auth secret |
| `ADMIN_SETUP_SECRET` | Superadmin routes secret |
| `BAMAKOR_CLIENT_ID` | Dev fallback client ID |

### Still missing

| Variable | How to get |
|----------|-----------|
| `GOOGLE_CLIENT_ID` | Same Google OAuth client ID as Supabase Auth → Providers → Google (needed to refresh Calendar tokens) |
| `GOOGLE_CLIENT_SECRET` | Matching Google OAuth client secret (server only) |
| `WHATSAPP_APP_SECRET` | Meta Developer Console → App → Settings → Basic → App Secret |
| `PLATFORM_OPS_EMAIL` | Inbox for SMS/WhatsApp failure alerts (fallback: `VAPID_SUBJECT` mailto) |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key — sends ops alert emails |
| `RESEND_FROM_EMAIL` | Verified Resend sender (optional) |
| `GREENINVOICE_WEBHOOK_SECRET` | Legacy Morning webhook token (old charges only) |
| `GROW_API_KEY` | Grow platform apiKey from Lial — **required for collections** |
| `GROW_PAGE_CODE` | Grow platform pageCode — **required for collections** |
| `GROW_WEBHOOK_SECRET` | Random secret; Grow notify URL uses `?token=` — **required for collections** |
| `GROW_ENV` | `sandbox` for test keys, omit or `production` for live |
| `LEGAL_BUSINESS_NAME` | Platform-only display name on `/vaad-pay` + `/contact` (not used for a tenant's Grow page) |
| `LEGAL_PHONE` | Platform-only contact phone on public legal pages |
| `LEGAL_ADDRESS` | Platform-only address on public legal pages |
| `LEGAL_EMAIL` | Optional; falls back to `RESEND_FROM_EMAIL` / `VAPID_SUBJECT` |

Grow for a paying tenant: Settings → Grow (`userId` after they open a Grow account) and the public page `/vaad-pay/{clientId}`. Platform keys stay in Vercel. See `docs/PAYMENTS.md`.
