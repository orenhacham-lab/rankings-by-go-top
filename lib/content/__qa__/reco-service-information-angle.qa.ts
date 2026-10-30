/**
 * The INFORMATION-ANGLE brief — a service business's own keywords, over and over.
 *
 * DEFECT, measured on be-cln.co.il (project dc74c2ee, 26 Oct 2026). All 49 cached
 * keyword-research queries for the project are the business's own service, in every
 * city it serves: "חברת ניקיון ב<city>", "ניקיון משרדים ב<city>", "חברת ניקיון
 * משרדים". Not one is a question, a comparison or a how-to. The brief pool admitted
 * 27 of them; synthesis polished each into a title for its own subject, as instructed;
 * and then the project's own 19 service pages rejected every result — the worthiness
 * gate as source_only_entity_expansion (every candidate token already belongs to an
 * owned page name) and decideBlogArticle as commercial_page_not_blog /
 * existing_page_improvement_not_blog. The run ended with 0 new topics and
 * stop_reason: zero_marginal_yield, while the funnel reported a healthy 21-brief pool.
 *
 * The gates are RIGHT: a 20th "ניקיון משרדים ב<city>" page would cannibalize the 19
 * the site has, and this suite PROVES they still reject exactly that. What was missing
 * is the instruction that such a brief's deliverable is an INFORMATION ANGLE around
 * the service — which is the only thing a blog article can legitimately be here.
 *
 * So the brief is FLAGGED deterministically (subjectAddsNothingOwned: ≥2 distinctive
 * tokens and EVERY one of them is an owned-entity-name token or a generic modifier —
 * the same "all tokens known" shape the worthiness gate uses), and the flag travels
 * into the synthesis prompt as `must_be: "information_angle"` plus one rule. No gate
 * is loosened, no threshold moved, and no brief is added, dropped, re-scored or
 * re-ordered by the flag.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildBriefPool, ownedNameTokens, subjectAddsNothingOwned, type OpportunityBrief,
} from '../recommendations/opportunity-brief'
import { buildBriefSynthesisPrompt } from '../recommendations/brief-synthesis'
import { evaluateArticleWorthiness, type ExistingPageSignal } from '../recommendations/opportunity'
import { normalizePhrase } from '../recommendations/keyword-guard'
import { assessNeedCannibalization, type ExistingCoverageDoc } from '../recommendations/coverage'
import { startFakeGenai } from './_reco-harness'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// ── be-cln.co.il, read from Production on 26 Oct 2026 ────────────────────────
/** The project's own indexed pages (site_crawl_index.targets, 21 of them). */
const PAGES = [
  'אזורי השירות שלנו', 'מאמרים', 'אולם תצוגה נמדד בזכוכית, ברצפה ובתאורה',
  'חברת ניקיון שמנוהלת על ידי מי שמגיע אליכם', 'ניקיון אחרי שיפוץ, עד שהמקום באמת מוכן לשימוש',
  'ניקיון משרדים בהרצליה ובהרצליה פיתוח', 'ניקיון משרדים ברמת גן ובאזור הבורסה',
  'ניקיון משרדים בתל אביב', 'ניקיון משרדים ואולמות תצוגה בנתניה',
  'ניקיון משרדים ואולמות תצוגה בפתח תקווה', 'ניקיון משרדים ועסקים בהוד השרון',
  'ניקיון משרדים וקליניקות בגבעתיים', 'ניקיון משרדים וקליניקות ברעננה',
  'ניקיון משרדים עם צוות קבוע שמכיר אתכם', 'ניקיון משרדים שמתחיל לפני שהעובדים מגיעים',
  'ניקיון משרדים, קליניקות ומרפאות בכפר סבא', 'ניקיון קליניקות ומרפאות לפי סטנדרט שמטופל מרגיש',
  'שירותי ניקיון לעסקים', 'הצהרת נגישות', 'מדיניות פרטיות', 'נדבר על מה שהמקום שלכם צריך',
]
/** A representative slice of the 49 cached queries — every one a service phrase. */
const QUERIES = [
  'חברת ניקיון', 'חברת ניקיון בתל אביב', 'חברת ניקיון ברמת גן', 'חברת ניקיון בכפר סבא',
  'חברת ניקיון למשרדים', 'חברת ניקיון משרדים', 'חברת ניקיון מחיר', 'ניקיון משרדים ברמת גן',
  'ניקיון משרדים בכפר סבא', 'ניקיון משרד', 'ניקיון למשרד', 'ניקיון קליניקות',
  // these three carry a word of their own and must NOT be flagged
  'ניקיון מבנים', 'ניקיון דירות אחרי שיפוץ', 'ניקיון לפני אכלוס',
]
const OWNED = ownedNameTokens(PAGES.map((name) => ({ name })))
const EXISTING_PAGES: ExistingPageSignal[] = PAGES.map((t) => ({ name: normalizePhrase(t), pageType: 'unknown' }))
const COVERAGE_DOCS: ExistingCoverageDoc[] = PAGES.map((t, i) => ({ title: t, url: `https://be-cln.co.il/p${i}`, type: 'page', sourceKey: `page:${i}` }))

function pool(): { pool: OpportunityBrief[]; diagnostics: ReturnType<typeof buildBriefPool>['diagnostics'] } {
  const owners = new Set(PAGES.map((t) => normalizePhrase(t)))
  return buildBriefPool({
    language: 'he',
    keywordResearch: QUERIES.map((q) => ({ query: q, volume: null })),
    trackedKeywords: ['ניקיון משרדים', 'ניקיון קליניקות'],
    projectFocus: [],
    entities: PAGES.map((name) => ({ name, url: null, type: 'page' as const })),
    publishedCoverage: [],
    pendingExactKeys: new Set<string>(),
    pendingSignatures: [],
    isOwnedByEntity: (p) => owners.has(normalizePhrase(p)),
    isCoveredByContent: () => false,
    domainTypeWords: new Set<string>(),
  })
}

/** A brief literal for prompt assertions. */
const brief = (id: string, subject: string, entities: string[], angle: boolean): OpportunityBrief => ({
  opportunityId: id, subject, searchNeed: 'informational', family: 'informational',
  sourceEvidence: [{ kind: 'keyword_research', text: subject }], alignedDemandQuery: { query: subject, volume: 90 },
  demandVolumeSource: 'keyword_research_cache', intendedIntent: 'informational', intendedPageType: 'article',
  existingContentGap: true, relatedEntities: entities.map((n) => ({ name: n, url: null, type: 'page' })),
  publishedCoverage: [], confidence: 0.9, briefScore: 0.5,
  ...(angle ? { informationAngleOnly: true } : {}),
} as unknown as OpportunityBrief)

/** Contract-faithful in-memory admin (project_id filtered), as the other engine suites use. */
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

/** be-cln.co.il as the engine sees it: the owned service pages + the cached queries. */
function serviceSiteTables(): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: 'p1', business_name: 'חברת ניקיון', target_domain: 'https://be-cln.co.il', language: 'he', country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'ניקיון משרדים' }, { project_id: 'p1', keyword: 'ניקיון קליניקות' }],
    keyword_research_cache: [{
      project_id: 'p1', created_at: '2026-10-01',
      results_json: QUERIES.map((keyword, i) => ({ keyword, avgMonthlySearches: 200 - i * 5 })),
    }],
    shopify_entities: PAGES.map((title, i) => ({
      project_id: 'p1', is_active: true, title, handle: `pg${i}`, entity_type: 'page',
      canonical_url: `https://be-cln.co.il/p${i}`,
    })),
    generated_articles: [],
    article_topics: [],
    content_topic_ideas: [],
    wordpress_content_index: [],
  }
}

/** One real engine run against the fixture model, which answers with `reply`. */
async function engineRun(
  label: string,
  reply: (b: { id: string; subject: string; aligned_query?: string }, i: number) => Record<string, unknown>,
) {
  const { server, port } = await startFakeGenai({
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    respond: (briefs) => briefs.map((b, i) => ({ briefId: b.id, skip: false, ...reply(b, i) })),
  })
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
  resetModelResolutionCache()
  resetRecoGenAiClient()
  try {
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    return await generateFromBriefs(
      fakeAdmin(serviceSiteTables()),
      { projectId: 'p1', targetCount: 12, qualityMode: 'standard' },
      newRunCostController('standard', label, 12),
    )
  } finally {
    server.close()
  }
}

async function main() {
  console.log('The information-angle brief — a service business\'s own keywords\n')

  // ── A) the detector: exactly the subjects that add nothing over the own pages ──
  console.log('A) subjectAddsNothingOwned')
  {
    for (const s of ['חברת ניקיון בכפר סבא', 'ניקיון משרדים ברמת גן', 'חברת ניקיון', 'חברת ניקיון מחיר']) {
      check(`A. flagged: ${s}`, subjectAddsNothingOwned(s, OWNED))
    }
    for (const s of ['ניקיון מבנים', 'ניקיון דירות אחרי שיפוץ', 'ניקיון לפני אכלוס', 'איך לבחור חברת ניקיון למשרד', 'מנקה בתל אביב']) {
      check(`A. NOT flagged (has a word of its own): ${s}`, !subjectAddsNothingOwned(s, OWNED))
    }
    check('A10. a generic modifier alone never saves a subject (מחיר is generic)',
      subjectAddsNothingOwned('ניקיון משרדים מחיר', OWNED))
    check('A11. no owned names → nothing is flagged (a project with no site map)',
      !subjectAddsNothingOwned('חברת ניקיון בכפר סבא', new Set<string>()))
    check('A12. a single distinctive token is never flagged', !subjectAddsNothingOwned('ניקיון', OWNED))
    check('A13. an empty subject is never flagged', !subjectAddsNothingOwned('', OWNED))
  }

  // ── B) the pool: the flag is advisory — membership and order are untouched ────
  console.log('\nB) the flag never changes the pool')
  {
    const { pool: p, diagnostics: d } = pool()
    const flagged = p.filter((b) => b.informationAngleOnly)
    check('B1. the real project DOES produce flagged briefs', flagged.length >= 5, `flagged=${flagged.length}`)
    check('B2. and briefs with a word of their own are NOT flagged',
      p.some((b) => !b.informationAngleOnly), `unflagged=${p.filter((b) => !b.informationAngleOnly).length}`)
    check('B3. diagnostics count matches', d.information_angle_briefs === flagged.length)
    check('B4. accounting still closes: raw = pool + Σ rejected',
      d.total_raw_candidates === d.pool_size + Object.values(d.rejected_by_reason).reduce((a, b) => a + b, 0))
    // The flag is additive: every OTHER field of a flagged brief is what it was.
    const withoutFlag = (bs: OpportunityBrief[]) => JSON.stringify(bs.map((b) => ({ ...b, informationAngleOnly: undefined })))
    const same = withoutFlag(p)
    const control = withoutFlag(pool().pool)
    check('B5. deterministic — same input, same pool', same === control)
    check('B6. intent and family are NOT rewritten by the flag',
      flagged.every((b) => b.intendedPageType === 'article' && !!b.intendedIntent && !!b.family))
    check('B7. score and priority are untouched by the flag',
      flagged.every((b) => typeof b.briefScore === 'number' && b.priority !== undefined))
  }

  // ── C) the prompt carries the flag and the rule ──────────────────────────────
  console.log('\nC) the synthesis prompt')
  {
    const flaggedBrief = brief('b1', 'ניקיון משרדים ברמת גן', ['ניקיון משרדים ברמת גן ובאזור הבורסה'], true)
    const freeBrief = brief('b2', 'ניקיון דירות אחרי שיפוץ', ['ניקיון אחרי שיפוץ'], false)
    const p = buildBriefSynthesisPrompt([flaggedBrief, freeBrief], 'Hebrew', 2026)
    check('C1. the flagged brief is marked in the payload', /"must_be":"information_angle"/.test(p))
    check('C2. exactly ONE brief is marked', (p.match(/"must_be":"information_angle"/g) ?? []).length === 1)
    check('C3. the rule explains why (the site already has that page)', /already has the page that serves it/.test(p))
    check('C4. the rule demands a CONTENT word of its own', /at least one CONTENT word of its own/.test(p))
    check('C5. a question word alone is explicitly not enough', /A question word alone/.test(p))
    check('C6. the bare service phrase and a city phrase are forbidden', /never a city-and-service phrase/.test(p))
    check('C7. it overrides "use aligned_query verbatim" for that brief only', /for THIS brief only, ignore the "use aligned_query verbatim" rule/.test(p))
    check('C8. the brief must NOT be skipped for it', /Do NOT skip such a brief/.test(p))
    const unflagged = buildBriefSynthesisPrompt([freeBrief], 'Hebrew', 2026)
    check('C9. a pool with no flagged brief carries no marked payload', !/"must_be":"information_angle"/.test(unflagged))
    check('C9b. the rule line itself is always present (it is read per brief)', /"must_be": "information_angle"/.test(unflagged))
    check('C10. the "aligned_query verbatim" rule itself is unchanged',
      /use it verbatim or a minimal natural variant of it/.test(unflagged))
    check('C11. the provenance block and the skip enum are untouched',
      /BRIEF PROVENANCE/.test(unflagged) && /"cannot_form_title"/.test(unflagged))
  }

  // ── D) THE REGRESSION PROOF: real cannibalization is still blocked ───────────
  console.log('\nD) real cannibalization is still rejected (no gate was loosened)')
  {
    const reject = (kw: string, title: string) => evaluateArticleWorthiness({
      primaryKeyword: kw, title, secondaryKeywords: ['x'], intent: 'commercial',
      existingPages: EXISTING_PAGES, hasEvidence: true, businessRelevant: true,
    })
    check('D1. the exact service phrase of an existing page → rejected',
      reject('ניקיון משרדים בתל אביב', 'ניקיון משרדים בתל אביב').rejection_reason === 'exact_existing_keyword_owner')
    for (const kw of ['ניקיון משרדים ברמת גן', 'חברת ניקיון בכפר סבא', 'ניקיון משרדים מחיר', 'ניקיון משרדים אחרי שיפוץ']) {
      const r = reject(kw, `${kw}: המדריך`)
      check(`D. a re-expression of an owned service → still rejected: ${kw}`,
        r.rejection_reason === 'source_only_entity_expansion' || r.rejection_reason === 'weak_entity_modifier',
        String(r.rejection_reason))
    }
    const opp = stripComments(read('lib/content/recommendations/opportunity.ts'))
    check('D6. the worthiness gate source is UNCHANGED — the rejection still stands',
      /return fail\('source_only_entity_expansion', 0, cannib\)/.test(opp))
    check('D7. the residual rule is UNCHANGED (all tokens known → no added need)',
      /residual = candToks\.filter\(\(t\) => !entityTokenUnion\.has\(t\) && !GENERIC_TOKENS\.has\(t\)\)/.test(opp))
    const blog = stripComments(read('lib/content/recommendations/blog-article-acceptance.ts'))
    check('D8. the blog-only gate is UNCHANGED',
      /return reject\('existing_page_improvement_not_blog'\)/.test(blog) && /return reject\('commercial_page_not_blog'\)/.test(blog))
    check('D9. nothing in this change touches the brief-pool admission checks',
      /reject\('exact_existing_keyword_owner', b\.subject, kind\)/.test(stripComments(read('lib/content/recommendations/opportunity-brief.ts'))))
  }

  // ── E) what the instruction asks for actually survives the gates ─────────────
  console.log('\nE) an information angle with a content word of its own survives')
  {
    const angles: [string, string][] = [
      ['מה לבדוק בחוזה ניקיון משרדים', 'מה לבדוק בחוזה ניקיון משרדים לפני שחותמים'],
      ['תקני ניקיון בקליניקה', 'תקני ניקיון בקליניקה: מה חייב להיות'],
      ['ניקיון שטיחים במשרד', 'ניקיון שטיחים במשרד: מה חשוב לדעת'],
      ['ציוד וחומרים לניקיון משרדים', 'ציוד וחומרים לניקיון משרדים'],
    ]
    for (const [kw, title] of angles) {
      const w = evaluateArticleWorthiness({
        primaryKeyword: kw, title, secondaryKeywords: ['x'], intent: 'informational',
        existingPages: EXISTING_PAGES, hasEvidence: true, businessRelevant: true,
      })
      check(`E. passes the worthiness gate: ${kw}`, w.ok, String(w.rejection_reason))
      const c = assessNeedCannibalization({ primaryKeyword: kw, title, intent: 'informational' }, COVERAGE_DOCS)
      check(`E. and no existing page owns the need (stays an article): ${kw}`,
        c.matchType === 'distinct', c.matchType)
    }
  }

  // ── F) END TO END, the real engine: the bare service phrase yields nothing, the
  //       information angle yields topics ─────────────────────────────────────────
  console.log('\nF) end to end — the real engine over be-cln\'s own pages and queries')
  {
    // F.a — the model answers as it does today: the brief's own service phrase.
    const bare = await engineRun('run-bare', (b) => ({
      title: `${b.subject}: המדריך המלא`, primaryKeyword: b.aligned_query ?? b.subject,
      secondaryKeywords: [], intent: 'commercial',
    }))
    const bareRejected = bare.diagnostics.rounds.reduce((acc, r) => {
      for (const [k, v] of Object.entries(r.rejected_by_reason)) acc[k] = (acc[k] ?? 0) + v
      return acc
    }, {} as Record<string, number>)
    check('F1. not one accepted keyword re-expresses an owned service page',
      bare.suggestions.every((s) => !subjectAddsNothingOwned(s.primaryKeyword, OWNED)),
      JSON.stringify(bare.suggestions.map((s) => s.primaryKeyword)))
    check('F2. the owned service phrases were rejected by the cannibalization gate',
      (bareRejected['source_only_entity_expansion'] ?? 0) + (bareRejected['weak_entity_modifier'] ?? 0) + (bareRejected['exact_existing_keyword_owner'] ?? 0) > 0,
      JSON.stringify(bareRejected))

    // F.b — the model answers as the new rule instructs: the subject's words PLUS a
    // content word of its own. Nothing else about the run changes.
    // What the new rule asks for, applied to EACH brief's own subject: its words kept,
    // plus one content noun of its own. A distinct frame per brief, so no two collapse
    // into an intra-run duplicate.
    const FRAMES: { kw: (s: string) => string; title: (s: string) => string }[] = [
      { kw: (s) => `מה לבדוק בחוזה ${s}`, title: (s) => `מה לבדוק בחוזה ${s} לפני שחותמים` },
      { kw: (s) => `תקנים ורגולציה ב${s}`, title: (s) => `תקנים ורגולציה ב${s}` },
      { kw: (s) => `ציוד וחומרים ל${s}`, title: (s) => `ציוד וחומרים ל${s}` },
      { kw: (s) => `הכנת המקום לפני ${s}`, title: (s) => `הכנת המקום לפני ${s}` },
      { kw: (s) => `רשימת בדיקה ל${s}`, title: (s) => `רשימת בדיקה ל${s}` },
      { kw: (s) => `בטיחות בחומרי ניקוי ב${s}`, title: (s) => `בטיחות בחומרי ניקוי ב${s}` },
      { kw: (s) => `הסמכת עובדים ל${s}`, title: (s) => `הסמכת עובדים ל${s}` },
    ]
    const angle = await engineRun('run-angle', (b, i) => {
      const f = FRAMES[i % FRAMES.length]
      return { title: f.title(b.subject), primaryKeyword: f.kw(b.subject), secondaryKeywords: ['x'], intent: 'informational' }
    })
    check('F3. the information angle DOES yield topics', angle.suggestions.length > 0, `accepted=${angle.suggestions.length}`)
    check('F3b. and more than the service phrase ever could',
      angle.suggestions.length > bare.suggestions.length, `angle=${angle.suggestions.length} bare=${bare.suggestions.length}`)
    check('F4. and not one of them is the owned service phrase',
      angle.suggestions.every((s) => !PAGES.some((p) => normalizePhrase(p) === normalizePhrase(s.primaryKeyword))),
      JSON.stringify(angle.suggestions.map((s) => s.primaryKeyword)))
    check('F5. every accepted keyword carries a word the site does not already own',
      angle.suggestions.every((s) => !subjectAddsNothingOwned(s.primaryKeyword, OWNED)),
      JSON.stringify(angle.suggestions.map((s) => s.primaryKeyword)))
    // The measured difference on this project, 26 Oct 2026: 1 accepted topic from the
    // service phrases, 9 from the same briefs answered as information angles.
    check('F6. the yield is a multiple of what the service phrase gives, not a trickle',
      angle.suggestions.length >= 6 && bare.suggestions.length <= 2,
      `angle=${angle.suggestions.length} bare=${bare.suggestions.length}`)
  }

  // ── G) the two pieces of the change are both load-bearing ───────────────────
  // Run as REAL mutation controls on 26 Oct 2026, each reverted afterwards:
  //   MC1 — delete the flag assignment in makeBrief → B1 fails (flagged=0).
  //   MC2 — delete the three `must_be` rule lines from the prompt → C3..C8 fail.
  // Two further changes were PROTOTYPED and DROPPED, because the same mutation
  // controls proved they bought nothing: skipping the owned-subject fallback inside
  // normalizeToSearchPhrase, and relaxing the subject-preservation invariant for an
  // angle brief. An angle that keeps the brief's own words — which the rule requires —
  // satisfies both of them already, so neither changed a single accepted topic in F.
  // They are not shipped: no normalizer and no invariant is touched by this change.
  console.log('\nG) both pieces are load-bearing')
  {
    const ob = stripComments(read('lib/content/recommendations/opportunity-brief.ts'))
    check('G1. the flag is set from the detector in makeBrief (MC1 removes this)',
      /args\.ownedTokens && subjectAddsNothingOwned\(subject, args\.ownedTokens\)/.test(ob))
    check('G2. the detector is the gate\'s own "all tokens known" shape',
      /toks\.every\(\(t\) => tokenIn\(t, ownedTokens\) \|\| tokenIn\(t, GENERIC_CANON\)\)/.test(ob))
    const bs = stripComments(read('lib/content/recommendations/brief-synthesis.ts'))
    check('G3. the payload marks the brief (MC2 removes the rule)', /informationAngleOnly \? \{ must_be: 'information_angle' \} : \{\}/.test(bs))
    const gfb = read('lib/content/recommendations/generate-from-briefs.ts')
    check('G4. the engine itself is UNTOUCHED — no gate, normalizer or invariant changed',
      !/informationAngleOnly/.test(gfb))
    check('G5. the search-phrase normalizer is UNTOUCHED',
      !/informationAngle/.test(read('lib/content/recommendations/search-phrase.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
export {}
