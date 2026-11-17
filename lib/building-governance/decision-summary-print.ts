/**
 * Print/PDF-ready HTML for building decision summary (manager/vaad protocol view).
 */

import {
  VOTE_CHOICE_LABELS_HE,
  type DecisionSummaryPayload,
  type VoteChoice,
} from '@/lib/building-governance/decision-summary'

export const DECISION_SUMMARY_PRINT_FOOTER = 'Bino - By OpsBrain · ספר החלטות'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return esc(iso)
  return esc(d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }))
}

function choiceLabel(choice: VoteChoice | null, status: string): string {
  if (status === 'pending') return 'ממתין'
  if (status === 'declined') return 'סירב'
  if (status === 'expired') return 'פג תוקף'
  if (!choice) return 'נחתם'
  return VOTE_CHOICE_LABELS_HE[choice]
}

export function buildDecisionSummaryPrintHtml(payload: DecisionSummaryPayload): string {
  const thresholdPct = Math.round(payload.majority_threshold * 100)
  const pdfRow = payload.pdf.download_url
    ? `<tr><td>מסמך PDF</td><td><a href="${esc(payload.pdf.download_url)}">${esc(
        payload.pdf.file_name || 'פתיחת PDF'
      )}</a></td></tr>`
    : payload.pdf.document_id
      ? `<tr><td>מסמך PDF</td><td class="muted">מקושר (id: ${esc(payload.pdf.document_id)}) — אין קישור חתום כרגע</td></tr>`
      : `<tr><td>מסמך PDF</td><td class="muted">לא צורף</td></tr>`

  const signerRows =
    payload.signers.length === 0
      ? `<tr><td colspan="4" class="muted">אין חותמים</td></tr>`
      : payload.signers
          .map(
            (s) => `<tr>
      <td>${esc(s.signer_name)}</td>
      <td>${esc(choiceLabel(s.effective_choice, s.status))}</td>
      <td>${fmtDate(s.signed_at)}</td>
      <td class="mono">${esc(s.id.slice(0, 8))}</td>
    </tr>`
          )
          .join('')

  const auditRows =
    payload.audit_refs.length === 0
      ? `<tr><td colspan="3" class="muted">אין רשומות audit להחלטה זו</td></tr>`
      : payload.audit_refs
          .map(
            (a) => `<tr>
      <td class="mono">${esc(a.id.slice(0, 8))}</td>
      <td>${esc(a.action)}</td>
      <td>${fmtDate(a.created_at)}</td>
    </tr>`
          )
          .join('')

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>סיכום החלטה — ${esc(payload.title)}</title>
  <style>
    :root { --ink:#1a2332; --muted:#5b6573; --line:#d7dde5; --bg:#f7f5f1; --card:#fff; --accent:#1f6b5a; }
    * { box-sizing: border-box; }
    body { margin:0; padding:24px; font-family: "Heebo", "Segoe UI", Tahoma, sans-serif; color:var(--ink); background:linear-gradient(180deg,#eef3f0 0%,var(--bg) 40%,#f3efe8 100%); }
    .sheet { max-width:860px; margin:0 auto; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:28px 28px 20px; }
    h1 { margin:0 0 6px; font-size:1.55rem; color:var(--accent); }
    .sub { margin:0 0 18px; color:var(--muted); font-size:0.92rem; line-height:1.45; }
    h2 { margin:22px 0 10px; font-size:1.05rem; border-bottom:1px solid var(--line); padding-bottom:6px; }
    table { width:100%; border-collapse:collapse; font-size:0.9rem; }
    th, td { text-align:right; padding:8px 6px; border-bottom:1px solid var(--line); vertical-align:top; }
    th { color:var(--muted); font-weight:600; font-size:0.8rem; }
    .num { font-variant-numeric: tabular-nums; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:0.8rem; }
    .muted { color:var(--muted); }
    .kpi { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:12px 0 4px; }
    .kpi div { background:#f4f8f6; border:1px solid var(--line); border-radius:10px; padding:10px; }
    .kpi span { display:block; color:var(--muted); font-size:0.75rem; }
    .kpi strong { font-size:1.15rem; }
    .footer { margin-top:22px; color:var(--muted); font-size:0.75rem; text-align:center; }
    @media print {
      body { background:#fff; padding:0; }
      .sheet { border:none; border-radius:0; padding:0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>${esc(payload.title)}</h1>
    <p class="sub">
      בניין: ${esc(payload.project_name)} · סטטוס: ${esc(payload.status_label_he)} ·
      נוצר: ${fmtDate(payload.created_at)}
      ${payload.closed_at ? ` · נסגר: ${fmtDate(payload.closed_at)}` : ''} ·
      הופק: ${fmtDate(payload.generated_at)}
    </p>
    ${payload.body ? `<p>${esc(payload.body)}</p>` : ''}

    <h2>הצבעות מול סף</h2>
    <div class="kpi">
      <div><span>בעד</span><strong class="num">${payload.votes.approve}</strong></div>
      <div><span>נגד</span><strong class="num">${payload.votes.oppose}</strong></div>
      <div><span>נמנע</span><strong class="num">${payload.votes.abstain}</strong></div>
      <div><span>ממתין</span><strong class="num">${payload.votes.pending}</strong></div>
    </div>
    <table>
      <tbody>
        <tr><td>סף רוב</td><td class="num">${thresholdPct}% (${payload.majority_need} מתוך ${payload.required_signatures})</td></tr>
        <tr><td>התקדמות (בעד מול סף)</td><td class="num">${payload.majority_pct}%${
    payload.majority_reached ? ' · הושג רוב' : ''
  }</td></tr>
        ${pdfRow}
      </tbody>
    </table>

    <h2>חותמים</h2>
    <table>
      <thead><tr><th>שם</th><th>בחירה</th><th>תאריך חתימה</th><th>מזהה</th></tr></thead>
      <tbody>${signerRows}</tbody>
    </table>

    <h2>הפניות audit</h2>
    <table>
      <thead><tr><th>מזהה</th><th>פעולה</th><th>תאריך</th></tr></thead>
      <tbody>${auditRows}</tbody>
    </table>

    <p class="muted" style="margin-top:16px;font-size:0.8rem;line-height:1.4">${esc(
      payload.wa_hsm_note_he
    )}</p>
    <footer class="footer">${esc(DECISION_SUMMARY_PRINT_FOOTER)}</footer>
  </div>
</body>
</html>`
}

/** Open print window for decision summary. Returns false if popup blocked. */
export function openDecisionSummaryPrint(payload: DecisionSummaryPayload): boolean {
  if (typeof window === 'undefined') return false
  const html = buildDecisionSummaryPrintHtml(payload)
  const w = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  const trigger = () => {
    try {
      w.focus()
      w.print()
    } catch {
      /* ignore */
    }
  }
  if (w.document.readyState === 'complete') {
    setTimeout(trigger, 250)
  } else {
    w.addEventListener('load', () => setTimeout(trigger, 250))
  }
  return true
}
