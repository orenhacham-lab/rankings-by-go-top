/**
 * POST /api/free-check/research — the whole research (seed stage A) for a
 * visitor before sign-up, streamed step by step. Public and unauthenticated
 * like the free check it extends; the contract (flag, admission, caps that
 * fail closed, gating, the one-time claim) lives in lib/presignup/http.ts and
 * runs under test in lib/presignup/__qa__/presignup-research.qa.ts. This file
 * only wires the real dependencies in.
 *
 * Off (ENABLE_SEED_SCAN and ENABLE_PRESIGNUP_RESEARCH not both "true", as in
 * Production) it answers 404 and nothing else runs.
 */
import { issueClaimToken } from '@/lib/free-check/claim'
import { clientIpFrom, hashClient, recordRun } from '@/lib/free-check/store'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { handleResearchPost, type ResearchDeps } from '@/lib/presignup/http'
import { runAnonymousStageA } from '@/lib/presignup/run'
import { runAfterResponse } from '@/lib/notifications/after-response'
import { notifyFreeCheckCompleted } from '@/lib/notifications/operator-alerts'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Stage A's worst case is about a minute (lib/seed-scan/steps.ts budgets).
export const maxDuration = 120

function liveDeps(): ResearchDeps {
  return {
    enabled: () => presignupResearchOn(process.env),
    admin: () => createAdminClient(),
    clientHash: (request) => hashClient(clientIpFrom(request.headers)),
    run: ({ url, locale, onStep }) => runAnonymousStageA({ url, locale, onStep }),
    record: (admin, row) => recordRun(row, admin),
    issueClaim: (admin, checkId) => issueClaimToken(checkId, admin),
    afterRecorded: ({ checkId, domain, locale, result }) =>
      runAfterResponse(() => notifyFreeCheckCompleted({ admin: createAdminClient(), checkId, domain, locale, result })),
    now: () => new Date(),
    env: process.env,
  }
}

export async function POST(request: Request) {
  return handleResearchPost(request, liveDeps())
}
