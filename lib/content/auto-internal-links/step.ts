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
  | { outcome: 'skipped'; reason: 'disabled' | 'not_found' | 'not_draft' | 'no_site' | 'no_map' | 'stale_map' | 'no_candidates' | 'none_relevant' | 'write_failed' | 'error' }

export interface AutoLinkStepInput { projectId: string; userId: string; articleId: string }

export async function runAutoInternalLinksStep(
  admin: Admin,
  input: AutoLinkStepInput,
  deps: { now?: () => Date; env?: Record<string, string | undefined> } = {},
): Promise<AutoLinkStepOutcome> {
  const env = deps.env ?? process.env
  const now = (deps.now ?? (() => new Date()))()
  const result = await run(admin, input, env, now).catch((): AutoLinkStepOutcome => ({ outcome: 'skipped', reason: 'error' }))
  if (result.outcome === 'linked' || !['disabled', 'no_map', 'none_relevant'].includes(result.reason)) {
    console.log('[auto-internal-links]', { articleId: input.articleId, ...result })
  }
  return result
}

async function run(admin: Admin, input: AutoLinkStepInput, env: Record<string, string | undefined>, now: Date): Promise<AutoLinkStepOutcome> {
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
  if (row.status !== 'completed' && row.status !== 'partial') return { outcome: 'skipped', reason: 'no_map' }
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
  const candidates = autoLinkCandidates(row.entries, { host }, articleIn)
  if (!candidates.length) return { outcome: 'skipped', reason: 'no_candidates' }
  const chosen = selectAutoLinks(articleIn, candidates)
  if (!chosen.links.length) return { outcome: 'skipped', reason: 'none_relevant' }

  const at = now.toISOString()
  const existing = Array.isArray(article.internal_links_json) ? article.internal_links_json : []
  const entries: AutoLinkEntry[] = chosen.links.map((l) => ({ source: AUTO_SOURCE, anchor: l.anchor, url: l.url, title: l.title, at }))
  const { error } = await admin.from('generated_articles')
    .update({ content_html: chosen.html, internal_links_json: [...existing, ...entries], updated_at: at })
    .eq('id', articleId).eq('project_id', projectId).eq('status', 'draft')
  if (error) return { outcome: 'skipped', reason: 'write_failed' }
  return { outcome: 'linked', links: chosen.links.length }
}
