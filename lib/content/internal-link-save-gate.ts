/**
 * Internal-link bulk-save CACHE GATE (pure, deterministic).
 *
 * The dry-run GET (/internal-links/plan) shows the user a reviewable plan built from the
 * currently cached site index — even when that cache is TTL-stale or scanner-version-stale.
 * Bulk-save must therefore be able to persist THE EXACT reviewed plan when it was generated
 * from the SAME cached snapshot that is still stored, WITHOUT an unconditional force.
 *
 * Identity of a reviewed snapshot = the stable pair (scannerVersion, scanCompletedAt) already
 * exposed by the GET response, stored on the cache row, and stamped onto each saved batch.
 *
 *   - no cache row               → 'missing_cache'  (unchanged refusal, never enqueue)
 *   - reviewed identity matches   → 'save'          (allowed even if now stale/version-stale;
 *                                                     staleAtCreation persisted)
 *   - reviewed identity differs   → 'cache_changed_replan_required'  (typed 409; re-review)
 *   - no reviewed identity given  → legacy force gate: stale/version-stale && !force blocks
 */

export interface CacheSnapshotIdentity {
  scannerVersion: string | null
  scanCompletedAt: string | null
}

export interface BulkSaveGateInput {
  /** A cached index row exists for the project. */
  present: boolean
  /** TTL-expired (isStale). */
  stale: boolean
  /** scanner_version !== code SCAN_INDEX_VERSION (isVersionStale). */
  versionStale: boolean
  /** row.scan_status ('ok' | 'running' | 'failed' | ...). */
  scanStatus: string | null
  /** The identity of the CURRENT cache row. */
  current: CacheSnapshotIdentity
  /** The identity of the snapshot the client reviewed (null when not supplied). */
  reviewed: CacheSnapshotIdentity | null
  /** Legacy escape hatch when no reviewed identity is supplied. */
  force: boolean
}

export type BulkSaveGateOutcome =
  | 'missing_cache'
  | 'save'
  | 'cache_changed_replan_required'
  | 'stale_blocked'

export interface BulkSaveGateResult {
  outcome: BulkSaveGateOutcome
  /** Stamp on the persisted batch when saving (the reviewed cache was stale at save time). */
  staleAtCreation: boolean
  cacheState: string
  warnings: string[]
}

const idPart = (v: string | null): string => String(v ?? '')
/** A reviewed identity is "supplied" only when at least one identity field is present. */
export function hasReviewedIdentity(r: CacheSnapshotIdentity | null): r is CacheSnapshotIdentity {
  return !!r && (r.scannerVersion != null || r.scanCompletedAt != null)
}
/** Exact match on BOTH stable identity fields. */
export function snapshotIdentityMatches(a: CacheSnapshotIdentity, b: CacheSnapshotIdentity): boolean {
  return idPart(a.scannerVersion) === idPart(b.scannerVersion) && idPart(a.scanCompletedAt) === idPart(b.scanCompletedAt)
}

export function evaluateBulkSaveGate(i: BulkSaveGateInput): BulkSaveGateResult {
  if (!i.present) return { outcome: 'missing_cache', staleAtCreation: false, cacheState: 'missing', warnings: ['no_cache_refresh_first'] }

  const warnings: string[] = []
  let cacheState = 'ok'
  if (i.scanStatus === 'running') { cacheState = 'running'; warnings.push('refresh_in_progress') }
  if (i.scanStatus === 'failed') { cacheState = 'failed_last_refresh'; warnings.push('last_refresh_failed') }
  if (i.versionStale) { cacheState = 'version_stale'; warnings.push('cache_version_stale') }
  if (i.stale) { cacheState = 'stale'; warnings.push('cache_stale') }
  const staleAtCreation = i.stale || i.versionStale

  // Reviewed-snapshot identity contract: save the EXACT reviewed plan iff the cache still is
  // the same snapshot; refuse (typed) if it changed under the user.
  if (hasReviewedIdentity(i.reviewed)) {
    if (!snapshotIdentityMatches(i.reviewed, i.current)) {
      return { outcome: 'cache_changed_replan_required', staleAtCreation, cacheState, warnings }
    }
    return { outcome: 'save', staleAtCreation, cacheState, warnings }
  }

  // Legacy path (no identity supplied): the coarse stale/version gate, bypassable by force.
  if ((i.stale || i.versionStale) && !i.force) {
    return { outcome: 'stale_blocked', staleAtCreation, cacheState, warnings }
  }
  return { outcome: 'save', staleAtCreation, cacheState, warnings }
}
