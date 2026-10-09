/**
 * POST /api/admin/affiliates — every operator action on the partner program.
 *
 * One route with an `action`, rather than a dozen endpoints: the screen is one
 * page with one audience (the operator), and a single `requireAdminApi` gate is
 * one place to get right instead of twelve. This route is NOT covered by
 * proxy.ts (its matcher excludes /api/), so it checks for itself — the role comes
 * from `profiles` through the service-role client, never from the request.
 *
 * It decides nothing. Every rule — a code must be free, a commission cannot be
 * approved inside its hold, a payout cannot be paid twice, a partner cannot be
 * linked to an account they themselves referred — is in
 * lib/affiliate/operations.ts, where FakeAdmin can exercise it.
 */
import { requireAdminApi } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  addManualCommission,
  approveApplication,
  approveCommission,
  cancelPayout,
  createPayout,
  linkPartnerAccount,
  markPayoutPaid,
  rejectApplication,
  reverseCommission,
  setPartnerStatus,
  setPayoutDetails,
  voidReferral,
  type OperationOutcome,
} from '@/lib/affiliate/operations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS: Record<OperationOutcome['kind'], number> = {
  ok: 200,
  not_found: 404,
  invalid: 400,
  conflict: 409,
  failed: 500,
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

export async function POST(request: Request) {
  const gate = await requireAdminApi()
  if (!gate.ok) return gate.response

  let body: Record<string, unknown>
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const admin = createAdminClient()
  const action = str(body.action)
  const affiliateId = str(body.affiliateId)

  const run = async (): Promise<OperationOutcome> => {
    switch (action) {
      case 'approve_application':
        return approveApplication(admin, {
          affiliateId,
          code: str(body.code),
          decidedBy: gate.userId,
          baseRate: num(body.baseRate),
          topRate: num(body.topRate),
          topRateFrom: num(body.topRateFrom),
        })
      case 'reject_application':
        return rejectApplication(admin, { affiliateId, decidedBy: gate.userId, notes: str(body.notes) || undefined })
      case 'suspend_partner':
        return setPartnerStatus(admin, { affiliateId, status: 'suspended', notes: str(body.notes) || undefined })
      case 'reinstate_partner':
        return setPartnerStatus(admin, { affiliateId, status: 'approved', notes: str(body.notes) || undefined })
      case 'set_payout_details':
        return setPayoutDetails(admin, { affiliateId, method: str(body.method), details: str(body.details) })
      case 'link_account':
        return linkPartnerAccount(admin, { affiliateId, userId: str(body.userId) })
      case 'approve_commission':
        return approveCommission(admin, { commissionId: str(body.commissionId), approvedBy: gate.userId })
      case 'reverse_commission':
        return reverseCommission(admin, { commissionId: str(body.commissionId), reason: str(body.reason) })
      case 'void_referral':
        return voidReferral(admin, { referralId: str(body.referralId) })
      case 'manual_commission':
        return addManualCommission(admin, {
          affiliateId,
          referralId: str(body.referralId),
          reference: str(body.reference),
          paymentAmount: num(body.paymentAmount) ?? 0,
          currency: str(body.currency),
          rate: num(body.rate) ?? 0,
        })
      case 'create_payout':
        return createPayout(admin, { affiliateId, currency: str(body.currency), createdBy: gate.userId, note: str(body.note) || undefined })
      case 'mark_payout_paid':
        return markPayoutPaid(admin, { payoutId: str(body.payoutId), reference: str(body.reference) })
      case 'cancel_payout':
        return cancelPayout(admin, { payoutId: str(body.payoutId) })
      default:
        return { kind: 'invalid', reason: 'unknown_action' }
    }
  }

  try {
    const outcome = await run()
    if (outcome.kind === 'failed') console.error('[admin-affiliates] failed', { action, reason: outcome.reason })
    return Response.json(
      outcome.kind === 'ok'
        ? { status: 'ok', ...(outcome.detail ?? {}) }
        : { status: outcome.kind, reason: 'reason' in outcome ? outcome.reason : undefined },
      { status: STATUS[outcome.kind] },
    )
  } catch (err) {
    console.error('[admin-affiliates] unexpected:', err instanceof Error ? err.name : 'unknown')
    return Response.json({ status: 'failed' }, { status: 500 })
  }
}
