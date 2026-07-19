/**
 * STAGE D — Pro-first production controller QA (pure decisions + fake-provider
 * orchestration + route/source guards). Offline, non-persisting.
 *
 * Proves the global Pro-first policy: Pro runs once; a non-empty finalized Pro batch
 * always wins; Flash runs at most once and ONLY as a strictly-gated rescue fallback;
 * provenance is truthful (Flash fallback never recorded as Pro); the engine, /reco-qa
 * and blind export are untouched.
 */
import { createServer, type Server } from 'http'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fakeAdmin } from './_reco-harness'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'
import { evaluateFlashFallback, selectProductionBatch, buildProductionRunDecision } from '../recommendations/production-controller'
import { suggestionFingerprint } from '../recommendations/smart-run-report'

let pass = 0, fail = 0
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }
const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8')

// ── Model-aware fake Gemini server ───────────────────────────────────────────────
interface SrvCfg { proAvailable: boolean; proMode: 'ok' | 'provider_fail' | 'synth_fail'; flashMode: 'ok' | 'empty' }
function startServer(cfg: SrvCfg): Promise<{ server: Server; port: number; calls: { model: string; kind: string }[] }> {
  const calls: { model: string; kind: string }[] = []
  const topicsFor = (body: string, prefix: string) => {
    const m = body.match(/BRIEFS:\\n(\[.*?\])\\n\\nOUTPUT/) ?? body.match(/BRIEFS:\s*\n(\[[\s\S]*?\])\s*\n\s*\nOUTPUT/)
    let briefs: { id: string; subject: string; aligned_query?: string }[] = []
    if (m) { try { briefs = JSON.parse(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')) } catch { briefs = [] } }
    return briefs.map((b) => ({ briefId: b.id, title: `${prefix}${b.subject}`, primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }))
  }
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (req.method === 'GET' && (req.url ?? '').includes('/models')) {
        const models = ['gemini-2.5-flash', ...(cfg.proAvailable ? ['gemini-2.5-pro'] : [])]
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ models: models.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) })); return
      }
      if ((req.url ?? '').includes(':generateContent')) {
        const model = ((req.url ?? '').match(/models\/([^:]+):generateContent/) ?? [])[1] ?? ''
        const isPro = model.includes('pro')
        if ((req.url ?? '').length && body.includes('OWNED ANCHORS')) {
          calls.push({ model, kind: 'discovery' })
          const am = body.match(/OWNED ANCHORS[^\[]*?(\[[\s\S]*?\])/); let anchors: string[] = []
          if (am) { try { anchors = JSON.parse(am[1].replace(/\\"/g, '"')) } catch { anchors = [] } }
          const needs = anchors.slice(0, 5).map((a, i) => ({ subject: `רעיון ${i} עבור ${a}`, anchor: a, need: 'explanation', intent: 'informational' }))
          res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ needs }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 300, totalTokenCount: 1100 } })); return
        }
        calls.push({ model, kind: 'synthesis' })
        if (isPro && cfg.proMode === 'provider_fail') { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 400, message: 'Temporary bad request (non-fatal).', status: 'INVALID_ARGUMENT' } })); return }
        if (isPro && cfg.proMode === 'synth_fail') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '[]' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40, totalTokenCount: 940 } })); return }
        // Titles stay keyword-aligned for BOTH models (a prefix would break the engine's
        // title↔keyword gate). Selection is asserted via provenance, not title content.
        const topics = isPro ? topicsFor(body, '') : (cfg.flashMode === 'empty' ? [] : topicsFor(body, ''))
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ topics }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 400, totalTokenCount: 1400 } })); return
      }
      res.writeHead(404); res.end('{}')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, calls })))
}

const KWS = ['מגנזיום לילדים מינון', 'איך לבחור אבקת חלבון', 'אנזימי עיכול טבעיים', 'ויטמין C לילדים', 'יתרונות אומגה 3', 'חיזוק מערכת החיסון בחורף', 'ויטמין D למבוגרים', 'ברזל בהריון תזונה', 'חומצה פולית מתי', 'אבץ לחיזוק חיסון', 'פרוביוטיקה למעיים', 'קולגן לעור ומפרקים']
function tables(): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: 'p1', business_name: 'הצמחייה', target_domain: 'https://natural-shop.co.il', language: 'he', country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'תוספי תזונה טבעיים' }],
    keyword_research_cache: [{ project_id: 'p1', fetched_at: '2026-07-01', results_json: KWS.map((k, i) => ({ keyword: k, avgMonthlySearches: 100 + i * 25 })) }],
    shopify_entities: [{ project_id: 'p1', is_active: true, title: 'אבקת חלבון צמחית', handle: 'prot', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/prot' }],
    generated_articles: [], article_topics: [], content_topic_ideas: [], wordpress_content_index: [],
  }
}
async function loadRun(port: number) {
  process.env.GEMINI_API_KEY = 'test-key'; process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
  resetModelResolutionCache(); resetRecoGenAiClient()
  const { runProFirstProduction } = await import('../recommendations/production-run')
  const { newRunCostController } = await import('../recommendations/run-cost-controller')
  return { runProFirstProduction, newRunCostController }
}
const synthCalls = (calls: { kind: string; model: string }[], sub: string) => calls.filter((c) => c.kind === 'synthesis' && c.model.includes(sub)).length

async function main() {
  console.log('PURE) evaluateFlashFallback / selectProductionBatch / buildProductionRunDecision')
  {
    const base = { proFinalizedCount: 0, preparationSucceeded: true, poolEmptyAfterSuccessfulPreparation: false, rescueUniqueBriefIdCount: 5, proProviderFailed: false, proSynthesisFailed: false, budgetAuthorizesFallback: true }
    check('P1. Pro produced a batch → Flash forbidden', evaluateFlashFallback({ ...base, proFinalizedCount: 3 }).runFlash === false)
    check('P2. Pro 0 + provider failure + rescue → Flash runs (named after the PRO cause)', evaluateFlashFallback({ ...base, proProviderFailed: true }).reason === 'pro_provider_failure_rescue')
    check('P3. Pro 0 + synthesis failure + rescue → Flash runs', evaluateFlashFallback({ ...base, proSynthesisFailed: true }).reason === 'pro_synthesis_failure_rescue')
    check('P4. Pro 0 + zero-marginal-yield + rescue → Flash runs', evaluateFlashFallback(base).reason === 'pro_zero_marginal_yield_rescue')
    check('P5. Pro 0 + NO rescue → Flash forbidden (genuine_exhaustion)', evaluateFlashFallback({ ...base, rescueUniqueBriefIdCount: 0 }).runFlash === false)
    check('P6. preparation failure → Flash forbidden', evaluateFlashFallback({ ...base, preparationSucceeded: false }).reason === 'preparation_failure')
    check('P7. empty pool (no evidence) → Flash forbidden', evaluateFlashFallback({ ...base, poolEmptyAfterSuccessfulPreparation: true }).reason === 'no_evidence')
    check('P8. budget blocked → Flash forbidden (fallback_budget_blocked)', evaluateFlashFallback({ ...base, budgetAuthorizesFallback: false }).reason === 'fallback_budget_blocked')
    check('P9. non-empty Pro ALWAYS wins even vs a bigger hypothetical Flash', selectProductionBatch(1, 99).selected === 'pro')
    check('P10. Pro 0, Flash non-empty → Flash', selectProductionBatch(0, 4).selected === 'flash')
    check('P11. Pro 0, Flash 0 → none', selectProductionBatch(0, 0).selected === 'none')
    check('P12. buildDecision: Pro unavailable → Flash run, reason pro_unavailable', buildProductionRunDecision({ proAvailable: false, proFinalizedCount: 0, fallback: null, flashFinalizedCount: 3 }).reason === 'pro_unavailable')
    check('P13. buildDecision: Pro produced → no Flash', buildProductionRunDecision({ proAvailable: true, proFinalizedCount: 5, fallback: null, flashFinalizedCount: null }).flashRan === false)
  }

  console.log('RUN) orchestration over fake providers')
  {
    const fp = (arr: { title: string; primaryKeyword: string }[]) => arr.map((s) => suggestionFingerprint(s.title, s.primaryKeyword)).join('|')
    // 1/2. Pro non-empty → Flash NEVER called; Pro selected + recorded as Pro; the
    //      selected model path is Pro; finalize happened exactly once (selectedFinalization).
    const s1 = await startServer({ proAvailable: true, proMode: 'ok', flashMode: 'ok' })
    const { runProFirstProduction, newRunCostController } = await loadRun(s1.port)
    const r1 = await runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, newRunCostController('premium', 'run1', 12))
    check('R1. Pro non-empty → selected pro, Flash NOT called', r1.selectedModel === 'pro' && r1.provenance.flashAttempted === false && synthCalls(s1.calls, 'flash') === 0 && r1.selectedFinalization.finalSuggestions.length > 0)
    check('R2. provenance records Pro truthfully (requested=PRO, resolved, selected pro, no fallback)', /pro/.test(r1.provenance.proRequestedModel) && !/flash/.test(r1.provenance.proRequestedModel) && /pro/.test(r1.provenance.modelUsedForPersistence ?? '') && r1.provenance.fallbackReason === 'pro_produced_batch' && r1.provenance.proFinalizedCount > 0)
    check('R2b. requested model is the PRO id, NEVER a Flash constant', !/flash/i.test(r1.provenance.primaryModelRequested) && r1.provenance.primaryModelRequested === r1.provenance.proRequestedModel)
    check('R3. selected model path is Pro; finalized-once identity holds', r1.selectedModelPath.tierUsed === 'pro' && !/flash/.test(String(r1.selectedModelPath.model)) && r1.provenance.selectedFinalizedCount === r1.selectedFinalization.finalSuggestions.length)
    check('R3b. preparation once + discovery ≤ 1 (single snapshot)', s1.calls.filter((c) => c.kind === 'discovery').length <= 1 && typeof r1.provenance.preparationCalls === 'number')
    s1.server.close()

    // 3. Pro 0 provider-failure + rescue → single Flash attempt; recorded + model-path FLASH.
    const s3 = await startServer({ proAvailable: true, proMode: 'provider_fail', flashMode: 'ok' })
    const rr3 = await loadRun(s3.port)
    const r3 = await rr3.runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, rr3.newRunCostController('premium', 'run3', 12))
    check('R4. Pro provider-fail + rescue → single Flash attempt, selected flash', r3.provenance.flashAttempted === true && synthCalls(s3.calls, 'flash') >= 1 && synthCalls(s3.calls, 'flash') <= 2 && r3.selectedModel === 'flash' && r3.provenance.fallbackReason === 'pro_provider_failure_rescue')
    check('R5. Flash fallback recorded + MODEL PATH as Flash, never Pro', /flash/.test(r3.provenance.modelUsedForPersistence ?? '') && !/pro/.test(r3.provenance.modelUsedForPersistence ?? '') && r3.selectedModelPath.tierUsed === 'flash' && /flash/.test(String(r3.selectedModelPath.model)) && r3.provenance.proResolvedModel !== null && r3.provenance.flashResolvedModel !== null)
    check('R5b. selectedFinalization === Flash finalized batch (finalized once), Pro discarded', fp(r3.selectedFinalization.finalSuggestions) === fp(r3.selectedEngineSuggestions.length ? r3.selectedFinalization.finalSuggestions : []) && r3.selectedFinalization.finalSuggestions.length === r3.provenance.selectedFinalizedCount)
    check('R6. exactly one Pro attempt + one Flash attempt (no third+ call)', synthCalls(s3.calls, 'pro') >= 1 && synthCalls(s3.calls, 'pro') <= 2 && synthCalls(s3.calls, 'flash') >= 1 && synthCalls(s3.calls, 'flash') <= 2)
    check('R6b. full provenance is present (all Stage-D fields)', ['primaryModelRequested', 'proAttempted', 'proResolvedModel', 'proDowngraded', 'proFinalizedCount', 'fallbackEvaluated', 'fallbackTriggered', 'fallbackReason', 'fallbackRescueBriefCount', 'flashAttempted', 'flashResolvedModel', 'flashFinalizedCount', 'selectedModel', 'selectedFinalizedCount', 'selectionReason', 'preparationCalls', 'discoveryCalls'].every((k) => k in r3.provenance) && r3.provenance.fallbackRescueBriefCount > 0)
    s3.server.close()

    // 4. Pro 0 synthesis-failure + rescue → single Flash attempt.
    const s4 = await startServer({ proAvailable: true, proMode: 'synth_fail', flashMode: 'ok' })
    const rr4 = await loadRun(s4.port)
    const r4 = await rr4.runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, rr4.newRunCostController('premium', 'run4', 12))
    check('R7. Pro synthesis-fail + rescue → single Flash attempt', r4.provenance.flashAttempted === true && synthCalls(s4.calls, 'flash') >= 1 && synthCalls(s4.calls, 'flash') <= 2 && r4.provenance.fallbackReason === 'pro_synthesis_failure_rescue')
    s4.server.close()

    // 9. Pro unavailable (downgraded before any Pro call) → Flash once, recorded Flash.
    const s9 = await startServer({ proAvailable: false, proMode: 'ok', flashMode: 'ok' })
    const rr9 = await loadRun(s9.port)
    const r9 = await rr9.runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, rr9.newRunCostController('premium', 'run9', 12))
    check('R8. Pro unavailable → single Flash attempt, provenance pro_unavailable + Flash', r9.provenance.proDowngraded === true && r9.provenance.proAttempted === false && r9.provenance.fallbackReason === 'pro_unavailable' && r9.provenance.flashAttempted === true && synthCalls(s9.calls, 'pro') === 0 && synthCalls(s9.calls, 'flash') >= 1 && synthCalls(s9.calls, 'flash') <= 2)
    check('R9. Pro-unavailable path never records a Pro model use; model path is Flash', r9.provenance.proAttempted === false && r9.selectedModelPath.tierUsed === 'flash' && (r9.selectedModel === 'none' || /flash/.test(r9.provenance.modelUsedForPersistence ?? '')) && /pro/i.test(r9.provenance.proRequestedModel))
    s9.server.close()

    // 10. Pro 0 + Flash also 0 → no batch, nothing selected.
    const s10 = await startServer({ proAvailable: true, proMode: 'provider_fail', flashMode: 'empty' })
    const rr10 = await loadRun(s10.port)
    const r10 = await rr10.runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, rr10.newRunCostController('premium', 'run10', 12))
    check('R10. Pro 0 + Flash 0 → no batch; selected finalization empty', r10.selectedModel === 'none' && r10.selectedFinalization.finalSuggestions.length === 0 && r10.selectedEngineSuggestions.length === 0)
    check('R11. no-batch never selects a model for persistence', r10.provenance.modelUsedForPersistence === null && r10.provenance.selectedFinalizedCount === 0 && r10.emptyReason !== null)
    s10.server.close()

    // 12. Budget blocked (tiny premium cap) → Flash NOT attempted; fallback_budget_blocked.
    const save = process.env.RECO_MAX_ESTIMATED_COST_USD_PREMIUM
    process.env.RECO_MAX_ESTIMATED_COST_USD_PREMIUM = '0.0000001'
    const s12 = await startServer({ proAvailable: true, proMode: 'ok', flashMode: 'ok' })
    const rr12 = await loadRun(s12.port)
    const r12 = await rr12.runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, rr12.newRunCostController('premium', 'run12', 12))
    check('R12. budget blocked → Flash NOT attempted; typed fallback_budget_blocked; no batch', r12.provenance.flashAttempted === false && r12.provenance.fallbackReason === 'fallback_budget_blocked' && r12.selectedModel === 'none' && synthCalls(s12.calls, 'flash') === 0)
    if (save === undefined) delete process.env.RECO_MAX_ESTIMATED_COST_USD_PREMIUM; else process.env.RECO_MAX_ESTIMATED_COST_USD_PREMIUM = save
    s12.server.close()
  }

  console.log('GUARD) route wiring, single flag, finalize-once, provenance, engine + QA untouched')
  {
    const routeSrc = read('../../../app/api/content/automation/recommendations/route.ts')
    const authSrc = read('../api-auth.ts')
    const uiSrc = read('../../../components/content/AutomationIdeas.tsx')
    const runSrc = read('../recommendations/production-run.ts')
    const ctrlSrc = read('../recommendations/production-controller.ts')
    const pageSrc = read('../../../app/(dashboard)/content/page.tsx')
    const hubSrc = read('../../../components/content/ContentHub.tsx')
    check('G1. flag helper: RECO_PRO_FIRST_CONTROLLER, missing/invalid → false', /RECO_PRO_FIRST_CONTROLLER === 'true'/.test(authSrc) && /isProFirstControllerEnabled/.test(authSrc))
    check('G2. route routes to the Pro-first controller when the flag is on', /const useProFirst = isProFirstControllerEnabled\(\)/.test(routeSrc) && /runProFirstProduction/.test(routeSrc))
    check('G3. flag on → client tier ignored (always premium; no Flash-first)', /qualityMode: 'premium'/.test(runSrc) && !/runProFirstProduction\([^)]*qualityMode/.test(routeSrc))
    check('G4. persistence records the SELECTED model (Flash fallback never Pro)', /proFirstProvenance \? proFirstProvenance\.modelUsedForPersistence/.test(routeSrc) && /persistTier = proFirstProvenance \? 'premium'/.test(routeSrc))
    check('G5. production budget is premium (never the QA cap)', /newRunCostController\('premium', generationRunId, 12\)/.test(routeSrc) && !/RECO_QA_MAX_RUN_COST_USD/.test(runSrc))
    check('G6. each attempt finalizes on a FRESH cloned guard (state isolation)', /cloneKeywordGuard\(snapshot\.guard\)/.test(runSrc))
    check('G7. single prepareBriefRun + single Pro + single Flash call-site each', (runSrc.match(/await prepareBriefRun\(/g) ?? []).length === 1 && (runSrc.match(/await synthesizeFromSnapshot\(/g) ?? []).length === 3)
    check('G8. idempotency guards preserved in the route (INFLIGHT + RECENT)', /INFLIGHT\.add/.test(routeSrc) && /seenRecently/.test(routeSrc))
    // Blocker 1 — requested model is the REAL Pro id, never a Flash constant.
    check('G9. provenance requested model = snapshot.modelPath.requestedModel (not the Flash primary constant)', /proRequestedModel = snapshot\.modelPath\.requestedModel/.test(runSrc) && !/requestedModel = RECOMMENDATION_MODEL_PRIMARY/.test(runSrc) && /primaryModelRequested: proRequestedModel/.test(runSrc))
    // Blocker 2 — the route shows the SELECTED attempt's model path, not the snapshot Pro path.
    check('G10. pipeline model_path uses the selected attempt path (Flash when Flash created the batch)', /model_path: proFirstResult \? proFirstResult\.selectedModelPath/.test(routeSrc))
    // Blocker 3 — finalize EXACTLY once for the selected output (no route re-finalize).
    check('G11. route reuses selectedFinalization (no second finalize on the selected batch)', /const finalized = proFirstResult \? proFirstResult\.selectedFinalization/.test(routeSrc) && /const fresh = finalized\.finalSuggestions/.test(routeSrc))
    // Blocker 4 — full production provenance in Preview diagnostics + real persistedWrites.
    check('G12. full productionProvenance surfaced in isolationDebug + persistedWrites set from the real outcome', /productionProvenance: proFirstProvenance/.test(routeSrc) && /proFirstProvenance\.persistedWrites = persistOutcome/.test(routeSrc))
    // Blocker 5 — reasons named after the PRO cause; no flash_*_rescue anywhere.
    check('G13. fallback reasons are pro_*_rescue (never flash_*_rescue)', /pro_provider_failure_rescue/.test(ctrlSrc) && !/flash_provider_failure_rescue|flash_synthesis_failure_rescue|flash_zero_marginal_yield_rescue/.test(ctrlSrc) && !/flash_.*_rescue/.test(runSrc))
    // Blocker 6 — ONE authoritative flag: server-derived prop, no NEXT_PUBLIC mirror.
    check('G14. UI reads the server prop, NOT NEXT_PUBLIC_RECO_PRO_FIRST_CONTROLLER', /const PRO_FIRST = proFirst/.test(uiSrc) && !/NEXT_PUBLIC_RECO_PRO_FIRST_CONTROLLER/.test(uiSrc))
    check('G15. the flag flows server→UI (page → ContentHub → AutomationIdeas), single source', /isProFirstControllerEnabled\(\)/.test(pageSrc) && /<ContentHub proFirst=\{proFirst\}/.test(pageSrc) && /proFirst=\{proFirst\}/.test(hubSrc))
    check('G16. no residual NEXT_PUBLIC_RECO_PRO_FIRST_CONTROLLER anywhere', !/NEXT_PUBLIC_RECO_PRO_FIRST_CONTROLLER/.test(uiSrc) && !/NEXT_PUBLIC_RECO_PRO_FIRST_CONTROLLER/.test(pageSrc) && !/NEXT_PUBLIC_RECO_PRO_FIRST_CONTROLLER/.test(hubSrc))
    // Blocker 7 — est-aware budget authorization (same estimator the gate uses).
    check('G17. fallback budget uses the call-cost estimator (est-aware), not just spent<cap', /estimateNextCallUsd\(/.test(runSrc) && /spentUsd \+ Math\.max\(0, est\) <= /.test(runSrc) && /budgetStopped/.test(runSrc))
    check('G18. UI: flag-gated single button, selector hidden', /!PRO_FIRST && \(/.test(uiSrc) && /צור המלצות/.test(uiSrc) && /יוצר המלצות…/.test(uiSrc) && /PRO_FIRST \? \{\} : \{ qualityMode \}/.test(uiSrc))
    // Frozen surfaces untouched.
    check('G19. validated engine files unchanged by Stage D', !/production-run|production-controller|proFirst/i.test(read('../recommendations/generate-from-briefs.ts')) && !/production-run|proFirst/i.test(read('../recommendations/finalize-attempt.ts')))
    check('G20. /reco-qa compare route + blind export untouched by Stage D', !/proFirst|production-run|production-controller/i.test(read('../../../app/api/content/automation/reco-qa/compare/route.ts')) && !/production-run|proFirst/i.test(read('../recommendations/blind-review-export.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
