export const WHATSAPP_TEMPLATE_KEYS = [
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

  // ── סוגי הודעות לא נתמכים (2) ────────────────────────────────────
  'redirect_to_text',   // סטיקר / אנשי קשר / שמע / תגובה
  'unsupported_message', // וידאו / מסמך / סוג לא ידוע

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
  'pending_approval_note', // הערת אישור מנהלת (נוספת לסוף ticket_opened)
] as const

export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATE_KEYS)[number]

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
  | 'unsupported'
  | 'building'
  | 'flow'

export const WHATSAPP_TEMPLATE_CATEGORIES: Record<
  WhatsAppTemplateKey,
  WhatsAppTemplateCategory
> = {
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
  pending_approval_note: 'flow',
}

export const WHATSAPP_TEMPLATE_CATEGORY_LABELS: Record<WhatsAppTemplateCategory, string> = {
  general: 'כללי ושגיאות',
  flow: 'זרימת תקלה',
  building: 'חיפוש בניין וקוד QR',
  location: 'הודעות מיקום',
  image: 'הודעות תמונה',
  unsupported: 'סוגי הודעות לא נתמכים',
}

/** כותרת קריאה בעברית לכרטיס בעמוד ההגדרות */
export const WHATSAPP_TEMPLATE_LABELS: Record<WhatsAppTemplateKey, string> = {
  welcome: 'הודעת פתיחה והנחיות (עזרה כללית)',
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
  redirect_to_text: 'הפניה לשימוש בטקסט (סטיקר / שמע / אנשי קשר)',
  unsupported_message: 'סוג הודעה לא נתמך (וידאו / מסמך)',
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
  pending_approval_note: 'הערת אישור מנהלת (נוספת לסוף אישור תקלה)',
}

/** טקסט ברירת מחדל לטעינה ראשונית בעורך (כשאין שורה ב-DB) */
export const WHATSAPP_TEMPLATE_EDITOR_DEFAULTS: Record<WhatsAppTemplateKey, string> = {
  welcome:
    'לדיווח תקלה: כתבו בטקסט את תיאור הבעיה, או סרקו את קוד ה־QR בבניין.\n' +
    'אחרי שנפתחה פנייה – אפשר לשלוח גם תמונה של התקלה.',
  ticket_opened:
    'התקלה התקבלה בהצלחה.{{building_line}}\n' +
    'מספר הפנייה שלך: {{ticket_number}}\n\n' +
    'תיאור: {{description}}\n' +
    'מדווח: {{reporter_name}}\n' +
    'פרויקט: {{project_name}}\n\n' +
    '💡 אפשר גם לשלוח תמונה של התקלה — זה יעזור לנו לטפל בה מהר יותר.\n\n' +
    'נעדכן כשיהיה טיפול.\n' +
    'לפתיחת תקלה נוספת: סרקו שוב את קוד ה־QR בבניין או כתבו רחוב ומספר בניין.',
  ticket_closed:
    '✅ שלום! התקלה שדיווחת בבניין {{project_name}} טופלה וסגורה.\n\n' +
    'אם יש בעיה נוספת, ניתן לפנות אלינו בכל עת 🙏',
  worker_assigned:
    'תקלה חדשה ב{{project_name}}\n' +
    'מספר: #{{ticket_number}}\n' +
    '{{description}}\n' +
    'מדווח: {{reporter_name}}',
  error_general:
    '⚠️ אירעה שגיאה. אנא נסו שוב או פנו למנהלת הבניין.',

  // מיקום
  location_attached:
    '📍 קיבלנו את המיקום וצירפנו אותו לתקלה.',
  location_stashed:
    '📍 קיבלנו את המיקום!\nכתבו עכשיו בקצרה את תיאור התקלה — נשלב את המיקום בפנייה.',
  location_error:
    'לא הצלחנו לקרוא את פרטי המיקום — נסו שוב או שלחו כתובת בטקסט.',

  // תמונה
  image_attached:
    '✅ התמונה התקבלה בהצלחה וצורפה לתקלה. צוות הטכנאים יטפל בבקשתך בהקדם.',
  image_failed:
    '⚠️ לא הצלחנו להוסיף את התמונה, אך התקלה שלך תקבלה.\n\nנעדכן כשיהיה טיפול.',
  image_stashed:
    '🖼️ קיבלנו את התמונה!\n\nכדי לצרף אותה לתקלה, כתבו עכשיו בקצרה את תיאור התקלה בטקסט.',

  // סוגים לא נתמכים
  redirect_to_text:
    'לדיווח תקלה שלחו הודעת טקסט 📝',
  unsupported_message:
    'לא הצלחנו לקרוא את ההודעה — נסו שוב בטקסט.',

  // QR / חיפוש בניין
  qr_invalid:
    'פורמט קוד ה-QR לא תקין. אנא סרקו שוב את הקוד או פנו למנהלת הבניין.',
  project_not_found:
    '❌ לא הצלחנו לזהות את הפרויקט.\n\nנסו שוב:\n1️⃣ סרקו את QR מחדש\n2️⃣ או כתבו את כתובת הבניין (רחוב ומספר)\n3️⃣ או צרו קשר למנהלת הבניין',
  building_not_found:
    'לא הצלחנו לזהות את הבניין.\n\n📍 כדי שנוכל לאתר אותו, כתבו את כתובת הבניין (רחוב ומספר)\n\nאו:\n1. סרקו את קוד ה-QR בבניין\n2. פנו למנהלת הבניין לקבלת קוד הגישה',
  building_multiple_matches:
    'מצאנו כמה בניינים תואמים:\n\n{{list}}\n📌 להמשך, השיבו רק עם מספר האפשרות: 1, 2 או 3',
  technical_error:
    'תקלה טכנית. אנא סרקו את קוד ה-QR בבניין או פנו למנהלת הבניין.',
  selection_invalid:
    'אנא השיבו רק עם מספר האפשרות המתאים: 1, 2 או 3.',

  // זרימת תקלה
  session_created:
    'ברוכים הבאים! כתבו בקצרה את הבעיה ב{{project_name}}{{building_line}} 📝',
  resident_prompt:
    'מה הבעיה? כתבו בקצרה את תיאור התקלה 📝',
  duplicate_ticket:
    'קיבלנו כבר את הדיווח שלך, מספר תקלה: {{ticket_number}}. נעדכן אותך בהתקדמות.',
  no_open_tickets:
    'לא מצאנו תקלה פתוחה המקושרת למספר שלך במערכת. לפתיחת פנייה כתבו את הבניין או סרקו את קוד ה־QR.',
  pending_approval_note:
    '\n\nℹ️ מספר הטלפון שלכם עדיין לא מופיע ברשימת הדיירים של הבניין — הבקשה נשמרה לאישור המנהלת. אחרי האישור תופיעו ברשימה.',
}
