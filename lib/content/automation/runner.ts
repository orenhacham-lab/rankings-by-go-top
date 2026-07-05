/**
 * Content-automation runner (Phase 7) — connects the existing parts:
 *   1. Recover stale locked items (crash safety).
 *   2. Publish the earliest generated item of each DUE active pool (≤1/pool/run),
 *      then advance next_publish_at.
 *   3. Generate-ahead a bounded number of queued items to keep the queue ready.
 *
 * Fully headless (admin client). Idempotent: every mutation goes through the
 * Phase-5/6 atomic claims, so overlapping runs never duplicate generation or
 * publishing. Bounded work per run so a serverless invocation stays in budget.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { generatePoolItem } from '@/lib/content/automation/generate-item'
import { publishPoolItem } from '@/lib/content/automation/publish-item'
import { advanceNextPublishAt, resolveIntervalDays, DEFAULT_PUBLISH_TIME, DEFAULT_TIMEZONE, type Cadence } from '@/lib/content/automation/schedule'

type Admin = ReturnType<typeof createAdminClient>

const STALE_LOCK_MS = 45 * 60 * 1000 // 45 minutes
const MAX_GENERATIONS_PER_RUN = Math.max(0, Number(process.env.AUTOMATION_MAX_GENERATIONS_PER_RUN) || 1)
const DESIRED_READY_AHEAD = 1

export interface AutomationSummary {
  poolsChecked: number
  staleRecovered: number
  generated: number
  published: number
  skipped: number
  failures: number
  durationMs: number
  details: string[]
}

const nowIso = () => new Date().toISOString()

interface PoolRow {
  id: string
  project_id: string
  cadence: Cadence
  interval_days: number | null
  publish_time: string | null
  timezone: string
  next_publish_at: string | null
}

/** (C) Recover items stuck in generating/publishing past the lock timeout. */
async function recoverStaleLocks(admin: Admin, projectId: string | undefined, cutoffIso: string, summary: AutomationSummary): Promise<void> {
  let q = admin.from('article_pool_items').select('id, article_id, status').in('status', ['generating', 'publishing']).lt('locked_at', cutoffIso)
  if (projectId) q = q.eq('project_id', projectId)
  const { data: stale } = await q
  for (const it of (stale ?? []) as { id: string; article_id: string | null; status: string }[]) {
    if (it.status === 'publishing') {
      // Reconcile to published if the WP post actually exists; else fail (retryable).
      let wpPostId: number | null = null
      if (it.article_id) {
        const { data } = await admin.from('generated_articles').select('id, wp_post_id, status').eq('id', it.article_id).maybeSingle()
        wpPostId = (data as { wp_post_id?: number | null } | null)?.wp_post_id ?? null
      }
      if (wpPostId && it.article_id) {
        await admin.from('generated_articles').update({ status: 'published', published_at: nowIso(), last_error: null, updated_at: nowIso() }).eq('id', it.article_id)
        await admin.from('article_pool_items').update({ status: 'published', published_at: nowIso(), last_error: 'stale_publishing_lock_recovered', locked_at: null, updated_at: nowIso() })
          .eq('id', it.id).eq('status', 'publishing').lt('locked_at', cutoffIso)
      } else {
        if (it.article_id) await admin.from('generated_articles').update({ status: 'draft', updated_at: nowIso() }).eq('id', it.article_id).eq('status', 'publishing')
        await admin.from('article_pool_items').update({ status: 'failed', last_error: 'stale_publishing_lock_recovered', locked_at: null, updated_at: nowIso() })
          .eq('id', it.id).eq('status', 'publishing').lt('locked_at', cutoffIso)
      }
    } else {
      // generating → re-queue (the dedupe in generate-item reconciles any orphan article).
      await admin.from('article_pool_items').update({ status: 'queued', last_error: 'stale_generation_lock_recovered', locked_at: null, updated_at: nowIso() })
        .eq('id', it.id).eq('status', 'generating').lt('locked_at', cutoffIso)
    }
    summary.staleRecovered++
  }
}

export async function runAutomation(admin: Admin, opts: { projectId?: string } = {}): Promise<AutomationSummary> {
  const started = Date.now()
  const summary: AutomationSummary = { poolsChecked: 0, staleRecovered: 0, generated: 0, published: 0, skipped: 0, failures: 0, durationMs: 0, details: [] }
  const nowMs = Date.now()
  const cutoffIso = new Date(nowMs - STALE_LOCK_MS).toISOString()

  await recoverStaleLocks(admin, opts.projectId, cutoffIso, summary)

  let poolQ = admin.from('article_pools').select('id, project_id, cadence, interval_days, publish_time, timezone, next_publish_at').eq('is_active', true)
  if (opts.projectId) poolQ = poolQ.eq('project_id', opts.projectId)
  const { data: pools } = await poolQ
  const poolRows = (pools ?? []) as PoolRow[]
  summary.poolsChecked = poolRows.length

  let genBudget = MAX_GENERATIONS_PER_RUN

  for (const pool of poolRows) {
    const intervalDays = resolveIntervalDays(pool.cadence, pool.interval_days)
    const publishTime = pool.publish_time || DEFAULT_PUBLISH_TIME
    const tz = pool.timezone || DEFAULT_TIMEZONE

    // (E) Publish the earliest generated item if the pool is due — ≤1 per pool per run.
    const due = !!pool.next_publish_at && Date.parse(pool.next_publish_at) <= nowMs
    if (due) {
      const { data: gen } = await admin
        .from('article_pool_items')
        .select('id')
        .eq('pool_id', pool.id)
        .eq('status', 'generated')
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (gen) {
        const res = await publishPoolItem(admin, (gen as { id: string }).id)
        if (res.status === 'published') {
          summary.published++
          // (F) Advance next slot only on a successful publish.
          const nextIso = advanceNextPublishAt(pool.next_publish_at!, tz, publishTime, intervalDays, nowMs)
          await admin.from('article_pools').update({ next_publish_at: nextIso, updated_at: nowIso() }).eq('id', pool.id)
          summary.details.push(`pool ${pool.id}: published ${res.articleId ?? '?'} → next ${nextIso}`)
        } else {
          // (E/H) Do NOT advance; leave failed/quality_check_failed for manual retry.
          summary.failures++
          summary.details.push(`pool ${pool.id}: publish ${res.status}${res.reason ? ` (${res.reason})` : ''}`)
        }
      } else {
        // Due but nothing generated yet → wait (don't advance), generate below.
        summary.skipped++
        summary.details.push(`pool ${pool.id}: due, no generated item ready`)
      }
    }

    // (D) Generate-ahead: keep DESIRED_READY_AHEAD generated items, bounded globally.
    if (genBudget > 0) {
      const { count: readyAhead } = await admin
        .from('article_pool_items')
        .select('id', { count: 'exact', head: true })
        .eq('pool_id', pool.id)
        .eq('status', 'generated')
      if ((readyAhead ?? 0) < DESIRED_READY_AHEAD) {
        const { data: queued } = await admin
          .from('article_pool_items')
          .select('id')
          .eq('pool_id', pool.id)
          .eq('status', 'queued')
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (queued) {
          const res = await generatePoolItem(admin, (queued as { id: string }).id, { allowRetry: false })
          if (res.noop !== 'already_claimed') genBudget-- // spent budget only if we actually worked
          if (res.status === 'generated') summary.generated++
          else if (res.status === 'quality_check_failed' || res.status === 'failed') summary.failures++
          summary.details.push(`pool ${pool.id}: generate ${res.status}${res.reason ? ` (${res.reason})` : ''}`)
        }
      }
    }
  }

  summary.durationMs = Date.now() - started
  return summary
}
