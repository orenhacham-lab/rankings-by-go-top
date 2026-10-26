/**
 * THE SERVICE OBJECT — a topic about someone else's customer.
 *
 * DEFECT, from Oren's report on be-cln.co.il (project dc74c2ee, 26 Oct 2026). The
 * project's "find ideas" run produced four ideas and he rejected two in one click:
 * "שירותי ניקיון בתים בנתניה" and "ניקיון בתים לאחר שיפוץ מול ניקיון משרדים". The
 * company cleans OFFICES, clinics, showrooms and buildings; its 21 pages never say
 * בית or דירה.
 *
 * WHY THE RELEVANCE VOCABULARY LET THEM THROUGH, measured: the project's vocabulary
 * holds 173 tokens (well above MIN_SITE_VOCAB_TOKENS, so the gate was live) and
 * isVocabAligned judges by PROPORTION — "שירותי ניקיון בתים בנתניה" matches 3 of its
 * 4 meaningful tokens, so the single foreign word rides in on the others. Tightening
 * the ratio is not available: an information angle is MADE of words the site does not
 * have ("חומרי ניקוי לרצפות משרד"), which is exactly what shipped the same day.
 *
 * THE FIX UNDER TEST. One word class decides: the kind of place the service is
 * performed on (service-object.ts). The site's own page titles say which objects it
 * serves; a candidate naming a different kind is rejected as other_service_object. On
 * a site that names NONE the owned set is empty and the gate is OFF, so a thin new
 * project behaves exactly as before — the failure direction is always to accept.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ownedServiceObjects, serviceObjectsNamed, foreignServiceObject, serviceObjectLabels,
} from '../recommendations/service-object'
import { buildBriefSynthesisPrompt } from '../recommendations/brief-synthesis'
import type { OpportunityBrief } from '../recommendations/opportunity-brief'
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

/** be-cln.co.il's own indexed pages, read from Production on 26 Oct 2026. */
const PAGES = [
  'אזורי השירות שלנו', 'מאמרים', 'אולם תצוגה נמדד בזכוכית, ברצפה ובתאורה',
  'חברת ניקיון שמנוהלת על ידי מי שמגיע אליכם', 'ניקיון אחרי שיפוץ, עד שהמקום באמת מוכן לשימוש',
  'ניקיון משרדים בהרצליה ובהרצליה פיתוח', 'ניקיון משרדים ברמת גן ובאזור הבורסה',
  'ניקיון משרדים בתל אביב', 'ניקיון משרדים ואולמות תצוגה בנתניה',
  'ניקיון משרדים ואולמות תצוגה בפתח תקווה', 'ניקיון משרדים ועסקים בהוד השרון',
  'ניקיון משרדים וקליניקות בגבעתיים', 'ניקיון משרדים וקליניקות ברעננה',
  'ניקיון משרדים עם צוות קבוע שמכיר אתכם', 'ניקיון משרדים שמתחיל לפני שהעובדים מגיעים',
  'ניקיון משרדים, קליניקות ומרפאות בכפר סבא', 'ניקיון קליניקות ומרפאות לפי סטנדרט שמטופל מרגיש',
  'ניקיון מבנים ואולמות תצוגה', 'שירותי ניקיון לעסקים', 'הצהרת נגישות', 'מדיניות פרטיות',
]
/** The same project's cached queries — every one its own service. */
const QUERIES = [
  'חברת ניקיון', 'חברת ניקיון בתל אביב', 'חברת ניקיון ברמת גן', 'חברת ניקיון בכפר סבא',
  'חברת ניקיון למשרדים', 'חברת ניקיון משרדים', 'חברת ניקיון מחיר', 'ניקיון משרדים ברמת גן',
  'ניקיון משרדים בכפר סבא', 'ניקיון משרד', 'ניקיון למשרד', 'ניקיון קליניקות',
  'ניקיון מבנים', 'ניקיון לפני אכלוס', 'עבודות ניקיון משרדים',
]
const OWNED = ownedServiceObjects(PAGES)

/** A page set that names NO kind of place at all — the thin-site floor. */
const THIN_PAGES = ['דף הבית', 'אודות', 'צור קשר', 'שירותי ניקיון', 'מאמרים', 'הצהרת נגישות']

const brief = (id: string, subject: string): OpportunityBrief => ({
  opportunityId: id, subject, searchNeed: 'informational', family: 'informational',
  sourceEvidence: [{ kind: 'keyword_research', text: subject }], alignedDemandQuery: { query: subject, volume: 90 },
  demandVolumeSource: 'keyword_research_cache', intendedIntent: 'informational', intendedPageType: 'article',
  existingContentGap: true, relatedEntities: [], publishedCoverage: [], confidence: 0.9, briefScore: 0.5,
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

function tablesFor(pages: string[]): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: 'p1', business_name: 'חברת ניקיון', target_domain: 'https://be-cln.co.il', language: 'he', country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'ניקיון משרדים' }, { project_id: 'p1', keyword: 'ניקיון קליניקות' }],
    keyword_research_cache: [{
      project_id: 'p1', created_at: '2026-10-01',
      results_json: QUERIES.map((keyword, i) => ({ keyword, avgMonthlySearches: 200 - i * 5 })),
    }],
    shopify_entities: pages.map((title, i) => ({
      project_id: 'p1', is_active: true, title, handle: `pg${i}`, entity_type: 'page',
      canonical_url: `https://be-cln.co.il/p${i}`,
    })),
    generated_articles: [], article_topics: [], content_topic_ideas: [], wordpress_content_index: [],
  }
}

/** One real engine run against the fixture model, which answers with `reply`. */
async function engineRun(
  label: string,
  pages: string[],
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
      fakeAdmin(tablesFor(pages)),
      { projectId: 'p1', targetCount: 12, qualityMode: 'standard' },
      newRunCostController('standard', label, 12),
    )
  } finally { server.close() }
}

const rejectedTotals = (d: { rounds: { rejected_by_reason: Record<string, number> }[] }) =>
  d.rounds.reduce((acc, r) => {
    for (const [k, v] of Object.entries(r.rejected_by_reason)) acc[k] = (acc[k] ?? 0) + v
    return acc
  }, {} as Record<string, number>)

async function main() {
  console.log('The service object — a topic about someone else\'s customer\n')

  // ── A) what the site itself serves ──────────────────────────────────────────
  console.log('A) the detector')
  {
    check('A1. be-cln\'s own pages name offices, clinics, showrooms and buildings',
      ['office', 'clinic', 'showroom', 'building'].every((k) => OWNED.has(k as never)) && OWNED.size === 4,
      Array.from(OWNED).join(','))
    check('A2. and never a private home', !OWNED.has('home'))
    check('A3. a prefixed plural still counts (ואולמות תצוגה)',
      serviceObjectsNamed('ניקיון משרדים ואולמות תצוגה בנתניה').has('showroom'))
    check('A4. רמת גן is a city, NOT a kindergarten',
      serviceObjectsNamed('ניקיון משרדים ברמת גן ובאזור הבורסה').size === 1 &&
      serviceObjectsNamed('ניקיון משרדים ברמת גן').has('office'))
    check('A5. בית ספר is a school, not a home', serviceObjectsNamed('ניקיון בית ספר').has('school') &&
      !serviceObjectsNamed('ניקיון בית ספר').has('home'))
    check('A6. בתי חולים is a hospital, not a home', serviceObjectsNamed('ניקיון בתי חולים').has('hospital') &&
      !serviceObjectsNamed('ניקיון בתי חולים').has('home'))
    check('A7. בית קפה is a restaurant, not a home', serviceObjectsNamed('ניקיון בית קפה').has('restaurant') &&
      !serviceObjectsNamed('ניקיון בית קפה').has('home'))
    check('A8. a plain home IS a home', serviceObjectsNamed('שירותי ניקיון בתים בנתניה').has('home'))
    check('A9. an information angle with no place in it names nothing',
      serviceObjectsNamed('חומרי ניקוי לרצפות').size === 0)
    check('A10. an empty text names nothing', serviceObjectsNamed('').size === 0)
    check('A11b. THE HOMEPAGE TRAP — "דף הבית" holds the word for a home, and a utility page never claims a customer',
      serviceObjectsNamed('דף הבית').has('home') && ownedServiceObjects(['דף הבית']).size === 0)
    check('A11c. the same for a cart and the terms', ownedServiceObjects(['עגלת הקניות', 'תנאי שימוש']).size === 0)
    check('A11. a site that names no kind of place has an EMPTY owned set',
      ownedServiceObjects(THIN_PAGES).size === 0, Array.from(ownedServiceObjects(THIN_PAGES)).join(','))
  }

  // ── B) the gate's decisions, on the real four ideas ─────────────────────────
  console.log('\nB) the gate')
  {
    // The two Oren rejected.
    for (const kw of ['שירותי ניקיון בתים בנתניה', 'ניקיון בתים לאחר שיפוץ מול ניקיון משרדים']) {
      check(`B. BLOCKED — the two he rejected: ${kw}`, foreignServiceObject(kw, OWNED) === 'home')
    }
    // The two he kept, and the information angles the 26 Oct work exists to produce.
    for (const kw of [
      'תחזוקת ניקיון משרד', 'מחירון חברת ניקיון לעסקים', 'עבודות ניקיון משרדים',
      'ניקיון לפני אכלוס', 'חומרי ניקוי לרצפות משרד', 'ניקיון מבנים', 'איך לבחור חברת ניקיון למשרד',
      'מה לבדוק בחוזה ניקיון משרדים', 'תקני ניקיון בקליניקה', 'ניקיון משרדים ברמת גן', 'מנקה בתל אביב',
    ]) {
      check(`B. passes — the site's own customers and the angles around them: ${kw}`,
        foreignServiceObject(kw, OWNED) === null, String(foreignServiceObject(kw, OWNED)))
    }
    check('B12. another kind of business is blocked too (restaurants)',
      foreignServiceObject('ניקיון מסעדות', OWNED) === 'restaurant')
    // Measured against all 554 existing ideas of every project that has pages
    // (26 Oct 2026): the gate blocks exactly the two above and nothing else. Its one
    // false positive before this check existed was a perfume named "Intense Cafe".
    check('B12b. a PRODUCT name that happens to read like a place is not a place',
      foreignServiceObject('Montale Rose Musk לעומת Montale Intense Cafe',
        ownedServiceObjects(['בשמים לאישה', 'בשמים לגבר', 'מבצעים'])) === null)
    check('B13. THE FLOOR — a site that names no kind of place blocks NOTHING',
      ['שירותי ניקיון בתים בנתניה', 'ניקיון מסעדות', 'ניקיון דירות']
        .every((kw) => foreignServiceObject(kw, ownedServiceObjects(THIN_PAGES)) === null))
    check('B14. and that is the same as an empty set by construction',
      foreignServiceObject('שירותי ניקיון בתים בנתניה', new Set()) === null)
    check('B15. labels are built for the prompt in a stable order',
      serviceObjectLabels(OWNED).join(' | ') === 'offices | clinics | buildings | showrooms and halls',
      serviceObjectLabels(OWNED).join(' | '))
    check('B16. no owned objects → no labels', serviceObjectLabels(new Set()).length === 0)
  }

  // ── C) the prompt rule ─────────────────────────────────────────────────────
  console.log('\nC) the synthesis prompt')
  {
    const briefs = [brief('b1', 'ניקיון משרדים ברמת גן')]
    const withObjects = buildBriefSynthesisPrompt(briefs, 'Hebrew', 2026, serviceObjectLabels(OWNED))
    const without = buildBriefSynthesisPrompt(briefs, 'Hebrew', 2026)
    check('C1. the rule names the site\'s own customers', withObjects.includes("THE SITE'S OWN CUSTOMERS") &&
      withObjects.includes('offices, clinics, buildings, showrooms and halls'))
    check('C2. and it is ABSENT when the site names no kind of place',
      !without.includes("THE SITE'S OWN CUSTOMERS") && !buildBriefSynthesisPrompt(briefs, 'Hebrew', 2026, []).includes("THE SITE'S OWN CUSTOMERS"))
    check('C3. the prompt is otherwise unchanged (the rule is the only difference)',
      without === withObjects.split('\n').filter((l) => !l.includes("THE SITE'S OWN CUSTOMERS")).join('\n'))
    check('C4. the information-angle rule of the same day is still there',
      withObjects.includes('"must_be": "information_angle"'))
    check('C5. the skip enum is untouched', withObjects.includes('"cannot_form_title"') &&
      withObjects.includes('"subject_unintelligible"') && withObjects.includes('"duplicate_of_covered_title"'))
  }

  // ── D) the gate's place in the validator ───────────────────────────────────
  console.log('\nD) where the gate sits')
  {
    const src = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('D1. the gate runs on the FINAL keyword AND the title',
      /foreignServiceObject\(`\$\{primaryKeyword\} \$\{t\.title\}`, servedObjects\)/.test(src))
    check('D2. it rejects — there is no repair path that could smuggle the object through',
      /return rej\('other_service_object', 'service_object'/.test(src) &&
      !/other_service_object[\s\S]{0,400}tryRepair\(\)/.test(src))
    check('D3. the owned set is read ONCE in preparation, so the gate and the prompt cannot disagree',
      /const servedObjects = ownedServiceObjects\(entities\.map\(\(e\) => e\.name\)\)/.test(src))
    check('D4. the worthiness gate and the ownership gates are UNCHANGED',
      /const w = evaluateArticleWorthiness\(\{ primaryKeyword, title: t\.title/.test(src) &&
      /if \(ownedByExistingEntity\(guard, primaryKeyword\)\)/.test(src))
    const opp = stripComments(read('lib/content/recommendations/opportunity.ts'))
    check('D5. nothing in opportunity.ts was touched by this change',
      /return fail\('source_only_entity_expansion', 0, cannib\)/.test(opp))
    const kr = stripComments(read('lib/content/recommendations/keyword-research.ts'))
    check('D6. the proportional vocabulary rule is left exactly as it was',
      /return matched >= 2 && matched \/ total > 0\.5/.test(kr))
  }

  // ── E) END TO END, the real engine ─────────────────────────────────────────
  console.log('\nE) end to end — the real engine over be-cln\'s own pages')
  {
    // E.a — the model answers with the defect Oren saw: a private-home angle.
    const homeReply = (b: { subject: string }) => ({
      title: `שירותי ניקיון בתים ודירות ל${b.subject}: מה חשוב לדעת`,
      primaryKeyword: `ניקיון בתים ${b.subject}`, secondaryKeywords: ['x'], intent: 'informational',
    })
    const guarded = await engineRun('run-home-guarded', PAGES, homeReply)
    const gr = rejectedTotals(guarded.diagnostics)
    check('E1. not one private-home topic is accepted',
      guarded.suggestions.every((s) => !serviceObjectsNamed(`${s.primaryKeyword} ${s.title}`).has('home')),
      JSON.stringify(guarded.suggestions.map((s) => s.primaryKeyword)))
    check('E2. and the gate is the reason, by name',
      (gr['other_service_object'] ?? 0) > 0, JSON.stringify(gr))

    // E.b — THE FLOOR, same run, same model answers, a site whose pages name no kind
    // of place: the gate is off and nothing is rejected for the object.
    const thin = await engineRun('run-home-thin', THIN_PAGES, homeReply)
    const tr = rejectedTotals(thin.diagnostics)
    check('E3. on a thin site the gate rejects NOTHING', (tr['other_service_object'] ?? 0) === 0, JSON.stringify(tr))
    check('E4. and that site still produces topics, so the floor is not a silent block',
      thin.suggestions.length > 0, `accepted=${thin.suggestions.length}`)

    // E.c — the site's OWN customers still come through on the guarded project, so the
    // gate costs nothing where the topic is legitimate.
    const FRAMES: readonly (readonly [string, string])[] = [
      ['מה לבדוק בחוזה', 'לפני שחותמים'],
      ['תקנים ורגולציה ב', ''],
      ['ציוד וחומרים ל', ''],
      ['רשימת בדיקה ל', ''],
      ['הכנת המקום לפני', ''],
    ]
    const angle = await engineRun('run-angle', PAGES, (b, i) => {
      const [head, tail] = FRAMES[i % FRAMES.length] as readonly [string, string]
      const kw = `${head} ${b.subject}`.replace(/\s+/g, ' ').trim()
      return { title: `${kw} ${tail}`.trim(), primaryKeyword: kw, secondaryKeywords: ['x'], intent: 'informational' }
    })
    const ar = rejectedTotals(angle.diagnostics)
    check('E5. an information angle about the site\'s OWN customers still yields topics',
      angle.suggestions.length > 0, `accepted=${angle.suggestions.length}`)
    check('E6. and the object gate rejected none of them',
      (ar['other_service_object'] ?? 0) === 0, JSON.stringify(ar))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

void main()
export {}
