/**
 * THE CANNIBALIZATION CHECK (lib/content/cannibalization): one shared check, used by
 * every path that creates a topic or a keyword.
 *
 *   N) normalization: niqqud, final letters, entities, stop and generic words, years,
 *      Hebrew prefixes and light plurals, English plurals, and what must stay apart
 *   C) the check on a site built from Japan4U's real titles (Production, read only,
 *      29 Sep 2026): the duplicates it catches, the long tails it lets through, the
 *      home page, weak Search Console rows, rejected topics, kinds and exclusions
 *   S) the automatic paths' skip (skipOverlapping), also inside one batch
 *   L) links: "improve the existing page" is always a path on this app
 *   H) POST /api/content/topics/overlap: flag, JSON, auth, input, load failure, answer
 *   W) wiring: every creation path uses it, automatic paths skip, manual ones warn and
 *      never block, the loader filters by owner and never writes
 *   D) the words: both dictionaries, the owner's sentence, Hebrew fully Hebrew
 *
 * Every source guard has a MUTATION CONTROL that breaks the code and shows the guard fails.
 * Run: npx tsx lib/content/cannibalization/__qa__/cannibalization.qa.ts
 */
import { fold, mainPhrase, similarity, slugPhrase, subjectWords, wordsMatch, decodeEntities } from '../normalize'
import {
  buildOverlapIndex, checkOverlap, improveHref, overlapPayload, skipOverlapping, SITE_AND_PLAN_KINDS, OVERLAP_KINDS,
  type OverlapIndexData,
} from '../check'
import { handleOverlapCheck, type OverlapRouteDeps } from '../http'
import { readOverlap, overlapMessage } from '../client'
import { dashboardHe } from '../../../i18n/dashboard/he'
import { dashboardEn } from '../../../i18n/dashboard/en'
import { code } from './_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── A site from Japan4U's real titles ─────────────────────────────────────────
const SITE: OverlapIndexData = {
  homeHosts: ['japan4u.co.il'],
  pages: [
    { title: 'Japan4U – טיולים מאורגנים ליפן', url: 'https://japan4u.co.il/' },
    { title: 'קנזאווה', url: 'https://japan4u.co.il/%D7%A7%D7%A0%D7%96%D7%90%D7%95%D7%95%D7%94/' },
    { title: 'טיול ביפן בתקציב מוגבל: 10 טיפים שיחסכו לכם כסף', url: 'https://japan4u.co.il/blog/japan-budget/' },
    { title: 'Tokyo Street Food Guide', url: 'https://japan4u.co.il/tokyo-street-food/' },
    // The page an article became: indexed once, as the article.
    { title: 'טוקיו מול קיוטו', url: 'https://japan4u.co.il/tokyo-vs-kyoto/' },
  ],
  articles: [
    { id: 'a1', title: 'טוקיו מול קיוטו: המדריך המלא לבחירת בסיס לטיול', slug: 'tokyo-vs-kyoto', url: 'https://japan4u.co.il/tokyo-vs-kyoto/' },
    { id: 'a2', title: 'טיול ביפן עם ילדים: המדריך המלא', url: null },
    { id: 'a3', title: 'כרטיס רכבות ביפן &#8211; כל מה שצריך לדעת', url: 'https://japan4u.co.il/jr-pass/' },
  ],
  gsc: [
    { query: 'קנזאווה', page: 'https://japan4u.co.il/קנזאווה/', impressions: 120, position: 13.8 },
    { query: 'אוסקה', page: 'https://japan4u.co.il/osaka/', impressions: 300, position: 45 },
    { query: 'נארה', page: 'https://japan4u.co.il/nara/', impressions: 5, position: 8 },
    { query: 'הירושימה', page: 'https://japan4u.co.il/hiroshima/', impressions: 80, position: 9 },
    { query: 'יפן', page: 'https://japan4u.co.il/', impressions: 900, position: 12 },
  ],
  topics: [
    { id: 't1', topic: 'מסלולי הליכה ביפן', primaryKeyword: 'מסלולי הליכה', status: 'used' },
    { id: 't2', topic: 'הוקאידו בחורף', primaryKeyword: 'הוקאידו בחורף', status: 'rejected' },
  ],
  ideas: [
    { id: 'i1', title: 'אונסן ביפן: איך מתנהגים', primaryKeyword: 'אונסן', status: 'pending' },
  ],
}
const index = buildOverlapIndex(SITE)
const hit = (title: string, keyword: string | null = null, kinds = SITE_AND_PLAN_KINDS) => checkOverlap(index, { title, keyword }, { kinds })

function main() {
  console.log('N) normalization')
  check('niqqud is removed', fold('טִיּוּל') === 'טיול')
  check('final letters fold', fold('ילדים') === fold('ילדימ'))
  check('WordPress entities decode', decodeEntities('טוקיו &#8211; קיוטו') === 'טוקיו – קיוטו' && mainPhrase('טוקיו &#8211; קיוטו') === 'טוקיו')
  check('stop and generic words and years go', subjectWords('המדריך המלא לטיול ביפן 2025').join(',') === ['לטיול', fold('ביפן')].join(','), subjectWords('המדריך המלא לטיול ביפן 2025').join(','))
  check('a Hebrew one-letter prefix is read off (לטיול = טיול, ביפן = יפן)', wordsMatch('לטיול', 'טיול') && wordsMatch('ביפן', 'יפן'))
  check('light plurals match (טיולים = טיול, מנורות = מנורה, רכבות = רכבת)', wordsMatch(fold('טיולים'), fold('טיול')) && wordsMatch(fold('מנורות'), fold('מנורה')) && wordsMatch(fold('רכבות'), fold('רכבת')))
  check('construct plural matches (כרטיסי = כרטיס)', wordsMatch('כרטיסי', 'כרטיס'))
  check('English plurals match (foods = food, cities = city)', wordsMatch('foods', 'food') && wordsMatch('cities', 'city'))
  check('different words stay apart (רכב ≠ רכבת, הזמנה ≠ להזמין, קיוטו ≠ טוקיו)', !wordsMatch('רכב', 'רכבת') && !wordsMatch('הזמנה', 'להזמין') && !wordsMatch('קיוטו', 'טוקיו'))
  check('a prefix is not read off a short word (בית stays בית)', !wordsMatch('בית', 'ית'))
  check('word order does not matter', similarity(subjectWords('קיוטו מול טוקיו'), subjectWords('טוקיו מול קיוטו')) === 1)
  check('slugs read as words; a bare host is no slug', slugPhrase('https://x.co.il/japan-street-food/') === 'japan street food' && slugPhrase('https://x.co.il') === '')
  check('a title that is only a frame has no subject, so it matches nothing', subjectWords('המדריך המלא').length === 0 && checkOverlap(buildOverlapIndex({ pages: [], articles: [], gsc: [], topics: [], ideas: [] }), { title: 'המדריך המלא' }) === null)

  console.log('\nC) the check on Japan4U\'s real titles')
  const cases: [string, string | null, string, string][] = [
    // candidate title, keyword, expected kind, expected label (start)
    ['קיוטו מול טוקיו: איפה כדאי לישון', 'קיוטו מול טוקיו', 'article', 'טוקיו מול קיוטו'],
    ['מה לראות בקנזאווה', 'מה לראות בקנזאווה', 'page', 'קנזאווה'],
    ['טיול בתקציב מוגבל ביפן', null, 'page', 'טיול ביפן בתקציב מוגבל'],
    ['טיול ביפן עם ילדים קטנים', null, 'article', 'טיול ביפן עם ילדים'],
    ['כרטיסי רכבת ביפן', null, 'article', 'כרטיס רכבות ביפן'],
    ['Street foods in Tokyo', null, 'page', 'Tokyo Street Food Guide'],
    ['הירושימה ביום אחד', 'הירושימה', 'search', 'הירושימה'],
    ['מסלול הליכה', 'מסלול הליכה', 'topic', 'מסלולי הליכה ביפן'],
  ]
  for (const [title, kw, kind, label] of cases) {
    const m = hit(title, kw)
    check(`"${title}" repeats ${kind} "${label}"`, !!m && m.kind === kind && m.label.startsWith(label), JSON.stringify(m))
  }
  const allowed = ['רכבות ביפן', 'האקונה למשפחות', 'טיול מאורגן ליפן לזוגות', 'השכרת רכב ביפן', 'אוסקה בלילה', 'נארה', 'הוקאידו בחורף', 'Japan4U']
  for (const title of allowed) {
    const m = hit(title, title)
    check(`"${title}" is new: allowed`, m === null, JSON.stringify(m))
  }
  check('the page an article became is indexed once, as the article', hit('טוקיו מול קיוטו')?.kind === 'article' && index.counts.page === 3, JSON.stringify(index.counts))
  check('Search Console: only a query ranking top 20 with 10+ impressions, never the home page', index.counts.search === 2, String(index.counts.search))
  check('an idea counts only when asked for (the top-up\'s new ideas)', hit('אונסן', 'אונסן') === null && hit('אונסן', 'אונסן', OVERLAP_KINDS)?.kind === 'idea')
  check('the candidate\'s own topic and idea are never its match',
    checkOverlap(index, { title: 'מסלולי הליכה ביפן' }, { kinds: SITE_AND_PLAN_KINDS, excludeTopicIds: ['t1'] }) === null
    && checkOverlap(index, { title: 'אונסן' }, { excludeIdeaIds: ['i1'] }) === null)
  check('the heaviest kind wins: a page over the query it ranks for', hit('קנזאווה')?.kind === 'page')
  check('the home page is never a match, though the same words elsewhere would be',
    buildOverlapIndex({ ...SITE, homeHosts: [], pages: [{ title: 'יפן', url: 'https://japan4u.co.il/x/' }] }).entries.some((e) => e.label === 'יפן') && hit('יפן') === null)

  console.log('\nS) automatic paths skip, also inside one batch')
  const kept = skipOverlapping(index, [
    { title: 'מה לראות בקנזאווה', primaryKeyword: 'קנזאווה' },
    { title: 'אונסן פרטי ביפן', primaryKeyword: 'אונסן פרטי' },
    { title: 'אונסנים פרטיים ביפן', primaryKeyword: 'אונסנים פרטיים' },
    { title: 'האקונה למשפחות', primaryKeyword: 'האקונה למשפחות' },
  ])
  check('the site\'s subject is skipped; of two near-duplicates the first is kept', kept.map((k) => k.title).join('|') === 'אונסן פרטי ביפן|האקונה למשפחות', kept.map((k) => k.title).join('|'))
  check('…and it is the in-batch check that removes the second (the site alone would not)', hit('אונסנים פרטיים ביפן', 'אונסנים פרטיים') === null)

  console.log('\nL) "improve the existing page" stays on this app')
  const links = [hit('קיוטו מול טוקיו'), hit('מה לראות בקנזאווה'), hit('הירושימה'), hit('מסלול הליכה'), hit('Street foods in Tokyo')]
  check('article → its page in the app; page → existing content searched by its path; topic → the plan',
    improveHref(links[0]!) === '/content/articles/a1'
    && improveHref(links[1]!) === `/content/existing?q=${encodeURIComponent('קנזאווה')}`
    && improveHref(links[3]!) === '/content/strategy?view=list'
    && improveHref(links[4]!) === `/content/existing?q=${encodeURIComponent('tokyo-street-food')}`, links.map((l) => l && improveHref(l)).join(' '))
  check('every link is a path on this app', links.every((l) => { const h = improveHref(l!); return h.startsWith('/') && !h.startsWith('//') }))
  check('the browser refuses a link to another origin', readOverlap({ ...overlapPayload(links[1]), improveHref: 'https://evil.example/x' }) === null
    && readOverlap({ ...overlapPayload(links[1]), improveHref: '//evil.example' }) === null
    && readOverlap({ ...overlapPayload(links[1]), kind: 'other' }) === null
    && readOverlap(overlapPayload(links[1]))?.improveHref === improveHref(links[1]!))

  return runHttp().then(() => { wiring(); words() })
}

async function runHttp() {
  console.log('\nH) POST /api/content/topics/overlap')
  const calls: { projectId: string; userId: string }[] = []
  const deps = (over: Partial<OverlapRouteDeps> = {}): OverlapRouteDeps => ({
    enabled: () => true,
    auth: async (projectId) => (projectId === 'p1' ? { user: { id: 'u1' }, admin: {} as never, project: { id: 'p1', user_id: 'u1' } } : { error: 'Not found', status: 404 }),
    load: async (_admin, scope) => { calls.push(scope); return index },
    ...over,
  })
  const req = (body: unknown) => new Request('http://localhost/api/content/topics/overlap', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })
  const off = await handleOverlapCheck(req({ projectId: 'p1', title: 'x' }), deps({ enabled: () => false }))
  check('module off: 404', off.status === 404)
  check('not JSON: 400', (await handleOverlapCheck(req('{'), deps())).status === 400)
  check('not the owner\'s project: the auth\'s own answer', (await handleOverlapCheck(req({ projectId: 'p2', title: 'x' }), deps())).status === 404)
  check('nothing to check: 400', (await handleOverlapCheck(req({ projectId: 'p1', title: '  ' }), deps())).status === 400)
  const failed = await handleOverlapCheck(req({ projectId: 'p1', title: 'קנזאווה' }), deps({ load: async () => { throw new Error('db said: relation x') } }))
  const failedBody = await failed.json()
  check('a failed load is "no overlap known", never the database\'s text', failed.status === 200 && failedBody.overlap === null && !JSON.stringify(failedBody).includes('relation'))
  calls.length = 0
  const ok = await handleOverlapCheck(req({ projectId: 'p1', title: 'מה לראות בקנזאווה' }), deps())
  const body = await ok.json()
  check('a match: 200, the page, how to improve it, not cached', ok.status === 200 && body.overlap?.kind === 'page' && body.overlap?.label === 'קנזאווה'
    && typeof body.overlap?.improveHref === 'string' && ok.headers.get('cache-control') === 'no-store', JSON.stringify(body))
  check('the loader is asked for the signed-in owner\'s project only', calls.length === 1 && calls[0].projectId === 'p1' && calls[0].userId === 'u1')
  const none = await (await handleOverlapCheck(req({ projectId: 'p1', title: 'האקונה למשפחות' }), deps())).json()
  check('no match: overlap null', none.overlap === null)
}

function wiring() {
  console.log('\nW) every creation path uses the one check')
  // W1 manual add: POST /api/content/topics warns in its answer and never fails for it.
  const topics = code('app/api/content/topics/route.ts')
  const manual = (s: string) => /const overlapIndex = loadOverlapIndex\([^\n]*\)\s*\.catch\(\(\) => null\)/.test(s)
    && s.includes('checkOverlap(index, { title: v.topic, keyword: v.primary_keyword }, { kinds: SITE_AND_PLAN_KINDS, excludeTopicIds:')
    && s.includes('return Response.json({ topic: data, overlap })')
  check('W1 manual add answers with the overlap, after the insert, and a failed check is no overlap', manual(topics))
  check('W1 MUTATION CONTROL: a check that can fail the add is caught', !manual(topics.replace('.catch(() => null)', '')))
  check('W1b the check never refuses: no error answer names it', !/overlap[^\n]*status: 4\d\d/.test(topics))
  // W2 "add a keyword" / approving an idea: the bulk route reports the overlap of what it created.
  const bulk = code('app/api/content/automation/topics/bulk/route.ts')
  const bulkOk = (s: string) => /loadOverlapIndex\([^\n]*\.catch\(\(\) => null\)/.test(s) && /checkOverlap\(overlapIndex, [^\n]*kinds: SITE_AND_PLAN_KINDS, excludeIdeaIds/.test(s)
  check('W2 the bulk route reports it for a created topic, and never fails for it', bulkOk(bulk))
  check('W2 MUTATION CONTROL: dropping the check is caught', !bulkOk(bulk.replace(/checkOverlap\(overlapIndex, /g, 'noCheck(overlapIndex, ')))
  // W3 strategy generation: skipped before anything is stored.
  const reco = code('app/api/content/automation/recommendations/route.ts')
  const recoOk = (s: string) => {
    const a = s.indexOf('const kept = skipOverlapping(overlapIndex, fresh)'); const f = s.search(/fresh = kept\s*\} catch/); const b = s.indexOf('insertPendingIdeas(')
    return a > 0 && f > a && b > f && s.indexOf('insertPendingIdeas(') === s.lastIndexOf('insertPendingIdeas(')
  }
  check('W3 strategy generation skips a duplicate before it stores ideas', recoOk(reco))
  check('W3 MUTATION CONTROL: a skip that is computed but not applied is caught', !recoOk(reco.replace(/fresh = kept(\s*\} catch)/, 'void kept$1')))
  check('W3b the funnel names the skipped candidates', /cannibalization_overlap: cannibalizationSkipped/.test(reco) && /blogRejectedByTitle\.set\(normalizeText\(s\.title\), 'cannibalization_overlap'\)/.test(reco))
  // W4 the monthly top-up: every promoted idea and every new idea is checked.
  const topup = code('lib/content/automation/topic-topup.ts')
  const topupOk = (s: string) => /checkOverlap\(index, candidate, \{ kinds: SKIP_KINDS, excludeIdeaIds: \[idea\.id\] \}\)[^\n]*continue/.test(s)
    && s.indexOf('skipOverlapping(pick.index, generated.suggestions, SKIP_KINDS_NEW)') > 0
    && s.indexOf('skipOverlapping(pick.index, generated.suggestions, SKIP_KINDS_NEW)') < s.indexOf('insertPendingIdeas(admin')
  check('W4 the top-up skips a promoted idea or a new idea the site or the plan already has', topupOk(topup))
  check('W4 MUTATION CONTROL: a top-up that promotes without the check is caught', !topupOk(topup.replace('checkOverlap(index, candidate, { kinds: SKIP_KINDS, excludeIdeaIds: [idea.id] })', 'false')))
  // W5 the manual screens ask first and offer "improve", with "create anyway".
  const screens: [string, RegExp][] = [
    ['components/content/ArticleBriefModal.tsx', /fetchOverlap\(projectId, topic/],
    ['components/ai-visibility/AIVisibilitySection.tsx', /fetchOverlap\(projectId, q\.prompt/],  // its card shows the offer (W5b)
    ['components/dashboard/ContentOpportunities.tsx', /fetchOverlap\(projectId, item\.keyword/],
    ['components/content-strategy/AddKeywordForm.tsx', /fetchOverlap\(projectId, value\.trim\(\)/],
  ]
  const warns = (src: string, re: RegExp) => re.test(src) && (/<OverlapHint/.test(src) || /onWriteAnyway: \(\) => \{ void writeArticleFor\(q, true\) \}/.test(src)) && /(onCreateAnyway|onWriteAnyway)/.test(src)
  for (const [f, re] of screens) {
    const src = code(f)
    check(`W5 ${f.split('/').pop()} asks before creating, offers improving, and still allows it`, warns(src, re))
  }
  const modal = code('components/content/ArticleBriefModal.tsx')
  check('W5 MUTATION CONTROL: a form that never asks is caught', !warns(modal.replace(/fetchOverlap\(projectId, topic/g, 'noop(projectId, topic'), screens[0][1]))
  const card = code('components/ai-visibility/sections/SmartQuestionCard.tsx')
  check('W5b the question card shows the offer with "write anyway"', /<OverlapHint overlap=\{article\.overlap\.found\}[^>]*onCreateAnyway=\{article\.overlap\.onWriteAnyway\}/.test(card))
  const hint = code('components/content/OverlapHint.tsx')
  check('W5c the offer links "improve" and only to our own paths (readOverlap)', /href=\{overlap\.improveHref\}/.test(hint) && /startsWith\('\/'\) \|\| o\.improveHref\.startsWith\('\/\/'\)/.test(code('lib/content/cannibalization/client.ts')))
  const ideasHook = code('components/content-strategy/useIdeaActions.ts')
  check('W5d approving an idea on the board says when the site already covers it', /readCreatedOverlap\(req\.url, body\)/.test(ideasHook))
  // W6 the loader: every table read names the owner (the service role bypasses RLS).
  const load = code('lib/content/cannibalization/load.ts')
  const ownerOffenders = (s: string): string[] => {
    const out: string[] = []
    for (const m of s.matchAll(/admin\s*\.from\('([a-z_]+)'\)([^\n]*)/g)) {
      const [, table, chain] = m
      if (table === 'gsc_query_page_metrics') { if (!/\.eq\('sync_run_id', run\.id\)\s*\.eq\('project_id', projectId\)/.test(s.slice(m.index!, m.index! + 400))) out.push(table); continue }
      if (!/\.eq\('project_id', projectId\)/.test(chain) && !/\.eq\('id', projectId\)/.test(chain)) out.push(`${table} (project)`)
      if (!/\.eq\('user_id', userId\)/.test(chain)) out.push(`${table} (owner)`)
    }
    if (!/readSiteMap\(admin, \{ projectId, userId \}/.test(s) || !/getContentIndex\(projectId, userId, admin\)/.test(s)) out.push('site map / content index without the owner')
    return out
  }
  const owner = ownerOffenders(load)
  check('W6 every read of the loader names the project and its owner', owner.length === 0, owner.join(', '))
  check('W6 MUTATION CONTROL: a read without the owner is caught', ownerOffenders(load.replace(".from('generated_articles').select('id, topic_id, title, slug, wp_post_url, shopify_article_url, site_post_url').eq('project_id', projectId).eq('user_id', userId)", ".from('generated_articles').select('id, topic_id, title, slug, wp_post_url, shopify_article_url, site_post_url').eq('project_id', projectId)")).length === 1)
  // W7 the check itself never writes, and costs nothing.
  const pure = ['lib/content/cannibalization/load.ts', 'lib/content/cannibalization/check.ts', 'lib/content/cannibalization/normalize.ts', 'lib/content/cannibalization/http.ts', 'app/api/content/topics/overlap/route.ts']
  const writes = (s: string) => /\.(insert|update|upsert|delete|rpc)\(/.test(s) || /\bfetch\(/.test(s) || /generateRecommendationJSON|gemini|openai/i.test(s)
  check('W7 the check reads only: no write, no model, no outbound call', pure.every((f) => !writes(code(f))), pure.filter((f) => writes(code(f))).join(','))
  check('W7 MUTATION CONTROL: a write in the loader is caught', writes(load + "\nadmin.from('x').insert({})"))
  // W8 the pre-flight route authenticates itself (proxy.ts skips /api/*).
  const route = code('app/api/content/topics/overlap/route.ts')
  const authed = (s: string) => /authContentProject\(/.test(s) && /isContentModuleEnabled/.test(s) && /handleOverlapCheck\(request,/.test(s)
  check('W8 the pre-flight route is behind the content module and the project owner\'s session', authed(route))
  check('W8 MUTATION CONTROL: without the owner\'s auth it is caught', !authed(route.replace(/authContentProject\(/g, 'anyone(')))
  // W9 "improve the existing page" lands on existing content already searched for it.
  const existing = code('components/content/workspace/ExistingContentScreen.tsx')
  const lands = (s: string) => /new URLSearchParams\(window\.location\.search\)\.get\('q'\)/.test(s) && /\.slice\(0, 120\)/.test(s)
    && /const first: View = linkedQuery\.current \? \{ \.\.\.FIRST_VIEW, q: linkedQuery\.current \} : FIRST_VIEW/.test(s) && /void fetchList\(first, 0\)/.test(s)
  check('W9 existing content opens with the linked search (?q=, bounded), then as before', lands(existing))
  check('W9 MUTATION CONTROL: a first load that ignores the link is caught', !lands(existing.replace('void fetchList(first, 0)', 'void fetchList(FIRST_VIEW, 0)')))
}

function words() {
  console.log('\nD) the words')
  const he = dashboardHe.topicOverlap, en = dashboardEn.topicOverlap
  check('both dictionaries carry the same keys', JSON.stringify(Object.keys(he).sort()) === JSON.stringify(Object.keys(en).sort()))
  check('the owner\'s sentence: "כבר יש לכם עמוד על זה: …, עדיף לשפר אותו"', he.page === 'כבר יש לכם עמוד על זה: {label}, עדיף לשפר אותו.' && he.improve === 'לשפר את העמוד הקיים')
  const latin = Object.values(he).filter((v) => /[A-Za-z]/.test(v.replace(/\{(label|message)\}/g, '')))
  check('Hebrew is fully Hebrew', latin.length === 0, latin.join(' | '))
  const m = { kind: 'page' as const, label: 'קנזאווה', url: null, improveHref: '/x', score: 1, onSite: true }
  check('the message fills the page\'s name', overlapMessage(he, m) === 'כבר יש לכם עמוד על זה: קנזאווה, עדיף לשפר אותו.' && overlapMessage(en, { ...m, kind: 'topic' }).startsWith('You already have a planned topic'))
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}).catch((e) => { console.error(e); process.exit(1) })

export {}
