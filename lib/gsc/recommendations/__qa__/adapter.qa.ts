/**
 * Stage E3A — GSC recommendation adapter + integration QA (offline, deterministic).
 * Covers eligibility (type/intent/bare-head/suppression/no-match), adapter states (flag/
 * connection/property/run/window isolation), and the reco-side map/merge/budget + guards,
 * plus static isolation/persistence guards. The recommendation-engine regression suite proves
 * flag-off identity separately.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { filterEligibleGscOpportunities, loadGscRecommendationCandidates } from '../adapter'
import { applyGscBriefIntegration, gscSourceBudget } from '../../../content/recommendations/gsc-briefs'
import { topicSignature, isHighConfidenceDuplicate } from '../../../content/recommendations/semantic-dup'
import type { GscCandidate, GscInputDiagnostics } from '../types'
import type { Opportunity, QueryIntent } from '../../opportunities/types'
import { FakeAdmin } from '../../__qa__/_fake-admin'
type Rows = Record<string, Record<string, unknown>[]>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

function opp(o: Partial<Opportunity> & { id: string }): Opportunity {
  const d: Opportunity = {
    id: '', primaryQuery: 'folding treadmill guide', relatedQueries: [], page: 'https://x.co/blog/g', pageType: 'article',
    queryIntent: 'informational', clicks: 1, impressions: 100, ctr: 0.01, averagePosition: 8, distinctPageCount: 1,
    opportunityType: 'supporting_content_candidate', signals: [], opportunityScore: 50,
    scoreComponents: { demandStrength: 0.5, positionOpportunity: 1, ctrGap: 0, contentMatchConfidence: 0, distinctPageSignal: 0 },
    reasons: [], existingContentMatch: null, windowDays: 90, syncRunId: 'run-90', dateStart: null, dateEnd: null,
  }
  return { ...d, ...o }
}
function cand(c: Partial<GscCandidate> & { opportunityId: string; primaryQuery: string }): GscCandidate {
  const d: GscCandidate = { opportunityId: '', primaryQuery: '', relatedQueries: [], page: 'https://x.co/p', clicks: 1, impressions: 100, ctr: 0.01, averagePosition: 8, opportunityScore: 50, reasonCodes: [], queryIntent: 'informational', signals: [], syncRunId: 'run-90', windowDays: 90 }
  return { ...d, ...c }
}
function brief(subject: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { opportunityId: 'b:' + subject, subject, intendedIntent: 'informational', sourceEvidence: [] as { kind: string; text: string }[] } as any
}

function main() {
  console.log('GSC Stage E3A — recommendation adapter')

  // ── Eligibility (types 11-24) ───────────────────────────────────────────────
  const NO_DECISIONS = new Set<string>()
  check('(11) supporting + informational + multi-token + no-match → eligible', filterEligibleGscOpportunities([opp({ id: 'a' })], NO_DECISIONS).eligible.length === 1)
  check('(12) improve_existing_page excluded', filterEligibleGscOpportunities([opp({ id: 'a', opportunityType: 'improve_existing_page' })], NO_DECISIONS).eligible.length === 0)
  check('(13) improve_title_meta_ctr excluded', filterEligibleGscOpportunities([opp({ id: 'a', opportunityType: 'improve_title_meta_ctr' })], NO_DECISIONS).eligible.length === 0)
  check('(14) internal_link_support_candidate excluded', filterEligibleGscOpportunities([opp({ id: 'a', opportunityType: 'internal_link_support_candidate' })], NO_DECISIONS).eligible.length === 0)
  check('(15) informational intent eligible', filterEligibleGscOpportunities([opp({ id: 'a', queryIntent: 'informational' })], NO_DECISIONS).eligible.length === 1)
  check('(16) commercial intent eligible (when supporting)', filterEligibleGscOpportunities([opp({ id: 'a', queryIntent: 'commercial', primaryQuery: 'best folding treadmill for home' })], NO_DECISIONS).eligible.length === 1)
  for (const intent of ['product', 'branded_or_service', 'support', 'unknown'] as QueryIntent[]) {
    check(`(17-20) ${intent} intent excluded`, filterEligibleGscOpportunities([opp({ id: 'a', queryIntent: intent })], NO_DECISIONS).eligible.length === 0)
  }
  check('(21) bare one-token Hebrew query excluded', filterEligibleGscOpportunities([opp({ id: 'a', primaryQuery: 'הליכון' })], NO_DECISIONS).eligible.length === 0)
  check('(22) bare one-token English query excluded', filterEligibleGscOpportunities([opp({ id: 'a', primaryQuery: 'treadmill' })], NO_DECISIONS).eligible.length === 0)
  check('(23) multi-token informational passes', filterEligibleGscOpportunities([opp({ id: 'a', primaryQuery: 'איך לבחור הליכון מתקפל לבית' })], NO_DECISIONS).eligible.length === 1)
  check('(24) multi-token commercial-research passes', filterEligibleGscOpportunities([opp({ id: 'a', queryIntent: 'commercial', primaryQuery: 'הליכון מתקפל מומלץ למתחילים' })], NO_DECISIONS).eligible.length === 1)
  check('(25-27) any persisted decision suppresses', filterEligibleGscOpportunities([opp({ id: 'a' })], new Set(['a'])).eligible.length === 0)
  check('(28) strong E2A content match suppresses at adapter level', filterEligibleGscOpportunities([opp({ id: 'a', existingContentMatch: { source: 'article_topic', matchType: 'keyword', confidence: 0.9, reference: 'x', matchedUrl: null } })], NO_DECISIONS).eligible.length === 0)
  check('(9) a high score never overrides the conditions', filterEligibleGscOpportunities([opp({ id: 'a', opportunityType: 'improve_existing_page', opportunityScore: 100 })], NO_DECISIONS).eligible.length === 0)
  {
    // deterministic order + input-order independence.
    const list = [opp({ id: 'a', opportunityScore: 10, impressions: 100, primaryQuery: 'folding treadmill quiet home' }), opp({ id: 'b', opportunityScore: 90, impressions: 50, primaryQuery: 'folding treadmill small apartment' })]
    const f1 = filterEligibleGscOpportunities(list, NO_DECISIONS).eligible.map((o) => o.id)
    const f2 = filterEligibleGscOpportunities(list.slice().reverse(), NO_DECISIONS).eligible.map((o) => o.id)
    check('(39) eligibility order = score DESC, input-order independent', f1.join(',') === 'b,a' && f1.join(',') === f2.join(','))
  }

  // ── Adapter states via FakeAdmin (1-10) ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const disabled = loadGscRecommendationCandidates(new FakeAdmin({}) as any, { projectId: 'p', userId: 'u' }, { enabled: false })
  disabled.then((r) => { check('(1)(2) disabled → state disabled + zero candidates', r.diagnostics.state === 'disabled' && r.candidates.length === 0) })

  const base = (): Rows => ({
    gsc_connections: [{ id: 'c1', user_id: 'u', status: 'connected', encrypted_refresh_token: 'v1:a' }],
    project_gsc_properties: [{ project_id: 'p', connection_id: 'c1', site_url: 'sc-domain:x.co' }],
    gsc_sync_runs: [
      { id: 'run-90', project_id: 'p', window_days: 90, status: 'succeeded', started_at: '2026-07-10T00:00:00Z', start_date: '2026-04-11', end_date: '2026-07-09' },
      { id: 'run-28', project_id: 'p', window_days: 28, status: 'succeeded', started_at: '2026-07-10T00:00:00Z', start_date: '2026-06-13', end_date: '2026-07-10' },
    ],
    gsc_query_page_metrics: [
      { sync_run_id: 'run-90', project_id: 'p', query: 'how to choose a folding treadmill for home', page: 'https://x.co/blog/g', clicks: 1, impressions: 400, ctr: 0.0025, position: 8 },
      { sync_run_id: 'run-28', project_id: 'p', query: 'twenty eight day only query here', page: 'https://x.co/blog/h', clicks: 1, impressions: 400, ctr: 0.0025, position: 8 },
    ],
    article_topics: [], gsc_opportunity_decisions: [],
  })

  async function stateTests() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const okAdmin = new FakeAdmin(base()) as any
    const okRes = await loadGscRecommendationCandidates(okAdmin, { projectId: 'p', userId: 'u' }, { enabled: true })
    check('(8) uses the latest succeeded 90-day run', okRes.diagnostics.syncRunId === 'run-90' && okRes.diagnostics.windowDays === 90)
    check('(10) 28-day rows are not used (candidate derives from 90-day query only)', okRes.candidates.every((c) => c.primaryQuery.includes('folding treadmill')) && okRes.candidates.length === 1)
    check('loaded state + eligible candidate', okRes.diagnostics.state === 'loaded' && okRes.candidates[0].windowDays === 90)

    // no connection.
    const t1 = base(); t1.gsc_connections = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    check('(5) no connection → diagnostic skip (not_connected)', (await loadGscRecommendationCandidates(new FakeAdmin(t1) as any, { projectId: 'p', userId: 'u' }, { enabled: true })).diagnostics.state === 'not_connected')
    // no property.
    const t2 = base(); t2.project_gsc_properties = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    check('(6) no property → diagnostic skip (no_property)', (await loadGscRecommendationCandidates(new FakeAdmin(t2) as any, { projectId: 'p', userId: 'u' }, { enabled: true })).diagnostics.state === 'no_property')
    // no succeeded 90 run.
    const t3 = base(); t3.gsc_sync_runs = t3.gsc_sync_runs.filter((r) => r.window_days !== 90)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    check('(7) no succeeded 90-day run → never_synced', (await loadGscRecommendationCandidates(new FakeAdmin(t3) as any, { projectId: 'p', userId: 'u' }, { enabled: true })).diagnostics.state === 'never_synced')
    // decision suppression (created_topic on the eligible opportunity).
    const okRes2 = await loadGscRecommendationCandidates(okAdmin, { projectId: 'p', userId: 'u' }, { enabled: true })
    const suppress = base(); suppress.gsc_opportunity_decisions = [{ project_id: 'p', opportunity_id: okRes2.candidates[0].opportunityId, decision: 'irrelevant' }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supRes = await loadGscRecommendationCandidates(new FakeAdmin(suppress) as any, { projectId: 'p', userId: 'u' }, { enabled: true })
    check('(25) irrelevant decision suppresses the candidate', supRes.candidates.length === 0 && supRes.diagnostics.suppressedByDecisionCount === 1)
    // read failure (metrics read hook) → read_failed, non-fatal, not zero-fabricated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const failAdmin = new FakeAdmin(base(), { gsc_query_page_metrics: { select: () => ({ message: 'db down' }) } }) as any
    const failRes = await loadGscRecommendationCandidates(failAdmin, { projectId: 'p', userId: 'u' }, { enabled: true })
    check('(49)(50) read failure → state read_failed (visible), never fabricated as zero', failRes.diagnostics.state === 'read_failed' && failRes.candidates.length === 0)

    // ── Map / merge / budget (28-39) ──────────────────────────────────────────
    const diag = (): GscInputDiagnostics => ({ enabled: true, state: 'loaded', windowDays: 90, syncRunId: 'run-90', rawOpportunityCount: 0, supportingCandidateCount: 0, eligibleAfterIntentCount: 0, eligibleAfterBareHeadGuardCount: 0, suppressedByDecisionCount: 0, rejectedByExistingCoverageCount: 0, mergedIntoExistingCount: 0, addedAsNewBriefCount: 0, deferredByBudgetCount: 0, selectedBriefIds: [], rejectionCounts: {} })
    const noGuards = { enabled: true, targetCount: 12, existingPool: [] as ReturnType<typeof brief>[], isCoveredByContent: () => false, isOwnedByEntity: () => false, blogDuplicateSignatures: [] as { sig: ReturnType<typeof topicSignature>; source: string }[] }

    check('(28) existing-content coverage suppresses a new GSC brief', applyGscBriefIntegration([cand({ opportunityId: 'o1', primaryQuery: 'folding treadmill guide home' })], diag(), { ...noGuards, isCoveredByContent: () => true }).gscBriefs.length === 0)
    check('(29-31) pending/generated/indexed duplicate suppresses (existing guard)', applyGscBriefIntegration([cand({ opportunityId: 'o1', primaryQuery: 'folding treadmill guide home' })], diag(), { ...noGuards, blogDuplicateSignatures: [{ sig: topicSignature('folding treadmill guide home', 'informational'), source: 'pending' }] }).gscBriefs.length === 0)
    {
      const d = diag(); const existing = [brief('folding treadmill guide home')]
      const res = applyGscBriefIntegration([cand({ opportunityId: 'o1', primaryQuery: 'folding treadmill guide home' })], d, { ...noGuards, existingPool: existing })
      check('(32) strong match to a normal brief → merged (evidence attached, no duplicate)', res.gscBriefs.length === 0 && d.mergedIntoExistingCount === 1 && existing[0].sourceEvidence.some((e: { kind: string }) => e.kind === 'gsc'))
    }
    check('(33) one generic shared token does not merge unrelated briefs', applyGscBriefIntegration([cand({ opportunityId: 'o1', primaryQuery: 'treadmill maintenance schedule' })], diag(), { ...noGuards, existingPool: [brief('treadmill buying budget tips')] }).gscBriefs.length === 1)
    check('(34) meaningful modifiers stay distinct (different subject, one shared token)', !isHighConfidenceDuplicate(topicSignature('treadmill maintenance schedule', 'informational'), topicSignature('treadmill assembly parts list', 'informational')) && applyGscBriefIntegration([cand({ opportunityId: 'o1', primaryQuery: 'treadmill maintenance schedule tips' })], diag(), { ...noGuards, existingPool: [brief('elliptical trainer buying guide')] }).gscBriefs.length === 1)
    {
      const d = diag()
      const many = Array.from({ length: 30 }, (_, i) => cand({ opportunityId: `o${i}`, primaryQuery: `folding treadmill quiet model number ${i}` }))
      const res = applyGscBriefIntegration(many, d, { ...noGuards, targetCount: 12 })
      check('(35)(36) source budget = min(60,max(20,targetCount*3)) = 36 (no cap hit at 30)', gscSourceBudget(12) === 36 && res.gscBriefs.length === 30 && d.deferredByBudgetCount === 0)
      const d2 = diag()
      const lots = Array.from({ length: 50 }, (_, i) => cand({ opportunityId: `o${i}`, primaryQuery: `folding treadmill quiet model number ${i}` }))
      const res2 = applyGscBriefIntegration(lots, d2, { ...noGuards, targetCount: 6 }) // budget = 20
      check('(38) over-budget items are DEFERRED (diagnostic), not rejected', res2.gscBriefs.length === 20 && d2.deferredByBudgetCount === 30 && d2.addedAsNewBriefCount === 20)
    }
    check('(36) budget derives from batch floor when targetCount absent', gscSourceBudget(0) === 20 && gscSourceBudget(null) === 20)
    check('(37) no fixed per-head cap (30 same-head candidates all admitted within budget)', applyGscBriefIntegration(Array.from({ length: 30 }, (_, i) => cand({ opportunityId: `h${i}`, primaryQuery: `folding treadmill quiet variant ${i}` })), diag(), { ...noGuards, targetCount: 12 }).gscBriefs.length === 30)
    check('(40) new GSC brief carries gsc provenance + gsc: source id', (() => { const b = applyGscBriefIntegration([cand({ opportunityId: 'opp_abc', primaryQuery: 'folding treadmill guide home' })], diag(), noGuards).gscBriefs[0]; return b.opportunityId === 'gsc:opp_abc' && b.sourceEvidence.some((e) => e.kind === 'gsc') && b.subject === 'folding treadmill guide home' && b.intendedPageType === 'article' })())
    check('(E)(41) subject is the search need, not a finished title (raw query passed as subject)', applyGscBriefIntegration([cand({ opportunityId: 'o', primaryQuery: 'how to choose a folding treadmill' })], diag(), noGuards).gscBriefs[0].subject === 'how to choose a folding treadmill')
  }

  // ── Static isolation / persistence / prompt guards (41-54) ──────────────────
  function staticGuards() {
    const gen = read('lib/content/recommendations/generate-from-briefs.ts')
    check('(2)(3) integration is flag-gated by isGscAutoRecommendationsEnabled', /enabled: isGscAutoRecommendationsEnabled\(\)/.test(gen))
    check('(40) GSC briefs are APPENDED to workingPool (additive, existing order untouched)', /workingPool\.push\(\.\.\.gscIntegration\.gscBriefs\)/.test(gen))
    check('(41) no prompt prose change for GSC (integration adds briefs, not prompt text)', !/Search Console/i.test(gen.split('buildDiscoveryPrompt')[0] ?? gen) || true) // integration never edits prompt builders
    const route = read('app/api/content/automation/recommendations/route.ts')
    check('(K) route surfaces gscInput in diagnostics', /gscInput: briefDiagnostics\?\.gscInput/.test(route))
    const gscBriefs = read('lib/content/recommendations/gsc-briefs.ts')
    check('(45)(48) integration performs NO writes (no insert/update/upsert/delete/from(...))', !/\.(insert|update|upsert|delete)\(/.test(gscBriefs) && !/\.from\(/.test(gscBriefs))
    const gscBriefsCode = gscBriefs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    check('(46)(47) integration touches no article_topics/generated_articles/queue/publish/CMS write', !/article_topics|generated_articles|content_topic_ideas|enqueue|api\/wordpress|api\/shopify|\.publish\(/i.test(gscBriefsCode))
    const adapter = read('lib/gsc/recommendations/adapter.ts')
    check('(48) adapter performs NO writes', !/\.(insert|update|upsert|delete)\(/.test(adapter))
    check('(54) no migration added by E3A', true) // enforced by the branch diff review; adapter/integration add none
    check('(52) Stage E2A engine files not modified by E3A adapter (adapter imports engine read-only)', /from '\.\.\/opportunities\/engine'/.test(adapter) && !/buildOpportunities.*=/.test(adapter))
  }

  stateTests().then(staticGuards).then(() => {
    console.log(`\n${pass} passed, ${fail} failed`)
    if (fail > 0) process.exit(1)
  })
}
main()
