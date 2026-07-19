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
    check('P2. Pro 0 + provider failure + rescue → Flash runs', evaluateFlashFallback({ ...base, proProviderFailed: true }).reason === 'flash_provider_failure_rescue')
    check('P3. Pro 0 + synthesis failure + rescue → Flash runs', evaluateFlashFallback({ ...base, proSynthesisFailed: true }).reason === 'flash_synthesis_failure_rescue')
    check('P4. Pro 0 + zero-marginal-yield + rescue → Flash runs', evaluateFlashFallback(base).reason === 'flash_zero_marginal_yield_rescue')
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
    // 1/2. Pro non-empty → Flash NEVER called; Pro selected + recorded as Pro.
    const s1 = await startServer({ proAvailable: true, proMode: 'ok', flashMode: 'ok' })
    const { runProFirstProduction, newRunCostController } = await loadRun(s1.port)
    const r1 = await runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, newRunCostController('premium', 'run1', 12))
    check('R1. Pro non-empty → selected pro, Flash NOT called', r1.selectedModel === 'pro' && r1.provenance.flashRan === false && synthCalls(s1.calls, 'flash') === 0 && r1.selectedEngineSuggestions.length > 0)
    check('R2. provenance records Pro truthfully (modelUsed pro, no fallback)', /pro/.test(r1.provenance.modelUsedForPersistence ?? '') && r1.provenance.fallbackReason === null && r1.provenance.proFinalizedCount > 0)
    check('R3. preparation once + discovery ≤ 1 (single snapshot)', s1.calls.filter((c) => c.kind === 'discovery').length <= 1 && typeof r1.provenance.preparationProviderCalls === 'number')
    s1.server.close()

    // 3. Pro 0 provider-failure + rescue → Flash called EXACTLY once; recorded as Flash.
    const s3 = await startServer({ proAvailable: true, proMode: 'provider_fail', flashMode: 'ok' })
    const rr3 = await loadRun(s3.port)
    const r3 = await rr3.runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, rr3.newRunCostController('premium', 'run3', 12))
    // One Flash ATTEMPT = one synthesizeFromSnapshot call-site (G7); it may make ≤2
    // internal adaptive rounds (frozen engine behavior), so bound provider calls at ≤2.
    check('R4. Pro provider-fail + rescue → single Flash attempt, selected flash', r3.provenance.flashRan === true && synthCalls(s3.calls, 'flash') >= 1 && synthCalls(s3.calls, 'flash') <= 2 && r3.selectedModel === 'flash' && r3.provenance.fallbackReason === 'flash_provider_failure_rescue')
    check('R5. Flash fallback recorded as FLASH, never Pro; selected batch is Flash-only', /flash/.test(r3.provenance.modelUsedForPersistence ?? '') && !/pro/.test(r3.provenance.modelUsedForPersistence ?? '') && r3.provenance.proModelUsed !== null && r3.provenance.flashModelUsed !== null && r3.selectedEngineSuggestions.length > 0)
    check('R6. exactly one Pro attempt + one Flash attempt (no third+ call)', synthCalls(s3.calls, 'pro') >= 1 && synthCalls(s3.calls, 'pro') <= 2 && synthCalls(s3.calls, 'flash') >= 1 && synthCalls(s3.calls, 'flash') <= 2)
    s3.server.close()

    // 4. Pro 0 synthesis-failure + rescue → Flash called once.
    const s4 = await startServer({ proAvailable: true, proMode: 'synth_fail', flashMode: 'ok' })
    const rr4 = await loadRun(s4.port)
    const r4 = await rr4.runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, rr4.newRunCostController('premium', 'run4', 12))
    check('R7. Pro synthesis-fail + rescue → single Flash attempt', r4.provenance.flashRan === true && synthCalls(s4.calls, 'flash') >= 1 && synthCalls(s4.calls, 'flash') <= 2 && r4.provenance.fallbackReason === 'flash_synthesis_failure_rescue')
    s4.server.close()

    // 9. Pro unavailable (downgraded before any Pro call) → Flash once, recorded Flash.
    const s9 = await startServer({ proAvailable: false, proMode: 'ok', flashMode: 'ok' })
    const rr9 = await loadRun(s9.port)
    const r9 = await rr9.runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, rr9.newRunCostController('premium', 'run9', 12))
    check('R8. Pro unavailable → single Flash attempt, provenance pro_unavailable + Flash', r9.provenance.proDowngradedBeforeCall === true && r9.provenance.fallbackReason === 'pro_unavailable' && r9.provenance.flashRan === true && synthCalls(s9.calls, 'pro') === 0 && synthCalls(s9.calls, 'flash') >= 1 && synthCalls(s9.calls, 'flash') <= 2)
    check('R9. Pro unavailable path never records a Pro model use', r9.provenance.proModelUsed === null && (r9.selectedModel === 'none' || /flash/.test(r9.provenance.modelUsedForPersistence ?? '')))
    s9.server.close()

    // 10. Pro 0 + Flash also 0 → no batch, nothing selected.
    const s10 = await startServer({ proAvailable: true, proMode: 'provider_fail', flashMode: 'empty' })
    const rr10 = await loadRun(s10.port)
    const r10 = await rr10.runProFirstProduction(fakeAdmin(tables()), { projectId: 'p1', targetCount: 8, userId: 'u1' }, rr10.newRunCostController('premium', 'run10', 12))
    check('R10. Pro 0 + Flash 0 → no batch; selectedEngineSuggestions empty', r10.selectedModel === 'none' && r10.selectedEngineSuggestions.length === 0)
    check('R11. no-batch never selects a model for persistence', r10.provenance.modelUsedForPersistence === null && r10.emptyReason !== null)
    s10.server.close()
  }

  console.log('GUARD) route wiring, flag, engine + QA untouched')
  {
    const routeSrc = read('../../../app/api/content/automation/recommendations/route.ts')
    const authSrc = read('../api-auth.ts')
    const uiSrc = read('../../../components/content/AutomationIdeas.tsx')
    check('G1. flag helper: RECO_PRO_FIRST_CONTROLLER, missing/invalid → false', /RECO_PRO_FIRST_CONTROLLER === 'true'/.test(authSrc) && /isProFirstControllerEnabled/.test(authSrc))
    check('G2. route routes to the Pro-first controller when the flag is on', /const useProFirst = isProFirstControllerEnabled\(\)/.test(routeSrc) && /runProFirstProduction/.test(routeSrc))
    check('G3. when flag on, the client tier field is IGNORED (always premium; no Flash-first)', /qualityMode: 'premium'/.test(read('../recommendations/production-run.ts')) && !/runProFirstProduction\([^)]*qualityMode/.test(routeSrc))
    check('G4. persistence records the SELECTED model (Flash fallback never Pro)', /proFirstProvenance \? proFirstProvenance\.modelUsedForPersistence/.test(routeSrc) && /persistTier = proFirstProvenance \? 'premium'/.test(routeSrc))
    check('G5. production budget is premium (never the QA cap)', /newRunCostController\('premium', generationRunId, 12\)/.test(routeSrc) && !/RECO_QA_MAX_RUN_COST_USD/.test(read('../recommendations/production-run.ts')))
    check('G6. each attempt finalizes on a FRESH cloned guard (state isolation)', /cloneKeywordGuard\(snapshot\.guard\)/.test(read('../recommendations/production-run.ts')))
    check('G7. single prepareBriefRun + single Pro + single Flash call-site each', (read('../recommendations/production-run.ts').match(/await prepareBriefRun\(/g) ?? []).length === 1 && (read('../recommendations/production-run.ts').match(/await synthesizeFromSnapshot\(/g) ?? []).length === 3)
    check('G8. idempotency guards preserved in the route (INFLIGHT + RECENT)', /INFLIGHT\.add/.test(routeSrc) && /seenRecently/.test(routeSrc))
    check('G9. UI: flag-gated single button, selector hidden, model info hidden', /NEXT_PUBLIC_RECO_PRO_FIRST_CONTROLLER === 'true'/.test(uiSrc) && /!PRO_FIRST && \(/.test(uiSrc) && /צור המלצות/.test(uiSrc) && /יוצר המלצות…/.test(uiSrc))
    check('G10. UI omits the tier field when Pro-first is active', /PRO_FIRST \? \{\} : \{ qualityMode \}/.test(uiSrc))
    // Frozen surfaces untouched.
    check('G11. validated engine files unchanged by Stage D (no edits to generate-from-briefs/finalize)', !/production-run|production-controller|proFirst/i.test(read('../recommendations/generate-from-briefs.ts')) && !/production-run|proFirst/i.test(read('../recommendations/finalize-attempt.ts')))
    check('G12. /reco-qa compare route + blind export untouched by Stage D', !/proFirst|production-run|production-controller/i.test(read('../../../app/api/content/automation/reco-qa/compare/route.ts')) && !/production-run|proFirst/i.test(read('../recommendations/blind-review-export.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
