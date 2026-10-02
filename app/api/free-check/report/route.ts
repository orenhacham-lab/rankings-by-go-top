/**
 * POST /api/free-check/report — "email me the report" after a research before
 * sign-up. Stores the address only with the visitor's explicit consent, with
 * the consent's own words and time; nothing is sent (there is no sender yet).
 * The contract lives in lib/presignup/http.ts handleReportRequest, under test
 * in lib/presignup/__qa__/presignup-research.qa.ts. Off, it answers 404.
 */
import { clientIpFrom, hashClient } from '@/lib/free-check/store'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { handleReportRequest } from '@/lib/presignup/http'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleReportRequest(request, {
    enabled: () => presignupResearchOn(process.env),
    admin: () => createAdminClient(),
    clientHash: (req) => hashClient(clientIpFrom(req.headers)),
    now: () => new Date(),
  })
}
