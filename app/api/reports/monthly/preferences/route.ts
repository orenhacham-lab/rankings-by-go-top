/**
 * GET|PUT /api/reports/monthly/preferences — the project's "weekly summary by
 * email" switch, OFF by default. Storing it sends nothing: no sender is wired
 * (lib/reports/monthly/weekly-email.ts). Contract: lib/reports/monthly/http.ts.
 */
import { handlePreferencesGet, handlePreferencesPut } from '@/lib/reports/monthly/http'
import { liveMonthlyDeps } from '@/lib/reports/monthly/live-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handlePreferencesGet(request, liveMonthlyDeps())
}

export async function PUT(request: Request) {
  return handlePreferencesPut(request, liveMonthlyDeps())
}
