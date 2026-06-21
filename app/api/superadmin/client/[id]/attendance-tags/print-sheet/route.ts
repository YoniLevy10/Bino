import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminAuthorized } from '@/lib/superadmin-auth'
import { buildNfcTagScanUrl } from '@/lib/nfc-tag-utils'

/** Printable HTML sheet — one sticker block per tag (print to PDF from browser). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: clientId } = await params
  const admin = getSupabaseAdmin()

  const { data: client } = await admin.from('clients').select('name').eq('id', clientId).maybeSingle()
  const clientName = (client as { name?: string } | null)?.name ?? 'Bamakor'

  const { data: tags, error } = await admin
    .from('worker_nfc_tags')
    .select('tag_code, tag_type, label, is_active')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('tag_type')
    .order('tag_code')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const blocks = (tags ?? [])
    .map((t) => {
      const row = t as { tag_code: string; tag_type: string; label: string | null }
      const url = buildNfcTagScanUrl(row.tag_code)
      const place = row.tag_type === 'office' ? 'משרד' : row.label || row.tag_code
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}`
      return `
        <div class="sticker">
          <div class="client">${escapeHtml(clientName)}</div>
          <div class="place">${escapeHtml(place)}</div>
          <img src="${qrUrl}" alt="QR" width="140" height="140" />
          <div class="hint">הצמידו את הטלפון למדבקה</div>
          <div class="code">${escapeHtml(row.tag_code)}</div>
        </div>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>מדבקות NFC — ${escapeHtml(clientName)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 16px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .sticker { border: 2px dashed #333; padding: 16px; text-align: center; page-break-inside: avoid; }
    .client { font-size: 12px; color: #666; }
    .place { font-size: 18px; font-weight: bold; margin: 8px 0; }
    .hint { font-size: 13px; margin-top: 8px; }
    .code { font-size: 11px; color: #888; direction: ltr; margin-top: 4px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <p class="no-print"><button onclick="window.print()">הדפס / שמור PDF</button></p>
  <div class="grid">${blocks}</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
