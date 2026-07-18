/**
 * EVIDENCE-FIRST ENGINE QA (Phase 4-7) — TRUE end-to-end, offline.
 *
 * Runs the REAL generateFromBriefs pipeline: real buildKeywordGuard → real brief
 * pool → real model.ts → the ACTUAL @google/genai SDK over HTTP against a local
 * fixture Gemini server (RECO_GENAI_BASE_URL seam) → real deterministic
 * validation/repair → real LinkPlan mapping — with a contract-faithful in-memory
 * Supabase admin. Covers the exact live defect classes:
 *   D2 duplicate topics · D3 truncated keyword · D4 malformed Hebrew reason ·
 *   D5 title/keyword mismatch · D6 invented demand · D7 broad-volume attribution ·
 *   D8 irrelevant links (privacy/colour/class-word) · D10 model path + downgrade ·
 *   exact per-round reconciliation (briefs = polished + skipped + missing).
 */
import { createServer, type Server } from 'http'
import { resetModelResolutionCache, pickPremiumModel } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'
import { isSemanticTopicDuplicate } from '../recommendations/semantic-dup'
import { salvageLongTailKeyword } from '../recommendations/keyword-salvage'
import { sanitizeDemandLanguage, isMalformedReason, validateIntentKeywordConsistency, validatePrimaryKeywordQuality } from '../recommendations/opportunity-validation'
import { mapLinkRoles, isBoilerplatePage, type LinkCandidateEntity } from '../recommendations/link-role-mapper'
import { resolveModelConfig, modelCapability } from '../recommendations/model-config'
import { classifyModelError, sanitizeProviderMessage } from '../recommendations/model'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── Fake Gemini server (the SDK's real REST surface) ─────────────────────────
interface GenaiServerConfig {
  models: string[]
  /** Given the parsed briefs payload from the prompt, produce topics[] items. */
  respond: (briefs: { id: string; subject: string; aligned_query?: string }[]) => unknown[]
  /** Simulate a provider that rejects EVERY generateContent with the live 400. */
  alwaysFail?: boolean
  /** Return this RAW text as the model output (contract-failure scenarios). */
  respondRaw?: (briefs: { id: string; subject: string; aligned_query?: string }[]) => string
  /** Respond to CONSTRAINED-DISCOVERY prompts (default: anchored needs). */
  respondDiscovery?: (anchors: string[]) => unknown
}
function startFakeGenai(cfg: GenaiServerConfig): Promise<{ server: Server; port: number; calls: { model: string; briefCount: number; thinkingBudget: number | null }[] }> {
  const calls: { model: string; briefCount: number; thinkingBudget: number | null }[] = []
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
        // STRICT capability validation (live-regression trap): Gemini 2.5 Pro
        // cannot disable thinking — thinkingBudget 0 gets the REAL provider 400.
        const budgetMatch = body.match(/"thinkingBudget"\s*:\s*(\d+)/)
        const thinkingBudget = budgetMatch ? Number(budgetMatch[1]) : null
        if (cfg.alwaysFail) {
          calls.push({ model, briefCount: 0, thinkingBudget })
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 400, message: 'Budget 0 is invalid. This model only works in thinking mode.', status: 'INVALID_ARGUMENT' } }))
          return
        }
        if (model.includes('pro') && thinkingBudget === 0) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 400, message: 'Budget 0 is invalid. This model only works in thinking mode.', status: 'INVALID_ARGUMENT' } }))
          return
        }
        if (model.includes('pro') && (thinkingBudget === null || thinkingBudget < 128 || thinkingBudget > 32768)) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 400, message: `Budget ${thinkingBudget} is invalid. Valid range is 128-32768.`, status: 'INVALID_ARGUMENT' } }))
          return
        }
        // STRICT structured-output validation (RC1 regression trap): every
        // generation call must carry an explicit responseSchema.
        if (!body.includes('"responseSchema"')) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 400, message: 'Missing responseSchema: structured output is required by this contract.', status: 'INVALID_ARGUMENT' } }))
          return
        }
        const prompt: string = (() => { try { const j = JSON.parse(body); return JSON.stringify(j) } catch { return body } })()
        // CONSTRAINED-DISCOVERY prompt → respond with anchored needs JSON.
        if (prompt.includes('OWNED ANCHORS')) {
          const am = prompt.match(/OWNED ANCHORS[^\[]*?(\[[\s\S]*?\])/)
          let anchors: string[] = []
          if (am) { try { anchors = JSON.parse(am[1].replace(/\\"/g, '"')) } catch { anchors = [] } }
          calls.push({ model, briefCount: -1, thinkingBudget })
          const needs = cfg.respondDiscovery
            ? cfg.respondDiscovery(anchors)
            : anchors.slice(0, 6).map((a, i) => ({ subject: i % 2 === 0 ? `יתרונות ${a} בשימוש יומיומי` : `טעויות נפוצות עם ${a}`, anchor: a, need: i % 2 === 0 ? 'explanation' : 'checklist', intent: 'informational' }))
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ needs }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 300, totalTokenCount: 1100 } }))
          return
        }
        // Extract the BRIEFS payload embedded in the prompt text.
        const m = prompt.match(/BRIEFS:\\n(\[.*?\])\\n\\nOUTPUT/) ?? prompt.match(/BRIEFS:\s*\n(\[[\s\S]*?\])\s*\n\s*\nOUTPUT/)
        let briefs: { id: string; subject: string; aligned_query?: string }[] = []
        if (m) { try { briefs = JSON.parse(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')) } catch { briefs = [] } }
        calls.push({ model, briefCount: briefs.length, thinkingBudget })
        const textOut = cfg.respondRaw ? cfg.respondRaw(briefs) : JSON.stringify({ topics: cfg.respond(briefs) })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [{ text: textOut }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 400, totalTokenCount: 1400 },
        }))
        return
      }
      res.writeHead(404); res.end('{}')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, calls })))
}

// ── Contract-faithful in-memory Supabase admin ───────────────────────────────
function fakeAdmin(tables: Record<string, Record<string, unknown>[]>) {
  const from = (table: string) => {
    const st: { filters: Record<string, unknown>; single: boolean } = { filters: {}, single: false }
    const exec = () => {
      const rows = (tables[table] ?? []).filter((r) => Object.entries(st.filters).every(([k, v]) => r[k] === v))
      return { data: st.single ? (rows[0] ?? null) : rows, error: null }
    }
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select() { return b },
      eq(col: string, val: unknown) { st.filters[col] = val; return b },
      order() { return b }, limit() { return b },
      maybeSingle() { st.single = true; return b },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(res, rej) },
    })
    return b
  }
  return { from } as never
}

// Deterministic but structurally varied title frames (mirror the synthesis
// contract: ≤1 mega-guide opening; subject-led/suffix frames keep alignment).
const TITLE_FRAMES: ((s: string) => string)[] = [
  (s) => `המדריך המלא: ${s}`,
  (s) => `${s}: שאלות ותשובות`,
  (s) => `${s} — טעויות נפוצות שכדאי להכיר`,
  (s) => `${s}: מיתוסים ועובדות`,
  (s) => `${s} — המלצות מעשיות`,
  (s) => `${s}: צעד אחר צעד`,
]
const framedTitle = (i: number, subject: string) => TITLE_FRAMES[i % TITLE_FRAMES.length](subject)

// Natural-Shop-like fixture (health/ecommerce, Hebrew, evidence-rich).
function naturalShopTables(): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: 'p1', business_name: 'הצמחייה', target_domain: 'https://natural-shop.co.il', language: 'he', country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'תוספי תזונה טבעיים' }],
    keyword_research_cache: [{
      project_id: 'p1', created_at: '2026-07-01', results_json: [
        { keyword: 'מגנזיום לילדים מינון', avgMonthlySearches: 320 },
        { keyword: 'איך לבחור אבקת חלבון', avgMonthlySearches: 210 },
        { keyword: 'אנזימי עיכול טבעיים', avgMonthlySearches: 140 },
        { keyword: 'יתרונות אומגה 3', avgMonthlySearches: 90 },
        { keyword: 'ויטמין C לילדים', avgMonthlySearches: 500 },
        { keyword: 'מגנזיום', avgMonthlySearches: 2000 }, // 1 distinctive token → too generic
        { keyword: 'מינון מגנזיום לילדים', avgMonthlySearches: 260 }, // semantic dup of the 1st + of pending
        { keyword: 'חיזוק מערכת החיסון בחורף', avgMonthlySearches: 170 },
      ],
    }],
    shopify_entities: [
      { project_id: 'p1', is_active: true, title: 'מגנזיום ביסגליצינט 120 כמוסות', handle: 'mag', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/mag' },
      { project_id: 'p1', is_active: true, title: 'אנזימי עיכול פורטה', handle: 'enz', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/enz' },
      { project_id: 'p1', is_active: true, title: 'ויטמין C 500 טבעי', handle: 'vitc', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/vitc' },
      { project_id: 'p1', is_active: true, title: 'אבקת חלבון צמחית', handle: 'prot', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/prot' },
      { project_id: 'p1', is_active: true, title: 'אומגה 3 טבעי', handle: 'omega', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/omega' },
      { project_id: 'p1', is_active: true, title: 'שמן קוקוס טבעי', handle: 'coco', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/coco' },
      { project_id: 'p1', is_active: true, title: 'מדיניות פרטיות', handle: 'privacy', entity_type: 'page', canonical_url: 'https://natural-shop.co.il/pages/privacy-policy' },
      { project_id: 'p1', is_active: true, title: 'דלקת בדרכי השתן - טיפול טבעי', handle: 'uti', entity_type: 'blog', canonical_url: 'https://natural-shop.co.il/b/uti' },
      { project_id: 'p1', is_active: true, title: 'דלקת חניכיים - מה עוזר', handle: 'gums', entity_type: 'blog', canonical_url: 'https://natural-shop.co.il/b/gums' },
      { project_id: 'p1', is_active: true, title: 'דלקת גרון - תרופות סבתא', handle: 'throat', entity_type: 'blog', canonical_url: 'https://natural-shop.co.il/b/throat' },
      { project_id: 'p1', is_active: true, title: 'הדברה ירוקה לבית', handle: 'pest', entity_type: 'blog', canonical_url: 'https://natural-shop.co.il/b/pest' },
      { project_id: 'p1', is_active: true, title: 'תה ירוק אורגני', handle: 'tea', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/tea' },
    ],
    generated_articles: [{ project_id: 'p1', title: 'מגנזיום לשינה - המדריך המלא' }],
    article_topics: [],
    content_topic_ideas: [
      { project_id: 'p1', status: 'pending', title: 'מינון מגנזיום לילדים', primary_keyword: 'מינון מגנזיום לילדים', fingerprint: 'מינון מגנזיום לילדים', search_intent: 'informational' },
    ],
    wordpress_content_index: [],
  }
}

async function main() {
  console.log('U) unit: PROVEN high-confidence semantic duplicates (D2 calibration)')
  {
    const dup = (a: string, b: string) => isSemanticTopicDuplicate({ primaryKeyword: a, intent: 'informational' }, { primaryKeyword: b, intent: 'informational' })
    check('U1. מגנזיום לילדים ≡ מינון מגנזיום לילדים (prepended facet)', dup('מגנזיום לילדים', 'מינון מגנזיום לילדים'))
    check('U2. אנזימי עיכול ≡ אנזימי עיכול טבעיים', dup('אנזימי עיכול', 'אנזימי עיכול טבעיים'))
    check('U3. ויטמינים לילדים ≡ ויטמין לילדים (plural/final folding)', dup('ויטמינים לילדים', 'ויטמין לילדים'))
    check('U4. broad פרחים ≠ distinct long-tail (C-protection)', !dup('פרחים', 'משלוח פרחים לחתונה בירושלים'))
    check('U5. מגנזיום לילדים ≠ מגנזיום ביסגליצינט לעומת ציטראט', !dup('מגנזיום לילדים', 'מגנזיום ביסגליצינט לעומת ציטראט'))
    check('U6. מגנזיום לילדים ≠ מגנזיום לשינה (different facet)', !dup('מגנזיום לילדים', 'מגנזיום לשינה'))
  }

  console.log('U) unit: D3/D5/D6 validation-layer fixes')
  {
    // D3 — repair NEVER slices mid-clause: an 8-word title main clause either
    // survives whole (≤10 tokens) or the repair fails; a 6-word cut is impossible.
    const r = validatePrimaryKeywordQuality('של', 'איך לבנות דף נחיתה לעסק שמייצר לידים באינטרנט', new Set())
    check('D3. repaired keyword is the FULL clause, never a 6-word cut', r.ok && r.repairedKeyword === 'איך לבנות דף נחיתה לעסק שמייצר לידים באינטרנט', JSON.stringify(r))
    // D5 — subject-head rule: shoes-keyword under a suit-title is repaired/rejected.
    const c = validateIntentKeywordConsistency({ primaryKeyword: 'נעלים לחתן', title: 'איך לבחור חליפת חתן לחתונה', intent: 'informational' }, new Set())
    check('D5. groom-suit title + נעלים לחתן keyword no longer passes untouched', !c.ok || !!c.repairedKeyword, JSON.stringify(c))
    const cOk = validateIntentKeywordConsistency({ primaryKeyword: 'חליפת חתן לחתונה', title: 'איך לבחור חליפת חתן לחתונה', intent: 'informational' }, new Set())
    check('D5. an aligned keyword still passes untouched', cOk.ok && !cOk.repairedKeyword)
    // D6 — numeric-hyperbole demand claims are scrubbed.
    const s = sanitizeDemandLanguage('מותג דיור של אלפי חיפושים', { demandEvidenceAvailable: false, demandQuery: null, avgMonthlySearches: null, demandConfidence: 'none', demandMatchType: 'none' }, 'he')
    check('D6. "אלפי חיפושים" is stripped', !s.includes('אלפי חיפושים'), s)
    check('D6. the stripped remainder reads as malformed → neutral fallback path', isMalformedReason(s))
    check('D6. English numeric hyperbole stripped too', !sanitizeDemandLanguage('a brand with thousands of searches', { demandEvidenceAvailable: false, demandQuery: null, avgMonthlySearches: null, demandConfidence: 'none', demandMatchType: 'none' }, 'en').includes('thousands of searches'))
  }

  console.log('U) unit: D5 salvage title-affinity')
  {
    const checks = { isOwnedKeyword: () => false, isSemanticKeywordDup: () => false, isCoveredByContent: () => false }
    const off = salvageLongTailKeyword({ title: 'איך לבחור חליפת חתן לחתונה', primaryKeyword: 'חליפת חתן', secondaryKeywords: ['נעלים לחתן אלגנטיות'] }, checks)
    check('salvage never promotes an off-title secondary (נעלים on a suit title)', !(off.ok && off.keyword === 'נעלים לחתן אלגנטיות'), JSON.stringify(off))
    const on = salvageLongTailKeyword({ title: 'איך לבחור חליפת חתן לחתונה', primaryKeyword: 'חליפת חתן', secondaryKeywords: ['חליפת חתן קלאסית לחתונה'] }, checks)
    check('salvage still accepts an on-title secondary', on.ok && on.keyword === 'חליפת חתן קלאסית לחתונה')
  }

  console.log('U) unit: D8 link gates (boilerplate / colour / class-word)')
  {
    check('privacy-policy page detected as boilerplate (title he)', isBoilerplatePage('מדיניות פרטיות', '/x'))
    check('checkout URL detected as boilerplate', isBoilerplatePage('עמוד', 'https://s.com/checkout?step=1'))
    check('a product page is NOT boilerplate', !isBoilerplatePage('זר ורדים אדומים', '/p/roses'))
    // Colour-only commercial match (roses → pink orchid) on a REALISTIC corpus (>=8).
    const flowerCands: LinkCandidateEntity[] = [
      { url: '/p/orchid-pink', title: 'סחלב ורוד מרהיב', type: 'product' },
      { url: '/p/anthurium', title: 'אנתוריום ורוד', type: 'product' },
      { url: '/p/roses-red', title: 'זר ורדים אדומים', type: 'product' },
      { url: '/p/roses-pink', title: 'זר ורדים ורודים', type: 'product' },
      { url: '/p/balloon', title: 'בלון ורוד ליום הולדת', type: 'product' },
      { url: '/p/lily-white', title: 'זר שושנים לבן', type: 'product' },
      { url: '/p/tulip', title: 'טוליפים צבעוניים', type: 'product' },
      { url: '/p/sunflower', title: 'חמניות שמחות', type: 'product' },
      { url: '/b/rose-care', title: 'טיפוח ורדים בבית', type: 'post' },
    ]
    const roses = mapLinkRoles('טיפוח ורדים ורודים', 'איך לשמור על ורדים ורודים לאורך זמן', flowerCands)
    const urls = roses.assignments.map((a) => a.url)
    check('D8. pink orchid/anthurium/balloon are NOT linked from a roses article', !urls.includes('/p/orchid-pink') && !urls.includes('/p/anthurium') && !urls.includes('/p/balloon'), JSON.stringify(urls))
    check('D8. actual rose products/guides remain linkable', urls.includes('/p/roses-pink') || urls.includes('/p/roses-red') || urls.includes('/b/rose-care'), JSON.stringify(urls))
    // Class-word supporting link (thyroid → UTI/gingivitis via shared דלקת).
    const healthCands: LinkCandidateEntity[] = [
      { url: '/b/uti', title: 'דלקת בדרכי השתן - טיפול טבעי', type: 'post' },
      { url: '/b/gums', title: 'דלקת חניכיים - מה עוזר', type: 'post' },
      { url: '/b/throat', title: 'דלקת גרון - תרופות סבתא', type: 'post' },
      { url: '/b/ear', title: 'דלקת אוזניים אצל ילדים', type: 'post' },
      { url: '/p/thyroid-supp', title: 'תוסף לבלוטת התריס', type: 'product' },
      { url: '/p/mag', title: 'מגנזיום ביסגליצינט', type: 'product' },
      { url: '/p/omega', title: 'אומגה 3 טבעי', type: 'product' },
      { url: '/p/vitd', title: 'ויטמין D3 טבעי', type: 'product' },
    ]
    const thyroid = mapLinkRoles('דלקת בלוטת התריס תסמינים', 'דלקת בלוטת התריס: תסמינים וטיפול', healthCands)
    const tUrls = thyroid.assignments.map((a) => a.url)
    check('D8. thyroid article does NOT link UTI/gingivitis/throat/ear via shared דלקת', !tUrls.includes('/b/uti') && !tUrls.includes('/b/gums') && !tUrls.includes('/b/throat') && !tUrls.includes('/b/ear'), JSON.stringify(tUrls))
    check('D8. the thyroid SUPPLEMENT product IS a valid commercial target', tUrls.includes('/p/thyroid-supp'), JSON.stringify(tUrls))
  }

  console.log('U) unit: D10 premium model choice (pure)')
  {
    check('picks the configured pro when offered', pickPremiumModel(['gemini-2.5-flash', 'gemini-2.5-pro'], 'gemini-2.5-pro') === 'gemini-2.5-pro')
    check('prefers stable pro over preview pro', pickPremiumModel(['gemini-2.5-pro-preview', 'gemini-3-pro'], 'gemini-2.5-pro') === 'gemini-3-pro')
    check('returns undefined when NO pro-class model exists (→ explicit downgrade)', pickPremiumModel(['gemini-2.5-flash', 'gemini-2.5-flash-lite'], 'gemini-2.5-pro') === undefined)
  }

  // ── E2E: the REAL engine over the REAL SDK against the fixture server ──────
  console.log('E2E) generateFromBriefs — full pipeline, exact reconciliation')
  {
    const { server, port, calls } = await startFakeGenai({
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      respond: (briefs) => {
        const topics: unknown[] = []
        briefs.forEach((b, i) => {
          if (i === briefs.length - 1) return // MISSING: omit the last brief entirely
          if (i === 2) { topics.push({ briefId: b.id, skip: true, why: 'not distinct enough' }); return }
          if (i === 1) {
            // DEFECT INJECTION (D3/D5): off-subject truncated keyword → the engine
            // must repair from the brief's own aligned query/subject, never accept.
            topics.push({ briefId: b.id, title: `${b.subject} — סקירה מעשית`, primaryKeyword: 'איך לבנות דף נחיתה לעסק שמייצר', secondaryKeywords: [], intent: 'informational' })
            return
          }
          topics.push({ briefId: b.id, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' })
        })
        topics.push({ briefId: 'brief_unknown9', title: 'זר', primaryKeyword: 'זר', intent: 'informational' }) // DROPPED: unknown id
        return topics
      },
    })
    process.env.GEMINI_API_KEY = 'test-key'
    process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
    resetModelResolutionCache()
    resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')

    const admin = fakeAdmin(naturalShopTables())
    const run = await generateFromBriefs(admin, { projectId: 'p1', targetCount: 8, qualityMode: 'standard' }, newRunCostController('standard', 'run1', 8))
    const d = run.diagnostics

    check('E1. the run used a Flash-class model on standard (modelPath truthful)', d.modelPath.tierUsed === 'flash' && d.modelPath.downgraded === false, JSON.stringify(d.modelPath))
    check('E2. brief pool was built pre-AI with typed rejections', d.brief_pool.pool_size > 0 && Object.keys(d.brief_pool.rejected_by_reason).length > 0, JSON.stringify(d.brief_pool))
    check('E3. the too-generic bare keyword (מגנזיום) never became a brief', (d.brief_pool.rejected_by_reason['subject_too_generic'] ?? 0) >= 1, JSON.stringify(d.brief_pool.rejected_by_reason))
    check('E4. the pending semantic duplicate was blocked PRE-AI', (d.brief_pool.rejected_by_reason['pending_semantic_duplicate'] ?? 0) + (d.brief_pool.rejected_by_reason['pending_exact_duplicate'] ?? 0) >= 1, JSON.stringify(d.brief_pool.rejected_by_reason))
    for (const rd of d.rounds) {
      check(`E5. round ${rd.round} reconciles EXACTLY: sent = polished+skipped+missing`, rd.briefs_sent === rd.polished + rd.skipped_by_model + rd.missing_from_response, JSON.stringify(rd))
      check(`E6. round ${rd.round}: polished = accepted + rejected (no silent loss)`, rd.polished === rd.accepted + Object.values(rd.rejected_by_reason).reduce((a, b) => a + b, 0), JSON.stringify(rd))
    }
    check('E7. missing + dropped items are COUNTED, not silent', d.rounds.some((r) => r.missing_from_response >= 1) && d.rounds.some((r) => r.dropped_items >= 1), JSON.stringify(d.rounds))
    check('E8. suggestions were accepted (evidence-rich project yields topics)', run.suggestions.length >= 4, `got ${run.suggestions.length}`)
    check('E9. ≤2 model calls total (no 3-tier×15 generate-and-discard)', d.model_calls <= 2 && calls.length <= 2, `calls=${calls.length}`)
    const kws = run.suggestions.map((s) => s.primaryKeyword)
    check('E10. the injected truncated/off-subject keyword NEVER survives', !kws.some((k) => k.includes('דף נחיתה לעסק שמייצר')), JSON.stringify(kws))
    check('E11. defect topic was REPAIRED from its brief (repaired counter > 0) or rejected', d.rounds.some((r) => r.repaired >= 1) || Object.values(d.rejected_by_reason).length > 0, JSON.stringify(d.rounds))
    const reasons = run.suggestions.map((s) => s.suggestionReason)
    check('E12. NO malformed reason reaches the customer', reasons.every((r) => !isMalformedReason(r)), JSON.stringify(reasons.slice(0, 2)))
    check('E13. NO invented demand language (אלפי/מאות חיפושים) in any reason', reasons.every((r) => !/(אלפי|מאות|עשרות)\s+חיפושים/.test(r)))
    // D7 — demand may be claimed ONLY from a topic's own aligned query.
    for (const s of run.suggestions) {
      const claimsVolume = /חיפושים חודשיים/.test(s.suggestionReason)
      if (claimsVolume) {
        check(`E14. "${s.primaryKeyword}" claims ONLY its own aligned query's volume`, !!s.demandEvidence?.demandEvidenceAvailable && s.suggestionReason.includes(`"${s.demandEvidence?.demandQuery}"`), s.suggestionReason)
      }
    }
    check('E15. the broad 2000-volume query (מגנזיום) volume is claimed by NO topic', reasons.every((r) => !r.includes('2000')), JSON.stringify(reasons.filter((r) => r.includes('2000'))))
    // D2 — no two accepted topics are high-confidence duplicates.
    let dups = 0
    for (let i = 0; i < run.suggestions.length; i++) for (let j = i + 1; j < run.suggestions.length; j++) {
      if (isSemanticTopicDuplicate({ primaryKeyword: run.suggestions[i].primaryKeyword, intent: run.suggestions[i].searchIntent }, { primaryKeyword: run.suggestions[j].primaryKeyword, intent: run.suggestions[j].searchIntent })) dups++
    }
    check('E16. NO high-confidence duplicate pair among accepted topics', dups === 0, `${dups} dup pairs`)
    // D8 — no boilerplate/off-subject links on any accepted topic.
    const allLinks = run.suggestions.flatMap((s) => (s.suggestedInternalLinks ?? []).map((l) => l.url))
    check('E17. NO privacy-policy / pest-control link on any topic', !allLinks.some((u) => u.includes('privacy') || u.includes('/b/pest')), JSON.stringify(allLinks))
    check('E18. topics are accepted even with ZERO links (links never gate acceptance)', run.suggestions.every((s) => Array.isArray(s.suggestedInternalLinks)))
    check('E19. reasons carry NO internal vocabulary (אשכול/cluster/brief/tier)', reasons.every((r) => !/אשכול|cluster|brief|tier/i.test(r)))
    const { evaluateTitleDiversity } = await import('../recommendations/title-diversity')
    const div = evaluateTitleDiversity(run.suggestions.map((s) => s.title))
    check('E21. accepted titles satisfy title-pattern diversity (≤1 mega-guide, ≤2 per skeleton)', div.pass, JSON.stringify(div))
    check('E20. evidence inventory records the ordered KR read + zero load errors', d.evidence_inventory.keyword_research_queries >= 8 && d.evidence_inventory.evidence_load_errors.length === 0, JSON.stringify(d.evidence_inventory.evidence_load_errors))
    // Round-3 quality gates on the REAL pipeline output.
    const bc = d.brief_consumption
    check('E24. brief consumption reconciles: consumed + remaining = effective pool', bc.consumedBriefs + bc.remainingBriefs === bc.effectivePoolSize, JSON.stringify(bc))
    check('E25. stop_reason is a truthful member (never a false pool_exhausted)', ['target_reached', 'true_pool_exhausted', 'call_cap_reached', 'zero_marginal_yield', 'insufficient_inventory'].includes(d.stop_reason), d.stop_reason)
    const { isSearchPhraseQuality: isSP } = await import('../recommendations/opportunity-validation').then(() => import('../recommendations/search-phrase'))
    check('E26. EVERY accepted primary keyword is a clean search phrase (no headline)', run.suggestions.every((x) => isSP(x.primaryKeyword)), JSON.stringify(run.suggestions.map((x) => x.primaryKeyword).filter((k) => !isSP(k))))
    const { evaluateLink: evL, isRelevantLink: isRL } = await import('../recommendations/link-relevance')
    const badLinks = run.suggestions.flatMap((x) => (x.linkPlan ? [
      ...(x.linkPlan.primaryCommercialTarget ? [{ t: x.linkPlan.primaryCommercialTarget, role: 'primary_commercial_target' }] : []),
      ...x.linkPlan.secondaryCommercialTargets.map((t) => ({ t, role: 'secondary_commercial_target' })),
      ...x.linkPlan.supportingInformationalLinks.map((t) => ({ t, role: 'supporting_informational_link' })),
    ] : []).filter(({ t, role }) => !isRL(evL({ primaryKeyword: x.primaryKeyword, title: x.title }, { url: t.url, title: t.title, role }), role)))
    check('E27. NO accepted link fails the strict subject-head relevance contract', badLinks.length === 0, JSON.stringify(badLinks.map((b) => b.t.title)))
    check('E28. cost telemetry present, thinking billed, ≤2 paid calls', d.cost.totalPaidCalls <= 2 && d.cost.calls.every((c) => c.totalBillableOutputTokens === c.answerOutputTokens + c.thinkingTokens) && d.cost.estimatedRunCostUsd <= d.cost.configuredCostCeilingUsd, JSON.stringify({ calls: d.cost.totalPaidCalls, usd: d.cost.estimatedRunCostUsd, ceiling: d.cost.configuredCostCeilingUsd }))
    const { evaluateRunAcceptance: evalAcc } = await import('../recommendations/qa-acceptance')
    const accClean = evalAcc({ tierRequested: 'standard', diagnostics: d, suggestions: run.suggestions, pendingBefore: 0 })
    // This fixture deliberately omits one brief (RC1 reconciliation test), so the
    // synthesis contract rule legitimately fails; assert the ROUND-3 QUALITY rules
    // (links / keyword / cannibalization / demand / leakage / cost) all pass.
    const qualityRuleIds = ['links_subject_relevant', 'primary_keyword_search_phrase_quality', 'no_existing_need_cannibalization', 'demand_matches_subject', 'no_duplicate_pair', 'title_keyword_alignment', 'accepted_output_has_no_external_business', 'run_cost_within_budget', 'cost_telemetry_reconciles', 'no_more_than_two_paid_calls', 'stop_reason_reconciles']
    const failedQuality = accClean.rules.filter((x) => qualityRuleIds.includes(x.id) && !x.pass)
    check('E29. the REAL run passes EVERY round-3 quality gate (no false quality pass)', failedQuality.length === 0, JSON.stringify(failedQuality.map((x) => x.id + ':' + x.detail)))
    check('E22. FLASH standard calls sent thinkingBudget 0 (low-cost behavior preserved)', calls.every((c) => c.thinkingBudget === 0), JSON.stringify(calls.map((c) => c.thinkingBudget)))
    check('E23. pool accounting reconciles: totalRaw = pool + Σrejected (with examples)', d.brief_pool.total_raw_candidates === d.brief_pool.pool_size + Object.values(d.brief_pool.rejected_by_reason).reduce((a: number, b) => a + (b as number), 0) && d.brief_pool.rejected_examples.length > 0, JSON.stringify(d.brief_pool))
    server.close()
  }

  // ── E2E: Issue-5 guide-tail keyword normalized END-TO-END (not over-broad) ──
  console.log('E2E) Issue5 — headline guide-tail keyword → focused query through the REAL pipeline')
  {
    const HEADLINE = 'ויטמין D המדריך להשוואת סוגים ומינונים'
    const isVitD = (subject: string) => /השוואת/.test(subject) && /ויטמין/.test(subject)
    const tables = naturalShopTables()
    // Seed a real brief whose subject IS the vitamin-D comparison need.
    ;(tables.keyword_research_cache[0].results_json as Record<string, unknown>[]).push({ keyword: 'השוואת סוגי ויטמין D', avgMonthlySearches: 210 })
    const { server, port } = await startFakeGenai({
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      // The model returns the HEADLINE-shaped keyword for that brief (the live defect).
      respond: (briefs) => briefs.map((b, i) => isVitD(b.subject)
        ? { briefId: b.id, title: HEADLINE, primaryKeyword: HEADLINE, secondaryKeywords: [], intent: 'informational' }
        : { briefId: b.id, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }),
    })
    process.env.GEMINI_API_KEY = 'test-key'
    process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
    resetModelResolutionCache()
    resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const run = await generateFromBriefs(fakeAdmin(tables), { projectId: 'p1', targetCount: 8, qualityMode: 'premium' }, newRunCostController('premium', 'run-issue5', 8))
    const kws = run.suggestions.map((s) => s.primaryKeyword)
    const { isSearchPhraseQuality: isSP } = await import('../recommendations/search-phrase')
    check('I5-1. the raw headline keyword NEVER survives acceptance', !kws.includes(HEADLINE), JSON.stringify(kws))
    check('I5-2. the over-broad residue "ויטמין D" is NOT an accepted keyword', !kws.includes('ויטמין D'), JSON.stringify(kws))
    const vitD = run.suggestions.find((s) => /ויטמין/.test(s.primaryKeyword) && /D/.test(s.primaryKeyword))
    check('I5-3. a focused ויטמין-D query was accepted (clean phrase, comparison/type intent preserved)',
      !!vitD && isSP(vitD.primaryKeyword) && vitD.primaryKeyword !== 'ויטמין D' && /השוואת|סוג/.test(vitD.primaryKeyword), JSON.stringify(vitD?.primaryKeyword))
    check('I5-4. EVERY accepted keyword is still a clean search phrase (no headline leaked)', run.suggestions.every((s) => isSP(s.primaryKeyword)), JSON.stringify(kws.filter((k) => !isSP(k))))
    server.close()
  }

  // ── E2E: Natural-Shop defect 1 — keyword must not collapse to a year residue ──
  console.log('E2E) NS-1 — a "המדריך לשנת 2026" keyword is repaired to the real subject')
  {
    const isVitD = (subject: string) => /ויטמין/.test(subject)
    const tables = naturalShopTables()
    const { server, port } = await startFakeGenai({
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      // The model returns a headline TITLE plus a subject-losing keyword for the ויטמין brief.
      respond: (briefs) => briefs.map((b, i) => isVitD(b.subject)
        ? { briefId: b.id, title: 'איך לבחור ויטמין D מומלץ? המדריך לשנת 2026', primaryKeyword: 'המדריך לשנת 2026', secondaryKeywords: [], intent: 'informational' }
        : { briefId: b.id, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }),
    })
    process.env.GEMINI_API_KEY = 'test-key'
    process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
    resetModelResolutionCache()
    resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const run = await generateFromBriefs(fakeAdmin(tables), { projectId: 'p1', targetCount: 8, qualityMode: 'premium' }, newRunCostController('premium', 'run-ns1', 8))
    const kws = run.suggestions.map((s) => s.primaryKeyword)
    const { keywordHasRealSubject: hasSubj } = await import('../recommendations/search-phrase')
    check('NS1-E2E. the year residue "שנת 2026" is NEVER an accepted keyword', !kws.includes('שנת 2026'), JSON.stringify(kws))
    check('NS1-E2E. EVERY accepted keyword carries a real subject token (no year/temporal-only)', run.suggestions.every((s) => hasSubj(s.primaryKeyword)), JSON.stringify(kws))
    const vit = run.suggestions.find((s) => /ויטמין/.test(s.primaryKeyword))
    check('NS1-E2E. the ויטמין topic kept its real subject (repaired from aligned/brief)', !vit || /ויטמין/.test(vit.primaryKeyword))
    server.close()
  }

  // ── E2E: Natural-Shop defect 2 — pending/link pages ARE in the coverage corpus ──
  console.log('E2E) NS-2 — synonym pending idea + near-identical support page own the need')
  {
    const tables = naturalShopTables()
    // 2a: a PENDING idea that is a SYNONYM (מזון≈תזונה) of a proposed topic.
    ;(tables.content_topic_ideas as Record<string, unknown>[]).push({ project_id: 'p1', status: 'pending', title: 'תוספי תזונה מומלצים', primary_keyword: 'תוספי תזונה מומלצים', fingerprint: 'תוספי תזונה מומלצים', search_intent: 'informational' })
    // 2b: an existing informational blog page that is ALSO a link candidate.
    ;(tables.shopify_entities as Record<string, unknown>[]).push({ project_id: 'p1', is_active: true, title: 'לחזור לטבע: היתרונות הברורים של טיפולים ומוצרים טבעיים לגוף ולנפש', handle: 'back-to-nature', entity_type: 'blog', canonical_url: 'https://natural-shop.co.il/b/back-to-nature' })
    ;(tables.keyword_research_cache[0].results_json as Record<string, unknown>[]).push({ keyword: 'תוספי מזון מומלצים', avgMonthlySearches: 240 }, { keyword: 'מוצרים וטיפולים טבעיים', avgMonthlySearches: 180 })
    const is2a = (s: string) => /תוספי מזון/.test(s)
    const is2b = (s: string) => /מוצרים וטיפולים טבעיים/.test(s) && !/תוספי/.test(s)
    const { server, port } = await startFakeGenai({
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      respond: (briefs) => briefs.map((b, i) => is2a(b.subject)
        ? { briefId: b.id, title: 'תוספי מזון מומלצים', primaryKeyword: 'תוספי מזון מומלצים', secondaryKeywords: [], intent: 'informational' }
        : is2b(b.subject)
          ? { briefId: b.id, title: 'לחזור לטבע: איך לשלב מוצרים וטיפולים טבעיים בשגרת היום יום', primaryKeyword: 'מוצרים וטיפולים טבעיים', secondaryKeywords: [], intent: 'informational' }
          : { briefId: b.id, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }),
    })
    process.env.GEMINI_API_KEY = 'test-key'
    process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
    resetModelResolutionCache()
    resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const run = await generateFromBriefs(fakeAdmin(tables), { projectId: 'p1', targetCount: 8, qualityMode: 'premium' }, newRunCostController('premium', 'run-ns2', 8))
    const bykw = (re: RegExp) => run.suggestions.find((s) => re.test(s.primaryKeyword))
    // 2a — "תוספי מזון" must NOT be a NEW article (converted to improvement or rejected).
    const s2a = bykw(/תוספי מזון/)
    check('NS2a-E2E. synonym pending idea (תזונה) blocks/ converts "תוספי מזון" — never a new article', !s2a || s2a.recommendedPageType === 'existing_page_improvement', JSON.stringify(s2a?.recommendedPageType))
    // 2b — the near-identical existing page owns the need → improvement, not a support link.
    const s2b = bykw(/מוצרים וטיפולים טבעיים/)
    check('NS2b-E2E. near-identical support page owns the need → existing_page_improvement (or rejected)', !s2b || s2b.recommendedPageType === 'existing_page_improvement', JSON.stringify(s2b?.recommendedPageType))
    check('NS2b-E2E. the owning "לחזור לטבע" page is NOT a plain supporting link on that topic', !s2b || !(s2b.suggestedInternalLinks ?? []).some((l) => /back-to-nature/.test(l.url)), JSON.stringify(s2b?.suggestedInternalLinks))
    server.close()
  }

  // ── E2E: NS-3/4 — guard-owner synonym + page-role/intent compatibility ────────
  console.log('E2E) NS-3 — a keyword-guard exact owner also blocks its SYNONYM topic')
  {
    const tables = naturalShopTables()
    // The exact owner lives ONLY on the keyword-guard path (a TRACKED keyword), not
    // as a pending idea — the exact live owner-data path.
    ;(tables.tracking_targets as Record<string, unknown>[]).push({ project_id: 'p1', keyword: 'תוספי תזונה מומלצים' })
    ;(tables.keyword_research_cache[0].results_json as Record<string, unknown>[]).push({ keyword: 'תוספי מזון מומלצים', avgMonthlySearches: 240 })
    const { server, port } = await startFakeGenai({
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      respond: (briefs) => briefs.map((b, i) => /תוספי מזון/.test(b.subject)
        ? { briefId: b.id, title: 'תוספי מזון מומלצים', primaryKeyword: 'תוספי מזון מומלצים', secondaryKeywords: [], intent: 'informational' }
        : { briefId: b.id, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }),
    })
    process.env.GEMINI_API_KEY = 'test-key'; process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`; resetModelResolutionCache(); resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const run = await generateFromBriefs(fakeAdmin(tables), { projectId: 'p1', targetCount: 8, qualityMode: 'premium' }, newRunCostController('premium', 'run-ns3', 8))
    const s = run.suggestions.find((x) => /תוספי מזון/.test(x.primaryKeyword))
    check('NS3-E2E. synonym of a keyword-guard owner (תזונה) is NEVER a new article', !s || s.recommendedPageType === 'existing_page_improvement', JSON.stringify(s?.recommendedPageType))
    server.close()
  }

  console.log('E2E) NS-4 — a COMMERCIAL topic is not an improvement of an INFORMATIONAL article')
  {
    const tables = naturalShopTables()
    ;(tables.generated_articles as Record<string, unknown>[]).push({ project_id: 'p1', title: 'תוספים למניעת נשירת שיער' })
    ;(tables.keyword_research_cache[0].results_json as Record<string, unknown>[]).push({ keyword: 'קניית תוספים לנשירת שיער', avgMonthlySearches: 260 })
    const { server, port } = await startFakeGenai({
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      respond: (briefs) => briefs.map((b, i) => /קניית תוספים לנשירת/.test(b.subject)
        ? { briefId: b.id, title: 'קניית תוספים לנשירת שיער', primaryKeyword: 'קניית תוספים לנשירת שיער', secondaryKeywords: [], intent: 'commercial' }
        : { briefId: b.id, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }),
    })
    process.env.GEMINI_API_KEY = 'test-key'; process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`; resetModelResolutionCache(); resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const run = await generateFromBriefs(fakeAdmin(tables), { projectId: 'p1', targetCount: 8, qualityMode: 'premium' }, newRunCostController('premium', 'run-ns4', 8))
    const s = run.suggestions.find((x) => /קניית תוספים לנשירת/.test(x.primaryKeyword))
    check('NS4-E2E (path A: initial cannibalization). commercial topic is NOT improvement of an informational article', !s || s.recommendedPageType !== 'existing_page_improvement', JSON.stringify(s?.recommendedPageType))
    server.close()
  }

  console.log('E2E) NS-5 — commercial-vs-informational blocked through LOCAL ownership (path B)')
  {
    const tables = naturalShopTables()
    // An INFORMATIONAL blog at the same place; a COMMERCIAL buy+location topic.
    ;(tables.shopify_entities as Record<string, unknown>[]).push({ project_id: 'p1', is_active: true, title: 'מדריך זרי פרחים בבית שמש', handle: 'guide-bs', entity_type: 'blog', canonical_url: 'https://natural-shop.co.il/b/guide-bs' })
    ;(tables.keyword_research_cache[0].results_json as Record<string, unknown>[]).push({ keyword: 'קניית זרי פרחים בבית שמש', avgMonthlySearches: 150 })
    const { server, port } = await startFakeGenai({
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      respond: (briefs) => briefs.map((b, i) => /קניית זרי פרחים בבית שמש/.test(b.subject)
        ? { briefId: b.id, title: 'קניית זרי פרחים בבית שמש', primaryKeyword: 'קניית זרי פרחים בבית שמש', secondaryKeywords: [], intent: 'transactional' }
        : { briefId: b.id, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }),
    })
    process.env.GEMINI_API_KEY = 'test-key'; process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`; resetModelResolutionCache(); resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const run = await generateFromBriefs(fakeAdmin(tables), { projectId: 'p1', targetCount: 8, qualityMode: 'premium' }, newRunCostController('premium', 'run-ns5', 8))
    const s = run.suggestions.find((x) => /קניית זרי פרחים בבית שמש/.test(x.primaryKeyword))
    check('NS5-E2E (path B: local ownership). commercial+local topic is NOT improvement of an informational blog', !s || s.recommendedPageType !== 'existing_page_improvement', JSON.stringify({ t: s?.recommendedPageType, cov: s?.coverageMatches?.map((m) => m.basisPageType) }))
    server.close()
  }

  console.log('E2E) NS-6 — commercial-vs-informational blocked through late SUPPORT-LINK conversion (path C)')
  {
    const tables = naturalShopTables()
    // An informational blog that OWNS a commercial topic's need + is a link candidate.
    ;(tables.shopify_entities as Record<string, unknown>[]).push({ project_id: 'p1', is_active: true, title: 'כל מה שצריך לדעת על נשירת שיער', handle: 'hair-guide', entity_type: 'blog', canonical_url: 'https://natural-shop.co.il/b/hair-guide' })
    ;(tables.keyword_research_cache[0].results_json as Record<string, unknown>[]).push({ keyword: 'קניית תוספים לנשירת שיער', avgMonthlySearches: 220 })
    const { server, port } = await startFakeGenai({
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      respond: (briefs) => briefs.map((b, i) => /קניית תוספים לנשירת שיער/.test(b.subject)
        ? { briefId: b.id, title: 'קניית תוספים לנשירת שיער', primaryKeyword: 'קניית תוספים לנשירת שיער', secondaryKeywords: [], intent: 'commercial' }
        : { briefId: b.id, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }),
    })
    process.env.GEMINI_API_KEY = 'test-key'; process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`; resetModelResolutionCache(); resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const run = await generateFromBriefs(fakeAdmin(tables), { projectId: 'p1', targetCount: 8, qualityMode: 'premium' }, newRunCostController('premium', 'run-ns6', 8))
    const s = run.suggestions.find((x) => /קניית תוספים לנשירת שיער/.test(x.primaryKeyword))
    check('NS6-E2E (path C: support-link conversion). commercial topic is NOT improved by an informational blog', !s || s.recommendedPageType !== 'existing_page_improvement', JSON.stringify(s?.recommendedPageType))
    server.close()
  }

  console.log('U) unit: model-aware thinking config (the live Pro-400 fix)')
  {
    const pro = resolveModelConfig('gemini-2.5-pro', 3000)
    check('M1. Pro NEVER gets thinkingBudget 0 (default 1024, budgeted mode)', pro.thinkingMode === 'budgeted' && pro.thinkingBudget === 1024, JSON.stringify(pro))
    check('M1b. Pro ceiling covers answer + thinking (3000+1024)', pro.maxOutputTokens === 4024, String(pro.maxOutputTokens))
    const flash = resolveModelConfig('gemini-2.5-flash', 3000)
    check('M2. Flash keeps thinkingBudget 0 (disabled) and answer-only ceiling', flash.thinkingMode === 'disabled' && flash.thinkingBudget === 0 && flash.maxOutputTokens === 3000)
    process.env.RECO_PRO_THINKING_BUDGET = '64'
    check('M3. configured Pro budget below 128 is CLAMPED to the valid range', resolveModelConfig('gemini-2.5-pro', 3000).thinkingBudget === 128)
    process.env.RECO_PRO_THINKING_BUDGET = '99999'
    check('M3b. configured Pro budget above 32768 is CLAMPED down', resolveModelConfig('gemini-2.5-pro', 3000).thinkingBudget === 32768)
    delete process.env.RECO_PRO_THINKING_BUDGET
    check('M4. capability comes from the EXPLICIT table (pro preview id → cannot disable)', modelCapability('gemini-2.5-pro-preview-06-05').canDisableThinking === false && modelCapability('gemini-2.5-flash-lite').canDisableThinking === true)
    check('M5. unknown pro-like id falls back CONSERVATIVELY (cannot disable)', modelCapability('gemini-9-pro-experimental').canDisableThinking === false)
  }

  console.log('U) unit: provider-error classification + sanitization')
  {
    check('C1. the LIVE 400 message → invalid_model_configuration (never model_unavailable)', classifyModelError('got status: 400 . {"error":{"code":400,"message":"Budget 0 is invalid. This model only works in thinking mode.","status":"INVALID_ARGUMENT"}}') === 'invalid_model_configuration')
    check('C2. generic INVALID_ARGUMENT → provider_invalid_argument', classifyModelError('{"error":{"code":400,"message":"Invalid JSON payload received.","status":"INVALID_ARGUMENT"}}') === 'provider_invalid_argument')
    check('C3. 404 not-found still → model_unavailable', classifyModelError('models/gemini-x is not found for API version v1beta') === 'model_unavailable')
    check('C4. 429 → rate_limited', classifyModelError('429 Too Many Requests: quota exceeded') === 'rate_limited')
    const san = sanitizeProviderMessage('POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456 failed: Budget 0 is invalid')
    check('C5. sanitized message strips API keys and URL params', !san.includes('AIza') && !/key=(?!\[key\])/.test(san) && san.includes('Budget 0 is invalid'), san)
  }

  console.log('E2E) provider failure — exact accounting, typed cause, FAIL verdict')
  {
    const sFail = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], alwaysFail: true, respond: () => [] })
    process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${sFail.port}`
    resetModelResolutionCache()
    resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const run = await generateFromBriefs(fakeAdmin(naturalShopTables()), { projectId: 'p1', targetCount: 8, qualityMode: 'premium' }, newRunCostController('premium', 'runPF', 8))
    const rd = run.diagnostics.rounds[0]
    check('PF1. stop_reason is provider_failed (never insufficient_inventory)', run.diagnostics.stop_reason === 'provider_failed', run.diagnostics.stop_reason)
    check('PF2. provider_failed_briefs equals briefs_sent (no quality-rejection mislabel)', !!rd && rd.provider_failed_briefs === rd.briefs_sent && rd.briefs_sent > 0, JSON.stringify(rd))
    check('PF3. the exact equation holds: sent = polished+skipped+missing+providerFailed', !!rd && rd.briefs_sent === rd.polished + rd.skipped_by_model + rd.missing_from_response + rd.provider_failed_briefs)
    check('PF4. typed cause is invalid_model_configuration with a sanitized message', rd?.providerErrorType === 'invalid_model_configuration' && !!rd?.sanitizedProviderMessage && !String(rd.sanitizedProviderMessage).includes('AIza'), JSON.stringify({ t: rd?.providerErrorType, m: rd?.sanitizedProviderMessage }))
    const { evaluateRunAcceptance } = await import('../recommendations/qa-acceptance')
    const acc = evaluateRunAcceptance({ tierRequested: 'premium', diagnostics: run.diagnostics, suggestions: run.suggestions, pendingBefore: 0 })
    check('PF5. acceptance verdict is FAIL (provider_no_failure + reconciliation intact)', acc.verdict === 'FAIL' && acc.rules.find((r) => r.id === 'provider_no_failure')?.pass === false && acc.rules.find((r) => r.id === 'exact_reconciliation')?.pass === true, JSON.stringify(acc.rules.filter((r) => !r.pass).map((r) => r.id)))
    sFail.server.close()
  }

  console.log('E2E) RC1 — synthesis response contract failures are TYPED, never inventory')
  {
    const { evaluateRunAcceptance } = await import('../recommendations/qa-acceptance')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const runWithRaw = async (name: string, raw: (briefs: { id: string }[]) => string) => {
      const srv = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], respond: () => [], respondRaw: raw as never })
      process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${srv.port}`
      resetModelResolutionCache(); resetRecoGenAiClient()
      const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
      const run = await generateFromBriefs(fakeAdmin(naturalShopTables()), { projectId: 'p1', targetCount: 5, qualityMode: 'premium' }, newRunCostController('premium', `rc1-${name}`, 5))
      srv.server.close()
      return run
    }
    // T1: direct ARRAY instead of {"topics":[]} → typed schema failure.
    const r1 = await runWithRaw('array', (briefs) => JSON.stringify(briefs.map((b) => ({ briefId: b.id, skip: false, title: 'כותרת כלשהי לבדיקה', primaryKeyword: 'מילת מפתח לבדיקה' }))))
    check('T1. direct array → synthesis_schema_failure + stop synthesis_failed', r1.diagnostics.rounds[0]?.synthesis_failure === 'synthesis_schema_failure' && r1.diagnostics.stop_reason === 'synthesis_failed', JSON.stringify({ f: r1.diagnostics.rounds[0]?.synthesis_failure, s: r1.diagnostics.stop_reason }))
    const a1 = evaluateRunAcceptance({ tierRequested: 'premium', diagnostics: r1.diagnostics, suggestions: r1.suggestions, pendingBefore: 0 })
    check('T1b. verdict FAIL via synthesis_response_contract (NEVER insufficient)', a1.verdict === 'FAIL' && a1.rules.find((x) => x.id === 'synthesis_response_contract')?.pass === false, a1.verdict)

    // T2: renamed wrapper {"suggestions":[]} → typed schema failure.
    const r2 = await runWithRaw('renamed', () => JSON.stringify({ suggestions: [] }))
    check('T2. {"suggestions":[]} wrapper → synthesis_schema_failure', r2.diagnostics.rounds[0]?.synthesis_failure === 'synthesis_schema_failure', JSON.stringify(r2.diagnostics.rounds[0]?.synthesisResponse?.topLevelKeys))

    // T3: unknown brief ids → typed failure.
    const r3 = await runWithRaw('unknown', () => JSON.stringify({ topics: [{ briefId: 'brief_zzz1', skip: false, title: 'כותרת', primaryKeyword: 'מילה' }, { briefId: 'brief_zzz2', skip: true, why: 'x' }] }))
    check('T3. unknown brief ids → synthesis_unknown_brief_ids (ids recorded)', r3.diagnostics.rounds[0]?.synthesis_failure === 'synthesis_unknown_brief_ids' && (r3.diagnostics.rounds[0]?.synthesisResponse?.unknownBriefIds.length ?? 0) >= 2, JSON.stringify(r3.diagnostics.rounds[0]?.synthesisResponse?.unknownBriefIds))

    // T4/T6: ALL briefs omitted (Matalon class) → all-missing → FAIL.
    const r4 = await runWithRaw('empty', () => JSON.stringify({ topics: [] }))
    const rd4 = r4.diagnostics.rounds[0]
    check('T4. all briefs omitted → synthesis_all_briefs_missing, missing=sent', rd4?.synthesis_failure === 'synthesis_all_briefs_missing' && rd4?.missing_from_response === rd4?.briefs_sent && (rd4?.briefs_sent ?? 0) > 0, JSON.stringify({ f: rd4?.synthesis_failure, m: rd4?.missing_from_response, s: rd4?.briefs_sent }))
    check('T4b. reconciliation still EXACT with all-missing', !!rd4 && rd4.briefs_sent === rd4.polished + rd4.skipped_by_model + rd4.missing_from_response + rd4.provider_failed_briefs)
    const a4 = evaluateRunAcceptance({ tierRequested: 'premium', diagnostics: r4.diagnostics, suggestions: r4.suggestions, pendingBefore: 0 })
    check('T6. Matalon-class all-missing run → verdict FAIL, never INSUFFICIENT_INVENTORY', a4.verdict === 'FAIL', a4.verdict)

    // T5 is the MAIN E2E scenario above: full schema-honoring response succeeds
    // against the STRICT fake (which now REQUIRES responseSchema on the wire).
  }

  console.log('E2E) RC3 — constrained discovery fills a deficit (no stored research)')
  {
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const { evaluateRunAcceptance } = await import('../recommendations/qa-acceptance')
    // Natural-Shop class: NO keyword research; tracked terms already owned as
    // entities → deterministic pool is EMPTY; discovery must fill from anchors.
    const tables = naturalShopTables()
    tables.keyword_research_cache = []
    tables.tracking_targets = [{ project_id: 'p1', keyword: 'אבקת חלבון צמחית' }] // exact owned entity name
    const srv = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], respond: (briefs) => briefs.map((b, i) => ({ briefId: b.id, skip: false, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' })) })
    process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${srv.port}`
    resetModelResolutionCache(); resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const run = await generateFromBriefs(fakeAdmin(tables), { projectId: 'p1', targetCount: 6, qualityMode: 'premium' }, newRunCostController('premium', 'disc1', 6))
    check('T8/T9. NO stored research ≠ zero opportunities: discovery ran and filled the pool', run.diagnostics.discovery?.ran === true && (run.diagnostics.discovery?.accepted ?? 0) > 0 && run.suggestions.length > 0, JSON.stringify({ d: run.diagnostics.discovery?.accepted, acc: run.suggestions.length }))
    check('T8b. deterministic pool was empty/owned yet run produced anchored topics', run.diagnostics.brief_pool.pool_size === 0 && run.suggestions.length > 0, `pool=${run.diagnostics.brief_pool.pool_size}`)
    check('T12. at most TWO paid calls (discovery + one synthesis)', run.diagnostics.model_calls <= 2 && srv.calls.length <= 2, `calls=${srv.calls.length}`)
    check('T11. discovered topics claim NO volume (no exact research match exists)', run.suggestions.every((s) => !s.demandEvidence?.demandEvidenceAvailable && !/חיפושים חודשיים/.test(s.suggestionReason)), JSON.stringify(run.suggestions.map((s) => s.suggestionReason).slice(0, 2)))
    const acc = evaluateRunAcceptance({ tierRequested: 'premium', diagnostics: run.diagnostics, suggestions: run.suggestions, pendingBefore: 0 })
    check('T8c. the discovery-backed run PASSES acceptance', acc.verdict === 'PASS', JSON.stringify(acc.rules.filter((r) => !r.pass).map((r) => r.id)))
    srv.server.close()
  }

  console.log('U) RC4 — modifier tokens can never become standalone themes')
  {
    const { buildBriefPool } = await import('../recommendations/opportunity-brief')
    const entities = [
      { name: 'זר ורוד רומנטי', url: '/p/1', type: 'product' as const },
      { name: 'סחלב ורוד מרהיב', url: '/p/2', type: 'product' as const },
      { name: 'בלון ורוד לכלה', url: '/p/3', type: 'product' as const },
      { name: 'מארז שוקולד לכלה', url: '/p/4', type: 'product' as const },
      { name: 'זר גיבסניות לבן', url: '/p/5', type: 'product' as const },
      { name: 'אבקת חלבון צמחית', url: '/p/6', type: 'product' as const },
      { name: 'אבקת חלבון חלבית', url: '/p/7', type: 'product' as const },
    ]
    const { pool, diagnostics } = buildBriefPool({
      language: 'he', keywordResearch: [], trackedKeywords: [], projectFocus: [], entities,
      publishedCoverage: [], pendingExactKeys: new Set(), pendingSignatures: [],
      isOwnedByEntity: () => false, isCoveredByContent: () => false,
      domainTypeWords: new Set(), attributeTokens: new Set(['ורוד', 'לכלה', 'כלה', 'לבנ', 'רומנטי']),
    })
    const subjects = pool.map((b) => b.subject)
    check('T10. ורוד/כלה/שוקולד/גיבסניות never become theme subjects', !subjects.some((sub) => /^(?:איך לבחור\s+)?(?:ורוד|כלה|שוקולד|גיבסניות)$/.test(sub.trim())), JSON.stringify(subjects))
    check('T10b. NO forced "איך לבחור X" theme frame exists at all', !subjects.some((sub) => sub.startsWith('איך לבחור')), JSON.stringify(subjects))
    check('T10c. a REAL multi-token noun phrase shared across entities IS a theme (אבקת חלבון)', subjects.some((sub) => sub.includes('אבקת חלבון')), JSON.stringify({ subjects, raw_theme: diagnostics.raw_theme_candidates }))
  }

  console.log('E2E) premium tier — real Pro when offered, EXPLICIT downgrade when not')
  {
    // Pro offered → premium uses it.
    const s1 = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], respond: (briefs) => briefs.map((b, i) => ({ briefId: b.id, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' })) })
    process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${s1.port}`
    resetModelResolutionCache()
    resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const run1 = await generateFromBriefs(fakeAdmin(naturalShopTables()), { projectId: 'p1', targetCount: 5, qualityMode: 'premium' }, newRunCostController('premium', 'run2', 5))
    check('P1. premium resolves the REAL Pro model (no silent Flash)', run1.diagnostics.modelPath.tierUsed === 'pro' && run1.diagnostics.modelPath.downgraded === false, JSON.stringify(run1.diagnostics.modelPath))
    check('P2. the actual HTTP call hit the Pro model id', s1.calls.every((c) => c.model.includes('pro')), JSON.stringify(s1.calls.map((c) => c.model)))
    check('P2b. Pro calls carried a VALID thinking budget (>=128, never 0) on the wire', s1.calls.every((c) => (c.thinkingBudget ?? 0) >= 128), JSON.stringify(s1.calls.map((c) => c.thinkingBudget)))
    check('P2c. modelConfig surfaced in diagnostics (budgeted thinking + real ceiling)', run1.diagnostics.modelConfig?.thinkingMode === 'budgeted' && (run1.diagnostics.modelConfig?.thinkingBudget ?? 0) >= 128 && (run1.diagnostics.modelConfig?.maxOutputTokens ?? 0) > (run1.diagnostics.modelConfig?.thinkingBudget ?? 0), JSON.stringify(run1.diagnostics.modelConfig))
    s1.server.close()

    // Pro NOT offered → explicit typed downgrade to Flash, run still succeeds.
    const s2 = await startFakeGenai({ models: ['gemini-2.5-flash'], respond: (briefs) => briefs.map((b, i) => ({ briefId: b.id, title: framedTitle(i, b.subject), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' })) })
    process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${s2.port}`
    resetModelResolutionCache()
    resetRecoGenAiClient()
    const run2 = await generateFromBriefs(fakeAdmin(naturalShopTables()), { projectId: 'p1', targetCount: 5, qualityMode: 'premium' }, newRunCostController('premium', 'run3', 5))
    check('P3. premium WITHOUT an offered Pro → EXPLICIT downgrade record', run2.diagnostics.modelPath.downgraded === true && run2.diagnostics.modelPath.downgradeReason === 'premium_model_unavailable' && run2.diagnostics.modelPath.tierUsed === 'flash', JSON.stringify(run2.diagnostics.modelPath))
    check('P4. the downgraded run still produced topics on Flash', run2.suggestions.length >= 3, `got ${run2.suggestions.length}`)
    s2.server.close()
  }

  console.log('E2E) truthful insufficient inventory (no filler, no repeat calls)')
  {
    const s = await startFakeGenai({ models: ['gemini-2.5-flash'], respond: () => [] })
    process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${s.port}`
    resetModelResolutionCache()
    resetRecoGenAiClient()
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const empty = fakeAdmin({ projects: [{ id: 'p2', business_name: 'ריק', target_domain: 'https://empty.co.il', language: 'he' }], tracking_targets: [], keyword_research_cache: [], shopify_entities: [], generated_articles: [], article_topics: [], content_topic_ideas: [], wordpress_content_index: [] })
    const run = await generateFromBriefs(empty, { projectId: 'p2', targetCount: 8, qualityMode: 'standard' }, newRunCostController('standard', 'run4', 8))
    check('I1. an evidence-empty project is a TRUTHFUL insufficient_inventory', run.diagnostics.insufficient_inventory && run.diagnostics.stop_reason === 'insufficient_inventory', run.diagnostics.stop_reason)
    check('I2. ZERO paid calls were made for an empty pool', run.diagnostics.model_calls === 0 && s.calls.length === 0, `calls=${s.calls.length}`)
    check('I3. no filler topics were invented', run.suggestions.length === 0)
    s.server.close()
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
