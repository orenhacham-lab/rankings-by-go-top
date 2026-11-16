/**
 * A PUBLISHED article's automatic internal links, asked again — and the live
 * post repaired when one of them has died.
 *
 * WHY THIS EXISTS. ./step.ts asks every target before it writes a link, so no
 * new article goes out with a dead one. That check is a photograph: a merchant's
 * page can be taken down weeks after the article is live. It happened on
 * buy-buy.co.il, whose sitemap listed 628 faceted filter addresses: eleven of
 * them were linked from published articles and every one answered 404 (Oren
 * found the first, "אינטגרלי", on 16 November 2026, in an article that had been
 * live for days). Nothing in the product noticed, and nothing could fix it,
 * because removing a link in the article view never touched the published post.
 *
 * SO THIS PASS DOES BOTH HALVES:
 *   1. it asks the still-live automatic links of a published article again
 *      (./step.ts checkLinkTarget, the same rule: ONLY a 404 or a 410 counts as
 *      gone; a timeout, a 403, a 429 or any 5xx means we do not know, and an
 *      unknown is left alone), takes a dead one's <a> out of the body — the
 *      words stay — and marks the entry removed; and
 *   2. it sends the article to the site again, in place, so the LIVE post loses
 *      the dead anchor too. That second half also catches a link the CUSTOMER
 *      removed in the article view, which until now stayed in the published
 *      post for good (a removed entry with no `synced` mark: ./entries.ts).
 *
 * WHICH LINKS: the ones the system placed and knows the address of — automatic,
 * and the ones an approved topic plan placed, because 4dogsoriginal.co.il's dead
 * category came from a planned link and a 404 is a 404 (./entries.ts
 * HEALABLE_SOURCES). Never a link the article's own editor typed into the body.
 *
 * It only ever UNWRAPS an anchor and re-sends the article through the one path
 * the product already uses for an update (publishArticleToWordPress with the
 * article's existing post id — what the "update" button does). It writes no new
 * link, never changes a link the customer or a plan put there, and never
 * publishes anything that is not already published.
 *
 * BEST-EFFORT: it never throws, and one log line says what happened. Kill
 * switch: AUTO_INTERNAL_LINKS_HEAL_DISABLED=true.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { removeLink } from '@/lib/link-network/anchor'
import { healableEntries, linksNeedSync, markLinksChecked, markLinksSynced, oldestLinkCheck } from './entries'
import { checkLinkTarget, type LinkLiveness } from './step'

/** A published article's links are asked again no more often than this. */
export const HEAL_RECHECK_AFTER_MS = 14 * 24 * 3600_000
/** At most this many articles are healed in one pass. */
export const HEAL_MAX_ARTICLES_PER_RUN = 3
/** Rows read per pass before the pass chooses from them. */
export const HEAL_SCAN_ROWS = 200
/** Healing one article needs at least this much of the run's window left. */
export const HEAL_MIN_WINDOW_MS = 45_000

export interface HealScope { projectId: string; userId: string; articleId: string }

export type HealOutcome =
  | { outcome: 'clean'; checked: number }
  | { outcome: 'healed'; removed: number; resynced: boolean }
  | { outcome: 'resynced' }
  | { outcome: 'skipped'; reason: 'disabled' | 'not_found' | 'not_published' | 'no_links' | 'no_post' | 'write_failed' | 'resync_failed' | 'error' }

/** Sending the article to its site again, in place. True when the live post was updated. */
export type ResyncArticle = (admin: ServiceRoleClient, scope: HealScope) => Promise<boolean>

export interface HealDeps {
  now?: () => Date
  env?: Record<string, string | undefined>
  checkUrl?: (url: string) => Promise<LinkLiveness>
  resync?: ResyncArticle
}

type ArticleRow = {
  id: string
  project_id: string
  status: string
  wp_post_id: number | null
  content_html: string | null
  internal_links_json: unknown
}

export async function healArticleLinks(admin: ServiceRoleClient, scope: HealScope, deps: HealDeps = {}): Promise<HealOutcome> {
  const result = await heal(admin, scope, deps).catch((): HealOutcome => ({ outcome: 'skipped', reason: 'error' }))
  if (result.outcome !== 'clean' && !(result.outcome === 'skipped' && result.reason === 'disabled')) {
    console.log('[auto-link-heal]', { articleId: scope.articleId, ...result })
  }
  return result
}

async function heal(admin: ServiceRoleClient, scope: HealScope, deps: HealDeps): Promise<HealOutcome> {
  const env = deps.env ?? process.env
  if (env.AUTO_INTERNAL_LINKS_HEAL_DISABLED === 'true') return { outcome: 'skipped', reason: 'disabled' }
  const now = (deps.now ?? (() => new Date()))()
  const checkUrl = deps.checkUrl ?? checkLinkTarget
  const { projectId, userId, articleId } = scope

  // The service role bypasses RLS: the project is named with its owner, and the
  // article with its project.
  const { data: proj } = await admin.from('projects').select('id').eq('id', projectId).eq('user_id', userId).maybeSingle()
  if (!proj) return { outcome: 'skipped', reason: 'not_found' }
  const { data } = await admin.from('generated_articles')
    .select('id, project_id, status, wp_post_id, content_html, internal_links_json')
    .eq('id', articleId).eq('project_id', projectId).maybeSingle()
  const article = data as ArticleRow | null
  if (!article) return { outcome: 'skipped', reason: 'not_found' }
  if (article.status !== 'published') return { outcome: 'skipped', reason: 'not_published' }

  const entries = healableEntries(article.internal_links_json)
  if (!entries.length) return { outcome: 'skipped', reason: 'no_links' }
  const alreadyNeedsSync = linksNeedSync(article.internal_links_json)

  // Ask the links this article still carries. One request per address, however
  // many entries share it.
  const urls = [...new Set(entries.filter((e) => !e.removed).map((e) => e.url))]
  const liveness = await Promise.all(urls.map(async (url) => [url, await checkUrl(url)] as const))
  const gone = liveness.filter(([, state]) => state === 'gone').map(([url]) => url)

  const at = now.toISOString()
  let html = article.content_html ?? ''
  for (const url of gone) html = removeLink(html, url) ?? html

  if (gone.length > 0 || urls.length > 0) {
    const { error } = await admin.from('generated_articles')
      .update({
        ...(gone.length > 0 ? { content_html: html } : {}),
        internal_links_json: markLinksChecked(article.internal_links_json, gone, at),
        updated_at: at,
      })
      .eq('id', articleId).eq('project_id', projectId).eq('status', 'published')
    if (error) return { outcome: 'skipped', reason: 'write_failed' }
  }

  if (gone.length === 0 && !alreadyNeedsSync) return { outcome: 'clean', checked: urls.length }
  if (!article.wp_post_id) {
    // Nothing to send: our copy is clean and there is no published post to repair.
    const { error } = await admin.from('generated_articles')
      .update({ internal_links_json: markLinksSynced(markLinksChecked(article.internal_links_json, gone, at)), updated_at: at })
      .eq('id', articleId).eq('project_id', projectId).eq('status', 'published')
    if (error) return { outcome: 'skipped', reason: 'write_failed' }
    return gone.length > 0 ? { outcome: 'healed', removed: gone.length, resynced: false } : { outcome: 'skipped', reason: 'no_post' }
  }

  const resync = deps.resync
  if (!resync) return { outcome: 'skipped', reason: 'resync_failed' }
  const sent = await resync(admin, scope).catch(() => false)
  if (!sent) {
    // The dead link is out of our copy either way; the published post is tried
    // again on a later pass, because its entries still have no `synced` mark.
    return gone.length > 0 ? { outcome: 'healed', removed: gone.length, resynced: false } : { outcome: 'skipped', reason: 'resync_failed' }
  }
  const { data: after } = await admin.from('generated_articles')
    .select('internal_links_json').eq('id', articleId).eq('project_id', projectId).maybeSingle()
  const { error: syncErr } = await admin.from('generated_articles')
    .update({ internal_links_json: markLinksSynced((after as { internal_links_json?: unknown } | null)?.internal_links_json ?? article.internal_links_json), updated_at: at })
    .eq('id', articleId).eq('project_id', projectId).eq('status', 'published')
  if (syncErr) return { outcome: 'skipped', reason: 'write_failed' }
  return gone.length > 0 ? { outcome: 'healed', removed: gone.length, resynced: true } : { outcome: 'resynced' }
}

// ── the pass over the fleet ──────────────────────────────────────────────────

export interface HealCandidate { scope: HealScope; needsSync: boolean; oldest: number }

/**
 * PURE: which published articles to heal now, in order. A removed link the
 * published post still carries comes first, because the customer or the check
 * already decided it has to go; then the articles whose links were asked
 * longest ago, and only those past HEAL_RECHECK_AFTER_MS.
 */
export function pickArticlesToHeal(
  rows: { id: string; project_id: string; internal_links_json: unknown }[],
  owners: Map<string, string | null>,
  nowMs: number,
): HealCandidate[] {
  const unsynced: HealCandidate[] = []
  const stale: HealCandidate[] = []
  for (const row of rows) {
    const userId = owners.get(row.project_id)
    if (!userId) continue
    if (!healableEntries(row.internal_links_json).length) continue
    const scope: HealScope = { projectId: row.project_id, userId, articleId: row.id }
    const oldest = oldestLinkCheck(row.internal_links_json)
    if (linksNeedSync(row.internal_links_json)) { unsynced.push({ scope, needsSync: true, oldest }); continue }
    if (Number.isFinite(oldest) && nowMs - oldest > HEAL_RECHECK_AFTER_MS) stale.push({ scope, needsSync: false, oldest })
  }
  const byAge = (a: HealCandidate, b: HealCandidate) => a.oldest - b.oldest
  return [...unsynced.sort(byAge), ...stale.sort(byAge)]
}

export type HealPassSummary = { articles: number; healed: number; removed: number; resynced: number; failures: number }

/**
 * Heal at most HEAL_MAX_ARTICLES_PER_RUN published articles. Production only:
 * elsewhere it reads nothing and logs nothing, so a preview deployment never
 * writes to a customer's site. Never throws.
 */
export async function runLinkHeal(
  admin: ServiceRoleClient,
  opts: { deadlineAt: number; env?: Record<string, string | undefined>; nowMs?: () => number; deps?: HealDeps },
): Promise<HealPassSummary | null> {
  const env = opts.env ?? process.env
  const now = opts.nowMs ?? Date.now
  if (env.VERCEL_ENV !== 'production') return null
  if (env.AUTO_INTERNAL_LINKS_HEAL_DISABLED === 'true') return null
  try {
    if (opts.deadlineAt - now() < HEAL_MIN_WINDOW_MS) return null
    const { data: rows, error } = await admin.from('generated_articles')
      .select('id, project_id, internal_links_json')
      .eq('status', 'published')
      .not('internal_links_json', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(HEAL_SCAN_ROWS)
    if (error) return null
    const list = (rows ?? []) as { id: string; project_id: string; internal_links_json: unknown }[]
    if (!list.length) return null
    const projectIds = [...new Set(list.map((r) => r.project_id))]
    const { data: projects } = await admin.from('projects').select('id, user_id').in('id', projectIds)
    const owners = new Map(((projects ?? []) as { id: string; user_id: string | null }[]).map((p) => [p.id, p.user_id]))
    const todo = pickArticlesToHeal(list, owners, now()).slice(0, HEAL_MAX_ARTICLES_PER_RUN)
    if (!todo.length) return null
    const summary: HealPassSummary = { articles: 0, healed: 0, removed: 0, resynced: 0, failures: 0 }
    for (const c of todo) {
      if (opts.deadlineAt - now() < HEAL_MIN_WINDOW_MS) break
      summary.articles++
      const r = await healArticleLinks(admin, c.scope, { ...opts.deps, env })
      if (r.outcome === 'healed') { summary.healed++; summary.removed += r.removed; if (r.resynced) summary.resynced++ }
      else if (r.outcome === 'resynced') summary.resynced++
      else if (r.outcome === 'skipped') summary.failures++
    }
    console.log('[auto-link-heal] pass', summary)
    return summary
  } catch (e) {
    console.error('[auto-link-heal] failed', { error: e instanceof Error ? e.name : 'unknown' })
    return null
  }
}

/** The cron's way in: inside what is left of its window, isolated, never throwing. */
export const HEAL_MARGIN_MS = 10_000
export async function startIsolatedLinkHeal(
  task: (deadlineAt: number) => Promise<unknown>,
  window: { startedAtMs: number; maxDurationMs: number },
): Promise<void> {
  const deadlineAt = window.startedAtMs + window.maxDurationMs - HEAL_MARGIN_MS
  if (Date.now() >= deadlineAt) return
  try {
    await task(deadlineAt)
  } catch (e) {
    console.error('[auto-link-heal] failed', { error: e instanceof Error ? e.name : 'unknown' })
  }
}
