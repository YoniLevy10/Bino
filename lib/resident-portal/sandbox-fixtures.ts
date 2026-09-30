/** In-browser sandbox fixtures for resident portal UX review — no DB required. */

export const SANDBOX_RESIDENT = {
  fullName: 'יוני לוי',
  phone: '0548102688',
  apartment: '12',
  role: 'owner' as const,
  projectName: 'מקור חיים 40 (Sandbox)',
  projectCode: 'BMK20-SANDBOX',
  city: 'ירושלים',
  clientName: 'BINO הדגמה',
  contactPhone: '02-1234567',
  contactEmail: 'vaad@sandbox.bino.casa',
}

export const SANDBOX_CHARGES = [
  {
    id: 'sb-charge-1',
    title: 'ועד בית — ספטמבר 2026',
    period_label: '09/2026',
    amount: 450,
    status: 'sent' as const,
    due_date: '2026-09-10',
    can_pay: true,
    is_overdue: true,
    invoice: { available: false, url: null as string | null },
  },
  {
    id: 'sb-charge-2',
    title: 'ועד בית — אוגוסט 2026',
    period_label: '08/2026',
    amount: 450,
    status: 'paid' as const,
    due_date: '2026-08-10',
    can_pay: false,
    is_overdue: false,
    invoice: {
      available: true,
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    },
  },
  {
    id: 'sb-charge-3',
    title: 'תיקון מעלית — השתתפות',
    period_label: 'חד־פעמי',
    amount: 180,
    status: 'paid' as const,
    due_date: '2026-07-20',
    can_pay: false,
    is_overdue: false,
    invoice: {
      available: true,
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    },
  },
]

export const SANDBOX_ANNOUNCEMENTS = [
  {
    id: 'sb-ann-1',
    title: 'עבודות ניקיון בחניון',
    body: 'ביום ראשון יתבצע ניקיון יסודי בחניון התת־קרקעי בין 09:00–13:00. אנא פנו רכבים מהאזור המסומן.',
    is_pinned: true,
  },
  {
    id: 'sb-ann-2',
    title: 'עדכון שעות בריכה',
    body: 'בחגי תשרי הבריכה תפעל לפי לוח מקוצר. פרטים במסך המתקנים.',
    is_pinned: false,
  },
]

export const SANDBOX_DOCUMENTS = [
  {
    id: 'sb-doc-1',
    file_name: 'תקנון הבניין.pdf',
    category: 'תקנון',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  },
  {
    id: 'sb-doc-2',
    file_name: 'פרוטוקול אסיפה — יוני 2026.pdf',
    category: 'פרוטוקול',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  },
  {
    id: 'sb-doc-3',
    file_name: 'ביטוח מבנה — פוליסה.pdf',
    category: 'ביטוח',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  },
]

export const SANDBOX_AMENITIES = [
  {
    id: 'sb-am-1',
    name: 'בריכה',
    today: { source: 'weekly', is_closed: false, opens_at: '07:00', closes_at: '20:00' },
    guidelines: 'חובה מקלחת לפני הכניסה. ילדים רק בליווי מבוגר.',
  },
  {
    id: 'sb-am-2',
    name: 'חדר כושר',
    today: { source: 'weekly', is_closed: false, opens_at: '06:00', closes_at: '22:00' },
    guidelines: 'נא להחזיר משקולות למקום.',
  },
]

export const SANDBOX_TICKETS = [
  {
    id: 'sb-t-1',
    ticket_number: 1042,
    status: 'IN_PROGRESS',
    scope: 'common',
    description: 'תאורת לובי קומה 2 מהבהבת',
    opened_at: '2026-09-20T10:00:00.000Z',
  },
]
