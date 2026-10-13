/**
 * ONE ARTICLE A DAY ON OUR OWN BLOG — the guard.
 *
 *   A) the languages: every one of them every day, and not Portuguese;
 *   B) the truth limits: every claim this product may not make, each with the
 *      clean sentence it is the mutation of;
 *   C) keyword selection: the volume floor, the exclusions, and the
 *      cannibalisation overlap that keeps two articles off one query;
 *   D) the widgets appended to every body, idempotently;
 *   E) the brief: language, audience, CTA, anchors, and the product facts the
 *      prompt is allowed to state;
 *   F) the runner over FakeAdmin: the happy path, and that EVERY gate failure
 *      leaves the blog untouched and the keyword re-queued;
 *   G) source: the kill switch, the cron schedule, the admin gate, the migration;
 *   H) the body's links: a bare URL made clickable, the product's first mention
 *      linked to the trial, our other articles offered at the end, and the gate
 *      that refuses an article which never named the system.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BLOG_AUTO_LOCALES, isBlogAutoLocale, localesForDay, weeklyShare,
} from '@/lib/blog/auto/rotation'
import { checkTruthLimits, plainText } from '@/lib/blog/auto/truth-limits'
import { placeholderContext, runQualityGate } from '@/lib/content/automation/quality-gate'
import {
  CANNIBAL_OVERLAP, EXCLUDED_PATTERNS, MIN_MONTHLY_SEARCHES, RESEARCH_MARKET, RESEARCH_SEEDS,
  keywordOverlap, keywordTokens, selectKeywords,
} from '@/lib/blog/auto/keyword-plan'
import { CTA_WIDGET, PLANS_WIDGET, withArticleWidgets } from '@/lib/blog/auto/widgets'
import { BLOG_AUTHOR, BLOG_GUIDANCE, articlePath, buildBlogBrief, internalAnchors } from '@/lib/blog/auto/brief'
import {
  BRAND, RELATED_CLASS, checkBodyLinks, hasOwnLink, linkBrandMention, linkifyBareUrls,
  relatedReading, trialHref, withBodyLinks,
} from '@/lib/blog/auto/body-links'
import {
  ALL_LOCALES_BUDGET_MS, TOPUP_FLOOR, runBlogAutoPublish, runBlogAutoPublishAllLocales,
  type BlogAutoDeps,
} from '@/lib/blog/auto/runner'
import { MAX_ATTEMPTS, PLAN_TABLE, STALE_LOCK_MS } from '@/lib/blog/auto/store'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import {
  isInWindow, startOfUtcDay, nextLocaleToWrite, runBlogDailyWindow, startIsolatedBlogWindow,
} from '@/lib/blog/auto/daily-window'
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
// A) THE LANGUAGES
// ============================================================
check('A1: three languages are written automatically', same([...BLOG_AUTO_LOCALES], ['he', 'en', 'es']))
check('A2: every language is due every day — there is no weekday rotation left',
  same([...localesForDay()], [...BLOG_AUTO_LOCALES]))
check('A3: that is seven articles a week in each language', same(weeklyShare(), { he: 7, en: 7, es: 7 }), weeklyShare())
check(
  'A4: Portuguese is NOT among them — the generator has no Portuguese (lib/content/language.ts)',
  !(BLOG_AUTO_LOCALES as readonly string[]).includes('pt-BR') && !isBlogAutoLocale('pt-BR'),
)
check('A5: the queue is refilled a week ahead, not three days', TOPUP_FLOOR >= 7)
check('A6: an unknown language is not accepted as one', !isBlogAutoLocale('fr') && !isBlogAutoLocale('') && !isBlogAutoLocale(null))
// Mutation control for A2/A3: the rotation this replaced gave each language only
// some of the week, and Portuguese a day it could not write.
const oldRotation = ['he', 'en', 'he', 'en', 'he', 'es', 'pt-BR'] as readonly string[]
check(
  'A7 (control): the old weekday rotation fails both checks',
  oldRotation.filter((l) => l === 'en').length !== 7 && oldRotation.includes('pt-BR'),
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
    safeHtml: `<h2>כותרת</h2><p>${WORDS}</p><p>כך זה עובד ב-Go Top SEO.</p><ul><li>א</li></ul>`,
    slug: 'rank-check', usage: null,
    audit: { score: 90, blockers: [], warnings: [], passes: [], counts: {} } as unknown as ValidatedArticle['audit'],
    model: 'test',
  })
  /** The same article under a slug of its own, so three languages do not collide. */
  const perLocale = (language: string): ValidatedArticle => {
    const base = okArticle()
    return { ...base, slug: `rank-check-${language}`, article: { ...base.article, slug: `rank-check-${language}` } }
  }
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

  {
    // Every language in one call: three runs, three gates, three summaries.
    const admin = fake([
      planned({ id: 'ph', locale: 'he' }),
      planned({ id: 'pe', locale: 'en', topic: 'rank check', primary_keyword: 'rank check' }),
      planned({ id: 'ps', locale: 'es', topic: 'posicion', primary_keyword: 'posicion' }),
    ])
    const summaries = await runBlogAutoPublishAllLocales(admin as unknown as Admin, {}, deps({
      generate: async (brief) => perLocale(brief.language),
    }))
    check('F20: a call with no language covers every language', same(summaries.map((s) => s.locale), [...BLOG_AUTO_LOCALES]), summaries.map((s) => s.locale))
    check('F21: each language published its own article', admin.tables.articles.length === BLOG_AUTO_LOCALES.length, admin.tables.articles.length)
    check('F22: the budget leaves room for the first language whatever it is', ALL_LOCALES_BUDGET_MS > 0)
  }
  {
    // One language's failure must not cost another its article.
    const admin = fake([
      planned({ id: 'ph', locale: 'he' }),
      planned({ id: 'pe', locale: 'en', topic: 'rank check', primary_keyword: 'rank check' }),
      planned({ id: 'ps', locale: 'es', topic: 'posicion', primary_keyword: 'posicion' }),
    ])
    let call = 0
    const summaries = await runBlogAutoPublishAllLocales(admin as unknown as Admin, {}, deps({
      generate: async (brief) => {
        call += 1
        return call === 1 ? { error: 'gemini_failed', reason: 'timeout', attempts: 1 } : perLocale(brief.language)
      },
    }))
    check('F23: the first language failed', summaries[0].failure === 'generate:timeout', summaries[0].failure)
    check('F24: the other two still published', admin.tables.articles.length === 2, admin.tables.articles.length)
  }
  {
    // A spent budget skips the languages left rather than being killed mid-publish.
    const admin = fake([
      planned({ id: 'ph', locale: 'he' }),
      planned({ id: 'pe', locale: 'en', topic: 'rank check', primary_keyword: 'rank check' }),
      planned({ id: 'ps', locale: 'es', topic: 'posicion', primary_keyword: 'posicion' }),
    ])
    const summaries = await runBlogAutoPublishAllLocales(admin as unknown as Admin, { budgetMs: 0 }, deps({
      generate: async (brief) => perLocale(brief.language),
    }))
    check('F25: with no time left only the first language runs', admin.tables.articles.length === 1, admin.tables.articles.length)
    check('F26: the rest say why they were skipped', summaries.slice(1).every((s) => s.skipped === 'time_budget'), summaries.map((s) => s.skipped))
  }

  // ============================================================
  // G) SOURCE
  // ============================================================
  // The work lives in the shared handler; the two routes only pass it a language.
  const cronSrc = stripComments(read('lib/blog/auto/cron-run.ts'))
  const manualRouteSrc = stripComments(read('app/api/blog/auto/cron/route.ts'))
  const localeRouteSrc = stripComments(read('app/api/blog/auto/cron/[locale]/route.ts'))
  check('G1: the daily route is off unless the switch is exactly "true"', /BLOG_AUTO_PUBLISH_ENABLED === 'true'/.test(cronSrc), )
  check('G2: off means 404 — the route does not exist until it is switched on', /isBlogAutoPublishEnabled\(\)/.test(cronSrc) && /status: 404/.test(cronSrc))
  check('G3: it refuses a caller without the cron secret', /authorizeCronRequest/.test(cronSrc))
  check('G4: it answers before it works, so a scheduler does not time out', /after\(/.test(cronSrc) && /status: 202/.test(cronSrc))
  const vercel = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
  const blogCrons = vercel.crons.filter((c) => c.path.startsWith('/api/blog/auto/cron'))
  // 12-13 Oct 2026: Vercel's scheduler delivered two of six daily blog jobs over
  // two mornings — first three paths that differed only by ?locale= (one ran),
  // then three distinct paths (only /en ran, ten minutes late, while the 05:00
  // GSC job left no invocation either). The blog now rides the fifteen-minute
  // content cron instead, so it must have NO schedule of its own: a schedule
  // left behind would write a second article the same morning.
  check('G5: the blog has no Vercel cron of its own', blogCrons.length === 0, blogCrons.map((c) => c.path))
  check('G5b: the content cron that does fire is still scheduled',
    vercel.crons.some((c) => c.path === '/api/content/automation/cron'))
  const windowSrc = stripComments(read('lib/blog/auto/daily-window.ts'))
  const automationRouteSrc = stripComments(read('app/api/content/automation/cron/route.ts'))
  check('G5c: the content cron starts the blog article, isolated, and waits for it',
    /startIsolatedBlogWindow\(/.test(automationRouteSrc)
    && /runBlogDailyWindow\(createAdminClient\(\), \{ env: process\.env, deadlineAt \}\)/.test(automationRouteSrc)
    && /await blogWindow/.test(automationRouteSrc))
  check('G5d: the morning run writes one language per invocation',
    /runBlogAutoPublish\(admin, \{ locale \}\)/.test(windowSrc) && !/runBlogAutoPublishAllLocales/.test(windowSrc))
  check('G5e: it is off unless the switch is on, Production only, and inside its window',
    /isBlogAutoPublishEnabled\(\)/.test(windowSrc)
    && /VERCEL_ENV !== 'production'/.test(windowSrc)
    && /isInWindow\(now\)/.test(windowSrc))
  check('G5f: a language that published today, or is being written now, is left alone',
    /localesPublishedSince/.test(windowSrc) && /isLocaleGenerating/.test(windowSrc))
  check('G5g: the per-language route is kept for a call by hand',
    existsSync(join(process.cwd(), 'app/api/blog/auto/cron/[locale]/route.ts'))
    && /await ctx\.params/.test(localeRouteSrc) && /handleBlogAutoCron\(request, locale\)/.test(localeRouteSrc))
  check('G5h: the manual route still accepts a language in the query string',
    /searchParams\.get\('locale'\)/.test(manualRouteSrc) && /handleBlogAutoCron/.test(manualRouteSrc))
  check('G5i: the handler writes the language it was asked for, and all of them when asked for none', (() => {
    const validated = /isBlogAutoLocale\(asked\)/.test(cronSrc)
    const both = /runBlogAutoPublish\(admin, \{ locale \}\)/.test(cronSrc) && /runBlogAutoPublishAllLocales/.test(cronSrc)
    return validated && both
  })())
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

  // ============================================================
  // I) A GATE FAILURE SAYS WHAT TRIPPED IT
  // ============================================================
  check('I1: the placeholder that stopped an article is reported with its surroundings', (() => {
    const ctx = placeholderContext('<p>הטקסט נמשך וממשיך ואז מופיעה המילה placeholder בתוך משפט שלם</p>')
    return !!ctx && ctx.includes('placeholder')
  })(), placeholderContext('<p>placeholder</p>'))
  check('I2: a clean article reports nothing', placeholderContext('<p>טקסט נקי לגמרי</p>') === null)
  check('I3: the run logs it, because the article itself is thrown away',
    /placeholder_found/.test(runnerSrc) && /placeholderContext\(/.test(runnerSrc))
  check('I4: the brief tells the model a placeholder rejects the whole article',
    /Never write a placeholder of any kind/.test(BLOG_GUIDANCE.instructions)
    && /rejects the whole article/.test(BLOG_GUIDANCE.instructions))
  check('I5 (control): without the context helper the reason is just the gate\u2019s code',
    runQualityGate({ title: 'כותרת', slug: 'a', content_html: `<p>${WORDS} placeholder</p>` }).failures.includes('placeholder_found'))

  // ============================================================
  // H) THE BODY'S LINKS
  // ============================================================
  // The sentence the first automatic article really shipped (11 Oct 2026).
  const bareBody = '<h2>ה</h2><p>תוכלו להירשם דרך הקישור הבא: https://www.gotopseo.com/signup?lang=he.</p>'
  const bareLinked = linkifyBareUrls(bareBody)
  check('H1: a bare address of ours becomes a real link', /<a href="https:\/\/www\.gotopseo\.com\/signup\?lang=he">https:\/\/www\.gotopseo\.com\/signup\?lang=he<\/a>/.test(bareLinked), bareLinked)
  check('H2: the sentence keeps its full stop outside the link', bareLinked.includes('</a>.</p>'), bareLinked)
  check('H3: running it twice changes nothing', linkifyBareUrls(bareLinked) === bareLinked)
  check('H4: an address inside an existing link is left alone', (() => {
    const html = '<p><a href="https://www.gotopseo.com/pricing">https://www.gotopseo.com/pricing</a></p>'
    return linkifyBareUrls(html) === html
  })())
  check('H5: an address in an attribute is not rewritten', (() => {
    const html = '<p><img src="https://x.supabase.co/a.jpg" alt="a"></p>'
    return linkifyBareUrls(html) === html
  })())
  check('H6: a foreign address is marked nofollow and opens in a new tab', (() => {
    const out = linkifyBareUrls('<p>מקור: https://example.com/a</p>')
    return out.includes('rel="nofollow noopener"') && out.includes('target="_blank"')
  })(), linkifyBareUrls('<p>מקור: https://example.com/a</p>'))
  check('H7: our own address stays in the tab', !linkifyBareUrls(bareBody).includes('target="_blank"'))

  const brandBody = `<p>פתיחה ${BRAND} בפסקה הראשונה</p><h2>כ</h2><p>כך ${BRAND} עושה את זה.</p>`
  const branded = linkBrandMention(brandBody, 'he')
  check('H8: the product’s mention becomes a link to the trial', branded.includes(`<a href="${trialHref('he')}">${BRAND}</a>`), branded)
  check('H9: the opening paragraph is left alone — a link there is too early', branded.indexOf('<a href') > branded.indexOf('<h2>'), branded)
  check('H10: only one mention is linked', (branded.match(/<a href/g) ?? []).length === 1)
  check('H11: a body that already links to us is not linked again', (() => {
    const html = `<p>פתיחה</p><h2>כ</h2><p>כך <a href="/pricing">${BRAND}</a> עושה את זה, ${BRAND}.</p>`
    return linkBrandMention(html, 'he') === html
  })())
  check('H12: a mention only inside a heading is not wrapped there', (() => {
    const out = linkBrandMention(`<h2>${BRAND}</h2><p>טקסט</p>`, 'he')
    return !out.includes('<a href')
  })(), linkBrandMention(`<h2>${BRAND}</h2><p>טקסט</p>`, 'he'))
  check('H13: each language links to its own trial page', trialHref('en') !== trialHref('he') && trialHref('es') !== trialHref('en'))

  const targets = [
    { title: 'מאמר א', slug: 'a' }, { title: 'מאמר ב', slug: 'b' },
    { title: 'מאמר ג', slug: 'c' }, { title: 'מאמר ד', slug: 'd' },
  ]
  const withRelated = relatedReading('<p>גוף</p>', 'he', targets)
  check('H14: our other articles are offered at the end', withRelated.includes(`class="${RELATED_CLASS}"`) && withRelated.includes('קראו גם'), withRelated)
  check('H15: at most three of them', (withRelated.match(/<li>/g) ?? []).length === 3)
  check('H16: each one is a link under its own language’s tree', withRelated.includes(`<a href="${articlePath('he', 'a')}">מאמר א</a>`), withRelated)
  check('H17: a target the body already links is not repeated', !relatedReading(`<p><a href="${articlePath('he', 'a')}">מאמר א</a></p>`, 'he', [targets[0]]).includes(RELATED_CLASS))
  check('H18: no other articles yet means no block', relatedReading('<p>גוף</p>', 'he', []) === '<p>גוף</p>')
  check('H19: running it twice adds one block', relatedReading(withRelated, 'he', targets) === withRelated)
  check('H20: the heading is in the article’s own language', relatedReading('<p>x</p>', 'es', targets).includes('Lee también'))

  check('H21: the gate refuses an article that never named the system', (() => {
    const r = checkBodyLinks('<p>טקסט בלי שם המוצר</p>')
    return !r.ok && r.failures.includes('brand_not_mentioned') && r.failures.includes('no_link_to_product')
  })(), checkBodyLinks('<p>טקסט</p>'))
  check('H22: the three passes together satisfy the gate', (() => {
    const out = withBodyLinks(brandBody, { locale: 'he', internalTargets: targets })
    return checkBodyLinks(out).ok && hasOwnLink(out)
  })(), withBodyLinks(brandBody, { locale: 'he', internalTargets: targets }))
  check('H23: a relative link counts as a link into our site, a foreign one does not',
    hasOwnLink('<p><a href="/pricing">x</a></p>') && !hasOwnLink('<p><a href="https://example.com">x</a></p>'))
  check('H24: the runner links the body before it publishes, and gates it', (() => {
    const i = runnerSrc.indexOf('withBodyLinks')
    const g = runnerSrc.indexOf('checkBodyLinks')
    const p = runnerSrc.indexOf('publishPlanArticle(admin')
    return i > 0 && g > i && p > g && /withArticleWidgets\(linked\)/.test(runnerSrc)
  })())
  check('H25: the brief tells the model not to paste a bare address', /Never write a bare web address/.test(BLOG_GUIDANCE.instructions))
  // Mutation controls: break each pass on purpose and show the guard fails.
  check('H26 (control): a body whose bare address was NOT linked fails H1', !/<a href=/.test(bareBody))
  check('H27 (control): linking the first paragraph instead would fail H9', (() => {
    const wrong = brandBody.replace(BRAND, `<a href="${trialHref('he')}">${BRAND}</a>`)
    return wrong.indexOf('<a href') < wrong.indexOf('<h2>')
  })())
  check('H28 (control): an article that names the system but links nowhere fails the gate',
    !checkBodyLinks(`<p>${BRAND} בלי קישור</p>`).ok)

  // ============================================================
  // J) THE MORNING WINDOW ON THE CONTENT CRON
  // ============================================================
  // Vercel's scheduler delivered two of six daily blog jobs over two mornings,
  // so the blog rides the fifteen-minute content cron. What used to be the
  // calendar's job — one article a language a day — is now these two reads.
  {
    const inWindow = Date.parse('2026-10-14T04:05:00Z')
    const env = { VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv
    const before = process.env.BLOG_AUTO_PUBLISH_ENABLED
    process.env.BLOG_AUTO_PUBLISH_ENABLED = 'true'
    const far = () => Date.now() + 120_000
    const article = (locale: string, publishedAt: string) => ({ locale, is_published: true, published_at: publishedAt })

    check('J1: the morning window is 04:00-06:59 UTC and nothing else',
      [4, 5, 6].every((h) => isInWindow(Date.parse(`2026-10-14T0${h}:30:00Z`)))
      && ![3, 7, 12, 23].some((h) => isInWindow(Date.parse(`2026-10-14T${String(h).padStart(2, '0')}:30:00Z`))))
    check('J2: "today" starts at midnight UTC', startOfUtcDay(inWindow) === '2026-10-14T00:00:00.000Z')

    const fresh = await nextLocaleToWrite(fake([]) as unknown as Admin, inWindow)
    check('J3: a morning with nothing published starts with Hebrew', fresh.locale === 'he' && !fresh.busy, fresh)

    const afterHe = await nextLocaleToWrite(
      fake([], [article('he', '2026-10-14T04:10:00Z')]) as unknown as Admin, inWindow)
    check('J4: a language that already published today is done for the day', afterHe.locale === 'en', afterHe)

    const allThree = await nextLocaleToWrite(
      fake([], BLOG_AUTO_LOCALES.map((l) => article(l, '2026-10-14T04:10:00Z'))) as unknown as Admin, inWindow)
    check('J5: a morning with all three published writes nothing more',
      allThree.locale === null && !allThree.busy, allThree)

    const yesterday = await nextLocaleToWrite(
      fake([], [article('he', '2026-10-13T04:10:00Z')]) as unknown as Admin, inWindow)
    check('J6: yesterday\'s article does not count as today\'s', yesterday.locale === 'he', yesterday)

    const busy = await nextLocaleToWrite(
      fake([planned({ status: 'generating', locked_at: new Date(inWindow - 60_000).toISOString() })]) as unknown as Admin,
      inWindow)
    check('J7: a language being written right now is left to that run',
      busy.locale === null && busy.busy, busy)

    const staleLock = await nextLocaleToWrite(
      fake([planned({ status: 'generating', locked_at: new Date(Date.now() - STALE_LOCK_MS - 60_000).toISOString() })]) as unknown as Admin,
      inWindow)
    check('J8: a lock left by a killed run does not block the language for the day',
      staleLock.locale === 'he', staleLock)

    const outside = await runBlogDailyWindow(fake([planned()]) as unknown as Admin,
      { env, now: Date.parse('2026-10-14T12:00:00Z'), deadlineAt: far() })
    check('J9: outside the window it writes nothing', outside.state === 'outside_window', outside)

    const preview = await runBlogDailyWindow(fake([planned()]) as unknown as Admin,
      { env: { VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv, now: inWindow, deadlineAt: far() })
    check('J10: preview never publishes to the company blog', preview.state === 'not_production', preview)

    process.env.BLOG_AUTO_PUBLISH_ENABLED = 'no'
    const off = await runBlogDailyWindow(fake([planned()]) as unknown as Admin,
      { env, now: inWindow, deadlineAt: far() })
    check('J11: the kill switch stops it', off.state === 'disabled', off)
    process.env.BLOG_AUTO_PUBLISH_ENABLED = 'true'

    const noTime = await runBlogDailyWindow(fake([planned()]) as unknown as Admin,
      { env, now: inWindow, deadlineAt: Date.now() - 1 })
    check('J12: a run with no time left leaves the article to the next quarter of an hour',
      noTime.state === 'no_time' && noTime.locale === 'he', noTime)

    const done = await runBlogDailyWindow(
      fake([], BLOG_AUTO_LOCALES.map((l) => article(l, '2026-10-14T04:10:00Z'))) as unknown as Admin,
      { env, now: inWindow, deadlineAt: far() })
    check('J13: a finished morning is reported, not retried', done.state === 'all_done', done)

    let rejected = false
    await startIsolatedBlogWindow(async () => { throw new Error('boom') },
      { startedAtMs: Date.now(), maxDurationMs: 300_000 }).catch(() => { rejected = true })
    check('J14: a failure in the blog cannot fail the content cron it rides on', !rejected)

    let ran = false
    await startIsolatedBlogWindow(async () => { ran = true },
      { startedAtMs: Date.now() - 300_000, maxDurationMs: 300_000 })
    check('J15: a cron already out of time does not start the blog at all', !ran)

    // Mutation controls.
    check('J16 (control): without the published-today read, a second run would write Hebrew again',
      (await nextLocaleToWrite(fake([]) as unknown as Admin, inWindow)).locale === 'he')
    check('J17 (control): a window that covered every hour would publish at midnight',
      !isInWindow(Date.parse('2026-10-14T00:30:00Z')))
    process.env.BLOG_AUTO_PUBLISH_ENABLED = before
  }


}

void main().then(() => {
  console.log(`${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
})

export {}
