/**
 * Stage E2A — server-side inputs for the opportunity engine. READ-ONLY. It reads exactly the
 * latest SUCCEEDED sync run for the (project, window), its query+page rows, and project-owned
 * content evidence (topics, generated articles, indexed URLs). It never writes, and never
 * imports the recommendation engine — it queries tables by name via the admin client after
 * the caller has verified project ownership.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { latestSucceededRun } from '../service'
import type { GscMetricRow } from '../summary'
import type { ContentEvidence, OpportunityRunMeta } from './types'

type Admin = ReturnType<typeof createAdminClient>
const FETCH_CHUNK = 1000

export class OpportunityLoadError extends Error {
  code: string; status: number
  constructor(code: string, status: number, message: string) { super(message); this.name = 'OpportunityLoadError'; this.code = code; this.status = status }
}

export type OpportunityInputs =
  | { state: 'never_synced' }
  | { state: 'ok'; rows: GscMetricRow[]; evidence: ContentEvidence; runMeta: OpportunityRunMeta }

/** Read ALL metric rows for a single run (chunked). Rows from other runs are never mixed. */
async function fetchRunRows(admin: Admin, runId: string, projectId: string): Promise<GscMetricRow[]> {
  const rows: GscMetricRow[] = []
  for (let offset = 0; ; offset += FETCH_CHUNK) {
    const { data, error } = await admin
      .from('gsc_query_page_metrics')
      .select('query,page,clicks,impressions,ctr,position')
      .eq('sync_run_id', runId).eq('project_id', projectId)
      .range(offset, offset + FETCH_CHUNK - 1)
    if (error) throw new OpportunityLoadError('metrics_read_failed', 500, 'Could not read Search Console metrics.')
    const batch = (data ?? []) as GscMetricRow[]
    rows.push(...batch)
    if (batch.length < FETCH_CHUNK) break
  }
  return rows
}

/** Read project-owned content evidence. FAIL CLOSED: a database/read/schema error is thrown
 *  as a typed error and never silently degraded to empty evidence (which would fabricate a
 *  false "no_close_content_match"). A genuinely empty table is fine and yields no matches.
 *
 *  `excludeTopicIds` is a SERVER-ONLY exclusion (never browser-supplied): the created_topic
 *  decision recompute excludes exactly the just-created topic so the opportunity is evaluated
 *  in its pre-created-topic state. NO other evidence (articles/indexed URLs/other topics) is
 *  ever excluded. */
async function loadEvidence(admin: Admin, projectId: string, excludeTopicIds: Set<string> = new Set()): Promise<ContentEvidence> {
  const evidence: ContentEvidence = { topics: [], articles: [], indexedUrls: [] }

  const { data: topics, error: topicsErr } = await admin.from('article_topics').select('id,topic,primary_keyword,secondary_keywords').eq('project_id', projectId)
  if (topicsErr) throw new OpportunityLoadError('topics_read_failed', 500, 'Could not read content topics.')
  for (const t of (topics ?? []) as { id: string; topic: string | null; primary_keyword: string | null; secondary_keywords: string[] | null }[]) {
    if (excludeTopicIds.has(t.id)) continue // server-only: exclude only the validated created topic
    evidence.topics.push({ topic: t.topic ?? '', primaryKeyword: t.primary_keyword ?? null, secondaryKeywords: Array.isArray(t.secondary_keywords) ? t.secondary_keywords : [] })
  }

  const { data: articles, error: articlesErr } = await admin.from('generated_articles').select('title,slug,wp_post_url,shopify_article_url').eq('project_id', projectId)
  if (articlesErr) throw new OpportunityLoadError('articles_read_failed', 500, 'Could not read generated articles.')
  for (const a of (articles ?? []) as { title: string | null; slug: string | null; wp_post_url: string | null; shopify_article_url: string | null }[]) {
    evidence.articles.push({ title: a.title ?? '', slug: a.slug ?? '', url: a.wp_post_url ?? a.shopify_article_url ?? null })
  }

  // Indexed internal URLs from the WordPress content index (targets[].targetUrl), if present.
  const { data: idx, error: idxErr } = await admin.from('wordpress_content_index').select('targets').eq('project_id', projectId).maybeSingle()
  if (idxErr) throw new OpportunityLoadError('content_index_read_failed', 500, 'Could not read the content index.')
  const targets = (idx as { targets?: unknown[] } | null)?.targets
  if (Array.isArray(targets)) {
    for (const tgt of targets) {
      const url = (tgt as { targetUrl?: unknown })?.targetUrl
      if (typeof url === 'string' && url) evidence.indexedUrls.push(url)
    }
  }
  return evidence
}

/** Load the opportunity inputs, or the never_synced state when no succeeded run exists.
 *  `opts.excludeArticleTopicIds` is server-only (see loadEvidence). */
export async function loadOpportunityInputs(admin: Admin, projectId: string, windowDays: 28 | 90, opts?: { excludeArticleTopicIds?: string[] }): Promise<OpportunityInputs> {
  const run = await latestSucceededRun(admin, projectId, windowDays) // throws (typed) on DB error
  if (!run) return { state: 'never_synced' }
  const rows = await fetchRunRows(admin, run.id, projectId)
  const evidence = await loadEvidence(admin, projectId, new Set(opts?.excludeArticleTopicIds ?? []))
  return { state: 'ok', rows, evidence, runMeta: { projectId, windowDays, syncRunId: run.id, dateStart: run.start_date, dateEnd: run.end_date } }
}
