/**
 * הרץ מקומית: node scripts/test-sms.mjs [מספר_טלפון]
 * בודק ישירות מול 019sms.co.il/api (XML) ללא Vercel באמצע
 */
import { readFileSync } from 'fs'

try {
  const env = readFileSync('.env.local', 'utf8')
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '')
  })
} catch { /* no .env.local */ }

const USERNAME = process.env.SMS_019_USERNAME
const PASSWORD = process.env.SMS_019_PASSWORD
const FROM     = process.env.SMS_019_SENDER || '972559899132'
const TO       = process.argv[2] || process.env.MANAGER_PHONE || '972548102688'

if (!USERNAME || !PASSWORD) {
  console.error('❌ חסרים SMS_019_USERNAME / SMS_019_PASSWORD ב-.env.local')
  process.exit(1)
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
    <user>
        <username>${USERNAME}</username>
        <password>${PASSWORD}</password>
    </user>
    <source>${FROM}</source>
    <destinations>
        <phone>${TO}</phone>
    </destinations>
    <message>הודעת בדיקה מ-Bamakor ✅</message>
</sms>`

console.log('📱 שולח SMS ניסיון...')
console.log('   Endpoint: https://019sms.co.il/api')
console.log('   To:', TO)
console.log('   From (source):', FROM)
console.log('   Username:', USERNAME)
console.log()

try {
  const res = await fetch('https://019sms.co.il/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      'User-Agent': 'Bamakor/1.0 (+https://bamakor.com)',
    },
    body: xml,
  })

  const text = await res.text()
  console.log('📨 HTTP Status:', res.status)
  console.log('📨 Response:', text.slice(0, 500))

  const statusMatch = text.match(/<status>(\d+)<\/status>/)
  const msgMatch = text.match(/<message>(.+?)<\/message>/)
  const apiStatus = statusMatch ? parseInt(statusMatch[1]) : -1
  const apiMsg = msgMatch ? msgMatch[1] : ''

  if (apiStatus === 0) {
    console.log('\n✅ SMS נשלח בהצלחה!')
  } else if (apiStatus === 515) {
    console.log('\n❌ שגיאה 515: שם השולח לא מאומת ב-019SMS.')
    console.log('   פתרון: כנס לחשבון 019SMS ← הגדרות ← Sender Names והוסף את:', FROM)
  } else if (apiStatus === 1) {
    console.log('\n❌ שגיאה 1: בעיה בפרמוט ה-XML (בדוק username/password)')
  } else if (res.status === 403) {
    console.log('\n❌ 403: הבקשה נחסמה על ידי WAF')
  } else {
    console.log('\n⚠️ תגובה לא צפויה — apiStatus:', apiStatus, apiMsg)
  }
} catch (e) {
  console.error('\n❌ שגיאת רשת:', e.message)
}
