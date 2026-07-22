/**
 * LOW-FINAL-YIELD DISCOVERY-SYNTHESIS fallback QA.
 *
 * Proves the bounded combined discovery+synthesis third call end-to-end against the
 * REAL generateFromBriefs pipeline (fake Gemini over the RECO_GENAI_BASE_URL seam) plus
 * exhaustive PURE unit coverage of the seed inventory / trigger / schema / reconciliation,
 * and source contracts on the engine wiring. Behavioral items:
 *   (1) exhausted pool + accepted<4 + coverage≥50% + ≥12 unused seeds → third call is the
 *       low_yield_discovery_synthesis strategy;
 *   (2) that call is ONE combined call producing candidates run through normal validation;
 *   (3) never a fourth real paid call (global cap 3);
 *   (4) a healthy-but-short run uses the normal bounded refill instead;
 *   (5) <12 eligible seeds → the fallback does not fire;
 *   (6) provider/budget failure does not trigger it;
 *   (7) every emitted topic references an allowed seedId (schema enum + reconcile);
 *   (8) a raw GSC/KR row is never persisted directly (only via a validated PolishedTopic);
 *   (9) a fallback candidate rejected by any gate is not accepted;
 *   (10) dup/cannibalization/ownership/brand-safety gates are the SAME validatePolished;
 *   (11) rejected/approved/generated idea status semantics are unchanged (diagnostics only);
 *   (12) Pro-zero → Flash stays globally capped at 3 (fallback opt-out);
 *   (13) the third-call strategies are mutually exclusive;
 *   (14) Preview diagnostics reconcile seed counts/outputs;
 *   (15) no migration / DB change.
 */
import { createServer, type Server } from 'http'
import { readFileSync } from 'fs'
import { join } from 'path'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'
import {
  buildSeedInventory, evaluateLowYieldTrigger, fallbackResponseSchema, reconcileFallback,
  buildBlockerContext, buildFallbackPrompt, relatedEntitiesForSubject,
  COVERAGE_REJECTION_REASONS, MIN_ELIGIBLE_SEEDS, MAX_SEEDS_SENT,
  type RawSeedCandidate, type FallbackSeed,
} from '../recommendations/low-yield-fallback'
import { buildBrandSafety } from '../recommendations/brand-safety'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

// ── Minimal fake Gemini (models + discovery + synthesis + LOW-YIELD FALLBACK) ─────
interface Cfg {
  models: string[]
  synthesis: (briefs: { id: string; subject: string; aligned_query?: string }[]) => unknown[]
  fallback?: (seeds: { id: string; seed: string }[]) => unknown[]
  failFallback?: boolean
}
function startFake(cfg: Cfg): Promise<{ server: Server; port: number; calls: { kind: string; model: string }[] }> {
  const calls: { kind: string; model: string }[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const url = req.url ?? ''
      if (req.method === 'GET' && url.includes('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ models: cfg.models.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) }))
        return
      }
      if (url.includes(':generateContent')) {
        const model = (url.match(/models\/([^:]+):generateContent/) ?? [])[1] ?? 'unknown'
        const budgetMatch = body.match(/"thinkingBudget"\s*:\s*(\d+)/)
        const thinkingBudget = budgetMatch ? Number(budgetMatch[1]) : null
        if (model.includes('pro') && (thinkingBudget === null || thinkingBudget < 128)) {
          res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 400, message: 'thinking budget invalid', status: 'INVALID_ARGUMENT' } })); return
        }
        const prompt: string = (() => { try { return JSON.stringify(JSON.parse(body)) } catch { return body } })()
        // LOW-YIELD FALLBACK prompt → {topics:[{seedId,...}]}.
        if (prompt.includes('EVIDENCE SEEDS')) {
          calls.push({ kind: 'fallback', model })
          if (cfg.failFallback) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 400, message: 'boom', status: 'INTERNAL' } })); return }
          const sm = prompt.match(/EVIDENCE SEEDS[^\[]*?(\[[\s\S]*?\])\\n/) ?? prompt.match(/EVIDENCE SEEDS[\s\S]*?(\[[\s\S]*?\])/)
          let seeds: { id: string; seed: string }[] = []
          if (sm) { try { seeds = JSON.parse(sm[1].replace(/\\"/g, '"')) } catch { seeds = [] } }
          const topics = cfg.fallback ? cfg.fallback(seeds) : seeds.slice(0, 6).map((s) => ({ seedId: s.id, title: `${s.seed} למתחילים: מדריך מעשי`, primaryKeyword: `${s.seed} למתחילים`, secondaryKeywords: [], intent: 'informational' }))
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ topics }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 300, totalTokenCount: 1200 } }))
          return
        }
        // CONSTRAINED DISCOVERY prompt → empty needs (keep the pool as-is).
        if (prompt.includes('OWNED ANCHORS')) {
          calls.push({ kind: 'discovery', model })
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ needs: [] }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 100, totalTokenCount: 600 } }))
          return
        }
        // SYNTHESIS prompt.
        calls.push({ kind: 'synthesis', model })
        const m = prompt.match(/BRIEFS:\s*\\n(\[[\s\S]*?\])\\n\\nOUTPUT/) ?? prompt.match(/BRIEFS:\s*\n(\[[\s\S]*?\])\s*\n\s*\nOUTPUT/)
        let briefs: { id: string; subject: string; aligned_query?: string }[] = []
        if (m) { try { briefs = JSON.parse(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')) } catch { briefs = [] } }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ topics: cfg.synthesis(briefs) }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 400, totalTokenCount: 1400 } }))
        return
      }
      res.writeHead(404); res.end('{}')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, calls })))
}

function fakeAdmin(tables: Record<string, Record<string, unknown>[]>) {
  const from = (table: string) => {
    const st: { filters: Record<string, unknown>; single: boolean } = { filters: {}, single: false }
    const exec = () => {
      const rows = (tables[table] ?? []).filter((r) => Object.entries(st.filters).every(([k, v]) => r[k] === v))
      return { data: st.single ? (rows[0] ?? null) : rows, error: null }
    }
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select() { return b }, eq(col: string, val: unknown) { st.filters[col] = val; return b },
      order() { return b }, limit() { return b }, maybeSingle() { st.single = true; return b },
      in() { return b },
      then(resu: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(resu, rej) },
    })
    return b
  }
  return { from } as never
}

const tokensOf = (s: string) => s.split(/\s+/).filter((t) => t.length >= 2)

/** Health fixture with a LARGE keyword-research pool so many briefs stay unconsumed
 *  and become eligible fallback seeds. Commercial entities OWN their exact names, so
 *  the synthesis model returning an exact entity name yields a COVERAGE rejection. */
function healthTables(krQueries: { keyword: string; avgMonthlySearches: number }[]): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: 'p1', business_name: 'הצמחייה', target_domain: 'https://natural-shop.co.il', language: 'he', country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'תוספי תזונה טבעיים' }],
    keyword_research_cache: [{ project_id: 'p1', fetched_at: '2026-07-01', results_json: krQueries }],
    shopify_entities: [
      { project_id: 'p1', is_active: true, title: 'מגנזיום ביסגליצינט', handle: 'mag', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/mag' },
      { project_id: 'p1', is_active: true, title: 'אנזימי עיכול פורטה', handle: 'enz', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/enz' },
      { project_id: 'p1', is_active: true, title: 'ויטמין C טבעי', handle: 'vitc', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/vitc' },
      { project_id: 'p1', is_active: true, title: 'אבקת חלבון צמחית', handle: 'prot', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/prot' },
      { project_id: 'p1', is_active: true, title: 'אומגה 3 טבעי', handle: 'omega', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/omega' },
      { project_id: 'p1', is_active: true, title: 'פרוביוטיקה יומית', handle: 'prob', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/prob' },
    ],
    generated_articles: [],
    article_topics: [],
    content_topic_ideas: [],
    wordpress_content_index: [],
  }
}

const KR_LONG_TAILS = [
  'מגנזיום לילדים מינון', 'אבקת חלבון לצמחונים', 'אנזימי עיכול אחרי ארוחה', 'אומגה 3 לזיכרון',
  'פרוביוטיקה לתינוקות', 'ויטמין D בחורף', 'ברזל לנשים בהריון', 'אבץ לחיזוק חיסון',
  'סידן לעצמות חזקות', 'ויטמין B12 לצמחונים', 'קולגן לעור פנים', 'ספירולינה לאנרגיה',
  'כורכום נגד דלקות', 'מלטונין לשינה טובה', 'תיאנין להרגעת מתח', 'קריאטין לספורטאים',
  'גלוטמין להתאוששות שרירים', 'ביוטין לשיער בריא', 'לוטאין לבריאות העיניים', 'רזברטרול לאריכות ימים',
  'אשווגנדה להפחתת חרדה', 'קרניטין לשריפת שומן', 'זרעי ציה לסיבים תזונתיים', 'ג’ינג’ר נגד בחילות',
  'ויטמין E לעור יבש', 'סלניום לבלוטת התריס', 'כרום לאיזון סוכר', 'קוארצטין נגד אלרגיות',
  'מליסה רפואית להרגעה', 'פסיליום לבריאות המעי', 'טאורין לאנרגיה יומית', 'בטא גלוקן לחיזוק חיסוני',
  'שמן נר הלילה לנשים', 'חומצה היאלורונית ללחות העור',
].map((k, i) => ({ keyword: k, avgMonthlySearches: 120 + i * 10 }))

async function runEngine(tables: Record<string, Record<string, unknown>[]>, port: number, opts: { qualityMode: 'premium' | 'standard'; targetCount: number; runId: string }) {
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
  resetModelResolutionCache(); resetRecoGenAiClient()
  const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
  const { newRunCostController } = await import('../recommendations/run-cost-controller')
  return generateFromBriefs(fakeAdmin(tables), { projectId: 'p1', targetCount: opts.targetCount, qualityMode: opts.qualityMode }, newRunCostController(opts.qualityMode, opts.runId, opts.targetCount))
}

// A synthesis responder that COVERAGE-rejects every brief by returning a shared
// commercial entity's EXACT name as the primary keyword (exact_existing_keyword_owner).
const ENTITY_NAMES = ['מגנזיום ביסגליצינט', 'אנזימי עיכול פורטה', 'ויטמין C טבעי', 'אבקת חלבון צמחית', 'אומגה 3 טבעי', 'פרוביוטיקה יומית']
const coverageRejectAll = (briefs: { id: string; subject: string }[]) => briefs.map((b) => {
  const bt = new Set(tokensOf(b.subject))
  const ent = ENTITY_NAMES.find((e) => tokensOf(e).some((t) => bt.has(t)))
  if (ent) return { briefId: b.id, skip: false, title: `${ent} — כל מה שחשוב`, primaryKeyword: ent, secondaryKeywords: [], intent: 'commercial' }
  return { briefId: b.id, skip: true, why: 'no angle' }
})

const brandSafetyStub = buildBrandSafety({ businessName: null, entityNames: [], ownEvidence: [] })

async function main() {
  // ─────────────────────────────── PURE UNIT ───────────────────────────────
  console.log('U) seed inventory — exclusions, opaque ids, priority, ≥12 gate')
  {
    const raw: RawSeedCandidate[] = [
      { phrase: 'מגנזיום לילדים מינון', source: 'keywordResearch', volume: 300 },
      { phrase: 'מגנזיום לילדים מינון', source: 'tracked' }, // duplicate normalized → dropped
      { phrase: 'מגנזיום', source: 'keywordResearch', volume: 2000 }, // 1 token → malformed_generic
      { phrase: 'אבקת חלבון צמחית לספורטאים', source: 'projectFocus' },
      { phrase: 'אנזימי עיכול פורטה', source: 'entity' }, // exact entity owner → excluded
      { phrase: 'ויטמין C טבעי', source: 'tracked' }, // exact content keyword → excluded (idea/tracked)
      { phrase: 'תוסף מזון כללי', source: 'keywordResearch' }, // covered_by_existing_content
    ]
    const inv = buildSeedInventory({
      rawSeeds: raw,
      isExactContentKeyword: (p) => p === 'ויטמין C טבעי',
      isEntityOwner: (p) => p === 'אנזימי עיכול פורטה',
      isCoveredByContent: (p) => p === 'תוסף מזון כללי',
      pendingExactKeys: new Set(),
      publishedSignatures: [], pendingSignatures: [], acceptedRunSignatures: [], consumedBriefSignatures: [],
      attributeTokens: new Set(), brandSafety: brandSafetyStub,
      relatedEntitiesFor: () => [], ideaStatusesOf: () => [],
    })
    check('U1. two clean seeds eligible; every exclusion typed', inv.eligibleSeedCount === 2, JSON.stringify({ el: inv.eligibleSeedCount, r: inv.excludedByReason }))
    check('U2. duplicate normalized seed excluded', (inv.excludedByReason.duplicate_seed ?? 0) === 1)
    check('U3. one-token phrase → malformed_generic', (inv.excludedByReason.malformed_generic ?? 0) === 1)
    check('U4. exact entity owner excluded', (inv.excludedByReason.exact_entity_owner ?? 0) === 1)
    check('U5. exact content keyword excluded', (inv.excludedByReason.exact_existing_content_keyword ?? 0) === 1)
    check('U6. covered_by_existing_content excluded', (inv.excludedByReason.covered_by_existing_content ?? 0) === 1)
    check('U7. opaque deterministic seed ids (seed_ prefix, no vocabulary)', inv.eligibleSeeds.every((s) => /^seed_[a-z0-9]+$/.test(s.seedId)))
    check('U8. tracked/entity priority ≥ keywordResearch (business pillars strongest)', (() => {
      const two = buildSeedInventory({ rawSeeds: [{ phrase: 'נושא ראשון ארוך', source: 'keywordResearch', volume: 10 }, { phrase: 'נושא שני ארוך', source: 'tracked' }], isExactContentKeyword: () => false, isEntityOwner: () => false, isCoveredByContent: () => false, pendingExactKeys: new Set(), publishedSignatures: [], pendingSignatures: [], acceptedRunSignatures: [], consumedBriefSignatures: [], attributeTokens: new Set(), brandSafety: brandSafetyStub, relatedEntitiesFor: () => [], ideaStatusesOf: () => [] })
      return two.eligibleSeeds[0].source === 'tracked'
    })())
  }

  console.log('U) idea-status blocks are DIAGNOSTIC only (guard rule unchanged)')
  {
    const raw: RawSeedCandidate[] = [
      { phrase: 'רעיון דחוי ישן', source: 'keywordResearch' },
      { phrase: 'רעיון מאושר ישן', source: 'keywordResearch' },
    ]
    const inv = buildSeedInventory({
      rawSeeds: raw,
      isExactContentKeyword: () => true, // both are exact idea keywords in the guard
      isEntityOwner: () => false, isCoveredByContent: () => false,
      pendingExactKeys: new Set(), publishedSignatures: [], pendingSignatures: [], acceptedRunSignatures: [], consumedBriefSignatures: [],
      attributeTokens: new Set(), brandSafety: brandSafetyStub, relatedEntitiesFor: () => [],
      ideaStatusesOf: (p) => [p.includes('דחוי') ? 'rejected' : 'approved'],
    })
    check('U9. rejected+approved idea seeds excluded (guard status semantics unchanged)', inv.eligibleSeedCount === 0 && (inv.excludedByReason.exact_existing_content_keyword ?? 0) === 2)
    check('U10. idea-status blocks counted separately for diagnostics', inv.ideaStatusBlocks.rejected === 1 && inv.ideaStatusBlocks.approved === 1)
  }

  console.log('U) trigger — all 7 conditions must hold')
  {
    const base = { acceptedCount: 2, targetCount: 8, eligibleSeedCount: 14, rejectionCounts: { covered_by_existing_content: 4, title_keyword_mismatch: 1 }, controllerAuthorizes: true, finalSlotAvailable: true, noFailure: true }
    check('U11. fires when all conditions hold + coverage ≥ 50%', evaluateLowYieldTrigger(base).triggered)
    check('U12. accepted ≥ 4 → no fire', !evaluateLowYieldTrigger({ ...base, acceptedCount: 4 }).triggered)
    check('U13. target reached → no fire', !evaluateLowYieldTrigger({ ...base, acceptedCount: 8 }).triggered)
    check('U14. <12 eligible seeds → no fire', !evaluateLowYieldTrigger({ ...base, eligibleSeedCount: MIN_ELIGIBLE_SEEDS - 1 }).triggered)
    check('U15. coverage < 50% → no fire', !evaluateLowYieldTrigger({ ...base, rejectionCounts: { title_keyword_mismatch: 4, covered_by_existing_content: 1 } }).triggered)
    check('U16. a failure stop → no fire', !evaluateLowYieldTrigger({ ...base, noFailure: false }).triggered)
    check('U17. controller refuses → no fire', !evaluateLowYieldTrigger({ ...base, controllerAuthorizes: false }).triggered)
    check('U18. no final slot → no fire', !evaluateLowYieldTrigger({ ...base, finalSlotAvailable: false }).triggered)
    check('U19. zero rejections → coverage-dominated false (never fire on empty)', !evaluateLowYieldTrigger({ ...base, rejectionCounts: {} }).triggered)
    check('U20. the coverage-reason set matches the spec families', ['existing_content_owns_need', 'already_covered', 'covered_by_existing_content', 'exact_existing_keyword_owner', 'pending_semantic_duplicate', 'primary_keyword_exists'].every((r) => COVERAGE_REJECTION_REASONS.has(r)))
  }

  console.log('U) schema + reconcile — seedId enum, one-per-seed, subject = seed')
  {
    const seeds: FallbackSeed[] = [
      { seedId: 'seed_a', phrase: 'מגנזיום לשרירים', source: 'keywordResearch', priority: 70, alignedVolume: 200, intentHint: 'informational', relatedEntities: [] },
      { seedId: 'seed_b', phrase: 'אבץ לחיסון', source: 'tracked', priority: 100, alignedVolume: null, intentHint: 'informational', relatedEntities: [] },
    ]
    const schema = fallbackResponseSchema(seeds.map((s) => s.seedId)) as { properties: { topics: { items: { properties: { seedId: { enum: string[] } } } } } }
    check('U21. seedId is a schema ENUM of the exact eligible seed ids', JSON.stringify(schema.properties.topics.items.properties.seedId.enum) === JSON.stringify(['seed_a', 'seed_b']))
    const text = JSON.stringify({ topics: [
      { seedId: 'seed_a', title: 'מגנזיום לשרירים אחרי אימון', primaryKeyword: 'מגנזיום לשרירים אחרי אימון', secondaryKeywords: ['התכווצויות'], intent: 'informational' },
      { seedId: 'seed_a', title: 'עוד זווית', primaryKeyword: 'מגנזיום נוסף', secondaryKeywords: [], intent: 'informational' }, // 2nd for same seed → dropped
      { seedId: 'seed_unknown', title: 'X', primaryKeyword: 'Y', secondaryKeywords: [], intent: 'informational' }, // unknown → dropped
      { seedId: 'seed_b', title: '', primaryKeyword: 'ריק', secondaryKeywords: [], intent: 'informational' }, // empty title → dropped
    ] })
    const rec = reconcileFallback(text, seeds)
    check('U22. exactly one accepted pair (one-per-seed, unknown+empty dropped)', rec.pairs.length === 1 && rec.invalidItems === 3)
    check('U23. unknown seedId is recorded, never silently mapped', rec.unknownSeedIds.includes('seed_unknown'))
    check('U24. brief.subject === the SEED phrase (enforces subject relationship)', rec.pairs[0].brief.subject === 'מגנזיום לשרירים')
    check('U25. the topic.briefId === the synthetic brief opportunityId (lyf_ prefix)', rec.pairs[0].topic.briefId === rec.pairs[0].brief.opportunityId && /^lyf_/.test(rec.pairs[0].brief.opportunityId))
    check('U26. aligned demand only when the seed itself has stored volume', rec.pairs[0].brief.alignedDemandQuery?.volume === 200)
    check('U27. malformed / non-JSON → parseFailed, no pairs', reconcileFallback('not json at all', seeds).parseFailed && reconcileFallback('not json at all', seeds).pairs.length === 0)
  }

  console.log('U) blocker context + prompt are bounded & seed-referencing')
  {
    const bc = buildBlockerContext({ publishedNeedPhrases: Array.from({ length: 40 }, (_, i) => `נושא ${i}`), blockedExactKeywords: Array.from({ length: 30 }, (_, i) => `kw ${i}`), acceptedRunTitles: ['כותרת שהתקבלה'], acceptedRunKeywords: ['מילת מפתח'], rejectionCounts: { covered_by_existing_content: 5, title_keyword_mismatch: 2 } })
    check('U28. blocker context bounded (≤25 needs, ≤15 keywords, ≤5 reasons)', bc.coveredNeeds.length === 25 && bc.blockedKeywords.length === 15 && bc.topRejectionCategories.length === 2)
    const seeds: FallbackSeed[] = [{ seedId: 'seed_x', phrase: 'קולגן לעור', source: 'keywordResearch', priority: 70, alignedVolume: null, intentHint: 'informational', relatedEntities: [] }]
    const prompt = buildFallbackPrompt({ language: 'he', ctx: { projectName: 'x', domain: 'd', language: 'he', primaryProjectFocus: 'תוספי תזונה', secondaryProjectAreas: [], ownedCategories: [], existingTopics: [] }, year: 2026, seeds, ownedCommercialEntities: [], blocker: bc })
    check('U29. prompt carries EVIDENCE SEEDS + opaque seedId, forbids filler/renaming', prompt.includes('EVIDENCE SEEDS') && prompt.includes('seed_x') && /NO filler/.test(prompt) && /do NOT merely rename the seed/.test(prompt))
    check('U30. relatedEntitiesForSubject shares a distinctive token', relatedEntitiesForSubject('מגנזיום לילדים', [{ name: 'מגנזיום ביסגליצינט', url: null, type: 'product' }, { name: 'אומגה 3', url: null, type: 'product' }]).length === 1)
  }

  // ─────────────────────────── END-TO-END (real pipeline) ───────────────────────────
  console.log('E2E) low-yield fixture → the third call is low_yield_discovery_synthesis')
  {
    const { server, port, calls } = await startFake({ models: ['gemini-2.5-pro'], synthesis: coverageRejectAll })
    const run = await runEngine(healthTables(KR_LONG_TAILS), port, { qualityMode: 'premium', targetCount: 8, runId: 'lyf-e2e' })
    server.close()
    const d = run.diagnostics
    check('B1. third-call strategy = low_yield_discovery_synthesis', d.thirdCallStrategy === 'low_yield_discovery_synthesis', JSON.stringify({ s: d.thirdCallStrategy, lyf: d.lowYieldFallback, rej: d.rejected_by_reason }))
    check('B2. fallback was USED and eligible', d.lowYieldFallback.used && d.lowYieldFallback.eligible)
    check('B3. ≥12 eligible unused seeds (the trigger precondition held)', d.lowYieldFallback.eligibleSeedCount >= MIN_ELIGIBLE_SEEDS, `${d.lowYieldFallback.eligibleSeedCount}`)
    check('B4. exactly ONE combined fallback call (never a fourth real call)', calls.filter((c) => c.kind === 'fallback').length === 1 && d.model_calls <= 3, `calls=${d.model_calls}`)
    check('B5. the fallback produced candidates through NORMAL validation (some accepted)', (d.lowYieldFallback.engineAccepted ?? 0) >= 1 && run.suggestions.length >= 1)
    check('B6. every accepted fallback suggestion is a validated PolishedTopic (opportunity id), never a raw seed row', run.suggestions.every((s) => s.id.startsWith('opportunity:')))
    check('B7. coverage-dominated rejections drove the trigger (ratio ≥ 0.5)', d.lowYieldFallback.coverageRejectionRatio >= 0.5, `${d.lowYieldFallback.coverageRejectionRatio}`)
    check('B8. Preview diagnostics reconcile: emitted ≥ engineAccepted, seedsSent ≤ eligible', d.lowYieldFallback.emitted >= d.lowYieldFallback.engineAccepted && d.lowYieldFallback.seedsSent <= d.lowYieldFallback.eligibleSeedCount && d.lowYieldFallback.seedsSent <= MAX_SEEDS_SENT)
    check('B9. candidate accounting still reconciles (fallback candidates counted once)', d.candidateAccounting.reconciles)
  }

  console.log('E2E) <12 eligible seeds → the fallback does NOT fire')
  {
    const { server, port, calls } = await startFake({ models: ['gemini-2.5-pro'], synthesis: coverageRejectAll })
    // Only 3 KR long-tails → the pool is tiny, unused seeds stay < 12.
    const run = await runEngine(healthTables(KR_LONG_TAILS.slice(0, 3)), port, { qualityMode: 'premium', targetCount: 8, runId: 'lyf-small' })
    server.close()
    check('B10. no fallback call when eligible seeds < 12', calls.filter((c) => c.kind === 'fallback').length === 0)
    check('B11. strategy is not the low-yield fallback', run.diagnostics.thirdCallStrategy !== 'low_yield_discovery_synthesis')
    check('B12. eligible-seed count is truthfully below the threshold', run.diagnostics.lowYieldFallback.eligibleSeedCount < MIN_ELIGIBLE_SEEDS, `${run.diagnostics.lowYieldFallback.eligibleSeedCount}`)
  }

  console.log('E2E) healthy-but-short run → normal bounded refill (NOT the fallback)')
  {
    // Round 1 accepts a healthy batch; later rounds accept 0 → the normal bounded refill path.
    let round = 0
    const synthesis = (briefs: { id: string; subject: string }[]) => { round++; return round === 1
      ? briefs.map((b, i) => ({ briefId: b.id, skip: false, title: `${b.subject} — מדריך ${i}`, primaryKeyword: b.subject, secondaryKeywords: [], intent: 'informational' }))
      : coverageRejectAll(briefs) }
    const { server, port, calls } = await startFake({ models: ['gemini-2.5-pro'], synthesis })
    const run = await runEngine(healthTables(KR_LONG_TAILS), port, { qualityMode: 'premium', targetCount: 12, runId: 'lyf-healthy' })
    server.close()
    check('B13. a healthy round does not use the low-yield fallback', run.diagnostics.thirdCallStrategy !== 'low_yield_discovery_synthesis')
    check('B14. no fallback provider call was made', calls.filter((c) => c.kind === 'fallback').length === 0)
    check('B15. strategies are mutually exclusive (fallback not used here)', !run.diagnostics.lowYieldFallback.used)
    check('B16. global cap still ≤ 3 real calls', run.diagnostics.model_calls <= 3)
  }

  console.log('E2E) fallback provider failure does not exceed the cap or fake-accept')
  {
    const { server, port, calls } = await startFake({ models: ['gemini-2.5-pro'], synthesis: coverageRejectAll, failFallback: true })
    const run = await runEngine(healthTables(KR_LONG_TAILS), port, { qualityMode: 'premium', targetCount: 8, runId: 'lyf-fail' })
    server.close()
    check('B17. a failed fallback call still counts ≤ 3 and accepts nothing spurious', run.diagnostics.model_calls <= 3 && (run.diagnostics.lowYieldFallback.engineAccepted ?? 0) === 0)
    check('B18. the fallback was attempted exactly once (no retry loop)', calls.filter((c) => c.kind === 'fallback').length === 1)
  }

  // ─────────────────────────── SOURCE CONTRACTS ───────────────────────────
  console.log('SRC) engine wiring — mutual exclusivity, no bypass, no fourth call, no migration')
  {
    const gen = read('lib/content/recommendations/generate-from-briefs.ts')
    const prod = read('lib/content/recommendations/production-run.ts')
    check('S1. the fallback goes through the SAME validatePolished (no relaxed validator)', /const r = validatePolished\(polishedT, pair\.brief\)/.test(gen))
    check('S2. mutually exclusive: fallback in-loop breaks before the normal refill', /const fb = await runLowYieldFallback\(round\)\s*\n\s*if \(fb === 'ran' \|\| fb === 'blocked'\) \{[\s\S]{0,240}break\s*\n\s*\}/.test(gen))
    check('S3. post-loop fallback only when NO third call ran + a global slot remains (never a fourth)', /thirdCallStrategy === 'not_used' && allowRefill && !isFailureStop\(stop\) && !controller\.billingExhausted && controller\.callCount < PAID_CALL_CAP/.test(gen))
    check('S4. the fallback is opt-out for the Pro-zero Flash fallback (allowRefill=false)', /synthesizeFromSnapshot\(snapshot, controller, \{ modelOverride: flashModel, allowBoundedThirdRefill: false \}\)/.test(prod))
    check('S5. the trigger re-checks the controller AND the global cap', /controllerAuthorizes: !controller\.billingExhausted && controller\.callCount < controller\.budget\.maxModelCallsPerRun && controller\.callCount < PAID_CALL_CAP/.test(gen))
    check('S6. a controller-refused fallback is blocked (not used, no fourth call)', /if \(res\.stopped\) \{ stop = 'budget_stopped'; thirdCallStrategy = 'blocked'; return 'blocked' \}/.test(gen))
    check('S7. no migration / DB schema change introduced', !/supabase\/migrations|CREATE TABLE|ALTER TABLE/i.test(gen) && !/supabase\/migrations|CREATE TABLE|ALTER TABLE/i.test(read('lib/content/recommendations/low-yield-fallback.ts')))
    check('S8. the module is PURE (no Date/random/network)', !/Date\.now|Math\.random|new Date\(|fetch\(|require\(/.test(read('lib/content/recommendations/low-yield-fallback.ts')))
    check('S9. route surfaces thirdCallStrategy + lowYieldFallback Preview-only (count-only)', /thirdCallStrategy: briefDiagnostics\?\.thirdCallStrategy/.test(read('app/api/content/automation/recommendations/route.ts')) && /lowYieldFallback: briefDiagnostics\?\.lowYieldFallback/.test(read('app/api/content/automation/recommendations/route.ts')))
    check('S10. seeds/briefs never persisted directly — every candidate flows through suggestions.push(r.suggestion)', (gen.match(/suggestions\.push\(r\.suggestion\)/g) ?? []).length >= 2)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
