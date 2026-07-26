/**
 * Run-summary reporting QA (presentation only).
 *
 * DEFECT: the run summary rendered `engineFiltered` — a SUBTRACTION (generated − accepted)
 * — beside route-level counters that are structurally 0 whenever the ENGINE did the
 * rejecting. Measured on a real project: "25 ideas generated · 24 failed quality checks ·
 * 0 duplicates · 0 quality-filtered · 0 existing keyword · 0 covered". Every itemised
 * category read 0 because only ONE candidate ever reached the route-level filters. A
 * correct run on a saturated site was indistinguishable from a broken pipeline.
 *
 * The engine's own histogram was already computed on every run
 * (recommendations/route.ts, `engineRejectedByReason`) but only exposed inside the
 * Preview-gated persistenceTrace. It is now carried on the customer funnel and grouped here.
 *
 * Proves: grouping/collapse behaviour, the unmapped-reason fallback, the single actionable
 * case, queue depth derived from the pool's OWN cadence, the no-pool and paused states, and
 * that no internal reason string can reach the UI.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { groupRejectionReasons, shouldShowPendingAction, queueDepth, RUN_REASON_GROUPS } from '../run-summary'
import { resolveIntervalDays } from '../automation/schedule'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function main() {
  console.log('Run-summary reporting — grouped reasons + schedule-aware queue depth\n')

  // ── A) the measured Perfume Club run ──────────────────────────────────────────
  console.log('A) the real run that motivated this')
  {
    const real = { title_keyword_mismatch: 5, source_only_entity_expansion: 5, existing_content_owns_need: 3, exact_existing_keyword_owner: 2, primary_keyword_not_search_phrase: 1 }
    const g = groupRejectionReasons(real)
    check('A1. the four "already covered" variants collapse into ONE line',
      g[0].key === 'covered' && g[0].count === 10, JSON.stringify(g))
    check('A2. strongest first', g.map((x) => x.count).every((c, i, a) => i === 0 || a[i - 1] >= c), JSON.stringify(g))
    check('A3. at most 3 groups + optional catch-all', g.length <= 4)
    check('A4. counts reconcile to the engine total (16)', g.reduce((s, x) => s + x.count, 0) === 16)
    check('A5. NOT pending-led → no actionable line', !shouldShowPendingAction(g))
  }

  // ── B) grouping + collapse rules ──────────────────────────────────────────────
  console.log('\nB) grouping and collapse')
  {
    check('B1. all four covered-family reasons map to one key',
      ['source_only_entity_expansion', 'exact_existing_keyword_owner', 'existing_content_owns_need', 'already_covered']
        .every((r) => RUN_REASON_GROUPS[r] === 'covered'))
    check('B2. both pending reasons map to one key',
      ['pending_semantic_duplicate', 'pending_exact_duplicate'].every((r) => RUN_REASON_GROUPS[r] === 'pending'))
    check('B3. the three model-output reasons stay DISTINCT (they are our defects, not one bucket)',
      RUN_REASON_GROUPS.title_keyword_mismatch === 'title_keyword'
      && RUN_REASON_GROUPS.intent_keyword_mismatch === 'intent_keyword'
      && RUN_REASON_GROUPS.primary_keyword_not_search_phrase === 'keyword_phrase')
    check('B4. an UNMAPPED reason degrades to the catch-all (never leaks a raw identifier)',
      JSON.stringify(groupRejectionReasons({ some_future_engine_reason: 4 })) === JSON.stringify([{ key: 'other', count: 4 }]))
    check('B5. beyond topN the tail folds into ONE "other" entry, totals preserved', (() => {
      const g = groupRejectionReasons({ already_covered: 9, pending_exact_duplicate: 7, brief_semantic_duplicate: 5, title_keyword_mismatch: 3, intent_keyword_mismatch: 2 })
      return g.length === 4 && g[3].key === 'other' && g.reduce((s, x) => s + x.count, 0) === 26
    })())
    check('B6. empty / null histogram → no groups (caller falls back to the old line)',
      groupRejectionReasons({}).length === 0 && groupRejectionReasons(null).length === 0 && groupRejectionReasons(undefined).length === 0)
    check('B7. zero and negative counts are ignored', groupRejectionReasons({ already_covered: 0, title_keyword_mismatch: -3 }).length === 0)
    check('B8. deterministic for the same input',
      JSON.stringify(groupRejectionReasons({ already_covered: 4, pending_exact_duplicate: 4 })) === JSON.stringify(groupRejectionReasons({ pending_exact_duplicate: 4, already_covered: 4 })))
  }

  // ── C) the ONE actionable case ────────────────────────────────────────────────
  console.log('\nC) exactly one actionable line, and only where action is real')
  {
    check('C1. pending-led → actionable', shouldShowPendingAction(groupRejectionReasons({ pending_semantic_duplicate: 9, already_covered: 2 })))
    check('C2. covered-led → NOT actionable (the space IS covered; the only "fix" is cannibalisation)',
      !shouldShowPendingAction(groupRejectionReasons({ already_covered: 9, pending_exact_duplicate: 2 })))
    check('C3. title/keyword-led → NOT actionable (our model-output defect, not the customer\'s)',
      !shouldShowPendingAction(groupRejectionReasons({ title_keyword_mismatch: 9 }))
      && !shouldShowPendingAction(groupRejectionReasons({ intent_keyword_mismatch: 9 }))
      && !shouldShowPendingAction(groupRejectionReasons({ primary_keyword_not_search_phrase: 9 })))
    check('C4. same-run-led → NOT actionable', !shouldShowPendingAction(groupRejectionReasons({ brief_semantic_duplicate: 9 })))
    check('C5. no groups → no actionable line', !shouldShowPendingAction([]))
  }

  // ── D) queue depth from the pool's OWN cadence ────────────────────────────────
  console.log('\nD) queue depth uses the real schedule, never an assumed rate')
  {
    const weekly = { isActive: true, intervalDays: resolveIntervalDays('weekly', null) }
    const twiceWeekly = { isActive: true, intervalDays: resolveIntervalDays('custom', 3) }
    const daily = { isActive: true, intervalDays: resolveIntervalDays('daily', null) }
    check('D1. resolveIntervalDays drives it (weekly=7, daily=1, custom honours interval_days)',
      weekly.intervalDays === 7 && daily.intervalDays === 1 && twiceWeekly.intervalDays === 3)
    check('D2. 55 ready @ weekly → healthy, 55 weeks', (() => { const q = queueDepth(55, weekly); return q.kind === 'healthy' && q.weeks === 55 })())
    check('D3. the SAME 55 @ ~2/week → 24 weeks, not 55 (the rate genuinely matters)',
      queueDepth(55, twiceWeekly).weeks === 24)
    check('D4. 55 @ daily → 8 weeks (an assumed weekly rate would have said 55)',
      queueDepth(55, daily).weeks === 8)
    check('D5. 3 ready @ weekly → thinning', queueDepth(3, weekly).kind === 'thinning')
    check('D6. below ~2 weeks of runway the copy switches to DAYS',
      queueDepth(1, weekly).kind === 'thinning_days' && queueDepth(1, weekly).days === 7)
    check('D7. thinning is measured in DAYS of runway, so a 3-item MONTHLY queue is NOT thinning',
      queueDepth(3, { isActive: true, intervalDays: 30 }).kind === 'healthy')
    check('D8. 0 ready with an active pool → empty', queueDepth(0, weekly).kind === 'empty')
  }

  // ── E) no-pool and paused states carry NO rate ────────────────────────────────
  console.log('\nE) no-pool and paused are distinguished, and carry no invented rate')
  {
    check('E1. no pool → no_pool', queueDepth(5, null).kind === 'no_pool')
    check('E2. no pool + 0 ready → no_pool_empty', queueDepth(0, null).kind === 'no_pool_empty')
    check('E3. paused pool → paused (NOT "set a schedule" — they have one)', queueDepth(5, { isActive: false, intervalDays: 7 }).kind === 'paused')
    check('E4. paused + 0 ready → paused_empty', queueDepth(0, { isActive: false, intervalDays: 7 }).kind === 'paused_empty')
    check('E5. no-pool/paused states expose ZERO weeks and days (no assumed cadence)',
      [queueDepth(5, null), queueDepth(0, null), queueDepth(5, { isActive: false, intervalDays: 7 })]
        .every((q) => q.weeks === 0 && q.days === 0))
  }

  // ── F) copy exists in BOTH languages and is forward-looking ───────────────────
  console.log('\nF) he + en copy')
  {
    const keys = ['runReasonCovered', 'runReasonPending', 'runReasonSameRun', 'runReasonTitleKeyword',
      'runReasonIntentKeyword', 'runReasonKeywordPhrase', 'runReasonOther', 'runSummaryHeading', 'runSummaryAction',
      'queueHealthy', 'queueHealthyDays', 'queueThinning', 'queueThinningDays', 'queueEmpty',
      'queueNoPool', 'queueNoPoolEmpty', 'queuePaused', 'queuePausedEmpty'] as const
    for (const lang of ['he', 'en'] as const) {
      const d = getDashboardDictionary(lang).contentHub.autoIdeas as unknown as Record<string, string>
      check(`F. ${lang}: every string present and non-empty`, keys.every((k) => typeof d[k] === 'string' && d[k].length > 0),
        JSON.stringify(keys.filter((k) => !d[k])))
    }
    const he = getDashboardDictionary('he').contentHub.autoIdeas as unknown as Record<string, string>
    const en = getDashboardDictionary('en').contentHub.autoIdeas as unknown as Record<string, string>
    // The exhausted state must NOT read as terminal — it must name a next step.
    check('F3. he exhausted copy offers a next step (generate / approve)',
      he.queueEmpty.includes('הפיקו') && he.queueEmpty.includes('אשרו'))
    check('F4. en exhausted copy offers a next step (generate / approve)',
      /generate/i.test(en.queueEmpty) && /approve/i.test(en.queueEmpty))
    check('F5. thinning copy frames generating more as ROUTINE, not a warning',
      /שגרה/.test(he.queueThinning) && /routine/i.test(en.queueThinning))
    check('F6. placeholders match the fields the renderer substitutes',
      he.queueHealthy.includes('{n}') && he.queueHealthy.includes('{w}') && he.queueHealthyDays.includes('{d}')
      && en.queueHealthy.includes('{n}') && en.queueHealthy.includes('{w}') && en.queueHealthyDays.includes('{d}'))
    // SEQUENCING (the real customer flow is: connect platform → generate topics → add to
    // queue → set a schedule). Each state must name ONLY its own immediate next action.
    // A no-pool customer has not queued anything yet, so pointing them at scheduling is two
    // steps ahead — and it collided with the K5 "connect your platform" card rendered above,
    // putting step 1 and step 4 on screen at once.
    check('F8. neither no-pool string mentions scheduling (he)',
      !/לוח פרסום/.test(he.queueNoPool) && !/לוח פרסום/.test(he.queueNoPoolEmpty),
      JSON.stringify([he.queueNoPool, he.queueNoPoolEmpty]))
    check('F9. neither no-pool string mentions scheduling (en)',
      !/schedule/i.test(en.queueNoPool) && !/schedule/i.test(en.queueNoPoolEmpty),
      JSON.stringify([en.queueNoPool, en.queueNoPoolEmpty]))
    check('F10. no-pool WITH topics names the queue step (step 3), not scheduling',
      /תור/.test(he.queueNoPool) && /queue/i.test(en.queueNoPool))
    check('F11. no-pool with NO topics names generating (step 2) only',
      /הפיקו/.test(he.queueNoPoolEmpty) && /generate/i.test(en.queueNoPoolEmpty)
      && !/תור/.test(he.queueNoPoolEmpty) && !/queue/i.test(en.queueNoPoolEmpty))
    check('F12. the PAUSED state (post-queue) is the only no-rate state that may mention scheduling',
      !/הוסיפו/.test(he.queuePaused) && !/add them/i.test(en.queuePaused))
    check('F13. paused and no-pool copy are distinct in BOTH languages (states never collapse)',
      he.queuePaused !== he.queueNoPool && he.queuePausedEmpty !== he.queueNoPoolEmpty
      && en.queuePaused !== en.queueNoPool && en.queuePausedEmpty !== en.queueNoPoolEmpty)
    check('F7. NO internal engine reason string appears in customer copy',
      Object.keys(RUN_REASON_GROUPS).every((r) => !Object.values(he).some((v) => typeof v === 'string' && v.includes(r))
        && !Object.values(en).some((v) => typeof v === 'string' && v.includes(r))))
  }

  // ── G) blast radius — presentation only ───────────────────────────────────────
  console.log('\nG) presentation only')
  {
    const route = stripComments(read('app/api/content/automation/recommendations/route.ts'))
    const ui = stripComments(read('components/content/AutomationIdeas.tsx'))
    check('G1. the route only ADDS the already-computed histogram to the customer funnel',
      /rejectedByReason: engineRejectedByReason/.test(route))
    check('G2. engineRejectedByReason is still computed exactly as before (no new computation)',
      /const engineRejectedByReason = briefDiagnostics\?\.rejected_by_reason \?\? opportunityDiagnostics\?\.rejected_by_reason \?\? \{\}/.test(route))
    check('G3. engineFiltered is still the same subtraction (unchanged)',
      /const engineFiltered = Math\.max\(0, rawGeneratedCount - engineAcceptedCount\)/.test(route))
    check('G4. the UI renders GROUP KEYS through the dictionary, never a raw reason',
      /label\[g\.key\]/.test(ui) && !/rejectedByReason\[/.test(ui))
    check('G5. the old funnel line survives as a fallback when a run carries no histogram',
      /t\.funnelLine/.test(ui))
    check('G6. queue depth is fed by resolveIntervalDays off the POOL row',
      /resolveIntervalDays\(d\.pool\.cadence, d\.pool\.intervalDays\)/.test(ui))
    check('G7. the pool read is best-effort and never blocks the view',
      /catch \{ \/\* ignore — queue line stays hidden \*\/ \}/.test(read('components/content/AutomationIdeas.tsx')))
    check('G8. no engine file touched — run-summary.ts is pure and imports no engine module',
      !/from '\.\/recommendations\//.test(read('lib/content/run-summary.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
