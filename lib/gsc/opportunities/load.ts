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

/** Read project-owned content evidence (best-effort: an unavailable source yields no matches,
 *  never a false "no data" for the metrics themselves). */
async function loadEvidence(admin: Admin, projectId: string): Promise<ContentEvidence> {
  const evidence: ContentEvidence = { topics: [], articles: [], indexedUrls: [] }

  const { data: topics } = await admin.from('article_topics').select('topic,primary_keyword,secondary_keywords').eq('project_id', projectId)
  for (const t of (topics ?? []) as { topic: string | null; primary_keyword: string | null; secondary_keywords: string[] | null }[]) {
    evidence.topics.push({ topic: t.topic ?? '', primaryKeyword: t.primary_keyword ?? null, secondaryKeywords: Array.isArray(t.secondary_keywords) ? t.secondary_keywords : [] })
  }

  const { data: articles } = await admin.from('generated_articles').select('title,slug,wp_post_url,shopify_article_url').eq('project_id', projectId)
  for (const a of (articles ?? []) as { title: string | null; slug: string | null; wp_post_url: string | null; shopify_article_url: string | null }[]) {
    evidence.articles.push({ title: a.title ?? '', slug: a.slug ?? '', url: a.wp_post_url ?? a.shopify_article_url ?? null })
  }

  // Indexed internal URLs from the WordPress content index (targets[].targetUrl), if present.
  const { data: idx } = await admin.from('wordpress_content_index').select('targets').eq('project_id', projectId).maybeSingle()
  const targets = (idx as { targets?: unknown[] } | null)?.targets
  if (Array.isArray(targets)) {
    for (const tgt of targets) {
      const url = (tgt as { targetUrl?: unknown })?.targetUrl
      if (typeof url === 'string' && url) evidence.indexedUrls.push(url)
    }
  }
  return evidence
}

/** Load the opportunity inputs, or the never_synced state when no succeeded run exists. */
export async function loadOpportunityInputs(admin: Admin, projectId: string, windowDays: 28 | 90): Promise<OpportunityInputs> {
  const run = await latestSucceededRun(admin, projectId, windowDays) // throws (typed) on DB error
  if (!run) return { state: 'never_synced' }
  const rows = await fetchRunRows(admin, run.id, projectId)
  const evidence = await loadEvidence(admin, projectId)
  return { state: 'ok', rows, evidence, runMeta: { windowDays, syncRunId: run.id, dateStart: run.start_date, dateEnd: run.end_date } }
}
