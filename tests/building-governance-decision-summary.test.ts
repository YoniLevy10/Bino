import { describe, expect, it } from 'vitest'
import {
  buildDecisionSummaryPayload,
  effectiveVoteChoice,
  majorityNeed,
  tallyDecisionVotes,
} from '@/lib/building-governance/decision-summary'
import {
  buildDecisionSummaryPrintHtml,
  DECISION_SUMMARY_PRINT_FOOTER,
} from '@/lib/building-governance/decision-summary-print'

describe('effectiveVoteChoice', () => {
  it('maps signed+null to approve', () => {
    expect(effectiveVoteChoice({ status: 'signed', vote_choice: null })).toBe('approve')
  })

  it('keeps oppose/abstain', () => {
    expect(effectiveVoteChoice({ status: 'signed', vote_choice: 'oppose' })).toBe('oppose')
    expect(effectiveVoteChoice({ status: 'signed', vote_choice: 'abstain' })).toBe('abstain')
  })

  it('returns null for pending', () => {
    expect(effectiveVoteChoice({ status: 'pending', vote_choice: 'approve' })).toBeNull()
  })
})

describe('tallyDecisionVotes', () => {
  it('counts approve/oppose/abstain/pending', () => {
    const tallies = tallyDecisionVotes([
      { status: 'signed', vote_choice: null },
      { status: 'signed', vote_choice: 'approve' },
      { status: 'signed', vote_choice: 'oppose' },
      { status: 'signed', vote_choice: 'abstain' },
      { status: 'pending' },
      { status: 'pending' },
      { status: 'declined' },
    ])
    expect(tallies).toEqual({
      approve: 2,
      oppose: 1,
      abstain: 1,
      pending: 2,
      signed_total: 4,
    })
  })
})

describe('majorityNeed + summary payload', () => {
  it('computes need from threshold', () => {
    expect(majorityNeed(10, 0.5)).toBe(5)
    expect(majorityNeed(3, 0.67)).toBe(3)
  })

  it('builds summary with approve-based majority % and audit/pdf fields', () => {
    const summary = buildDecisionSummaryPayload({
      decision: {
        id: '11111111-1111-1111-1111-111111111111',
        project_id: '22222222-2222-2222-2222-222222222222',
        title: 'אישור תקציב ניקיון',
        body: 'פירוט',
        status: 'open',
        majority_threshold: 0.5,
        required_signatures: 4,
        created_at: '2026-11-01T10:00:00.000Z',
        closed_at: null,
        document_id: '33333333-3333-3333-3333-333333333333',
      },
      projectName: 'הרצל 12',
      signatures: [
        {
          id: 'a',
          signer_name: 'אבי',
          signer_phone: '0500000001',
          resident_id: null,
          status: 'signed',
          vote_choice: 'approve',
          signed_at: '2026-11-02T10:00:00.000Z',
          created_at: '2026-11-01T11:00:00.000Z',
        },
        {
          id: 'b',
          signer_name: 'דנה',
          signer_phone: null,
          resident_id: null,
          status: 'signed',
          vote_choice: 'oppose',
          signed_at: '2026-11-02T11:00:00.000Z',
          created_at: '2026-11-01T12:00:00.000Z',
        },
        {
          id: 'c',
          signer_name: 'יוסי',
          signer_phone: null,
          resident_id: null,
          status: 'pending',
          vote_choice: null,
          signed_at: null,
          created_at: '2026-11-01T13:00:00.000Z',
        },
      ],
      auditRefs: [
        {
          id: 'audit-1',
          action: 'building_decision_reminder_sent',
          created_at: '2026-11-03T09:00:00.000Z',
          user_id: null,
        },
      ],
      pdf: {
        document_id: '33333333-3333-3333-3333-333333333333',
        file_name: 'protocol.pdf',
        download_url: 'https://example.com/protocol.pdf',
      },
      generatedAt: '2026-11-17T05:00:00.000Z',
    })

    expect(summary.votes.approve).toBe(1)
    expect(summary.votes.oppose).toBe(1)
    expect(summary.votes.pending).toBe(1)
    expect(summary.majority_need).toBe(2)
    // 1 approve of need 2 → 50%
    expect(summary.majority_pct).toBe(50)
    expect(summary.majority_reached).toBe(false)
    expect(summary.pdf.file_name).toBe('protocol.pdf')
    expect(summary.audit_refs).toHaveLength(1)
    expect(summary.wa_hsm_note_he).toMatch(/HSM/)
  })
})

describe('decision summary print html', () => {
  it('includes title, tallies, signers, audit, footer', () => {
    const summary = buildDecisionSummaryPayload({
      decision: {
        id: '11111111-1111-1111-1111-111111111111',
        project_id: '22222222-2222-2222-2222-222222222222',
        title: 'החלטת בדיקה',
        body: null,
        status: 'passed',
        majority_threshold: 0.5,
        required_signatures: 2,
        created_at: '2026-11-01T10:00:00.000Z',
        closed_at: '2026-11-05T10:00:00.000Z',
      },
      projectName: 'בניין א',
      signatures: [
        {
          id: 'sig-1',
          signer_name: 'רחל',
          signer_phone: null,
          resident_id: null,
          status: 'signed',
          vote_choice: null,
          signed_at: '2026-11-02T10:00:00.000Z',
          created_at: '2026-11-01T11:00:00.000Z',
        },
      ],
      auditRefs: [],
      generatedAt: '2026-11-17T05:00:00.000Z',
    })
    const html = buildDecisionSummaryPrintHtml(summary)
    expect(html).toContain('החלטת בדיקה')
    expect(html).toContain('בעד')
    expect(html).toContain('רחל')
    expect(html).toContain(DECISION_SUMMARY_PRINT_FOOTER)
    expect(html).toContain('dir="rtl"')
  })
})
