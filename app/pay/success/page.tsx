import Link from 'next/link'

export const metadata = {
  title: 'תשלום הצליח | במקור',
  robots: { index: false, follow: false },
}

export default function PaySuccessPage() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(160deg, #f0fdf4 0%, #ecfdf5 40%, #f8fafc 100%)',
        fontFamily: 'Heebo, Arial, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 14,
            letterSpacing: '0.04em',
            color: '#15803d',
            fontWeight: 700,
          }}
        >
          במקור
        </p>
        <h1 style={{ margin: '0 0 12px', fontSize: 28, color: '#14532d' }}>התשלום התקבל</h1>
        <p style={{ margin: '0 0 24px', fontSize: 16, color: '#166534', lineHeight: 1.6 }}>
          תודה. האישור נשלח לחשבונית ירוקה. אפשר לסגור את החלון.
        </p>
        <Link href="/" style={{ color: '#15803d', fontWeight: 600, textDecoration: 'underline' }}>
          חזרה
        </Link>
      </div>
    </main>
  )
}
