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
- **Sender name must be Latin alphanumeric**, max 11 chars. Hebrew chars are silently stripped → fallback to "Bamakor". Show a UI warning if user enters a Hebrew sender name.
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

**Archived.** Do not implement location parsing. On `messageType === 'location'`, send the `redirect_to_text` template and return immediately.
Reference: `app/api/webhook/whatsapp/route.ts`

---

## Fetch Helpers

| Helper | Import path | Behavior on timeout |
|--------|-------------|---------------------|
| Client-side | `lib/fetch-with-timeout.ts` | **Throws** Hebrew error message |
| Server-side (external APIs) | `lib/fetch-timeout.ts` | **Returns `null`** |

Do NOT use raw `fetch()` directly anywhere in the codebase.
