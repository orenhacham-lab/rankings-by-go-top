/**
 * GET /api/reports/monthly/pdf?projectId=[&month=YYYY-MM][&lang=he|en|es] — the
 * stored monthly report as a PDF to keep. Read-only. The whole contract (auth,
 * owner check, codes) lives in lib/reports/monthly/http.ts and is exercised by
 * lib/reports/monthly/__qa__/monthly-report.qa.ts; this file only wires it.
 */
import { handleMonthlyPdf } from '@/lib/reports/monthly/http'
import { liveMonthlyDeps } from '@/lib/reports/monthly/live-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleMonthlyPdf(request, liveMonthlyDeps())
}
