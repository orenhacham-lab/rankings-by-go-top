/**
 * SMART-COMPARE ROUTE + REPORT QA (Stage B, Increment 6) — offline.
 *
 * Proves the QA/admin comparison endpoint's protections and the report assembly:
 *   - the endpoint is double-gated (404 outside QA) and requires project ownership;
 *   - persist:false is server-enforced and NOT client-controllable;
 *   - the endpoint / harness / report perform no insert/update/delete;
 *   - the normal recommendations route does not import or invoke the smart controller,
 *     and no automatic escalation is wired (a single synthesis call-site);
 *   - the report keeps the blind file and the mapping SEPARATE, gates the blind file on
 *     the leakage scan, exposes model only in the QA rows (never the raw suggestions),
 *     and passes aggregates through unchanged.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { POST as comparePOST } from '../../../app/api/content/automation/reco-qa/compare/route'
import { assembleComparisonPayload } from '../recommendations/smart-run-report'
import { computeRescueAccounting, type BriefOutcome } from '../recommendations/smart-controller'
import type { SmartComparisonResult, SmartAttemptRecord } from '../recommendations/smart-run-harness'
import type { TopicSuggestion } from '../recommendations/types'

let pass = 0, fail = 0
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }
const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8')

const sug = (title: string, kw: string, reason: string): TopicSuggestion => ({
  id: `opportunity:${title}`, title, primaryKeyword: kw, secondaryKeywords: [], searchIntent: 'informational',
  recommendedWordCount: 1000, angle: '', suggestedInternalLinks: [], source: 'hybrid', suggestionReason: reason,
  suggestionScore: 0.8, modelUsed: 'gemini-2.5-flash', requestedTier: 'standard', recommendedPageType: 'article',
})

function mkAttempt(role: 'flash' | 'pro', attemptIndex: number, model: string, sugs: TopicSuggestion[]): SmartAttemptRecord {
  const rescue = computeRescueAccounting(sugs.map((_, i): BriefOutcome => ({ briefId: `${role}_b${i}`, stage: 'finalized_accepted' })), sugs.length)
  return {
    model, role, attemptIndex, engineAcceptedCount: sugs.length, finalizedCount: sugs.length, zeroResult: sugs.length === 0,
    providerOk: true, synthesisFailure: null, stopReason: 'target_reached',
    finalized: { poolSize: sugs.length, finalUserFacingCount: sugs.length, preparation: { preparationStarted: true, preparationSucceeded: true, discoveryRequired: false, discoveryAttempted: false, discoverySucceeded: false, discoveryFailureType: null, poolBuiltSuccessfully: true, poolEmptyAfterSuccessfulPreparation: false }, rounds: [{ providerOk: true, synthesisFailure: null }], stopReason: 'target_reached', rescue },
    escalation: { escalate: false, reason: 'target_met' }, reconciled: rescue.reconciled, failed: false, error: null,
    estimatedCostUsd: 0.02, tokenUsage: { input: 1000, output: 400, thinking: 0 }, callCount: 1, latencyMs: 1234,
    uniqueAcceptedBriefIds: Array.from(rescue.finalizedAcceptedBriefIds), rescueCounts: rescue.counts, finalizedSuggestions: sugs,
  }
}

function mkResult(proReason = 'סיבה תקינה וברורה לנושא.'): SmartComparisonResult {
  const flash = [0, 1, 2].map((i) => mkAttempt('flash', i, 'gemini-2.5-flash', [sug(`נושא פלאש ${i}`, `ביטוי פלאש ${i}`, 'סיבה תקינה וברורה לנושא.')]))
  const pro = [0, 1, 2].map((i) => mkAttempt('pro', i, 'gemini-2.5-pro', [sug(`נושא פרו ${i}`, `ביטוי פרו ${i}`, proReason), sug(`נושא פרו נוסף ${i}`, `ביטוי פרו נוסף ${i}`, 'סיבה תקינה וברורה לנושא.')]))
  const agg = (m: string, n: number) => ({ model: m, totalAttempts: 3, targetCompletionRate: 0, nonEmptyRate: 1, zeroResultRate: 0, meanFinalized: n, medianFinalized: n, minFinalized: n, maxFinalized: n, averageCostUsd: 0.02, costPerNonEmptyBatchUsd: 0.02, costPerFinalizedAcceptedUsd: 0.01, averageLatencyMs: 1234, p95LatencyMs: 1234, providerFailureRate: 0, synthesisFailureRate: 0 })
  return {
    snapshotId: 'snap_test', poolSize: 6, orderedBriefIds: ['a', 'b', 'c', 'd', 'e', 'f'], discoveryRan: false,
    preparationProviderCalls: 0, targetCount: 12, flash, pro,
    aggregate: { flash: agg('gemini-2.5-flash', 1), pro: agg('gemini-2.5-pro', 2) },
    selection: { select: 'pro', reason: 'pro_higher_count', provisional: false },
    budget: { ok: true, path: 'flash_first', requiredAuthorizationUsd: 0.5, reason: 'full_smart_path_authorized' },
    maxAuthorizedCostUsd: 0.9, actualCostUsd: 0.12, persistedWrites: 0,
  }
}

async function main() {
  console.log('ROUTE) double gate — unreachable outside QA')
  {
    const save = { c: process.env.ENABLE_CONTENT, a: process.env.ENABLE_CONTENT_AUTOMATION, d: process.env.RECO_ISOLATION_DIAGNOSTICS }
    process.env.ENABLE_CONTENT = 'true'; process.env.ENABLE_CONTENT_AUTOMATION = 'true'; delete process.env.RECO_ISOLATION_DIAGNOSTICS
    const r404 = await comparePOST(new Request('http://x/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'p1' }) }))
    check('R1. diagnostics OFF → 404 (endpoint unreachable)', r404.status === 404)
    process.env.ENABLE_CONTENT_AUTOMATION = 'false'; process.env.RECO_ISOLATION_DIAGNOSTICS = '1'
    const r404b = await comparePOST(new Request('http://x/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'p1' }) }))
    check('R2. automation OFF → 404', r404b.status === 404)
    // Gate passed, but a missing projectId short-circuits BEFORE any Supabase call.
    process.env.ENABLE_CONTENT_AUTOMATION = 'true'; process.env.RECO_ISOLATION_DIAGNOSTICS = '1'
    const r400 = await comparePOST(new Request('http://x/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }))
    check('R3. gate open + no projectId → 400 (auth/ownership required)', r400.status === 400)
    process.env.ENABLE_CONTENT = save.c; process.env.ENABLE_CONTENT_AUTOMATION = save.a; if (save.d === undefined) delete process.env.RECO_ISOLATION_DIAGNOSTICS; else process.env.RECO_ISOLATION_DIAGNOSTICS = save.d
  }

  console.log('ROUTE) source guarantees — auth, persist:false, no writes, no auto-escalation')
  {
    const routeSrc = read('../../../app/api/content/automation/reco-qa/compare/route.ts')
    const harnessSrc = read('../recommendations/smart-run-harness.ts')
    const reportSrc = read('../recommendations/smart-run-report.ts')
    const normalRouteSrc = read('../../../app/api/content/automation/recommendations/route.ts')
    check('R4. endpoint keeps the exact double gate + ownership', /isContentAutomationEnabled\(\)/.test(routeSrc) && /RECO_ISOLATION_DIAGNOSTICS !== '1'/.test(routeSrc) && /authContentProject/.test(routeSrc))
    check('R5. persist:false is server-set and NOT read from the client body', /persist: false/.test(routeSrc) && !/body\.persist/.test(routeSrc))
    // Ignore the in-memory concurrency Set's .add/.delete/.has — only DB writes count.
    const noSet = (s: string) => s.replace(/inFlightProjects\.(add|delete|has)\(/g, '')
    check('R6. endpoint + harness + report perform NO DB write ops', ![routeSrc, harnessSrc, reportSrc].some((s) => /\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(noSet(s))))
    check('R7. server-side attempt maximum + clamp are enforced', /SERVER_MAX_ATTEMPTS_PER_MODEL\s*=/.test(routeSrc) && /clampInt\(/.test(routeSrc))
    check('R8. confirm gate (preflight cost before any spend)', /confirm = body\.confirm === true/.test(routeSrc) && /if \(!confirm\)/.test(routeSrc) && /maxAuthorizedCostUsd/.test(routeSrc))
    check('R9. best-effort concurrency guard per project', /inFlightProjects/.test(routeSrc) && /comparison_already_running/.test(routeSrc))
    // No automatic escalation: escalation is decision-only — a SINGLE synthesis
    // call-site exists in the harness (never re-invoked based on the escalate flag).
    const synthCalls = (harnessSrc.match(/await synthesizeFromSnapshot\(/g) ?? []).length
    check('R10. exactly ONE synthesizeFromSnapshot call-site (no escalation-triggered re-run)', synthCalls === 1, `found ${synthCalls}`)
    check('R11. normal recommendations route does NOT import/invoke the smart controller', !/smart-controller|smart-run-harness|smart-run-report|synthesizeFromSnapshot|prepareBriefRun|escalateToPro|runSmartComparison/.test(normalRouteSrc) && /generateFromBriefs/.test(normalRouteSrc))
  }

  console.log('REPORT) blind file + mapping separate; leakage gate; QA-only model')
  {
    const clean = assembleComparisonPayload(mkResult(), 'abc123')
    check('R12. mapping is a SEPARATE artifact (never inside the blind file)', clean.mapping && clean.blindReview !== null && !('mapping' in (clean.blindReview as object)), JSON.stringify(Object.keys(clean.blindReview ?? {})))
    check('R13. clean blind export is available + one batch per attempt', clean.response.blindAvailable === true && (clean.blindReview?.batches.length ?? 0) === 6)
    check('R14. every QA row carries an anon batchId resolvable in the mapping', clean.response.attempts.every((a) => !!clean.mapping[a.attemptId]))
    check('R15. QA rows show model (QA-only) but the response carries NO raw suggestions/modelUsed', clean.response.attempts.some((a) => a.model === 'gemini-2.5-pro') && !/modelUsed|finalizedSuggestions|requestedTier/.test(JSON.stringify(clean.response)))
    check('R16. aggregates pass through unchanged', JSON.stringify(clean.response.aggregate) === JSON.stringify(mkResult().aggregate))
    check('R17. persist:false + zero writes surfaced in the response', clean.response.persist === false && clean.response.persistedWrites === 0)

    // Leakage gate: a model-identity token in review content withholds the blind file.
    const dirty = assembleComparisonPayload(mkResult('הנושא הופק על ידי gemini-2.5-pro'), 'abc123')
    check('R18. injected model-id leak → blind file WITHHELD (not returned)', dirty.blindReview === null && dirty.response.blindAvailable === false && !!dirty.response.blindBlocked)
    check('R19. even when blocked, the SEPARATE mapping is still produced', Object.keys(dirty.mapping).length === 6)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
