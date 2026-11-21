/**
 * Public /developers landing — discovery hub for Partner API + Cursor MCP.
 * Honest about read-API status: free rate-limited keys are the commercial default;
 * live issuance ships with Partner API P1 (see open-platform plan).
 */

import { getMarketingSiteOrigin } from '@/lib/marketing/marketing-site'

export const DEVELOPERS_PATH = '/developers' as const

export const DEVELOPERS_TITLE_HE =
  'BINO למפתחים — MCP ו־API לזיכרון תפעולי של בניינים | BINO'

export const DEVELOPERS_DESCRIPTION_HE =
  'פלטפורמה פתוחה לחברות ניהול וסוכני AI: MCP ל־Cursor, Partner API לקריאת זיכרון תפעולי, KPI חיסכון והמלצות שיוך — לא רק CRUD של תקלות. מפתחות קריאה בחינם עם מגבלת קצב (בקרוב).'

export const DEVELOPERS_TITLE_EN =
  'BINO for developers — MCP & Partner API for building ops intelligence'

export const DEVELOPERS_DESCRIPTION_EN =
  'Open building-ops platform: Cursor-first MCP and a read Partner API for operational memory, north-star savings KPIs, SLA risk signals, and assignee recommendations — not generic ticket CRUD. Free rate-limited read keys (coming).'

export type DevelopersFaq = { q: string; a: string }

export const DEVELOPERS_FAQ_HE: readonly DevelopersFaq[] = [
  {
    q: 'מה ההבדל בין BINO לבין מערכת תקלות עם API?',
    a: 'מערכת תקלות חושפת פתיחה וסגירה. BINO חושפת זיכרון תפעולי לכל בניין, אותות החלטה (SLA / תקלות חוזרות), המלצת מטפל, ומדדי חיסכון — כדי שסוכן או שותף יקבלו שיפוט, לא רק רשימה.',
  },
  {
    q: 'למי מיועדת שכבת המפתחים?',
    a: 'קודם לפלטפורמות AI (Cursor ואחר כך ChatGPT) ולשותפים ישראליים של חברות ניהול. מגדלים בינלאומיים הם כיוון עיצובי — לא תנועת המכירות הראשונה.',
  },
  {
    q: 'האם יש MCP ל־Cursor כבר היום?',
    a: 'הכיוון נעול: Cursor-first MCP על אותה שכבת הרשאות כמו Partner API. השרת עצמו מגיע אחרי API הקריאה (P1→P2). בינתיים אפשר לתאם גישת שותף ולהתחיל ממדדי הכוכב הצפוני במוצר.',
  },
  {
    q: 'כמה זה עולה?',
    a: 'ברירת המחדל המסחרית: מפתחות קריאה בחינם עם rate limit. שכבה בתשלום תישקל כשיופיעו כתיבות ו־webhooks — לא בגלל פרסום ממומן.',
  },
] as const

export const DEVELOPERS_CAPABILITIES = [
  {
    titleHe: 'זיכרון תפעולי',
    titleEn: 'Ops memory',
    bodyHe: 'הקשר בניין: תקלות פתוחות, מזדקנות ללא שיוך, חוזרות, ואתרים חמים — לקריאה ע״י סוכן או שותף.',
    bodyEn: 'Per-building context: open work, aging unassigned, recurrence, hot sites — readable by agents and partners.',
  },
  {
    titleHe: 'החלטות, לא רק תיעוד',
    titleEn: 'Decisions, not dumps',
    bodyHe: 'אותות SLA, תקלות חוזרות, והמלצת עובד לפי היסטוריה מקומית — בלי auto-assign כפוי ב־MVP.',
    bodyEn: 'SLA risk, recurrence signals, and assignee recommend from local history — no forced auto-assign in MVP.',
  },
  {
    titleHe: 'הוכחת חיסכון',
    titleEn: 'Prove savings',
    bodyHe: 'מדדי כוכב צפוני: זמן עד שיוך / פתרון, שיעור חוזרות, עלות לבניין, אחוז בלי התערבות מנהל.',
    bodyEn: 'North-star KPIs: time to assign/resolve, recurring rate, cost per building, % without manager.',
  },
] as const

export const DEVELOPERS_MCP_TOOLS_PREVIEW = [
  'get_building_ops_memory',
  'get_ops_briefing',
  'get_savings_kpis',
  'list_decision_signals',
  'list_sla_risks',
  'recommend_assignee',
] as const

export function buildDevelopersJsonLd() {
  const origin = getMarketingSiteOrigin()
  const url = `${origin}${DEVELOPERS_PATH}`

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: DEVELOPERS_TITLE_HE,
        description: DEVELOPERS_DESCRIPTION_HE,
        inLanguage: ['he-IL', 'en'],
        isPartOf: { '@type': 'WebSite', name: 'BINO', url: `${origin}/` },
        about: {
          '@type': 'SoftwareApplication',
          name: 'BINO Partner API & MCP',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'ILS',
            description: 'Free rate-limited read API keys (planned commercial default)',
          },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'BINO',
            item: `${origin}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Developers',
            item: url,
          },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: DEVELOPERS_FAQ_HE.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      },
    ],
  }
}
