/**
 * POST /api/admin/seo-backfill — the operator runs the SEO-meta backfill (lib/content/seo-backfill.ts)
 * INSIDE production, so no secret ever leaves it. The route file only wires real dependencies into
 * this handler; the rules are here, where the QA suite exercises them.
 *
 *   GET lists the projects with articles on WordPress; POST runs one page:
 *   - administrator only (requireAdminApi; proxy.ts does not cover /api/*), checked FIRST;
 *   - one project per call (projectId, a UUID), at most `limit` articles (default 25, max 50) from
 *     `offset`, and no new article once the time budget is spent: the answer says where to go on;
 *   - a DRY RUN unless the body says `"apply": true` (the boolean; "true" or 1 is still a dry run);
 *   - the answer is the per-article report: our own codes only (a detail that is not one of our
 *     short codes is replaced), never a credential, never a provider's raw error.
 */
import type { ArticleReport, runBackfillPage } from '@/lib/content/seo-backfill'

export const BACKFILL_DEFAULT_LIMIT = 25
export const BACKFILL_MAX_LIMIT = 50
/** A call stops starting articles after this long (the route allows 300 s). */
export const BACKFILL_BUDGET_MS = 200_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Our own codes, hosts and addresses: no spaces, so no sentence from anybody else's server. */
const SAFE_DETAIL = /^[A-Za-z0-9_.:/%?=&|-]{1,300}$/

export interface BackfillApiDeps {
  gate: () => Promise<{ ok: true; userId: string } | { ok: false; response: Response }>
  run: (opts: Parameters<typeof runBackfillPage>[1]) => ReturnType<typeof runBackfillPage>
  listProjects: () => Promise<{ id: string; name: string; articles: number }[]>
  now?: () => number
}

const safe = (d: string | undefined) => (d === undefined ? undefined : SAFE_DETAIL.test(d) ? d : 'error')

export function sanitizeReport(r: ArticleReport): ArticleReport {
  return {
    ...r,
    detail: safe(r.detail),
    persisted: r.persisted ? { plugin: r.persisted.plugin, status: r.persisted.status, detail: safe(r.persisted.detail) } : r.persisted,
  }
}

/** GET: the projects with articles on WordPress (administrators only; reads, never writes). */
export async function handleSeoBackfillProjects(deps: Pick<BackfillApiDeps, 'gate' | 'listProjects'>): Promise<Response> {
  const gate = await deps.gate()
  if (!gate.ok) return gate.response
  try {
    return Response.json({ projects: await deps.listProjects() })
  } catch {
    return Response.json({ error: 'list_failed' }, { status: 500 })
  }
}

export async function handleSeoBackfill(request: Request, deps: Omit<BackfillApiDeps, 'listProjects'>): Promise<Response> {
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
  const limitIn = body.limit === undefined ? BACKFILL_DEFAULT_LIMIT : Number(body.limit)
  const offsetIn = body.offset === undefined ? 0 : Number(body.offset)
  if (!Number.isInteger(limitIn) || limitIn < 1) return Response.json({ error: 'invalid_limit' }, { status: 400 })
  if (!Number.isInteger(offsetIn) || offsetIn < 0) return Response.json({ error: 'invalid_offset' }, { status: 400 })
  const apply = body.apply === true

  const now = deps.now ?? Date.now
  try {
    const page = await deps.run({
      apply, projectId, limit: Math.min(limitIn, BACKFILL_MAX_LIMIT), offset: offsetIn, deadlineAt: now() + BACKFILL_BUDGET_MS, now,
    })
    return Response.json({ mode: apply ? 'apply' : 'dry_run', ...page, reports: page.reports.map(sanitizeReport) })
  } catch {
    return Response.json({ error: 'backfill_failed' }, { status: 500 })
  }
}
