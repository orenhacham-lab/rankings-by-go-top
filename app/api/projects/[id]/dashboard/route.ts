/**
 * GET /api/projects/[id]/dashboard — the dashboard's articles, publishing board,
 * AI-visibility brief, setup facts, activity and account status for one project.
 *
 * proxy.ts does not cover /api/*, so the handler authenticates the user and
 * checks ownership itself; the whole contract lives in lib/dashboard/overview.ts
 * and is exercised by lib/dashboard/__qa__/dashboard-overview.qa.ts, with the
 * real dependencies in lib/dashboard/live-deps.ts, which the dashboard's own
 * layout uses to build the SAME answer in-region. It is a READ: it reserves,
 * consumes and calls out to nothing.
 */
import { handleDashboardGet } from '@/lib/dashboard/overview'
import { liveDeps } from '@/lib/dashboard/live-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleDashboardGet(id, liveDeps())
}
