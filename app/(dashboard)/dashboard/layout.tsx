/**
 * THE DASHBOARD'S OWN DATA, BUILT IN-REGION AND HANDED TO THE SCREEN.
 *
 * The screen asked `/api/projects/[id]/dashboard` from the browser after the
 * page had loaded, and showed a skeleton until the answer came back. Measured
 * from Oren's browser against production on 16.11.2026: the document arrived at
 * 1532ms and that answer at 3185ms. The request itself is not the cost — a
 * route that reads nothing at all costs 510-760ms from there — the cost is that
 * it is a round trip at all, started only once the page had hydrated.
 *
 * This layout runs in the same region as the database, builds the very same
 * answer through the very same handler and dependencies the route uses
 * (lib/dashboard/live-deps.ts, so the two cannot drift apart), and writes it
 * into the HTML. The screen reads it on its first render and paints with real
 * content instead of a skeleton.
 *
 * IT IS AWAITED, NOT STREAMED. That is the whole trade: the document waits for
 * this read, and in exchange a browser round trip disappears. A Suspense
 * boundary would keep the document fast and arrive after the screen's own
 * effect had already fetched, which buys nothing.
 *
 * WHICH PROJECT. The active project is chosen in the browser (the URL, then
 * localStorage), so the server is told by the cookie the active-project
 * provider mirrors (lib/active-project/active-cookie.ts). The value is NEVER
 * trusted: it is only shaped-checked here, and `handleDashboardGet` reads the
 * project as its owner and answers 404 for anyone else's, so the worst a forged
 * cookie can do is waste this read and seed nothing.
 *
 * EVERY FAILURE IS SILENT AND COSTS ONLY ITSELF: no cookie, a project that is
 * not this user's, a read that throws, anything but a 200 — nothing is written,
 * and the screen asks the route exactly as it did before.
 */
import { cookies } from 'next/headers'
import HtmlSeed from '@/components/HtmlSeed'
import { ACTIVE_PROJECT_COOKIE } from '@/lib/active-project/active-cookie'
import { liveDeps } from '@/lib/dashboard/live-deps'
import { handleDashboardGet } from '@/lib/dashboard/overview'
import { dashboardOverviewUrl } from '@/lib/dashboard/urls'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function seed(): Promise<{ url: string; status: number; body: unknown } | null> {
  try {
    const projectId = (await cookies()).get(ACTIVE_PROJECT_COOKIE)?.value
    if (!projectId || !UUID.test(projectId)) return null
    const res = await handleDashboardGet(projectId, liveDeps())
    if (res.status !== 200) return null
    return { url: dashboardOverviewUrl(projectId), status: 200, body: await res.json() }
  } catch {
    return null
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const answer = await seed()
  return (
    <>
      {answer && <HtmlSeed url={answer.url} status={answer.status} body={answer.body} />}
      {children}
    </>
  )
}
