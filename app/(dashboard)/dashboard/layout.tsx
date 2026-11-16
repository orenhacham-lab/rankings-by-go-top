/**
 * THE DASHBOARD'S READS, ANSWERED IN-REGION AND HANDED TO THE SCREEN.
 *
 * The screen used to ask the server for everything it shows AFTER the page had
 * loaded, from the browser, in two waves. Measured from Oren's browser against
 * production on 16.11.2026, warm: the document arrived at ~2.1s and the last of
 * those answers at 5.3s. The reads themselves are not the cost — a route that
 * reads NOTHING AT ALL costs 510-760ms from there — the cost is that each is a
 * round trip, and that each route is its own serverless function with its own
 * cold start, which at this traffic most first loads of the day pay.
 *
 * So this layout, which already runs in the same region as the database,
 * answers them itself and writes the answers into the HTML
 * (lib/client/html-seed.ts). Each one goes through THE ROUTE'S OWN HANDLER
 * (lib/server/route-seed.ts), so every check it makes still applies and a
 * seeded answer cannot drift from the route's.
 *
 * IT IS AWAITED, NOT STREAMED. That is the whole trade: the document waits for
 * these reads — together, so it waits for the slowest and not for their sum —
 * and in exchange the browser's round trips disappear. A Suspense boundary
 * would keep the document fast and arrive after the screen's own effects had
 * already fetched, which buys nothing.
 *
 * WHICH PROJECT. The active project is chosen in the browser (the URL, then
 * localStorage), so the server is told by the cookie the active-project
 * provider mirrors (lib/active-project/active-cookie.ts). The value is NEVER
 * trusted: it is only shape-checked here, and every handler reads the project
 * as its owner and answers 401/404 for anyone else's, so the worst a forged
 * cookie can do is waste these reads and seed nothing.
 *
 * EVERY FAILURE IS SILENT AND COSTS ONLY ITSELF: no cookie, a project that is
 * not this user's, a read that throws, a feature that is off, anything but a
 * 200 — that one answer is not written, and the screen asks that one route over
 * the network exactly as it did before. The change is additive by
 * construction, so deleting this file restores the previous behaviour exactly.
 */
import { NextRequest } from 'next/server'
import { GET as competitorsGet } from '@/app/api/projects/[id]/ai-visibility/competitors/route'
import { GET as quotaGet } from '@/app/api/projects/quota/route'
import { GET as waitingGet } from '@/app/api/projects/[id]/waiting/route'
import { GET as gscMetricsGet } from '@/app/api/gsc/metrics/route'
import HtmlSeed from '@/components/HtmlSeed'
import { ACTIVE_PROJECT_COOKIE } from '@/lib/active-project/active-cookie'
import { competitorsUrl } from '@/lib/ai-visibility/urls'
import { liveDeps } from '@/lib/dashboard/live-deps'
import { handleDashboardGet } from '@/lib/dashboard/overview'
import { dashboardOverviewUrl } from '@/lib/dashboard/urls'
import { gscMetricsUrl } from '@/lib/gsc/urls'
import { waitingUrl } from '@/lib/nudges/urls'
import { PROJECT_QUOTA_URL } from '@/lib/projects/urls'
import { handleMonthlyGet } from '@/lib/reports/monthly/http'
import { liveMonthlyDeps } from '@/lib/reports/monthly/live-deps'
import { monthlyReportsUrl } from '@/lib/reports/monthly/urls'
import { handleSeedGet } from '@/lib/seed-scan/http'
import { seedReadDeps } from '@/lib/server/seed-read-deps'
import { seedRunUrl } from '@/lib/seed-scan/urls'
import { seedAnswer, type SeedAnswer } from '@/lib/server/route-seed'
import { cookies } from 'next/headers'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The route context shape a `[id]` handler is called with. */
const forProject = (id: string) => ({ params: Promise.resolve({ id }) })

/**
 * The overview the main panel paints with. Not routed through `seedAnswer`
 * because it has no `[id]` route of its own to call here: its handler takes the
 * project id directly, and the route calls the same one.
 */
async function overview(projectId: string): Promise<SeedAnswer | null> {
  try {
    const res = await handleDashboardGet(projectId, liveDeps())
    if (res.status !== 200) return null
    return { url: dashboardOverviewUrl(projectId), status: 200, body: await res.json() }
  } catch {
    return null
  }
}

/**
 * Every answer this screen's first paint needs, read together.
 *
 * The Search Console metrics are read without first asking whether the account
 * is connected: that route answers an empty result cheaply when there is no
 * succeeded sync, and gating it would mean a read before the read. An unused
 * seed simply expires.
 */
async function seeds(projectId: string): Promise<SeedAnswer[]> {
  const answers = await Promise.all([
    overview(projectId),
    seedAnswer(seedRunUrl(projectId), () => handleSeedGet(projectId, seedReadDeps())),
    seedAnswer(waitingUrl(projectId), (req) => waitingGet(req, forProject(projectId))),
    seedAnswer(monthlyReportsUrl(projectId), (req) => handleMonthlyGet(req, liveMonthlyDeps())),
    seedAnswer(competitorsUrl(projectId), (req) => competitorsGet(new NextRequest(req), forProject(projectId))),
    seedAnswer(gscMetricsUrl(projectId, 'pages'), (req) => gscMetricsGet(req)),
    seedAnswer(PROJECT_QUOTA_URL, () => quotaGet()),
  ])
  return answers.filter((a): a is SeedAnswer => a !== null)
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const projectId = (await cookies()).get(ACTIVE_PROJECT_COOKIE)?.value
  const answers = projectId && UUID.test(projectId) ? await seeds(projectId) : []
  return (
    <>
      {answers.map((a) => (
        <HtmlSeed key={a.url} url={a.url} status={a.status} body={a.body} />
      ))}
      {children}
    </>
  )
}
