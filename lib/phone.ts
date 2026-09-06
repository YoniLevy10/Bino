/**
 * Shared phone helpers — prefer importing from here for new code.
 * Existing modules remain as the source of truth; this file re-exports them
 * so call sites converge without a risky big-bang rename.
 */

export { normalizePhone019 as toIlSmsPhone } from '@/lib/sms-019-core'
export { normalizePhone019 } from '@/lib/sms-019-core'
export { collectWorkerPhones, normalizeWorkerPhone } from '@/lib/worker-phones'
export { digitsForWaMeLink } from '@/lib/wa-me-phone'
export { normalizePhoneDial } from '@/lib/contact-links'
