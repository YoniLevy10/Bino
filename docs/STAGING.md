# Staging / Sandbox — BINO

**עלות:** $0 נוסף. אין Supabase Pro / Branching בתשלום.

## מה חי ומה מבודד

| סביבה | URL | Database | Outbound |
|--------|-----|----------|----------|
| **Production** | `https://bino.casa` (+ alias `bamakor.vercel.app`) | Bamakor cloud `jsliqlmjksintyigkulq` | חי (SMS / WA / Grow) |
| **Staging מקומי (ברירת מחדל $0)** | `http://<LAN-IP>:3000` דרך `npm run dev:lan` | Local Supabase `127.0.0.1:54321` | `BINO_OUTBOUND_MODE=mock` |
| **Staging cloud (מוכן)** | `https://staging.bino.casa` | דורש פרויקט Free פנוי (ראה למטה) | `mock` + סיסמת Preview |

Production **לא** נותק: webhooks, crons, secrets, דומיינים נשארו כמו שהיו.

## משתמש בדיקות (מנהל)

| שדה | ערך |
|-----|-----|
| Email | `staging-admin@bino.casa` |
| Password | `BinoStaging2026!` |
| Client | `[STAGING] חברת ניהול דמו` |

נוצר ע״י: `npm run seed:staging` (אחרי `npx supabase start`).

## איך לבדוק עכשיו (מחשב + אייפון) — $0

1. `npx supabase start` (אם לא רץ)
2. `cp .env.staging.local .env.local` (או השאר כמו שסוכן הגדיר)
3. `npm run seed:staging`
4. `npm run dev:lan`
5. מהאייפון (אותו Wi‑Fi): `http://<IP-של-המק>:3000/login`
6. התחברות עם המשתמש למעלה — באנר **סביבת בדיקות** אמור להופיע
7. אין שליחות SMS/WhatsApp/מייל אמיתיות; Grow כבוי במצב mock

לחזרה ל־Production secrets מקומית (זהירות): `cp .env.production.local .env.local` — רק אם אתה יודע שאתה רוצה שוב DB חי.

## תהליך עבודה: פיתוח → Staging → אישור → Production

```text
feature/*  →  PR → staging  →  בדיקה שלך  →  PR staging→main (רק אחרי אישור מפורש)  →  Production
```

1. עבוד על `feature/…`
2. פתח PR ל־`staging` (לא ישר ל־`main`)
3. בדוק מקומית / ב־`staging.bino.casa` כש־DB cloud מוכן
4. **רק אחרי אישורך** — PR מ־`staging` ל־`main`
5. אחרי merge ל־`main` — Vercel מפרסם ל־`bino.casa`

### OWNER_ACTION — הגנת `main` (חינמי ב־GitHub)

Settings → Branches / Rulesets על `main`:

- Require a pull request before merging
- Required status check: **`quality`** בלבד (לא Supabase Preview)
- ראו גם `docs/DEPLOY_GATE_QUALITY.md`

## Vercel — מה כבר הוגדר ($0)

| פריט | ערך |
|------|-----|
| Custom Environment | `staging` → git branch `staging` (`env_RtxbzVxoPXcJ2w0aB2If755kQKUV`) |
| Domain | `staging.bino.casa` (מאומת) |
| Password protection | Preview (כולל Staging) — סיסמה: `BinoStaging2026!` |
| Env | `NEXT_PUBLIC_APP_URL=https://staging.bino.casa`, `BINO_OUTBOUND_MODE=mock`, `GROW_ENV=sandbox`, cron secret נפרד |

## Cloud Staging DB בלי לשלם

מגבלת Supabase Free: עד **2** פרויקטים פעילים למשתמש. יצירת `bino-staging` נחסמה.

כדי לקבל DB ענן חינמי ל־`staging.bino.casa`:

1. ב־Supabase Dashboard — **Pause** או מחק פרויקט Free שאינך צריך (לא את Bamakor Production)
2. צור פרויקט Free בשם `bino-staging` (eu)
3. `STAGING_PROJECT_REF=<ref> npx supabase link --project-ref <ref> && npx supabase db push`
4. עדכן ב־Vercel → Environment `staging` את מפתחות Supabase
5. `npm run seed:staging` מול ה־URL החדש
6. Auth URL Configuration: Site URL + redirect → `https://staging.bino.casa`

**אין** ליצור paid Preview Branches. **אין** לחבר Meta/Grow Production ל־staging.

## הוכחת בידוד

| בדיקה | תוצאה |
|--------|--------|
| Local URL | `http://127.0.0.1:54321` ≠ `https://jsliqlmjksintyigkulq.supabase.co` |
| Clients ב־local | רק `[STAGING]…` |
| `BINO_OUTBOUND_MODE` | `mock` — אין SMS/WA/email חיים |
| `bino.casa` / Bamakor | ללא שינוי; `npm run test:bamakor-smoke` |
| Staging banner | מוצג כש־`NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_BINO_STAGING_BANNER` |

## סקריפטים

```bash
npx supabase start
npm run seed:staging
npm run test:staging-smoke
npm run test:bamakor-smoke
```
