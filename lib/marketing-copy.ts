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
  audienceTitle: string
  audienceLead: string
  audienceBody: readonly string[]
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
  headline: 'זיכרון תפעולי לכל פרויקט, בניין ושטח',
  support:
    'מערכת ניהול פרויקטים, בניינים ושטחים לחברות ניהול בישראל — לא תוכנת ועד בלבד ולא עוד מערכת תקלות. BINO לומדת את האתר, מחליטה מי מטפל, מונעת כשלים חוזרים ומוכיחה חיסכון.',
  ctaDemo: 'לתיאום הדגמה בוואטסאפ',
  ctaLogin: 'כניסה למערכת',
  langSwitchAria: 'בחירת שפה',
  langHe: 'עברית',
  langEn: 'English',
  audienceTitle: 'למי מיועדת מערכת ניהול הפרויקטים של BINO',
  audienceLead:
    'לחברות ניהול שמתפעלות פורטפוליו של בניינים, מתחמים ושטחים משותפים — ורוצות מודיעין תפעולי, לא עוד יומן תקלות.',
  audienceBody: [
    'BINO בונה זיכרון תפעולי לכל פרויקט ואתר: היסטוריית תקלות, ציוד, ספקים, עלויות וזמני טיפול. מהזיכרון הזה נגזרות המלצות לעובד או ספק, זיהוי תקלות חוזרות, והתראות לפני חריגת SLA — כדי לקצר זמן עד שיוך וזמן עד פתרון.',
    'זו לא תוכנת ועד בית בלבד וגם לא לוח משימות גנרי. הבידול הוא החלטות על תחזוקה ונכסים: פחות התערבות מנהל בכל קריאה, פחות כשלים שחוזרים, והוכחה כמה זמן וכסף נחסכו על הבניינים והשטחים שבאחריותכם.',
  ],
  showcaseTitle: 'מערכת ניהול פרויקטים עם מודיעין תפעולי',
  showcaseLead:
    'לא רשימת תקלות לוועד — זיכרון לכל פרויקט, בניין ושטח שממליץ, מתריע ומוכיח כמה זמן וכסף נחסכו.',
  shots: [
    {
      src: '/marketing/ops-memory.webp',
      alt: 'מסך זיכרון תפעולי של BINO: היסטוריית תקלות, ציוד ותובנות לפרויקט ובניין',
      caption: 'זיכרון תפעולי לכל פרויקט ושטח',
    },
    {
      src: '/marketing/smart-assign.webp',
      alt: 'מסך שיוך חכם ב־BINO: המלצה על העובד המתאים לפי היסטוריית האתר',
      caption: 'המלצה אוטומטית לעובד או ספק',
    },
    {
      src: '/marketing/savings-proof.webp',
      alt: 'דוח חיסכון של BINO עם מדדי כוכב צפוני לפני ואחרי — נתוני דוגמה',
      caption: 'הוכחת חיסכון לחברת הניהול',
    },
  ],
  metricsTitle: 'המדדים שמנחים את המוצר',
  metricsLead:
    'כל פיצ׳ר ב־BINO נמדד לפי מה שחשוב לתפעול פרויקטים, בניינים ושטחים — לא לפי כמה תקלות נפתחו.',
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
  howTitle: 'איך עובדת מערכת ניהול בניינים ושטחים חכמה',
  howLead:
    'שלושה שלבים ממערכת תקלות או ועד — למערכת ניהול פרויקטים ובניינים שמקבלת החלטות.',
  steps: [
    {
      title: 'לומדים את האתר',
      body: 'BINO בונה זיכרון תפעולי מהיסטוריית תקלות, ציוד, ספקים, עלויות וזמני טיפול — לכל פרויקט, בניין או שטח בנפרד.',
    },
    {
      title: 'ממליצים ומקצרים החלטות',
      body: 'המערכת ממליצה על העובד או הספק המתאים, מזהה תקלות חוזרות ומתריעה מוקדם על חריגות SLA.',
    },
    {
      title: 'מוכיחים חיסכון',
      body: 'חברת הניהול רואה כמה זמן וכסף נחסכו על הפורטפוליו — לא רק רשימת תקלות, אלא מדדים שמניעים החלטות.',
    },
  ],
  faqTitle: 'שאלות נפוצות',
  faqLead: 'מה מבדיל את BINO ממערכת תקלות או תוכנת ועד — ולמה זה חשוב לחברת ניהול.',
  faq: [
    {
      q: 'במה BINO שונה ממערכת פתיחת תקלות?',
      a: 'BINO בונה זיכרון תפעולי לכל פרויקט ובניין: לומדת מהיסטוריה, ממליצה על עובד או ספק, מזהה תקלות חוזרות ומוכיחה חיסכון בזמן וכסף — לא רק מתעדת עבודה.',
    },
    {
      q: 'האם BINO מיועדת רק לוועד בית?',
      a: 'לא. BINO מיועדת לחברות ניהול שמתפעלות פרויקטים, בניינים ושטחים — מגורים, מתחמים ושטחים משותפים. גבייה היא יכולת נלווית; הבידול הוא מודיעין תפעולי וחיסכון מוכח.',
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
  closingTitle: 'מוכנים לראות BINO על הפרויקטים והשטחים שלכם?',
  footerTagline: 'BINO — Building Intelligence & Operations',
  privacy: 'פרטיות',
  terms: 'תקנון',
  contact: 'יצירת קשר',
  guides: 'מדריכים',
  waDemoText:
    'שלום, אני מעוניין/ת בהדגמה של BINO — זיכרון תפעולי לפרויקטים, בניינים ושטחים',
}

const EN: MarketingCopy = {
  dir: 'ltr',
  lang: 'en',
  brand: 'BINO',
  headline: 'Operational memory for every project, building, and space',
  support:
    'A management system for projects, buildings, and spaces in Israel — not a committee-only app and not another ticketing tool. BINO learns each site, decides who handles it, prevents recurring failures, and proves savings.',
  ctaDemo: 'Book a WhatsApp demo',
  ctaLogin: 'Sign in',
  langSwitchAria: 'Language',
  langHe: 'עברית',
  langEn: 'English',
  audienceTitle: 'Who BINO’s project management system is for',
  audienceLead:
    'Management companies running portfolios of buildings, campuses, and shared spaces — who need operational intelligence, not another fault log.',
  audienceBody: [
    'BINO builds operational memory per project and site: ticket history, equipment, vendors, costs, and resolution times. From that memory it recommends the right worker or vendor, spots recurring failures, and alerts before SLA risk — shortening time to assignment and time to resolution.',
    'It is not committee-only software and not a generic task board. The differentiation is maintenance and asset decisions: less manager intervention on every ticket, fewer repeat failures, and proof of how much time and money were saved across your buildings and spaces.',
  ],
  showcaseTitle: 'A project management system with operational intelligence',
  showcaseLead:
    'Not a committee fault list — memory for every project, building, and space that recommends, alerts, and proves savings.',
  shots: [
    {
      src: '/marketing/ops-memory.webp',
      alt: 'BINO operational memory screen: ticket history, equipment, and building insights',
      caption: 'Operational memory per project and space',
    },
    {
      src: '/marketing/smart-assign.webp',
      alt: 'BINO smart assignment screen recommending the right worker from site history',
      caption: 'Auto-recommend worker or vendor',
    },
    {
      src: '/marketing/savings-proof.webp',
      alt: 'BINO savings report with north-star metrics before and after — sample data',
      caption: 'Proof of savings for management',
    },
  ],
  metricsTitle: 'The metrics that steer the product',
  metricsLead:
    'Every BINO feature is judged by what matters for project, building, and space ops — not by how many tickets were opened.',
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
  howTitle: 'How a smart building and space management system works',
  howLead:
    'Three steps from ticketing or committee software — to a project and building system that decides.',
  steps: [
    {
      title: 'Learn the site',
      body: 'BINO builds operational memory from tickets, equipment, vendors, costs, and resolution times — per project, building, or space.',
    },
    {
      title: 'Recommend and decide faster',
      body: 'It recommends the right worker or vendor, spots recurring failures, and alerts early on SLA risk.',
    },
    {
      title: 'Prove the savings',
      body: 'The management company sees how much time and money were saved across the portfolio — metrics that drive decisions, not just a log.',
    },
  ],
  faqTitle: 'FAQ',
  faqLead: 'What makes BINO different from ticketing or committee-only software — and why management companies care.',
  faq: [
    {
      q: 'How is BINO different from a ticketing system?',
      a: 'BINO builds operational memory per project and building: it learns from history, recommends the right worker or vendor, detects recurring failures, and proves time and money saved — it does not just log work.',
    },
    {
      q: 'Is BINO only for building committees?',
      a: 'No. BINO is for management companies running projects, buildings, and shared spaces. Collections can be part of the stack; the differentiation is operational intelligence and proven savings.',
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
  closingTitle: 'Ready to see BINO on your projects and spaces?',
  footerTagline: 'BINO — Building Intelligence & Operations',
  privacy: 'Privacy',
  terms: 'Terms',
  contact: 'Contact',
  guides: 'Guides',
  waDemoText:
    'Hi — I would like a demo of BINO, operational memory for projects, buildings, and spaces',
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
