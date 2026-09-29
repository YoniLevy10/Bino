/**
 * Superadmin client-launch playbook — ordered for real-time onboarding.
 * Model: one Vercel + one Meta App; one 019 number = SMS sender + WhatsApp.
 */

export type LaunchCheckId =
  | 'create_client'
  | 'buy_019_number'
  | 'connect_meta'
  | 'paste_sms_sender'
  | 'paste_wa_id'
  | 'paste_wa_token'
  | 'admin_user'
  | 'manager_phone'
  | 'collections_addon'
  | 'grow_getlink'
  | 'grow_legal'
  | 'email_from'
  | 'buildings'
  | 'workers'
  | 'logo'

export type LaunchCheckStatus = 'ok' | 'todo' | 'external'

export type LaunchCheckItem = {
  id: LaunchCheckId
  step: number
  title: string
  detail: string
  status: LaunchCheckStatus
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

/** Fixed order shown at top of the superadmin panel — do not reorder casually. */
export const LAUNCH_PLAYBOOK_HEADER: { step: number; title: string; detail: string }[] = [
  {
    step: 1,
    title: 'צרו לקוח ב-BINO',
    detail: 'סופר-אדמין → אשף הקמה (/superadmin/setup) — שם, אדמין, בניין, עובד',
  },
  {
    step: 2,
    title: 'קנו מספר ב-019',
    detail: 'מספר אחד בלבד — ישמש גם כשולח SMS וגם כ-WhatsApp',
  },
  {
    step: 3,
    title: 'חברו את אותו מספר ב-Meta App של BINO',
    detail: 'Add phone number באפליקציית Meta → קבלו Phone Number ID + Access Token',
  },
  {
    step: 4,
    title: 'הדביקו ב-BINO את המספר והטוקנים',
    detail: 'sms_sender = 972… · WA Phone Number ID · WA Access Token (בהגדרות הלקוח)',
  },
  {
    step: 5,
    title: 'Grow — שלחו ללקוח קישור רישום (GetLink)',
    detail: 'הפעילו תוסף גבייה → שלחו GetLink / הדביקו userId → מלאו פרטי עסק ל-/vaad-pay',
  },
  {
    step: 6,
    title: 'מייל Resend + סיום תפעולי',
    detail: 'הגדירו slug@bino.casa, לוגו, וודאו בניין/עובד/מנהל — ואז בדיקות',
  },
]

export function buildClientLaunchChecklist(s: ClientLaunchSnapshot): {
  items: LaunchCheckItem[]
  doneCount: number
  totalCount: number
  readyForSoftLaunch: boolean
} {
  const items: LaunchCheckItem[] = [
    {
      id: 'create_client',
      step: 1,
      title: '1. לקוח נוצר ב-BINO',
      detail: `לקוח: ${s.clientName}`,
      status: 'ok',
      where: 'setup',
    },
    {
      id: 'buy_019_number',
      step: 2,
      title: '2. קניית מספר ב-019',
      detail: hasPhoneSender(s.smsSenderName)
        ? `מספר נשמר כשולח: ${s.smsSenderName} (אותו מספר ל-WhatsApp)`
        : 'קנו/רשמו מספר ב-019 — אותו מספר ישמש גם ל-WhatsApp. עדיין לא הודבק ב-BINO',
      status: hasPhoneSender(s.smsSenderName) ? 'ok' : 'external',
      where: '019',
      hrefHint: 'plan',
    },
    {
      id: 'connect_meta',
      step: 3,
      title: '3. חיבור המספר ב-Meta App של BINO',
      detail: s.whatsappPhoneNumberId
        ? `מחובר — Phone Number ID: ${s.whatsappPhoneNumberId}`
        : 'באפליקציית Meta של BINO הוסיפו את מספר ה-019 → העתיקו Phone Number ID',
      status: s.whatsappPhoneNumberId ? 'ok' : 'external',
      where: 'meta',
      hrefHint: 'plan',
    },
    {
      id: 'paste_sms_sender',
      step: 4,
      title: '4א. הדבקת מספר שולח 019 ב-BINO',
      detail: hasPhoneSender(s.smsSenderName)
        ? `sms_sender_name = ${s.smsSenderName}`
        : 'סופר-אדמין → מנוי ומכסות → מספר שולח 019SMS כ-972… (לא שם מותג)',
      status: hasPhoneSender(s.smsSenderName) ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'plan',
    },
    {
      id: 'paste_wa_id',
      step: 4,
      title: '4ב. הדבקת WA Phone Number ID',
      detail: s.whatsappPhoneNumberId
        ? s.whatsappPhoneNumberId
        : 'סופר-אדמין → מנוי ומכסות → WA Phone Number ID',
      status: s.whatsappPhoneNumberId ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'plan',
    },
    {
      id: 'paste_wa_token',
      step: 4,
      title: '4ג. הדבקת WA Access Token',
      detail: s.whatsappAccessTokenSet
        ? 'טוקן שמור'
        : 'כניסה כלקוח → הגדרות → WhatsApp → Access Token (לא ב-Vercel)',
      status: s.whatsappAccessTokenSet ? 'ok' : 'todo',
      where: 'settings',
    },
    {
      id: 'collections_addon',
      step: 5,
      title: '5א. תוסף גבייה',
      detail: s.collectionsAddonEnabled
        ? 'תוסף collections פעיל'
        : 'הפעילו תוסף גבייה אם הלקוח גובה דיירים',
      status: s.collectionsAddonEnabled ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'addons',
    },
    {
      id: 'grow_getlink',
      step: 5,
      title: '5ב. Grow — קישור רישום ללקוח (GetLink)',
      detail: s.growUserId
        ? `userId שמור${s.growEnabled ? '' : ' — הפעילו grow_enabled'}`
        : 'שלחו ללקוח קישור GetLink מהגדרות Grow, או הדביקו userId אחרי ההרשמה',
      status: s.growUserId && s.growEnabled ? 'ok' : s.growUserId ? 'todo' : 'external',
      where: 'grow',
    },
    {
      id: 'grow_legal',
      step: 5,
      title: '5ג. Grow — פרטי עסק ל-/vaad-pay',
      detail: s.growLegalReady
        ? 'שם / טלפון / כתובת מוכנים'
        : 'הגדרות לקוח → Grow → פרטי עסק (שם, טלפון, כתובת)',
      status: s.growLegalReady ? 'ok' : 'todo',
      where: 'settings',
    },
    {
      id: 'email_from',
      step: 6,
      title: '6א. מייל Resend (slug@bino.casa)',
      detail: `נשלח מ: ${s.emailFrom}`,
      status: s.emailSlug || /@bino\.casa>/.test(s.emailFrom) ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'launch',
    },
    {
      id: 'admin_user',
      step: 6,
      title: '6ב. אדמין מוזמן',
      detail: s.adminEmail ? s.adminEmail : 'הזמינו משתמש אדמין ללקוח',
      status: s.adminEmail ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'invite',
    },
    {
      id: 'manager_phone',
      step: 6,
      title: '6ג. טלפון מנהל',
      detail: s.managerPhone || 'נדרש להתראות',
      status: s.managerPhone ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'plan',
    },
    {
      id: 'buildings',
      step: 6,
      title: '6ד. בניין אחד לפחות',
      detail: s.buildingsCount > 0 ? `${s.buildingsCount} בניינים` : 'צרו בניין',
      status: s.buildingsCount > 0 ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'buildings',
    },
    {
      id: 'workers',
      step: 6,
      title: '6ה. עובד פעיל',
      detail:
        s.workersActiveCount > 0
          ? `${s.workersActiveCount} עובדים פעילים`
          : 'הוסיפו עובד לשיבוץ',
      status: s.workersActiveCount > 0 ? 'ok' : 'todo',
      where: 'setup',
    },
    {
      id: 'logo',
      step: 6,
      title: '6ו. לוגו (מומלץ)',
      detail: s.logoUrl ? 'לוגו הועלה' : 'אופציונלי — מוצג בדף תשלום',
      status: s.logoUrl ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'logo',
    },
  ]

  const required: LaunchCheckId[] = [
    'paste_sms_sender',
    'paste_wa_id',
    'paste_wa_token',
    'admin_user',
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

export const PLATFORM_LAUNCH_NOTES: { title: string; detail: string }[] = [
  {
    title: 'מה לא לפספס בין 019 / Meta / Grow',
    detail:
      'לפני 019: צרו לקוח. אחרי Meta: הדביקו ב-BINO (972… + Phone Number ID + Token). אחרי GetLink: פרטי עסק ל-/vaad-pay + slug למייל + בדיקות WA/SMS/תשלום.',
  },
  {
    title: 'מספר אחד = 019 + WhatsApp',
    detail:
      'קונים ב-019, מחברים את אותו מספר ב-Meta App של BINO, ומדביקים ב-BINO גם כשולח SMS (972…) וגם כ-WhatsApp.',
  },
  {
    title: 'Vercel אחד לכולם',
    detail: 'אין env פר-לקוח. GROW_*, SMS_019_*, RESEND_*, WHATSAPP_VERIFY_TOKEN / APP_SECRET — משותפים.',
  },
  {
    title: 'Meta App אחת',
    detail: 'Webhook + verify token משותפים. לכל לקוח רק phone_number_id + access_token ב-DB.',
  },
  {
    title: 'Grow',
    detail:
      'מפתחות פלטפורמה ב-Vercel. ללקוח: GetLink → userId + פרטי עסק. חשבונית אוטומטית — הגדרה ראשונה באתר העסקי של Grow.',
  },
]
