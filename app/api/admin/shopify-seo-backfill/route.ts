/**
 * GET  /api/admin/shopify-seo-backfill — the projects with Shopify articles whose
 *      search-engine listing was never recorded.
 * POST /api/admin/shopify-seo-backfill — administrators only.
 *      Body: { projectId, limit?, offset?, apply? }. A dry run unless `apply` is
 *      exactly true. All rules: lib/shopify/seo-backfill-api.ts.
 */
import { requireAdminApi } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { listShopifySeoBackfillProjects, runShopifySeoBackfillPage } from '@/lib/shopify/seo-backfill'
import { handleShopifySeoBackfill, handleShopifySeoBackfillProjects } from '@/lib/shopify/seo-backfill-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  return handleShopifySeoBackfill(request, {
    gate: requireAdminApi,
    run: (opts) => runShopifySeoBackfillPage(createAdminClient(), opts),
  })
}

export async function GET() {
  return handleShopifySeoBackfillProjects({
    gate: requireAdminApi,
    listProjects: () => listShopifySeoBackfillProjects(createAdminClient()),
  })
}
