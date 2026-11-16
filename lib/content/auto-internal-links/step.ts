/**
 * The automatic internal links' ONE hook into article generation
 * (lib/content/article-generation.ts calls it once, after the draft is saved
 * and the customer's own approved plan links, if any, were placed). It reads
 * the project's latest site mapping, chooses and places the links
 * (./select.ts), and writes the draft's body and its internal_links_json.
 *
 * Every path: manual "generate now", the automation queue and the cron. No
 * approval step: the customer's approval of the article covers its links, and
 * the article view lists them with a remove button (./entries.ts).
 *
 * BEST-EFFORT: it never throws and never fails generation; one log line says
 * what happened. Draft only (the update is filtered on status 'draft'), never
 * publishes. The service role bypasses RLS, so every read and write names the
 * project and its owner. Kill switch: AUTO_INTERNAL_LINKS_DISABLED=true.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { readSiteMap } from '@/lib/content/existing-content/site-map-store'
import { autoLinkCandidates, autoLinkHost, selectAutoLinks } from './select'
import { AUTO_SOURCE, type AutoLinkEntry } from './entries'
import { DEFAULT_CONTENT_LANGUAGE, normalizeContentLanguage, type ContentLanguage } from '@/lib/content/language'

type Admin = ReturnType<typeof createAdminClient>

/** A mapping older than this may list pages that are gone: not used. */
export const AUTO_LINK_MAP_MAX_AGE_MS = 30 * 24 * 3600_000

export type AutoLinkStepOutcome =
  | { outcome: 'linked'; links: number }
  | { outcome: 'skipped'; reason: 'disabled' | 'not_found' | 'not_draft' | 'no_site' | 'no_map' | 'stale_map' | 'no_candidates' | 'none_relevant' | 'targets_gone' | 'write_failed' | 'error' }

export interface AutoLinkStepInput { projectId: string; userId: string; articleId: string }

/**
 * DOES THE PAGE WE ARE ABOUT TO LINK ACTUALLY ANSWER?
 *
 * The candidates come from the site's own sitemap, and a sitemap is a claim
 * about the past: buy-buy.co.il's listed 628 filter addresses, eleven of which
 * were linked from published articles and every one of them answered 404 (Oren
 * found the first, "אינטגרלי", on 16 November 2026). A broken link in a
 * merchant's own article is worse than no link, so each chosen target is asked
 * once, here, before anything is written.
 *
 * ONLY A DEFINITE "GONE" DROPS A LINK: 404 or 410. A timeout, a reset, a 403 or
 * 429 (bot protection and rate limits, which answered on four of the fleet's
 * own sites while this was measured) and any 5xx mean we do not know, and an
 * unknown is treated as alive — otherwise one unlucky minute would strip the
 * links out of a perfectly good article. HEAD first because it costs the
 * merchant's site almost nothing; a site that refuses HEAD is asked with GET.
 */
export const LINK_CHECK_TIMEOUT_MS = 8000
/** How many times the choice is remade after a chosen page turned out to be gone. */
export const AUTO_LINK_CHECK_ROUNDS = 3
export type LinkLiveness = 'alive' | 'gone'

export async function checkLinkTarget(url: string): Promise<LinkLiveness> {
  const ask = async (method: 'HEAD' | 'GET'): Promise<number | null> => {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), LINK_CHECK_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctl.signal,
        headers: { 'user-agent': 'GoTopSEO-LinkCheck/1.0', accept: 'text/html,application/xhtml+xml' },
      })
      return res.status
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
  const gone = (s: number | null) => s === 404 || s === 410
  const head = await ask('HEAD')
  if (gone(head)) return 'gone'
  // A site that will not answer HEAD (405/501, or nothing at all) gets one GET.
  if (head !== null && head < 400) return 'alive'
  const get = await ask('GET')
  return gone(get) ? 'gone' : 'alive'
}

export async function runAutoInternalLinksStep(
  admin: Admin,
  input: AutoLinkStepInput,
  deps: { now?: () => Date; env?: Record<string, string | undefined>; checkUrl?: (url: string) => Promise<LinkLiveness> } = {},
): Promise<AutoLinkStepOutcome> {
  const env = deps.env ?? process.env
  const now = (deps.now ?? (() => new Date()))()
  const checkUrl = deps.checkUrl ?? checkLinkTarget
  const result = await run(admin, input, env, now, checkUrl).catch((): AutoLinkStepOutcome => ({ outcome: 'skipped', reason: 'error' }))
  // Everything but the kill switch is logged. 'no_map' and 'none_relevant' used
  // to be suppressed here, and they are the two COMMON outcomes, so the one
  // thing nobody could see was why an article came out with no links at all.
  if (result.outcome === 'linked' || result.reason !== 'disabled') {
    console.log('[auto-internal-links]', { articleId: input.articleId, ...result })
  }
  return result
}

async function run(
  admin: Admin,
  input: AutoLinkStepInput,
  env: Record<string, string | undefined>,
  now: Date,
  checkUrl: (url: string) => Promise<LinkLiveness>,
): Promise<AutoLinkStepOutcome> {
  if (env.AUTO_INTERNAL_LINKS_DISABLED === 'true') return { outcome: 'skipped', reason: 'disabled' }
  const { projectId, userId, articleId } = input

  const { data: proj } = await admin.from('projects').select('id, user_id, target_domain').eq('id', projectId).eq('user_id', userId).maybeSingle()
  if (!proj) return { outcome: 'skipped', reason: 'not_found' }
  const { data: art } = await admin.from('generated_articles')
    .select('id, project_id, topic_id, title, slug, status, content_html, internal_links_json')
    .eq('id', articleId).eq('project_id', projectId).maybeSingle()
  const article = art as { topic_id: string | null; title: string | null; slug: string | null; status: string; content_html: string | null; internal_links_json: unknown } | null
  if (!article || !article.content_html) return { outcome: 'skipped', reason: 'not_found' }
  if (article.status !== 'draft') return { outcome: 'skipped', reason: 'not_draft' }

  const read = await readSiteMap(admin, { projectId, userId }, { entries: true })
  if (!read.available || !read.row) return { outcome: 'skipped', reason: 'no_map' }
  const row = read.row
  // A FAILED run keeps the previous run's good entries (finishSiteMap), so
  // rejecting it on status alone threw away usable pages and cost every article
  // its links until the next successful mapping. A failed row is accepted only
  // when it actually carries entries; freshness is still judged below, the same
  // way, so nothing older than the window is ever used. A run still 'running'
  // has nothing to offer yet.
  const usableStatus = row.status === 'completed' || row.status === 'partial'
    || (row.status === 'failed' && (row.entries?.length ?? 0) > 0)
  if (!usableStatus) return { outcome: 'skipped', reason: 'no_map' }
  const finished = row.finished_at ? Date.parse(row.finished_at) : NaN
  if (!Number.isFinite(finished) || now.getTime() - finished > AUTO_LINK_MAP_MAX_AGE_MS) return { outcome: 'skipped', reason: 'stale_map' }

  // The site's host: the mapping's own origin, else the project's domain.
  const domain = String((proj as { target_domain?: string | null }).target_domain ?? '').trim()
  const host = autoLinkHost(row.site_url || '') || autoLinkHost(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`)
  if (!host) return { outcome: 'skipped', reason: 'no_site' }

  let primaryKeyword: string | null = null
  let secondaryKeywords: string[] = []
  let language: ContentLanguage = DEFAULT_CONTENT_LANGUAGE
  if (article.topic_id) {
    const { data: topic } = await admin.from('article_topics').select('primary_keyword, secondary_keywords, language').eq('id', article.topic_id).eq('project_id', projectId).maybeSingle()
    const tp = topic as { primary_keyword?: string | null; secondary_keywords?: unknown; language?: string | null } | null
    primaryKeyword = tp?.primary_keyword ?? null
    secondaryKeywords = Array.isArray(tp?.secondary_keywords) ? (tp!.secondary_keywords as unknown[]).filter((s): s is string => typeof s === 'string') : []
    language = normalizeContentLanguage(tp?.language)
  }

  const articleIn = { title: String(article.title ?? ''), slug: article.slug, primaryKeyword, secondaryKeywords, html: article.content_html, language }
  const candidates = autoLinkCandidates(row.entries, { host, allowHttp: /^http:\/\//i.test(row.site_url || '') }, articleIn)
  if (!candidates.length) return { outcome: 'skipped', reason: 'no_candidates' }

  // Choose, then CHECK the chosen pages answer; a page that is gone is taken
  // out of the pool and the choice is made again, so the article keeps its link
  // count instead of losing a link to the dead one. At most AUTO_LINK_CHECK_ROUNDS
  // rounds, so a site that answers 404 for everything costs a bounded number of
  // requests and the article simply comes out with no automatic links.
  let pool = candidates
  let chosen: ReturnType<typeof selectAutoLinks> | null = null
  for (let round = 0; round < AUTO_LINK_CHECK_ROUNDS; round++) {
    const picked = selectAutoLinks(articleIn, pool)
    if (!picked.links.length) return { outcome: 'skipped', reason: round === 0 ? 'none_relevant' : 'targets_gone' }
    const liveness = await Promise.all(picked.links.map(async (l) => [l.url, await checkUrl(l.url)] as const))
    const gone = new Set(liveness.filter(([, state]) => state === 'gone').map(([url]) => url))
    if (gone.size === 0) { chosen = picked; break }
    console.log('[auto-internal-links] target gone', { articleId: input.articleId, projectId, gone: gone.size, of: picked.links.length })
    pool = pool.filter((c) => !gone.has(c.url))
    if (!pool.length) return { outcome: 'skipped', reason: 'targets_gone' }
  }
  if (!chosen) return { outcome: 'skipped', reason: 'targets_gone' }

  const at = now.toISOString()
  const existing = Array.isArray(article.internal_links_json) ? article.internal_links_json : []
  const entries: AutoLinkEntry[] = chosen.links.map((l) => ({ source: AUTO_SOURCE, anchor: l.anchor, url: l.url, title: l.title, at }))
  const { error } = await admin.from('generated_articles')
    .update({ content_html: chosen.html, internal_links_json: [...existing, ...entries], updated_at: at })
    .eq('id', articleId).eq('project_id', projectId).eq('status', 'draft')
  if (error) return { outcome: 'skipped', reason: 'write_failed' }
  return { outcome: 'linked', links: chosen.links.length }
}
