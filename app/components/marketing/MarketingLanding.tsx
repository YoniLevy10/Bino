import Link from 'next/link'
import './marketing.css'

const WA_DEMO_URL =
  'https://wa.me/972548102688?text=' +
  encodeURIComponent('שלום, אני מעוניין/ת בהדגמה של BINO — מערכת הזיכרון התפעולי לבניינים')

const NORTH_STAR_METRICS = [
  {
    label: 'זמן עד שיוך',
    before: '48 דק׳',
    after: '12 דק׳',
    note: 'ירידה של ~75%',
  },
  {
    label: 'זמן עד פתרון',
    before: '36 שעות',
    after: '14 שעות',
    note: 'ירידה של ~61%',
  },
  {
    label: 'שיעור תקלות חוזרות',
    before: '28%',
    after: '11%',
    note: 'פחות כשלים חוזרים',
  },
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

const PRODUCT_SHOTS = [
  {
    src: '/marketing/ops-memory.svg',
    alt: 'מסך זיכרון תפעולי של BINO: היסטוריית תקלות, ציוד ותובנות לבניין',
    caption: 'זיכרון תפעולי לכל בניין',
  },
  {
    src: '/marketing/smart-assign.svg',
    alt: 'מסך שיוך חכם ב־BINO: המלצה על העובד המתאים לפי היסטוריית הבניין',
    caption: 'המלצה אוטומטית לעובד או ספק',
  },
  {
    src: '/marketing/savings-proof.svg',
    alt: 'דוח חיסכון של BINO עם מדדי כוכב צפוני לפני ואחרי — נתוני דוגמה',
    caption: 'הוכחת חיסכון לחברת הניהול',
  },
] as const

function CtaPair({ variant = 'hero' }: { variant?: 'hero' | 'closing' }) {
  return (
    <div className="bino-cta">
      <a
        className="bino-cta__primary"
        href={WA_DEMO_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        לתיאום הדגמה בוואטסאפ
      </a>
      <Link
        className={variant === 'closing' ? 'bino-cta__secondary bino-cta__secondary--dark' : 'bino-cta__secondary'}
        href="/login"
      >
        כניסה למערכת
      </Link>
    </div>
  )
}

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
          <CtaPair />
        </div>
      </header>

      <main>
        <section className="bino-showcase" aria-labelledby="bino-showcase-heading">
          <div className="bino-section bino-section--wide">
            <h2 id="bino-showcase-heading" className="bino-section__title">
              כך נראית המודיעין התפעולי
            </h2>
            <p className="bino-section__lead">
              לא רשימת תקלות — זיכרון שממליץ, מתריע ומוכיח כמה זמן וכסף נחסכו.
            </p>
            <ul className="bino-showcase__grid">
              {PRODUCT_SHOTS.map((shot) => (
                <li key={shot.src} className="bino-showcase__item">
                  <figure>
                    <div className="bino-showcase__frame">
                      {/* Local SVG product mock — next/image SVG optimization not needed */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.src}
                        alt={shot.alt}
                        width={960}
                        height={640}
                        className="bino-showcase__img"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <figcaption className="bino-showcase__caption">{shot.caption}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bino-section" aria-labelledby="bino-metrics-heading">
          <h2 id="bino-metrics-heading" className="bino-section__title">
            המדדים שמנחים את המוצר
          </h2>
          <p className="bino-section__lead">
            כל פיצ׳ר ב־BINO נמדד לפי מה שחשוב לתפעול בניינים — לא לפי כמה תקלות נפתחו.
          </p>
          <p className="bino-sample-note" role="note">
            מספרי <strong>דוגמה</strong> להמחשה — לא נתוני לקוח אמיתי.
          </p>
          <ol className="bino-metrics">
            {NORTH_STAR_METRICS.map((metric, i) => (
              <li key={metric.label}>
                <span className="bino-metrics__idx">{String(i + 1).padStart(2, '0')}</span>
                <div className="bino-metrics__body">
                  <span className="bino-metrics__label">{metric.label}</span>
                  <span className="bino-metrics__delta">
                    <span className="bino-metrics__before">{metric.before}</span>
                    <span className="bino-metrics__arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="bino-metrics__after">{metric.after}</span>
                    <span className="bino-metrics__note">{metric.note}</span>
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <p className="bino-metrics__more">
            <Link href="/savings-report">צפו בדוח החיסכון לדוגמה</Link>
          </p>
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

        <section className="bino-closing" aria-labelledby="bino-closing-heading">
          <h2 id="bino-closing-heading" className="bino-closing__title">
            מוכנים לראות BINO על הבניינים שלכם?
          </h2>
          <CtaPair variant="closing" />
        </section>
      </main>

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
