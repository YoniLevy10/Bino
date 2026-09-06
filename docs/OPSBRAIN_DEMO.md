# OpsBrain sales demo (shared tenant)

OpsBrain is **our** reusable demo account. For every prospect we re-skin this tenant
(name, buildings, tickets, logo) instead of creating a new client.

## Fixed IDs

| | UUID |
|--|--|
| Client | `07773bb3-4969-4bce-8ce2-faab3b26383c` |
| Organization | `a281af3c-99b6-4a4a-a5ba-9498e05e984e` |

## Prospect login (email + password)

Login page supports Google **and** email/password.

Default demo mailbox (override with env):

| | |
|--|--|
| Email | `savion@bamakor.com` |
| Password | `savion2026!` |

Create / refresh the auth user and link it to OpsBrain (pick one):

```bash
# Needs SUPABASE_SERVICE_ROLE_KEY in .env.local
npx tsx scripts/ensure-opsbrain-demo-user.ts
```

```sql
-- Or run in Supabase SQL editor (no service-role key needed):
-- scripts/ensure-opsbrain-demo-user.sql
```

Optional env for the TS script:

```bash
DEMO_LOGIN_EMAIL=savion@bamakor.com
DEMO_LOGIN_PASSWORD='savion2026!'
OPSBRAIN_CLIENT_ID=07773bb3-4969-4bce-8ce2-faab3b26383c
```

**Supabase Dashboard:** Authentication → Providers → Email must be enabled
(password sign-in). The SQL/TS helpers set `email_confirmed_at` so the demo
mailbox can sign in even when “Confirm email” is on.

## Re-skin for a new prospect

1. Edit `scripts/seed-opsbrain-chaim-bajayo-demo.sql` (or copy to a dated file):
   - `UPDATE clients` / `organizations` names
   - building names, tickets, residents as needed
2. Run the SQL in Supabase SQL editor (safe to re-run — deletes this client’s demo rows first).
3. Upload logo in Superadmin.
4. Re-run `ensure-opsbrain-demo-user.ts` if you change the mailbox/password.
5. Give the prospect `/login` + email/password (not Google, unless their Gmail is invited).

The seed also enables paid add-ons and inserts demo rows for:

- **גבייה (collections)** — mixed draft/sent/paid/failed charges
- **החתמת עובדים (worker_stamp)** — office + site NFC tags, closed shift yesterday, open shift today

## Checklist before a demo call

- [ ] Seed SQL applied for this prospect’s branding
- [ ] Logo uploaded
- [ ] `ensure-opsbrain-demo-user.ts` run
- [ ] Email provider enabled in Supabase
- [ ] Smoke-test: `/login` → email/password → dashboard shows OpsBrain data
- [ ] Open גבייה + נוכחות/החתמות tabs briefly
