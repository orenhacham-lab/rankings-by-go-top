/**
 * Rejected-candidate DIAGNOSTICS QA (Scope A) — deterministic, offline.
 *
 * Proves the additive per-candidate accounting on the evidence-first engine:
 *   - EVERY polished candidate appears in candidateOutcomes EXACTLY once, so the
 *     invariant generated = accepted + rejected (+ not_processed + dropped) is
 *     provable (candidateAccounting.reconciles === true);
 *   - accepted outcomes correspond 1:1 (and in order) to the produced suggestions;
 *   - each outcome carries brief/opportunity identity + model title/keyword + final
 *     keyword + repaired flag + intent (observability, never article bodies);
 *   - a rejection resolves its concrete BLOCKER — specifically, an OLD status=rejected
 *     idea row that still lives in the keyword guard is shown as
 *     blockingSource=idea_keyword / blockingRecordStatus=rejected (the exact measurement
 *     the task requires) WITHOUT changing the fact that it blocks;
 *   - the diagnostics are DETERMINISTIC (two runs → identical outcomes) and never
 *     alter the accepted suggestions array vs a diagnostics-agnostic reading.
 *
 * It intentionally drives the REAL engine (generateFromBriefs) with a deterministic
 * fake provider + stored project data — the same harness the snapshot-identity gate uses.
 */
import { startFakeGenai, fakeAdmin, genTitle } from './_reco-harness'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const respond = (briefs: { id: string; subject: string; aligned_query?: string }[]) =>
  briefs.map((b, i) => ({ briefId: b.id, skip: false, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }))

/** Health/ecommerce pool with a benign accepted set AND one query that EXACTLY
 *  matches an OLD status='rejected' idea's primary keyword. The chosen phrases have
 *  no Hebrew final-form letters, so normalizeText === normalizePhrase and the guard
 *  collision (already_covered) fires deterministically. */
function tablesWithRejectedIdeaCollision(): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: 'p1', business_name: 'חנות טבע', target_domain: 'https://shop.example.co.il', language: 'he', country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'תה ירוק' }],
    keyword_research_cache: [{
      project_id: 'p1', fetched_at: '2026-07-01', results_json: [
        { keyword: 'קפה שחור חזק', avgMonthlySearches: 300 }, // collides with a REJECTED idea below
        { keyword: 'תה צמחי טבעי', avgMonthlySearches: 210 },
        { keyword: 'חליטת קמומיל', avgMonthlySearches: 140 },
        { keyword: 'פולי קקאו טרי', avgMonthlySearches: 160 },
      ],
    }],
    shopify_entities: [],
    generated_articles: [],
    article_topics: [],
    // The OLD rejected recommendation the user cleared — still in content_topic_ideas,
    // still keyword-guarded (status !== 'duplicate'), still carrying its fingerprint.
    content_topic_ideas: [{ project_id: 'p1', status: 'rejected', title: 'המדריך לקפה שחור חזק', primary_keyword: 'קפה שחור חזק', fingerprint: 'קפה שחור חזק' }],
    wordpress_content_index: [],
  }
}

async function run(tables: Record<string, Record<string, unknown>[]>, targetCount: number) {
  const { server, port } = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], respond })
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
  resetModelResolutionCache(); resetRecoGenAiClient()
  try {
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const input = { projectId: 'p1', targetCount, qualityMode: 'standard' as const }
    const a = await generateFromBriefs(fakeAdmin(tables), input, newRunCostController('standard', 'a', targetCount))
    const b = await generateFromBriefs(fakeAdmin(tables), input, newRunCostController('standard', 'b', targetCount))
    return { a, b }
  } finally {
    server.close()
  }
}

async function main() {
  const targetCount = 12
  const { a, b } = await run(tablesWithRejectedIdeaCollision(), targetCount)
  const d = a.diagnostics
  const outcomes = d.candidateOutcomes
  const acc = d.candidateAccounting

  console.log('ACCOUNTING) generated = accepted + rejected (+ not_processed + dropped), each candidate once')
  check('candidateOutcomes is populated', outcomes.length > 0, `n=${outcomes.length}`)
  check('accounting.reconciles === true (every generated candidate appears exactly once)', acc.reconciles === true, JSON.stringify(acc))
  check('generated === generated_opportunities (Σ polished)', acc.generated === d.generated_opportunities, `${acc.generated} vs ${d.generated_opportunities}`)
  check('generated === accepted + rejected + not_processed + dropped', acc.generated === acc.accepted + acc.rejected + acc.not_processed + acc.dropped, JSON.stringify(acc))
  check('outcomes count === generated (each polished candidate recorded once)', outcomes.length === acc.generated && !acc.outcomesCapped)
  check('accepted-outcome count === produced suggestions', acc.accepted === a.suggestions.length, `${acc.accepted} vs ${a.suggestions.length}`)

  console.log('MAPPING) accepted outcomes correspond 1:1 + in order to the suggestions')
  const acceptedOutcomes = outcomes.filter((o) => o.outcome === 'accepted')
  check('accepted outcomes align in ORDER with suggestions (final keyword + title)',
    acceptedOutcomes.length === a.suggestions.length && acceptedOutcomes.every((o, i) => o.finalPrimaryKeyword === a.suggestions[i].primaryKeyword && o.modelTitle === a.suggestions[i].title))
  check('every outcome carries brief/opportunity identity + model title + model keyword',
    outcomes.every((o) => !!o.briefId && !!o.modelTitle && !!o.modelPrimaryKeyword))
  check('every outcome has a concrete outcome value', outcomes.every((o) => ['accepted', 'rejected', 'not_processed', 'dropped'].includes(o.outcome)))

  console.log('BLOCKER) an OLD status=rejected idea row is shown as the exact blocker')
  const rejected = outcomes.filter((o) => o.outcome === 'rejected')
  check('at least one candidate was rejected (the rejected-idea collision)', rejected.length >= 1, `n=${rejected.length}`)
  const byRejectedIdea = rejected.find((o) => o.blocker?.blockingSource === 'idea_keyword' && o.blocker?.blockingRecordStatus === 'rejected')
  check('rejected-idea blocker: blockingSource=idea_keyword, blockingRecordStatus=rejected, blockingTitle present',
    !!byRejectedIdea && !!byRejectedIdea.blocker?.blockingTitle, JSON.stringify(byRejectedIdea?.blocker ?? null))
  check('the blocked candidate carries its final keyword + a rejection stage/reason',
    !!byRejectedIdea && !!byRejectedIdea.finalPrimaryKeyword && !!byRejectedIdea.rejectionReason && !!byRejectedIdea.rejectionStage)
  check('every rejected outcome has a typed rejectionReason + rejectionStage', rejected.every((o) => !!o.rejectionReason && !!o.rejectionStage))

  console.log('SAFE) diagnostics never leak long/unbounded text (no article bodies)')
  const strFields = (o: typeof outcomes[number]) => [o.briefSubject, o.modelTitle, o.modelPrimaryKeyword, o.finalPrimaryKeyword, o.blocker?.blockingTitle, o.blocker?.blockingPrimaryKeyword, o.matchedExistingContentTitle].filter((x): x is string => typeof x === 'string')
  check('all diagnostic strings are bounded (< 300 chars)', outcomes.every((o) => strFields(o).every((s) => s.length < 300)))

  console.log('DETERMINISTIC) diagnostics do not alter the accepted array + are reproducible')
  const canon = (v: unknown) => JSON.stringify(v)
  check('two runs produce identical suggestions (diagnostics never change acceptance/order)', canon(a.suggestions) === canon(b.suggestions))
  check('two runs produce identical candidateOutcomes + accounting', canon(a.diagnostics.candidateOutcomes) === canon(b.diagnostics.candidateOutcomes) && canon(a.diagnostics.candidateAccounting) === canon(b.diagnostics.candidateAccounting))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
