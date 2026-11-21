/**
 * POST /api/admin/shopify-seo-backfill — the operator runs the Shopify
 * search-engine-listing backfill (lib/shopify/seo-backfill.ts) INSIDE
 * production, so no store token ever leaves it. The route file only wires real
 * dependencies into this handler; the rules are here, where the QA suite
 * exercises them.
 *
 *   GET lists the projects with articles on a Shopify blog that still have no
 *       recorded listing, and how many each has.
 *   POST runs one page:
 *   - administrator only (requireAdminApi; proxy.ts does not cover /api/*),
 *     checked FIRST, before the body is even read;
 *   - one project per call (projectId, a UUID), at most `limit` articles
 *     (default 25, max 50) from `offset`;
 *   - a DRY RUN unless the body says `"apply": true` — the boolean. The string
 *     "true" and the number 1 are still a dry run, because a backfill that
 *     writes to merchants' live stores must not be startable by a loose value;
 *   - the answer is the per-article report, carrying our own short codes only.
 *     A merchant's own SEO title IS returned, because the operator has to see
 *     what was left alone — but never a token and never a provider's raw error.
 */
import type { runShopifySeoBackfillPage, ShopifyBackfillReport } from '@/lib/shopify/seo-backfill'

export const SHOPIFY_BACKFILL_DEFAULT_LIMIT = 25
export const SHOPIFY_BACKFILL_MAX_LIMIT = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Our own codes: no spaces, so no sentence from anybody else's server. */
const SAFE_DETAIL = /^[A-Za-z0-9_.,:/%?=&|-]{1,300}$/

export interface ShopifyBackfillApiDeps {
  gate: () => Promise<{ ok: true; userId: string } | { ok: false; response: Response }>
  run: (opts: Parameters<typeof runShopifySeoBackfillPage>[1]) => ReturnType<typeof runShopifySeoBackfillPage>
  listProjects: () => Promise<{ id: string; name: string; articles: number }[]>
}

const safe = (d: string | undefined) => (d === undefined ? undefined : SAFE_DETAIL.test(d) ? d : 'error')

export function sanitizeShopifyReport(r: ShopifyBackfillReport): ShopifyBackfillReport {
  return { ...r, detail: safe(r.detail) }
}

/** GET: where the gap is. Reads only. */
export async function handleShopifySeoBackfillProjects(
  deps: Pick<ShopifyBackfillApiDeps, 'gate' | 'listProjects'>,
): Promise<Response> {
  const gate = await deps.gate()
  if (!gate.ok) return gate.response
  try {
    return Response.json({ projects: await deps.listProjects() })
  } catch {
    return Response.json({ error: 'list_failed' }, { status: 500 })
  }
}

export async function handleShopifySeoBackfill(request: Request, deps: Omit<ShopifyBackfillApiDeps, 'listProjects'>): Promise<Response> {
  const gate = await deps.gate()
  if (!gate.ok) return gate.response

  let body: Record<string, unknown>
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
  if (!UUID.test(projectId)) return Response.json({ error: 'invalid_project' }, { status: 400 })
  const limitIn = body.limit === undefined ? SHOPIFY_BACKFILL_DEFAULT_LIMIT : Number(body.limit)
  const offsetIn = body.offset === undefined ? 0 : Number(body.offset)
  if (!Number.isInteger(limitIn) || limitIn < 1) return Response.json({ error: 'invalid_limit' }, { status: 400 })
  if (!Number.isInteger(offsetIn) || offsetIn < 0) return Response.json({ error: 'invalid_offset' }, { status: 400 })
  const apply = body.apply === true

  try {
    const page = await deps.run({ apply, projectId, limit: Math.min(limitIn, SHOPIFY_BACKFILL_MAX_LIMIT), offset: offsetIn })
    return Response.json({ mode: apply ? 'apply' : 'dry_run', ...page, reports: page.reports.map(sanitizeShopifyReport) })
  } catch {
    return Response.json({ error: 'backfill_failed' }, { status: 500 })
  }
}
