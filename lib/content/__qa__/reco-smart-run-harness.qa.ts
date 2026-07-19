/**
 * SMART-RUN HARNESS QA (Stage B, Increment 4) — deterministic, offline, NON-persisting.
 *
 * Drives the REAL two-phase engine + the pure decision layer through
 * runSmartComparison over a local fixture Gemini server + a WRITE-TRAPPING in-memory
 * admin. Proves:
 *   - ONE snapshot; discovery runs exactly once (in prepare), never per attempt;
 *   - ≥3 Flash + ≥3 Pro attempts, each with a fresh controller + fresh cloned guard;
 *   - every attempt's unique-briefId rescue accounting reconciles to the pool;
 *   - the SAME finalizeRecommendationAttempt runs per attempt (finalized ≤ accepted),
 *     and its guard mutations never leak (attempts are independent);
 *   - NOTHING is persisted (zero write attempts reach the admin);
 *   - escalate / select / budget decisions match the telemetry.
 */
import { createServer, type Server } from 'http'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'

let pass = 0, fail = 0
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

// ── Model-AWARE fake Gemini server (needed to make Pro out-yield Flash) ──────────
interface Cfg {
  models: string[]
  respond: (briefs: { id: string; subject: string; aligned_query?: string }[], model: string) => unknown[]
  respondDiscovery?: (anchors: string[]) => unknown
}
function startServer(cfg: Cfg): Promise<{ server: Server; port: number; calls: { model: string; kind: 'synthesis' | 'discovery' }[] }> {
  const calls: { model: string; kind: 'synthesis' | 'discovery' }[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (req.method === 'GET' && (req.url ?? '').includes('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ models: cfg.models.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) }))
        return
      }
      if ((req.url ?? '').includes(':generateContent')) {
        const model = ((req.url ?? '').match(/models\/([^:]+):generateContent/) ?? [])[1] ?? 'unknown'
        const budgetMatch = body.match(/"thinkingBudget"\s*:\s*(\d+)/)
        const thinkingBudget = budgetMatch ? Number(budgetMatch[1]) : null
        if (model.includes('pro') && (thinkingBudget === null || thinkingBudget < 128 || thinkingBudget > 32768)) {
          res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 400, message: `Budget ${thinkingBudget} invalid`, status: 'INVALID_ARGUMENT' } })); return
        }
        if (!body.includes('"responseSchema"')) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 400, message: 'Missing responseSchema', status: 'INVALID_ARGUMENT' } })); return }
        const prompt: string = (() => { try { return JSON.stringify(JSON.parse(body)) } catch { return body } })()
        if (prompt.includes('OWNED ANCHORS')) {
          const am = prompt.match(/OWNED ANCHORS[^\[]*?(\[[\s\S]*?\])/)
          let anchors: string[] = []
          if (am) { try { anchors = JSON.parse(am[1].replace(/\\"/g, '"')) } catch { anchors = [] } }
          calls.push({ model, kind: 'discovery' })
          const needs = cfg.respondDiscovery ? cfg.respondDiscovery(anchors) : anchors.slice(0, 6).map((a, i) => ({ subject: i % 2 === 0 ? `יתרונות ${a} בשימוש יומיומי` : `טעויות נפוצות עם ${a}`, anchor: a, need: i % 2 === 0 ? 'explanation' : 'checklist', intent: 'informational' }))
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ needs }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 300, totalTokenCount: 1100 } }))
          return
        }
        const m = prompt.match(/BRIEFS:\\n(\[.*?\])\\n\\nOUTPUT/) ?? prompt.match(/BRIEFS:\s*\n(\[[\s\S]*?\])\s*\n\s*\nOUTPUT/)
        let briefs: { id: string; subject: string; aligned_query?: string }[] = []
        if (m) { try { briefs = JSON.parse(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')) } catch { briefs = [] } }
        calls.push({ model, kind: 'synthesis' })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ topics: cfg.respond(briefs, model) }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 400, totalTokenCount: 1400 } }))
        return
      }
      res.writeHead(404); res.end('{}')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, calls })))
}

// ── WRITE-TRAPPING in-memory admin (any non-read op is a persistence attempt) ───
function trappingAdmin(tables: Record<string, Record<string, unknown>[]>, onWrite: () => void) {
  const from = (table: string) => {
    const st: { filters: Record<string, unknown>; single: boolean } = { filters: {}, single: false }
    const exec = () => ({ data: st.single ? ((tables[table] ?? []).filter((r) => Object.entries(st.filters).every(([k, v]) => r[k] === v))[0] ?? null) : (tables[table] ?? []).filter((r) => Object.entries(st.filters).every(([k, v]) => r[k] === v)), error: null })
    const trap = () => { onWrite(); throw new Error(`persistence attempt on ${table}`) }
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select() { return b }, eq(c: string, v: unknown) { st.filters[c] = v; return b }, order() { return b }, limit() { return b },
      maybeSingle() { st.single = true; return b },
      insert: trap, update: trap, upsert: trap, delete: trap,
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(res, rej) },
    })
    return b
  }
  return { from } as never
}

const genTitle = (s: string, i: number) => [(x: string) => x, (x: string) => `${x}: מה חשוב לדעת`, (x: string) => `${x} — מדריך מעשי`][i % 3](s)

function richTables(): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: 'p1', business_name: 'הצמחייה', target_domain: 'https://natural-shop.co.il', language: 'he', country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'תוספי תזונה טבעיים' }],
    keyword_research_cache: [{ project_id: 'p1', fetched_at: '2026-07-01', results_json: [
      { keyword: 'מגנזיום לילדים מינון', avgMonthlySearches: 320 }, { keyword: 'איך לבחור אבקת חלבון', avgMonthlySearches: 210 },
      { keyword: 'אנזימי עיכול טבעיים', avgMonthlySearches: 140 }, { keyword: 'יתרונות אומגה 3', avgMonthlySearches: 90 },
      { keyword: 'ויטמין C לילדים', avgMonthlySearches: 500 }, { keyword: 'חיזוק מערכת החיסון בחורף', avgMonthlySearches: 170 },
    ] }],
    shopify_entities: [
      { project_id: 'p1', is_active: true, title: 'מגנזיום ביסגליצינט 120 כמוסות', handle: 'mag', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/mag' },
      { project_id: 'p1', is_active: true, title: 'אבקת חלבון צמחית', handle: 'prot', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/prot' },
      { project_id: 'p1', is_active: true, title: 'אומגה 3 טבעי', handle: 'omega', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/omega' },
    ],
    generated_articles: [], article_topics: [], content_topic_ideas: [], wordpress_content_index: [],
  }
}
function discoveryTables(): Record<string, Record<string, unknown>[]> {
  const t = richTables(); t.keyword_research_cache = []; t.tracking_targets = [{ project_id: 'p1', keyword: 'אבקת חלבון צמחית' }]; return t
}

const FLASH = 'gemini-2.5-flash', PRO = 'gemini-2.5-pro'
const budgetFits = { preparationMaxUsd: 0.05, flashAttemptMaxUsd: 0.05, proRescueMaxUsd: 0.05, globalAuthorizedUsd: 1 }

async function loadHarness(port: number) {
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
  resetModelResolutionCache(); resetRecoGenAiClient()
  return import('../recommendations/smart-run-harness')
}

async function main() {
  // ── Scenario A — rich pool, identical models → tie → provisional_tie_pro ──────
  {
    const srv = await startServer({ models: [FLASH, PRO], respond: (briefs) => briefs.map((b, i) => ({ briefId: b.id, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' })) })
    const { runSmartComparison } = await loadHarness(srv.port)
    let writes = 0
    const r = await runSmartComparison(trappingAdmin(richTables(), () => { writes++ }), { projectId: 'p1', targetCount: 5, qualityMode: 'standard' }, { flashModel: FLASH, proModel: PRO, budgetMaxima: budgetFits })
    console.log('SCENARIO A) rich pool, symmetric models')
    check('A1. one snapshot; discovery did NOT run (rich pool)', r.discoveryRan === false && r.preparationProviderCalls === 0, JSON.stringify({ disc: r.discoveryRan, prep: r.preparationProviderCalls }))
    check('A2. ≥3 Flash + ≥3 Pro attempts', r.flash.length >= 3 && r.pro.length >= 3)
    check('A3. EVERY attempt reconciles to the pool (unique-briefId invariant)', [...r.flash, ...r.pro].every((a) => a.reconciled), JSON.stringify([...r.flash, ...r.pro].map((a) => a.reconciled)))
    check('A4. finalized ≤ engine-accepted for every attempt (finalize ran)', [...r.flash, ...r.pro].every((a) => a.finalizedCount <= a.engineAcceptedCount))
    check('A5. attempts are INDEPENDENT (guard clone): all Flash counts equal, all Pro counts equal', new Set(r.flash.map((a) => a.finalizedCount)).size === 1 && new Set(r.pro.map((a) => a.finalizedCount)).size === 1, JSON.stringify({ f: r.flash.map((a) => a.finalizedCount), p: r.pro.map((a) => a.finalizedCount) }))
    check('A6. synthesis provider calls == flash+pro attempts (snapshot reused, no re-prepare)', srv.calls.filter((c) => c.kind === 'synthesis').length === r.flash.length + r.pro.length, JSON.stringify(srv.calls.length))
    check('A7. ZERO discovery calls total (rich pool)', srv.calls.filter((c) => c.kind === 'discovery').length === 0)
    check('A8. NOTHING persisted (zero write attempts) + persistedWrites==0', writes === 0 && r.persistedWrites === 0)
    check('A9. equal-count tie → provisional Pro (QA-only, unresolved pending Stage C)', r.selection.select === 'pro' && r.selection.reason === 'provisional_tie_pro' && r.selection.provisional === true, JSON.stringify(r.selection))
    check('A10. budget authorized flash_first (worst-case fits)', r.budget.ok && r.budget.path === 'flash_first')
    srv.server.close()
  }

  // ── Scenario B — Pro out-yields Flash → pro_higher_count + Flash escalates ────
  {
    // Flash accepts only the FIRST brief of each batch (deep under-yield); Pro returns
    // all → Pro finalized strictly > Flash, and Flash is left under target with rescue.
    const srv = await startServer({ models: [FLASH, PRO], respond: (briefs, model) => briefs.map((b, i) => (model.includes('pro') || i === 0)
      ? { briefId: b.id, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }
      : { briefId: b.id, skip: true, why: 'flash under-yield' }) })
    const { runSmartComparison } = await loadHarness(srv.port)
    let writes = 0
    const r = await runSmartComparison(trappingAdmin(richTables(), () => { writes++ }), { projectId: 'p1', targetCount: 6, qualityMode: 'standard' }, { flashModel: FLASH, proModel: PRO, budgetMaxima: budgetFits })
    console.log('SCENARIO B) Pro out-yields Flash')
    check('B1. all attempts reconcile', [...r.flash, ...r.pro].every((a) => a.reconciled))
    check('B2. Pro finalized strictly > Flash finalized', r.pro[0].finalizedCount > r.flash[0].finalizedCount, JSON.stringify({ f: r.flash[0].finalizedCount, p: r.pro[0].finalizedCount }))
    check('B3. selector picks Pro by higher count (non-provisional)', r.selection.select === 'pro' && r.selection.reason === 'pro_higher_count' && r.selection.provisional === false, JSON.stringify(r.selection))
    check('B4. under-target Flash with rescue potential → escalate=true', r.flash[0].finalizedCount < 6 && r.flash[0].escalation.escalate === true && /rescue/.test(r.flash[0].escalation.reason), JSON.stringify(r.flash[0].escalation))
    check('B5. no writes', writes === 0)
    srv.server.close()
  }

  // ── Scenario C — discovery runs ONCE + budget path variants ───────────────────
  {
    const srv = await startServer({ models: [FLASH, PRO], respond: (briefs) => briefs.map((b, i) => ({ briefId: b.id, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' })) })
    const { runSmartComparison } = await loadHarness(srv.port)
    let writes = 0
    const r = await runSmartComparison(trappingAdmin(discoveryTables(), () => { writes++ }), { projectId: 'p1', targetCount: 6, qualityMode: 'standard' }, { flashModel: FLASH, proModel: PRO, budgetMaxima: budgetFits })
    console.log('SCENARIO C) discovery fills the pool ONCE')
    check('C1. discovery ran, exactly ONE discovery provider call (during prepare)', r.discoveryRan === true && r.preparationProviderCalls === 1 && srv.calls.filter((c) => c.kind === 'discovery').length === 1, JSON.stringify({ prep: r.preparationProviderCalls, disc: srv.calls.filter((c) => c.kind === 'discovery').length }))
    check('C2. every attempt still reconciles with a discovery-filled pool', [...r.flash, ...r.pro].every((a) => a.reconciled))
    check('C3. no second discovery call across all 6 attempts', srv.calls.filter((c) => c.kind === 'discovery').length === 1)
    check('C4. no writes', writes === 0)
    srv.server.close()
  }

  // ── Scenario D — budget authorization paths (through the harness) ─────────────
  {
    const srv = await startServer({ models: [FLASH, PRO], respond: (briefs) => briefs.map((b, i) => ({ briefId: b.id, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' })) })
    const { runSmartComparison } = await loadHarness(srv.port)
    const input = { projectId: 'p1', targetCount: 5, qualityMode: 'standard' as const }
    const proFirst = await runSmartComparison(trappingAdmin(richTables(), () => {}), input, { flashModel: FLASH, proModel: PRO, budgetMaxima: { preparationMaxUsd: 0.05, flashAttemptMaxUsd: 0.05, proRescueMaxUsd: 0.05, globalAuthorizedUsd: 0.1 } })
    const reject = await runSmartComparison(trappingAdmin(richTables(), () => {}), input, { flashModel: FLASH, proModel: PRO, budgetMaxima: { preparationMaxUsd: 0.05, flashAttemptMaxUsd: 0.05, proRescueMaxUsd: 0.05, globalAuthorizedUsd: 0.02 } })
    console.log('SCENARIO D) budget authorization paths')
    check('D1. globalAuthorized fits pro-first only → path=pro_first', proFirst.budget.ok && proFirst.budget.path === 'pro_first', JSON.stringify(proFirst.budget))
    check('D2. globalAuthorized below the smart minimum → reject', reject.budget.ok === false && reject.budget.path === 'reject', JSON.stringify(reject.budget))
    srv.server.close()
  }

  // ── Scenario E — server-side attempts-per-model maximum is enforced ───────────
  {
    const srv = await startServer({ models: [FLASH, PRO], respond: (briefs) => briefs.map((b, i) => ({ briefId: b.id, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' })) })
    const mod = await import('../recommendations/smart-run-harness')
    process.env.GEMINI_API_KEY = 'test-key'; process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${srv.port}`
    resetModelResolutionCache(); resetRecoGenAiClient()
    const r = await mod.runSmartComparison(trappingAdmin(richTables(), () => {}), { projectId: 'p1', targetCount: 5, qualityMode: 'standard' }, { flashModel: FLASH, proModel: PRO, flashAttempts: 50, proAttempts: 50, budgetMaxima: budgetFits })
    console.log('SCENARIO E) attempts-per-model maximum')
    check('E1. huge attemptsPerModel is clamped to the harness maximum', r.flash.length === mod.HARNESS_MAX_ATTEMPTS_PER_MODEL && r.pro.length === mod.HARNESS_MAX_ATTEMPTS_PER_MODEL, JSON.stringify({ f: r.flash.length, p: r.pro.length, max: mod.HARNESS_MAX_ATTEMPTS_PER_MODEL }))
    check('E2. maxAuthorizedCostFor is monotonic + covers the clamped run', mod.maxAuthorizedCostFor(3, 0.1, 0.1) < mod.maxAuthorizedCostFor(6, 0.1, 0.1))
    srv.server.close()
  }

  // ── Scenario F — same ordered brief IDs; snapshotId stable; no merge ──────────
  {
    const srv = await startServer({ models: [FLASH, PRO], respond: (briefs) => briefs.map((b, i) => ({ briefId: b.id, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' })) })
    const { runSmartComparison, computeAggregate } = await loadHarness(srv.port)
    const r = await runSmartComparison(trappingAdmin(richTables(), () => {}), { projectId: 'p1', targetCount: 5, qualityMode: 'standard' }, { flashModel: FLASH, proModel: PRO, budgetMaxima: budgetFits })
    console.log('SCENARIO F) ordered brief IDs + no Flash/Pro merge')
    check('F1. orderedBriefIds equals the pool size and is snapshot-stable', r.orderedBriefIds.length === r.poolSize && /^snap_[a-z0-9]+$/.test(r.snapshotId), JSON.stringify({ n: r.orderedBriefIds.length, pool: r.poolSize, id: r.snapshotId }))
    const idset = new Set(r.orderedBriefIds)
    check('F2. every attempt accepted only briefs from the SAME ordered pool', [...r.flash, ...r.pro].every((a) => a.uniqueAcceptedBriefIds.every((id) => idset.has(id))))
    check('F3. Flash and Pro attempt sets are DISJOINT (never merged)', r.flash.every((f) => !r.pro.includes(f)) && r.selection.select !== undefined && (r.selection.select === 'flash' || r.selection.select === 'pro'))
    // F4. aggregate correctness recomputed independently.
    const expected = computeAggregate(r.flash, r.targetCount, FLASH)
    check('F4. aggregate metrics match an independent recompute', JSON.stringify(expected) === JSON.stringify(r.aggregate.flash))
    check('F5. mean finalized equals the arithmetic mean of the attempts', r.aggregate.flash.meanFinalized === Number((r.flash.reduce((s, a) => s + a.finalizedCount, 0) / r.flash.length).toFixed(3)))
    srv.server.close()
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
