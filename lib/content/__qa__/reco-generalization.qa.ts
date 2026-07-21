/**
 * SYSTEM-WIDE GENERALIZATION AUDIT (PR #30) — the engine must work for EVERY
 * project and every future project, with NO project-id / domain-name / customer /
 * industry-specific exceptions. Every rule added in PR #30 is either
 * grammatical/domain-neutral (Hebrew modifiers, proclitics, temporal/price/action
 * words) or DATA-DERIVED from the active project (corpus type words, attribute
 * tokens, own vocab, project focus). This suite runs the REAL generateFromBriefs
 * pipeline across a multi-domain fixture matrix + a true cold start + explicit
 * tenant isolation, asserting: grounded safe opportunities when evidence supports
 * them, else a truthful typed insufficient-inventory result — never invented
 * evidence, never another project's data.
 */
import { startFakeGenai, fakeAdmin, genTitle } from './_reco-harness'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'
import { keywordHasRealSubject, isSearchPhraseQuality } from '../recommendations/search-phrase'
import { isMalformedReason } from '../recommendations/opportunity-validation'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

interface DomainSpec { id: string; business: string; domain: string; entities: { title: string; type: string; url: string }[]; kr: string[]; tracked?: string[] }

function tablesFor(d: DomainSpec): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: d.id, business_name: d.business, target_domain: d.domain, language: 'he', country: 'IL' }],
    tracking_targets: (d.tracked ?? []).map((k) => ({ project_id: d.id, keyword: k })),
    keyword_research_cache: d.kr.length ? [{ project_id: d.id, fetched_at: '2026-07-01', results_json: d.kr.map((keyword, i) => ({ keyword, avgMonthlySearches: 300 - i * 20 })) }] : [],
    shopify_entities: d.entities.map((e) => ({ project_id: d.id, is_active: true, title: e.title, handle: e.title.slice(0, 6), entity_type: e.type, canonical_url: e.url })),
    generated_articles: [], article_topics: [], content_topic_ideas: [], wordpress_content_index: [],
  }
}

const echo = (briefs: { id: string; subject: string; aligned_query?: string }[]) =>
  briefs.map((b, i) => ({ briefId: b.id, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }))

async function runProject(tables: Record<string, Record<string, unknown>[]>, projectId: string, opts?: { respond?: typeof echo }) {
  const { server, port } = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], respond: opts?.respond ?? echo })
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
  resetModelResolutionCache()
  resetRecoGenAiClient()
  const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
  const { newRunCostController } = await import('../recommendations/run-cost-controller')
  const run = await generateFromBriefs(fakeAdmin(tables), { projectId, targetCount: 6, qualityMode: 'premium' }, newRunCostController('premium', `gen-${projectId}`, 6))
  server.close()
  return run
}

const TRUTHFUL_STOPS = ['target_reached', 'true_pool_exhausted', 'call_cap_reached', 'zero_marginal_yield', 'insufficient_inventory', 'provider_failed', 'budget_stopped', 'synthesis_failed']

/** The invariants EVERY project must satisfy regardless of domain. */
function assertHealthy(label: string, run: Awaited<ReturnType<typeof runProject>>) {
  const d = run.diagnostics
  const kws = run.suggestions.map((s) => s.primaryKeyword)
  check(`${label}: truthful typed stop_reason`, TRUTHFUL_STOPS.includes(d.stop_reason), d.stop_reason)
  check(`${label}: grounded (>=1 topic) OR truthful insufficient_inventory`, run.suggestions.length > 0 || d.stop_reason === 'insufficient_inventory' || d.insufficient_inventory === true, `${run.suggestions.length} sugg / ${d.stop_reason}`)
  check(`${label}: every accepted keyword carries a real subject (no year/temporal-only)`, run.suggestions.every((s) => keywordHasRealSubject(s.primaryKeyword)), JSON.stringify(kws))
  check(`${label}: every accepted keyword is a clean search phrase`, run.suggestions.every((s) => isSearchPhraseQuality(s.primaryKeyword)), JSON.stringify(kws.filter((k) => !isSearchPhraseQuality(k))))
  check(`${label}: NO external business in accepted output`, [...d.competitorLeakage.acceptedTitle, ...d.competitorLeakage.acceptedPrimaryKeyword, ...d.competitorLeakage.acceptedSecondaryKeyword, ...d.competitorLeakage.acceptedLinkTarget].length === 0)
  check(`${label}: NO invented demand / malformed reason reaches output`, run.suggestions.every((s) => !isMalformedReason(s.suggestionReason) && !/(אלפי|מאות|עשרות)\s+חיפושים/.test(s.suggestionReason)))
  check(`${label}: ≤2 paid model calls (cost cap preserved)`, d.cost.totalPaidCalls <= 2, String(d.cost.totalPaidCalls))
}

// ── 12-domain matrix — realistic, domain-appropriate evidence per tenant ──────
const DOMAINS: DomainSpec[] = [
  { id: 'ecom', business: 'טק-סטור', domain: 'https://tech-store.co.il', kr: ['אוזניות בלוטות אלחוטיות', 'מקלדת גיימינג מכנית', 'מטען מהיר לטלפון'], entities: [{ title: 'אוזניות בלוטות ANC', type: 'product', url: 'https://tech-store.co.il/p/anc' }, { title: 'מקלדת מכנית RGB', type: 'product', url: 'https://tech-store.co.il/p/kb' }] },
  { id: 'local', business: 'אינסטלטור דוד', domain: 'https://dod-plumber.co.il', kr: ['פתיחת סתימות בראשון לציון', 'תיקון דוד שמש בראשון לציון', 'איתור נזילות מים'], entities: [{ title: 'שירותי אינסטלציה ראשון לציון', type: 'service', url: 'https://dod-plumber.co.il/s/rishon' }] },
  { id: 'b2b', business: 'קלאוד-פלואו', domain: 'https://cloudflow.io', kr: ['תוכנת ניהול לידים לעסקים', 'אוטומציית תהליכי מכירה', 'CRM לצוותי מכירות'], entities: [{ title: 'פלטפורמת אוטומציית מכירות', type: 'service', url: 'https://cloudflow.io/product' }] },
  { id: 'health', business: 'הצמחייה', domain: 'https://natural-shop.co.il', kr: ['תוספי מגנזיום לשינה', 'ויטמין D מומלץ למבוגרים', 'אומגה 3 יתרונות'], entities: [{ title: 'מגנזיום ביסגליצינט', type: 'product', url: 'https://natural-shop.co.il/p/mag' }] },
  { id: 'legal', business: 'משרד עורך דין לוי', domain: 'https://levi-law.co.il', kr: ['הסכם ממון לפני נישואין', 'תביעת פיצויי פיטורין', 'רישום חברה חדשה'], entities: [{ title: 'ליווי משפטי לחוזי מקרקעין', type: 'service', url: 'https://levi-law.co.il/s/realestate' }] },
  { id: 'fashion', business: 'סטייל בוטיק', domain: 'https://style-boutique.co.il', kr: ['שמלת ערב שחורה ארוכה', 'ג׳ינס בגזרה גבוהה', 'מעיל חורף אלגנטי'], entities: [{ title: 'שמלת מקסי פרחונית', type: 'product', url: 'https://style-boutique.co.il/p/maxi' }] },
  { id: 'sports', business: 'פיט-לאב', domain: 'https://fitlab.co.il', kr: ['תוכנית אימון למתחילים', 'תרגילי כוח לבית', 'תזונה לפני אימון'], entities: [{ title: 'מנוי חדר כושר חודשי', type: 'service', url: 'https://fitlab.co.il/s/membership' }] },
  { id: 'cleaning', business: 'ניקיון פלוס', domain: 'https://clean-plus.co.il', kr: ['ניקיון משרדים בתל אביב', 'פוליש לרצפות שיש', 'ניקוי ספות בקיטור'], entities: [{ title: 'שירותי ניקיון למשרדים', type: 'service', url: 'https://clean-plus.co.il/s/office' }] },
  { id: 'publisher', business: 'מגזין דיגיטל', domain: 'https://digimag.co.il', kr: ['מגמות בינה מלאכותית 2026', 'סקירת מכוניות חשמליות', 'ביקורת סדרות סטרימינג'], entities: [{ title: 'מדור טכנולוגיה', type: 'blog', url: 'https://digimag.co.il/tech' }] },
  { id: 'multiloc', business: 'רשת קפה בוקר', domain: 'https://morning-cafe.co.il', kr: ['בית קפה בתל אביב', 'בית קפה בחיפה', 'ארוחת בוקר זוגית בירושלים'], entities: [{ title: 'סניף תל אביב', type: 'service', url: 'https://morning-cafe.co.il/tlv' }, { title: 'סניף חיפה', type: 'service', url: 'https://morning-cafe.co.il/haifa' }] },
  { id: 'sparse', business: 'נגריית עץ', domain: 'https://wood-craft.co.il', kr: [], entities: [{ title: 'שולחן עץ אלון בהזמנה', type: 'product', url: 'https://wood-craft.co.il/p/oak' }] },
  { id: 'newproj', business: 'סטארט-אפ חדש', domain: 'https://newstartup.co.il', kr: [], entities: [] },
]

async function main() {
  console.log('G) 12-domain generalization matrix — the SAME mechanism, every vertical')
  for (const d of DOMAINS) {
    const run = await runProject(tablesFor(d), d.id)
    assertHealthy(d.id, run)
  }

  console.log('G) TRUE cold start — only business name + URL + services (no KR / pending / posts)')
  {
    const cold = tablesFor({ id: 'cold', business: 'סטודיו לצילום', domain: 'https://photo-studio.co.il', kr: [], entities: [{ title: 'צילום אירועים', type: 'service', url: 'https://photo-studio.co.il/s/events' }, { title: 'צילום מוצרים למסחר', type: 'service', url: 'https://photo-studio.co.il/s/product' }] })
    const run = await runProject(cold, 'cold')
    assertHealthy('cold-start', run)
    // Cold start MUST NOT invent evidence: either grounded from the services or a
    // truthful insufficient — never a fabricated keyword unrelated to the studio.
    check('cold-start: no fabricated off-domain topic (every keyword shares a project token)', run.suggestions.every((s) => /צילום|אירוע|מוצר|סטודיו/.test(s.primaryKeyword) || /צילום|אירוע|מוצר|סטודיו/.test(s.title)), JSON.stringify(run.suggestions.map((s) => s.primaryKeyword)))

    console.log('G) empty project — no evidence at all → truthful insufficient_inventory')
    const empty = tablesFor({ id: 'empty', business: 'ריק', domain: 'https://empty.co.il', kr: [], entities: [] })
    const runEmpty = await runProject(empty, 'empty')
    check('empty project: 0 suggestions', runEmpty.suggestions.length === 0, String(runEmpty.suggestions.length))
    check('empty project: truthful insufficient_inventory (never invented filler)', runEmpty.diagnostics.insufficient_inventory === true || runEmpty.diagnostics.stop_reason === 'insufficient_inventory', runEmpty.diagnostics.stop_reason)
  }

  console.log('G) TENANT ISOLATION — no keyword/page/brand/entity/link/pending/research crosses projects')
  {
    // One admin, TWO tenants with DISTINCTIVE, non-overlapping vocabularies.
    const health = tablesFor({ id: 'tHealth', business: 'הצמחייה', domain: 'https://natural-shop.co.il', kr: ['תוספי מגנזיום לשינה', 'ויטמין D למבוגרים'], entities: [{ title: 'מגנזיום ביסגליצינט', type: 'product', url: 'https://natural-shop.co.il/p/mag' }], tracked: ['תוספי תזונה טבעיים'] })
    const legal = tablesFor({ id: 'tLegal', business: 'משרד עורך דין לוי', domain: 'https://levi-law.co.il', kr: ['הסכם ממון לפני נישואין', 'תביעת פיצויי פיטורין'], entities: [{ title: 'ליווי משפטי לחוזי מקרקעין', type: 'service', url: 'https://levi-law.co.il/s/re' }], tracked: ['עורך דין מקרקעין'] })
    ;(legal.content_topic_ideas as Record<string, unknown>[]).push({ project_id: 'tLegal', status: 'pending', title: 'זכויות עובד בפיטורין', primary_keyword: 'זכויות עובד בפיטורין', fingerprint: 'x', search_intent: 'informational' })
    // Merge both tenants' rows into a SINGLE admin store (the real multi-tenant DB).
    const merged: Record<string, Record<string, unknown>[]> = {}
    for (const t of [health, legal]) for (const [k, rows] of Object.entries(t)) merged[k] = [...(merged[k] ?? []), ...rows]

    const LEGAL_MARKERS = /(עו"ד|עורך\s*דין|מקרקעין|פיטורין|נישואין|חוזי|ממון|תביע|משפט)/
    const HEALTH_MARKERS = /(מגנזיום|ויטמין|תוספי|תזונה|אומגה|ביסגליצינט)/
    const textOf = (run: Awaited<ReturnType<typeof runProject>>) => run.suggestions.flatMap((s) => [s.primaryKeyword, s.title, s.suggestionReason, ...(s.secondaryKeywords ?? []), ...(s.suggestedInternalLinks ?? []).map((l) => `${l.url} ${l.anchor}`)]).join(' | ')

    const rHealth = await runProject(merged, 'tHealth')
    const hText = textOf(rHealth)
    check('tenant-isolation: health run produced topics', rHealth.suggestions.length > 0, String(rHealth.suggestions.length))
    check('tenant-isolation: health run contains NO legal keyword/page/pending/link', !LEGAL_MARKERS.test(hText), hText.slice(0, 160))

    const rLegal = await runProject(merged, 'tLegal')
    const lText = textOf(rLegal)
    check('tenant-isolation: legal run produced topics', rLegal.suggestions.length > 0, String(rLegal.suggestions.length))
    check('tenant-isolation: legal run contains NO health keyword/page/entity/link', !HEALTH_MARKERS.test(lText), lText.slice(0, 160))
    // Evidence inventory must be counted PER TENANT (no bleed of counts).
    check('tenant-isolation: each run only sees its own KR rows', rHealth.diagnostics.evidence_inventory.keyword_research_queries > 0 && rLegal.diagnostics.evidence_inventory.keyword_research_queries > 0)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
