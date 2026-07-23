/** Pilot welcome SMS — multilingual. No emoji (019SMS rejects them). */

import { digitsForWaMeLink } from '@/lib/wa-me-phone'

export function stripEmojiForSms(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\uFE0F/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

/** Display Israeli mobile as 05… when given 972… digits. */
export function formatIsraeliMobileDisplay(raw: string | null | undefined): string | null {
  const digits = digitsForWaMeLink(raw)
  if (!digits) return null
  if (digits.startsWith('972') && digits.length >= 11) {
    return `0${digits.slice(3)}`
  }
  return digits
}

export type PilotAnnouncementOptions = {
  /** WhatsApp bot / business phone — shown so residents save the correct number. */
  whatsappBotPhone?: string | null
}

function buildWhatsAppBotLines(whatsappBotPhone?: string | null, locale: 'he' | 'en' | 'fr' = 'he'): string {
  const digits = digitsForWaMeLink(whatsappBotPhone)
  if (!digits) return ''
  const local = formatIsraeliMobileDisplay(digits) || digits
  const wa = `https://wa.me/${digits}`
  if (locale === 'en') {
    return `\n\nImportant: Save this WhatsApp number and message only this number:\n${local}\n${wa}\n`
  }
  if (locale === 'fr') {
    return `\n\nImportant: enregistrez ce numéro WhatsApp et écrivez uniquement à ce numéro:\n${local}\n${wa}\n`
  }
  return `\n\nחשוב: שמרו את מספר הוואטסאפ הזה באנשי הקשר ושלחו אליו בלבד (אל תשלחו למספר אחר):\n${local}\n${wa}\n`
}

export function buildPilotAnnouncementSms(opts?: PilotAnnouncementOptions): string {
  const phone = opts?.whatsappBotPhone
  const raw = `שלום וברכה,
כאן מוקד התקלות של במקור.
מומלץ לשמור את מספר הטלפון הזה באנשי הקשר, כדי שבמידת הצורך תוכלו ליצור איתנו קשר במהירות לכל תקלה, שאלה או בקשה.${buildWhatsAppBotLines(phone, 'he')}
יום נעים!

---

English

Hello,
This is the Bamakor Service & Maintenance Hotline.
We recommend saving this phone number to your contacts so you can quickly reach us if you need assistance, wish to report an issue, or have any questions.${buildWhatsAppBotLines(phone, 'en')}
Have a great day!

---

Français

Bonjour,
Ici le service d'assistance et de maintenance de Bamakor.
Nous vous recommandons d'enregistrer ce numéro dans vos contacts afin de pouvoir nous joindre rapidement en cas de besoin, pour signaler un problème ou pour toute question.${buildWhatsAppBotLines(phone, 'fr')}
Bonne journée !`

  return stripEmojiForSms(raw)
}

/** Custom draft from UI, or default template — always emoji-safe for 019SMS. */
export function resolvePilotSmsMessage(
  custom?: string | null,
  opts?: PilotAnnouncementOptions
): string {
  const trimmed = (custom ?? '').trim()
  if (!trimmed) return buildPilotAnnouncementSms(opts)
  const cleaned = stripEmojiForSms(trimmed)
  if (!cleaned) throw new Error('ההודעה ריקה לאחר הסרת תווים לא נתמכים')
  return cleaned
}
