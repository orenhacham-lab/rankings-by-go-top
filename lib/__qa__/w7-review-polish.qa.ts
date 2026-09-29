/**
 * WAVE-7 REVIEW, polish items: every rule below has a mutation control.
 *
 *   P2-7  Maps posts: one status per step. When listing the businesses (step 2) finds
 *         the Google grant gone, step 1 stops saying "connected"; the composer is
 *         locked (a disabled fieldset and one line naming the missing step) until a
 *         business is chosen.
 *   P2-9  Existing content on a phone: a kind with nothing in it is not a tab ("מוצרים 0"
 *         for a service business); "all" and the tab on screen stay; the tab row
 *         scrolls with room at both ends, so "הכל" is never clipped.
 *   P2-9b Existing content summary: a kind the site has none of draws no tile
 *         ("מוצרים 0", "קטגוריות 0"); the total always shows; one kind alone draws
 *         none (it repeats the total); the grid has as many columns as tiles.
 *   P2-11 Articles list: "פרסם באתר" never wraps; one ready article reads "מאמר אחד
 *         מוכן" (not "1 מוכנים"); the connection line is the hero's footer instead
 *         of a line floating above it.
 *   P2-12 Strategy month tabs: no bare number on a month chip ("ספטמבר 10" beside
 *         "הכל 11"); the totals are said in words under the chips, and they are the
 *         numbers the board shows.
 *
 * Run: npx tsx lib/__qa__/w7-review-polish.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { readFileSync } = require('fs') as typeof import('fs')
const { join, resolve } = require('path') as typeof import('path')
const { createElement } = require('react') as { createElement: (...a: any[]) => any }
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../i18n/dashboard/getDashboardDictionary')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = resolve(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
type Locale = 'he' | 'en'
const render = (locale: Locale, node: unknown) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const he = getDashboardDictionary('he')
const en = getDashboardDictionary('en')
;(globalThis as any).fetch = async () => { throw new Error('no fetch during a render') }

// ── P2-7 ────────────────────────────────────────────────────────────────────
console.log('\nP2-7) Maps posts: one status per step, the composer locked until a business is chosen')
{
  const { withAuthLost } = require('../../components/maps-posts/MapsPostsView')
  const { ConnectCard, GBP_AUTH_LOST_CODES } = require('../../components/maps-posts/ConnectCards')
  const PostComposer: any = require('../../components/maps-posts/PostComposer').default
  const base = {
    ok: true, state: 'ready', configured: true,
    connection: { status: 'connected', errorCode: null, updatedAt: '2026-09-20T08:00:00Z' },
    location: null, posts: [], siteUrl: 'https://plumber.co.il', businessName: 'אינסטלציה מהירה', articles: [],
  }
  const lost = withAuthLost(base, true)
  check('M1: a grant step 2 found gone reads as "reconnect" in step 1', lost.connection.status === 'reauth_required')
  check('M1b: …and nothing changes while the grant holds, or with no connection at all',
    withAuthLost(base, false) === base && withAuthLost({ ...base, connection: null }, true).connection === null)
  const card = (s: any) => text(render('he', createElement(ConnectCard, { projectId: 'p1', status: s, onChanged() {} })))
  const connectedLabel = he.mapsPosts.connect.connected
  check('M2: step 1 says "connected" while the grant holds', card(base).includes(connectedLabel))
  check('M2b: …and never once step 2 found it gone (it asks to reconnect)',
    !card(lost).includes(connectedLabel) && card(lost).includes(he.mapsPosts.connect.reauthTitle))
  check('M2-MUT: the screen before the fix (step 1 fed the raw status) still says "connected"', card(withAuthLost(base, false)).includes(connectedLabel))

  const loc = strip(read('components/maps-posts/ConnectCards.tsx'))
  const view = strip(read('components/maps-posts/MapsPostsView.tsx'))
  const handsUp = (src: string) => (src.match(/GBP_AUTH_LOST_CODES\.has\(body\.error\)\)\s*\{[^}]*onAuthLost\?\.\(\)/g) ?? []).length === 2
  check('M3: step 2 hands a lost grant to step 1 when listing AND when choosing a business', handsUp(loc))
  check('M3b: the codes are the ones the server sends for a lost grant',
    ['reauth_required', 'not_connected', 'connection_revoked'].every((c) => GBP_AUTH_LOST_CODES.has(c)))
  const wired = (src: string) => /<ConnectCard[^>]*status=\{shown\}/.test(src) && /<LocationCard[^>]*status=\{shown\}[^>]*onAuthLost=\{onAuthLost\}/.test(src) && /<PostComposer[^>]*status=\{shown\}/.test(src)
  check('M3c: every step reads the same status', wired(view))
  check('M3-MUT: step 2 showing its own red error again fails M3', !handsUp(loc.replace(/\{ setOptions\(null\); onAuthLost\?\.\(\) \}/, '{ setOptions([]) }')))
  check('M3c-MUT: step 1 fed the raw status fails M3c', !wired(view.replace('<ConnectCard projectId={projectId} status={shown}', '<ConnectCard projectId={projectId} status={status}')))

  const compose = (s: any) => render('he', createElement(PostComposer, { projectId: 'p1', status: s, onPosted() {} }))
  const noLoc = compose(base)
  const withLoc = compose({ ...base, location: { title: 'אינסטלציה מהירה', address: 'תל אביב', mapsUri: null, websiteUri: null, locationName: 'locations/1' } })
  const reauth = compose(lost)
  check('M4: with no business chosen the form is locked (a disabled fieldset) and says which step is missing',
    /<fieldset[^>]*disabled=""/.test(noLoc) && noLoc.includes('data-gbp-composer-locked="location"') && text(noLoc).includes(he.mapsPosts.composer.lockedLocation))
  check('M4b: with the grant gone it names step 1', reauth.includes('data-gbp-composer-locked="connect"') && text(reauth).includes(he.mapsPosts.composer.lockedConnect))
  check('M4c: with a business chosen nothing is locked', !/<fieldset[^>]*disabled=""/.test(withLoc) && !withLoc.includes('data-gbp-composer-locked'))
  check('M4d: the lock is said once (no second "choose a business" under the disabled button)',
    !text(noLoc).includes(he.mapsPosts.errors.no_location))
  const composerSrc = strip(read('components/maps-posts/PostComposer.tsx'))
  const locks = (src: string) => /<fieldset disabled=\{!canPublish\}/.test(src)
  check('M4-MUT: a fieldset that is never disabled fails the lock check', locks(composerSrc) && !locks(composerSrc.replace('<fieldset disabled={!canPublish}', '<fieldset disabled={false}')))
}

// ── P2-9 ────────────────────────────────────────────────────────────────────
console.log('\nP2-9) Existing content: no empty kind tabs, a tab row that scrolls with room')
{
  const KindTabs: any = require('../../components/content/workspace/existing/KindTabs').default
  const { visibleTabs } = require('../../components/content/workspace/existing/KindTabs')
  const { TABS } = require('../content/existing-content/model')
  const counts = { all: 14, product: 0, article: 9, page: 5, category: 0 }
  check('K1: a kind with nothing in it is not a tab; "all" always is', visibleTabs(counts, 'all').join() === 'all,article,page')
  check('K1b: the tab on screen stays even at 0 (a link can open it)', visibleTabs(counts, 'product').join() === 'all,product,article,page')
  check('K1-MUT: every kind as a tab (before the fix) offers "מוצרים 0"', TABS.includes('product') && TABS.length > visibleTabs(counts, 'all').length)
  const html = render('he', createElement(KindTabs, { x: he.existingContent, counts, capped: false, value: 'all', onChange() {}, num: new Intl.NumberFormat('he-IL'), panelId: 'panel' }))
  check('K2: the rendered row has no product or category tab', !/data-tab="product"/.test(html) && !/data-tab="category"/.test(html) && /data-tab="all"/.test(html))
  const scroller = (h: string) => /data-kind-tabs-scroll=""[^>]*class="[^"]*overflow-x-auto[^"]*px-4[^"]*\[scroll-padding-inline:1rem\]/.test(h)
  check('K3: the row scrolls inside itself with room at both ends (the first tab is never clipped)', scroller(html))
  check('K3-MUT: the old tight row (-mx-1 px-1, no scroll padding) fails K3', !scroller(html.replace('px-4 [scroll-padding-inline:1rem]', 'px-1')))
}

// ── P2-9b ───────────────────────────────────────────────────────────────────
console.log('\nP2-9b) Existing content summary: no 0 tiles, no lonely tile, no empty grid cell')
{
  const SiteSummary: any = require('../../components/content/workspace/existing/SiteSummary').default
  const { summaryKinds, summaryGridClass } = require('../../components/content/workspace/existing/SiteSummary')
  const payload = (counts: Record<string, number>) => ({
    counts: { all: Object.values(counts).reduce((a, b) => a + b, 0), ...counts },
    map: { capped: false, state: 'done', phase: null, found: 0, docsRead: 0, docsSeen: 0 },
    sources: { map: 14, shopify: 0, wordpress: 0, crawl: 0, gsc: 0 }, indexedAt: '2026-09-27T08:00:00Z',
    gsc: { state: 'none' }, insights: { withClicks: 0, seenNoClicks: 0, actionable: 0 }, riskCount: 0,
  })
  const draw = (counts: Record<string, number>, tab = 'all') => render('he', createElement(SiteSummary, {
    x: he.existingContent, data: payload(counts), tab, onTab() {}, risk: false, onRisk() {},
    num: new Intl.NumberFormat('he-IL'), day: () => '27.09.2026', refresh: { show: false, busy: false, onClick() {} },
  }))
  const tiles = (h: string) => [...h.matchAll(/data-kind-count="(\w+)"/g)].map((m) => m[1])
  const service = draw({ product: 0, article: 4, page: 10, category: 0 })
  check('S1: a service business sees only the kinds it has (no "מוצרים 0", no "קטגוריות 0")', tiles(service).join() === 'article,page', tiles(service).join())
  check('S1b: the total still shows', /data-existing-total=""[^>]*>14</.test(service))
  const cells = (h: string) => { const m = h.match(/data-kind-cells="(\d)" class="([^"]*)"/); return m ? { n: Number(m[1]), cls: m[2] } : null }
  const full = (n: number, cls: string) => {
    const cols = (bp: string) => Number((cls.match(new RegExp(`(?:^|\\s)${bp}grid-cols-(\\d)`)) ?? [])[1] ?? 0)
    const base = cols(''), sm = cols('sm:') || base
    return base > 0 && n % base === 0 && n % sm === 0
  }
  const c2 = cells(service)
  check('S2: the grid has as many columns as tiles (no empty cell, no lonely tile)', !!c2 && full(c2.n, c2.cls), JSON.stringify(c2))
  check('S2b: …for 2, 3 and 4 tiles alike', [2, 3, 4].every((n) => full(n, summaryGridClass(n))))
  const three = draw({ product: 0, article: 4, page: 10, category: 2 })
  check('S2c: three kinds draw three tiles in one row', tiles(three).length === 3 && !!cells(three) && full(3, cells(three)!.cls))
  const onlyPages = draw({ product: 0, article: 0, page: 9, category: 0 })
  check('S3: one kind alone draws no tile (it would only repeat the total)', tiles(onlyPages).length === 0 && !onlyPages.includes('data-kind-cells'))
  check('S3b: an empty site draws no tile and no grid', tiles(draw({ product: 0, article: 0, page: 0, category: 0 })).length === 0)
  check('S4: the kind on screen keeps its tile even at 0 (a link can open it)', summaryKinds({ product: 0, article: 4, page: 10, category: 0 }, 'product').join() === 'product,article,page')
  check('S4-MUT: every kind drawn (before the fix) shows the two zero tiles', ['product', 'article', 'page', 'category'].length - tiles(service).length === 2)
  const src = strip(read('components/content/workspace/existing/SiteSummary.tsx'))
  const filtered = (s: string) => /\{kinds\.map\(\(k: SiteKind\)/.test(s) && !/\{SITE_KINDS\.map\(\(k: SiteKind\)/.test(s)
  check('S5: the tiles come from the filtered kinds', filtered(src))
  check('S5-MUT: tiles from every kind again fail S5', !filtered(src.replace('{kinds.map((k: SiteKind)', '{SITE_KINDS.map((k: SiteKind)')))
  check('S2-MUT: the old fixed grid (2 / 4 columns) leaves an empty cell with 3 tiles', !full(3, 'grid-cols-2 sm:grid-cols-4'))
}

// ── P2-11 ───────────────────────────────────────────────────────────────────
console.log('\nP2-11) Articles list: plural agreement, the connection line in the hero, no wrapping')
{
  const ArticlesHero: any = require('../../components/content/workspace/ArticlesHero').default
  const h = he.contentHub.articlesHero, e = en.contentHub.articlesHero
  check('A1: one ready article reads "מאמר אחד מוכן"', h.waiting(1, '1').startsWith('מאמר אחד מוכן') && !h.waiting(1, '1').includes('1 מוכנים'))
  check('A1b: several read in the plural', h.waiting(3, '3') === '3 מאמרים מוכנים ומחכים לפרסום' && e.waiting(1, '1').startsWith('One article') && e.waiting(3, '3').startsWith('3 articles'))
  check('A1c: one written article is singular too', h.headlineNone(1, '1') === 'מאמר אחד כתוב, ועוד לא פורסם' && h.headlineNone(4, '4').startsWith('4 מאמרים'))
  const oldWaiting = (ready: string) => `${ready} מוכנים ומחכים לפרסום`
  check('A1-MUT: the old sentence says "1 מוכנים"', oldWaiting('1').startsWith('1 מוכנים'))
  const standing = { total: 3, draft: 0, ready: 1, scheduled: 1, publishing: 0, published: 1, failed: 0, publishedLast30: 1, lastPublishedAt: '2026-09-10T08:00:00Z', weekly: [0, 0, 0, 0, 0, 1, 0, 0] }
  const hero = render('he', createElement(ArticlesHero, { standing, connection: createElement('a', { href: '/settings?projectId=p1#platform' }, 'x') }))
  check('A2: the hero says "מאמר אחד מוכן ומחכה לפרסום"', text(hero).includes('מאמר אחד מוכן ומחכה לפרסום') && !text(hero).includes('1 מוכנים'))
  // The render is the hero alone, so the marker being in it at all means inside the hero.
  const inHero = (hh: string) => hh.includes('data-articles-hero=""') && hh.indexOf('data-articles-hero-connection') > hh.indexOf('data-articles-hero=""')
  check('A3: the connection line is drawn inside the hero', inHero(hero))
  check('A3b: …and not without one', !render('he', createElement(ArticlesHero, { standing })).includes('data-articles-hero-connection'))
  const screen = strip(read('components/content/workspace/ArticlesScreen.tsx'))
  const moved = (src: string) => /\{data && activePlatform !== 'none' && \(connectionInHero \? null :/.test(src)
    && /<ArticlesHero standing=\{standing\} connection=\{connectionInHero \? connectionLine\(true\) : undefined\} \/>/.test(src)
    && /const connectionInHero = heroShown && data\?\.platform\?\.platform === 'wordpress'/.test(src)
  check('A3c: with WordPress connected and the hero on screen, the line is not ALSO drawn above it', moved(screen))
  check('A3-MUT: the line drawn above the hero again fails A3c', !moved(screen.replace('(connectionInHero ? null :', '(')))
  const nowrap = (src: string) => /className="whitespace-nowrap text-action[^"]*" onClick=\{\(\) => exportRow\(a, 'publish'\)\}/.test(src)
  check('A4: "פרסם באתר" never wraps', nowrap(screen))
  check('A4-MUT: the button without whitespace-nowrap fails A4', !nowrap(screen.replace(/className="whitespace-nowrap (text-action[^"]*" onClick=\{\(\) => exportRow\(a, 'publish'\))/, 'className="$1')))
}

// ── P2-12 ───────────────────────────────────────────────────────────────────
console.log('\nP2-12) Strategy month tabs: totals in words, no bare number on a month')
{
  const StrategyBoard: any = require('../../components/content-strategy/StrategyBoard').default
  const { buildStrategyBoard, NO_SEED_PLAN, cardsInMonth, ALL_MONTHS, monthChips } = require('../content/strategy/board')
  const ideas = Array.from({ length: 9 }, (_, i) => ({ id: `i${i}`, title: `רעיון ${i + 1}`, primaryKeyword: `ביטוי ${i + 1}`, reason: null, score: 0.9 - i / 20, createdAt: '2026-09-05T08:00:00.000Z' }))
  const articles = [
    { id: 'a1', topicId: null, title: 'מתי להחליף דוד שמש', status: 'scheduled', scheduledAt: '2026-10-05T08:00:00.000Z', publishedAt: null, createdAt: '2026-09-01T08:00:00.000Z' },
    { id: 'a2', topicId: null, title: 'כמה עולה איתור נזילה', status: 'published', scheduledAt: null, publishedAt: '2026-09-10T08:00:00.000Z', createdAt: '2026-09-01T08:00:00.000Z' },
  ]
  const board = buildStrategyBoard({ data: { ideas, topics: [], articles }, queue: null, seed: NO_SEED_PLAN })
  const b = he.strategyInsights.board
  const f = (n: number) => String(n)
  check('T1: "all" says "11 נושאים בתוכנית: 2 מתוכננים לחודש מסוים, 9 עוד בלי תאריך פרסום."',
    b.summaryAll({ total: 11, dated: 2, undated: 9 }, f) === '11 נושאים בתוכנית: 2 מתוכננים לחודש מסוים, 9 עוד בלי תאריך פרסום.')
  check('T1b: a month says how many are shown, how many it plans and why the rest are there',
    b.summaryMonth({ shown: 10, inMonth: 1, undated: 9 }, 'אוקטובר', f) === '10 נושאים מוצגים באוקטובר: אחד מתוכנן לאוקטובר ו-9 עוד בלי תאריך, ולכן מוצגים בכל חודש.')
  check('T1c: English says the same', en.strategyInsights.board.summaryMonth({ shown: 10, inMonth: 1, undated: 9 }, 'October', f) === '10 topics shown in October: one planned for October and 9 with no publish date yet, so shown under every month.')
  const html = render('he', createElement(StrategyBoard, { cards: board.cards, lang: 'he', dict: he }))
  const chipsOf = (hh: string) => hh.slice(hh.indexOf('role="radiogroup"'), hh.indexOf('</div>', hh.indexOf('role="radiogroup"')))
  const bareNumbers = (seg: string) => /<span class="tabular-nums[^"]*">\d+<\/span>/.test(seg)
  const chipCount = (chipsOf(html).match(/role="radio"/g) ?? []).length
  check('T2: no chip carries a bare number', !bareNumbers(chipsOf(html)) && chipCount === 3, `chips=${chipCount}`)
  const Segmented: any = require('../../components/ui/Segmented').default
  const withCounts = render('he', createElement(Segmented, { ariaLabel: 'x', value: 'all', onChange() {}, options: monthChips(board.cards).map((c: any) => ({ value: c.key, label: c.key, count: c.count })) }))
  check('T2-MUT (render): chips drawn with their counts are caught by T2', bareNumbers(chipsOf(withCounts)))
  const summary = text(html.slice(html.indexOf('data-month-summary'), html.indexOf('</p>', html.indexOf('data-month-summary'))))
  const all = cardsInMonth(board.cards, ALL_MONTHS).length
  check('T3: the words under the chips are the board\'s own numbers', summary.includes(`${all} נושאים בתוכנית`) && summary.includes('9 עוד בלי תאריך'), summary)
  const src = strip(read('components/content-strategy/StrategyBoard.tsx'))
  const noCount = (s: string) => !/count: c\.count/.test(s) && /data-month-summary=\{active\}/.test(s)
  check('T2-MUT: chips with their count again fail T2', noCount(src) && !noCount(src.replace("monthLabel(c.key, lang) }))", "monthLabel(c.key, lang), count: c.count }))")))
  const oldChips = monthChips(board.cards).slice(1).map((c: any) => c.count)
  check('T-MUT: the old chip numbers were "10" per month beside "11" for all (the confusion)', oldChips.every((n: number) => n === 10) && all === 11, oldChips.join())
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
export {}
