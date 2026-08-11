import { joinTrilingualTemplate } from '@/lib/whatsapp-bilingual-template'

export const WHATSAPP_TEMPLATE_KEYS = [
  // ── שפה ותחילת זרימה (דייר חדש) ───────────────────────────────────
  'choose_language',      // כפתורי שפה — לפני בחירה
  'ask_building',         // אחרי בחירת שפה — בקשת כתובת
  'last_project_confirm', // דייר חוזר — אותו בניין / בניין אחר (כפתורים)
  'building_list_body',   // גוף רשימת בניינים (כפתור «בחר בניין»)
  'clarification_reply',  // «איך פותחים?» — הנחיה קצרה

  // ── קיים (5) ──────────────────────────────────────────────────────
  'welcome',            // הנחיות כלליות
  'ticket_opened',      // אישור פתיחת תקלה המלא
  'ticket_closed',      // סגירת תקלה לדייר
  'worker_assigned',    // עדכון לעובד
  'error_general',      // שגיאות/SLA

  // ── מיקום (3) ─────────────────────────────────────────────────────
  'location_attached',  // מיקום צורף לתקלה
  'location_stashed',   // מיקום התקבל, ממתין לתיאור
  'location_error',     // שגיאת מיקום

  // ── תמונה (3) ─────────────────────────────────────────────────────
  'image_attached',     // תמונה צורפה לתקלה
  'image_failed',       // תמונה לא צורפה
  'image_stashed',      // תמונה התקבלה, ממתין לתיאור

  // ── סרטון (3) ─────────────────────────────────────────────────────
  'video_attached',     // סרטון צורף לתקלה
  'video_failed',       // סרטון לא צורף
  'video_stashed',      // סרטון התקבל, ממתין לתיאור

  // ── סוגי הודעות לא נתמכים (2) ────────────────────────────────────
  'redirect_to_text',   // סטיקר / אנשי קשר / שמע / תגובה
  'unsupported_message', // מסמך / סוג לא ידוע

  // ── QR / חיפוש בניין (6) ──────────────────────────────────────────
  'qr_invalid',                 // קוד QR לא תקין
  'project_not_found',          // פרויקט לא נמצא מ-QR
  'building_not_found',         // בניין לא נמצא בחיפוש טקסט
  'building_multiple_matches',  // כמה בניינים תואמים ({{list}})
  'technical_error',            // שגיאה טכנית
  'selection_invalid',          // בחירה לא תקינה

  // ── זרימת תקלה (5) ────────────────────────────────────────────────
  'session_created',       // סשן נוצר + בקשת תיאור
  'resident_prompt',       // דייר מוכר, בקשת תיאור
  'duplicate_ticket',      // תקלה כפולה
  'no_open_tickets',       // אין תקלות פתוחות (שאלת סטטוס)
  'ticket_status_list',    // רשימת סטטוס תקלות פתוחות (שאלת סטטוס)
  'sla_escalation_resident', // SLA — עדכון לדייר שתקלה עדיין בטיפול
  'pending_approval_note', // הערת אישור מנהלת (נוספת לסוף ticket_opened)
] as const

export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATE_KEYS)[number]

/** Preview in editor shows all language blocks (resident has not picked a language yet). */
export const WHATSAPP_ALL_LANGS_PREVIEW_KEYS: WhatsAppTemplateKey[] = ['choose_language']

export const WHATSAPP_TEMPLATE_VAR_NAMES = [
  'project_name',
  'ticket_number',
  'description',
  'reporter_name',
  'building_line',
  'list',
] as const

export type WhatsAppTemplateVarName = (typeof WHATSAPP_TEMPLATE_VAR_NAMES)[number]

export type WhatsAppTemplateCategory =
  | 'general'
  | 'location'
  | 'image'
  | 'video'
  | 'unsupported'
  | 'building'
  | 'flow'

export const WHATSAPP_TEMPLATE_CATEGORIES: Record<
  WhatsAppTemplateKey,
  WhatsAppTemplateCategory
> = {
  choose_language: 'general',
  ask_building: 'building',
  last_project_confirm: 'building',
  building_list_body: 'building',
  clarification_reply: 'flow',
  welcome: 'general',
  ticket_opened: 'flow',
  ticket_closed: 'flow',
  worker_assigned: 'flow',
  error_general: 'general',
  location_attached: 'location',
  location_stashed: 'location',
  location_error: 'location',
  image_attached: 'image',
  image_failed: 'image',
  image_stashed: 'image',
  video_attached: 'video',
  video_failed: 'video',
  video_stashed: 'video',
  redirect_to_text: 'unsupported',
  unsupported_message: 'unsupported',
  qr_invalid: 'building',
  project_not_found: 'building',
  building_not_found: 'building',
  building_multiple_matches: 'building',
  technical_error: 'building',
  selection_invalid: 'building',
  session_created: 'flow',
  resident_prompt: 'flow',
  duplicate_ticket: 'flow',
  no_open_tickets: 'flow',
  ticket_status_list: 'flow',
  sla_escalation_resident: 'flow',
  pending_approval_note: 'flow',
}

export const WHATSAPP_TEMPLATE_CATEGORY_LABELS: Record<WhatsAppTemplateCategory, string> = {
  general: 'כללי ושגיאות',
  flow: 'זרימת תקלה',
  building: 'חיפוש בניין וקוד QR',
  location: 'הודעות מיקום',
  image: 'הודעות תמונה',
  video: 'הודעות סרטון',
  unsupported: 'סוגי הודעות לא נתמכים',
}

/** רצף שיחה — שלבים לוגיים לדף התבניות */
export const WHATSAPP_TEMPLATE_JOURNEY: {
  step: number
  title: string
  description: string
  keys: WhatsAppTemplateKey[]
}[] = [
  {
    step: 1,
    title: 'שפה וזיהוי בניין',
    description: 'דייר בוחר שפה, שולח כתובת — רואה רק התאמות חיפוש (לא את כל הפרויקטים)',
    keys: [
      'choose_language',
      'ask_building',
      'last_project_confirm',
      'building_list_body',
      'clarification_reply',
      'building_not_found',
      'selection_invalid',
      'qr_invalid',
      'project_not_found',
    ],
  },
  {
    step: 2,
    title: 'תיאור ופתיחת תקלה',
    description: 'בניין זוהה — תיאור קצר, תקלה נפתחת, אופציונלי תמונה/סרטון',
    keys: ['session_created', 'resident_prompt', 'duplicate_ticket', 'ticket_opened'],
  },
  {
    step: 3,
    title: 'עדכונים לעובד',
    description: 'הודעות פנימיות / SMS לצוות (לא לדייר)',
    keys: ['worker_assigned', 'pending_approval_note'],
  },
  {
    step: 4,
    title: 'מעקב וסגירה',
    description: 'שאילת סטטוס, SLA וסגירת תקלה',
    keys: ['ticket_status_list', 'no_open_tickets', 'ticket_closed', 'sla_escalation_resident'],
  },
  {
    step: 5,
    title: 'תמונות וסרטונים',
    description: 'צירוף מדיה לתקלה פתוחה או שמירה זמנית לפני תיאור',
    keys: ['image_stashed', 'image_attached', 'image_failed', 'video_stashed', 'video_attached', 'video_failed'],
  },
  {
    step: 6,
    title: 'שגיאות והודעות לא נתמכות',
    description: 'מקרי קצה: שגיאות טכניות, סטיקר/קול/אנשי קשר, מסמך (מיקום GPS בארכיון — redirect_to_text)',
    keys: ['technical_error', 'error_general', 'redirect_to_text', 'unsupported_message', 'welcome', 'building_multiple_matches'],
  },
]

/** Archived GPS templates — kept in catalog/DB; not shown in journey (location → redirect_to_text). */
export const WHATSAPP_ARCHIVED_TEMPLATE_KEYS = [
  'location_attached',
  'location_stashed',
  'location_error',
] as const satisfies readonly WhatsAppTemplateKey[]

/** הסבר קצר "מתי נשלח?" לכל תבנית */
export const WHATSAPP_TEMPLATE_WHEN_SENT: Record<WhatsAppTemplateKey, string> = {
  choose_language:         'דייר חדש — כפתורי עברית / Français / English (לפני בחירת שפה)',
  ask_building:              'אחרי בחירת שפה — בקשת כתובת בניין (לא מציגים רשימה מלאה)',
  last_project_confirm:      'דייר שדיווח בעבר — כפתורי «אותו בניין» / «בניין אחר» ({{project_name}})',
  building_list_body:        'גוף ההודעה מעל «בחר בניין» — רק התאמות חיפוש (לא כל הפרויקטים)',
  clarification_reply:       'דייר שואל «איך פותחים?» — הנחיה קצרה',
  welcome:                 'legacy — ברכה כללית (דייר חדש ללא שפה שמורה)',
  qr_invalid:              'נסרק QR אך הפורמט שגוי (לא מתחיל ב-BMK)',
  project_not_found:       'ה-QR תקין אך קוד הפרויקט לא קיים במערכת',
  building_not_found:      'דייר חדש — נשלח כשהטקסט לא נראה ככתובת בניין (לא ברכה קצרה)',
  building_multiple_matches: 'נמצאו 2-3 בניינים תואמים — הדייר צריך לבחור',
  selection_invalid:       'הדייר הקליד מספר בחירה אך הוא מחוץ לטווח (לא 1, 2 או 3)',
  session_created:         'דייר חדש — אחרי QR/כתובת/בחירה מרשימה: בקשת תיאור ({{project_name}})',
  resident_prompt:         'דייר מוכר — ברכה אוטומטית ב-{{reporter_name}} + בקשת תיאור (לא חיפוש בניין)',
  duplicate_ticket:        'התיאור שהוגש זהה לתקלה פתוחה קיימת של אותו דייר',
  ticket_opened:           'תקלה נפתחה בהצלחה — נשלח לדייר כאישור',
  pending_approval_note:   'נוסף בסוף הודעת ticket_opened כשהדייר לא ברשימת הדיירים של הבניין',
  worker_assigned:         'נשלח לעובד (SMS) כשתקלה משויכת אליו',
  no_open_tickets:         'דייר שאל "מה הסטטוס?" אך אין לו תקלה פתוחה',
  ticket_status_list:      'דייר שאל על סטטוס — יש לו תקלות פתוחות ({{list}})',
  sla_escalation_resident: 'תיבת WhatsApp ידנית — לא נשלח אוטומטית (תזכורות SLA רק למנהל)',
  ticket_closed:           'המנהלת סגרה תקלה — נשלח לדייר שדיווח עליה',
  image_stashed:           'דייר שלח תמונה לפני שפתח תקלה — מבקשים תיאור טקסט',
  image_attached:          'תמונה צורפה בהצלחה לתקלה פתוחה',
  image_failed:            'שגיאה בהורדה/העלאה של התמונה',
  video_stashed:           'דייר שלח סרטון לפני שפתח תקלה — מבקשים תיאור טקסט',
  video_attached:          'סרטון צורף בהצלחה לתקלה פתוחה',
  video_failed:            'שגיאה בהורדה/העלאה של הסרטון',
  location_stashed:        'דייר שלח מיקום לפני שפתח תקלה — מבקשים תיאור טקסט',
  location_attached:       'מיקום צורף לתקלה פתוחה',
  location_error:          'שגיאה בקריאת המיקום',
  technical_error:         'שגיאה טכנית בלתי צפויה (DB, WA API, timeout וכו\')',
  error_general:           'שגיאות SLA או שגיאות אחרות שלא מטופלות אחרת',
  redirect_to_text:        'דייר שלח סטיקר / הודעה קולית / איש קשר — מכווינים לטקסט',
  unsupported_message:     'דייר שלח מסמך / סוג הודעה לא ידוע',
}

/** כותרת קריאה בעברית לכרטיס בעמוד ההגדרות */
export const WHATSAPP_TEMPLATE_LABELS: Record<WhatsAppTemplateKey, string> = {
  choose_language: 'בחירת שפה — כפתורים (עברית / Français / English)',
  ask_building: 'בקשת כתובת בניין',
  last_project_confirm: 'דייר חוזר — אותו בניין? (כפתורים)',
  building_list_body: 'רשימת התאמות חיפוש — טקסט מעל הכפתור',
  clarification_reply: 'הסבר קצר — איך לפתוח תקלה',
  welcome: 'הודעת פתיחה והנחיות (legacy)',
  ticket_opened: 'אישור פתיחת תקלה (עם כל הפרטים)',
  ticket_closed: 'סגירת תקלה (עדכון לדייר)',
  worker_assigned: 'עדכון לעובד (שיוך / תקלה משויכת)',
  error_general: 'שגיאות כלליות והתראות SLA',
  location_attached: 'מיקום צורף לתקלה פתוחה',
  location_stashed: 'מיקום התקבל, ממתין לתיאור טקסט',
  location_error: 'שגיאה בקריאת המיקום',
  image_attached: 'תמונה צורפה לתקלה בהצלחה',
  image_failed: 'תמונה לא הצליחה להיצרף',
  image_stashed: 'תמונה התקבלה, ממתין לתיאור טקסט',
  video_attached: 'סרטון צורף לתקלה בהצלחה',
  video_failed: 'סרטון לא הצליח להיצרף',
  video_stashed: 'סרטון התקבל, ממתין לתיאור טקסט',
  redirect_to_text: 'הפניה לשימוש בטקסט (סטיקר / שמע / אנשי קשר)',
  unsupported_message: 'סוג הודעה לא נתמך (מסמך / סוג לא ידוע)',
  qr_invalid: 'קוד QR לא תקין',
  project_not_found: 'פרויקט לא נמצא מקוד QR',
  building_not_found: 'בניין לא נמצא בחיפוש',
  building_multiple_matches: 'כמה בניינים תואמים — רשימת בחירה ({{list}})',
  technical_error: 'שגיאה טכנית',
  selection_invalid: 'בחירה לא תקינה (מחוץ לטווח 1-3)',
  session_created: 'סשן נוצר — בקשת תיאור תקלה ({{project_name}}, {{building_line}})',
  resident_prompt: 'דייר מוכר — בקשת תיאור תקלה',
  duplicate_ticket: 'תקלה כפולה ({{ticket_number}})',
  no_open_tickets: 'אין תקלות פתוחות (תגובה לשאלת סטטוס)',
  ticket_status_list: 'סטטוס תקלות פתוחות ({{list}})',
  sla_escalation_resident: 'SLA — עדכון לדייר (תקלה עדיין בטיפול)',
  pending_approval_note: 'הערת אישור מנהלת (נוספת לסוף אישור תקלה)',
}

// ─────────────────────────────────────────────────────────────
// SMS Templates (stored in same whatsapp_templates table)
// ─────────────────────────────────────────────────────────────

export const SMS_TEMPLATE_KEYS = [
  'sms_manager_new_ticket',
  'sms_worker_new_ticket',
  'sms_manager_ticket_closed',
  'sms_resident_ticket_closed',
] as const

export type SmsTemplateKey = (typeof SMS_TEMPLATE_KEYS)[number]

export const SMS_TEMPLATE_VAR_NAMES = [
  'project_name',
  'ticket_number',
  'description',
  'reporter_name',
  'building_line',
  'dashboard_url',
  'client_name',
] as const

export const SMS_TEMPLATE_LABELS: Record<SmsTemplateKey, string> = {
  sms_manager_new_ticket: 'SMS למנהל/ת — תקלה חדשה',
  sms_worker_new_ticket: 'SMS לעובד — תקלה חדשה',
  sms_manager_ticket_closed: 'SMS למנהל/ת — תקלה נסגרה',
  sms_resident_ticket_closed: 'SMS לדייר — תקלה נסגרה (גיבוי)',
}

export const SMS_TEMPLATE_WHEN_SENT: Record<SmsTemplateKey, string> = {
  sms_manager_new_ticket: 'נשלח למנהל/ת כשנפתחת תקלה חדשה דרך וואטסאפ',
  sms_worker_new_ticket: 'נשלח לעובד המשויך לפרויקט כשנפתחת תקלה חדשה',
  sms_manager_ticket_closed: 'נשלח למנהל/ת כשתקלה נסגרת מהדשבורד',
  sms_resident_ticket_closed:
    'נשלח לדייר כשסגירת תקלה ב-WhatsApp נכשלת (למשל מחוץ לחלון 24 שעות ללא תבנית מאושרת)',
}

export const SMS_TEMPLATE_EDITOR_DEFAULTS: Record<SmsTemplateKey, string> = {
  sms_manager_new_ticket:
    'נפתחה תקלה חדשה\nפרויקט: {{project_name}}\n{{building_line}}תקלה: #{{ticket_number}}\nתיאור: {{description}}\nמדווח: {{reporter_name}}\nכניסה למערכת:\n{{dashboard_url}}\n{{client_name}}',
  sms_worker_new_ticket:
    'תקלה חדשה ב{{project_name}}\n#{{ticket_number}}\n{{description}}\nמדווח: {{reporter_name}}\n{{dashboard_url}}\n{{client_name}}',
  sms_manager_ticket_closed:
    'תקלה #{{ticket_number}} נסגרה\nפרויקט: {{project_name}}',
  sms_resident_ticket_closed:
    'שלום! התקלה שדיווחת בבניין {{project_name}} טופלה וסגורה.\n\nאם יש בעיה נוספת, ניתן לפנות אלינו בכל עת.',
}

/** טקסט ברירת מחדל לטעינה ראשונית בעורך (כשאין שורה ב-DB) — עברית | français | English */
export const WHATSAPP_TEMPLATE_EDITOR_DEFAULTS: Record<WhatsAppTemplateKey, string> = {
  choose_language: joinTrilingualTemplate(
    'בחרו שפה:',
    'Choisissez votre langue:',
    'Choose your language:'
  ),
  ask_building: joinTrilingualTemplate(
    '📍 כתבו כתובת הבניין (רחוב ומספר):',
    '📍 Adresse du bâtiment (rue et numéro):',
    '📍 Building address (street and number):'
  ),
  last_project_confirm: joinTrilingualTemplate(
    'לדווח שוב על {{project_name}}?',
    'Signaler à nouveau pour {{project_name}} ?',
    'Report again for {{project_name}}?'
  ),
  building_list_body: joinTrilingualTemplate(
    'בחרו בניין:',
    'Choisissez un immeuble:',
    'Choose a building:'
  ),
  clarification_reply: joinTrilingualTemplate(
    'כתבו בקצרה מה הבעיה (למשל: נזילה). אפשר גם תמונה.',
    'Décrivez brièvement le problème (ex: fuite). Photo possible.',
    'Briefly describe the issue (e.g. leak). You can send a photo.'
  ),
  welcome: joinTrilingualTemplate(
    'לדיווח תקלה: כתבו בטקסט את תיאור הבעיה, או סרקו את קוד ה־QR בבניין.\n' +
      'אחרי שנפתחה פנייה – אפשר לשלוח גם תמונה או סרטון של התקלה.',
    'Pour signaler un problème : décrivez-le par texte ou scannez le code QR du bâtiment.\n' +
      'Après l\'ouverture d\'une demande, vous pouvez aussi envoyer une photo ou une vidéo.',
    'To report an issue: describe it in text, or scan the building QR code.\n' +
      'After a request is opened, you can also send a photo or video of the issue.'
  ),
  ticket_opened: joinTrilingualTemplate(
    '✅ תקלה #{{ticket_number}} נפתחה{{building_line}}\n{{description}}\n\n📷 אפשר לשלוח תמונה או סרטון עכשיו.',
    '✅ Ticket #{{ticket_number}} ouvert{{building_line}}\n{{description}}\n\n📷 Vous pouvez envoyer une photo ou vidéo.',
    '✅ Ticket #{{ticket_number}} opened{{building_line}}\n{{description}}\n\n📷 You can send a photo or video now.'
  ),
  ticket_closed: joinTrilingualTemplate(
    '✅ שלום! התקלה שדיווחת בבניין {{project_name}} טופלה וסגורה.\n\n' +
      'אם יש בעיה נוספת, ניתן לפנות אלינו בכל עת 🙏',
    'Bonjour ! Le problème signalé dans {{project_name}} a été traité et clos.\n\n' +
      'Pour tout autre problème, contactez-nous à tout moment.',
    'Hello! The issue you reported in {{project_name}} has been resolved and closed.\n\n' +
      'If you have another problem, you can contact us at any time.'
  ),
  worker_assigned:
    'תקלה חדשה ב{{project_name}}\n' +
    'מספר: #{{ticket_number}}\n' +
    '{{description}}\n' +
    'מדווח: {{reporter_name}}',
  error_general: joinTrilingualTemplate(
    '⚠️ אירעה שגיאה. אנא נסו שוב או פנו למנהלת הבניין.',
    'Une erreur s\'est produite. Veuillez réessayer ou contacter la gestionnaire du bâtiment.',
    'An error occurred. Please try again or contact the building manager.'
  ),

  // מיקום
  location_attached: joinTrilingualTemplate(
    '📍 קיבלנו את המיקום וצירפנו אותו לתקלה.',
    'Nous avons reçu votre position et l\'avons ajoutée à la demande.',
    'We received your location and attached it to the request.'
  ),
  location_stashed: joinTrilingualTemplate(
    '📍 קיבלנו את המיקום!\nכתבו עכשיו בקצרה את תיאור התקלה — נשלב את המיקום בפנייה.',
    'Nous avons reçu votre position !\nDécrivez brièvement le problème — nous l\'ajouterons à la demande.',
    'We received your location!\nPlease briefly describe the issue — we will include the location in the request.'
  ),
  location_error: joinTrilingualTemplate(
    'לא הצלחנו לקרוא את פרטי המיקום — נסו שוב או שלחו כתובת בטקסט.',
    'Impossible de lire la position. Réessayez ou envoyez l\'adresse par texte.',
    'We could not read the location details. Please try again or send the address as text.'
  ),

  // תמונה / סרטון (אותן תבניות לשני הסוגים)
  image_attached: joinTrilingualTemplate(
    'הקובץ התקבל בהצלחה וצורף לתקלה. צוות הטכנאים יטפל בבקשתך בהקדם.',
    'Le fichier a bien été reçu et ajouté à la demande. Notre équipe s\'en occupe rapidement.',
    'The file was received and attached to the request. Our team will handle it soon.'
  ),
  image_failed: joinTrilingualTemplate(
    'לא הצלחנו להוסיף את הקובץ, אך התקלה שלך נשמרה.\n\nנעדכן כשיהיה טיפול.',
    'Nous n\'avons pas pu ajouter le fichier, mais votre demande est enregistrée.\n\nNous vous tiendrons informés.',
    'We could not attach the file, but your request was saved.\n\nWe will update you when there is progress.'
  ),
  image_stashed: joinTrilingualTemplate(
    'קיבלנו את הקובץ!\n\nכדי לצרף אותו לתקלה, כתבו עכשיו בקצרה את תיאור התקלה בטקסט.',
    'Nous avons reçu le fichier !\n\nPour l\'ajouter à la demande, décrivez brièvement le problème par texte.',
    'We received the file!\n\nTo attach it to the request, please briefly describe the issue in text.'
  ),

  // לא בשימוש — סרטון משתמש באותן תבניות image_*
  video_attached: joinTrilingualTemplate(
    'הקובץ התקבל בהצלחה וצורף לתקלה. צוות הטכנאים יטפל בבקשתך בהקדם.',
    'Le fichier a bien été reçu et ajouté à la demande. Notre équipe s\'en occupe rapidement.',
    'The file was received and attached to the request. Our team will handle it soon.'
  ),
  video_failed: joinTrilingualTemplate(
    'לא הצלחנו להוסיף את הקובץ, אך התקלה שלך נשמרה.\n\nנעדכן כשיהיה טיפול.',
    'Nous n\'avons pas pu ajouter le fichier, mais votre demande est enregistrée.\n\nNous vous tiendrons informés.',
    'We could not attach the file, but your request was saved.\n\nWe will update you when there is progress.'
  ),
  video_stashed: joinTrilingualTemplate(
    'קיבלנו את הקובץ!\n\nכדי לצרף אותו לתקלה, כתבו עכשיו בקצרה את תיאור התקלה בטקסט.',
    'Nous avons reçu le fichier !\n\nPour l\'ajouter à la demande, décrivez brièvement le problème par texte.',
    'We received the file!\n\nTo attach it to the request, please briefly describe the issue in text.'
  ),

  // סוגים לא נתמכים
  redirect_to_text: joinTrilingualTemplate(
    'לדיווח תקלה שלחו הודעת טקסט 📝',
    'Pour signaler un problème, envoyez un message texte.',
    'To report an issue, please send a text message.'
  ),
  unsupported_message: joinTrilingualTemplate(
    'לא הצלחנו לקרוא את ההודעה — נסו שוב בטקסט.',
    'Nous n\'avons pas pu lire le message — réessayez en texte.',
    'We could not read the message — please try again with text.'
  ),

  // QR / חיפוש בניין
  qr_invalid: joinTrilingualTemplate(
    'פורמט קוד ה-QR לא תקין. אנא סרקו שוב את הקוד או פנו למנהלת הבניין.',
    'Code QR invalide. Veuillez scanner à nouveau ou contacter la gestionnaire du bâtiment.',
    'Invalid QR code format. Please scan again or contact the building manager.'
  ),
  project_not_found: joinTrilingualTemplate(
    '❌ לא הצלחנו לזהות את הפרויקט.\n\nנסו שוב:\n1️⃣ סרקו את QR מחדש\n2️⃣ או כתבו את כתובת הבניין (רחוב ומספר)\n3️⃣ או צרו קשר למנהלת הבניין',
    'Nous n\'avons pas pu identifier le projet.\n\nRéessayez :\n1. Scannez le QR à nouveau\n2. Ou indiquez l\'adresse du bâtiment\n3. Ou contactez la gestionnaire',
    'We could not identify the project.\n\nTry again:\n1. Scan the QR code again\n2. Or send the building address\n3. Or contact the building manager'
  ),
  building_not_found: joinTrilingualTemplate(
    'לא הצלחנו לזהות את הבניין.\n\n📍 כדי שנוכל לאתר אותו, כתבו את כתובת הבניין (רחוב ומספר)\n\nאו:\n1. סרקו את קוד ה-QR בבניין\n2. פנו למנהלת הבניין לקבלת קוד הגישה',
    'Nous n\'avons pas pu identifier le bâtiment.\n\nIndiquez l\'adresse (rue et numéro)\n\nOu :\n1. Scannez le QR dans le bâtiment\n2. Contactez la gestionnaire pour un code d\'accès',
    'We could not identify the building.\n\nPlease send the address (street and number)\n\nOr:\n1. Scan the QR code in the building\n2. Contact the building manager for an access code'
  ),
  building_multiple_matches: joinTrilingualTemplate(
    'מצאנו כמה בניינים תואמים:\n\n{{list}}\n📌 להמשך, השיבו רק עם מספר האפשרות: 1, 2 או 3',
    'Plusieurs bâtiments correspondent :\n\n{{list}}\nRépondez uniquement avec le numéro : 1, 2 ou 3',
    'We found several matching buildings:\n\n{{list}}\nPlease reply with the option number: 1, 2, or 3'
  ),
  technical_error: joinTrilingualTemplate(
    'תקלה טכנית. אנא סרקו את קוד ה-QR בבניין או פנו למנהלת הבניין.',
    'Erreur technique. Scannez le QR du bâtiment ou contactez la gestionnaire.',
    'Technical error. Please scan the building QR code or contact the building manager.'
  ),
  selection_invalid: joinTrilingualTemplate(
    'לא הצלחנו לצמצם לבניין אחד.\n\nבחרו מהרשימה «בחר בניין», השיבו 1/2/3, או כתבו כתובת מדויקת יותר (למשל: אלרואי 5 ג).',
    'Nous n\'avons pas pu cibler un seul bâtiment.\n\nChoisissez dans la liste, répondez 1/2/3, ou précisez l\'adresse (ex. : Alroey 5 G).',
    'We could not narrow down to one building.\n\nPick from the list, reply 1/2/3, or send a more specific address (e.g. Alroey 5 G).'
  ),

  // זרימת תקלה
  session_created: joinTrilingualTemplate(
    '{{project_name}}{{building_line}} — מה הבעיה? 📝',
    '{{project_name}}{{building_line}} — quel est le problème ? 📝',
    '{{project_name}}{{building_line}} — what is the issue? 📝'
  ),
  resident_prompt: joinTrilingualTemplate(
    'מה הבעיה? 📝',
    'Quel est le problème ? 📝',
    'What is the issue? 📝'
  ),
  duplicate_ticket: joinTrilingualTemplate(
    'קיבלנו כבר את הדיווח שלך, מספר תקלה: {{ticket_number}}. נעדכן אותך בהתקדמות.',
    'Nous avons déjà reçu votre signalement, demande n° {{ticket_number}}. Nous vous tiendrons informés.',
    'We already received your report, request #{{ticket_number}}. We will keep you updated.'
  ),
  no_open_tickets: joinTrilingualTemplate(
    'לא מצאנו תקלה פתוחה המקושרת למספר שלך במערכת. לפתיחת פנייה כתבו את הבניין או סרקו את קוד ה־QR.',
    'Aucune demande ouverte pour votre numéro. Pour en ouvrir une, indiquez le bâtiment ou scannez le QR.',
    'No open request is linked to your number. To open one, send the building name or scan the QR code.'
  ),
  ticket_status_list: joinTrilingualTemplate(
    'התקלות הפתוחות שלך:\n\n{{list}}',
    'Vos demandes ouvertes :\n\n{{list}}',
    'Your open requests:\n\n{{list}}'
  ),
  sla_escalation_resident: joinTrilingualTemplate(
    'שלום, הפנייה שלך #{{ticket_number}} בנושא "{{description}}" עדיין בטיפול.\n' +
      'אנחנו מטפלים בה. תודה על הסבלנות.',
    'Bonjour, votre demande #{{ticket_number}} concernant « {{description}} » est toujours en cours.\n' +
      'Nous nous en occupons. Merci de votre patience.',
    'Hello, your request #{{ticket_number}} about "{{description}}" is still being handled.\n' +
      'We are working on it. Thank you for your patience.'
  ),
  pending_approval_note: joinTrilingualTemplate(
    '\n\nℹ️ מספר הטלפון שלכם עדיין לא מופיע ברשימת הדיירים של הבניין — הבקשה נשמרה לאישור המנהלת. אחרי האישור תופיעו ברשימה.',
    '\n\nVotre numéro n\'est pas encore sur la liste des résidents — la demande est en attente d\'approbation de la gestionnaire.',
    '\n\nYour phone number is not yet on the residents list — the request is saved pending manager approval.'
  ),
}
