/**
 * הרץ מקומית: node scripts/test-sms.mjs [מספר_טלפון]
 * בודק ישירות מול 019sms.co.il/api (XML + Bearer token) ללא Vercel באמצע
 */
import { readFileSync } from 'fs'

try {
  const env = readFileSync('.env.local', 'utf8')
  env.split('\n').forEach((line) => {
    const [k, ...v] = line.split('=')
    if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '')
  })
} catch {
  /* no .env.local */
}

const USERNAME = process.env.SMS_019_USERNAME
const TOKEN = (process.env.SMS_019_TOKEN || process.env.SMS_019_API_TOKEN || '').trim()
const PASSWORD = process.env.SMS_019_PASSWORD
const FROM = process.env.SMS_019_SENDER || '972559899132'
const TO = process.argv[2] || process.env.MANAGER_PHONE || '972548102688'

if (!USERNAME || (!TOKEN && !PASSWORD)) {
  console.error('❌ חסרים SMS_019_USERNAME + SMS_019_TOKEN ב-.env.local')
  console.error('   (או זמנית SMS_019_PASSWORD עד מעבר מלא לטוקן)')
  process.exit(1)
}

const useToken = Boolean(TOKEN)
const userXml = useToken
  ? `        <username>${USERNAME}</username>`
  : `        <username>${USERNAME}</username>
        <password>${PASSWORD}</password>`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
    <user>
${userXml}
    </user>
    <source>${FROM}</source>
    <destinations>
        <phone>${TO}</phone>
    </destinations>
    <message>הודעת בדיקה מ-Bino - SMS עובד</message>
</sms>`

console.log('📱 שולח SMS ניסיון...')
console.log('   Endpoint: https://019sms.co.il/api')
console.log('   Auth:', useToken ? 'Bearer token (SMS_019_TOKEN)' : 'XML password (legacy fallback)')
console.log('   To:', TO)
console.log('   From (source):', FROM)
console.log('   Username:', USERNAME)
console.log()

try {
  const headers = {
    'Content-Type': 'application/xml; charset=UTF-8',
    'User-Agent': 'Bino/1.0 (+https://bino.casa)',
  }
  if (useToken) headers.Authorization = `Bearer ${TOKEN}`

  const res = await fetch('https://019sms.co.il/api', {
    method: 'POST',
    headers,
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
    console.log('\n❌ שגיאה 1: בעיה בפרמוט ה-XML / אימות (בדוק username + token)')
  } else if (res.status === 401 || res.status === 403) {
    console.log('\n❌ אימות נכשל — בדקו SMS_019_TOKEN (Bearer) ו-SMS_019_USERNAME')
  } else {
    console.log('\n⚠️ תגובה לא צפויה — apiStatus:', apiStatus, apiMsg)
  }
} catch (e) {
  console.error('\n❌ שגיאת רשת:', e.message)
}
