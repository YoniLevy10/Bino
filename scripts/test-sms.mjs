/**
 * הרץ מקומית: node scripts/test-sms.mjs
 * מוודא שה-credentials עובדים ללא Vercel באמצע
 */
import { config } from 'dotenv'
import { readFileSync } from 'fs'

// טוען .env.local
try {
  const env = readFileSync('.env.local', 'utf8')
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '')
  })
} catch { /* no .env.local */ }

const USERNAME = process.env.SMS_019_USERNAME
const PASSWORD = process.env.SMS_019_PASSWORD
const TO       = process.argv[2] || process.env.MANAGER_PHONE || '972548102688'
const FROM     = process.env.SMS_019_SENDER || '972559899132'

if (!USERNAME || !PASSWORD) {
  console.error('❌ חסרים SMS_019_USERNAME / SMS_019_PASSWORD ב-.env.local')
  process.exit(1)
}

console.log('📱 שולח SMS ניסיון...')
console.log('   Endpoint: https://api.019sms.co.il/Send')
console.log('   To:', TO)
console.log('   From:', FROM)
console.log('   Username:', USERNAME)

const body = new URLSearchParams({
  UserName: USERNAME,
  Password: PASSWORD,
  To: TO,
  From: FROM,
  Text: 'הודעת בדיקה מ-Bamakor (מקומי)',
})

try {
  const res = await fetch('https://api.019sms.co.il/Send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Bamakor/1.0',
    },
    body: body.toString(),
  })

  const text = await res.text()
  console.log('\n📨 Status:', res.status)
  console.log('📨 Response:', text.slice(0, 300))

  if (text.trim() === 'OK') {
    console.log('\n✅ SMS נשלח בהצלחה! הבעיה היא ב-Vercel IP, לא ב-credentials.')
  } else if (res.status === 403) {
    console.log('\n❌ 403 גם מקומית — ייתכן שה-credentials שגויים או ה-endpoint שגוי.')
  } else {
    console.log('\n⚠️  תשובה לא צפויה — בדוק את הפרטים למעלה.')
  }
} catch (e) {
  console.error('\n❌ שגיאת רשת:', e.message)
}
