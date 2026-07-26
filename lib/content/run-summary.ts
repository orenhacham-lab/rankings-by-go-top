/**
 * Run-summary presentation helpers — PURE, no IO, no React.
 *
 * WHY: the run summary previously rendered `engineFiltered` (a SUBTRACTION:
 * generated − accepted) alongside route-level counters that are all structurally 0
 * whenever the engine rejected the candidates. A real, correct run on a saturated
 * project therefore read as "24 failed quality checks · 0 · 0 · 0 · 0" — identical to
 * a broken pipeline. The engine's own reason histogram was already computed on every
 * run (recommendations/route.ts) but was only exposed behind the Preview diagnostics
 * flag, so the customer never saw it.
 *
 * These helpers turn that histogram into grouped, customer-facing counts, and derive
 * queue depth from the pool's OWN cadence rather than an assumed publishing rate.
 * The UI supplies the localized label for each group key — no internal reason string
 * is ever rendered, and an unmapped reason degrades to 'other'.
 */

/** Customer-facing group keys. The UI maps each to a localized label. */
export type RunReasonKey = 'covered' | 'pending' | 'same_run' | 'title_keyword' | 'intent_keyword' | 'keyword_phrase' | 'other'

/**
 * Internal engine reason → customer group.
 *
 * The four "your site already owns this" reasons deliberately COLLAPSE into one group:
 * rendered separately they read as four near-identical lines on exactly the projects
 * (saturated catalogues) where they all fire together. The two pending-duplicate
 * reasons collapse for the same reason, and the group drives the one actionable line.
 *
 * Anything absent from this map falls through to 'other' — a new engine reason can
 * never leak a raw internal identifier into customer-facing copy.
 */
export const RUN_REASON_GROUPS: Readonly<Record<string, RunReasonKey>> = {
  // "your existing content / product pages already own this"
  source_only_entity_expansion: 'covered',
  exact_existing_keyword_owner: 'covered',
  existing_content_owns_need: 'covered',
  already_covered: 'covered',
  covered_by_existing_content: 'covered',
  weak_entity_modifier: 'covered',
  // "already queued for your review"
  pending_semantic_duplicate: 'pending',
  pending_exact_duplicate: 'pending',
  primary_keyword_exists: 'pending',
  // "duplicate of something else this same run produced"
  brief_semantic_duplicate: 'same_run',
  intra_run_need_duplicate: 'same_run',
  // model output-quality problems — OUR defects, never phrased as customer actions
  title_keyword_mismatch: 'title_keyword',
  intent_keyword_mismatch: 'intent_keyword',
  primary_keyword_not_search_phrase: 'keyword_phrase',
}

export interface GroupedReason { key: RunReasonKey; count: number }

/**
 * Group an engine rejection histogram into customer-facing counts.
 *
 * Returns at most `topN` groups, strongest first, with every remaining group folded
 * into a single trailing 'other' entry so the totals still reconcile. Ties break on a
 * stable key order so the same input always renders identically.
 */
export function groupRejectionReasons(
  rejectedByReason: Record<string, number> | null | undefined,
  topN = 3,
): GroupedReason[] {
  if (!rejectedByReason) return []
  const totals = new Map<RunReasonKey, number>()
  for (const [reason, nRaw] of Object.entries(rejectedByReason)) {
    const n = typeof nRaw === 'number' && Number.isFinite(nRaw) && nRaw > 0 ? Math.floor(nRaw) : 0
    if (n === 0) continue
    const key = RUN_REASON_GROUPS[reason] ?? 'other'
    totals.set(key, (totals.get(key) ?? 0) + n)
  }
  if (totals.size === 0) return []
  const ORDER: RunReasonKey[] = ['covered', 'pending', 'same_run', 'title_keyword', 'intent_keyword', 'keyword_phrase', 'other']
  const all = Array.from(totals, ([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
  if (all.length <= topN) return all
  const head = all.slice(0, topN)
  const tail = all.slice(topN).reduce((s, g) => s + g.count, 0)
  return tail > 0 ? [...head, { key: 'other', count: tail }] : head
}

/**
 * The ONE genuinely actionable case. Approving or dismissing pending topics really does
 * free pool capacity (each pending idea blocks roughly one brief), so it is the only
 * group that earns a call to action.
 *
 * Deliberately NOT actionable: 'covered' (the correct answer is that the space IS
 * covered — the only "fix" would be cannibalising their own pages) and the three
 * keyword/title groups (those are OUR model-output defects; telling the customer to act
 * on them misdirects our problem at them).
 */
export function shouldShowPendingAction(groups: GroupedReason[]): boolean {
  return groups.length > 0 && groups[0].key === 'pending'
}

export type QueueDepthKind =
  | 'healthy' | 'healthy_days'
  | 'thinning' | 'thinning_days'
  | 'empty'
  | 'no_pool' | 'no_pool_empty'
  | 'paused' | 'paused_empty'

export interface QueueDepth { kind: QueueDepthKind; readyCount: number; weeks: number; days: number }

export interface QueuePoolInput { isActive: boolean; intervalDays: number }

/**
 * Derive queue-depth copy state from the READY count and the pool's own interval.
 *
 * `intervalDays` MUST come from resolveIntervalDays(cadence, interval_days) on the
 * project's pool row — never an assumed rate. With no pool (or a paused one) there is no
 * rate to divide by, so those states carry no weeks/days figure at all.
 *
 * Below ~2 weeks the copy switches to days: at a monthly cadence "about 9 weeks" for two
 * queued topics reads as nonsense, while "about 60 days" is at least literal.
 */
export function queueDepth(readyCount: number, pool: QueuePoolInput | null | undefined): QueueDepth {
  const n = Number.isFinite(readyCount) && readyCount > 0 ? Math.floor(readyCount) : 0
  if (!pool) return { kind: n === 0 ? 'no_pool_empty' : 'no_pool', readyCount: n, weeks: 0, days: 0 }
  if (!pool.isActive) return { kind: n === 0 ? 'paused_empty' : 'paused', readyCount: n, weeks: 0, days: 0 }
  if (n === 0) return { kind: 'empty', readyCount: 0, weeks: 0, days: 0 }
  const interval = Number.isFinite(pool.intervalDays) && pool.intervalDays > 0 ? Math.floor(pool.intervalDays) : 7
  const days = n * interval
  const weeks = Math.round(days / 7)
  // THINNING threshold is expressed in DAYS (< 4 weeks) so it means the same thing at
  // every cadence; a 3-item monthly queue is ~90 days of runway and is NOT thinning.
  const thin = days < 28
  if (days < 14) return { kind: thin ? 'thinning_days' : 'healthy_days', readyCount: n, weeks, days }
  return { kind: thin ? 'thinning' : 'healthy', readyCount: n, weeks, days }
}
