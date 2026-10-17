/**
 * GET /api/content/existing?projectId=…&tab=&q=&sort=&risk=&offset=&limit=
 *
 * The "existing content" screen's data: every page already on the merchant's
 * site (the full-site mapping, the store's synced entities, the WordPress index,
 * the seeding crawl and Search Console's pages, merged), with Search Console's
 * 28-day figures and the cannibalization risk per page. It answers the TRUE
 * totals of every tab and one page of one tab (searched and sorted here, so a
 * 900-product store never ships 900 rows to the browser).
 *
 * READ-ONLY. It writes nothing and calls no Shopify, WordPress or Google API; the
 * screen's "resync" button calls the existing sync routes, and the mapping runs
 * through /api/content/existing/map, not this one.
 *
 * proxy.ts does not cover /api/*, so this route authenticates itself:
 * authContentProject checks the session and that the caller OWNS the project. The
 * admin client bypasses RLS, so the loader filters every read by the project and
 * its owner (lib/content/existing-content/load.ts). Errors are stable codes, never
 * database text.
 */
import { authContentProject, isContentModuleEnabled, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { loadExistingContent } from '@/lib/content/existing-content/load'
import { parseView, toPayload } from '@/lib/content/existing-content/model'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const params = new URL(request.url).searchParams
  const projectId = params.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    const index = await loadExistingContent(
      auth.admin,
      { projectId: auth.project.id, userId: auth.user.id },
      { gscEnabled: isGscReadOnlyEnabled(), wordpressRefreshEnabled: isInternalLinkPlanningEnabled() },
    )
    const payload = toPayload(index, parseView(params, index.gsc.state === 'ok'))
    return Response.json({ ok: true, ...payload })
  } catch {
    console.error('[existing-content] read failed')
    return Response.json({ ok: false, error: 'existing_content_read_failed' }, { status: 500 })
  }
}
