/**
 * GOLDEN blog-article acceptance suite — deterministic fixtures built from the PROVEN
 * production cases (GO TOP, Best Gifts, Shoplight, Shashka, Ido Sport, JUP). Every
 * fixture executes the REAL decision function `decideBlogArticle` (which composes the
 * real search-phrase, secondary-keyword, brand-safety, semantic-dup and page-type
 * helpers) and asserts ONE expected outcome:
 *   KEEP · KEEP_WITH_SECONDARIES_REMOVED · RECLASSIFY_TO_ARTICLE · REPAIR_AND_KEEP · REJECT
 * For every invalid fixture there are ≥2 nearby VALID control fixtures that must keep
 * passing — the suite proves proven-invalid topics/fields are removed WITHOUT dropping
 * nearby valid article volume.
 */
import { createServer, type Server } from 'http'
import { buildBrandSafety } from '../recommendations/brand-safety'
import { topicSignature } from '../recommendations/semantic-dup'
import { contentTokens } from '../recommendations/evidence-cluster'
import { decideBlogArticle, type BlogAcceptanceContext, type BlogCandidate } from '../recommendations/blog-article-acceptance'
import { fakeAdmin } from './_reco-harness'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'
import type { SearchIntent } from '../recommendations/opportunity'
import type { RecommendedPageType } from '../recommendations/opportunity-validation'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── context builder ──────────────────────────────────────────────────────────
function ctxOf(o: {
  businessName: string; entityNames?: string[]; evidence?: string[];
  domainTypeWords?: string[]; pending?: { kw: string; intent?: string }[];
}): BlogAcceptanceContext {
  const brandSafety = buildBrandSafety({ businessName: o.businessName, entityNames: o.entityNames ?? [], ownEvidence: o.evidence ?? [] })
  // The manual fixtures pass ONLY owned evidence (entities + focus) — never keyword research.
  const explicitBusinessEvidenceTokens = new Set<string>()
  for (const s of [...(o.entityNames ?? []), ...(o.evidence ?? [])]) for (const t of contentTokens(s)) explicitBusinessEvidenceTokens.add(t)
  const domainTypeWords = new Set<string>((o.domainTypeWords ?? []).map((w) => contentTokens(w)[0]).filter(Boolean) as string[])
  const blogDuplicateSignatures = (o.pending ?? []).map((p) => ({ sig: topicSignature(p.kw, p.intent), source: 'pending' as const }))
  return { brandSafety, explicitBusinessEvidenceTokens, domainTypeWords, blogDuplicateSignatures }
}
const cand = (o: Partial<BlogCandidate> & { title: string; primaryKeyword: string }): BlogCandidate => ({
  secondaryKeywords: [], intent: 'informational' as SearchIntent, recommendedPageType: 'article' as RecommendedPageType, ...o,
})

async function main() {
  console.log('GO TOP — SEO agency (blog-only)')
  {
    const ctx = ctxOf({
      businessName: 'GO TOP', entityNames: ['שירותי קידום אתרים', 'בניית אתרים', 'ניהול קמפיינים'],
      evidence: ['קידום אתרים', 'קידום אורגני', 'שיווק דיגיטלי', 'לידים', 'דף נחיתה', 'ביקורת אתר'],
      domainTypeWords: ['אתרים', 'אתר', 'גוגל', 'קידום', 'אורגני', 'דיגיטלי'],
      pending: [
        { kw: 'קידום אורגני', intent: 'informational' },
        { kw: 'בניית אתר תדמית', intent: 'informational' },
      ],
    })
    // INVALID — SEO semantic duplicate of pending "קידום אורגני".
    const d1 = decideBlogArticle(cand({ title: 'איך עובד קידום אתרים אורגני בגוגל? עקרונות ושלבים להצלחה', primaryKeyword: 'קידום אתרים אורגני בגוגל' }), ctx)
    check('GO TOP SEO same-need → REJECT pending_semantic_duplicate', d1.outcome === 'reject' && d1.reason === 'pending_semantic_duplicate', JSON.stringify(d1))
    // INVALID — אתר תדמית same intro need as pending "בניית אתר תדמית".
    const d2 = decideBlogArticle(cand({ title: 'מהו אתר תדמית ומדוע כל עסק חייב אחד כזה?', primaryKeyword: 'אתר תדמית' }), ctx)
    check('GO TOP אתר תדמית intro-need → REJECT pending_semantic_duplicate', d2.outcome === 'reject' && d2.reason === 'pending_semantic_duplicate', JSON.stringify(d2))
    // RECLASSIFY — informational "what to check before choosing an SEO company".
    const d3 = decideBlogArticle(cand({ title: 'מה חשוב לבדוק לפני שבוחרים חברת קידום אתרים?', primaryKeyword: 'בחירת חברת קידום אתרים', intent: 'commercial', recommendedPageType: 'commercial_landing_page' }), ctx)
    check('GO TOP choose-SEO-company → RECLASSIFY_TO_ARTICLE', d3.outcome === 'reclassify_to_article' && d3.recommendedPageType === 'article', JSON.stringify(d3))
    // CONTROLS — distinct informational articles must be kept.
    const c1 = decideBlogArticle(cand({ title: 'איך לייצר לידים איכותיים מדף נחיתה', primaryKeyword: 'יצירת לידים מדף נחיתה', intent: 'informational' }), ctx)
    check('CONTROL GO TOP lead-gen article → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'מדריך לביצוע ביקורת קידום אתרים טכנית', primaryKeyword: 'ביקורת קידום אתרים טכנית', intent: 'informational' }), ctx)
    check('CONTROL GO TOP technical audit article → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
  }

  console.log('Best Gifts — gifting store')
  {
    const ctx = ctxOf({
      businessName: 'Best Gifts', entityNames: ['מנורת ירח', 'מארז מתנה', 'מתנות לגבר'],
      evidence: ['מתנות', 'מארז מתנה', 'מנורת לילה', 'רעיונות למתנה'],
      domainTypeWords: ['מנורה', 'מנורת', 'מתנה', 'מארז'],
      pending: [{ kw: 'מנורת ירח', intent: 'commercial' }],
    })
    // INVALID — moon-lamp selection guide duplicates the pending moon-lamp topic.
    const d1 = decideBlogArticle(cand({ title: 'מנורת ירח: כיצד לבחור את התאורה המושלמת ליצירת אווירה קסומה בחדר', primaryKeyword: 'מנורת ירח', intent: 'commercial' }), ctx)
    check('Best Gifts מנורת ירח → REJECT pending_semantic_duplicate', d1.outcome === 'reject' && d1.reason === 'pending_semantic_duplicate', JSON.stringify(d1))
    // INVALID — malformed marketing-sentence primary keyword, repairable from evidence.
    const d2 = decideBlogArticle(cand({ title: 'איך להרכיב מארז מתנה אישי לכל אירוע', primaryKeyword: 'להרכיב מארז מתנה אישי ומרגש לכל אירוע', supportedQuery: 'מארז מתנה אישי' }), ctx)
    check('Best Gifts marketing-sentence keyword → REPAIR_AND_KEEP', d2.outcome === 'repair_and_keep' && d2.primaryKeyword === 'מארז מתנה אישי', JSON.stringify(d2))
    // CONTROLS — distinct gifting articles.
    const c1 = decideBlogArticle(cand({ title: 'רעיונות למתנות מקוריות לנערים שיש להם כבר הכל', primaryKeyword: 'מתנות מקוריות לנערים', intent: 'informational' }), ctx)
    check('CONTROL Best Gifts teen gifts → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'מה כדאי לכלול במארז מתנה לתינוק?', primaryKeyword: 'מארז מתנה לתינוק', intent: 'informational' }), ctx)
    check('CONTROL Best Gifts baby gift box → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
  }

  console.log('Shoplight — lighting store (secondary coherence)')
  {
    const ctx = ctxOf({
      businessName: 'Shoplight', entityNames: ['תאורה לחדר שינה', 'ספוטים שקועים', 'עמודי תאורה לגינה', 'פס לד'],
      evidence: ['תאורה', 'מנורה', 'ספוטים', 'לד', 'גינה', 'חדר שינה'],
      domainTypeWords: ['תאורה', 'מנורה', 'גוף', 'תלוי', 'מנורת'],
    })
    // KEEP_WITH_SECONDARIES_REMOVED — bedroom topic, dining-room secondaries removed.
    const d1 = decideBlogArticle(cand({ title: 'איך לבחור תאורה לחדר שינה ליצירת אווירה מושלמת?', primaryKeyword: 'תאורה לחדר שינה', secondaryKeywords: ['מנורה לפינת אוכל', 'גוף תאורה תלוי לפינת אוכל', 'תאורה לפינת אוכל'] }), ctx)
    check('Shoplight bedroom + dining secondaries → KEEP_WITH_SECONDARIES_REMOVED', d1.outcome === 'keep_secondaries_removed' && d1.secondaryKeywords.length === 0 && d1.removedSecondaries.length === 3, JSON.stringify(d1))
    // KEEP_WITH_SECONDARIES_REMOVED — gypsum spotlights, garden-pole secondaries removed.
    const d2 = decideBlogArticle(cand({ title: 'ספוטים שקועים בגבס: המדריך לתכנון והתקנת תאורה נסתרת ומעוצבת', primaryKeyword: 'ספוטים שקועים בגבס', secondaryKeywords: ['עמוד תאורה לגינה', 'התקנת עמוד תאורה'] }), ctx)
    check('Shoplight gypsum + garden secondaries → KEEP_WITH_SECONDARIES_REMOVED', d2.outcome === 'keep_secondaries_removed' && d2.secondaryKeywords.length === 0 && d2.removedSecondaries.length === 2, JSON.stringify(d2))
    // CONTROLS — must remain accepted articles.
    const c1 = decideBlogArticle(cand({ title: 'המדריך המלא לתכנון תאורת גינה', primaryKeyword: 'תכנון תאורת גינה', intent: 'informational' }), ctx)
    check('CONTROL Shoplight garden lighting plan → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'פס לד צמוד תקרה: מדריך בחירה', primaryKeyword: 'פס לד צמוד תקרה', intent: 'informational' }), ctx)
    check('CONTROL Shoplight LED strip → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
    const c3 = decideBlogArticle(cand({ title: 'פס תאורה מגנטי: יתרונות והתקנה', primaryKeyword: 'פס תאורה מגנטי', intent: 'informational' }), ctx)
    check('CONTROL Shoplight magnetic strip → KEEP', c3.outcome === 'keep', JSON.stringify(c3))
  }

  console.log('Shashka — second-hand fashion store')
  {
    const ctx = ctxOf({
      businessName: 'ששקה', entityNames: ['בגדי יד שנייה', 'מכנס מחויט יד שנייה', 'בגד גוף יד שנייה'],
      evidence: ['יד שנייה', 'בגדים', 'אופנה', 'משומש', 'קנייה אונליין'],
      domainTypeWords: ['בגדי', 'בגד', 'אופנה'],
    })
    // INVALID — malformed marketing-sentence keyword; repairable from evidence query.
    const d1 = decideBlogArticle(cand({ title: 'קניית בגדי יד שנייה אונליין בבטחה', primaryKeyword: 'לקניית בגדי יד שנייה אונליין בבטחה ובסטייל', supportedQuery: 'קניית בגדי יד שנייה אונליין' }), ctx)
    check('Shashka malformed search phrase → REPAIR_AND_KEEP', d1.outcome === 'repair_and_keep' && d1.primaryKeyword === 'קניית בגדי יד שנייה אונליין', JSON.stringify(d1))
    // INVALID — own-brand promotional pitch (brand in the title) → not a blog topic.
    const d2 = decideBlogArticle(cand({ title: 'חנויות יד 2: למה ששקה היא הבחירה הנכונה לקנייה אונליין', primaryKeyword: 'חנויות יד 2', intent: 'commercial', recommendedPageType: 'commercial_landing_page' }), ctx)
    check('Shashka brand pitch → REJECT own_brand_not_blog_topic', d2.outcome === 'reject' && d2.reason === 'own_brand_not_blog_topic', JSON.stringify(d2))
    // CONTROLS — second-hand fashion IS the business model → kept (evidence supports יד שנייה).
    const c1 = decideBlogArticle(cand({ title: 'איך לבחור ולקנות בגד גוף יד שנייה שיראה חדש?', primaryKeyword: 'בגד גוף יד שנייה', intent: 'informational' }), ctx)
    check('CONTROL Shashka second-hand body suit → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'טיפים לבחירת מכנס מחויט לנשים יד שנייה שיושב מושלם', primaryKeyword: 'מכנס מחויט לנשים יד שנייה', intent: 'informational' }), ctx)
    check('CONTROL Shashka tailored trousers → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
  }

  console.log('Ido Sport — NEW fitness equipment store')
  {
    const ctx = ctxOf({
      businessName: 'עידו ספורט', entityNames: ['קטלבל אוניברסלי', 'משקולות יד', 'הליכון חשמלי', 'ספסל אימון'],
      evidence: ['ציוד כושר', 'אימון', 'משקולות', 'קטלבל', 'כושר'],
      domainTypeWords: ['כושר', 'אימון', 'ציוד'],
    })
    // INVALID — own-brand article (the store's own name as the topic).
    const d1 = decideBlogArticle(cand({ title: 'עידו ספורט: המומחים שלכם לציוד כושר ביתי ופתרונות אימון מתקדמים', primaryKeyword: 'עידו ספורט', intent: 'commercial', recommendedPageType: 'commercial_landing_page' }), ctx)
    check('Ido Sport own-brand → REJECT own_brand_not_blog_topic', d1.outcome === 'reject' && d1.reason === 'own_brand_not_blog_topic', JSON.stringify(d1))
    // INVALID — used-equipment expansion with no owned used-equipment evidence.
    const d2 = decideBlogArticle(cand({ title: 'ספת כושר יד 2: מדריך לבחירה חכמה וקנייה בטוחה', primaryKeyword: 'ספת כושר יד 2', intent: 'informational' }), ctx)
    check('Ido Sport used-equipment (no evidence) → REJECT unsupported_business_model_expansion', d2.outcome === 'reject' && d2.reason === 'unsupported_business_model_expansion', JSON.stringify(d2))
    // RECLASSIFY — adjustable-weights buying guide is a valid informational article.
    const d3 = decideBlogArticle(cand({ title: 'משקולות אוניברסליות 40 ק״ג: למי הן מתאימות ואיך לבחור סט מנצח?', primaryKeyword: 'משקולות אוניברסליות 40 קג', intent: 'commercial', recommendedPageType: 'commercial_landing_page' }), ctx)
    check('Ido Sport adjustable weights buying guide → RECLASSIFY_TO_ARTICLE', d3.outcome === 'reclassify_to_article' && d3.recommendedPageType === 'article', JSON.stringify(d3))
    // CONTROLS — distinct fitness articles must be kept.
    const c1 = decideBlogArticle(cand({ title: 'מהו קטלבל אוניברסלי וכיצד הוא יכול לשדרג את אימון הכוח שלכם?', primaryKeyword: 'קטלבל אוניברסלי', intent: 'informational' }), ctx)
    check('CONTROL Ido Sport universal kettlebell → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'קטלבל מתכוונן מול קטלבל רגיל: מה עדיף?', primaryKeyword: 'קטלבל מתכוונן מול קטלבל רגיל', intent: 'comparison' }), ctx)
    check('CONTROL Ido Sport kettlebell comparison → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
  }

  console.log('JUP — construction/contractor content (specialist-legal expansion)')
  {
    const ctx = ctxOf({
      businessName: 'JUP', entityNames: ['שיפוצים', 'עבודות בנייה', 'קבלן שלד'],
      evidence: ['שיפוץ', 'בנייה', 'קבלן', 'שלד', 'תכנון'],
      domainTypeWords: ['בנייה', 'שיפוץ', 'קבלן'],
    })
    // INVALID — broad legal-enforcement article with no owned legal-service evidence.
    const d1 = decideBlogArticle(cand({ title: 'מה כוללת אחריות קבלן על פי חוק המכר וכיצד ניתן לאכוף אותה?', primaryKeyword: 'אחריות קבלן חוק המכר', intent: 'informational' }), ctx)
    check('JUP legal-enforcement (no legal evidence) → REJECT unsupported_business_model_expansion', d1.outcome === 'reject' && d1.reason === 'unsupported_business_model_expansion', JSON.stringify(d1))
    // CONTROLS — genuine construction how-to articles must be kept.
    const c1 = decideBlogArticle(cand({ title: 'איך לבחור קבלן שלד אמין לפרויקט בנייה', primaryKeyword: 'בחירת קבלן שלד', intent: 'informational' }), ctx)
    check('CONTROL JUP choose skeleton contractor → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'שלבי שיפוץ דירה: המדריך המלא לתכנון', primaryKeyword: 'שלבי שיפוץ דירה', intent: 'informational' }), ctx)
    check('CONTROL JUP apartment renovation stages → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
  }

  // ── INTEGRATION — the REAL prepareBriefRun context construction ──────────────
  // These prove the CONTEXT WIRING (not a hand-built context): the blog gate is fed
  // exactly the acceptanceContext production builds from the snapshot. If explicit
  // evidence wrongly included keyword research, or the dedupe corpus were pending-only,
  // these would fail.
  console.log('INTEGRATION — real snapshot-derived acceptance context (prepareBriefRun)')
  {
    const KWS = (arr: string[]) => arr.map((k, i) => ({ keyword: k, avgMonthlySearches: 120 + i * 20 }))
    const startServer = (): Promise<{ server: Server; port: number }> => {
      const server = createServer((req, res) => {
        req.on('data', () => {}); req.on('end', () => {
          if (req.method === 'GET' && (req.url ?? '').includes('/models')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }] })); return }
          // Discovery / synthesis calls: return nothing (pool comes from research/entities).
          res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ needs: [], topics: [] }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 100, totalTokenCount: 600 } }))
        })
      })
      return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port })))
    }
    const realCtx = async (tables: Record<string, Record<string, unknown>[]>): Promise<BlogAcceptanceContext> => {
      const s = await startServer()
      process.env.GEMINI_API_KEY = 'test-key'; process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${s.port}`
      resetModelResolutionCache(); resetRecoGenAiClient()
      const { prepareBriefRun } = await import('../recommendations/generate-from-briefs')
      const { newRunCostController } = await import('../recommendations/run-cost-controller')
      const snap = await prepareBriefRun(fakeAdmin(tables), { projectId: 'p1', targetCount: 4, qualityMode: 'premium' }, newRunCostController('premium', 'it', 6))
      s.server.close()
      // EXACTLY what production-run.ts builds from the snapshot.
      return { brandSafety: snap.brandSafety, explicitBusinessEvidenceTokens: snap.explicitBusinessEvidenceTokens, domainTypeWords: snap.domainTypeWords, blogDuplicateSignatures: snap.blogDuplicateSignatures }
    }
    const baseTables = (over: Record<string, Record<string, unknown>[]> = {}) => ({
      projects: [{ id: 'p1', business_name: 'עידו ספורט', target_domain: 'https://ido-sport.co.il', language: 'he', country: 'IL' }],
      tracking_targets: [{ project_id: 'p1', keyword: 'ציוד כושר ביתי' }],
      keyword_research_cache: [{ project_id: 'p1', fetched_at: '2026-07-01', results_json: KWS(['קטלבל אוניברסלי', 'משקולות יד', 'הליכון חשמלי', 'ספסל אימון', 'אימון כוח בבית', 'מזרן יוגה']) }],
      shopify_entities: [{ project_id: 'p1', is_active: true, title: 'קטלבל אוניברסלי', handle: 'kb', entity_type: 'product', canonical_url: 'https://ido-sport.co.il/p/kb' }],
      generated_articles: [], article_topics: [], content_topic_ideas: [], wordpress_content_index: [],
      ...over,
    })

    // IT-A — used-goods term ONLY in keyword research, no owned evidence → REJECT.
    const ctxA = await realCtx(baseTables({ keyword_research_cache: [{ project_id: 'p1', fetched_at: '2026-07-01', results_json: KWS(['ספת כושר יד שנייה', 'קטלבל אוניברסלי', 'אימון כוח בבית', 'ספסל אימון', 'משקולות יד', 'הליכון חשמלי']) }] }))
    const a = decideBlogArticle(cand({ title: 'ספת כושר יד 2: מדריך לבחירה חכמה', primaryKeyword: 'ספת כושר יד 2' }), ctxA)
    check('IT-A. used-goods term only in keyword research → REJECT (KR is not business evidence)', a.outcome === 'reject' && a.reason === 'unsupported_business_model_expansion', JSON.stringify(a))

    // IT-B — legal term ONLY in keyword research, no owned legal evidence → REJECT.
    const ctxB = await realCtx(baseTables({ keyword_research_cache: [{ project_id: 'p1', fetched_at: '2026-07-01', results_json: KWS(['אחריות קבלן חוק המכר', 'קטלבל אוניברסלי', 'אימון כוח בבית', 'ספסל אימון', 'משקולות יד', 'הליכון חשמלי']) }] }))
    const b2 = decideBlogArticle(cand({ title: 'מה כוללת אחריות קבלן על פי חוק המכר?', primaryKeyword: 'אחריות קבלן חוק המכר' }), ctxB)
    check('IT-B. legal term only in keyword research → REJECT (KR is not business evidence)', b2.outcome === 'reject' && b2.reason === 'unsupported_business_model_expansion', JSON.stringify(b2))

    // IT-C — an OWNED entity explicitly supports used equipment → KEEP.
    const ctxC = await realCtx(baseTables({ shopify_entities: [{ project_id: 'p1', is_active: true, title: 'ציוד כושר יד שנייה', handle: 'used', entity_type: 'category', canonical_url: 'https://ido-sport.co.il/c/used' }] }))
    const c = decideBlogArticle(cand({ title: 'ספת כושר יד 2: מדריך לבחירה חכמה', primaryKeyword: 'ספת כושר יד 2' }), ctxC)
    check('IT-C. owned used-equipment category → KEEP (explicit evidence authorizes)', c.outcome !== 'reject', JSON.stringify(c))

    // IT-D — duplicate of a GENERATED article → REJECT with source 'generated'.
    const ctxD = await realCtx(baseTables({ generated_articles: [{ project_id: 'p1', title: 'אימון כוח בבית' }] }))
    const d = decideBlogArticle(cand({ title: 'אימון כוח בבית', primaryKeyword: 'אימון כוח בבית' }), ctxD)
    check('IT-D. duplicate of generated_articles → REJECT (source generated)', d.outcome === 'reject' && d.reason === 'pending_semantic_duplicate' && d.duplicateSource === 'generated', JSON.stringify(d))

    // IT-E — duplicate of an ARTICLE_TOPIC → REJECT with source 'article_topic'.
    const ctxE = await realCtx(baseTables({ article_topics: [{ project_id: 'p1', topic: 'יתרונות אימון פונקציונלי' }] }))
    const e = decideBlogArticle(cand({ title: 'יתרונות אימון פונקציונלי', primaryKeyword: 'יתרונות אימון פונקציונלי' }), ctxE)
    check('IT-E. duplicate of article_topics → REJECT (source article_topic)', e.outcome === 'reject' && e.reason === 'pending_semantic_duplicate' && e.duplicateSource === 'article_topic', JSON.stringify(e))

    // IT-F — duplicate of an INDEXED article/post page → REJECT with source 'indexed_article'.
    const ctxF = await realCtx(baseTables({ shopify_entities: [{ project_id: 'p1', is_active: true, title: 'מדריך תזונת ספורטאים', handle: 'blog1', entity_type: 'blog', canonical_url: 'https://ido-sport.co.il/blog/nutrition' }] }))
    const f = decideBlogArticle(cand({ title: 'מדריך תזונת ספורטאים', primaryKeyword: 'תזונת ספורטאים' }), ctxF)
    check('IT-F. duplicate of an indexed article/post → REJECT (source indexed_article)', f.outcome === 'reject' && f.reason === 'pending_semantic_duplicate' && f.duplicateSource === 'indexed_article', JSON.stringify(f))

    // IT-G — a genuinely DISTINCT subtype survives dedupe → KEEP.
    const ctxG = await realCtx(baseTables({ generated_articles: [{ project_id: 'p1', title: 'אימון כוח בבית' }] }))
    const g = decideBlogArticle(cand({ title: 'אימון כוח לנשים אחרי לידה', primaryKeyword: 'אימון כוח לנשים אחרי לידה' }), ctxG)
    check('IT-G. distinct subtype (postpartum) vs generated general article → KEEP', g.outcome !== 'reject', JSON.stringify(g))
  }

  // ── Blocker 3 controls — legitimate qualifier queries must survive; malformed repair. ──
  console.log('Blocker 3 — qualifier queries survive; only structured marketing sentences repair')
  {
    // Evidence covers used-fashion + gifting so the two REPAIRED keywords survive (the point
    // of these two is the repair itself, not the expansion gate).
    const ctx = ctxOf({ businessName: 'Store', entityNames: ['מזרנים', 'תאורה', 'מתנות', 'בגדי יד שנייה', 'מארז מתנה'], evidence: ['מזרן', 'תאורה', 'מתנות', 'עסק', 'דיגיטלי', 'יד שנייה', 'מארז', 'אונליין'], domainTypeWords: ['תאורה', 'מזרן'] })
    const controls = [
      ['מתנות לכל אירוע', 'מתנות מקוריות לכל אירוע'],
      ['תאורה לכל חדר', 'איך לבחור תאורה לכל חדר בבית'],
      ['פתרונות דיגיטליים לכל עסק', 'פתרונות דיגיטליים לכל עסק קטן'],
      ['בחירת המזרן המושלם', 'איך לבחור את המזרן המושלם'],
      ['מארז מתנה מושלם ליולדת', 'מארז מתנה מושלם ליולדת'],
    ]
    for (const [kw, title] of controls) {
      const d = decideBlogArticle(cand({ title, primaryKeyword: kw, intent: 'informational' }), ctx)
      check(`CONTROL qualifier query survives (not malformed): "${kw}"`, d.outcome !== 'reject', JSON.stringify({ outcome: d.outcome, reason: d.reason }))
    }
    // The two proven marketing SENTENCES still repair (opener + tail together).
    const m1 = decideBlogArticle(cand({ title: 'קניית בגדי יד שנייה אונליין', primaryKeyword: 'לקניית בגדי יד שנייה אונליין בבטחה ובסטייל', supportedQuery: 'קניית בגדי יד שנייה אונליין' }), ctx)
    check('marketing sentence "לקניית … בבטחה ובסטייל" → REPAIR_AND_KEEP', m1.outcome === 'repair_and_keep' && m1.primaryKeyword === 'קניית בגדי יד שנייה אונליין', JSON.stringify(m1))
    const m2 = decideBlogArticle(cand({ title: 'איך להרכיב מארז מתנה אישי', primaryKeyword: 'להרכיב מארז מתנה אישי ומרגש לכל אירוע', supportedQuery: 'מארז מתנה אישי' }), ctx)
    check('marketing sentence "להרכיב … ומרגש לכל אירוע" → REPAIR_AND_KEEP', m2.outcome === 'repair_and_keep' && m2.primaryKeyword === 'מארז מתנה אישי', JSON.stringify(m2))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
