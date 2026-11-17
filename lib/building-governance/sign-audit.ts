import { logAudit } from '@/lib/audit'
import { hashSignatureContent } from '@/lib/building-governance/signature-content'

/**
 * Audit every building-decision sign. Never delete signed rows — only append audit.
 */
export async function auditBuildingSignatureSign(opts: {
  clientId: string
  userId?: string | null
  decisionId: string
  signatureRequestId: string
  projectId: string
  residentId?: string | null
  unitId?: string | null
  signatureDataUrl: string
  source: 'resident_portal' | 'public_token'
  alreadySigned?: boolean
}): Promise<{ contentHash: string }> {
  const contentHash = hashSignatureContent(opts.signatureDataUrl)
  await logAudit({
    clientId: opts.clientId,
    userId: opts.userId ?? null,
    action: 'building_decision_signed',
    entityType: 'building_signature_request',
    entityId: opts.signatureRequestId,
    newValues: {
      decision_id: opts.decisionId,
      project_id: opts.projectId,
      resident_id: opts.residentId ?? null,
      unit_id: opts.unitId ?? null,
      source: opts.source,
      content_hash: contentHash,
      already_signed: Boolean(opts.alreadySigned),
    },
  })
  return { contentHash }
}
