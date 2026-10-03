# Superadmin MFA (2026-10-03)

## What changed

Platform superadmin (`/superadmin`, `/admin/setup`, `/api/superadmin/*`, `/api/admin/*`) no longer accepts the shared `ADMIN_SETUP_SECRET` via `x-admin-secret` or browser `localStorage` / `sessionStorage`.

Authorization is now:

1. **Supabase Auth session** (Google or email/password)
2. **Allowlisted identity** — one of:
   - `SUPERADMIN_EMAILS` (comma-separated, Vercel env)
   - `SUPERADMIN_USER_IDS` (comma-separated Auth UUIDs)
   - `app_metadata.superadmin === true` (or `app_metadata.role === 'superadmin'`) on the Auth user
3. **MFA AAL2** — verified TOTP factor via Supabase Auth MFA

Legacy keys `bamakor_admin_secret` / `bamakor_admin_secret_persist` are **purged on entry** and never accepted. If an old secret was stored, the UI shows a migration notice and forces sign-in + MFA.

## How to enroll (owner)

1. In Vercel → Environment Variables, set e.g.  
   `SUPERADMIN_EMAILS=you@example.com`  
   (Production + Preview as needed). Redeploy.
2. Optional: in Supabase Dashboard → Authentication → Users → your user → App Metadata, set `{ "superadmin": true }`.
3. Open `https://bino.casa/superadmin` (or staging).
4. Sign in with the allowlisted account.
5. Scan the TOTP QR with an authenticator app and confirm the 6-digit code (first-time enroll).
6. On later visits, enter the TOTP code when challenged (AAL2).
7. After success, remove `ADMIN_SETUP_SECRET` from Vercel when ready (unused by app auth).

## Manual checks

- [ ] Old localStorage secret does **not** unlock the panel
- [ ] Non-allowlisted signed-in user gets forbidden
- [ ] Allowlisted user without MFA cannot call `/api/superadmin/stats` (401 `SUPERADMIN_MFA_REQUIRED`)
- [ ] After MFA, stats / setup / sales-leads APIs work with cookies only (no `x-admin-secret`)

## Notes

- No paid Supabase preview branches; no customer-table writes for this change.
- MFA factors live in Supabase Auth (not app DB).
- Enable MFA in Supabase Auth settings if not already enabled (Dashboard → Authentication → MFA).
