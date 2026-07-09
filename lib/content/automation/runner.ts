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
import { generatePoolItem, AUTOMATION_MAX_ATTEMPTS } from '@/lib/content/automation/generate-item'
import { publishPoolItem } from '@/lib/content/automation/publish-item'
import { advanceNextPublishAt, nextPublishAtWeekdays, resolveIntervalDays, DEFAULT_PUBLISH_TIME, DEFAULT_TIMEZONE, type Cadence } from '@/lib/content/automation/schedule'

type Admin = ReturnType<typeof createAdminClient>

const STALE_LOCK_MS = 45 * 60 * 1000 // 45 minutes
const MAX_GENERATIONS_PER_RUN = Math.max(0, Number(process.env.AUTOMATION_MAX_GENERATIONS_PER_RUN) || 1)
const DESIRED_READY_AHEAD = 1

export interface PoolDiagnostic {
  projectId: string
  poolId: string
  active: boolean
  timezone: string
  nextPublishAt: string | null
  now: string
  due: boolean
  queuedCount: number
  generatedCount: number
  selectedTopicId: string | null
  selectedTopicTitle: string | null
  generateAttempted: boolean
  generateResult: string | null
  publishAttempted: boolean
  publishResult: string | null
  nextPublishAtAfter: string | null
  note: string | null
  error: string | null
}

export interface AutomationSummary {
  poolsChecked: number
  staleRecovered: number
  generated: number
  published: number
  skipped: number
  failures: number
  durationMs: number
  dryRun: boolean
  details: string[]
  diagnostics: PoolDiagnostic[]
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
  publish_days: number[] | null
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

async function countItems(admin: Admin, poolId: string, status: string): Promise<number> {
  const { count } = await admin.from('article_pool_items').select('id', { count: 'exact', head: true }).eq('pool_id', poolId).eq('status', status)
  return count ?? 0
}

interface PickedItem { id: string; topicId: string | null; topicTitle: string | null }

async function withTitle(admin: Admin, row: { id: string; topic_id: string | null } | null): Promise<PickedItem | null> {
  if (!row) return null
  let topicTitle: string | null = null
  if (row.topic_id) {
    const { data: t } = await admin.from('article_topics').select('topic').eq('id', row.topic_id).maybeSingle()
    topicTitle = (t as { topic?: string } | null)?.topic ?? null
  }
  return { id: row.id, topicId: row.topic_id, topicTitle }
}

/** Earliest item eligible for GENERATION: a fresh 'queued', or a failed
 * generation (no article yet) still under the retry cap. */
async function pickForGenerate(admin: Admin, poolId: string): Promise<PickedItem | null> {
  const { data } = await admin
    .from('article_pool_items')
    .select('id, topic_id, status, article_id, attempts')
    .eq('pool_id', poolId)
    .in('status', ['queued', 'failed', 'quality_check_failed'])
    .order('position', { ascending: true })
    .limit(20)
  const rows = (data ?? []) as { id: string; topic_id: string | null; status: string; article_id: string | null; attempts: number }[]
  const row = rows.find((r) => r.status === 'queued' || (!r.article_id && (r.attempts ?? 0) < AUTOMATION_MAX_ATTEMPTS))
  return withTitle(admin, row ? { id: row.id, topic_id: row.topic_id } : null)
}

/** Earliest item eligible for PUBLISH: a 'generated' item, or a failed publish
 * (has an article) still under the retry cap. */
async function pickForPublish(admin: Admin, poolId: string): Promise<PickedItem | null> {
  const { data } = await admin
    .from('article_pool_items')
    .select('id, topic_id, status, article_id, attempts')
    .eq('pool_id', poolId)
    .in('status', ['generated', 'failed', 'quality_check_failed'])
    .order('position', { ascending: true })
    .limit(20)
  const rows = (data ?? []) as { id: string; topic_id: string | null; status: string; article_id: string | null; attempts: number }[]
  const row = rows.find((r) => r.status === 'generated' || (!!r.article_id && (r.attempts ?? 0) < AUTOMATION_MAX_ATTEMPTS))
  return withTitle(admin, row ? { id: row.id, topic_id: row.topic_id } : null)
}

export async function runAutomation(admin: Admin, opts: { projectId?: string; dryRun?: boolean } = {}): Promise<AutomationSummary> {
  const started = Date.now()
  const dryRun = opts.dryRun === true
  const summary: AutomationSummary = { poolsChecked: 0, staleRecovered: 0, generated: 0, published: 0, skipped: 0, failures: 0, durationMs: 0, dryRun, details: [], diagnostics: [] }
  const nowMs = Date.now()
  const cutoffIso = new Date(nowMs - STALE_LOCK_MS).toISOString()

  if (!dryRun) await recoverStaleLocks(admin, opts.projectId, cutoffIso, summary)

  let poolQ = admin.from('article_pools').select('id, project_id, cadence, interval_days, publish_time, timezone, next_publish_at, publish_days').eq('is_active', true)
  if (opts.projectId) poolQ = poolQ.eq('project_id', opts.projectId)
  const { data: pools } = await poolQ
  const poolRows = (pools ?? []) as PoolRow[]
  summary.poolsChecked = poolRows.length

  // Diagnostic: an active project with NO active pool is a common "nothing runs"
  // cause. Surface it explicitly when scoped to one project.
  if (opts.projectId && poolRows.length === 0) {
    summary.diagnostics.push({
      projectId: opts.projectId, poolId: '', active: false, timezone: DEFAULT_TIMEZONE, nextPublishAt: null, now: nowIso(),
      due: false, queuedCount: 0, generatedCount: 0, selectedTopicId: null, selectedTopicTitle: null,
      generateAttempted: false, generateResult: null, publishAttempted: false, publishResult: null,
      nextPublishAtAfter: null, note: 'no_active_pool_for_project', error: null,
    })
  }

  let genBudget = MAX_GENERATIONS_PER_RUN

  for (const pool of poolRows) {
    const intervalDays = resolveIntervalDays(pool.cadence, pool.interval_days)
    const publishTime = pool.publish_time || DEFAULT_PUBLISH_TIME
    const tz = pool.timezone || DEFAULT_TIMEZONE
    const due = !!pool.next_publish_at && Date.parse(pool.next_publish_at) <= nowMs

    const diag: PoolDiagnostic = {
      projectId: pool.project_id, poolId: pool.id, active: true, timezone: tz, nextPublishAt: pool.next_publish_at,
      now: nowIso(), due, queuedCount: await countItems(admin, pool.id, 'queued'), generatedCount: await countItems(admin, pool.id, 'generated'),
      selectedTopicId: null, selectedTopicTitle: null, generateAttempted: false, generateResult: null,
      publishAttempted: false, publishResult: null, nextPublishAtAfter: pool.next_publish_at, note: null, error: null,
    }

    // ── DRY RUN: report what WOULD happen; mutate nothing. ──
    if (dryRun) {
      const pub = await pickForPublish(admin, pool.id)
      const gen = await pickForGenerate(admin, pool.id)
      if (due && pub) {
        diag.selectedTopicId = pub.topicId; diag.selectedTopicTitle = pub.topicTitle
        diag.note = 'would_publish_ready_or_retry_item'
      } else if (gen) {
        diag.selectedTopicId = gen.topicId; diag.selectedTopicTitle = gen.topicTitle
        diag.note = due ? 'would_generate_then_publish' : 'would_generate_ahead'
      } else {
        diag.note = due ? 'due_but_no_eligible_items' : 'not_due_no_work'
      }
      summary.diagnostics.push(diag)
      continue
    }

    // (D) Generate-ahead FIRST so a DUE pool with only queued items can generate
    // AND publish in the SAME run. Includes retrying a failed generation (no
    // article yet) under the attempt cap.
    if (genBudget > 0) {
      const need = due ? Math.max(DESIRED_READY_AHEAD, 1) : DESIRED_READY_AHEAD
      if (diag.generatedCount < need) {
        const q = await pickForGenerate(admin, pool.id)
        if (q) {
          diag.selectedTopicId = q.topicId; diag.selectedTopicTitle = q.topicTitle; diag.generateAttempted = true
          // Phase 3G.2 — scheduled generation also auto-inserts the topic's APPROVED
          // internal links into the draft (only user-approved links are ever inserted).
          const res = await generatePoolItem(admin, q.id, { allowRetry: true, autoApplyInternalLinks: true })
          diag.generateResult = res.status + (res.reason ? ` (${res.reason})` : '') + (res.noop ? ` [${res.noop}]` : '')
          if (res.noop !== 'already_claimed' && res.noop !== 'max_attempts') genBudget--
          if (res.status === 'generated') { summary.generated++; diag.generatedCount++ }
          else if (res.status === 'quality_check_failed' || res.status === 'failed') { summary.failures++; diag.error = res.reason ?? res.status }
          summary.details.push(`pool ${pool.id}: generate ${res.status}${res.reason ? ` (${res.reason})` : ''}`)
        }
      }
    }

    // (E) Publish the earliest READY (or retryable failed-publish) item if due — ≤1 per pool per run.
    if (due) {
      const gen = await pickForPublish(admin, pool.id)
      if (gen) {
        diag.publishAttempted = true
        const res = await publishPoolItem(admin, gen.id)
        diag.publishResult = res.status + (res.reason ? ` (${res.reason})` : '')
        if (res.status === 'published') {
          summary.published++
          // (F) Advance next slot only on a successful publish.
          const days = Array.isArray(pool.publish_days) ? pool.publish_days : []
          const nextIso = days.length
            ? nextPublishAtWeekdays(publishTime, tz, days, nowMs)
            : advanceNextPublishAt(pool.next_publish_at!, tz, publishTime, intervalDays, nowMs)
          await admin.from('article_pools').update({ next_publish_at: nextIso, updated_at: nowIso() }).eq('id', pool.id)
          diag.nextPublishAtAfter = nextIso
          summary.details.push(`pool ${pool.id}: published ${res.articleId ?? '?'} → next ${nextIso}`)
        } else {
          // (E/H) Do NOT advance; leave failed/quality_check_failed for manual retry.
          summary.failures++; diag.error = res.reason ?? res.status
          summary.details.push(`pool ${pool.id}: publish ${res.status}${res.reason ? ` (${res.reason})` : ''}`)
        }
      } else {
        // Due but nothing generated (e.g. no queued items or generation failed).
        summary.skipped++
        diag.note = diag.queuedCount === 0 ? 'due_but_no_queued_items' : 'due_but_generation_did_not_produce_item'
        summary.details.push(`pool ${pool.id}: due, no generated item ready`)
      }
    }

    console.log('[automation-runner] pool', {
      projectId: diag.projectId, poolId: diag.poolId, due: diag.due, queued: diag.queuedCount, generated: diag.generatedCount,
      generateResult: diag.generateResult, publishResult: diag.publishResult, note: diag.note, error: diag.error,
    })
    summary.diagnostics.push(diag)
  }

  summary.durationMs = Date.now() - started
  return summary
}
