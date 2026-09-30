# דומיין ייצור — bino.tech

**Origin ראשי (קישורים / SMS / WhatsApp / SEO):** `https://bino.tech`  
**www:** `https://www.bino.tech` → 308 ל־`bino.tech`  
**Alias קודם (redirect):** `https://bino.casa` / `www.bino.casa` → `bino.tech` (לא לשבור סימניות וקישורים ישנים)  
**Alias webhook ישן (נשאר פעיל, לא לפרסום):** `https://bamakor.vercel.app` — Meta/Grow שעדיין מצביעים לשם  
**מייל Resend (נשאר לעת עתה):** `{slug}@bino.casa` — לא תלוי ב-cutover של קישורי האפליקציה

## למה לא Vercel.app בקישורים

כל קישור ציבורי (SMS, WhatsApp, הזמנות, canonical, sitemap) נבנה מ־`NEXT_PUBLIC_APP_URL`.  
חייב להיות `https://bino.tech` ב-Production — לא `*.vercel.app`.

## מצב DNS של bino.tech (נכון לבדיקה אחרונה)

| פריט | מצב |
|------|-----|
| Nameservers | `ns1.afternic.com` / `ns2.afternic.com` (חניה GoDaddy/Afternic) |
| האתר ב-`https://bino.tech` | דף parked — **עדיין לא** האפליקציה |

### Cutover DNS (חובה לפני שינוי env)

1. Vercel → Project **bino** → Settings → Domains → Add:
   - `bino.tech` (Production)
   - `www.bino.tech` → redirect 308 אל `bino.tech`
2. ב-registrar / GoDaddy של `bino.tech` — העבר Nameservers ל:
   - `ns1.vercel-dns.com`
   - `ns2.vercel-dns.com`  
   (או הוסף A/CNAME לפי מה ש-Vercel מציג אם משאירים NS אצל GoDaddy)
3. המתן לאימות + SSL ב-Vercel (`verified = true`)
4. Domains → `bino.casa` / `www.bino.casa` → Redirect אל `bino.tech` (301/308)
5. Vercel → Environment Variables:
   - `NEXT_PUBLIC_APP_URL=https://bino.tech` (Production; מומלץ גם Preview אם רוצים עקביות בקישורים)
6. **Redeploy** Production (הערך נאפה בבילד לצד לקוח)

## מה כבר אמור להיות אחרי cutover

| פריט | ערך |
|------|-----|
| `NEXT_PUBLIC_APP_URL` | `https://bino.tech` |
| Canonical / sitemap / JSON-LD | נגזרים מ-`NEXT_PUBLIC_APP_URL` |
| Alias `bamakor.vercel.app` | נשאר לwebhooks ישנים — לא בפרסום |

## צעדים חיצוניים אחרי שהדומיין חי

### 1. Supabase Auth

Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://bino.tech`
- **Redirect URLs** (להוסיף):
  - `https://bino.tech/auth/callback`
  - `https://bino.tech/**`
  - (שמירה זמנית) `https://bino.casa/auth/callback`
  - (אופציונלי) `https://bamakor.vercel.app/auth/callback`

### 2. Meta WhatsApp

Callback URL → `https://bino.tech/api/webhook/whatsapp`  
(עד העדכון — callback ישן על vercel.app / bino.casa יכול להמשיך)

### 3. Grow / Apple Pay

- לרשום `bino.tech` כדומיין סוחר; קובץ האימות ב־`public/.well-known/apple-developer-merchantid-domain-association`
- Webhooks יכולים להישאר על alias ישן עד העברה מסודרת

### 4. Google Search Console / GA

- נכס Domain או URL-prefix ל־`bino.tech`
- Sitemap: `https://bino.tech/sitemap.xml`
- בקשת אינדוקס ל־`/` ו־`/en`
- (אופציונלי) Change of Address מ-`bino.casa` אם הנכס הישן פעיל

### 5. Google Cloud OAuth

Authorized origins / redirects — להוסיף `https://bino.tech`

## קישורי מערכת אחרי cutover

| שימוש | URL |
|--------|-----|
| אפליקציה | https://bino.tech |
| גבייה | https://bino.tech/collections |
| Webhook WhatsApp | https://bino.tech/api/webhook/whatsapp |
| Webhook Grow | https://bino.tech/api/webhook/grow?token=… |
| Apple Pay association | https://bino.tech/.well-known/apple-developer-merchantid-domain-association |

קישורי SMS / WhatsApp / הזמנות חדשים = `NEXT_PUBLIC_APP_URL` → **bino.tech**.
