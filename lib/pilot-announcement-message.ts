/** Pilot welcome SMS — multilingual. No emoji (019SMS rejects them). */

export function stripEmojiForSms(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\uFE0F/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

export function buildPilotAnnouncementSms(): string {
  const raw = `שלום וברכה,
כאן מוקד התקלות של במקור.
מומלץ לשמור את מספר הטלפון הזה באנשי הקשר, כדי שבמידת הצורך תוכלו ליצור איתנו קשר במהירות לכל תקלה, שאלה או בקשה.

יום נעים!

---

English

Hello,
This is the Bamakor Service & Maintenance Hotline.
We recommend saving this phone number to your contacts so you can quickly reach us if you need assistance, wish to report an issue, or have any questions.

Have a great day!

---

Français

Bonjour,
Ici le service d'assistance et de maintenance de Bamakor.
Nous vous recommandons d'enregistrer ce numéro dans vos contacts afin de pouvoir nous joindre rapidement en cas de besoin, pour signaler un problème ou pour toute question.

Bonne journée !`

  return stripEmojiForSms(raw)
}

/** Custom draft from UI, or default template — always emoji-safe for 019SMS. */
export function resolvePilotSmsMessage(custom?: string | null): string {
  const trimmed = (custom ?? '').trim()
  if (!trimmed) return buildPilotAnnouncementSms()
  const cleaned = stripEmojiForSms(trimmed)
  if (!cleaned) throw new Error('ההודעה ריקה לאחר הסרת תווים לא נתמכים')
  return cleaned
}
