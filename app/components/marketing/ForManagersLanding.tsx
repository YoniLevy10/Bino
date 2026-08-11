'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { getIsMobileViewport } from '@/lib/mobile-viewport'

const WHATSAPP_URL = 'https://wa.me/97254810288'
const VIDEO_SRC = '/marketing/bamakor-promo.mp4'
const VIDEO_POSTER = '/marketing/bamakor-promo.jpg'

const FEATURES = [
  {
    title: 'דיווח עם תמונה וסרטון',
    text: 'הדייר שולח תקלה עם מדיה — והמשרד רואה בדיוק מה קורה בשטח.',
  },
  {
    title: 'רישום דיירים גמיש',
    text: 'דף נחיתה לרישום, או שהמנהל מעלה רשימה מלאה של הדיירים למערכת.',
  },
  {
    title: 'שיחה מנוהלת ב-WhatsApp',
    text: 'המנהל שולט בנוסחי ההודעות, ומדבר עם פונים מתוך המערכת — לא בצ׳אטים פזורים.',
  },
  {
    title: 'תרגום תקלות',
    text: 'תקלות מדיירים בשפות שונות — מתורגמות למשתמשי המערכת בעברית.',
  },
]

export function ForManagersLanding() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <div dir="rtl" style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.heroMedia} aria-hidden={!isMobile}>
          <video
            src={VIDEO_SRC}
            poster={VIDEO_POSTER}
            style={styles.heroVideo}
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
          />
          <div style={styles.heroScrim} />
        </div>

        <div style={{ ...styles.heroContent, ...(isMobile ? styles.heroContentMobile : {}) }}>
          <p style={styles.brand}>במקור</p>
          <h1 style={{ ...styles.headline, ...(isMobile ? styles.headlineMobile : {}) }}>
            תקלות, דיירים ועובדים — בלי לנהל את זה בצ׳אטים פזורים
          </h1>
          <p style={styles.subhead}>
            ערוץ דיווח לדיירים, שולחן ניהול למשרד, ושיבוץ לעובדי השטח — במקום אחד.
          </p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.primaryCta}
          >
            יצירת קשר ב-WhatsApp
          </a>
        </div>
      </section>

      {isMobile && (
        <div style={styles.mobileVideoWrap}>
          <video
            src={VIDEO_SRC}
            poster={VIDEO_POSTER}
            style={styles.mobileVideo}
            controls
            playsInline
            muted
            preload="metadata"
            aria-label="סרטון קצר על במקור"
          />
        </div>
      )}

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>מה מקבלים ביומיום</h2>
        <p style={styles.sectionLead}>הכל סביב התקלה — מהפנייה ועד הטיפול.</p>
        <ul style={styles.featureList}>
          {FEATURES.map((f) => (
            <li key={f.title} style={styles.featureItem}>
              <strong style={styles.featureTitle}>{f.title}</strong>
              <span style={styles.featureText}>{f.text}</span>
            </li>
          ))}
        </ul>
        <p style={styles.qrNote}>
          אפשר גם QR בכניסה לבניין — רוב הלקוחות עובדים דרך ערוץ ה-WhatsApp המנוהל.
        </p>
      </section>

      <section style={styles.sectionAlt}>
        <h2 style={styles.sectionTitle}>מה כולל בהקמה</h2>
        <p style={styles.sectionLead}>
          אנחנו עוזרים להכניס את הנתונים למערכת — בניינים, דיירים ועובדים — כדי שתתחילו לעבוד
          מסודר מהיום הראשון.
        </p>
        <p style={styles.bodyText}>
          אפשרות לעיצוב אישי, כולל הדפסת 3D של נקודות חתמה לעובדים וכדומה.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>מחיר</h2>
        <p style={styles.priceLine}>הקמה חד־פעמית + מנוי חודשי לפי היקף הבניינים.</p>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.primaryCta}
        >
          לחצו ליצירת קשר
        </a>
      </section>

      <footer style={styles.footer}>
        <span style={styles.footerBrand}>במקור</span>
        <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
          WhatsApp
        </a>
      </footer>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#F4F7FC',
    color: '#1A1A2E',
    fontFamily: "var(--font-heebo), 'Heebo', sans-serif",
  },
  hero: {
    position: 'relative',
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  heroMedia: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
  },
  heroVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center top',
  },
  heroScrim: {
    position: 'absolute',
    inset: 0,
    background:
      'linear-gradient(180deg, rgba(10, 18, 36, 0.35) 0%, rgba(10, 18, 36, 0.55) 45%, rgba(10, 18, 36, 0.88) 100%)',
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 900,
    margin: '0 auto',
    padding: '48px 24px 56px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    color: '#FFFFFF',
  },
  heroContentMobile: {
    paddingBottom: 40,
  },
  brand: {
    margin: 0,
    fontSize: 48,
    fontWeight: 900,
    letterSpacing: '-0.04em',
    lineHeight: 1,
    color: '#FFFFFF',
  },
  headline: {
    margin: 0,
    fontSize: 36,
    fontWeight: 800,
    lineHeight: 1.25,
    letterSpacing: '-0.03em',
    maxWidth: 640,
  },
  headlineMobile: {
    fontSize: 26,
  },
  subhead: {
    margin: 0,
    fontSize: 17,
    lineHeight: 1.55,
    color: 'rgba(255,255,255,0.88)',
    maxWidth: 480,
  },
  primaryCta: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    minHeight: 48,
    padding: '12px 22px',
    borderRadius: 12,
    background: '#0066FF',
    color: '#FFFFFF',
    fontWeight: 700,
    fontSize: 16,
    textDecoration: 'none',
    marginTop: 8,
  },
  mobileVideoWrap: {
    padding: '0 0 8px',
    background: '#0B1220',
  },
  mobileVideo: {
    width: '100%',
    display: 'block',
    aspectRatio: '9 / 16',
    maxHeight: '70dvh',
    objectFit: 'cover',
    background: '#0B1220',
  },
  section: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '56px 20px',
  },
  sectionAlt: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '56px 20px',
    borderTop: '1px solid rgba(26, 26, 46, 0.08)',
    borderBottom: '1px solid rgba(26, 26, 46, 0.08)',
    background: 'linear-gradient(180deg, #EEF3FB 0%, #F4F7FC 100%)',
  },
  sectionTitle: {
    margin: '0 0 10px',
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  sectionLead: {
    margin: '0 0 28px',
    fontSize: 16,
    lineHeight: 1.55,
    color: '#3C3C43',
  },
  bodyText: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.55,
    color: '#3C3C43',
  },
  featureList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 22,
  },
  featureItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  featureTitle: {
    fontSize: 17,
    fontWeight: 700,
  },
  featureText: {
    fontSize: 15,
    lineHeight: 1.5,
    color: '#3C3C43',
  },
  qrNote: {
    margin: '28px 0 0',
    fontSize: 13,
    lineHeight: 1.5,
    color: '#86868B',
  },
  priceLine: {
    margin: '0 0 20px',
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1.45,
  },
  footer: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '28px 20px 40px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid rgba(26, 26, 46, 0.08)',
  },
  footerBrand: {
    fontWeight: 800,
    color: '#0066FF',
  },
  footerLink: {
    color: '#3C3C43',
    textDecoration: 'none',
    fontWeight: 600,
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
  },
}
