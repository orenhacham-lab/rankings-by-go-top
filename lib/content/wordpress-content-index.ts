/**
 * WordPress content/link index CACHE (Phase 2A) — best-effort persistence of the
 * read-only site-scan result per project (one row per project, upserted).
 *
 * Cache-only: nothing here feeds the planner, generation, publishing, cron, or
 * the queue. Every function is best-effort — a missing table (migration not
 * applied) or any error degrades gracefully. Ownership is verified by the caller
 * (authContentProject) BEFORE any of these run; the service-role admin client is
 * used only after that check.
 *
 * Safeguard: a FAILED refresh never overwrites a project's last good targets/
 * summary — writeFailure only touches status/error/timing columns, so the prior
 * blobs (and scan_completed_at / expires_at) remain readable.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { SiteScanReport } from '@/lib/content/wordpress-content-scan'
import { extractUrlHost } from '@/lib/content/internal-links'
import type { WordPressContentIndexRow, WordPressContentIndexStatus } from '@/lib/supabase/types'

type Admin = ReturnType<typeof createAdminClient>

const TABLE = 'wordpress_content_index'

/**
 * Bump when the scan classification logic changes so a cached index built by an
 * older version can be flagged as needing a refresh (versionStale).
 */
// 2a.5 — Phase 3I: direct WooCommerce Store-API product/category entity
// discovery (metadata-only), so ecommerce entities exist in the index even when
// per-item content fetches are budget/host-limited.
export const SCAN_INDEX_VERSION = '2a.5'

/** TTL for a cached index (app-enforced). Configurable; default 7 days. */
export function indexTtlDays(): number {
  const n = Number(process.env.INTERNAL_LINK_INDEX_TTL_DAYS)
  return Number.isFinite(n) && n > 0 ? n : 7
}

/** Lock recovery window: a 'running' row older than this is treated as stale. */
const RUNNING_LOCK_MS = 10 * 60 * 1000

/** completed unless the scan was truncated / skipped content / had non-fatal errors. */
export function deriveStatus(report: SiteScanReport): Exclude<WordPressContentIndexStatus, 'running' | 'failed'> {
  const partial = report.truncated || report.contentItemsSkipped > 0 || (report.errors?.length ?? 0) > 0
  return partial ? 'partial' : 'completed'
}

export function isStale(row: WordPressContentIndexRow | null): boolean {
  if (!row || !row.expires_at) return true
  const t = new Date(row.expires_at).getTime()
  return !Number.isFinite(t) || Date.now() > t
}

export function isVersionStale(row: WordPressContentIndexRow | null): boolean {
  return !!row && row.scanner_version !== SCAN_INDEX_VERSION
}

/** Rebuild the full SiteScanReport shape from the stored columns (for GET). */
export function reassembleReport(row: WordPressContentIndexRow): SiteScanReport & { projectId: string } {
  const summary = (row.summary || {}) as Record<string, unknown>
  const warnings = (row.warnings || {}) as { notes?: string[]; errors?: string[] }
  return {
    ...(summary as unknown as SiteScanReport),
    targets: (row.targets as SiteScanReport['targets']) ?? [],
    sampleLinks: (row.sample_links as SiteScanReport['sampleLinks']) ?? [],
    notes: warnings.notes ?? [],
    errors: warnings.errors ?? [],
    projectId: row.project_id,
  }
}

/** Read the cached index row (or null). Never throws. */
export async function getCachedIndex(admin: Admin, projectId: string): Promise<WordPressContentIndexRow | null> {
  try {
    const { data, error } = await admin.from(TABLE).select('*').eq('project_id', projectId).maybeSingle()
    if (error || !data) return null
    return data as WordPressContentIndexRow
  } catch {
    return null
  }
}

/**
 * Claim a refresh slot. Returns { ok:false, inProgress:true } when a fresh
 * 'running' lock is already held. Otherwise marks the row 'running' (preserving
 * any existing blobs) and returns the prior row. Best-effort.
 */
export async function claimRefresh(
  admin: Admin,
  projectId: string,
  userId: string,
  siteUrl?: string | null,
): Promise<{ ok: boolean; inProgress?: boolean; previous: WordPressContentIndexRow | null }> {
  const previous = await getCachedIndex(admin, projectId)
  if (previous?.scan_status === 'running' && previous.scan_started_at) {
    const age = Date.now() - new Date(previous.scan_started_at).getTime()
    if (Number.isFinite(age) && age < RUNNING_LOCK_MS) return { ok: false, inProgress: true, previous }
  }
  const nowIso = new Date().toISOString()
  try {
    await admin.from(TABLE).upsert(
      {
        project_id: projectId,
        user_id: userId,
        ...(siteUrl ? { site_url: siteUrl, site_host: extractUrlHost(siteUrl) } : {}),
        scan_status: 'running' as const,
        scan_started_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'project_id' },
    )
  } catch {
    /* best-effort — proceed even if the claim write failed */
  }
  return { ok: true, previous }
}

/** Persist a successful (or partial) scan result. Never throws. */
export async function writeSuccess(
  admin: Admin,
  args: { projectId: string; userId: string; report: SiteScanReport; scanParams: Record<string, unknown>; startedAtMs: number; durationMs: number },
): Promise<WordPressContentIndexStatus> {
  const { report } = args
  const status = deriveStatus(report)
  // summary = report minus the array parts (which get their own columns).
  const { targets, sampleLinks, notes, errors, ...summary } = report
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const expiresIso = new Date(nowMs + indexTtlDays() * 24 * 60 * 60 * 1000).toISOString()
  try {
    await admin.from(TABLE).upsert(
      {
        project_id: args.projectId,
        user_id: args.userId,
        site_url: report.siteUrl ?? null,
        site_host: report.hosts?.[0] ?? extractUrlHost(report.siteUrl || '') ?? null,
        scan_status: status,
        scanner_version: SCAN_INDEX_VERSION,
        scan_params: args.scanParams,
        summary,
        targets,
        sample_links: sampleLinks,
        warnings: { notes: notes ?? [], errors: errors ?? [] },
        error_message: null,
        scan_started_at: new Date(args.startedAtMs).toISOString(),
        scan_completed_at: nowIso,
        scan_duration_ms: args.durationMs,
        expires_at: expiresIso,
        updated_at: nowIso,
      },
      { onConflict: 'project_id' },
    )
  } catch {
    /* best-effort */
  }
  return status
}

/**
 * Persist a FAILED refresh WITHOUT clobbering a prior good index. Only status/
 * error/timing columns are written, so existing summary/targets/scan_completed_at
 * /expires_at remain readable. Never throws.
 */
export async function writeFailure(
  admin: Admin,
  args: { projectId: string; userId: string; errorMessage: string; startedAtMs: number; durationMs: number; siteUrl?: string | null },
): Promise<void> {
  const nowIso = new Date().toISOString()
  try {
    await admin.from(TABLE).upsert(
      {
        project_id: args.projectId,
        user_id: args.userId,
        ...(args.siteUrl ? { site_url: args.siteUrl, site_host: extractUrlHost(args.siteUrl) } : {}),
        scan_status: 'failed' as const,
        error_message: args.errorMessage.slice(0, 500),
        scan_started_at: new Date(args.startedAtMs).toISOString(),
        scan_duration_ms: args.durationMs,
        updated_at: nowIso,
        // Deliberately NOT setting summary/targets/sample_links/warnings/
        // scan_completed_at/expires_at → last good blob is preserved.
      },
      { onConflict: 'project_id' },
    )
  } catch {
    /* best-effort */
  }
}
