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
      <p style={{ color: '#666', marginBottom: 24 }}>הכי פשוט שאפשר — בלי אפליקציה, בלי סיסמה</p>
      <ol style={{ fontSize: 18, paddingRight: 24 }}>
        <li style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 20, color: '#2563eb' }}>פעם אחת בלבד</strong> — פתחו את הקישור האישי מה-SMS בטלפון הזה (עם אינטרנט).
        </li>
        <li style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 20, color: '#2563eb' }}>בכניסה</strong> — הצמידו את הטלפון למדבקה בדלת. יופיע «נכנסת למשמרת». אפשר לסגור.
        </li>
        <li style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 20, color: '#2563eb' }}>ביציאה</strong> — הצמידו שוב. יופיע «יצאת מהמשמרת». בלי להיכנס לאתר.
        </li>
      </ol>
      <p style={{ color: '#666', fontSize: 15 }}>באייפון: אחרי ההצמדה לוחצים פעם אחת על ההתראה שנפתחת — ואז נרשם אוטומטית.</p>
      <p>יש בעיה? פנו למנהל.</p>
    </div>
  )
}
