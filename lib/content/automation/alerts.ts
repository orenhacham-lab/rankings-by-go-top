/**
 * Phase 4B.1 — persisted content-automation failure alerts.
 *
 * A tiny layer on top of the EXISTING retry/attempt/reconciliation logic
 * (runner + publish-item). It records ONE persisted, project-owner-scoped
 * in-app alert after the FINAL failed publish attempt, so a scheduled publish
 * that gives up is never silently stuck. Dedupe by a deterministic key
 * (poolItemId + kind) → the cron cannot create duplicates; a re-failure after a
 * manual retry reopens the same row. A successful publish resolves it.
 *
 * Best-effort ONLY: every function swallows its own errors and never affects the
 * publish/generation outcome. No email here (Phase 4B.1 is in-app only).
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { AlertChannel } from './alert-read-model'

type Admin = ReturnType<typeof createAdminClient>

const ALERTS = 'content_automation_alerts'
const nowIso = () => new Date().toISOString()

// Alert kinds. The `kind` column is intentionally unconstrained (no CHECK), so
// adding kinds is migration-free. Each kind gets its OWN per-item dedupe suffix
// so an item can carry at most one alert of each kind (they never collide on the
// unique dedupe_key), and a later successful publish resolves all of them.
export type ContentAlertKind = 'publish_failed_final' | 'publish_blocked'

/** Deterministic dedupe key so one item's final publish failure = one alert. */
export function publishFailureDedupeKey(poolItemId: string): string {
  return `${poolItemId}:publish_final_failure`
}

/** Deterministic dedupe key for an action-required publish BLOCK (paused item). */
export function publishBlockedDedupeKey(poolItemId: string): string {
  return `${poolItemId}:publish_blocked`
}

export interface RecordPublishFailureInput {
  projectId: string
  poolItemId: string
  articleId: string | null
  topicId: string | null
  title: string | null
  error: string
  attempts: number
  /**
   * WHERE the attempt was going. Required for every publish-path caller so the
   * Content Hub can name the platform instead of assuming one — the alert used
   * to render under a hard-coded "WordPress publish failed" heading whatever the
   * project actually publishes to. Omitted ONLY for a genuinely platform-neutral
   * blocker (no connected platform, or two conflicting ones), where the honest
   * answer is that no channel was chosen; the read model renders those neutrally.
   */
  channel?: AlertChannel | null
}

/**
 * Record (or reopen) a persisted, owner-scoped alert for a queue item. Idempotent
 * via the unique dedupe_key: repeated cron runs / re-failures UPSERT (reopen) the
 * same row instead of inserting a duplicate. Owner is resolved from the project.
 * No-throw (best-effort; never affects the publish/generation outcome).
 */
async function upsertAlert(admin: Admin, input: RecordPublishFailureInput, kind: ContentAlertKind, dedupeKey: string): Promise<void> {
  try {
    const { data: proj } = await admin.from('projects').select('user_id').eq('id', input.projectId).maybeSingle()
    const userId = (proj as { user_id?: string } | null)?.user_id
    if (!userId) return
    await admin.from(ALERTS).upsert({
      user_id: userId,
      project_id: input.projectId,
      pool_item_id: input.poolItemId,
      article_id: input.articleId,
      topic_id: input.topicId,
      kind,
      channel: input.channel ?? null,
      dedupe_key: dedupeKey,
      title: input.title,
      error: input.error.slice(0, 500),
      attempts: input.attempts,
      status: 'open',
      resolved_at: null,
      updated_at: nowIso(),
    }, { onConflict: 'dedupe_key' })
  } catch (e) {
    console.warn('[content-alerts] record failed (non-fatal)', { poolItemId: input.poolItemId, kind, message: e instanceof Error ? e.message : String(e) })
  }
}

/**
 * Record (or reopen) the FINAL-failure alert after the last failed publish
 * ATTEMPT (a retryable failure that exhausted the attempt cap).
 */
export async function recordPublishFinalFailureAlert(admin: Admin, input: RecordPublishFailureInput): Promise<void> {
  await upsertAlert(admin, input, 'publish_failed_final', publishFailureDedupeKey(input.poolItemId))
}

/**
 * Record (or reopen) an action-required BLOCK alert immediately — for a
 * deterministic blocker that a retry cannot clear (missing connection/scope,
 * platform conflict, publish quality-gate failure, duplicate topic, missing
 * source image, …). The item is paused, not left to churn the retry budget.
 */
export async function recordPublishBlockedAlert(admin: Admin, input: RecordPublishFailureInput): Promise<void> {
  await upsertAlert(admin, input, 'publish_blocked', publishBlockedDedupeKey(input.poolItemId))
}

/**
 * Mark OPEN alerts as resolved after a successful publish / reconcile. No-throw.
 *
 * BY ITEM (unchanged) — the queue item that just succeeded.
 *
 * BY ARTICLE (added) — the same article on the same channel, plus legacy rows
 * that carry NO channel. A failure is about an attempt; once the article is
 * published, an older attempt's alert is history. Resolving only by pool item
 * left exactly that behind: an article re-queued as a NEW item published
 * successfully while the previous item's alert stayed open forever, which is how
 * a long-closed Shopify failure was still being shown. Scoped to the SAME
 * article, so an unrelated project or article is never touched, and to the same
 * channel (or an unknown one), so a WordPress success cannot clear a Shopify
 * failure. Two statements rather than one `.or(…)`: each predicate is explicit
 * and independently verifiable.
 */
export async function resolvePublishAlerts(
  admin: Admin,
  poolItemId: string,
  opts?: { articleId?: string | null; channel?: AlertChannel | null },
): Promise<void> {
  const patch = { status: 'resolved', resolved_at: nowIso(), updated_at: nowIso() }
  try {
    await admin.from(ALERTS).update(patch).eq('pool_item_id', poolItemId).eq('status', 'open')
  } catch (e) {
    console.warn('[content-alerts] resolve failed (non-fatal)', { poolItemId, message: e instanceof Error ? e.message : String(e) })
  }
  const articleId = opts?.articleId
  if (!articleId) return
  try {
    if (opts?.channel) {
      await admin.from(ALERTS).update(patch).eq('article_id', articleId).eq('status', 'open').eq('channel', opts.channel)
    }
    // Legacy rows predate the column; an unknown channel cannot be used to argue
    // this publication was unrelated, so a success for the article clears them.
    await admin.from(ALERTS).update(patch).eq('article_id', articleId).eq('status', 'open').is('channel', null)
  } catch (e) {
    console.warn('[content-alerts] resolve-by-article failed (non-fatal)', { articleId, message: e instanceof Error ? e.message : String(e) })
  }
}
