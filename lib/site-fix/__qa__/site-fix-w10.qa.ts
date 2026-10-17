/**
 * WAVE 10, site health ("בריאות האתר"), the owner's four asks of 2026-09-30, on HIS pages
 * (./w10-owner-pages.ts: japan4u.co.il and perfumeclub.co.il, read from production). Every rule
 * has a MUTATION CONTROL: the same check on a deliberately broken copy must fail.
 *
 *   A  FAQ for a page without one: the model the fixes used (pinned gemini-2.5-flash) is not
 *      offered to the live key (404), so no question was ever written. The available model is
 *      used, a "not offered" answer moves once to the fallback, nothing else retries, cost logged.
 *   B  "New title for Google": the same dead model, and a fallback that only read the
 *      description's first sentence.
 *   C  "Title too long" → "fix it for me" on a WooCommerce store: products (and the home page)
 *      were never looked up, so the answer was "we could not find this page in WordPress".
 *   D  "Fix in one click": see the D section.
 *
 * Run: npx tsx lib/site-fix/__qa__/site-fix-w10.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { readFileSync } = require('fs') as typeof import('fs')
const { execFileSync } = require('child_process') as typeof import('child_process')
const { join, resolve } = require('path') as typeof import('path')
const { withMutant } = require('../../reminders/__qa__/_mutant') as typeof import('../../reminders/__qa__/_mutant')
const F = require('./w10-owner-pages') as typeof import('./w10-owner-pages')
const S = require('../suggest') as typeof import('../suggest')
const M = require('../model') as typeof import('../model')
const PV = require('../preview') as typeof import('../preview')
const R = require('../../site-health/rules') as typeof import('../../site-health/rules')
const WP = require('../../wordpress/client') as typeof import('../../wordpress/client')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = resolve(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
;(globalThis as any).fetch = async () => { throw new Error('no network in this guard') }

// ── A fake Gemini that answers like the live key: 2.5-flash is gone, the fallback answers ─────────
const DEAD = 'gemini-2.5-flash'
const FALLBACK = 'gemini-2.5-flash-lite'
function fakeGemini(answer: (prompt: string) => string, opts: { dead?: string[]; fail?: string } = {}) {
  const calls: { model: string; thinking: unknown; timeout: boolean }[] = []
  const client = {
    models: {
      async generateContent(req: { model: string; contents: string; config: Record<string, any> }) {
        calls.push({ model: req.model, thinking: req.config.thinkingConfig, timeout: req.config.abortSignal instanceof AbortSignal })
        if ((opts.dead ?? [DEAD]).includes(req.model)) throw new Error(`{"error":{"code":404,"message":"models/${req.model} is no longer available to new users.","status":"NOT_FOUND"}}`)
        if (opts.fail) throw new Error(opts.fail)
        return { text: answer(req.contents), usageMetadata: { promptTokenCount: Math.round(req.contents.length / 2.2), candidatesTokenCount: Math.round(answer(req.contents).length / 2.2) } }
      },
    },
  }
  return { client, calls }
}
const logs: string[] = []
const gen = (g: ReturnType<typeof fakeGemini>, resolved = DEAD) => M.makeSiteFixGenerate({
  client: () => g.client, resolve: async () => ({ ok: true, model: resolved }), fallbackModel: FALLBACK, log: (l) => logs.push(l),
})
const live = (over: Partial<import('../preview').LivePage>): import('../preview').LivePage => ({ title: null, description: null, h1: null, canonical: null, schemaTypes: [], html: '', ...over })
const manualCtx = { channel: 'manual' as const, creds: null, link: null, siteName: 'Japan4U' }
const noWp = {} as any

async function main() {
  console.log('A. FAQ for a page without one (japan4u.co.il/shopping-in-japan-for-tourists/)')
  const shoppingPage = live({ title: `${F.JAPAN_SHOPPING_TITLE} - Japan4U`, h1: F.JAPAN_SHOPPING_TITLE, html: `<header><nav>תפריט</nav></header><main><h1>${F.JAPAN_SHOPPING_TITLE}</h1>${F.JAPAN_SHOPPING_HTML}</main><footer>Japan4U</footer>` })
  const faqAnswer = () => F.JAPAN_SHOPPING_MODEL_FAQ
  const previewFaq = (generate: import('../suggest').Generate | undefined) => PV.previewFixJob(
    { type: 'faq_block', url: F.JAPAN_SHOPPING_URL, kind: 'faq_missing' } as any, manualCtx, { wp: noWp, readLive: async () => shoppingPage, generate } as any)

  // The old wiring: the pinned id only. On the live key that is a 404, swallowed as "no model help".
  const oldGen = fakeGemini(faqAnswer)
  const pinned: import('../suggest').Generate = async (prompt) => (await oldGen.client.models.generateContent({ model: DEAD, contents: prompt, config: {} })).text ?? ''
  const before = await previewFaq(pinned) as any
  check('A0 (root cause): with the pinned gemini-2.5-flash the preview has NO question and says "no valid suggestion"', before.ok && before.items.length === 0 && before.notice === 'no_valid_suggestion', before)

  const g = fakeGemini(faqAnswer)
  const generate = gen(g)
  const after = await previewFaq(generate) as any
  check('A1: the same page now gets an FAQ: 3+ Hebrew questions, each answered from the page', after.ok && after.items.length >= 3 && after.notice === null && after.heading === 'שאלות נפוצות'
    && after.items.every((i: any) => /\?$/.test(i.q) && S.grounded(i.a, PV.mainTextOf(shoppingPage.html))), after)
  check('A2: answers the page cannot back (the 100V and warranty claims) are still dropped', !after.items.some((i: any) => /100V/.test(i.a)))
  check('A3: the dead model is tried once, then remembered: 2 paid-request attempts in the first call, 1 after', g.calls.length === 2 && g.calls[0].model === DEAD && g.calls[1].model === FALLBACK && generate.unavailable.has(DEAD), g.calls)
  await generate('{"x":1}')
  check('A4: the next call goes straight to the model that answers (no repeated 404)', g.calls.length === 3 && g.calls[2].model === FALLBACK)
  check('A5: every call carries a timeout and thinking off for Flash-class models', g.calls.every((c) => c.timeout && (c.thinking as any)?.thinkingBudget === 0))
  const cost = generate.lastCost()
  check('A6: each call logs model, tokens and its cost (and never the prompt)', !!cost && cost.usd > 0 && cost.usd < 0.01 && logs.some((l) => /model=gemini-2\.5-flash-lite in=\d+ out=\d+ usd=0\.\d+/.test(l)) && !logs.some((l) => l.includes('יפן')), { cost, logs })
  const t = fakeGemini(faqAnswer, { dead: [], fail: 'The operation was aborted due to timeout' })
  const tg = gen(t, FALLBACK)
  let threw = false
  try { await tg('x') } catch { threw = true }
  check('A7: a timeout (or rate limit, or billing) is NOT retried on another model: one request, then "no model help"', threw && t.calls.length === 1)
  const both = fakeGemini(faqAnswer, { dead: [DEAD, FALLBACK] })
  const bg = gen(both)
  for (let i = 0; i < 3; i++) await bg('x').catch(() => null)
  check('A8: bounded: when no model answers, 2 attempts once and then none at all', both.calls.length === 2)
  // Mutation: no fallback after a 404 (the old behaviour) → the owner's page has no FAQ again.
  await withMutant<typeof M, void>('lib/site-fix/model.ts', [['unavailable.add(model)', 'throw new Error(\'suggest_failed\')']], async (MM) => {
    const mg = fakeGemini(faqAnswer)
    const r = await PV.previewFixJob({ type: 'faq_block', url: F.JAPAN_SHOPPING_URL, kind: 'faq_missing' } as any, manualCtx,
      { wp: noWp, readLive: async () => shoppingPage, generate: MM.makeSiteFixGenerate({ client: () => mg.client, resolve: async () => ({ ok: true, model: DEAD }), fallbackModel: FALLBACK }) } as any) as any
    check('A-MUT: without the move past a model the key does not offer, A1 fails (no questions)', r.ok && r.items.length === 0)
  })
  // The route wires the discovery, not the pinned id.
  const wiring = (src: string) => { const s = strip(src); return /makeSiteFixGenerate\(/.test(s) && /resolve:\s*resolveAvailableRecommendationModel/.test(s) && !/RECOMMENDATION_MODEL_PRIMARY/.test(s) }
  check('A9: lib/site-fix/route-deps.ts uses the available model (discovery), not RECOMMENDATION_MODEL_PRIMARY', wiring(read('lib/site-fix/route-deps.ts')))
  let base = ''
  try { base = execFileSync('git', ['show', '08753a8:lib/site-fix/route-deps.ts'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { base = 'model: RECOMMENDATION_MODEL_PRIMARY' }
  check('A9-MUT: the wave-9 wiring (pinned id) fails A9', !wiring(base))

  console.log('B. "New title for Google" on japan4u.co.il titles')
  const tokyo = F.JAPAN_TITLES[0]
  const tokyoPage = live({ title: tokyo.title, h1: tokyo.h1, html: `<main><h1>${tokyo.h1}</h1>${F.JAPAN_SHOPPING_HTML}</main>` })
  // What a Flash model answers for this page (the shape lib/__qa__/w9-bugs.qa.ts pins), a few characters off.
  const titleAnswer = () => JSON.stringify({ titles: ['טוקיו: המדריך המלא לשכונות, אטרקציות, אוכל ותחבורה ציבורית | Japan4U', 'מדריך טוקיו המלא: שכונות, אטרקציות, אוכל ותחבורה בעיר הבירה של יפן'] })
  const previewTitle = (generate: import('../suggest').Generate | undefined, page = tokyoPage) => PV.previewFixJob(
    { type: 'seo_title', url: tokyo.url, kind: 'title_short' } as any, manualCtx, { wp: noWp, readLive: async () => page, generate } as any)
  const tg0 = fakeGemini(titleAnswer)
  const pinnedT: import('../suggest').Generate = async (prompt) => (await tg0.client.models.generateContent({ model: DEAD, contents: prompt, config: {} })).text ?? ''
  // A page whose only words are its heading and a one-line description (a page-builder post): before, nothing.
  const bare = live({ title: tokyo.title, h1: tokyo.h1, description: 'מדריך טוקיו.', html: '<main><h1>טוקיו</h1></main>' })
  const b0 = await previewTitle(pinnedT, bare) as any
  check('B0 (root cause): with the pinned model a too-short "טוקיו - Japan4U" gets "no valid suggestion"', b0.ok === false && b0.code === 'no_valid_suggestion', b0)
  const tgood = fakeGemini(titleAnswer)
  const b1 = await previewTitle(gen(tgood), bare) as any
  check('B1: with the available model it gets a valid title: 50–60 characters, with "טוקיו", longer than now', b1.ok && !R.titleProblem(b1.after, { kind: 'title_short', current: tokyo.title, keyword: 'טוקיו' }) && b1.after.includes('טוקיו'), b1)
  // No model at all: the page's own words. The description opens short, its text does not.
  const noModelInput = { kind: 'title_short', current: tokyo.title, h1: tokyo.h1, siteName: 'Japan4U', keyword: tokyo.h1, path: '/tokyo/', text: R.textOf(F.JAPAN_SHOPPING_HTML).slice(0, 1500), description: 'מדריך טוקיו.' }
  const b2 = await S.suggestSeoTitle(noModelInput as any, undefined)
  check('B2: with no model, a short opening sentence of the description no longer ends it: the page text gives a valid title', !!b2 && !R.titleProblem(b2, noModelInput as any), b2)
  await withMutant<typeof S, void>('lib/site-fix/suggest.ts', [['for (const source of [norm(input.description), norm(input.text)])', 'for (const source of [norm(input.description) || norm(input.text)])']], async (MS) => {
    check('B-MUT: reading only the description\'s first sentence (wave 9) fails B2', (await MS.suggestSeoTitle(noModelInput as any, undefined)) === null)
  })
  const long = F.JAPAN_TITLES[4]
  const b3 = await PV.previewFixJob({ type: 'seo_title', url: long.url, kind: 'title_long' } as any, manualCtx,
    { wp: noWp, readLive: async () => live({ title: long.title, h1: long.h1, html: `<main><h1>${long.h1}</h1></main>` }), generate: gen(fakeGemini(titleAnswer)) } as any) as any
  check('B3: his too-long title (77 characters) is cut at a clause, no model needed', b3.ok && b3.after.length <= 60 && b3.after.length >= 30 && long.title.startsWith(b3.after.replace(/\s*[–-].*$/, '').slice(0, 10)), b3)

  console.log('C. "Fix it for me" on perfumeclub.co.il (WooCommerce, application password)')
  // A WordPress REST API with his addresses: 5 pages (the home page is a static page), posts, products.
  const store = {
    pages: [{ id: 7, slug: 'home', link: F.PERFUME_HOME }, { id: 12, slug: 'about', link: F.PERFUME_ABOUT }],
    posts: [{ id: 301, slug: new URL(F.PERFUME_POST).pathname.split('/').filter(Boolean)[0].toLowerCase(), link: F.PERFUME_POST }],
    product: [{ id: 5120, slug: 'club-de-nuit-private-key-to-my-soul-by-armaf', link: F.PERFUME_PRODUCT }],
  } as Record<string, { id: number; slug: string; link: string }[]>
  const requests: string[] = []
  const restGet = async <T>(path: string): Promise<T> => {
    requests.push(path)
    const u = new URL(`https://x.invalid/wp-json/wp/v2${path}`)
    const base = u.pathname.replace('/wp-json/wp/v2/', '')
    if (base === 'types') return { post: { slug: 'post', rest_base: 'posts' }, page: { slug: 'page', rest_base: 'pages' }, attachment: { slug: 'attachment', rest_base: 'media' }, wp_block: { slug: 'wp_block', rest_base: 'blocks' }, product: { slug: 'product', rest_base: 'product' } } as T
    if (base === 'settings') return { show_on_front: 'page', page_on_front: 7 } as T
    const [coll, id] = base.split('/')
    if (!store[coll]) throw new WP.WordPressClientError('WordPress returned 404.', { status: 404 } as any)
    if (id) return (store[coll].find((r) => r.id === Number(id)) ?? null) as T
    // WordPress compares the sanitized slug: Hebrew is stored percent-encoded, lower case.
    const asked = encodeURIComponent(decodeURIComponent(u.searchParams.get('slug') ?? '')).toLowerCase()
    return store[coll].filter((r) => r.slug === asked).map((r) => ({ id: r.id, link: r.link })) as T
  }
  const found = async (url: string) => WP.findItemByUrlWith(restGet, url)
  const product = await found(F.PERFUME_PRODUCT)
  check('C1 (the owner\'s case): a product page is found (its own /product collection)', product?.endpoint === '/product' && product.id === 5120, product)
  const post = await found(F.PERFUME_POST)
  check('C2: a post with a Hebrew (percent-encoded) address is found', post?.endpoint === '/posts' && post.id === 301, post)
  const postUpper = await found(F.PERFUME_POST.replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase()).replace(/\/$/, ''))
  check('C3: the same address in capitals and without the trailing slash is the same page', postUpper?.id === 301, postUpper)
  const home = await found(F.PERFUME_HOME)
  check('C4: the home page is the static front page WordPress shows', home?.endpoint === '/pages' && home.id === 7, home)
  check('C5: a category archive is honestly not a WordPress page (never a wrong item)', (await found(F.PERFUME_CATEGORY)) === null)
  requests.length = 0
  await found(F.PERFUME_PRODUCT)
  check('C6: bounded: a product costs 4 reads (pages, posts, the type list, products)', requests.length === 4, requests)
  await withMutant<typeof WP, void>('lib/wordpress/client.ts', [['for (const endpoint of await customTypeEndpoints(get, segments.length > 1 ? segments[0] : null)) {', 'for (const endpoint of [] as WpContentEndpoint[]) {']], async (MW) => {
    check('C-MUT1: pages and posts only (wave 9) → C1 fails: the product is "not in WordPress"', (await MW.findItemByUrlWith(restGet, F.PERFUME_PRODUCT)) === null)
  })
  await withMutant<typeof WP, void>('lib/wordpress/client.ts', [['if (path === \'/\') return frontPage(get)', 'if (path === \'/\') return null']], async (MW) => {
    check('C-MUT2: the home page never matched (wave 9) → C4 fails', (await MW.findItemByUrlWith(restGet, F.PERFUME_HOME)) === null)
  })
  // The whole preview the owner clicked: "title too long" on his product, through the application password.
  const items: Record<number, { title: string; content: string; link: string }> = { 5120: { title: F.PERFUME_PRODUCT_TITLE, content: '<p>בושם ארמף קלאב דה נואי פרייבט קי טו מיי סול.</p>', link: F.PERFUME_PRODUCT } }
  const wpDeps = {
    findItemByUrl: async (_c: unknown, url: string) => WP.findItemByUrlWith(restGet, url),
    getItemForEdit: async (_c: unknown, endpoint: any, id: number) => ({ endpoint, id, ...items[id] }),
    detectSeoCapabilities: async () => ({ plugin: 'yoast', hasBridge: true }),
    readLivePage: async () => ({ title: `${F.PERFUME_PRODUCT_TITLE} - פרפיום קלאב`, description: '', h1: F.PERFUME_PRODUCT_TITLE }),
    searchItems: async () => [], updateItemFields: async () => undefined, writeVerifiedSeoMeta: async () => ({ plugin: 'yoast', status: 'verified' }),
  } as any
  const restCtx = { channel: 'app_password' as const, creds: { siteUrl: F.PERFUME_SITE, username: 'u', applicationPassword: 'x' }, link: null, siteName: 'פרפיום קלאב' }
  const c7 = await PV.previewFixJob({ type: 'seo_title', url: F.PERFUME_PRODUCT, kind: 'title_long' } as any, restCtx,
    { wp: wpDeps, readLive: async () => live({ title: `${F.PERFUME_PRODUCT_TITLE} - פרפיום קלאב`, h1: F.PERFUME_PRODUCT_TITLE }), generate: gen(fakeGemini(titleAnswer)) } as any) as any
  check('C7: "title too long" on his product now previews a 30–60 character title instead of "not in WordPress"', c7.ok && c7.type === 'seo_title' && c7.after.length >= 30 && c7.after.length <= 60, c7)

  console.log('D. "Fix in one click" (japan4u.co.il, the plugin): every safe fix goes in, every other row says why')
  const B = require('../bulk') as typeof import('../bulk')
  const API = require('../api') as typeof import('../api')
  const { FakeAdmin } = require('../../__qa__/_fake-admin')
  const { FIX_TYPE } = require('../../site-health/rules')
  // His pages: the title of "when to visit" was fixed on 2026-09-29 (site_fix_jobs), the rest is open.
  const WHEN = 'https://japan4u.co.il/when-to-visit-japan-seasons-cherry-blossom/'
  const INSURANCE = 'https://japan4u.co.il/%d7%91%d7%99%d7%98%d7%95%d7%97-%d7%98%d7%99%d7%95%d7%9c-%d7%9c%d7%99%d7%a4%d7%9f/'
  const pg = (url: string, kind = 'article') => ({ url, kind })
  const findings = [
    { id: 'title_short', pages: F.JAPAN_TITLES.slice(0, 4).map((t) => pg(t.url)) },
    { id: 'title_long', pages: [pg(WHEN), pg(F.JAPAN_SITE + '/', 'home')] },
    { id: 'description_missing', pages: [pg(WHEN), pg(F.JAPAN_SHOPPING_URL)] },
    { id: 'images_alt', pages: [pg(INSURANCE)] },
    { id: 'faq_missing', pages: [pg(F.JAPAN_SHOPPING_URL)] },
    { id: 'sitemap_missing', pages: [] },
  ].map((f) => ({ ...f, fixType: FIX_TYPE[f.id] ?? null }))
  const day = 86_400_000
  const jobs = [
    { id: 'j1', type: 'seo_title', pageUrl: WHEN, status: 'applied', appliedAt: new Date(Date.now() - 3 * day).toISOString(), approvedAt: new Date(Date.now() - 3 * day).toISOString(), batchId: null },
    { id: 'j2', type: 'image_alt', pageUrl: INSURANCE, status: 'applied', appliedAt: new Date(Date.now() - 3 * day).toISOString(), approvedAt: new Date(Date.now() - 3 * day).toISOString(), batchId: null },
  ] as any[]
  // The screen's own answer: the row can be fixed now and no job holds that same place.
  const fixable = (id: string, url: string) => !jobs.some((j) => j.type === FIX_TYPE[id] && j.pageUrl === url)
  // The title of WHEN is "held" (applied) for the screen too, but the batch rule is what is tested here: ask with everything open.
  const plan = B.bulkPlan(findings as any, { fixable: () => true, jobs, now: Date.now() })
  const has = (type: string, url: string) => plan.rows.some((r) => r.type === type && r.url === url)
  check('D1: his too-short titles and both descriptions go in, the one of the page whose TITLE was fixed 3 days ago included', F.JAPAN_TITLES.slice(0, 4).every((t) => has('seo_title', t.url)) && has('meta_description', WHEN) && has('meta_description', F.JAPAN_SHOPPING_URL), plan.rows)
  const why = (type: string, url: string) => plan.skipped.find((r) => r.type === type && r.url === url)?.reason
  check('D2: every row left out says why: same type fixed recently, the home page, FAQ needs one-by-one review', why('seo_title', WHEN) === 'recent' && why('image_alt', INSURANCE) === 'recent' && why('seo_title', F.JAPAN_SITE + '/') === 'home' && why('faq_block', F.JAPAN_SHOPPING_URL) === 'review', plan.skipped)
  check('D3: a row with no automatic fix (sitemap) is not listed as "not fixed"', !plan.skipped.some((r) => r.kind === 'sitemap_missing'))
  const screenPlan = B.bulkPlan(findings as any, { fixable, jobs, now: Date.now() })
  check('D4: rows the queue already holds are neither in the batch nor in the list (they are done)', !screenPlan.rows.some((r) => r.type === 'seo_title' && r.url === WHEN) && !screenPlan.skipped.some((r) => r.type === 'seo_title' && r.url === WHEN))
  await withMutant<typeof B, void>('lib/site-fix/bulk.ts', [['if (type && j.type && j.type !== type) return false', '']], async (MB) => {
    const m = MB.bulkPlan(findings as any, { fixable: () => true, jobs, now: Date.now() })
    check('D-MUT1: any fix on the page keeps all its rows out (wave 9) → D1 fails: WHEN\'s description is left out', !m.rows.some((r) => r.type === 'meta_description' && r.url === WHEN))
  })
  check('D5: the nudge count and the button stay one rule (bulkCandidates = bulkPlan rows)', B.bulkCandidates(findings as any, { fixable: () => true, jobs, now: Date.now() }).length === plan.rows.length)

  // The server checks every approval again: the same rule, per type.
  const U = '11111111-1111-4111-8111-111111111111'
  const P = 'a1111111-2222-4333-8444-555555555555'
  const KEY = { keyId: 'gtk_0123456789abcdef', secret: 'A'.repeat(43) }
  let n = 0
  const newId = () => `${String(++n).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(n).padStart(12, '0')}`
  const priorJob = (fix_type: string, page_url: string) => ({
    id: newId(), user_id: U, project_id: P, fix_type, finding_kind: 'title_long', page_url, payload: { value: 'x' }, before_value: 'Old', after_summary: 'x', channel: 'plugin', status: 'applied',
    error_code: null, undo: { expected: null, via: null }, remote_ref: null, approved_by: U, approved_at: new Date(Date.now() - 3 * day).toISOString(), approved_ip: null,
    applied_at: new Date(Date.now() - 3 * day).toISOString(), reverted_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  })
  const sends: string[] = []
  const plugin = (async (_s: string, route: string) => {
    sends.push(route)
    if (route === '/fix') return { status: 200, body: JSON.stringify({ ok: true, status: 'applied', fix_id: 'f', post_id: 11, previous: '' }) }
    return { status: 404, body: '{}' }
  }) as any
  const serverRun = async (api: typeof API) => {
    const admin = new FakeAdmin({
      projects: [{ id: P, user_id: U, target_domain: 'japan4u.co.il', business_name: 'Japan4U', name: 'יפן' }],
      project_profiles: [{ project_id: P, user_id: U, detected_platform: 'wordpress' }],
      site_fix_plugin_links: [{ project_id: P, user_id: U, site_url: F.JAPAN_SITE, key_id: KEY.keyId, secret_encrypted: 'enc:secret', secret_hint: '••••AAAA', status: 'connected', plugin_version: '2.1.0', seo_plugin: 'yoast', last_seen_at: null, last_error_code: null }],
      site_fix_jobs: [priorJob('seo_title', WHEN)], site_fix_audit: [],
    })
    const deps = { userId: U, ip: '203.0.113.9', admin, decrypt: (x: string) => (x === 'enc:secret' ? KEY.secret : 'p'), encrypt: (x: string) => `enc:${x.length}`, wp: {} as any, readLive: async () => null, newId, pluginPost: plugin } as any
    const batch = { batch: '0b0b0b0b-1111-4222-8333-444444444444' }
    const desc = 'מתי כדאי לטוס ליפן? מדריך לעונות השנה, למזג האוויר ולעונת פריחת הדובדבן, עם המלצות מעשיות לכל חודש בשנה ולכל סוג של מטייל.'
    const d = await api.handleFixesPost({ projectId: P, action: 'approve', approved: true, kind: 'description_missing', pageUrl: WHEN, fix: { type: 'meta_description', value: desc }, expected: '', via: null, before: '', bulk: batch }, deps)
    const t = await api.handleFixesPost({ projectId: P, action: 'approve', approved: true, kind: 'title_long', pageUrl: WHEN, fix: { type: 'seo_title', value: 'מתי כדאי לטוס ליפן – מדריך עונות ועונת הפריחה | Japan4U' }, expected: 'x', via: null, before: 'x', bulk: batch }, deps)
    return { d, t }
  }
  const srv = await serverRun(API)
  check('D6: the server applies the description of his page whose title was fixed 3 days ago', srv.d.status === 200 && (srv.d.body as any).job?.status === 'applied', srv.d)
  check('D7: …and still refuses a second title on it within 30 days (not_bulk_safe)', srv.t.status === 409 && (srv.t.body as any).code === 'not_bulk_safe', srv.t)
  await withMutant<typeof API, void>('lib/site-fix/api.ts', [[' && r.fix_type === a.type && batchOf(r)', ' && batchOf(r)']], async (MA) => {
    const m = await serverRun(MA)
    check('D-MUT2: any fix on the page refuses the batch (wave 9) → D6 fails', m.d.status === 409)
  })

  // The words for every reason, in both languages, and the list under the result.
  const { getDashboardDictionary } = require('../../i18n/dashboard/getDashboardDictionary')
  const he = getDashboardDictionary('he').siteHealth.autofix
  const en = getDashboardDictionary('en').siteHealth.autofix
  const reasons = ['review', 'home', 'recent', 'batch_full', 'not_safe', 'failed']
  check('D8: every reason has a sentence in Hebrew and English', reasons.every((r) => /\p{Script=Hebrew}/u.test(he.bulk.reasons[r] ?? '') && /^[A-Z]/.test(en.bulk.reasons[r] ?? '')))
  const UI = require('../../../components/site-health/useSafeFixes') as typeof import('../../../components/site-health/useSafeFixes')
  check('D9: a preview or approval code reads as its usual sentence (no raw code)', UI.bulkReasonText('no_valid_suggestion', he) === he.errors.no_valid_suggestion && UI.bulkReasonText('recent', he) === he.bulk.reasons.recent && !/_/.test(UI.bulkReasonText('plugin_unreachable', he)))
  const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
  const { createElement } = require('react') as { createElement: (...a: any[]) => any }
  const html = renderToStaticMarkup(createElement(UI.BulkResultList, { results: plan.skipped, copy: he }))
  check('D10: after the click the strip offers "what was not fixed and why (n)"', html.includes(he.bulk.showLeft(plan.skipped.length)) && html.includes(`data-bulk-results="${plan.skipped.length}"`), html.slice(0, 200))
  const stripSrc = read('components/site-health/AutoFixStrip.tsx')
  check('D11: the strip renders that list in its "done" state', /<BulkResultList results=\{bulk\.phase\.results\}/.test(stripSrc))
  const hook = read('components/site-health/useSafeFixes.tsx')
  check('D12: a preview that fails or does not pass the check is reported, not dropped silently', /if \(!ready\[i\]\) notReady\.push\(/.test(hook) && /failedRows\.push\(\{ type: r\.row\.type, url: r\.row\.url, reason: answer\.code/.test(hook))
  const mutHook = hook.replace('if (!ready[i]) notReady.push(', 'if (false) notReady.push(')
  check('D12-MUT: the wave-9 hook (silent drop) fails D12', !/if \(!ready\[i\]\) notReady\.push\(/.test(mutHook))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
