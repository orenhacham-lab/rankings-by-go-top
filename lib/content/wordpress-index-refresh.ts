/**
 * Phase 3H — reusable WordPress content-index refresh (extracted from the
 * /internal-links/index/refresh route so the WordPress-connection save can
 * trigger the FIRST scan automatically in the background).
 *
 * Runs the READ-ONLY site scan and persists it into the per-project content
 * index cache. Caller must already be authorized for the project (the route
 * verifies ownership; the connection route operates on its own project).
 * Concurrency-safe: claimRefresh gives one runner per project (10-min stale
 * lock), and a fresh cache short-circuits unless force=true — so an automatic
 * trigger can never create duplicate scan jobs.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { loadWordPressCredentials } from '@/lib/content/api-auth'
import { scanWordPressSite } from '@/lib/content/wordpress-content-scan'
import {
  getCachedIndex, claimRefresh, writeSuccess, writeFailure, isStale, isVersionStale,
} from '@/lib/content/wordpress-content-index'

type Admin = ReturnType<typeof createAdminClient>

export type IndexRefreshResult =
  | { refreshed: false; outcome: 'fresh'; status: string; scanCompletedAt: string | null; expiresAt: string | null }
  | { refreshed: false; outcome: 'running' }
  | { refreshed: false; outcome: 'no_credentials'; error: string; httpStatus: number; preservedPriorIndex: boolean }
  | { refreshed: false; outcome: 'scan_failed'; preservedPriorIndex: boolean }
  | {
      refreshed: true
      outcome: 'refreshed'
      status: string
      summary: {
        uniqueTargets: number
        targetsEligible: number
        targetsWithUsableAnchors: number
        truncated: boolean
        contentItemsSkipped: number
        internalLinksExtracted: number
      }
    }

/** Run (or skip) an index refresh for a project. Never throws. */
export async function runProjectIndexRefresh(
  admin: Admin,
  opts: { projectId: string; userId: string; force?: boolean },
): Promise<IndexRefreshResult> {
  const { projectId, userId } = opts
  const force = opts.force === true

  // Fresh-cache short-circuit (skipped when force=true).
  const existing = await getCachedIndex(admin, projectId)
  if (!force && existing && (existing.scan_status === 'completed' || existing.scan_status === 'partial') && !isStale(existing) && !isVersionStale(existing)) {
    return { refreshed: false, outcome: 'fresh', status: existing.scan_status, scanCompletedAt: existing.scan_completed_at, expiresAt: existing.expires_at }
  }

  // WordPress credentials (decrypted transiently; never returned/logged).
  const wp = await loadWordPressCredentials(admin, projectId)
  if ('error' in wp) {
    await writeFailure(admin, { projectId, userId, errorMessage: `wordpress_connection: ${wp.error}`, startedAtMs: Date.now(), durationMs: 0 })
    return { refreshed: false, outcome: 'no_credentials', error: wp.error, httpStatus: wp.status, preservedPriorIndex: !!existing && existing.scan_status !== 'failed' }
  }

  // Claim a refresh slot (10-min stale-lock recovery). Preserves prior blobs.
  const claim = await claimRefresh(admin, projectId, userId, wp.creds.siteUrl)
  if (!claim.ok && claim.inProgress) return { refreshed: false, outcome: 'running' }

  // Read-only: our own published articles, for target↔generated_article matching.
  const { data: articleRows } = await admin
    .from('generated_articles')
    .select('id, title, wp_post_url, topic_id')
    .eq('project_id', projectId)
    .not('wp_post_url', 'is', null)
    .limit(500)
  const articles = ((articleRows ?? []) as { id: string; title: string | null; wp_post_url: string | null; topic_id: string | null }[]).filter((r) => r.wp_post_url)
  const topicIds = Array.from(new Set(articles.map((a) => a.topic_id).filter((x): x is string => !!x)))
  const kwByTopic = new Map<string, string>()
  if (topicIds.length > 0) {
    const { data: topicRows } = await admin.from('article_topics').select('id, primary_keyword').in('id', topicIds)
    for (const t of (topicRows ?? []) as { id: string; primary_keyword: string | null }[]) {
      if (t.primary_keyword) kwByTopic.set(t.id, t.primary_keyword)
    }
  }
  const generatedArticles = articles.map((r) => ({ url: r.wp_post_url as string, id: r.id, title: r.title ?? '', primaryKeyword: r.topic_id ? kwByTopic.get(r.topic_id) ?? null : null }))

  const scanParams = { includePages: true, maxItems: 200 }
  const startedAtMs = Date.now()
  try {
    const report = await scanWordPressSite(wp.creds, { ...scanParams, generatedArticles })
    const status = await writeSuccess(admin, { projectId, userId, report, scanParams, startedAtMs, durationMs: Date.now() - startedAtMs })
    return {
      refreshed: true,
      outcome: 'refreshed',
      status,
      summary: {
        uniqueTargets: report.uniqueTargets,
        targetsEligible: report.targetsEligible,
        targetsWithUsableAnchors: report.targetsWithUsableAnchors,
        truncated: report.truncated,
        contentItemsSkipped: report.contentItemsSkipped,
        internalLinksExtracted: report.internalLinksExtracted,
      },
    }
  } catch (e) {
    await writeFailure(admin, { projectId, userId, errorMessage: e instanceof Error ? e.message : 'scan_failed', startedAtMs, durationMs: Date.now() - startedAtMs, siteUrl: wp.creds.siteUrl })
    console.error('[wp-index-refresh] scan failed', { projectId, message: e instanceof Error ? e.message : String(e) })
    return { refreshed: false, outcome: 'scan_failed', preservedPriorIndex: !!existing && existing.scan_status !== 'failed' }
  }
}
