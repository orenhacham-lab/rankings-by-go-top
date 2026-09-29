/**
 * Reading and writing the fix queue, its audit trail and the plugin link. Server-side only.
 *
 * The service-role client BYPASSES RLS. Every query below therefore carries BOTH
 * `.eq('project_id', …)` and `.eq('user_id', …)` — the owner filter is the isolation. A QA guard
 * (lib/site-fix/__qa__/site-fix.qa.ts) fails when a `.from()` here drops either, and runs the
 * functions against another owner's rows under the same project id.
 *
 * The tables arrive with supabase/migrations/20260928000300_site_fix_queue.sql, which the owner
 * applies to Production. Until then `queueAvailable` is false and the screen hides the queue.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { AuditAction, FixChannel, FixJobRow, FixType, JobStatus } from './types'

type Admin = ReturnType<typeof createAdminClient>
export interface Scope { projectId: string; userId: string }

export class FixStoreError extends Error {
  constructor() { super('site_fix_store_failed'); this.name = 'FixStoreError' }
}

export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')
}

/** The migration is applied (both queue tables answer). A read error other than "missing" counts as available=false too. */
export async function queueAvailable(admin: Admin, scope: Scope): Promise<boolean> {
  const [jobs, audit] = await Promise.all([
    admin.from('site_fix_jobs').select('id').eq('project_id', scope.projectId).eq('user_id', scope.userId).limit(1),
    admin.from('site_fix_audit').select('id').eq('project_id', scope.projectId).eq('user_id', scope.userId).limit(1),
  ])
  return !jobs.error && !audit.error
}

// ── The plugin link ─────────────────────────────────────────────────────────

export interface PluginLinkRow {
  site_url: string
  key_id: string
  secret_encrypted: string
  secret_hint: string
  status: 'pending' | 'connected' | 'disconnected'
  plugin_version: string | null
  seo_plugin: 'yoast' | 'rankmath' | 'none' | null
  last_seen_at: string | null
  last_error_code: string | null
}

export async function readPluginLink(admin: Admin, scope: Scope): Promise<PluginLinkRow | null> {
  const { data, error } = await admin
    .from('site_fix_plugin_links')
    .select('site_url, key_id, secret_encrypted, secret_hint, status, plugin_version, seo_plugin, last_seen_at, last_error_code')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    throw new FixStoreError()
  }
  return (data as PluginLinkRow | null) ?? null
}

/** A new key replaces the old one: the plugin must be paired again with the new code. */
export async function savePluginKey(admin: Admin, scope: Scope, key: { siteUrl: string; keyId: string; secretEncrypted: string; secretHint: string }): Promise<void> {
  const now = new Date().toISOString()
  const row = {
    site_url: key.siteUrl, key_id: key.keyId, secret_encrypted: key.secretEncrypted, secret_hint: key.secretHint,
    status: 'pending', plugin_version: null, seo_plugin: null, last_error_code: null, updated_at: now,
  }
  const existing = await readPluginLink(admin, scope)
  const { error } = existing
    ? await admin.from('site_fix_plugin_links').update(row).eq('project_id', scope.projectId).eq('user_id', scope.userId)
    : await admin.from('site_fix_plugin_links').insert({ ...row, project_id: scope.projectId, user_id: scope.userId, created_at: now })
  if (error) throw new FixStoreError()
}

export async function markPluginLink(
  admin: Admin, scope: Scope,
  patch: { status: PluginLinkRow['status']; version?: string | null; seoPlugin?: PluginLinkRow['seo_plugin']; errorCode?: string | null; seen?: boolean },
): Promise<void> {
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { status: patch.status, last_error_code: patch.errorCode ?? null, updated_at: now }
  if (patch.version !== undefined) update.plugin_version = patch.version
  if (patch.seoPlugin !== undefined) update.seo_plugin = patch.seoPlugin
  if (patch.seen) update.last_seen_at = now
  const { error } = await admin.from('site_fix_plugin_links').update(update).eq('project_id', scope.projectId).eq('user_id', scope.userId)
  if (error && !isMissingTable(error)) throw new FixStoreError()
}

export async function deletePluginLink(admin: Admin, scope: Scope): Promise<void> {
  const { error } = await admin.from('site_fix_plugin_links').delete().eq('project_id', scope.projectId).eq('user_id', scope.userId)
  if (error && !isMissingTable(error)) throw new FixStoreError()
}

// ── Jobs ────────────────────────────────────────────────────────────────────

const JOB_COLUMNS = 'id, user_id, project_id, fix_type, finding_kind, page_url, payload, before_value, after_summary, channel, status, error_code, undo, remote_ref, approved_by, approved_at, approved_ip, applied_at, reverted_at, created_at, updated_at'

export async function insertJob(admin: Admin, scope: Scope, job: {
  /** A UUID made by the server: the plugin and the webhook receiver key on it. */
  id: string; fixType: FixType; findingKind: string; pageUrl: string; payload: Record<string, unknown>; before: string | null;
  after: string | null; channel: FixChannel; undo: Record<string, unknown> | null; approvedBy: string; approvedIp: string | null
}): Promise<FixJobRow> {
  const now = new Date().toISOString()
  const { data, error } = await admin.from('site_fix_jobs').insert({
    id: job.id, project_id: scope.projectId, user_id: scope.userId, fix_type: job.fixType, finding_kind: job.findingKind,
    page_url: job.pageUrl, payload: job.payload, before_value: job.before, after_summary: job.after, channel: job.channel,
    status: 'pending', undo: job.undo, approved_by: job.approvedBy, approved_at: now, approved_ip: job.approvedIp,
    created_at: now, updated_at: now,
  }).select(JOB_COLUMNS).single()
  if (error || !data) throw new FixStoreError()
  return data as FixJobRow
}

export async function updateJob(admin: Admin, scope: Scope, id: string, patch: {
  status?: JobStatus; channel?: FixChannel; errorCode?: string | null; undo?: Record<string, unknown> | null;
  remoteRef?: string | null; appliedAt?: string | null; revertedAt?: string | null
}): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.status !== undefined) update.status = patch.status
  if (patch.channel !== undefined) update.channel = patch.channel
  if (patch.errorCode !== undefined) update.error_code = patch.errorCode
  if (patch.undo !== undefined) update.undo = patch.undo
  if (patch.remoteRef !== undefined) update.remote_ref = patch.remoteRef
  if (patch.appliedAt !== undefined) update.applied_at = patch.appliedAt
  if (patch.revertedAt !== undefined) update.reverted_at = patch.revertedAt
  const { error } = await admin.from('site_fix_jobs').update(update).eq('id', id).eq('project_id', scope.projectId).eq('user_id', scope.userId)
  if (error) throw new FixStoreError()
}

export async function getJob(admin: Admin, scope: Scope, id: string): Promise<FixJobRow | null> {
  const { data, error } = await admin.from('site_fix_jobs').select(JOB_COLUMNS)
    .eq('id', id).eq('project_id', scope.projectId).eq('user_id', scope.userId).maybeSingle()
  if (error) throw new FixStoreError()
  return (data as FixJobRow | null) ?? null
}

export async function listJobs(admin: Admin, scope: Scope, limit = 50): Promise<FixJobRow[]> {
  const { data, error } = await admin.from('site_fix_jobs').select(JOB_COLUMNS)
    .eq('project_id', scope.projectId).eq('user_id', scope.userId)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) {
    if (isMissingTable(error)) return []
    throw new FixStoreError()
  }
  return (data ?? []) as FixJobRow[]
}

/** The jobs of one fix type that are done or on their way (see HOLDING_STATUSES in ./job-match). */
export async function listHoldingJobs(admin: Admin, scope: Scope, type: FixType, statuses: readonly JobStatus[]): Promise<FixJobRow[]> {
  const { data, error } = await admin.from('site_fix_jobs').select(JOB_COLUMNS)
    .eq('project_id', scope.projectId).eq('user_id', scope.userId).eq('fix_type', type)
    .in('status', [...statuses]).limit(500)
  if (error) {
    if (isMissingTable(error)) return []
    throw new FixStoreError()
  }
  return (data ?? []) as FixJobRow[]
}

// ── The audit trail (append only) ───────────────────────────────────────────

export async function appendAudit(admin: Admin, scope: Scope, row: {
  jobId: string; action: AuditAction; actorId: string | null; actorIp: string | null; channel: FixChannel | null;
  previous: string | null; next: string | null; result: string | null
}): Promise<void> {
  const cap = (s: string | null) => (s === null ? null : s.slice(0, 1_000_000))
  const { error } = await admin.from('site_fix_audit').insert({
    job_id: row.jobId, project_id: scope.projectId, user_id: scope.userId, action: row.action, actor_id: row.actorId,
    actor_ip: row.actorIp ? row.actorIp.slice(0, 64) : null, channel: row.channel, previous_value: cap(row.previous),
    new_value: cap(row.next), result_code: row.result, created_at: new Date().toISOString(),
  })
  if (error) throw new FixStoreError()
}
