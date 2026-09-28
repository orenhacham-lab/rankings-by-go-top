/**
 * GET /api/content/existing?projectId=…
 *
 * The "existing content" screen's data: the pages already on the merchant's site
 * (the store's synced entities, the WordPress index, or the seeding crawl), with
 * Search Console's 28-day figures and the cannibalization risk per page.
 *
 * READ-ONLY. It writes nothing and calls no Shopify, WordPress or Google API; the
 * screen's "resync" button calls the existing sync routes, not this one.
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    const payload = await loadExistingContent(
      auth.admin,
      { projectId: auth.project.id, userId: auth.user.id },
      { gscEnabled: isGscReadOnlyEnabled(), wordpressRefreshEnabled: isInternalLinkPlanningEnabled() },
    )
    return Response.json({ ok: true, ...payload })
  } catch {
    console.error('[existing-content] read failed')
    return Response.json({ ok: false, error: 'existing_content_read_failed' }, { status: 500 })
  }
}
