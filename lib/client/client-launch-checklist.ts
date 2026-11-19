/**
 * Superadmin client-launch playbook — ordered for real-time onboarding.
 * Model: one Vercel + one Meta App; one 019 number = SMS sender + WhatsApp.
 * Paste + config of all results happens in the superadmin launch wizard.
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
  | 'financy_keys'
  | 'palgate_vendor'
  | 'email_from'
  | 'buildings'
  | 'workers'
  | 'residents'
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
  /** Financy API keys saved on client */
  financyConfigured: boolean
  /** PalGate: waiting for vendor / configured / n_a */
  palgateStatus: 'waiting_vendor' | 'pilot_ready' | 'n_a'
  emailSlug: string | null
  emailFrom: string
  buildingsCount: number
  workersActiveCount: number
  residentsCount: number
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
    detail: 'סופר-אדמין → אשף הקמה (#launch/new) — שם, אדמין, ואז בניינים/דיירים',
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
    detail: 'אשף הקמה → WhatsApp/SMS: sms_sender · WA Phone Number ID · Access Token',
  },
  {
    step: 5,
    title: 'Grow — שלחו ללקוח קישור רישום (GetLink)',
    detail: 'אשף → גבייה: תוסף + userId + פרטי עסק ל-/vaad-pay',
  },
  {
    step: 6,
    title: 'Financy — מפתחות בנק (אופציונלי לשקה רכה)',
    detail: 'אשף הקמה → Financy: client id/secret/userId',
  },
  {
    step: 7,
    title: 'מייל Resend + סיום תפעולי',
    detail: 'אשף → מיתוג: slug@bino.casa, לוגו, בניין/עובד/דיירים/מנהל',
  },
  {
    step: 8,
    title: 'בדיקות חיות מקצה לקצה (מהצד של הלקוח)',
    detail:
      'WA→תקלה · SMS · גבייה ₪1→שולם · מייל · פורטל — ראו docs/CLIENT_SOFT_LAUNCH_SMOKE.md. PalGate: באשף אם רלוונטי.',
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
      where: 'superadmin',
      hrefHint: 'onboarding',
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
      hrefHint: 'onboarding',
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
      hrefHint: 'onboarding',
    },
    {
      id: 'paste_sms_sender',
      step: 4,
      title: '4א. הדבקת מספר שולח 019 ב-BINO',
      detail: hasPhoneSender(s.smsSenderName)
        ? `sms_sender_name = ${s.smsSenderName}`
        : 'אשף הקמה → WhatsApp/SMS → מספר שולח 019 כ-972… (לא שם מותג)',
      status: hasPhoneSender(s.smsSenderName) ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'paste_wa_id',
      step: 4,
      title: '4ב. הדבקת WA Phone Number ID',
      detail: s.whatsappPhoneNumberId
        ? s.whatsappPhoneNumberId
        : 'אשף הקמה → WhatsApp/SMS → WA Phone Number ID',
      status: s.whatsappPhoneNumberId ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'paste_wa_token',
      step: 4,
      title: '4ג. הדבקת WA Access Token',
      detail: s.whatsappAccessTokenSet
        ? 'טוקן שמור'
        : 'אשף הקמה → WhatsApp/SMS → Access Token',
      status: s.whatsappAccessTokenSet ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'collections_addon',
      step: 5,
      title: '5א. תוסף גבייה',
      detail: s.collectionsAddonEnabled
        ? 'תוסף collections פעיל'
        : 'אשף הקמה → גבייה → הפעילו תוסף גבייה אם הלקוח גובה דיירים',
      status: s.collectionsAddonEnabled ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'grow_getlink',
      step: 5,
      title: '5ב. Grow — קישור רישום ללקוח (GetLink)',
      detail: s.growUserId
        ? `userId שמור${s.growEnabled ? '' : ' — הפעילו grow_enabled'}`
        : 'שלחו GetLink ללקוח (חיצוני), ואז הדביקו userId באשף → גבייה',
      status: s.growUserId && s.growEnabled ? 'ok' : s.growUserId ? 'todo' : 'external',
      where: 'grow',
      hrefHint: 'onboarding',
    },
    {
      id: 'grow_legal',
      step: 5,
      title: '5ג. Grow — פרטי עסק ל-/vaad-pay',
      detail: s.growLegalReady
        ? 'שם / טלפון / כתובת מוכנים'
        : 'אשף הקמה → גבייה → פרטי עסק (שם, טלפון, כתובת)',
      status: s.growLegalReady ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'financy_keys',
      step: 6,
      title: '6. Financy — מפתחות בנק',
      detail: s.financyConfigured
        ? 'מפתחות Financy שמורים — חברו חשבון ב־Financy Settings'
        : 'אשף הקמה → Financy: הדביקו client id / secret / userId',
      status: s.financyConfigured ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'palgate_vendor',
      step: 6,
      title: '6ב. PalGate / חניון',
      detail:
        s.palgateStatus === 'pilot_ready'
          ? 'PalGate מוגדר ללקוח'
          : s.palgateStatus === 'waiting_vendor'
            ? 'אופציונלי — הזינו פרטי PalGate באשף כשיש מהספק'
            : 'לא רלוונטי / לא הופעל',
      status:
        s.palgateStatus === 'pilot_ready'
          ? 'ok'
          : s.palgateStatus === 'waiting_vendor'
            ? 'todo'
            : 'ok',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'email_from',
      step: 7,
      title: '7א. מייל Resend (slug@bino.casa)',
      detail: `נשלח מ: ${s.emailFrom}`,
      status: s.emailSlug || /@bino\.casa>/.test(s.emailFrom) ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'admin_user',
      step: 7,
      title: '7ב. אדמין מוזמן',
      detail: s.adminEmail ? s.adminEmail : 'הזמינו משתמש אדמין ללקוח',
      status: s.adminEmail ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'invite',
    },
    {
      id: 'manager_phone',
      step: 7,
      title: '7ג. טלפון מנהל',
      detail: s.managerPhone || 'נדרש להתראות',
      status: s.managerPhone ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'buildings',
      step: 7,
      title: '7ד. בניין אחד לפחות',
      detail: s.buildingsCount > 0 ? `${s.buildingsCount} בניינים` : 'אשף → בניינים (Excel / ידני)',
      status: s.buildingsCount > 0 ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'workers',
      step: 7,
      title: '7ה. עובד פעיל',
      detail:
        s.workersActiveCount > 0
          ? `${s.workersActiveCount} עובדים פעילים`
          : 'אשף → עובדים',
      status: s.workersActiveCount > 0 ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'residents',
      step: 7,
      title: '7ו. דיירים (מומלץ)',
      detail:
        s.residentsCount > 0
          ? `${s.residentsCount} דיירים`
          : 'אשף → דיירים (Excel) — אופציונלי לשקה רכה',
      status: s.residentsCount > 0 ? 'ok' : 'todo',
      where: 'superadmin',
      hrefHint: 'onboarding',
    },
    {
      id: 'logo',
      step: 7,
      title: '7ז. לוגו (מומלץ)',
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

/** Manual live checks during soft-launch — not auto-verified from DB. */
export const LIVE_SMOKE_CHECKS: { id: string; title: string; detail: string }[] = [
  {
    id: 'wa_inbound_ticket',
    title: 'WhatsApp → תקלה אצל הלקוח הנכון',
    detail: 'שלחו הודעה למספר ה-019 של הלקוח → נוצרת תקלה תחת אותו client בלוח הבקרה',
  },
  {
    id: 'sms_sender',
    title: 'SMS יוצא עם מספר השולח של הלקוח',
    detail: 'הגדרות → בדיקת SMS / פתיחת תקלה → השולח הוא 972… של הלקוח (לא שם מותג)',
  },
  {
    id: 'grow_pay_1ils',
    title: 'גבייה ₪1 → webhook → שולם',
    detail: 'שלחו חיוב טסט לדייר → שלמו ב-sandbox → הסטטוס ב-BINO הופך לשולם (+ מייל אישור)',
  },
  {
    id: 'resend_from_slug',
    title: 'מייל מ-slug@bino.casa',
    detail: 'אישור תשלום / התראה מגיעים מ-Name <slug@bino.casa> של הלקוח',
  },
  {
    id: 'worker_portal',
    title: 'פורטל עובד',
    detail: 'קישור עובד נפתח · רואים תקלה · אפשר להשיב / לעדכן סטטוס',
  },
  {
    id: 'resident_portal',
    title: 'פורטל דיירים (אם מופעל)',
    detail: 'הזמנה במייל → כניסה ל-/resident · רואים מידע/תקלות/תשלומים',
  },
  {
    id: 'maintenance_qr_pilot',
    title: 'משימות מחזוריות + QR בניין (פיילוט תפעולי)',
    detail:
      '/qr להדפסה · /tasks החלת תבנית אחזקה · שיוך עובד · פורטל «סמן הושלם» · KPI בדשבורד. ראו CLIENT_SOFT_LAUNCH_SMOKE §7 / KEFER_DAVID_PILOT_HE',
  },
]

export const PLATFORM_LAUNCH_NOTES: { title: string; detail: string }[] = [
  {
    title: 'אשף הקמה בסופר-אדמין',
    detail:
      'כל ההדבקות (WA token, Grow, Financy, PalGate, Excel בניינים/דיירים) מתבצעות ב־#launch/new / #client/{id}/onboarding — בלי לקפוץ להגדרות לקוח.',
  },
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
    detail: 'אין env פר-לקוח ל-WA/Grow. PalGate יכול להיות פר-לקוח ב-DB או env לפיילוט ישן.',
  },
  {
    title: 'Meta App אחת',
    detail: 'Webhook + verify token משותפים. לכל לקוח רק phone_number_id + access_token ב-DB.',
  },
  {
    title: 'גבייה: Grow פעיל (hold)',
    detail:
      'ספק גבייה נוכחי = Grow. מפתחות פלטפורמה ב-Vercel; ללקוח GetLink → userId + פרטי עסק. Financy = בנק/ספרים בלבד — לא מחליף /pay.',
  },
]
