import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/superadmin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { deleteSalesLead } from '@/lib/sales-leads/service'
import {
  addLeadActivity,
  claimLead,
  completeLeadTask,
  editLeadActivityNote,
  getLeadById,
  LeadConflictError,
  LeadValidationError,
  listLeadActivities,
  listLeadTasks,
  logWhatsappLinkOpened,
  patchLeadOptimistic,
} from '@/lib/sales-leads/funnel/service'
import {
  operatorIdFromRequest,
  resolveOperatorActor,
} from '@/lib/sales-leads/operators'
import { isInterestLevel, isLeadStage } from '@/lib/sales-leads/funnel/model'
import type { InterestLevel, LeadStage } from '@/lib/sales-leads/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function requireActor(req: NextRequest): Promise<
  | { admin: ReturnType<typeof getSupabaseAdmin>; actor: NonNullable<Awaited<ReturnType<typeof resolveOperatorActor>>> }
  | { error: NextResponse }
> {
  const admin = getSupabaseAdmin()
  const operatorId = operatorIdFromRequest(req)
  if (!operatorId) {
    return {
      error: NextResponse.json(
        { error: 'נדרש מזהה אחראי (x-sales-operator-id) — בחרו מי אתם בפאנל' },
        { status: 400 },
      ),
    }
  }
  const actor = await resolveOperatorActor(admin, operatorId)
  if (!actor) {
    return {
      error: NextResponse.json(
        {
          error:
            'מפעיל לא מוכר או לא פעיל. הגדירו BINO_SALES_OPERATORS או רשומות ב־sales_operators',
        },
        { status: 400 },
      ),
    }
  }
  return { admin, actor }
}

function conflictResponse(e: LeadConflictError) {
  return NextResponse.json(
    {
      error: e.message,
      code: 'LEAD_CONFLICT',
      lead: e.current,
    },
    { status: 409 },
  )
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response
  const { id } = await ctx.params
  const include = req.nextUrl.searchParams.get('include') ?? 'activities,tasks'

  try {
    const admin = getSupabaseAdmin()
    const lead = await getLeadById(admin, id)
    if (!lead) return NextResponse.json({ error: 'lead not found' }, { status: 404 })

    const payload: Record<string, unknown> = { lead }
    if (include.includes('activities')) {
      payload.activities = await listLeadActivities(admin, id)
    }
    if (include.includes('tasks')) {
      payload.tasks = await listLeadTasks(admin, id)
    }
    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response
  const { id } = await ctx.params

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const resolved = await requireActor(req)
  if ('error' in resolved) return resolved.error
  const { admin, actor } = resolved

  try {
    const action = typeof body.action === 'string' ? body.action : null

    if (action === 'whatsapp_opened' || action === 'whatsapp_link_opened') {
      const lead = await logWhatsappLinkOpened(
        admin,
        id,
        actor,
        typeof body.outreachVariant === 'string' ? body.outreachVariant : null,
      )
      return NextResponse.json({
        lead,
        note: 'קישור נפתח בלבד — יש לסמן ידנית שהודעה נשלחה',
      })
    }

    if (action === 'claim') {
      const expectedVersion = Number(body.expectedVersion)
      const lead = await claimLead(admin, id, actor, expectedVersion)
      return NextResponse.json({ lead })
    }

    if (action === 'add_activity') {
      const activityType = String(body.activityType ?? 'note')
      const result = await addLeadActivity(admin, {
        leadId: id,
        actor,
        activityType,
        body: body.body != null ? String(body.body) : null,
        outcome: body.outcome != null ? String(body.outcome) : null,
        payload: (body.payload as Record<string, unknown>) ?? {},
        touchesContact: Boolean(body.touchesContact),
        expectedVersion:
          body.expectedVersion != null ? Number(body.expectedVersion) : undefined,
        setStage:
          typeof body.setStage === 'string' && isLeadStage(body.setStage)
            ? body.setStage
            : undefined,
      })
      return NextResponse.json(result)
    }

    if (action === 'edit_activity') {
      const activityId = String(body.activityId ?? '')
      const newBody = String(body.body ?? '')
      if (!activityId || !newBody.trim()) {
        return NextResponse.json({ error: 'activityId and body required' }, { status: 400 })
      }
      const activity = await editLeadActivityNote(admin, activityId, newBody, actor)
      return NextResponse.json({ activity })
    }

    if (action === 'complete_task') {
      const taskId = String(body.taskId ?? '')
      if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })
      const followUp =
        body.followUpTitle && body.followUpDueAt
          ? {
              title: String(body.followUpTitle),
              dueAt: String(body.followUpDueAt),
              waitingForReply: Boolean(body.followUpWaitingForReply),
            }
          : undefined
      const result = await completeLeadTask(admin, taskId, actor, followUp)
      return NextResponse.json(result)
    }

    // Default: optimistic field patch
    if (body.expectedVersion == null) {
      return NextResponse.json(
        { error: 'expectedVersion required for updates' },
        { status: 400 },
      )
    }

    if (body.status != null && !isLeadStage(String(body.status))) {
      return NextResponse.json({ error: 'invalid stage' }, { status: 400 })
    }
    if (body.interestLevel != null && !isInterestLevel(String(body.interestLevel))) {
      return NextResponse.json({ error: 'invalid interest level' }, { status: 400 })
    }

    const lead = await patchLeadOptimistic(
      admin,
      id,
      {
        expectedVersion: Number(body.expectedVersion),
        status: body.status != null ? (String(body.status) as LeadStage) : undefined,
        interestLevel:
          body.interestLevel != null
            ? (String(body.interestLevel) as InterestLevel)
            : undefined,
        ownerOperatorId:
          body.ownerOperatorId === null
            ? null
            : body.ownerOperatorId != null
              ? String(body.ownerOperatorId)
              : undefined,
        summary: body.summary !== undefined ? (body.summary as string | null) : undefined,
        notes: body.notes !== undefined ? (body.notes as string | null) : undefined,
        estimatedBuildings:
          body.estimatedBuildings !== undefined
            ? (body.estimatedBuildings as number | null)
            : undefined,
        estimatedUnits:
          body.estimatedUnits !== undefined
            ? (body.estimatedUnits as number | null)
            : undefined,
        estimatedMrrIls:
          body.estimatedMrrIls !== undefined
            ? (body.estimatedMrrIls as number | null)
            : undefined,
        estimatedSetupFeeIls:
          body.estimatedSetupFeeIls !== undefined
            ? (body.estimatedSetupFeeIls as number | null)
            : undefined,
        primaryNeed:
          body.primaryNeed !== undefined ? (body.primaryNeed as string | null) : undefined,
        contactRole:
          body.contactRole !== undefined ? (body.contactRole as string | null) : undefined,
        isDecisionMaker:
          body.isDecisionMaker !== undefined
            ? (body.isDecisionMaker as boolean | null)
            : undefined,
        lostReason:
          body.lostReason !== undefined ? (body.lostReason as string | null) : undefined,
        lostReasonDetail:
          body.lostReasonDetail !== undefined
            ? (body.lostReasonDetail as string | null)
            : undefined,
        deferredUntil:
          body.deferredUntil !== undefined
            ? (body.deferredUntil as string | null)
            : undefined,
        waitingForReply:
          body.waitingForReply !== undefined
            ? Boolean(body.waitingForReply)
            : undefined,
        waitingUntil:
          body.waitingUntil !== undefined
            ? (body.waitingUntil as string | null)
            : undefined,
        outreachVariant:
          body.outreachVariant != null ? String(body.outreachVariant) : undefined,
        nextActionTitle:
          body.nextActionTitle !== undefined
            ? (body.nextActionTitle as string | null)
            : undefined,
        nextActionAt:
          body.nextActionAt !== undefined
            ? (body.nextActionAt as string | null)
            : undefined,
      },
      actor,
    )
    return NextResponse.json({ lead })
  } catch (e) {
    if (e instanceof LeadConflictError) return conflictResponse(e)
    if (e instanceof LeadValidationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 })
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'update failed' },
      { status: 500 },
    )
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response
  const { id } = await ctx.params

  try {
    const admin = getSupabaseAdmin()
    await deleteSalesLead(admin, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'delete failed' },
      { status: 500 },
    )
  }
}
