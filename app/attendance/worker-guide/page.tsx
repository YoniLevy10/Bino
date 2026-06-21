'use client'

export default function WorkerGuidePage() {
  return (
    <div dir="rtl" style={{ fontFamily: 'Arial, sans-serif', maxWidth: 600, margin: '40px auto', padding: 24, lineHeight: 1.6 }}>
      <button
        type="button"
        onClick={() => window.print()}
        style={{ marginBottom: 24, padding: '10px 20px', fontSize: 16 }}
      >
        הדפס / שמור PDF
      </button>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>איך מחתימים שעות?</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>3 צעדים פשוטים — בלי אפליקציה, בלי סיסמה</p>
      <ol style={{ fontSize: 18, paddingRight: 24 }}>
        <li style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 20, color: '#2563eb' }}>פעם אחת בלבד</strong> — פתחו את הקישור האישי שקיבלתם ב-SMS (צריך Wi-Fi).
        </li>
        <li style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 20, color: '#2563eb' }}>בכל כניסה</strong> — הצמידו את הטלפון למדבקה בדלת (משרד או בניין).
        </li>
        <li style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 20, color: '#2563eb' }}>ביציאה</strong> — שוב הצמידו את הטלפון למדבקה. יופיע אישור על המסך.
        </li>
      </ol>
      <p>יש בעיה? פנו למנהל או שלחו הודעה ב-WhatsApp.</p>
    </div>
  )
}
