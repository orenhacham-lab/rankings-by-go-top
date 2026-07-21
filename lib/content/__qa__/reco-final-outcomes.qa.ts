/**
 * STAGE-AWARE final outcomes QA (Scope 2) — engine vs final reconciliation.
 *
 * Proves buildFinalCandidateOutcomes traces every generated candidate through route
 * finalization + the blog gate to the exact `fresh` set, WITHOUT changing any decision:
 *   - one final record per generated candidate (generated === engineOutcomes.length);
 *   - finalOutcome ∈ {accepted_for_persistence, rejected_by_engine,
 *     rejected_by_route_finalization, rejected_by_blog_gate, not_processed, dropped};
 *   - wouldPersist count === fresh.length AND the ordered wouldPersist title/keyword
 *     fingerprints equal `fresh` exactly (blog-gate keyword REPAIR is reflected —
 *     the persisted record carries the fresh/repaired keyword);
 *   - engine-rejected records carry the exact engine reason/stage/blocker;
 *   - a candidate the engine accepted but the route dropped is classified by the stage
 *     that dropped it (finalization vs blog gate, with the blog gate's exact reason).
 */
import { buildFinalCandidateOutcomes, type RouteSuggestion } from '../recommendations/final-outcomes'
import type { CandidateOutcome } from '../recommendations/generate-from-briefs'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// Minimal CandidateOutcome factory (fills the additive fields with safe defaults).
function co(over: Partial<CandidateOutcome> & { modelTitle: string; outcome: CandidateOutcome['outcome'] }): CandidateOutcome {
  return {
    briefId: `b:${over.modelTitle}`, opportunityId: `o:${over.modelTitle}`, sourceFamily: 'informational',
    briefSubject: over.modelTitle, alignedDemandQuery: null,
    modelPrimaryKeyword: over.modelPrimaryKeyword ?? over.modelTitle, finalPrimaryKeyword: over.finalPrimaryKeyword ?? over.modelPrimaryKeyword ?? over.modelTitle,
    keywordRepaired: false, finalIntent: 'informational', rejectionReason: null, rejectionStage: null,
    blocker: null, matchedExistingContentTitle: null, matchedExistingContentUrl: null, matchedCommercialEntity: null,
    matchedPendingIdea: null, matchedSameRunAccepted: null, coverageMatchType: null, ...over,
  }
}
const sug = (title: string, primaryKeyword: string, recommendedPageType = 'article'): RouteSuggestion => ({ title, primaryKeyword, recommendedPageType })
const nt = (s: string) => s.trim().toLowerCase()

function main() {
  // Engine produced 8 polished candidates:
  //  A accepted → survives finalization + blog gate → persisted (blog REPAIRED its keyword)
  //  B accepted → survives finalization → REJECTED by blog gate (unsupported)
  //  C accepted → REJECTED by route finalization (dropped before blog gate)
  //  D accepted → survives → persisted (unchanged)
  //  E rejected_by_engine (already_covered, rejected-idea blocker)
  //  F rejected_by_engine (intra_run)
  //  G not_processed (target reached)
  //  H dropped (brief not found)
  const engineOutcomes: CandidateOutcome[] = [
    co({ modelTitle: 'A title', modelPrimaryKeyword: 'a kw raw', finalPrimaryKeyword: 'a kw', outcome: 'accepted', keywordRepaired: true }),
    co({ modelTitle: 'B title', modelPrimaryKeyword: 'b kw', finalPrimaryKeyword: 'b kw', outcome: 'accepted' }),
    co({ modelTitle: 'C title', modelPrimaryKeyword: 'c kw', finalPrimaryKeyword: 'c kw', outcome: 'accepted' }),
    co({ modelTitle: 'D title', modelPrimaryKeyword: 'd kw', finalPrimaryKeyword: 'd kw', outcome: 'accepted' }),
    co({ modelTitle: 'E title', outcome: 'rejected', rejectionReason: 'already_covered', rejectionStage: 'article_worthiness', blocker: { blockingSource: 'idea_keyword', blockingRecordStatus: 'rejected', blockingTitle: 'old rejected idea', blockingPrimaryKeyword: 'e kw', blockingUrl: null, matchType: 'exact_keyword' } }),
    co({ modelTitle: 'F title', outcome: 'rejected', rejectionReason: 'intra_run_need_duplicate', rejectionStage: 'intra_run', matchedSameRunAccepted: 'A title' }),
    co({ modelTitle: 'G title', outcome: 'not_processed' }),
    co({ modelTitle: 'H title', outcome: 'dropped' }),
  ]
  // Engine-accepted order: A, B, C, D. Finalization dropped C. Blog gate dropped B and
  // REPAIRED A's keyword. So engineFresh = [A, B, D]; fresh = [A(repaired), D].
  const engineFresh: RouteSuggestion[] = [sug('A title', 'a kw'), sug('B title', 'b kw'), sug('D title', 'd kw')]
  const fresh: RouteSuggestion[] = [sug('A title', 'a kw'), sug('D title', 'd kw')]
  const blogRejectedByTitle = new Map<string, string>([[nt('B title'), 'unsupported_topic']])

  const { finalCandidateOutcomes: out, finalCandidateAccounting: acc } = buildFinalCandidateOutcomes({ engineOutcomes, engineFresh, fresh, blogRejectedByTitle })
  const byTitle = (t: string) => out.find((r) => r.modelTitle === t)!

  console.log('ACCOUNTING) one final record per generated candidate; reconciles')
  check('generated === engineOutcomes.length (every candidate once)', acc.generated === engineOutcomes.length && out.length === 8)
  check('accounting reconciles', acc.reconciles === true, JSON.stringify(acc))
  check('sum of final buckets === generated', acc.accepted_for_persistence + acc.rejected_by_engine + acc.rejected_by_route_finalization + acc.rejected_by_blog_gate + acc.not_processed + acc.dropped === acc.generated)

  console.log('PERSIST) wouldPersist === fresh, byte-order-identical (incl. blog keyword repair)')
  const persisted = out.filter((r) => r.wouldPersist)
  check('1. wouldPersist count === fresh.length', persisted.length === fresh.length && acc.wouldPersistCount === fresh.length, `${persisted.length} vs ${fresh.length}`)
  check('2. ordered wouldPersist fingerprints === fresh fingerprints', acc.orderMatchesFresh === true && persisted.map((r) => `${nt(r.finalTitle!)}|${nt(r.finalPrimaryKeyword!)}`).join(',') === fresh.map((f) => `${nt(f.title)}|${nt(f.primaryKeyword)}`).join(','))
  check('persisted A carries the BLOG-REPAIRED final keyword (a kw, not a kw raw)', byTitle('A title').finalPrimaryKeyword === 'a kw' && byTitle('A title').finalOutcome === 'accepted_for_persistence' && byTitle('A title').wouldPersist === true)
  check('persisted D carries its final page type', byTitle('D title').finalRecommendedPageType === 'article' && byTitle('D title').wouldPersist === true)

  console.log('STAGES) each drop is attributed to the exact stage')
  check('C → rejected_by_route_finalization (stage route_finalization, wouldPersist false)', byTitle('C title').finalOutcome === 'rejected_by_route_finalization' && byTitle('C title').stage === 'route_finalization' && byTitle('C title').wouldPersist === false)
  check('B → rejected_by_blog_gate with the EXACT blog reason', byTitle('B title').finalOutcome === 'rejected_by_blog_gate' && byTitle('B title').stage === 'blog_article_gate' && byTitle('B title').reason === 'unsupported_topic')
  check('E → rejected_by_engine carries engine reason + stage + blocker (rejected-idea)', byTitle('E title').finalOutcome === 'rejected_by_engine' && byTitle('E title').reason === 'already_covered' && byTitle('E title').stage === 'article_worthiness' && byTitle('E title').blocker?.blockingRecordStatus === 'rejected')
  check('F → rejected_by_engine (intra_run) carries same-run match', byTitle('F title').finalOutcome === 'rejected_by_engine' && byTitle('F title').reason === 'intra_run_need_duplicate')
  check('G → not_processed, H → dropped (typed non-rejections)', byTitle('G title').finalOutcome === 'not_processed' && byTitle('H title').finalOutcome === 'dropped' && !byTitle('G title').wouldPersist && !byTitle('H title').wouldPersist)

  console.log('COUNTS) bucket totals match the constructed scenario')
  check('bucket totals: 2 persist / 2 engine-rej / 1 finalization / 1 blog / 1 not_processed / 1 dropped',
    acc.accepted_for_persistence === 2 && acc.rejected_by_engine === 2 && acc.rejected_by_route_finalization === 1 && acc.rejected_by_blog_gate === 1 && acc.not_processed === 1 && acc.dropped === 1, JSON.stringify(acc))

  console.log('DUP) exact-duplicate titles are matched 1:1 (no double count)')
  const dupEngine: CandidateOutcome[] = [co({ modelTitle: 'Dup', modelPrimaryKeyword: 'k1', outcome: 'accepted' }), co({ modelTitle: 'Dup', modelPrimaryKeyword: 'k2', outcome: 'accepted' })]
  const dupRes = buildFinalCandidateOutcomes({ engineOutcomes: dupEngine, engineFresh: [sug('Dup', 'k1'), sug('Dup', 'k2')], fresh: [sug('Dup', 'k1')], blogRejectedByTitle: new Map([[nt('Dup'), 'semantic_dup']]) })
  check('same-title: exactly one persisted, one blog-rejected (1:1, no double count)',
    dupRes.finalCandidateAccounting.accepted_for_persistence === 1 && dupRes.finalCandidateAccounting.rejected_by_blog_gate === 1 && dupRes.finalCandidateAccounting.reconciles === true)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
