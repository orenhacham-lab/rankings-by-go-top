/**
 * POST /api/reports/monthly/generate { projectId } — the owner creates LAST
 * month's report now (a project created mid-month, or before the feature). It
 * never rewrites a report that exists. Contract: lib/reports/monthly/http.ts.
 */
import { handleMonthlyGenerate } from '@/lib/reports/monthly/http'
import { liveMonthlyDeps } from '@/lib/reports/monthly/live-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  return handleMonthlyGenerate(request, liveMonthlyDeps())
}
