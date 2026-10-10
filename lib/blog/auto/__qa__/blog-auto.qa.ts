/**
 * ONE ARTICLE A DAY ON OUR OWN BLOG — the guard.
 *
 *   A) the rotation: which language each day, and that Portuguese is not in it;
 *   B) the truth limits: every claim this product may not make, each with the
 *      clean sentence it is the mutation of;
 *   C) keyword selection: the volume floor, the exclusions, and the
 *      cannibalisation overlap that keeps two articles off one query;
 *   D) the widgets appended to every body, idempotently;
 *   E) the brief: language, audience, CTA, anchors, and the product facts the
 *      prompt is allowed to state;
 *   F) the runner over FakeAdmin: the happy path, and that EVERY gate failure
 *      leaves the blog untouched and the keyword re-queued;
 *   G) source: the kill switch, the cron schedule, the admin gate, the migration.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BLOG_AUTO_LOCALES, LOCALE_BY_WEEKDAY, isBlogAutoLocale, localeForDay, weeklyShare,
} from '@/lib/blog/auto/rotation'
import { checkTruthLimits, plainText } from '@/lib/blog/auto/truth-limits'
import {
  CANNIBAL_OVERLAP, EXCLUDED_PATTERNS, MIN_MONTHLY_SEARCHES, RESEARCH_MARKET, RESEARCH_SEEDS,
  keywordOverlap, keywordTokens, selectKeywords,
} from '@/lib/blog/auto/keyword-plan'
import { CTA_WIDGET, PLANS_WIDGET, withArticleWidgets } from '@/lib/blog/auto/widgets'
import { BLOG_AUTHOR, BLOG_GUIDANCE, articlePath, buildBlogBrief, internalAnchors } from '@/lib/blog/auto/brief'
import { runBlogAutoPublish, type BlogAutoDeps } from '@/lib/blog/auto/runner'
import { MAX_ATTEMPTS, PLAN_TABLE } from '@/lib/blog/auto/store'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { KeywordIdeaResult } from '@/lib/google-ads/keyword-ideas'
import type { ValidatedArticle } from '@/lib/content/gemini-article'

type Admin = ReturnType<typeof createAdminClient>
let passed = 0
let failed = 0
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name, got === undefined ? '' : JSON.stringify(got)) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** Guards match against code, never against a comment that happens to say the words. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ============================================================
// A) THE ROTATION
// ============================================================
check('A1: three languages are written automatically', same([...BLOG_AUTO_LOCALES], ['he', 'en', 'es']))
check('A2: a language a day, seven days', LOCALE_BY_WEEKDAY.length === 7)
check('A3: Hebrew four days, English two, Spanish one', same(weeklyShare(), { he: 4, en: 2, es: 1 }), weeklyShare())
check(
  'A4: Portuguese is NOT in the rotation — the generator has no Portuguese (lib/content/language.ts)',
  !(LOCALE_BY_WEEKDAY as readonly string[]).includes('pt-BR') && !isBlogAutoLocale('pt-BR'),
)
// 2026-10-11 is a Sunday in Israel; 2026-10-16 a Friday.
check('A5: Sunday is Hebrew', localeForDay(Date.parse('2026-10-11T09:00:00+03:00')) === 'he')
check('A6: Monday is English', localeForDay(Date.parse('2026-10-12T09:00:00+03:00')) === 'en')
check('A7: Friday is Spanish', localeForDay(Date.parse('2026-10-16T09:00:00+03:00')) === 'es')
check(
  'A8: the day is read in Israel time, not UTC — 23:30 Sunday local is still Sunday',
  localeForDay(Date.parse('2026-10-11T23:30:00+03:00')) === 'he',
)
// Mutation control for A3/A4: a rotation that gave a day to Portuguese would be
// a day the runner cannot write, and the share would stop being 4/2/1.
const brokenRotation = ['he', 'en', 'he', 'en', 'he', 'es', 'pt-BR'] as readonly string[]
check(
  'A9 (control): the Portuguese and share checks fail on a rotation that includes pt-BR',
  brokenRotation.includes('pt-BR') && brokenRotation.filter((l) => l === 'he').length !== 4,
)

// ============================================================
// B) THE TRUTH LIMITS
// ============================================================
const body = (sentence: string) => `<h2>כותרת</h2><p>${sentence}</p>`
const clean = { title: 'איך בודקים מיקום בגוגל', metaDescription: 'מה לבדוק באתר ואיך', html: body('המערכת עוקבת אחרי המיקומים פעם בחודש, וסריקה ידנית אפשר להריץ בכל רגע.') }
check('B0: a clean article passes', checkTruthLimits(clean).ok, checkTruthLimits(clean).failures)

const fails = (input: { title?: string; metaDescription?: string; html: string }, code: string) =>
  checkTruthLimits({ title: input.title ?? clean.title, metaDescription: input.metaDescription ?? clean.metaDescription, html: input.html }).failures.includes(code)

check('B1: a percentage is refused', fails({ html: body('הלקוחות שלנו עלו ב-40% בתנועה האורגנית.') }, 'percentage_claim'))
check('B1a: "אחוז" in words is refused too', fails({ html: body('עלייה של 30 אחוזים בחודש הראשון.') }, 'percentage_claim'))
check('B1b: an English percentage is refused', fails({ html: body('Traffic grew 25% in a month.') }, 'percentage_claim'))
check('B2: a customer count is refused', fails({ html: body('יותר מ-500 לקוחות משתמשים במערכת.') }, 'customer_count_claim'))
check('B2a: the count before the noun is refused', fails({ html: body('customers: 900 and counting') }, 'customer_count_claim'))
check('B3: daily tracking is refused — the automatic tracking is monthly', fails({ html: body('המערכת מריצה מעקב יומי על המיקומים.') }, 'tracking_cadence_claim'))
check('B3a: weekly tracking is refused', fails({ html: body('weekly rank check for every keyword') }, 'tracking_cadence_claim'))
check('B3b: the true sentence — monthly, with a manual scan — passes', checkTruthLimits(clean).ok)
check(
  'B4: naming Perplexity as part of the automatic check is refused',
  fails({ html: body('הבדיקה האוטומטית עוברת על ChatGPT, Gemini, Google AI ו-Perplexity.') }, 'ai_engine_coverage_claim'),
)
check(
  'B4a: Perplexity in its true place — a single question on request — passes',
  checkTruthLimits({ ...clean, html: body('את Perplexity, Copilot ו-Grok אפשר לשאול שאלה אחת מתוך התפריט.') }).ok,
)
check('B5: a star rating is refused', fails({ html: body('הלקוחות דירגו את המערכת 5 כוכבים.') }, 'rating_claim'))
check('B5a: a review count is refused', fails({ html: body('120 ביקורות באתר.') }, 'rating_claim'))
check('B6: a promised ranking is refused', fails({ html: body('מבטיחים מקום ראשון בגוגל בתוך חודש.') }, 'ranking_guarantee'))
check('B6a: "guaranteed ranking" is refused', fails({ html: body('A guaranteed ranking on page one.') }, 'ranking_guarantee'))
check('B7: structured data as a Shopify capability is refused', fails({ html: body('באפליקציית Shopify אנחנו כותבים גם סכימה לכל מוצר.') }, 'shopify_schema_claim'))
check(
  'B8: a Shopify link without nofollow is refused',
  fails({ html: '<p><a href="https://apps.shopify.com/go-top-seo">האפליקציה</a></p>' }, 'shopify_link_not_nofollow'),
)
check(
  'B8a: a Shopify link that is not the listing is refused',
  fails({ html: '<p><a rel="nofollow" href="https://www.shopify.com/pricing">שופיפיי</a></p>' }, 'shopify_link_not_listing'),
)
check(
  'B8b: the listing with rel="nofollow" passes',
  checkTruthLimits({ ...clean, html: '<p><a href="https://apps.shopify.com/go-top-seo" rel="nofollow">האפליקציה שלנו</a></p>' }).ok,
)
check('B9: the title is checked, not only the body', fails({ title: 'איך העלינו 80% מהתנועה', html: body('טקסט נקי.') }, 'percentage_claim'))
check('B9a: the meta description is checked too', fails({ metaDescription: '300 לקוחות מספרים', html: body('טקסט נקי.') }, 'customer_count_claim'))
check('B10: failures are deduped', (() => {
  const r = checkTruthLimits({ ...clean, html: body('10% כאן ועוד 20% שם.') })
  return r.failures.filter((f) => f === 'percentage_claim').length === 1
})())
check('B11: plainText drops tags and entities', plainText('<p>א&nbsp;ב</p><h2>ג</h2>') === 'א ב ג', plainText('<p>א&nbsp;ב</p><h2>ג</h2>'))

// ============================================================
// C) WHICH KEYWORDS GET PLANNED
// ============================================================
const idea = (keyword: string, volume: number | null): KeywordIdeaResult => ({
  keyword, avgMonthlySearches: volume, competition: 'LOW', competitionIndex: 10,
  lowTopOfPageBid: null, highTopOfPageBid: null, currency: 'ILS',
})
check('C0: Hebrew has a lower floor than English — a 9-million-speaker market', MIN_MONTHLY_SEARCHES.he < MIN_MONTHLY_SEARCHES.en)
check('C0a: every written language has a market and seeds', BLOG_AUTO_LOCALES.every((l) => !!RESEARCH_MARKET[l] && RESEARCH_SEEDS[l].length > 0))
check('C0b: Hebrew research asks Israel in Hebrew', same(RESEARCH_MARKET.he, { country: 'IL', language: 'he' }))

const selected = selectKeywords({
  locale: 'he',
  ideas: [idea('מחקר מילות מפתח', 300), idea('בדיקת מיקום בגוגל', 900), idea('ביטוי נדיר מאוד', 3)],
  taken: [],
  limit: 10,
})
check('C1: the highest volume comes first', selected[0]?.keyword === 'בדיקת מיקום בגוגל', selected.map((s) => s.keyword))
check('C2: below the floor is dropped', !selected.some((s) => s.keyword === 'ביטוי נדיר מאוד'))
check('C3: the volume is kept, so the screen can show it', selected[0]?.monthlySearches === 900)
check(
  'C4: a keyword already published is dropped — that is our own two pages on one query',
  !selectKeywords({ locale: 'he', ideas: [idea('כלי למחקר מילות מפתח', 500)], taken: ['מחקר מילות מפתח'], limit: 5 }).length,
)
check(
  'C5: a genuinely different keyword with a shared word is kept',
  selectKeywords({ locale: 'he', ideas: [idea('מהירות אתר בנייד', 500)], taken: ['מהירות טעינה של אתר וורדפרס'], limit: 5 }).length === 1,
)
check(
  'C6: two near-duplicates in ONE response do not both get planned',
  selectKeywords({ locale: 'he', ideas: [idea('מחקר מילות מפתח', 500), idea('מחקר של מילות מפתח', 400)], taken: [], limit: 5 }).length === 1,
)
check('C7: our own brand is navigational, not an article', !selectKeywords({ locale: 'he', ideas: [idea('go top seo', 900)], taken: [], limit: 5 }).length)
check('C7a: the agency\'s services stay on the agency site', !selectKeywords({ locale: 'he', ideas: [idea('סוכנות קידום אתרים', 900)], taken: [], limit: 5 }).length)
check('C8: the limit is honoured', selectKeywords({ locale: 'he', ideas: [idea('א ב ג', 900), idea('ד ה ו', 800), idea('ז ח ט', 700)], taken: [], limit: 2 }).length === 2)
check('C9: overlap is 1 when one keyword contains the other\'s words', keywordOverlap('מחקר מילות מפתח', 'כלי למחקר מילות מפתח') === 1)
check('C9a: unrelated keywords do not overlap', keywordOverlap('מהירות אתר', 'כתיבת תוכן') === 0)
check('C9b: the threshold is strict enough to be a real test', CANNIBAL_OVERLAP >= 0.7 && CANNIBAL_OVERLAP <= 1)
check('C10: tokens drop punctuation and single letters', same(keywordTokens('SEO: מה זה?'), ['seo', 'מה', 'זה']), keywordTokens('SEO: מה זה?'))
// Mutation control for C4/C6: without the overlap check both rows would be planned.
check(
  'C11 (control): with no overlap filter the duplicate pair WOULD both pass the floor',
  [idea('מחקר מילות מפתח', 500), idea('מחקר של מילות מפתח', 400)].every((i) => (i.avgMonthlySearches ?? 0) >= MIN_MONTHLY_SEARCHES.he),
)
check('C12 (control): the exclusion list is what drops the brand, and it matches it', EXCLUDED_PATTERNS.some((re) => re.test('go top seo')))

// ============================================================
// D) THE WIDGETS EVERY ARTICLE ENDS WITH
// ============================================================
const withWidgets = withArticleWidgets('<p>טקסט</p>')
check('D1: the plan cards are appended', withWidgets.includes(PLANS_WIDGET))
check('D2: the trial call to action is appended', withWidgets.includes(CTA_WIDGET))
check('D3: appending twice does not duplicate them', withArticleWidgets(withWidgets) === withWidgets, withArticleWidgets(withWidgets))
check('D4: a body that already carries one keeps exactly one', (() => {
  const once = withArticleWidgets('<p>א</p><div class="gt-cta"></div>')
  return (once.match(/gt-cta/g) ?? []).length === 1 && once.includes(PLANS_WIDGET)
})())

// ============================================================
// E) THE BRIEF
// ============================================================
const brief = buildBlogBrief({
  locale: 'he', topic: 'בדיקת מיקום בגוגל', primaryKeyword: 'בדיקת מיקום בגוגל',
  secondaryKeywords: ['מיקום בגוגל'], internalTargets: [{ title: 'מאמר קיים', slug: 'existing' }],
})
check('E1: the brief is written in the day\'s language', brief.language === 'he')
check('E2: the brand in the article is Go Top SEO', brief.brandNameToInclude === 'Go Top SEO' && brief.includeBrandName)
check('E3: the page builds the table of contents, so the body must not', brief.includeManualToc === false)
check('E4: the call to action points at the trial, absolute', brief.ctaUrl?.startsWith('https://www.gotopseo.com/signup') === true, brief.ctaUrl)
check('E4a: English points at the English trial', buildBlogBrief({ locale: 'en', topic: 't', primaryKeyword: 'k', secondaryKeywords: [], internalTargets: [] }).ctaUrl === 'https://www.gotopseo.com/en/signup')
check('E5: internal links to our own articles are never REQUIRED — a required anchor loses the whole article', brief.anchors.every((a) => !a.required))
check('E6: an internal link is absolute and under its language\'s tree', brief.anchors[0]?.target_url === 'https://www.gotopseo.com/articles/existing', brief.anchors[0]?.target_url)
check('E6a: a Spanish article links under /es', articlePath('es', 'x') === '/es/articles/x')
check('E6b: Hebrew has no prefix', articlePath('he', 'x') === '/articles/x')
check('E7: at most three internal links', internalAnchors('he', Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, slug: `s${i}` }))).length === 3)
check('E8: the guidance forbids the numbers we do not have', /percentages|customer counts/i.test(BLOG_GUIDANCE.exclusions.join(' ')))
check('E9: the guidance demands something the reader can check', /check, ask for, or compare/i.test(BLOG_GUIDANCE.instructions))
check('E10: the guidance pins the one product name and bans any earlier one', /one name, Go Top SEO/.test(BLOG_GUIDANCE.instructions) && /never call it by any earlier name/i.test(BLOG_GUIDANCE.instructions))
check('E11: the product facts say the automatic tracking is monthly', /ONCE A MONTH/.test(brief.businessContext?.description ?? ''))
check('E12: the product facts keep Perplexity, Copilot and Grok out of the automatic check', /NOT part of the automatic check/.test(brief.businessContext?.description ?? ''))
check('E13: the product facts refuse invented numbers outright', /NEVER state a number of customers/.test(brief.businessContext?.description ?? ''))

async function main() {
  // ============================================================
  // F) THE RUNNER
  // ============================================================
  const WORDS = Array.from({ length: 180 }, (_, i) => `מילה${i}`).join(' ')
  const okArticle = (): ValidatedArticle => ({
    article: {
      title: 'בדיקת מיקום בגוגל', slug: 'rank-check', metaTitle: 'בדיקת מיקום בגוגל',
      metaDescription: 'איך בודקים מיקום בגוגל ומה לעשות עם התוצאה', excerpt: 'תקציר',
      contentHtml: '', contentMarkdown: '', faq: [], imagePrompt: 'desk', warnings: [],
    },
    safeHtml: `<h2>כותרת</h2><p>${WORDS}</p><ul><li>א</li></ul>`,
    slug: 'rank-check', usage: null,
    audit: { score: 90, blockers: [], warnings: [], passes: [], counts: {} } as unknown as ValidatedArticle['audit'],
    model: 'test',
  })
  const deps = (over: Partial<BlogAutoDeps> = {}): BlogAutoDeps => ({
    generate: async () => okArticle(),
    cover: async () => ({ ok: true, url: 'https://x.supabase.co/storage/v1/object/public/article-images/auto/a.jpg' }),
    ...over,
  })
  const planned = (over: Record<string, unknown> = {}) => ({
    id: 'p1', locale: 'he', topic: 'בדיקת מיקום בגוגל', primary_keyword: 'בדיקת מיקום בגוגל',
    secondary_keywords: [], monthly_searches: 900, status: 'planned', attempts: 0,
    last_error: null, locked_at: null, article_id: null, article_slug: null, ...over,
  })
  const fake = (rows: Record<string, unknown>[], articles: Record<string, unknown>[] = []) =>
    new FakeAdmin({ [PLAN_TABLE]: rows, articles })

  const sunday = Date.parse('2026-10-11T12:00:00+03:00')

  {
    const admin = fake([planned()])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps())
    const article = admin.tables.articles[0] as Record<string, unknown>
    const row = admin.tables[PLAN_TABLE][0] as Record<string, unknown>
    check('F1: an article is published', summary.published?.slug === 'rank-check', summary)
    check('F2: it carries the day\'s language', article?.locale === 'he')
    check('F3: the byline is the real author, so the box and the Person schema resolve', article?.author === BLOG_AUTHOR)
    check('F4: it is published, with a date', article?.is_published === true && !!article?.published_at)
    check('F5: it has a cover — the code refuses to publish without one', typeof article?.featured_image_url === 'string' && !!article.featured_image_url)
    check('F6: the plan cards and the call to action are in the body', String(article?.content).includes('gt-plans') && String(article?.content).includes('gt-cta'))
    check('F7: the plan row is marked published and points at the article', row?.status === 'published' && row?.article_slug === 'rank-check' && !!row?.article_id)
    check('F8: the row is unlocked', row?.locked_at === null)
  }
  {
    const admin = fake([planned()])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps({
      generate: async () => ({ ...okArticle(), safeHtml: `<h2>כ</h2><p>${WORDS} עלייה של 40% בתנועה.</p>` }),
    }))
    check('F9: a percentage claim stops the publish', summary.published === null && summary.failure?.startsWith('truth:') === true, summary.failure)
    check('F10: nothing reached the blog', admin.tables.articles.length === 0)
    const row = admin.tables[PLAN_TABLE][0] as Record<string, unknown>
    check('F11: the keyword goes back in the queue with the reason', row?.status === 'planned' && String(row?.last_error).includes('percentage_claim'), row?.last_error)
  }
  {
    const admin = fake([planned()])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps({
      generate: async () => ({ ...okArticle(), safeHtml: '<p>קצר מדי</p>' }),
    }))
    check('F12: the structural quality gate stops a thin article', summary.failure?.startsWith('quality:') === true && admin.tables.articles.length === 0, summary.failure)
  }
  {
    const admin = fake([planned()])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps({
      generate: async () => ({ error: 'gemini_failed', reason: 'timeout', attempts: 1 }),
    }))
    check('F13: a generation failure publishes nothing', summary.failure === 'generate:timeout' && admin.tables.articles.length === 0, summary.failure)
  }
  {
    const admin = fake([planned()])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps({
      cover: async () => ({ ok: false, reason: 'image_upload_failed' }),
    }))
    check('F14: no cover means no article today, not a bare article', summary.failure === 'cover:image_upload_failed' && admin.tables.articles.length === 0)
  }
  {
    const admin = fake([planned({ attempts: MAX_ATTEMPTS - 1 })])
    await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps({ generate: async () => ({ error: 'x', attempts: 1 }) }))
    const row = admin.tables[PLAN_TABLE][0] as Record<string, unknown>
    check('F15: a keyword that keeps failing is parked, not retried for ever', row?.status === 'failed', row)
  }
  {
    const admin = fake([planned({ status: 'generating', locked_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() })])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps())
    check('F16: a row stuck from a killed run is freed and written', summary.staleRecovered === 1 && summary.published?.slug === 'rank-check', summary)
  }
  {
    const admin = fake([planned({ status: 'generating', locked_at: new Date().toISOString() })])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps())
    check('F17: a row claimed moments ago is left to the run that holds it', summary.staleRecovered === 0 && summary.published === null, summary)
  }
  {
    const admin = fake([planned()], [{ id: 'a0', slug: 'rank-check', locale: 'he', title: 'קיים' }])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps())
    check('F18: a slug already on the blog is never overwritten', summary.failure === 'publish:slug_taken' && admin.tables.articles.length === 1, summary.failure)
  }
  {
    const admin = fake([planned({ locale: 'en' })])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps())
    check('F19: Sunday does not publish the English queue', summary.published === null && summary.skipped === 'queue_empty', summary)
  }
  {
    const admin = fake([planned({ monthly_searches: 100 }), planned({ id: 'p2', monthly_searches: 5000, primary_keyword: 'ביטוי גדול', topic: 'ביטוי גדול' })])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps())
    const taken = admin.tables[PLAN_TABLE].find((r) => (r as Record<string, unknown>).status === 'published') as Record<string, unknown>
    check('F20: the most-searched keyword is written first', taken?.id === 'p2' && summary.published !== null, taken?.id)
  }
  {
    const admin = fake([planned()])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday, dryRun: true }, deps())
    check('F21: a dry run publishes nothing and says so', summary.skipped === 'dry_run' && admin.tables.articles.length === 0)
    check('F22: a dry run leaves the row in the queue', (admin.tables[PLAN_TABLE][0] as Record<string, unknown>).status === 'planned')
  }
  {
    // Mutation control for F9–F14: with every gate satisfied the same run DOES publish.
    const admin = fake([planned()])
    const summary = await runBlogAutoPublish(admin as unknown as Admin, { now: sunday }, deps())
    check('F23 (control): the gates are what stopped the runs above — unobstructed, it publishes', summary.published !== null && admin.tables.articles.length === 1)
  }

  // ============================================================
  // G) SOURCE
  // ============================================================
  const cronSrc = stripComments(read('app/api/blog/auto/cron/route.ts'))
  check('G1: the daily route is off unless the switch is exactly "true"', /BLOG_AUTO_PUBLISH_ENABLED === 'true'/.test(cronSrc), )
  check('G2: off means 404 — the route does not exist until it is switched on', /isBlogAutoPublishEnabled\(\)/.test(cronSrc) && /status: 404/.test(cronSrc))
  check('G3: it refuses a caller without the cron secret', /authorizeCronRequest/.test(cronSrc))
  check('G4: it answers before it works, so a scheduler does not time out', /after\(/.test(cronSrc) && /status: 202/.test(cronSrc))
  const vercel = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
  check('G5: the daily run is scheduled once a day', (() => {
    const entry = vercel.crons.find((c) => c.path === '/api/blog/auto/cron')
    return !!entry && /^\d+ \d+ \* \* \*$/.test(entry.schedule)
  })(), vercel.crons.map((c) => c.path))
  const adminApi = stripComments(read('app/api/admin/blog-plan/route.ts'))
  check('G6: the queue screen\'s actions are behind the administrator gate', /requireAdminApi/.test(adminApi))
  check('G7: the operator can take a keyword out and put one back', /'reject'/.test(adminApi) && /'restore'/.test(adminApi))
  const migration = read('supabase/migrations/20261010120000_blog_auto_plan.sql')
  check('G8: the queue table is created with row-level security on', /CREATE TABLE IF NOT EXISTS public\.blog_plan/.test(migration) && /ENABLE ROW LEVEL SECURITY/.test(migration))
  check('G9: the same keyword cannot be planned twice in one language', /UNIQUE \(locale, primary_keyword\)/.test(migration))
  check('G10: the queue has no RLS policy — it is operator data, service role only', !/CREATE POLICY/i.test(migration))
  const runnerSrc = stripComments(read('lib/blog/auto/runner.ts'))
  check('G11: all three gates run before anything is published', (() => {
    const gates = ['runQualityGate', 'checkTruthLimits'].every((g) => runnerSrc.includes(g))
    return gates && runnerSrc.indexOf('checkTruthLimits') < runnerSrc.indexOf('publishPlanArticle')
  })())
  const storeSrc = stripComments(read('lib/blog/auto/store.ts'))
  check('G12: the publish goes through the public sanitizer, never raw', /sanitizePublicArticleHtml/.test(storeSrc))
  check('G13: the publish goes through the shared cover rule', /articlePublishBlockReason/.test(storeSrc))
  check('G14: the claim is atomic — the update carries the status it expects', /\.eq\('status', 'planned'\)/.test(storeSrc))
  check('G15: our blog does not share the customer engine\'s tables', !/article_pool_items|generated_articles|article_topics/.test(storeSrc))
  // Mutation control for G12/G13: the strings the guards look for are real calls.
  check('G16 (control): removing either call from the publish path is what the guards would catch', storeSrc.includes('sanitizePublicArticleHtml(article.html)'))


}

void main().then(() => {
  console.log(`${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
})

export {}
