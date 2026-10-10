/**
 * GET  /api/admin/seo-backfill — the projects with articles on WordPress.
 * POST /api/admin/seo-backfill — administrators only. Body: { projectId, limit?, offset?, apply? }.
 * A dry run unless `apply` is exactly true. All rules: lib/content/seo-backfill-api.ts.
 */
import { requireAdminApi } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { listBackfillProjects, runBackfillPage } from '@/lib/content/seo-backfill'
import { handleSeoBackfill, handleSeoBackfillProjects } from '@/lib/content/seo-backfill-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  return handleSeoBackfill(request, {
    gate: requireAdminApi,
    run: (opts) => runBackfillPage(createAdminClient(), opts),
  })
}

export async function GET() {
  return handleSeoBackfillProjects({ gate: requireAdminApi, listProjects: () => listBackfillProjects(createAdminClient()) })
}
