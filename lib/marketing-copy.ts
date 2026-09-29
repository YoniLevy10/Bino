export type MarketingLocale = 'he' | 'en'

export const MARKETING_LOCALE_STORAGE_KEY = 'bino.marketing.locale'

type MetricCopy = {
  label: string
  before: string
  after: string
  note: string
}

type ShotCopy = {
  src: string
  alt: string
  caption: string
}

type StepCopy = {
  title: string
  body: string
}

type FaqCopy = {
  q: string
  a: string
}

export type MarketingCopy = {
  dir: 'rtl' | 'ltr'
  lang: MarketingLocale
  brand: string
  headline: string
  support: string
  ctaDemo: string
  ctaLogin: string
  langSwitchAria: string
  langHe: string
  langEn: string
  showcaseTitle: string
  showcaseLead: string
  shots: readonly ShotCopy[]
  metricsTitle: string
  metricsLead: string
  sampleNote: string
  metrics: readonly MetricCopy[]
  metricsMore: string
  howTitle: string
  howLead: string
  steps: readonly StepCopy[]
  faqTitle: string
  faqLead: string
  faq: readonly FaqCopy[]
  closingTitle: string
  footerTagline: string
  privacy: string
  terms: string
  contact: string
  guides: string
  waDemoText: string
}

const HE: MarketingCopy = {
  dir: 'rtl',
  lang: 'he',
  brand: 'BINO',
  headline: 'זיכרון תפעולי חכם לכל בניין',
  support:
    'לחברות ניהול בישראל: לא עוד מערכת תקלות. BINO לומדת מההיסטוריה, מחליטה מי מטפל, מונעת כשלים חוזרים ומוכיחה חיסכון.',
  ctaDemo: 'לתיאום הדגמה בוואטסאפ',
  ctaLogin: 'כניסה למערכת',
  langSwitchAria: 'בחירת שפה',
  langHe: 'עברית',
  langEn: 'English',
  showcaseTitle: 'כך נראה המודיעין התפעולי',
  showcaseLead: 'לא רשימת תקלות — זיכרון שממליץ, מתריע ומוכיח כמה זמן וכסף נחסכו.',
  shots: [
    {
      src: '/marketing/ops-memory.png',
      alt: 'מסך זיכרון תפעולי של BINO: היסטוריית תקלות, ציוד ותובנות לבניין',
      caption: 'זיכרון תפעולי לכל בניין',
    },
    {
      src: '/marketing/smart-assign.png',
      alt: 'מסך שיוך חכם ב־BINO: המלצה על העובד המתאים לפי היסטוריית הבניין',
      caption: 'המלצה אוטומטית לעובד או ספק',
    },
    {
      src: '/marketing/savings-proof.png',
      alt: 'דוח חיסכון של BINO עם מדדי כוכב צפוני לפני ואחרי — נתוני דוגמה',
      caption: 'הוכחת חיסכון לחברת הניהול',
    },
  ],
  metricsTitle: 'המדדים שמנחים את המוצר',
  metricsLead: 'כל פיצ׳ר ב־BINO נמדד לפי מה שחשוב לתפעול בניינים — לא לפי כמה תקלות נפתחו.',
  sampleNote: 'מספרי דוגמה להמחשה — לא נתוני לקוח אמיתי.',
  metrics: [
    { label: 'זמן עד שיוך', before: '48 דק׳', after: '12 דק׳', note: 'ירידה של ~75%' },
    { label: 'זמן עד פתרון', before: '36 שעות', after: '14 שעות', note: 'ירידה של ~61%' },
    { label: 'שיעור תקלות חוזרות', before: '28%', after: '11%', note: 'פחות כשלים חוזרים' },
    {
      label: 'עלות תחזוקה לבניין',
      before: '₪4,800 / חודש',
      after: '₪3,100 / חודש',
      note: 'חיסכון ~₪1,700 לבניין',
    },
    {
      label: 'אחוז התקלות שטופלו ללא התערבות מנהל',
      before: '22%',
      after: '67%',
      note: 'פחות עומס על המנהל',
    },
  ],
  metricsMore: 'צפו בדוח החיסכון לדוגמה',
  howTitle: 'איך זה עובד',
  howLead: 'שלושה שלבים ממערכת שמתעדת עבודה — למערכת שמקבלת החלטות.',
  steps: [
    {
      title: 'לומדים את הבניין',
      body: 'BINO בונה זיכרון תפעולי מהיסטוריית תקלות, ציוד, ספקים, עלויות וזמני טיפול — לכל בניין בנפרד.',
    },
    {
      title: 'ממליצים ומקצרים החלטות',
      body: 'המערכת ממליצה על העובד או הספק המתאים, מזהה תקלות חוזרות ומתריעה מוקדם על חריגות SLA.',
    },
    {
      title: 'מוכיחים חיסכון',
      body: 'חברת הניהול רואה כמה זמן וכסף נחסכו — לא רק רשימת תקלות, אלא מדדים שמניעים החלטות.',
    },
  ],
  faqTitle: 'שאלות נפוצות',
  faqLead: 'מה מבדיל את BINO ממערכת תקלות רגילה — ולמה זה חשוב לחברת ניהול.',
  faq: [
    {
      q: 'במה BINO שונה ממערכת פתיחת תקלות?',
      a: 'BINO בונה זיכרון תפעולי לכל בניין: לומדת מהיסטוריה, ממליצה על עובד או ספק, מזהה תקלות חוזרות ומוכיחה חיסכון בזמן וכסף — לא רק מתעדת עבודה.',
    },
    {
      q: 'אילו מדדים BINO מציגה להנהלה?',
      a: 'זמן עד שיוך, זמן עד פתרון, שיעור תקלות חוזרות, עלות תחזוקה לבניין, ואחוז התקלות שטופלו ללא התערבות מנהל.',
    },
    {
      q: 'איך דיירים מדווחים?',
      a: 'דרך WhatsApp או טופס ווב אחרי סריקת QR לפרויקט. המנהל מקבל את התקלה עם הקשר תפעולי של הבניין.',
    },
    {
      q: 'האם אפשר להתחיל בהדגמה?',
      a: 'כן — תיאמו הדגמה בוואטסאפ ונראה את BINO על בניין לדוגמה עם זיכרון תפעולי ומדדי חיסכון.',
    },
  ],
  closingTitle: 'מוכנים לראות BINO על הבניינים שלכם?',
  footerTagline: 'BINO — Building Intelligence & Operations',
  privacy: 'פרטיות',
  terms: 'תקנון',
  contact: 'יצירת קשר',
  guides: 'מדריכים',
  waDemoText: 'שלום, אני מעוניין/ת בהדגמה של BINO — מערכת הזיכרון התפעולי לבניינים',
}

const EN: MarketingCopy = {
  dir: 'ltr',
  lang: 'en',
  brand: 'BINO',
  headline: 'Smart operational memory for every building',
  support:
    'Not another ticketing system. BINO learns from history, decides who handles it, prevents recurring failures, and proves savings for the management company.',
  ctaDemo: 'Book a WhatsApp demo',
  ctaLogin: 'Sign in',
  langSwitchAria: 'Language',
  langHe: 'עברית',
  langEn: 'English',
  showcaseTitle: 'Operational intelligence, visible',
  showcaseLead: 'Not a fault list — memory that recommends, alerts, and proves time and money saved.',
  shots: [
    {
      src: '/marketing/ops-memory.png',
      alt: 'BINO operational memory screen: ticket history, equipment, and building insights',
      caption: 'Operational memory per building',
    },
    {
      src: '/marketing/smart-assign.png',
      alt: 'BINO smart assignment screen recommending the right worker from building history',
      caption: 'Auto-recommend worker or vendor',
    },
    {
      src: '/marketing/savings-proof.png',
      alt: 'BINO savings report with north-star metrics before and after — sample data',
      caption: 'Proof of savings for management',
    },
  ],
  metricsTitle: 'The metrics that steer the product',
  metricsLead: 'Every BINO feature is judged by what matters for building ops — not by how many tickets were opened.',
  sampleNote: 'Sample figures for illustration — not a real customer dataset.',
  metrics: [
    { label: 'Time to assignment', before: '48 min', after: '12 min', note: '~75% faster' },
    { label: 'Time to resolution', before: '36 hrs', after: '14 hrs', note: '~61% faster' },
    { label: 'Recurring-failure rate', before: '28%', after: '11%', note: 'Fewer repeat failures' },
    {
      label: 'Maintenance cost per building',
      before: '₪4,800 / mo',
      after: '₪3,100 / mo',
      note: '~₪1,700 saved per building',
    },
    {
      label: '% handled without manager intervention',
      before: '22%',
      after: '67%',
      note: 'Less load on the manager',
    },
  ],
  metricsMore: 'See the sample savings report',
  howTitle: 'How it works',
  howLead: 'Three steps from a system that records work — to one that makes decisions.',
  steps: [
    {
      title: 'Learn the building',
      body: 'BINO builds operational memory from tickets, equipment, vendors, costs, and resolution times — per building.',
    },
    {
      title: 'Recommend and decide faster',
      body: 'It recommends the right worker or vendor, spots recurring failures, and alerts early on SLA risk.',
    },
    {
      title: 'Prove the savings',
      body: 'The management company sees how much time and money were saved — metrics that drive decisions, not just a log.',
    },
  ],
  faqTitle: 'FAQ',
  faqLead: 'What makes BINO different from a regular ticketing system — and why management companies care.',
  faq: [
    {
      q: 'How is BINO different from a ticketing system?',
      a: 'BINO builds operational memory per building: it learns from history, recommends the right worker or vendor, detects recurring failures, and proves time and money saved — it does not just log work.',
    },
    {
      q: 'Which metrics does BINO show leadership?',
      a: 'Time to assignment, time to resolution, recurring-failure rate, maintenance cost per building, and % of tickets handled without manager intervention.',
    },
    {
      q: 'How do residents report issues?',
      a: 'Via WhatsApp or a web form after scanning a building QR. Managers get the ticket with that building’s operational context.',
    },
    {
      q: 'Can we start with a demo?',
      a: 'Yes — book a WhatsApp demo and we will walk through BINO on a sample building with operational memory and savings metrics.',
    },
  ],
  closingTitle: 'Ready to see BINO on your buildings?',
  footerTagline: 'BINO — Building Intelligence & Operations',
  privacy: 'Privacy',
  terms: 'Terms',
  contact: 'Contact',
  guides: 'Guides',
  waDemoText: 'Hi — I would like a demo of BINO, the operational memory system for buildings',
}

export const MARKETING_COPY: Record<MarketingLocale, MarketingCopy> = {
  he: HE,
  en: EN,
}

export function waDemoUrl(locale: MarketingLocale): string {
  return 'https://wa.me/972548102688?text=' + encodeURIComponent(MARKETING_COPY[locale].waDemoText)
}

export function readStoredMarketingLocale(): MarketingLocale {
  if (typeof window === 'undefined') return 'he'
  try {
    const raw = window.localStorage.getItem(MARKETING_LOCALE_STORAGE_KEY)
    if (raw === 'en' || raw === 'he') return raw
  } catch {
    /* ignore */
  }
  return 'he'
}

export function storeMarketingLocale(locale: MarketingLocale): void {
  try {
    window.localStorage.setItem(MARKETING_LOCALE_STORAGE_KEY, locale)
  } catch {
    /* ignore */
  }
}
