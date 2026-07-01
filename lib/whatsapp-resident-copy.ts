import type { ResidentLang } from '@/lib/whatsapp-bilingual-template'

export const RESIDENT_UI_COPY: Record<
  ResidentLang,
  {
    chooseLanguage: string
    buildingListBody: string
    confirmTicketPrefix: string
    clarificationReply: string
    buildingLine: (buildingNumber: string) => string
    greetingPrefix: (firstName: string | null) => string
  }
> = {
  he: {
    chooseLanguage: 'שלום! בחרו שפה:',
    buildingListBody: 'מצאנו כמה בניינים תואמים. בחרו מהרשימה:',
    confirmTicketPrefix: 'לאשר פתיחת תקלה?',
    clarificationReply:
      'כתבו בקצרה מה הבעיה (לדוגמה: נזילה במקלחת, דלת לא נסגרת). אפשר גם לשלוח תמונה.',
    buildingLine: (n) => ` (בניין ${n})`,
    greetingPrefix: (name) => (name ? `שלום ${name}, ` : 'שלום, '),
  },
  fr: {
    chooseLanguage: 'Bonjour! Choisissez votre langue:',
    buildingListBody: 'Plusieurs immeubles correspondent. Choisissez dans la liste:',
    confirmTicketPrefix: 'Confirmer l\'ouverture du ticket?',
    clarificationReply:
      'Décrivez brièvement le problème (ex: fuite, porte bloquée). Vous pouvez aussi envoyer une photo.',
    buildingLine: (n) => ` (bâtiment ${n})`,
    greetingPrefix: (name) => (name ? `Bonjour ${name}, ` : 'Bonjour, '),
  },
  en: {
    chooseLanguage: 'Hello! Choose your language:',
    buildingListBody: 'We found several matching buildings. Please pick from the list:',
    confirmTicketPrefix: 'Open a maintenance ticket?',
    clarificationReply:
      'Briefly describe the issue (e.g. leak, door stuck). You can also send a photo.',
    buildingLine: (n) => ` (building ${n})`,
    greetingPrefix: (name) => (name ? `Hello ${name}, ` : 'Hello, '),
  },
}

export function residentGreetingPrefix(lang: ResidentLang, fullName: string | null | undefined): string {
  const trimmed = (fullName ?? '').trim()
  if (!trimmed || trimmed === 'דייר WhatsApp') {
    return RESIDENT_UI_COPY[lang].greetingPrefix(null)
  }
  const first = trimmed.split(/\s+/)[0] ?? trimmed
  return RESIDENT_UI_COPY[lang].greetingPrefix(first)
}
