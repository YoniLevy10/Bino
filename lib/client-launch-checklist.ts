/**
 * Superadmin client-launch readiness — one Meta App (platform), many WA numbers (per client).
 * Vercel env is shared; everything below is per-tenant state.
 */

export type LaunchCheckId =
  | 'admin_user'
  | 'whatsapp_phone'
  | 'whatsapp_token'
  | 'sms_sender'
  | 'manager_phone'
  | 'grow_user'
  | 'grow_legal'
  | 'collections_addon'
  | 'email_from'
  | 'buildings'
  | 'workers'
  | 'logo'

export type LaunchCheckStatus = 'ok' | 'todo' | 'external'

export type LaunchCheckItem = {
  id: LaunchCheckId
  title: string
  detail: string
  status: LaunchCheckStatus
  /** Where to complete: superadmin task hash, tenant settings path, or external */
  where: 'superadmin' | 'settings' | 'setup' | 'external' | 'meta' | '019' | 'grow'
  hrefHint?: string
}

export type ClientLaunchSnapshot = {
  clientName: string
  adminEmail: string | null
  whatsappPhoneNumberId: string | null
  whatsappAccessTokenSet: boolean
  smsSenderName: string | null
  managerPhone: string | null
  growEnabled: boolean
  growUserId: string | null
  growLegalReady: boolean
  collectionsAddonEnabled: boolean
  emailSlug: string | null
  emailFrom: string
  buildingsCount: number
  workersActiveCount: number
  logoUrl: string | null
}

function hasPhoneSender(raw: string | null | undefined): boolean {
  const v = (raw || '').replace(/\D/g, '')
  return v.length >= 10
}

export function buildClientLaunchChecklist(s: ClientLaunchSnapshot): {
  items: LaunchCheckItem[]
  doneCount: number
  totalCount: number
  readyForSoftLaunch: boolean
} {
  const items: LaunchCheckItem[] = [
    {
      id: 'admin_user',
      title: 'משתמש אדמין',
      detail: s.adminEmail
        ? `מוזמן: ${s.adminEmail}`
        : 'הזמינו אדמין (אימייל) דרך הסופר-אדמין או אשף ההקמה',
      status: s.adminEmail ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'invite',
    },
    {
      id: 'whatsapp_phone',
      title: 'WhatsApp — מספר ב-Meta',
      detail: s.whatsappPhoneNumberId
        ? `Phone Number ID: ${s.whatsappPhoneNumberId}`
        : 'באפליקציית Meta של BINO — הוסיפו מספר → העתיקו Phone Number ID לכאן',
      status: s.whatsappPhoneNumberId ? 'ok' : 'external',
      where: 'meta',
      hrefHint: 'plan',
    },
    {
      id: 'whatsapp_token',
      title: 'WhatsApp — Access Token',
      detail: s.whatsappAccessTokenSet
        ? 'טוקן שמור אצל הלקוח'
        : 'הדביקו Access Token בהגדרות הלקוח → WhatsApp (לא ב-Vercel)',
      status: s.whatsappAccessTokenSet ? 'ok' : 'todo',
      where: 'settings',
    },
    {
      id: 'sms_sender',
      title: '019SMS — מספר שולח',
      detail: hasPhoneSender(s.smsSenderName)
        ? `שולח: ${s.smsSenderName}`
        : 'רשמו מספר ב-019SMS והדביקו כ-972… בשדה שולח SMS (לא שם מותג)',
      status: hasPhoneSender(s.smsSenderName) ? 'ok' : 'external',
      where: '019',
      hrefHint: 'plan',
    },
    {
      id: 'manager_phone',
      title: 'טלפון מנהל',
      detail: s.managerPhone ? s.managerPhone : 'נדרש להתראות ולזרימות תפעול',
      status: s.managerPhone ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'plan',
    },
    {
      id: 'grow_user',
      title: 'Grow — userId סליקה',
      detail: s.growUserId
        ? `userId מוגדר${s.growEnabled ? '' : ' (grow_enabled כבוי)'}`
        : 'GetLink או הדבקת userId בהגדרות → Grow',
      status: s.growUserId && s.growEnabled ? 'ok' : s.growUserId ? 'todo' : 'external',
      where: 'grow',
    },
    {
      id: 'grow_legal',
      title: 'Grow — פרטי עסק (/vaad-pay)',
      detail: s.growLegalReady
        ? 'שם / טלפון / כתובת לעמוד העסק'
        : 'מלאו פרטי עסק משפטיים בהגדרות Grow',
      status: s.growLegalReady ? 'ok' : 'todo',
      where: 'settings',
    },
    {
      id: 'collections_addon',
      title: 'תוסף גבייה',
      detail: s.collectionsAddonEnabled
        ? 'תוסף collections פעיל'
        : 'הפעילו תוסף גבייה בסופר-אדמין אם הלקוח גובה דיירים',
      status: s.collectionsAddonEnabled ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'addons',
    },
    {
      id: 'email_from',
      title: 'מייל Resend לפי לקוח',
      detail: `נשלח מ: ${s.emailFrom}${s.emailSlug ? '' : ' (מומלץ להגדיר slug באנגלית)'}`,
      status: s.emailSlug || /@bino\.casa>/.test(s.emailFrom) ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'launch',
    },
    {
      id: 'buildings',
      title: 'בניין אחד לפחות',
      detail: s.buildingsCount > 0 ? `${s.buildingsCount} בניינים` : 'צרו בניין באשף או בסופר-אדמין',
      status: s.buildingsCount > 0 ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'buildings',
    },
    {
      id: 'workers',
      title: 'עובד פעיל',
      detail:
        s.workersActiveCount > 0
          ? `${s.workersActiveCount} עובדים פעילים`
          : 'הוסיפו עובד לשיבוץ תקלות',
      status: s.workersActiveCount > 0 ? 'ok' : 'todo',
      where: 'setup',
    },
    {
      id: 'logo',
      title: 'לוגו',
      detail: s.logoUrl ? 'לוגו הועלה' : 'אופציונלי — מוצג בדף תשלום וביישומון',
      status: s.logoUrl ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'logo',
    },
  ]

  const required: LaunchCheckId[] = [
    'admin_user',
    'whatsapp_phone',
    'whatsapp_token',
    'sms_sender',
    'manager_phone',
    'buildings',
    'workers',
  ]
  const doneCount = items.filter((i) => i.status === 'ok').length
  const readyForSoftLaunch = required.every(
    (id) => items.find((i) => i.id === id)?.status === 'ok'
  )

  return { items, doneCount, totalCount: items.length, readyForSoftLaunch }
}

/** Shared platform items — not per-client; shown once in the guide. */
export const PLATFORM_LAUNCH_NOTES: { title: string; detail: string }[] = [
  {
    title: 'Vercel אחד לכולם',
    detail:
      'פרויקט Bino אחד. אין env פר-לקוח. מפתחות פלטפורמה: GROW_*, SMS_019_*, RESEND_*, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET.',
  },
  {
    title: 'Meta App אחת',
    detail:
      'אפליקציית Meta של BINO. לכל לקוח מוסיפים מספר WhatsApp ומדביקים phone_number_id + access_token ב-DB של הלקוח. ה-webhook וה-verify token משותפים.',
  },
  {
    title: 'Resend + דומיין bino.casa',
    detail:
      'דומיין מאומת ב-Resend. כל לקוח שולח מ-slug@bino.casa (למשל bamakor@bino.casa) בלי כתובת חדשה ב-Vercel.',
  },
  {
    title: '019SMS',
    detail:
      'חשבון API אחד (username/password ב-Vercel). לכל לקוח מספר שולח רשום אצל 019 — נשמר ב-sms_sender_name כ-972…',
  },
  {
    title: 'Grow פלטפורמה',
    detail:
      'apiKey / x-api-key / pageCode / webhook secret ב-Vercel. לכל לקוח grow_user_id (GetLink) + פרטי עסק ל-/vaad-pay/{clientId}.',
  },
]
