import type { ResidentLang } from '@/lib/whatsapp-bilingual-template'

export const RESIDENT_UI_COPY: Record<
  ResidentLang,
  {
    chooseLanguage: string
    buildingListBody: string
    confirmTicketPrefix: string
    askBuilding: string
    clarificationReply: string
    buildingLine: (buildingNumber: string) => string
    greetingPrefix: (firstName: string | null) => string
  }
> = {
  he: {
    chooseLanguage: 'בחרו שפה:',
    askBuilding: '📍 כתבו כתובת הבניין (רחוב ומספר):',
    buildingListBody: 'בחרו בניין:',
    confirmTicketPrefix: 'לאשר פתיחת תקלה?',
    clarificationReply:
      'כתבו בקצרה מה הבעיה (לדוגמה: נזילה במקלחת, דלת לא נסגרת). אפשר גם לשלוח תמונה.',
    buildingLine: (n) => ` (בניין ${n})`,
    greetingPrefix: (name) => (name ? `שלום ${name}, ` : 'שלום, '),
  },
  fr: {
    chooseLanguage: 'Choisissez votre langue:',
    askBuilding: '📍 Adresse du bâtiment (rue et numéro):',
    buildingListBody: 'Choisissez un immeuble:',
    confirmTicketPrefix: 'Confirmer l\'ouverture du ticket?',
    clarificationReply:
      'Décrivez brièvement le problème (ex: fuite, porte bloquée). Vous pouvez aussi envoyer une photo.',
    buildingLine: (n) => ` (bâtiment ${n})`,
    greetingPrefix: (name) => (name ? `Bonjour ${name}, ` : 'Bonjour, '),
  },
  en: {
    chooseLanguage: 'Choose your language:',
    askBuilding: '📍 Building address (street and number):',
    buildingListBody: 'Choose a building:',
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
