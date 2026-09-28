# דומיין ייצור — bino.casa

**Origin ראשי:** `https://bino.casa`  
**www:** `https://www.bino.casa` → 308 ל־`bino.casa`  
**Alias ישן (נשאר פעיל):** `https://bamakor.vercel.app` — לא מופנה בכוונה, כדי לא לשבור webhooks של Meta/Grow שעדיין מצביעים לשם.

## מה כבר הוגדר ב-Vercel

| פריט | סטטוס |
|------|--------|
| Project `bino` — דומיין `bino.casa` | מאומת + SSL |
| `www.bino.casa` → redirect 308 | מאומת |
| `NEXT_PUBLIC_APP_URL=https://bino.casa` | Production / Preview / Development |
| Nameservers | `ns1.vercel-dns.com` / `ns2.vercel-dns.com` |

אחרי שינוי `NEXT_PUBLIC_APP_URL` חובה **redeploy** לפרודקשן (הערך נאפה בבילד לצד לקוח).

## צעדים חיצוניים (חובה להשלים ידנית)

### 1. Supabase Auth — Bamakor project

Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://bino.casa`
- **Redirect URLs** (להוסיף, לא למחוק את הישן עד אימות):
  - `https://bino.casa/auth/callback`
  - `https://bino.casa/**`
  - (אופציונלי לשמירה) `https://bamakor.vercel.app/auth/callback`

בלי זה — התחברות Google / הזמנות משתמשים ייכשלו ב־redirect.

### 2. Meta WhatsApp (מומלץ)

Developer Console → WhatsApp → Configuration → Callback URL:

- עדכון ל־`https://bino.casa/api/webhook/whatsapp`
- Verify token נשאר `WHATSAPP_VERIFY_TOKEN`

עד העדכון — ה-callback הישן ל־`bamakor.vercel.app` ממשיך לעבוד.

### 3. Grow / Apple Pay

- לרשום את `bino.casa` כדומיין סוחר ב-Grow/Apple (קובץ האימות כבר ב־`public/.well-known/apple-developer-merchantid-domain-association`).
- Webhooks (תשלום / הרשמה / חשבונית) יכולים להישאר על הדומיין הישן או לעבור ל־`https://bino.casa/api/webhook/grow…` — שניהם תקפים כל עוד alias הישן חי.

### 4. Google Cloud OAuth (אם מוגדר client נפרד)

Authorized JavaScript origins / redirect URIs — להוסיף `https://bino.casa` ואת ה-callback של Supabase.

## קישורי מערכת אחרי cutover

| שימוש | URL |
|--------|-----|
| אפליקציה | https://bino.casa |
| גבייה | https://bino.casa/collections |
| Webhook WhatsApp | https://bino.casa/api/webhook/whatsapp |
| Webhook Grow | https://bino.casa/api/webhook/grow?token=… |
| Apple Pay association | https://bino.casa/.well-known/apple-developer-merchantid-domain-association |

קישורי SMS / WhatsApp / הזמנות חדשים נבנים מ־`NEXT_PUBLIC_APP_URL` → `bino.casa`.
