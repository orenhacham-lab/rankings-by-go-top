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
import { parseQaCostCapUsd, authorizeQaRunCost, maxAuthorizedCostFor } from '../recommendations/smart-run-harness'
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

  console.log('COST) authorized-cap parse, enforcement + honest preflight display')
  {
    // 1. the env cap is read correctly; invalid/missing/≤0 fall back to the default.
    check('C1. valid cap parses ($0.75)', parseQaCostCapUsd('0.75', 5) === 0.75)
    check('C2. missing cap → default', parseQaCostCapUsd(undefined, 5) === 5)
    check('C3. non-numeric cap → default (never NaN)', parseQaCostCapUsd('abc', 5) === 5 && !Number.isNaN(parseQaCostCapUsd('abc', 5)))
    check('C4. zero/negative cap → default', parseQaCostCapUsd('0', 5) === 5 && parseQaCostCapUsd('-1', 5) === 5)
    // 2. a run above the cap is NOT authorized; equal/under is.
    check('C5. worst-case $3.50 over cap $0.75 → not within limit', authorizeQaRunCost(3.5, 0.75).withinAuthorizedLimit === false)
    check('C6. worst-case equal to cap → within', authorizeQaRunCost(0.75, 0.75).withinAuthorizedLimit === true)
    check('C7. worst-case under cap → within', authorizeQaRunCost(0.30, 0.75).withinAuthorizedLimit === true)
    // 3. the worst-case estimate recalculates with ATTEMPTS (its applicable driver);
    //    it is a per-run ceiling, so it does NOT vary with target count — documented.
    check('C8. estimate recalculates with attempts (3 < 6)', maxAuthorizedCostFor(3, 0.5, 0.5) < maxAuthorizedCostFor(6, 0.5, 0.5))
    check('C9. the observed $3.50 reproduces exactly (0.5 + 0.5×3×2)', maxAuthorizedCostFor(3, 0.5, 0.5) === 3.5)

    // 4. route wiring: preflight exposes the ENFORCED limit + within flag and gates
    //    the confirm on it; a confirmed over-cap run is rejected 402 BEFORE spend.
    const routeSrc = read('../../../app/api/content/automation/reco-qa/compare/route.ts')
    check('C10. cap is safe-parsed from RECO_QA_MAX_RUN_COST_USD (no bare Number(?? ))', /parseQaCostCapUsd\(process\.env\.RECO_QA_MAX_RUN_COST_USD/.test(routeSrc) && !/Number\(process\.env\.RECO_QA_MAX_RUN_COST_USD/.test(routeSrc))
    check('C11. preflight returns the enforced limit + within flag + gated confirm', /authorizedLimitUsd/.test(routeSrc) && /withinAuthorizedLimit/.test(routeSrc) && /requiresConfirmation: withinAuthorizedLimit/.test(routeSrc))
    check('C12. confirmed over-cap run is rejected 402 before prep/spend', /if \(!withinAuthorizedLimit\)/.test(routeSrc) && /cost_exceeds_authorized_limit/.test(routeSrc) && /status: 402/.test(routeSrc) && routeSrc.indexOf('cost_exceeds_authorized_limit') < routeSrc.indexOf('inFlightProjects.add'))
    // 5. UI shows no actionable confirm above the cap.
    const pageSrc = read('../../../app/(dashboard)/reco-qa/page.tsx')
    check('C13. UI gates the confirm button on withinAuthorizedLimit (blocked message otherwise)', /withinAuthorizedLimit/.test(pageSrc) && /reco-qa-cost-blocked/.test(pageSrc) && /within \?/.test(pageSrc))
    check('C14. UI displays the enforced authorized limit, not just the estimate', /authorizedLimitUsd/.test(pageSrc) && /תקרת QA מאושרת/.test(pageSrc))
  }

  console.log('UI) ComparisonSection — independent loading states, no stuck preflight')
  {
    const pageSrc = read('../../../app/(dashboard)/reco-qa/page.tsx')
    // Isolate the ComparisonSection (the outer acceptance runner has its own `running`).
    const sec = pageSrc.slice(pageSrc.indexOf('function ComparisonSection'))
    check('U1. two INDEPENDENT loading states (isCalculatingCost + isRunningComparison)', /const \[isCalculatingCost, setIsCalculatingCost\] = useState\(false\)/.test(sec) && /const \[isRunningComparison, setIsRunningComparison\] = useState\(false\)/.test(sec))
    check('U2. the section no longer uses a shared derived running boolean or a stage machine', !/const running =/.test(sec) && !/useState<'idle'/.test(sec) && !/stage/.test(sec))
    check('U3. doPreflight ALWAYS clears isCalculatingCost in finally', /async function doPreflight\(\)[\s\S]*?finally \{[\s\S]*?setIsCalculatingCost\(false\)[\s\S]*?\}/.test(sec))
    check('U4. doRun ALWAYS clears isRunningComparison in finally', /async function doRun\(\)[\s\S]*?finally \{[\s\S]*?setIsRunningComparison\(false\)[\s\S]*?\}/.test(sec))
    check('U5. preflight success path does NOT leave a loading flag set (no early return before finally)', /setPreflight\(d\)\s*\n\s*\} catch/.test(sec))
    check('U6. confirm enabled only when preflight+within+!calculating+!running', /const canConfirm = !!preflight && within && !isCalculatingCost && !isRunningComparison/.test(sec))
    check('U7. doRun refuses a stale/absent/over-cap preflight (guard)', /if \(!preflight \|\| preflight\.withinAuthorizedLimit === false \|\| busy\) return/.test(sec))
    check('U8. changing project/target/attempts invalidates the preflight', (sec.match(/invalidatePreflight\(\)/g) ?? []).length >= 4 && /function invalidatePreflight\(\) \{ setPreflight\(null\)/.test(sec))
    check('U9. preflight label ← isCalculatingCost; confirm label ← isRunningComparison', /isCalculatingCost \? 'מחשב…'/.test(sec) && /isRunningComparison \? 'מריץ השוואה…'/.test(sec))
    check('U10. buttons are type="button" (no accidental form submit)', /<button type="button" onClick=\{doPreflight\}/.test(sec) && /<button type="button" onClick=\{doRun\}/.test(sec) && (sec.match(/type="button"/g) ?? []).length >= 4)
    check('U11. preflight button disabled ONLY by busy; confirm disabled by !canConfirm', /onClick=\{doPreflight\} disabled=\{busy\}/.test(sec) && /onClick=\{doRun\} disabled=\{!canConfirm\}/.test(sec))
    check('U12. no <form> wraps the controls (no submit path to swallow the click)', !/<form/.test(sec))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
