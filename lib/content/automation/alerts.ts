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

type Admin = ReturnType<typeof createAdminClient>

const ALERTS = 'content_automation_alerts'
const nowIso = () => new Date().toISOString()

/** Deterministic dedupe key so one item's final publish failure = one alert. */
export function publishFailureDedupeKey(poolItemId: string): string {
  return `${poolItemId}:publish_final_failure`
}

export interface RecordPublishFailureInput {
  projectId: string
  poolItemId: string
  articleId: string | null
  topicId: string | null
  title: string | null
  error: string
  attempts: number
}

/**
 * Record (or reopen) the FINAL-failure alert for a queue item. Idempotent via
 * the unique dedupe_key: repeated cron runs / re-failures update the same row
 * instead of inserting a new one. Owner is resolved from the project. No-throw.
 */
export async function recordPublishFinalFailureAlert(admin: Admin, input: RecordPublishFailureInput): Promise<void> {
  try {
    const { data: proj } = await admin.from('projects').select('user_id').eq('id', input.projectId).maybeSingle()
    const userId = (proj as { user_id?: string } | null)?.user_id
    if (!userId) return
    const dedupeKey = publishFailureDedupeKey(input.poolItemId)
    // UPSERT on dedupe_key: create when new; on conflict REOPEN (status→open) and
    // refresh error/attempts so a re-failure after a manual retry is not a dup.
    await admin.from(ALERTS).upsert({
      user_id: userId,
      project_id: input.projectId,
      pool_item_id: input.poolItemId,
      article_id: input.articleId,
      topic_id: input.topicId,
      kind: 'publish_failed_final',
      dedupe_key: dedupeKey,
      title: input.title,
      error: input.error.slice(0, 500),
      attempts: input.attempts,
      status: 'open',
      resolved_at: null,
      updated_at: nowIso(),
    }, { onConflict: 'dedupe_key' })
  } catch (e) {
    console.warn('[content-alerts] record failed (non-fatal)', { poolItemId: input.poolItemId, message: e instanceof Error ? e.message : String(e) })
  }
}

/**
 * Mark any OPEN alert for this item as resolved (recovered) — called after a
 * successful publish / reconcile. No-throw.
 */
export async function resolvePublishAlerts(admin: Admin, poolItemId: string): Promise<void> {
  try {
    await admin.from(ALERTS)
      .update({ status: 'resolved', resolved_at: nowIso(), updated_at: nowIso() })
      .eq('pool_item_id', poolItemId)
      .eq('status', 'open')
  } catch (e) {
    console.warn('[content-alerts] resolve failed (non-fatal)', { poolItemId, message: e instanceof Error ? e.message : String(e) })
  }
}
