import Link from 'next/link'

export const metadata = {
  title: 'תשלום לא הושלם | במאקור',
  robots: { index: false, follow: false },
}

export default function PayFailurePage() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(160deg, #fef2f2 0%, #fff7ed 40%, #f8fafc 100%)',
        fontFamily: 'Heebo, Arial, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 14,
            letterSpacing: '0.04em',
            color: '#b91c1c',
            fontWeight: 700,
          }}
        >
          במאקור
        </p>
        <h1 style={{ margin: '0 0 12px', fontSize: 28, color: '#7f1d1d' }}>התשלום לא הושלם</h1>
        <p style={{ margin: '0 0 24px', fontSize: 16, color: '#991b1b', lineHeight: 1.6 }}>
          ניתן לנסות שוב דרך הקישור שנשלח ב-SMS, או לפנות לוועד הבית.
        </p>
        <Link href="/" style={{ color: '#b91c1c', fontWeight: 600, textDecoration: 'underline' }}>
          חזרה
        </Link>
      </div>
    </main>
  )
}
