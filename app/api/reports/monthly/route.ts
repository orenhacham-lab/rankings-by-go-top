/**
 * GET /api/reports/monthly?projectId=[&month=YYYY-MM] — the project's monthly
 * reports: the list of months and one stored report (the latest by default).
 * Read-only. The whole contract (auth, owner check, codes) lives in
 * lib/reports/monthly/http.ts and is exercised by
 * lib/reports/monthly/__qa__/monthly-report.qa.ts; this file only wires it.
 */
import { handleMonthlyGet } from '@/lib/reports/monthly/http'
import { liveMonthlyDeps } from '@/lib/reports/monthly/live-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleMonthlyGet(request, liveMonthlyDeps())
}
