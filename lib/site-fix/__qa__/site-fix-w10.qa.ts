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

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
