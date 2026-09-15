import Link from 'next/link'
import './marketing.css'

const WA_DEMO_URL =
  'https://wa.me/972548102688?text=' +
  encodeURIComponent('שלום, אני מעוניין/ת בהדגמה של BINO — מערכת הזיכרון התפעולי לבניינים')

const NORTH_STAR_METRICS = [
  'זמן עד שיוך',
  'זמן עד פתרון',
  'שיעור תקלות חוזרות',
  'עלות תחזוקה לבניין',
  'אחוז התקלות שטופלו ללא התערבות מנהל',
] as const

const HOW_IT_WORKS = [
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
] as const

export function MarketingLanding() {
  return (
    <div className="bino-marketing" lang="he">
      <header className="bino-hero">
        <div className="bino-hero__plane" aria-hidden="true" />
        <div className="bino-hero__inner">
          <h1 className="bino-brand">BINO</h1>
          <p className="bino-headline">זיכרון תפעולי חכם לכל בניין</p>
          <p className="bino-support">
            לא עוד מערכת תקלות. BINO לומדת מההיסטוריה, מחליטה מי מטפל, מונעת כשלים חוזרים ומוכיחה חיסכון לחברת
            הניהול.
          </p>
          <div className="bino-cta">
            <a
              className="bino-cta__primary"
              href={WA_DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              לתיאום הדגמה בוואטסאפ
            </a>
            <Link className="bino-cta__secondary" href="/login">
              כניסה למערכת
            </Link>
          </div>
        </div>
      </header>

      <section className="bino-section" aria-labelledby="bino-metrics-heading">
        <h2 id="bino-metrics-heading" className="bino-section__title">
          המדדים שמנחים את המוצר
        </h2>
        <p className="bino-section__lead">
          כל פיצ׳ר ב־BINO נמדד לפי מה שחשוב לתפעול בניינים — לא לפי כמה תקלות נפתחו.
        </p>
        <ol className="bino-metrics">
          {NORTH_STAR_METRICS.map((label, i) => (
            <li key={label}>
              <span className="bino-metrics__idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="bino-metrics__label">{label}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="bino-section" aria-labelledby="bino-how-heading">
        <h2 id="bino-how-heading" className="bino-section__title">
          איך זה עובד
        </h2>
        <p className="bino-section__lead">שלושה שלבים ממערכת שמתעדת עבודה — למערכת שמקבלת החלטות.</p>
        <ol className="bino-steps">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step.title}>
              <span className="bino-steps__num">שלב {i + 1}</span>
              <h3 className="bino-steps__title">{step.title}</h3>
              <p className="bino-steps__body">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bino-closing">
        <h2 className="bino-closing__title">מוכנים לראות BINO על הבניינים שלכם?</h2>
        <div className="bino-cta">
          <a
            className="bino-cta__primary"
            href={WA_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            לתיאום הדגמה בוואטסאפ
          </a>
          <Link className="bino-cta__secondary" href="/login">
            כניסה למערכת
          </Link>
        </div>
      </section>

      <footer className="bino-footer">
        <span>BINO — Building Intelligence &amp; Operations</span>
        {' · '}
        <Link href="/privacy">פרטיות</Link>
        {' · '}
        <Link href="/terms">תקנון</Link>
        {' · '}
        <Link href="/contact">יצירת קשר</Link>
      </footer>
    </div>
  )
}
