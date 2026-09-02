/**
 * Internal-link bulk-save CACHE GATE — deterministic reviewed-snapshot contract.
 *
 * Proves the fix for the 409-on-save defect: a plan reviewed from the cached snapshot is
 * saveable (even once TTL/version stale) when the snapshot is unchanged, and is refused with
 * a typed cache_changed_replan_required when the cache changed under the user — never a
 * silent trust of the client payload, never an enqueue on a failed save. Source guards prove
 * both clients (NewTopicsLinkPlanPanel, TopicPlanDrawer) use the same contract and the route
 * wires the pure gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { evaluateBulkSaveGate, snapshotIdentityMatches, hasReviewedIdentity } from '../internal-link-save-gate'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const ID = (scannerVersion: string | null, scanCompletedAt: string | null) => ({ scannerVersion, scanCompletedAt })
const FRESH = ID('2a.7', '2026-07-01T00:00:00Z')

async function main() {
  console.log('GATE) evaluateBulkSaveGate — reviewed-snapshot identity contract')

  // D — missing cache → typed refusal (never enqueue).
  check('D. missing cache → missing_cache', evaluateBulkSaveGate({ present: false, stale: false, versionStale: false, scanStatus: null, current: ID(null, null), reviewed: null, force: false }).outcome === 'missing_cache')

  // A — fresh cache, reviewed identity matches → save (no stale flag).
  {
    const r = evaluateBulkSaveGate({ present: true, stale: false, versionStale: false, scanStatus: 'ok', current: FRESH, reviewed: FRESH, force: false })
    check('A. fresh cache + matching reviewed snapshot → save, staleAtCreation=false', r.outcome === 'save' && r.staleAtCreation === false)
  }
  // A(legacy) — fresh cache, no reviewed identity, no force → save (unchanged behavior).
  check('A(legacy). fresh cache, no identity, no force → save', evaluateBulkSaveGate({ present: true, stale: false, versionStale: false, scanStatus: 'ok', current: FRESH, reviewed: null, force: false }).outcome === 'save')

  // B — TTL-stale but the SAME reviewed snapshot → save (no 409), staleAtCreation=true.
  {
    const r = evaluateBulkSaveGate({ present: true, stale: true, versionStale: false, scanStatus: 'ok', current: FRESH, reviewed: FRESH, force: false })
    check('B. TTL-stale + SAME reviewed snapshot → save, staleAtCreation=true, no 409', r.outcome === 'save' && r.staleAtCreation === true && r.warnings.includes('cache_stale'))
  }
  // B' — version-stale but the SAME reviewed snapshot → save.
  {
    const r = evaluateBulkSaveGate({ present: true, stale: false, versionStale: true, scanStatus: 'ok', current: ID('2a.6', '2026-07-01T00:00:00Z'), reviewed: ID('2a.6', '2026-07-01T00:00:00Z'), force: false })
    check("B'. version-stale + SAME reviewed snapshot → save, staleAtCreation=true", r.outcome === 'save' && r.staleAtCreation === true && r.warnings.includes('cache_version_stale'))
  }

  // C — the cache row changed after review (scan_completed_at advanced) → typed refusal.
  {
    const reviewed = FRESH
    const current = ID('2a.7', '2026-07-09T12:00:00Z') // rescanned since review
    const r = evaluateBulkSaveGate({ present: true, stale: false, versionStale: false, scanStatus: 'ok', current, reviewed, force: false })
    check('C. cache rescanned after review → cache_changed_replan_required (no save)', r.outcome === 'cache_changed_replan_required')
  }
  // C' — scanner version changed after review → typed refusal.
  check("C'. scanner version changed after review → cache_changed_replan_required",
    evaluateBulkSaveGate({ present: true, stale: false, versionStale: false, scanStatus: 'ok', current: ID('2a.8', '2026-07-01T00:00:00Z'), reviewed: FRESH, force: false }).outcome === 'cache_changed_replan_required')

  // Legacy stale gate (no reviewed identity): blocked without force, saved with force.
  check('legacy. stale + no identity + no force → stale_blocked', evaluateBulkSaveGate({ present: true, stale: true, versionStale: false, scanStatus: 'ok', current: FRESH, reviewed: null, force: false }).outcome === 'stale_blocked')
  check('legacy. stale + no identity + force → save', evaluateBulkSaveGate({ present: true, stale: true, versionStale: false, scanStatus: 'ok', current: FRESH, reviewed: null, force: true }).outcome === 'save')

  // Identity helpers.
  check('identity match is exact on BOTH fields', snapshotIdentityMatches(FRESH, FRESH) && !snapshotIdentityMatches(FRESH, ID('2a.7', 'x')) && !snapshotIdentityMatches(FRESH, ID('2a.8', '2026-07-01T00:00:00Z')))
  check('a partial reviewed identity still counts as supplied', hasReviewedIdentity(ID('2a.7', null)) && hasReviewedIdentity(ID(null, '2026-07-01T00:00:00Z')) && !hasReviewedIdentity(ID(null, null)) && !hasReviewedIdentity(null))

  console.log('GUARD) route + both clients use the same reviewed-snapshot contract')
  {
    const routeSrc = read('../../../app/api/content/automation/internal-links/plan/bulk-save/route.ts')
    check('route wires the pure gate + typed 409', /evaluateBulkSaveGate\(/.test(routeSrc) && /cache_changed_replan_required/.test(routeSrc) && /reviewedSnapshot/.test(routeSrc))
    check('route still refuses missing cache + preserves per-link revalidation/approval', /cacheState: 'missing'/.test(routeSrc) && /selectClientLinks|planFromCachedTargets/.test(routeSrc) && /approveBatchLinks/.test(routeSrc))

    const getSrc = read('../../../app/api/content/automation/internal-links/plan/route.ts')
    check('GET plan exposes the snapshot identity (scannerVersion + scanCompletedAt)', /scannerVersion:\s*row\.scanner_version/.test(getSrc) && /scanCompletedAt:\s*row\.scan_completed_at/.test(getSrc))

    const panelSrc = read('../../../components/content/NewTopicsLinkPlanPanel.tsx')
    check('E. NewTopicsLinkPlanPanel captures + sends reviewedSnapshot', /reviewedSnapshotRef\.current = \{ scannerVersion/.test(panelSrc) && /reviewedSnapshot: reviewedSnapshotRef\.current/.test(panelSrc) && /cache_changed_replan_required/.test(panelSrc))
    // The enqueue call now carries an explicit expectsLinks argument (this panel
    // always saves a plan first, so it is always true). The invariant under test
    // is unchanged: ONLY ids whose plan actually saved are enqueued.
    check('E. NewTopicsLinkPlanPanel enqueues ONLY saved topic ids (no blind fallback)', /if \(r\.okIds\.length === 0\)/.test(panelSrc) && /onEnqueue\(r\.okIds, true\)/.test(panelSrc) && !/idsToQueue = r\.okIds\.length > 0 \? r\.okIds : topicIdsToSave/.test(panelSrc))
    check('E. and it still CLAIMS a link plan, so the server verifies it', /onEnqueue\(r\.okIds, true\)/.test(panelSrc))

    const drawerSrc = read('../../../components/content/TopicPlanDrawer.tsx')
    check('E. TopicPlanDrawer captures + sends reviewedSnapshot + handles cache_changed', /reviewedSnapshotRef\.current = \{ scannerVersion/.test(drawerSrc) && /reviewedSnapshot: reviewedSnapshotRef\.current/.test(drawerSrc) && /cache_changed_replan_required/.test(drawerSrc))

    const heSrc = read('../../../lib/i18n/dashboard/he.ts')
    const enSrc = read('../../../lib/i18n/dashboard/en.ts')
    check('localized cache-changed message exists (he + en)', (heSrc.match(/cacheChanged:/g) ?? []).length >= 2 && (enSrc.match(/cacheChanged:/g) ?? []).length >= 2)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
