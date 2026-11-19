import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import {
  BUILDING_EXPENSE_RECEIPTS_BUCKET,
  RECEIPT_ALLOWED_MIME,
  RECEIPT_MAX_BYTES,
  RECEIPT_SIGNED_URL_TTL_SEC,
  encodeReceiptStoragePath,
  extForMime,
  safeReceiptFileName,
} from '@/lib/building-finance/receipt-storage'
import { removeDurableStorageObjects } from '@/lib/storage-purge'
import { getLogger } from '@/lib/shared/logging'

export const dynamic = 'force-dynamic'

function platformDisabled() {
  return NextResponse.json(
    { error: 'הנהלת חשבונות בניין כבויה כרגע בפלטפורמה', code: 'FINANCE_PLATFORM_DISABLED' },
    { status: 503 }
  )
}

/** Upload a PDF/image receipt for a building expense. Returns durable path + signed URL. */
export async function POST(req: Request) {
  if (!isBuildingFinancePlatformEnabled()) return platformDisabled()

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-finance-receipt'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'גוף multipart לא תקין' }, { status: 400 })
  }

  const projectId = String(formData.get('project_id') ?? '').trim()
  const file = formData.get('file')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id נדרש' }, { status: 400 })
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'חסר קובץ קבלה' }, { status: 400 })
  }

  const mime = (file.type || 'application/octet-stream').toLowerCase()
  if (!RECEIPT_ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: 'סוג קובץ לא נתמך — PDF / JPG / PNG / WEBP בלבד' },
      { status: 400 }
    )
  }
  if (file.size <= 0 || file.size > RECEIPT_MAX_BYTES) {
    return NextResponse.json({ error: 'גודל קובץ לא תקין (מקסימום 10MB)' }, { status: 400 })
  }

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (projectError) {
    return NextResponse.json({ error: 'שגיאה בטעינת פרויקט' }, { status: 500 })
  }
  if (!project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  const originalName = file instanceof File ? file.name : `receipt.${extForMime(mime)}`
  const fileName = safeReceiptFileName(originalName)
  const storagePath = `${auth.ctx.clientId}/${projectId}/${Date.now()}-${fileName}`
  const buf = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from(BUILDING_EXPENSE_RECEIPTS_BUCKET)
    .upload(storagePath, buf, { contentType: mime, upsert: false })

  if (upErr) {
    getLogger().error(
      'BUILDING_FINANCE',
      'receipt upload failed',
      new Error(upErr.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'העלאת קבלה נכשלה' }, { status: 500 })
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(BUILDING_EXPENSE_RECEIPTS_BUCKET)
    .createSignedUrl(storagePath, RECEIPT_SIGNED_URL_TTL_SEC)

  if (signErr || !signed?.signedUrl) {
    await removeDurableStorageObjects(
      admin,
      BUILDING_EXPENSE_RECEIPTS_BUCKET,
      [storagePath],
      'upload_rollback'
    )
    return NextResponse.json({ error: 'יצירת קישור קבלה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({
    receipt_url: encodeReceiptStoragePath(storagePath),
    download_url: signed.signedUrl,
    file_name: fileName,
    mime_type: mime,
    file_size: file.size,
  })
}
