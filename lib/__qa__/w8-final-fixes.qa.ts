/**
 * WAVE 8, the final review's fixes (scratchpad/w8/final-review.md): every logic rule has a MUTATION
 * CONTROL (the same check on a deliberately broken copy must fail); copy is pinned in one place.
 *
 *   A  P0-1  Links tab: the hero never contradicts the counts (same data); P1-1..P1-3 copy;
 *            P1-2 "still missing" from readinessGap
 *   B  P0-2  safe-fix count: nudge card and badge = the health button, follow the queue, no guess
 *   C  P0-3  the Terms/Privacy point at the switch that exists (both languages)
 *   D  P1-4  the ideas column names each kind of card with its own count
 *   E  P1-5/6/7/8 copy and logic: helper, reminder label, "how it works", brand / info questions
 *   F  P1-9  the llms.txt box reads left to right (inline: globals.css beats attributes)
 *   G  P1-10/11 no contact hours; the accessibility statement
 *   H  P2 1-11 the polish list
 *
 * Run: npx tsx lib/__qa__/w8-final-fixes.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { readFileSync } = require('fs') as typeof import('fs')
const { join, resolve } = require('path') as typeof import('path')
const { createElement } = require('react') as { createElement: (...a: any[]) => any }
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../i18n/dashboard/getDashboardDictionary')
const { withMutant } = require('../reminders/__qa__/_mutant') as typeof import('../reminders/__qa__/_mutant')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = resolve(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
type Locale = 'he' | 'en'
const render = (locale: Locale, node: unknown) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const he = getDashboardDictionary('he')
const en = getDashboardDictionary('en')
;(globalThis as any).fetch = async () => { throw new Error('no fetch during a render') }

async function main() {
  // ── A. Links tab ─────────────────────────────────────────────────────────
  console.log('\nA) Links tab: the hero and the counts come from the same data')
  {
    const NetworkPanel: any = require('../../components/site-links/network/NetworkPanel').default
    const PID = 'a1111111-2222-3333-4444-555555555555'
    const base: any = {
      ok: true, available: true, memberCount: 46, linkRel: 'follow', consentVersion: 'v1',
      membership: { active: true, since: '2026-09-15T00:00:00Z', leftAt: null }, readiness: 'thin_or_new',
      caps: { receivedThisMonth: 1, receivedCap: 1, givenThisMonth: 1, givenCap: 4, perArticle: 1 },
      totals: { received: 1, given: 1 },
      received: [{ id: 'r1', state: 'published', anchor: 'x', targetUrl: 'https://a.co.il/', placedAt: '2026-09-20T00:00:00Z', liveUrl: null, context: null, sourceDomain: 'b.co.il' }],
      given: [{ id: 'g1', state: 'published', anchor: 'x', targetUrl: 'https://a.co.il/', placedAt: '2026-09-20T00:00:00Z', liveUrl: null, context: null, articleId: 'a', articleTitle: 't', targetDomain: 'a.co.il', canReject: false }],
    }
    const draw = (data: any, locale: Locale = 'he', mod: any = NetworkPanel) => render(locale, createElement(mod, { projectId: PID, data, onChanged() {} }))
    // A title that says nothing was ever placed, while the counts say something was.
    const denies = (title: string) => /לא מקבל ולא נותן|not receiving or giving|neither receiving nor giving/i.test(title)
    const heroTitle = (html: string) => (/<h2 id="link-network-title"[^>]*>([^<]*)</.exec(html) ?? [])[1] ?? ''
    for (const lang of ['he', 'en'] as const) {
      const html = draw({ ...base }, lang)
      check(`A1 ${lang}: received 1 and given 1 next to a "not placing" hero: the title speaks of NEW links only`, !denies(heroTitle(html)) && /data-network-state="not_placing"/.test(html) && /\b1\b/.test(text(html)), heroTitle(html))
    }
    check('A1: the exact Hebrew title and badge', heroTitle(draw({ ...base })) === 'האתר ברשת, אבל כרגע לא משובצים בו קישורים חדשים' && he.siteLinks.network.hero.badge.notPlacing === 'פעיל, שיבוצים מושהים')
    check('A1: the exact English title', en.siteLinks.network.hero.title.notPlacing === 'Your site is in the network, but no new links are being placed right now')
    check('A1-MUT: the old "not receiving or giving" title is caught by the same rule', denies('האתר ברשת, אבל עוד לא מקבל ולא נותן קישורים'))
    check('A1b: no title of any state denies links, in either language', (['on', 'notPlacing', 'off', 'cannotJoin'] as const).every((k) => !denies(he.siteLinks.network.hero.title[k]) && !denies(en.siteLinks.network.hero.title[k])))
    check('A1c: can\'t-join reads as a whole sentence', he.siteLinks.network.hero.title.cannotJoin === 'כדי להצטרף לרשת, צריך לאשר שהאתר שייך לכם')
    // The state comes from membership + readiness, the figures from the totals: one payload feeds both.
    const src = strip(read('components/site-links/network/NetworkPanel.tsx'))
    check('A1d: the state and the figures are derived from the one `data` payload (no second read)', /networkState\(data\)/.test(src) && /data\.totals\.received/.test(src) && !/fetch\(networkUrl/.test(src.replace(/postJson\(networkUrl/g, '')))

    // P1-2: what is missing.
    const { readinessGap } = require('../link-network/rules')
    const now = new Date('2026-09-29T00:00:00Z')
    const site = (o: any = {}) => ({ projectId: 'p', userId: 'u', clientId: null, domains: ['a.co.il'], verifiedDomains: ['a.co.il'], language: 'he', category: 'x', competitors: [], addresses: [], shopify: false, active: true, memberSince: null, createdAt: '2026-09-24T00:00:00Z', scanned: false, publishedArticles: 1, indexedPages: 4, linkedDomains: [], ...o })
    const gapOf = (o: any, mod: any = { readinessGap }) => JSON.stringify(mod.readinessGap(site(o), now))
    const expect1 = JSON.stringify({ articles: 2, scan: true, days: 9 })
    check('A2 gap: 1 of 3 articles, no scan, 5 of 14 days: 2 articles, a scan, 9 days', gapOf({}) === expect1, gapOf({}))
    check('A2 gap: only what is missing is named', gapOf({ publishedArticles: 3, scanned: true, createdAt: '2026-08-01T00:00:00Z' }) === 'null' && gapOf({ publishedArticles: 3, scanned: true }) === JSON.stringify({ articles: null, scan: false, days: 9 }))
    check('A2 gap: ten scanned pages replace the three articles', gapOf({ indexedPages: 10, scanned: true, createdAt: '2026-08-01T00:00:00Z' }) === 'null')
    const gapMut = await withMutant<any, boolean>('lib/link-network/rules.ts', [['LINK_NETWORK_RULES.minPublishedArticles - Math.max(0, site.publishedArticles)', '0']], (m) => gapOf({}, m) !== expect1)
    check('A2-MUT: a wrong article count is caught', gapMut)
    const withGap = draw({ ...base, gap: { articles: 2, scan: true, days: 5 } })
    check('A2 hero: "חסר כרגע: עוד 2 מאמרים שפורסמו, סריקה שהסתיימה, עוד 5 ימים באפליקציה" under the readiness text', text(withGap).includes('חסר כרגע: עוד 2 מאמרים שפורסמו, סריקה שהסתיימה, עוד 5 ימים באפליקציה') && text(withGap).includes('כדי שנשבץ קישורים חדשים צריך:'))
    check('A2 hero: one article / one day say "one"', text(draw({ ...base, gap: { articles: 1, scan: false, days: 1 } })).includes('חסר כרגע: עוד מאמר אחד שפורסם, עוד יום אחד באפליקציה'))
    check('A2 hero: an unknown reason keeps today\'s line (no "חסר כרגע")', !text(draw({ ...base, gap: null })).includes('חסר כרגע') && !text(draw({ ...base })).includes('חסר כרגע'))
    check('A2 hero: English', text(draw({ ...base, gap: { articles: 2, scan: true, days: null } }, 'en')).includes('Still missing: 2 more published articles, a finished scan'))
    const panelMut = await withMutant<any, boolean>('components/site-links/network/NetworkPanel.tsx', [['{gapLine && <p', '{false && <p']], (m) => !text(draw({ ...base, gap: { articles: 2, scan: true, days: 5 } }, 'he', m.default)).includes('חסר כרגע'))
    check('A2-MUT: a hero that drops the line is caught', panelMut)
    check('A2 server: the answer carries the gap only while the reason is "thin or new"', /gap: readinessReason === 'thin_or_new' \? readinessGap\(/.test(strip(read('lib/link-network/http.ts'))))

    // P1-3 policy.
    const pol = he.siteLinks.policy
    // Wave 9: the outreach list is gone, so the title names the rule itself (lib/__qa__/w9-links.qa.ts B10).
    check('A3 policy: paid links and swaps, and the network has no swaps (both languages)', pol.title === 'קישורים בתשלום והחלפות' && pol.body.includes('"קישור תמורת קישור"') && pol.body.endsWith('ברשת הקישורים שלנו אין החלפות: מי שמקבל מכם קישור לעולם לא מקבל חזרה.'.replace('לא מקבל חזרה', 'לא מקשר בחזרה')) && en.siteLinks.policy.title === 'Paid links and swaps' && en.siteLinks.policy.body.endsWith('whoever gets a link from you never links back.'))
    check('A3-MUT: the old "swaps of links" wording is not the text', !he.siteLinks.policy.body.includes('להחלפת קישורים'))

    // P2-9 the network's size.
    const small = text(draw({ ...base, membership: { active: false, since: null, leftAt: null }, readiness: 'ready', memberCount: 2 }))
    const big = text(draw({ ...base, membership: { active: false, since: null, leftAt: null }, readiness: 'ready', memberCount: 46 }))
    check('A4 (P2-9): under 10 sites the offer says "הרשת בהקמה", from 10 it names the count', small.includes('הרשת בהקמה') && !small.includes('2 אתרים') && big.includes('46 אתרים כבר ברשת'))
    const sizeMut = await withMutant<any, boolean>('components/site-links/network/NetworkPanel.tsx', [['data.memberCount >= NETWORK_SIZE_SHOWN_FROM', 'true']], (m) => text(draw({ ...base, membership: { active: false, since: null, leftAt: null }, readiness: 'ready', memberCount: 2 }, 'he', m.default)).includes('2 אתרים'))
    check('A4-MUT: always showing the count is caught', sizeMut)
  }

  // ── B. Safe-fix count ────────────────────────────────────────────────────
  console.log('\nB) The safe-fix count on the dashboard and the badge equals the health button')
  {
    const rows = require('../nudges/rows')
    const bulk = require('../site-fix/bulk')
    const { FIX_TYPE } = require('../site-health/rules')
    const caps: any = { available: true, readOnly: false, plugin: { state: 'connected', version: '2.1.0' }, channelFor: { seo_title: 'plugin', meta_description: 'plugin', image_alt: 'plugin' }, appPassword: false, webhook: false, wordpress: true }
    const page = (url: string, kind = 'page') => ({ url, kind, fixable: true })
    const findings = [
      { id: 'title_long', pages: [page('https://s.co/a'), page('https://s.co/b'), page('https://s.co/', 'home')] },
      { id: 'description_missing', pages: [page('https://s.co/a'), page('https://s.co/c')] },
      { id: 'images_alt', pages: [page('https://s.co/c')] },
    ]
    const raw = JSON.stringify({ v: 1, report: { findings }, fixed: [] })
    const job = (type: string, pageUrl: string, status = 'applied') => ({ id: `${type}${pageUrl}`, type, pageUrl, subject: null, status, appliedAt: new Date().toISOString(), approvedAt: new Date().toISOString(), batchId: 'b' })
    // The health screen's button: bulkCandidates over the same findings with the queue's own answer.
    const button = (jobs: any[]) => bulk.bulkCandidates(findings.map((f) => ({ ...f, fixType: FIX_TYPE[f.id] ?? null })), {
      fixable: (id: string, url: string) => { const f = findings.find((x) => x.id === id)!; return bulk.rowOpenForBulk(jobs, FIX_TYPE[f.id], url) }, jobs, now: Date.now(),
    }).length
    for (const jobs of [[], [job('seo_title', 'https://s.co/a')], [job('seo_title', 'https://s.co/a'), job('meta_description', 'https://s.co/c', 'pending')]]) {
      const nudge = rows.safeFixCountFromScan(raw, { capabilities: caps, jobs })
      check(`B1: ${jobs.length} job(s) in the queue: the nudge (${nudge}) equals the button (${button(jobs)})`, nudge === button(jobs))
    }
    const all = [job('seo_title', 'https://s.co/a'), job('seo_title', 'https://s.co/b'), job('meta_description', 'https://s.co/c'), job('image_alt', 'https://s.co/c')]
    const w: any = { ok: true, connectionDown: null, articles: 0, topics: 0, queued: 5, queueEndsAt: null, pluginConnected: true }
    check('B2: after the whole batch is applied: count 0, no row, no badge', rows.safeFixCountFromScan(raw, { capabilities: caps, jobs: all }) === 0 && rows.waitingRows('p', w, 0).length === 0 && rows.railCounts(w, 0).siteHealth === 0)
    check('B3: an unreadable queue is null: no row and no badge (never a guess)', rows.safeFixCountFromScan(raw, null) === null && rows.waitingRows('p', w, null).length === 0 && rows.railCounts(w, null).siteHealth === 0)
    check('B4: the exact copy, no "up to": "6 תיקונים בטוחים מוכנים לאתר" / "תיקון בטוח אחד מוכן לאתר"', he.waitingCard.fixes(6) === '6 תיקונים בטוחים מוכנים לאתר' && he.waitingCard.fixes(1) === 'תיקון בטוח אחד מוכן לאתר' && en.waitingCard.fixes(6) === '6 safe fixes are ready for your site' && !/עד |up to/i.test(he.waitingCard.fixes(9) + en.waitingCard.fixes(9)))
    const mut = await withMutant<any, boolean>('lib/nudges/rows.ts', [['jobs: fixes.jobs,', 'jobs: [],'], ['return !!t && rowOpenForBulk(fixes.jobs, t, url)', 'return !!t']], (m) => m.safeFixCountFromScan(raw, { capabilities: caps, jobs: all }) !== 0)
    check('B-MUT: a count that ignores the queue (the old estimate) is caught', mut)
    // One decision about whether the button exists, for both surfaces.
    const screen = strip(read('components/site-health/SiteHealthScreen.tsx'))
    const rowsSrc = strip(read('lib/nudges/rows.ts'))
    const oneEnable = (s: string, r: string) => /safeFixesEnabled\(caps\)/.test(s) && /safeFixesEnabled\(fixes\.capabilities\)/.test(r) && !/BULK_SAFE_TYPES\.every/.test(s + r)
    check('B5: the screen and the nudge ask the one `safeFixesEnabled` question', oneEnable(screen, rowsSrc))
    check('B5-MUT: a second copy of the rule is caught', !oneEnable(screen.replace('safeFixesEnabled(caps)', 'BULK_SAFE_TYPES.every((t) => caps.channelFor[t] === \'plugin\')'), rowsSrc))
    check('B6: the plugin unpaired, no live queue or Shopify: the button is absent, the count is 0', [{ plugin: { state: 'none' } }, { available: false }, { readOnly: true }, { channelFor: { seo_title: 'plugin' } }].every((o) => rows.safeFixCountFromScan(raw, { capabilities: { ...caps, ...o }, jobs: [] }) === 0))
    // The read behind the card and the badge: the health screen's own route, refreshed after every change of the queue.
    const hook = strip(read('components/nudges/useWaiting.ts'))
    const fixesHook = strip(read('components/site-health/useSiteFixes.ts'))
    const readOk = (h: string, f: string) => /\/api\/site-health\/fixes\?projectId=/.test(h) && /WAITING_REFRESH_EVENT/.test(h) && /announceWaitingChanged\(\)/.test(f)
    check('B7: the hook reads /api/site-health/fixes and re-reads when the health screen changes the queue', readOk(hook, fixesHook))
    check('B7-MUT: no re-read after a batch (the badge would stay) is caught', !readOk(hook, fixesHook.replace('announceWaitingChanged()', '')) && !readOk(hook.replace('addEventListener(WAITING_REFRESH_EVENT, onFocus)', ''), fixesHook.replace('announceWaitingChanged()', '')))
    check('B8: the hook shows an unreadable queue as null and never throws', /safeFixes: number \| null/.test(hook) && !/throw /.test(hook))
  }

  // ── C. Terms and Privacy ─────────────────────────────────────────────────
  console.log('\nC) The Terms and Privacy point at the switch that exists')
  {
    const files: Array<[string, string, string]> = [
      ['app/(public)/terms/page.tsx', 'במסך &quot;נראות ב-AI&quot;, בכרטיס &quot;בדיקה חודשית אוטומטית&quot;', 'he terms'],
      ['app/(legal)/privacy/page.tsx', 'במסך &quot;נראות ב-AI&quot;, בכרטיס &quot;בדיקה חודשית אוטומטית&quot;', 'he privacy'],
      ['app/(public)/en/terms/page.tsx', 'on the &ldquo;AI Visibility&rdquo; screen, in the &ldquo;Automatic monthly check&rdquo; card', 'en terms'],
      ['app/(public)/en/privacy/page.tsx', 'on the &ldquo;AI Visibility&rdquo; screen, in the &ldquo;Automatic monthly check&rdquo; card', 'en privacy'],
    ]
    for (const [file, phrase, name] of files) {
      const src = read(file)
      const at = src.search(/בדיקה חודשית אוטומטית|automatic monthly check/i)
      const around = src.slice(at, at + 700)
      const ok = (s: string) => s.includes(phrase) && !/בהגדרות הפרויקט|in the project settings/.test(s.slice(s.search(/בדיקה חודשית אוטומטית|automatic monthly check/i), s.search(/בדיקה חודשית אוטומטית|automatic monthly check/i) + 700))
      check(`C1 ${name}: names the "AI Visibility" screen and its card, not the project settings`, ok(src) && around.length > 0)
      check(`C1-MUT ${name}: the old "project settings" sentence is caught`, !ok(src.replace(phrase, name.startsWith('he') ? 'בהגדרות הפרויקט' : 'in the project settings')))
    }
    check('C2: the card and the tab carry those names in the dictionary', he.aiVisibilityOverview.autoSettingLabel === 'בדיקה חודשית אוטומטית' && he.sidebar.aiVisibility === 'נראות ב-AI' && en.aiVisibilityOverview.autoSettingLabel === 'Automatic monthly check' && en.sidebar.aiVisibility === 'AI Visibility')
  }

  // ── D. The ideas column ──────────────────────────────────────────────────
  console.log('\nD) The ideas column: the dashboard\'s number is visible on the board')
  {
    const board = require('../content/strategy/board')
    const StrategyBoard: any = require('../../components/content-strategy/StrategyBoard').default
    const card = (key: string, origin: string) => ({ key, column: 'ideas', title: key, keyword: null, date: '2026-09-20T00:00:00Z', dateKind: 'added', origin, reason: null, topicId: null, articleId: null, queued: false })
    const cards = [...['a', 'b', 'c', 'd'].map((k) => card(`idea:${k}`, 'plan')), card('ranking:x', 'ranking'), card('ranking:y', 'ranking')]
    const counts = board.ideaGroupCounts(cards)
    check('D1: 4 stored ideas + 2 from the rankings are counted apart', counts.plan === 4 && counts.ranking === 2 && counts.scan === 0)
    const drawBoard = (mod: any = StrategyBoard, list: any[] = cards, locale: Locale = 'he') => render(locale, createElement(mod, { cards: list, lang: locale, dict: getDashboardDictionary(locale) }))
    const html = drawBoard()
    const group = (h: string, kind: string) => text((new RegExp(`data-idea-group="${kind}">([\\s\\S]*?)<ul`).exec(h) ?? [])[1] ?? '')
    check('D2: the column names "רעיונות שהכנו (4)" and "הצעות מהדירוגים (2)"', /רעיונות שהכנו \(4\)/.test(group(html, 'plan')) && /הצעות מהדירוגים \(2\)/.test(group(html, 'ranking')))
    check('D2 en: "Ideas we prepared (4)" and "Suggestions from your rankings (2)"', /Ideas we prepared \(4\)/.test(group(drawBoard(StrategyBoard, cards, 'en'), 'plan')) && /Suggestions from your rankings \(2\)/.test(group(drawBoard(StrategyBoard, cards, 'en'), 'ranking')))
    check('D3: one kind only: no sub-headings (the column title is enough)', !/data-idea-group/.test(drawBoard(StrategyBoard, cards.filter((c) => c.origin === 'plan'))))
    const mut = await withMutant<any, boolean>('components/content-strategy/StrategyBoard.tsx', [['.length > 1\n    ? IDEA_GROUP_ORDER', '.length > 99\n    ? IDEA_GROUP_ORDER']], (m) => /data-idea-group="plan"/.test(drawBoard(m.default)))
    check('D-MUT: a column without its groups is caught', !mut)
    check('D4: the group of a card follows its origin (plan / ranking / scan)', board.ideaGroupOf({ origin: 'plan' }) === 'plan' && board.ideaGroupOf({ origin: 'ranking' }) === 'ranking' && board.ideaGroupOf({ origin: 'scan' }) === 'scan' && board.ideaGroupOf({ origin: 'manual' }) === 'plan')
    check('D5: the dashboard count is the pending stored ideas (lib/nudges/waiting.ts), the first group\'s number', /\.eq\('status', 'pending'\)/.test(strip(read('lib/nudges/waiting.ts'))))
  }

  // ── E. Settings, questions, "how it works" ───────────────────────────────
  console.log('\nE) Copy that promised too much, and the questions\' labels')
  {
    check('E1 (P1-5): the keyword helper no longer promises "no duplicate"', he.contentStrategy.ideaActions.keywordHint === 'הביטוי יתווסף לנושאים המאושרים. אם כבר יש עליו עמוד באתר, נציע לשפר אותו במקום לכתוב חדש.' && !/לא ניצור כפילות|no duplicate/.test(JSON.stringify(he.contentStrategy.ideaActions.keywordHint) + JSON.stringify(en.contentStrategy.ideaActions.keywordHint)))
    check('E2 (P1-6): the reminder switch says articles, like the description and the email', he.reminders.settingsLabel === 'תזכורת במייל כשמאמרים מחכים לאישור' && en.reminders.settingsLabel === 'Email me when articles are waiting for approval')
    const { createI18n } = require('../ai-visibility/i18n')
    const t = createI18n('he'), te = createI18n('en')
    check('E3 (P1-7): the "how it works" sentence is whole, both languages', t('run_a_check_hint').includes('בדיקה במנוע אחד, או במנועים נוספים (Perplexity, Copilot, Grok), נמצאת בתפריט ⋯ של השאלה. כל מנוע הוא בדיקה אחת מהמכסה.') && !t('run_a_check_hint').includes('מנוע בודד, כולל') && te('run_a_check_hint').includes('A check on a single engine, or on more engines (Perplexity, Copilot, Grok)') && !te('run_a_check_hint').includes('including the others'))
    const W = require('../ai-visibility/question-worth')
    const ctx = { businessName: 'Japan4U', identityLabel: 'מדריך טיולים ליפן לישראלים', category: 'travel', keywords: ['טיול יפן', 'חופשה ביפן', 'מלון ביפן'], scanTerms: ['טיול ליפן'], pages: [] }
    const info = W.scoreQuestion('כמה זמן מראש מומלץ לסגור חופשה ביפן?', 'recommendation', ctx)
    const names = W.scoreQuestion('איזו חברה מומלצת לארגון טיול ליפן?', 'recommendation', ctx)
    check('E4 (P1-8b): "how far ahead should I book a holiday" is an information question, not "AI answers with names"', info.why.value === 'learn' && t('worth_value_learn') === 'שאלת מידע ש-AI עונה עליה עם מקורות', info.why.value)
    check('E4: a question that asks for a business or provider keeps "choose"', names.why.value === 'choose' && t('worth_value_choose') === 'מבקשים המלצה, ו-AI עונה בשמות של עסקים', names.why.value)
    check('E4: the request word and the provider word are both needed', W.asksForNames('איזו סוכנות מומלצת לארגון טיולים') && W.asksForNames('best travel agency in Israel') && !W.asksForNames('כמה זמן מראש מומלץ להזמין?') && !W.asksForNames('חברה לארגון טיולים'))
    check('E4: the score is untouched by the relabel (same points as before)', info.value === 26 || info.value === 22, info.value)
    const wmut = await withMutant<any, boolean>('lib/ai-visibility/question-worth.ts', [["if (valueKind === 'choose' && intent !== 'local' && !asksForNames(prompt)) valueKind = 'learn'", '']], (m) => m.scoreQuestion('כמה זמן מראש מומלץ לסגור חופשה ביפן?', 'recommendation', ctx).why.value === 'learn')
    check('E4-MUT: labelling every "recommended" question as a request for names is caught', !wmut)

    // (a) the brand question: tracked, never an article.
    const { SmartQuestionCard } = require('../../components/ai-visibility/sections/SmartQuestionCard')
    const q = (value: string) => ({ id: 'q', prompt: 'חוות דעת על Japan4U', intent: 'brand', reason: '', chips: [], valueReason: '', worth: { score: 80, relevance: 40, value: 18, winnability: 20, why: { relevance: { kind: 'brand' }, value, win: 'tracked' }, answeringPage: null, specificity: 'brand' } })
    const article = { status: 'none', busy: false, failed: false, onWrite() {}, topicHref: '/t', articleHref: null, existingHref: '/e' }
    const card = (mod: any, value: string, tracked = false) => renderToStaticMarkup(createElement(mod, { question: q(value), onAdd() {}, t, isAlreadyTracked: tracked, article }))
    const brand = card(SmartQuestionCard, 'brand'), other = card(SmartQuestionCard, 'buy')
    check('E5 (P1-8a): a question about the business offers "הוסיפו לשאלות AI" and no article button', brand.includes('data-question-track-brand') && text(brand).includes('הוסיפו לשאלות AI') && !text(brand).includes('כתוב מאמר שיענה על השאלה'))
    check('E5: any other question still offers the article', text(other).includes('כתוב מאמר שיענה על השאלה') && !other.includes('data-question-track-brand'))
    check('E5: an already-tracked brand question shows no second action', !card(SmartQuestionCard, 'brand', true).includes('data-question-track-brand') && !text(card(SmartQuestionCard, 'brand', true)).includes('כתוב מאמר'))
    const cmut = await withMutant<any, boolean>('components/ai-visibility/sections/SmartQuestionCard.tsx', [[') : brandQuestion ? (', ') : false ? (']], (m) => card(m.SmartQuestionCard, 'brand').includes('כתוב מאמר') || /qa_write|כתוב מאמר/.test(text(card(m.SmartQuestionCard, 'brand'))))
    check('E5-MUT: the article button back on a brand question is caught', cmut)
    check('E5: the label exists in both languages', t('qa_track_brand') === 'הוסיפו לשאלות AI' && te('qa_track_brand') === 'Add to AI questions')
  }

  // ── F. llms.txt box ──────────────────────────────────────────────────────
  console.log('\nF) The llms.txt text box reads left to right')
  {
    const modal = strip(read('components/site-health/ApproveFixModal.tsx'))
    const css = read('app/globals.css')
    const ok = (s: string) => /const LLMS_TEXT_STYLE = \{ direction: 'ltr', textAlign: 'left', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' \} as const/.test(s) && /<Textarea id="approve-llms"[^\n]*dir="ltr" style=\{LLMS_TEXT_STYLE\}/.test(s) && !/wrap="off"/.test(s)
    check('F1: direction, alignment and wrapping are set INLINE on the box (long addresses wrap, nothing is cut)', ok(modal))
    check('F1-MUT: the old attribute-only box is caught', !ok(modal.replace(' style={LLMS_TEXT_STYLE}', ' wrap="off"')))
    check('F2: why inline: globals.css sets `textarea { direction: rtl; text-align: right }` outside any layer, beating the dir attribute and utilities', /\ntextarea,[\s\S]{0,60}\{\s*direction: rtl;\s*text-align: right;/.test(css) || /input,\s*textarea,\s*select \{\s*direction: rtl;\s*text-align: right;/.test(css))
  }

  // ── G. Contact hours and the accessibility statement ────────────────────
  console.log('\nG) No contact hours; the accessibility statement')
  {
    const menu = strip(read('components/guide/ContactMenu.tsx'))
    check('G1 (P1-10): the app contact menu shows no hours; WhatsApp, phone and email stay', !/t\.hours|data-contact-hours/.test(menu) && /key: 'whatsapp'[\s\S]*key: 'phone'[\s\S]*key: 'email'/.test(menu) && !('hours' in he.contact) && !('hours' in en.contact))
    const sources = ['components/guide/ContactMenu.tsx', 'components/public/PublicContactMenu.tsx', 'components/Footer.tsx', 'components/PublicNav.tsx', 'app/(public)/about/page.tsx', 'components/public/AboutPage.tsx'].map((f) => { try { return strip(read(f)) } catch { return '' } }).join('\n')
    check('G1b: no opening-hours line anywhere in the contact entries or the About page', !/9:00-18:00|9:00–18:00|עונים בימים|We answer Sun/.test(sources + JSON.stringify(he.contact) + JSON.stringify(en.contact)))
    const acc = read('app/(legal)/accessibility/page.tsx')
    const accOk = (s: string) => s.includes('תוויות ברורות לכל שדה בטפסים') && !s.includes('טפטופיים')
      && s.includes('ת&quot;י 5568') && s.includes('WCAG 2.0 ברמה AA') && s.includes('התאמות נגישות לשירות')
      && !/אם נתקלת |אנא צור קשר|אנא שלח |אם יש לך/.test(s) && s.includes('אם נתקלתם בבעיה בנגישות, אנא צרו קשר') && s.includes('אם יש לכם הצעות לשיפור, אנא שלחו לנו')
      && s.includes('oren@gotop.co.il') && s.includes('054-9489377') && !/רכז(ת)? הנגישות:\s*[א-ת]{2,}\s+[א-ת]{2,}/.test(s) && s.includes('חלקים שעדיין לא נגישים במלואם')
    check('G2 (P1-11): a meaningful field-label line, the Israeli standard ת"י 5568 (WCAG 2.0 AA), plural address, the existing contact details, no invented coordinator name', accOk(acc))
    check('G2-MUT: the meaningless phrase, the masculine singular, or an invented name is caught',
      !accOk(acc.replace('תוויות ברורות לכל שדה בטפסים', 'תוויות תיאוריות למכשירים טפטופיים (form fields)')) && !accOk(acc.replace('אם נתקלתם בבעיה בנגישות, אנא צרו קשר', 'אם נתקלת בבעיה בנגישות, אנא צור קשר')) && !accOk(acc.replace('המשמש גם כרכז הנגישות של השירות', 'המשמש גם כרכז הנגישות של השירות. רכז הנגישות: דני כהן')))
    check('G2: the claim is one that is true: "we work to bring it in line", not "is certified"', /אנו פועלים להתאים את האתר והמערכת לתקן זה/.test(acc) && !/אושר|הוסמך|מוסמך|תעודת הסמכה/.test(acc))
    const accEn = read('app/(public)/en/accessibility/page.tsx')
    check('G3: the English statement says the same (SI 5568, WCAG 2.0 AA, no certification claim)', accEn.includes('SI 5568') && accEn.includes('WCAG 2.0 at Level AA') && accEn.includes('Clear labels for every form field') && !/certif/i.test(accEn))
  }

  // ── H. The polish list ───────────────────────────────────────────────────
  console.log('\nH) Polish (P2)')
  {
    const ov = he.aiVisibilityOverview
    check('H1: the AI hero\'s next step names the automatic check\'s date', ov.nextStepKeepGoingAuto('17 באוק׳') === 'הבדיקה האוטומטית הבאה ב-17 באוק׳. אפשר לבדוק שוב גם לפני כן, מתוך המכסה.' && en.aiVisibilityOverview.nextStepKeepGoingAuto('Oct 17').startsWith('The next automatic check is on Oct 17.'))
    const orows = strip(read('components/ai-visibility/OverviewRows.tsx'))
    const nextOk = (s: string) => /nextAutoDate \? c\.nextStepKeepGoingAuto\(nextAutoDate\) : c\.nextStepKeepGoing/.test(s) && /nextAutoDate=\{monthlyNextDate\(monthly\)/.test(s)
    check('H1: the auto date is used only when an automatic check is scheduled', nextOk(orows))
    check('H1-MUT: dropping the date is caught', !nextOk(orows.replace('nextAutoDate ? c.nextStepKeepGoingAuto(nextAutoDate) : c.nextStepKeepGoing', 'c.nextStepKeepGoing')))
    const sc = require('../../components/ai-visibility/sections/ScoreCards')
    const tt = require('../ai-visibility/i18n').createI18n('he')
    check('H2: "1 out of 1 answers" reads "מתוך תשובה אחת"; more stay "מתוך 5 תשובות"', sc.outOf(tt, 1) === 'מתוך תשובה אחת' && sc.outOf(tt, 5) === 'מתוך 5 תשובות' && he.aiVisibilityOverview.ofAnswers(1) === 'מתוך תשובה אחת')
    const fmt = require('../../components/gsc/format')
    check('H3: Hebrew never shows a "K": 1,200 / 12.5 אלף / 2.3 מיליון; English keeps 1.2K', fmt.formatCompact(1200, 'he') === '1,200' && fmt.formatCompact(950, 'he') === '950' && fmt.formatCompact(12500, 'he') === '12.5 אלף' && fmt.formatCompact(2300000, 'he') === '2.3 מיליון' && fmt.formatCompact(1200, 'en') === '1.2K' && !/[KM]/.test(fmt.formatCompact(1234567, 'he')))
    const fmtMut = await withMutant<any, boolean>('components/gsc/format.ts', [["if (language === 'he') {", "if (false) {"]], (m) => /K/.test(m.formatCompact(1200, 'he')))
    check('H3-MUT: the "K" back in Hebrew is caught', fmtMut)

    const cta = require('../content/article-style/cta')
    check('H4a: the CTA hint says "off until you turn it on" only in the off state', /cta\.enabled \? a\.cta\.hint : `\$\{a\.cta\.hint\} \$\{a\.cta\.hintOff\}`/.test(strip(read('components/settings/ArticleStyleCard.tsx'))) && !he.projectSettings.articleStyle.cta.hint.includes('כבויה עד') && he.projectSettings.articleStyle.cta.hintOff === 'כבויה עד שתפעילו אותה.')
    check('H4b: the toggle hint no longer says "בוורדפרס ובאתר שמחובר אלינו"', he.projectSettings.articleStyle.cta.toggleHint.includes('באתר WordPress ובאתר שמקבל מאיתנו מאמרים אוטומטית') && !he.projectSettings.articleStyle.cta.toggleHint.includes('בוורדפרס'))
    const entries = [{ u: 'https://s.co.il/' }, { u: 'https://s.co.il/blog/x' }, { u: 'https://www.s.co.il/he/contact-us/' }, { u: 'https://s.co.il/contact' }, { u: 'https://other.co.il/contact' }, { u: 'https://s.co.il/צרו-קשר/' }]
    check('H4c: the contact page is found among the site map\'s pages (own domain only, shortest path)', cta.findContactUrl(entries, 's.co.il') === 'https://s.co.il/contact' && cta.findContactUrl([{ u: 'https://s.co.il/' }], 's.co.il') === null && cta.findContactUrl([{ u: 'https://other.co.il/contact' }], 's.co.il') === null && cta.findContactUrl(null, 's.co.il') === null)
    const copy = he.projectSettings.articleStyle.cta.suggestion
    check('H4c: the suggestion links to the contact page when known, else the home page', cta.suggestArticleCta({ business: 'x', niche: 'y', domain: 's.co.il', contactUrl: 'https://s.co.il/contact' }, copy).buttonUrl === 'https://s.co.il/contact' && cta.suggestArticleCta({ business: 'x', niche: 'y', domain: 's.co.il' }, copy).buttonUrl === 'https://s.co.il/' && cta.suggestArticleCta({ business: 'x', domain: 's.co.il', contactUrl: 'javascript:alert(1)' }, copy).buttonUrl === 'https://s.co.il/')
    const ctaMut = await withMutant<any, boolean>('lib/content/article-style/cta.ts', [['(subject.contactUrl && normalizeCtaUrl(subject.contactUrl)) || ', '']], (m) => m.suggestArticleCta({ business: 'x', domain: 's.co.il', contactUrl: 'https://s.co.il/contact' }, copy).buttonUrl !== 'https://s.co.il/contact')
    check('H4c-MUT: ignoring the contact page is caught', ctaMut)
    const dataSrc = strip(read('lib/content/article-style/data.ts'))
    check('H4c: the site map is read with the owner\'s client, by project AND owner, and any failure is "not known"', /from\('site_page_map'\)\.select\('entries'\)\.eq\('project_id', o\.projectId\)\.eq\('user_id', o\.userId\)/.test(dataSrc) && /readContactUrl[\s\S]{0,700}catch \{\s*return null/.test(dataSrc))
    const prev = strip(read('components/settings/ArticleStylePreview.tsx'))
    const scrollOk = (s: string) => /querySelector<HTMLElement>\('\[data-as="pcta"\]'\)/.test(s) && /has && !hadCta\.current/.test(s) && /region\.scrollTo\(/.test(s) && /prefers-reduced-motion: reduce/.test(s) && /behavior: reduce \? 'auto' : 'smooth'/.test(s)
    check('H5: turning the CTA on scrolls the preview\'s own region to the box (instant with reduced motion)', scrollOk(prev))
    check('H5-MUT: no scroll, or a page-level scrollIntoView, is caught', !scrollOk(prev.replace('region.scrollTo(', 'void(')) && !scrollOk(prev.replace("behavior: reduce ? 'auto' : 'smooth'", "behavior: 'smooth'")))
    check('H6: "כותרת הבלוק" (jargon) became "הכותרת מעל השאלות"', he.siteHealth.autofix.approve.labels.faqHeading === 'הכותרת מעל השאלות' && en.siteHealth.autofix.approve.labels.faqHeading === 'Heading above the questions')
    const { createI18n } = require('../ai-visibility/i18n')
    check('H7: the engine items say they cost one check each', createI18n('he')('check_on_engine_menu') === 'בדיקה ב-{engine} (בדיקה אחת)' && createI18n('en')('check_on_engine_menu') === 'Check on {engine} (1 check)')

    const format = require('../../components/content/workspace/existing/format')
    const item = (o: any) => ({ title: 'Solar heater not heating', titleFromUrl: true, isHome: false, url: 'https://s.co.il/blog/solar-heater-not-heating', metrics: null, ...o })
    check('H8a: a Search Console page named from an English address shows its path (or its Hebrew keyword), never the invented English name', format.rowTitle(item({}), 'דף הבית', true).text === '/blog/solar-heater-not-heating' && format.rowTitle(item({ metrics: { topQuery: 'דוד שמש לא מחמם' } }), 'דף הבית', true).text === 'דוד שמש לא מחמם' && format.rowTitle(item({ metrics: { topQuery: 'solar heater' } }), 'דף הבית', true).isPath)
    check('H8a: a real title, a Hebrew slug name, English screens and the home page are unchanged', format.rowTitle(item({ titleFromUrl: false }), 'דף הבית', true).text === 'Solar heater not heating' && format.rowTitle(item({ title: 'דוד שמש' }), 'דף הבית', true).text === 'דוד שמש' && format.rowTitle(item({}), 'Home', false).text === 'Solar heater not heating' && format.rowTitle(item({ isHome: true }), 'דף הבית', true).text === 'דף הבית')
    const titleMut = await withMutant<any, boolean>('components/content/workspace/existing/format.ts', [['if (!hebrew || !it.titleFromUrl', 'if (true || !it.titleFromUrl']], (m) => m.rowTitle(item({}), 'דף הבית', true).text === 'Solar heater not heating')
    check('H8a-MUT: showing the invented English name again is caught', titleMut)
    const hero = strip(read('components/ui/HeroPanel.tsx'))
    check('H8b: a hero tile\'s caption wraps instead of ending in "…"', /\{hint && <p className="mt-1 text-pretty text-caption/.test(hero) && !/\{hint && <p className="mt-1 truncate/.test(hero))
    check('H8b-MUT: the truncating caption is caught', !/\{hint && <p className="mt-1 text-pretty text-caption/.test(hero.replace('mt-1 text-pretty text-caption', 'mt-1 truncate text-caption')))

    // P2-11: the sign stays before the digits.
    const { ChangePoints } = require('../../components/ai-visibility/OverviewRows')
    const cp = renderToStaticMarkup(createElement(ChangePoints, { text: he.aiVisibilityOverview.changePoints(-5) }))
    check('H9: "−5 נק׳": the number is its own left-to-right run, the unit follows', /<bdi dir="ltr">−5<\/bdi> נק׳/.test(cp) && text(cp).trim() === '−5 נק׳', cp)
    check('H9: English "+3 pts"', /<bdi dir="ltr">\+3<\/bdi> pts/.test(renderToStaticMarkup(createElement(ChangePoints, { text: en.aiVisibilityOverview.changePoints(3) }))))
    const cpMut = await withMutant<any, boolean>('components/ai-visibility/OverviewRows.tsx', [['<bdi dir="ltr">{num}</bdi>', '{num}']], (m) => /<bdi dir="ltr">−5<\/bdi>/.test(renderToStaticMarkup(createElement(m.ChangePoints, { text: '−5 נק׳' }))))
    check('H9-MUT: a bare number (the sign after the digits in Hebrew) is caught', !cpMut)
  }

  // ── I. The home page: dark from the four steps down (owner decision) ────
  console.log('\nI) The home page is dark from "four steps" down')
  {
    const land = strip(read('components/public/LandingPage.tsx'))
    const from = land.slice(land.indexOf('<Section tone="deep" id="how-it-works"'))
    const lightAfter = (src: string) => /<Section(?=[\s>])(?![^>]*tone="(deep|contrast)")[^>]*>/.test(src) || /<Section [^>]*tone="(canvas|surface)"/.test(src) || /<section[^>]*className=\{?["`'][^>]*\bbg-(canvas|surface|sunk)\b/.test(src)
    check('I1: steps, audience and FAQ are dark sections', /data-steps-tone="dark"/.test(from) && /data-audience-tone="dark"/.test(from) && /data-faq-tone="dark"/.test(from) && (from.match(/<Section tone="deep"/g) ?? []).length === 3)
    check('I2: no light section from the steps down', !lightAfter(from))
    check('I2-MUT: a light FAQ section is caught', lightAfter(from.replace('<Section tone="deep" data-faq-tone="dark">', '<Section data-faq-tone="dark">')))
    const cssv = read('app/globals.css')
    check('I3: the deeper navy exists in both themes', /--color-contrast-deep:\s*#06122b/i.test(cssv) && /--color-contrast-deep:\s*#0a1834/i.test(cssv))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
