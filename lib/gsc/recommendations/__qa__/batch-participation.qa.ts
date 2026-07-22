/**
 * Stage E3A — bounded GSC synthesis participation QA (FIX 1-6). Proves the pure batch composer
 * gives at most TWO genuinely-new GSC briefs a controlled trial in the FIRST synthesis batch
 * WITHOUT displacing/reordering any normal brief, never consumes a brief twice, preserves the
 * exact contiguous slice when E3A is off / no GSC brief exists, and that the route resolves the
 * per-brief finalOutcome truthfully. Functional checks use the real exported helpers; the rest
 * are source contracts.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { composeSynthesisBatch, isGscOriginBrief } from '../../../content/recommendations/generate-from-briefs'
import { applyFinalOutcomesToGscDetails } from '../../../content/recommendations/final-outcomes'
import { applyGscBriefIntegration } from '../../../content/recommendations/gsc-briefs'
import type { OpportunityBrief } from '../../../content/recommendations/opportunity-brief'
import type { GscCandidate, GscInputDiagnostics, SelectedGscBriefDetail } from '../types'
import { topicSignature } from '../../../content/recommendations/semantic-dup'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

function brf(id: string): OpportunityBrief {
  return {
    opportunityId: id, subject: `subject ${id}`, searchNeed: 'informational', family: 'informational',
    sourceEvidence: [{ kind: 'keyword_research', text: id }], alignedDemandQuery: null, demandVolumeSource: null,
    intendedIntent: 'informational', intendedPageType: 'article', existingContentGap: true, relatedEntities: [],
    publishedCoverage: [], confidence: 0.5, briefScore: 0.5,
  }
}
const ids = (bs: OpportunityBrief[]) => bs.map((b) => b.opportunityId).join(',')
const cand = (o: Partial<GscCandidate> & { opportunityId: string; primaryQuery: string }): GscCandidate => {
  const d: GscCandidate = { opportunityId: '', primaryQuery: '', relatedQueries: [], page: 'https://x.co/p', clicks: 3, impressions: 400, ctr: 0.01, averagePosition: 8, opportunityScore: 70, reasonCodes: [], queryIntent: 'informational', signals: [], syncRunId: 'run-90', windowDays: 90 }
  return { ...d, ...o }
}
function detail(o: Partial<SelectedGscBriefDetail> & { briefId: string }): SelectedGscBriefDetail {
  const d: SelectedGscBriefDetail = { briefId: '', gscOpportunityId: 'raw', primaryQuery: 'q', queryIntent: 'informational', opportunityScore: 70, impressions: 400, clicks: 3, averagePosition: 8, relatedOpportunityIds: ['raw'], relatedQueries: ['q'], relatedPages: ['https://x.co/p'], relatedReasonCodes: [], relatedSignals: [], collapsedOpportunityCount: 1, priorityTier: 1, finalSynthesisRank: 5, consumed: false, consumedRound: null, acceptedByEngine: false, finalOutcome: null }
  return { ...d, ...o }
}
function gscInputWith(details: SelectedGscBriefDetail[]): GscInputDiagnostics {
  return { enabled: true, state: 'loaded', windowDays: 90, syncRunId: 'run-90', rawOpportunityCount: 0, supportingCandidateCount: 0, eligibleAfterIntentCount: 0, eligibleAfterBareHeadGuardCount: 0, suppressedByDecisionCount: 0, rejectedByExistingCoverageCount: 0, mergedIntoExistingCount: 0, addedAsNewBriefCount: 0, deferredByBudgetCount: 0, selectedBriefIds: [], rejectionCounts: {}, mergedGscEvidence: [], subjectlessGenericRejectedCount: 0, collapsedNearDuplicateCount: 0, uniqueNeedCountBeforeBudget: 0, trialDistinctNeedCount: 0, combinedPoolSizeBeforeDiscovery: 0, combinedPoolSizeAfterDiscovery: 0, discoveryDeficitAfterGsc: 0, discoverySkippedBecauseGscFilledDeficit: false, consumedGscBriefCount: 0, consumedGscBriefIds: [], acceptedGscSuggestionCount: 0, acceptedGscBriefIds: [], selectedGscBriefDetails: details, gscParticipation: { enabled: true, maxTrialBriefs: 2, naturalGscBriefCountInFirstBatch: 0, appendedTrialBriefCount: 0, appendedTrialBriefIds: [], totalGscBriefsConsumed: 0, participationMode: 'no_gsc_briefs' } }
}

function main() {
  console.log('GSC Stage E3A — bounded synthesis participation (FIX 1-6)')

  // ── Live Ido Sport shape: 143 normal (ranked above) + 36 GSC, target 12 ─────────
  const normals = Array.from({ length: 143 }, (_, i) => brf(`n${i}`))
  const gsc = Array.from({ length: 36 }, (_, i) => brf(`gsc:g${i}`))
  const pool = [...normals, ...gsc] // already-prioritized order: all normal above all GSC
  const batchSize = Math.max(4, Math.ceil(12 * 1.5)) // = 18 (the real engine formula)
  {
    const comp = composeSynthesisBatch({ workingPool: pool, cursor: 0, batchSize, round: 1, consumedIds: new Set(), e3aTrialActive: true, maxTrialGscBriefs: 2 })
    check('(1) 143 normal + 36 GSC, target 12 → batch = 18 normal + 2 GSC', comp.batch.length === 20 && comp.appendedIds.length === 2)
    check('(2) no normal brief is displaced (first 18 are the natural normals)', ids(comp.batch.slice(0, 18)) === ids(pool.slice(0, 18)))
    check('(3) normal relative order unchanged', comp.batch.slice(0, 18).every((b, i) => b.opportunityId === `n${i}`))
    check('(4) the two appended are the HIGHEST-ranked available GSC briefs', comp.appendedIds.join(',') === 'gsc:g0,gsc:g1')
    check('(4b) appended land strictly AFTER the natural batch', comp.batch[18].opportunityId === 'gsc:g0' && comp.batch[19].opportunityId === 'gsc:g1')
    check('(12) batch grows by no more than two', comp.batch.length - 18 <= 2)
    check('(participation) naturalGscCount 0 → appended trial of 2', comp.naturalGscCount === 0 && comp.appendedIds.length === 2)
  }

  // ── FIX 2 — an appended GSC brief is never consumed twice ────────────────────────
  {
    const consumed = new Set<string>()
    const r1 = composeSynthesisBatch({ workingPool: pool, cursor: 0, batchSize, round: 1, consumedIds: consumed, e3aTrialActive: true, maxTrialGscBriefs: 2 })
    r1.batch.forEach((b) => consumed.add(b.opportunityId))
    const r2 = composeSynthesisBatch({ workingPool: pool, cursor: r1.nextCursor, batchSize, round: 2, consumedIds: consumed, e3aTrialActive: true, maxTrialGscBriefs: 2 })
    check('(5) an appended GSC brief is NOT consumed again in round two', !r2.batch.some((b) => b.opportunityId === 'gsc:g0' || b.opportunityId === 'gsc:g1'))
    const all = [...r1.batch, ...r2.batch].map((b) => b.opportunityId)
    check('(6) every brief is consumed at most once across rounds', new Set(all).size === all.length)
    check('(5b) round-2 appends nothing (append is first-round only)', r2.appendedIds.length === 0)
  }

  // ── FIX 1 — natural GSC presence controls the append count ───────────────────────
  {
    // natural batch already contains two GSC briefs → append none.
    const twoGscFirst = [brf('gsc:a'), brf('gsc:b'), ...Array.from({ length: 30 }, (_, i) => brf(`n${i}`)), brf('gsc:c')]
    const comp = composeSynthesisBatch({ workingPool: twoGscFirst, cursor: 0, batchSize, round: 1, consumedIds: new Set(), e3aTrialActive: true, maxTrialGscBriefs: 2 })
    check('(7) natural batch with two GSC briefs appends none', comp.naturalGscCount === 2 && comp.appendedIds.length === 0 && comp.batch.length === 18)
  }
  {
    // natural batch contains exactly one GSC brief → append exactly one.
    const oneGscFirst = [brf('gsc:a'), ...Array.from({ length: 30 }, (_, i) => brf(`n${i}`)), brf('gsc:b'), brf('gsc:c')]
    const comp = composeSynthesisBatch({ workingPool: oneGscFirst, cursor: 0, batchSize, round: 1, consumedIds: new Set(), e3aTrialActive: true, maxTrialGscBriefs: 2 })
    check('(8) natural batch with one GSC brief appends exactly one', comp.naturalGscCount === 1 && comp.appendedIds.length === 1 && comp.appendedIds[0] === 'gsc:b' && comp.batch.length === 19)
  }

  // ── FIX 6 / identity — E3A off or no GSC brief → exact contiguous slice ───────────
  {
    const noGsc = Array.from({ length: 40 }, (_, i) => brf(`n${i}`))
    const off = composeSynthesisBatch({ workingPool: noGsc, cursor: 0, batchSize, round: 1, consumedIds: new Set(), e3aTrialActive: false, maxTrialGscBriefs: 2 })
    check('(9)(10) E3A off → exact old cursor/slice behavior', ids(off.batch) === ids(noGsc.slice(0, 18)) && off.nextCursor === 18 && off.appendedIds.length === 0)
    check('(11) E3A off → byte-identical batch IDs vs workingPool.slice', off.batch.every((b, i) => b.opportunityId === noGsc[i].opportunityId))
    // Round 2 slice also identical to the pre-existing contiguous behavior.
    const off2 = composeSynthesisBatch({ workingPool: noGsc, cursor: 18, batchSize, round: 2, consumedIds: new Set(), e3aTrialActive: false, maxTrialGscBriefs: 2 })
    check('(11b) E3A off round-2 slice identical', ids(off2.batch) === ids(noGsc.slice(18, 36)) && off2.nextCursor === 36)
  }
  {
    // "zero admitted GSC briefs" (pool has none) → e3aTrialActive is false → identical slice.
    const noGsc = Array.from({ length: 25 }, (_, i) => brf(`n${i}`))
    const comp = composeSynthesisBatch({ workingPool: noGsc, cursor: 0, batchSize, round: 1, consumedIds: new Set(), e3aTrialActive: false, maxTrialGscBriefs: 2 })
    check('(9b) zero admitted GSC preserves the exact old batch', ids(comp.batch) === ids(noGsc.slice(0, 18)))
  }

  // ── FIX 4 — safe source metrics filled at integration (no secrets) ───────────────
  {
    const diag = gscInputWith([])
    const noGuards = { enabled: true, targetCount: 12, existingPool: [] as OpportunityBrief[], isCoveredByContent: () => false, isOwnedByEntity: () => false, blogDuplicateSignatures: [] as { sig: ReturnType<typeof topicSignature>; source: string }[] }
    const res = applyGscBriefIntegration([cand({ opportunityId: 'opp_1', primaryQuery: 'folding treadmill guide home', impressions: 900, clicks: 12, averagePosition: 6.4, opportunityScore: 82 })], diag, noGuards)
    const d = res.diagnostics.selectedGscBriefDetails[0]
    check('(20) selectedGscBriefDetails carries safe source metrics', res.gscBriefs.length === 1 && d.briefId === 'gsc:opp_1' && d.gscOpportunityId === 'opp_1' && d.primaryQuery === 'folding treadmill guide home' && d.impressions === 900 && d.clicks === 12 && d.averagePosition === 6.4 && d.opportunityScore === 82)
    check('(20b) detail exposes NO oauth/token/prompt/body fields', !('refreshToken' in d) && !('accessToken' in d) && !('prompt' in d) && !('body' in d) && Object.keys(d).length === 20)
    check('(20c) synthesis fields start unfilled (null / false) at integration', d.priorityTier === null && d.finalSynthesisRank === null && d.consumed === false && d.consumedRound === null && d.acceptedByEngine === false && d.finalOutcome === null)
  }
  {
    // FIX 4 — a MERGED GSC opportunity produces mergedGscEvidence, NOT a selectedGscBriefDetails entry.
    const diag = gscInputWith([])
    const existing = [{ ...brf('b:folding treadmill guide home'), subject: 'folding treadmill guide home' }]
    const noGuards = { enabled: true, targetCount: 12, existingPool: existing, isCoveredByContent: () => false, isOwnedByEntity: () => false, blogDuplicateSignatures: [] as { sig: ReturnType<typeof topicSignature>; source: string }[] }
    const res = applyGscBriefIntegration([cand({ opportunityId: 'opp_m', primaryQuery: 'folding treadmill guide home' })], diag, noGuards)
    check('(26) merged GSC evidence stays SEPARATE from selectedGscBriefDetails', res.diagnostics.mergedGscEvidence.length === 1 && res.diagnostics.selectedGscBriefDetails.length === 0)
  }

  // ── Need-collapse × bounded participation — the live morning-food pair ───────────
  {
    // The two morning-food variants collapse into ONE need → ONE source-budget slot / ONE brief;
    // a distinct need yields a second brief. (Ido regression shape, generic mechanism.)
    const diag = gscInputWith([])
    const noGuards = { enabled: true, targetCount: 12, existingPool: [] as OpportunityBrief[], isCoveredByContent: () => false, isOwnedByEntity: () => false, blogDuplicateSignatures: [] as { sig: ReturnType<typeof topicSignature>; source: string }[] }
    const res = applyGscBriefIntegration([
      cand({ opportunityId: 'food_a', primaryQuery: 'מה לאכול לפני אימון בוקר', opportunityScore: 90, impressions: 500, clicks: 5 }),
      cand({ opportunityId: 'food_b', primaryQuery: 'מה טוב לאכול לפני אימון בוקר', opportunityScore: 80, impressions: 300, clicks: 2 }),
      cand({ opportunityId: 'subjectless', primaryQuery: 'מה המחיר' }),
      cand({ opportunityId: 'subjectless2', primaryQuery: 'מה העלויות?' }),
      cand({ opportunityId: 'other', primaryQuery: 'איך להתחיל קליסטניקס', opportunityScore: 70 }),
    ], diag, noGuards)
    check('(pp1) morning-food pair consumes ONE source-budget slot (one brief)', res.gscBriefs.filter((b) => b.opportunityId === 'gsc:food_a').length === 1 && res.gscBriefs.filter((b) => b.opportunityId === 'gsc:food_b').length === 0)
    check('(pp1b) two unique needs admitted (collapsed food + calisthenics); subjectless dropped', res.gscBriefs.length === 2 && res.diagnostics.uniqueNeedCountBeforeBudget === 2 && res.diagnostics.collapsedNearDuplicateCount === 1)
    check('(pp1c) subjectless_generic_query rejected + counted (מה המחיר + מה העלויות?)', res.diagnostics.subjectlessGenericRejectedCount === 2 && res.diagnostics.rejectionCounts['subjectless_generic_query'] === 2)
    check('(15b) "מה המחיר" / "מה העלויות?" are NOT in selectedGscBriefDetails and hold no brief', !res.diagnostics.selectedGscBriefDetails.some((x) => x.primaryQuery === 'מה המחיר' || x.primaryQuery === 'מה העלויות?') && !res.diagnostics.selectedBriefIds.includes('gsc:subjectless') && !res.diagnostics.selectedBriefIds.includes('gsc:subjectless2'))
    const foodDetail = res.diagnostics.selectedGscBriefDetails.find((x) => x.briefId === 'gsc:food_a')!
    check('(pp1d) collapsed brief keeps all source provenance', foodDetail.collapsedOpportunityCount === 2 && foodDetail.relatedOpportunityIds.join(',') === 'food_a,food_b' && foodDetail.clicks === 7 && foodDetail.impressions === 800)
    check('(pp1e) selectedBriefIds has one id per unique need', res.diagnostics.selectedBriefIds.filter((id) => id.startsWith('gsc:')).length === 2)
  }

  // ── Consumption reconciliation — unique consumed count, not the cursor ───────────
  {
    const consumed = new Set<string>()
    const consumptionByBriefId = new Map<string, { consumedRound: number }>()
    const r1 = composeSynthesisBatch({ workingPool: pool, cursor: 0, batchSize, round: 1, consumedIds: consumed, e3aTrialActive: true, maxTrialGscBriefs: 2 })
    r1.batch.forEach((b) => { consumed.add(b.opportunityId); if (!consumptionByBriefId.has(b.opportunityId)) consumptionByBriefId.set(b.opportunityId, { consumedRound: 1 }) })
    const effectivePoolSize = pool.length
    const consumedBriefs = consumptionByBriefId.size
    const remainingBriefs = Math.max(0, effectivePoolSize - consumedBriefs)
    check('(recon1)(recon2) consumedBriefs === size (20; the 2 appended included), cursor was 18', consumedBriefs === 20 && r1.nextCursor === 18)
    check('(recon3) consumedBriefs are unique ids only', new Set(r1.batch.map((b) => b.opportunityId)).size === r1.batch.length)
    check('(recon4)(recon5) consumedBriefs + remainingBriefs === effectivePoolSize', consumedBriefs + remainingBriefs === effectivePoolSize)
    const trialDistinct = new Set(pool.filter((b) => b.opportunityId.startsWith('gsc:') && consumptionByBriefId.get(b.opportunityId)?.consumedRound === 1).map((b) => b.opportunityId)).size
    check('(trialDistinctNeedCount) = 2 distinct GSC needs in the first-round lane', trialDistinct === 2)
  }
  {
    // (recon6) E3A off → size equals the old cursor count (contiguous slices, one consume each).
    const noGsc = Array.from({ length: 40 }, (_, i) => brf(`n${i}`))
    const consumptionByBriefId = new Map<string, true>()
    let cursor = 0
    for (let round = 1; round <= 2; round++) {
      const c = composeSynthesisBatch({ workingPool: noGsc, cursor, batchSize, round, consumedIds: new Set(), e3aTrialActive: false, maxTrialGscBriefs: 2 })
      c.batch.forEach((b) => consumptionByBriefId.set(b.opportunityId, true))
      cursor = c.nextCursor
    }
    check('(recon6) flag-off: consumptionByBriefId.size === cursor count', consumptionByBriefId.size === cursor && cursor === 36)
  }

  // ── FIX 4 — route resolves finalOutcome truthfully (never mislabels) ─────────────
  {
    const gscInput = gscInputWith([
      detail({ briefId: 'gsc:u', finalOutcome: 'not_consumed' }),          // selected but unconsumed
      detail({ briefId: 'gsc:r', finalOutcome: 'rejected_by_engine' }),    // consumed, engine-rejected
      detail({ briefId: 'gsc:blog', finalOutcome: null }),                 // engine-accepted, later blog-rejected
      detail({ briefId: 'gsc:route', finalOutcome: null }),                // engine-accepted, later route-rejected
      detail({ briefId: 'gsc:ok', finalOutcome: null }),                   // engine-accepted, persisted
    ])
    const finalOutcomes = [
      { opportunityId: 'gsc:blog', finalOutcome: 'rejected_by_blog_gate' as const },
      { opportunityId: 'gsc:route', finalOutcome: 'rejected_by_route_finalization' as const },
      { opportunityId: 'gsc:ok', finalOutcome: 'accepted_for_persistence' as const },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = applyFinalOutcomesToGscDetails(gscInput, finalOutcomes as any)!
    const byId = new Map(out.selectedGscBriefDetails.map((d) => [d.briefId, d.finalOutcome]))
    check('(21) selected but unconsumed GSC → not_consumed (unchanged by route)', byId.get('gsc:u') === 'not_consumed')
    check('(22) consumed but engine-rejected GSC → rejected_by_engine (unchanged)', byId.get('gsc:r') === 'rejected_by_engine')
    check('(23) engine-accepted then blog/route-rejected → NOT accepted_for_persistence', byId.get('gsc:blog') === 'rejected_by_blog_gate' && byId.get('gsc:route') === 'rejected_by_route_finalization')
    check('(24) finally persisted GSC → accepted_for_persistence', byId.get('gsc:ok') === 'accepted_for_persistence')
  }

  // ── Source contracts — the loop wiring, no forced acceptance, no extra calls ─────
  const gen = read('lib/content/recommendations/generate-from-briefs.ts')
  const genCode = gen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const composerBody = (gen.match(/export function composeSynthesisBatch\([\s\S]*?\n}\n/) ?? [''])[0]
  check('(13) provider call count unchanged (composer is pure — no model call / await / controller)', composerBody.length > 0 && !/generateRecommendationJSON|await|controller/.test(composerBody))
  check('(13b) exactly one synthesis provider call per round (loop unchanged)', /for \(let round = 1; round <= maxSynthesisRounds/.test(gen) && (genCode.match(/generateRecommendationJSON\(/g) ?? []).length === 2)
  check('(14) paid-call cap = 3 total (discovery reduces synthesis rounds)', /const PAID_CALL_CAP = 3/.test(gen) && /const maxSynthesisRounds = PAID_CALL_CAP - \(discovery\?\.ran \? 1 : 0\)/.test(gen))
  check('(15) targetCount unchanged (deficit still from input.targetCount)', /const deficit = input\.targetCount - suggestions\.length/.test(gen))
  check('(16) prompt receives the SAME batch object (incl. the two appended briefs)', /const prompt = buildBriefSynthesisPrompt\(batch, ctx, langLabel, year\)/.test(gen))
  check('(17)(19) appended GSC briefs enter the SAME validation batch (no forced-accept path)', /reconcileSynthesis\(res\.text, batch\)/.test(gen) && !/gsc[\s_]*accept|force.*accept|acceptGsc/i.test(genCode))
  check('(18) consumed GSC may still be rejected (finalOutcome maps engine-rejected)', /!consumed \? 'not_consumed' : acceptedByEngine \? null : 'rejected_by_engine'/.test(gen))
  check('(FIX2 src) round-1-only append, unconsumed-only selection', /round === 1/.test(gen) && /!consumedIds\.has\(b\.opportunityId\)/.test(gen))
  check('(25) gscParticipation reports the REAL mode (disabled/no_gsc/natural/appended_trial)', /participationAppendedIds\.length > 0 \? 'appended_trial'/.test(gen) && /!anyNewGscBrief \? 'no_gsc_briefs'/.test(gen))
  check('(27) integration order unchanged (GSC before CONSTRAINED DISCOVERY)', gen.indexOf('integrateGscBriefs(') < gen.indexOf('CONSTRAINED DISCOVERY'))
  check('(helper) isGscOriginBrief matches only gsc: prefix', isGscOriginBrief({ opportunityId: 'gsc:x' }) && !isGscOriginBrief({ opportunityId: 'b:x' }))
  check('(recon-src) consumedBriefs derived from consumptionByBriefId.size (unique), not the cursor', /const consumedBriefs = consumptionByBriefId\.size/.test(gen) && !/const consumedBriefs = Math\.min\(cursor/.test(gen))
  check('(trial-src) trialDistinctNeedCount from distinct round-1 GSC needs', /const trialDistinctNeedCount = new Set\(workingPool\.filter/.test(gen) && /consumedRound === 1/.test(gen))
  const gscBriefsSrc = read('lib/content/recommendations/gsc-briefs.ts')
  check('(collapse-order) subject guard + collapse run BEFORE the source budget', gscBriefsSrc.indexOf('partitionSubjectBearing(candidates)') < gscBriefsSrc.indexOf('collapseGscCandidates(subjectBearing)') && gscBriefsSrc.indexOf('collapseGscCandidates(subjectBearing)') < gscBriefsSrc.indexOf('gscSourceBudget(params.targetCount)'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
