# מיגרציות Supabase (Bamakor)

## לפני הכול

המיגרציות כאן מניחות שכבר קיימות בסכמת `public` הטבלאות הבסיסיות (מערכת הלקוח, בדרך כלל מסקריפט אתחול או יצירה ידנית):

`clients`, `projects`, `workers`, `tickets`, `sessions`, `pending_selections`, `ticket_logs`, `ticket_attachments`

אם טבלה חסרה, הרצת מיגרציה תיכשל — זה מכוון.

## סדר הביצוע (לפי שם הקובץ)

| קובץ | תוכן |
|------|------|
| `001_feature_columns.sql` | עמודות `projects.assigned_worker_id`, `tickets.merged_into_ticket_id` (+ אינדקסים) |
| `002_clients_settings.sql` | העמדות ללקוח: לוגו, WhatsApp, SMS, מנהל, … |
| `003_residents_table.sql` | טבלת `residents` (הגדרה יחידה; לא לשכפל ב-001) |
| `004_webhook_client_scope.sql` | `client_id` על `sessions` / `pending_selections` + אינדקס חלקי ל-sessions |
| `005_add_merged_ticket.sql` | `tickets.is_merged` |
| `006_processed_webhooks.sql` | טבלת דדופ webhook |
| `007_performance_indexes.sql` | אינדקסי ביצועים (ללא כפילות מול 004) |
| `008_enable_rls.sql` | RLS + bypass ל-`service_role` |
| `009_client_limits.sql` | `max_workers`, `max_residents` |
| `010_sms_sender_name.sql` | `sms_sender_name` |
| `011_rls_anon_dashboard_access.sql` | מדיניות `anon` לדשבורד |
| `012_rename_clients_whatsapp_phone_id.sql` | שינוי שם עמודה legacy → `whatsapp_phone_number_id` |
| `013_sessions_pending_whatsapp_image.sql` | `sessions.pending_whatsapp_media_id` |
| `014_sessions_pending_apartment.sql` | `sessions.pending_apartment_detail` |
| `015_pending_resident_join_requests.sql` | טבלת אישור דיירים + RLS |
| `016_sessions_whatsapp_columns_confirm.sql` | חזרה אידempotנטית על 013+014 (אם דילגו / cache) |

## הרצה

```bash
npx supabase link --project-ref YOUR_REF
npm run db:migration:list
npx supabase db push --linked
```

או ב-Supabase Dashboard → SQL: הדבק לפי סדר (או את כל הקבצים ברצף).

### סנכרון היסטוריית migrations (remote ↔ repo)

אם `db push` מדווח על גרסאות remote שלא ב-repo:

```bash
npx supabase migration list --linked
npx supabase migration repair --status reverted <version> ...   # לפי הודעת CLI
npx supabase db pull --linked                                   # משיכת סכמה
```

מיגרציות שכבר הוחלו ידנית (למשל `037_bamakor_reset_client_tickets.sql`) — אין צורך להריץ שוב.

### TypeScript types מה-DB

```bash
npm run db:types
```

יוצר `lib/database.types.ts` (לא נדרש ל-runtime; לשימוש הדרגתי ב-TypeScript).

## הערות

- **013–014 וגם 016**: כולם משתמשים ב־`ADD COLUMN IF NOT EXISTS` — בטוחים גם אם כבר יישמת ידנית.
