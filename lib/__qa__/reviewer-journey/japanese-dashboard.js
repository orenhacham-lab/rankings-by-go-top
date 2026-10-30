/*
 * THE JAPANESE DASHBOARD, MEASURED IN A REAL BROWSER.
 *
 * lib/i18n/dashboard/ja/ is a directory of parts merged over ENGLISH by
 * getDashboardDictionary. The dictionary suite
 * (lib/i18n/dashboard/__qa__/japanese-dashboard.qa.ts) proves the OBJECT is
 * complete leaf for leaf; it cannot prove that a SCREEN renders from it. This
 * journey does that: real Chromium, a real `next start` production build, the
 * Supabase stub, the reviewer's login, `dashboard-language=ja` on the browser
 * and a `ja-JP` context locale — then, on every dashboard screen:
 *
 *   1. the document answered 200 and actually rendered (a <main>, real text);
 *   2. <html lang> is ja and <html dir> is ltr;
 *   3. there is NO HEBREW anywhere in the visible text, and a failure names the
 *      offending string and the screen;
 *   4. the screen is not silently ENGLISH, and here Japanese lets the
 *      instrument be sharper than it can be for the Latin languages. Two bars,
 *      and the first one is a SCRIPT test no English page can satisfy by
 *      accident: <main> must contain kana or kanji. The second is the same
 *      marker test the Italian and French journeys use — words taken FROM THE
 *      DICTIONARY AT RUN TIME, never hand-typed here, so they cannot drift —
 *      with at least 6 of the rail's labels present (the chrome, which every
 *      screen has) and at least one marker from the screen's OWN dictionary
 *      section found INSIDE <main>, the screen's body rather than the chrome
 *      around it. A marker the chrome also says (every `sidebar`, `workspace`,
 *      `common`, `contact`, `topBarActions` or `railWaiting` value) is struck
 *      out of the per-screen pool, so the rail cannot answer for the screen.
 *      Counts are printed on every screen, pass or fail, so a check that is
 *      quietly scraping by is visible in the log.
 *
 * WHY THE MARKER WINDOW IS SHORTER THAN THE ITALIAN ONE. Japanese writes the
 * same sentence in roughly a third of the characters, and a label like
 * 「計測の履歴」 is five characters long while carrying as much as "Scan
 * history". The Italian journey's floor of 8 characters would throw away almost
 * every label on the screen, so the window here is 4 to 40 characters — and the
 * floor is backed by the script test below rather than by length alone: a
 * marker must contain kana or kanji to be usable, so a four-character Latin
 * brand can never serve as evidence that a page is Japanese.
 *
 * WHERE THIS DIFFERS FROM THE ITALIAN JOURNEY. There, two rail labels
 * legitimately equal their English values (`Account`, `Dashboard`) and are
 * struck out of the pool. In Japanese not one of the thirteen does, because the
 * script itself differs: `sidebar.groupAccount` is 「アカウント」 against
 * "Account" and `sidebar.dashboard` is 「ダッシュボード」 against "Dashboard".
 * So this journey takes the stricter French line and requires ALL of them to
 * differ from English — and it still prints any that stop differing, so a rail
 * drifting back to English is visible rather than tolerated.
 *
 * ONE DELIBERATE EXCEPTION to "no Hebrew": the language switcher names each
 * language in its own words, so the rail carries a button reading `עברית` with
 * `lang="he"` on it (components/DashboardLanguageSwitcher.tsx). Text explicitly
 * marked as Hebrew-language content is not a translation leak, so elements
 * carrying `lang=he` are hidden for the measurement — and the exception is kept
 * honest: the journey FAILS if anything other than that endonym is excluded.
 *
 * CONTROLS, because a detector that measures nothing passes forever. Two, one
 * for each half of the instrument:
 *
 *   POSITIVE — the same measurement, unchanged, runs against the HEBREW
 *   dashboard (cookie `he`, locale `he-IL`) and must FIND Hebrew there. If it
 *   does not, every "no Hebrew" tick above measured nothing.
 *
 *   ENGLISH — an English dashboard has no Hebrew in it either, and it is
 *   exactly what the merge-over-English fallback produces when a dictionary
 *   part is missing. So the script test and the marker checks are run once more
 *   with the cookie set to `en` over three of the same screens, and every one
 *   of them must FAIL to find Japanese.
 *
 * THE BUILD FLAG. Japanese is gated by NEXT_PUBLIC_JAPANESE_SITE_ENABLED,
 * which Next inlines at BUILD time: with it off, `normalizeStoredLocale`
 * refuses the cookie and the dashboard is not Japanese at all.
 * scripts/qa/journeys.sh passes the ambient environment through to
 * `npx next build`, so the flag is set on the script itself:
 *
 *   NEXT_PUBLIC_JAPANESE_SITE_ENABLED=true bash scripts/qa/journeys.sh japanese-dashboard
 *
 * The journey SKIPS without it rather than reporting a false defect, exactly as
 * the French, Portuguese and Italian journeys do.
 *
 * Standalone, against a server and stub that are already running:
 *   JA_BASE_URL=http://127.0.0.1:3993 JA_STUB_URL=http://127.0.0.1:5555 \
 *   NEXT_PUBLIC_JAPANESE_SITE_ENABLED=true node lib/__qa__/reviewer-journey/japanese-dashboard.js
 */
/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
const { spawn, spawnSync } = require('child_process')
const { join, resolve } = require('path')
const { mkdirSync, copyFileSync } = require('fs')

const ROOT = resolve(__dirname, '../../..')
const OWN_SERVER = !process.env.JA_BASE_URL
const PORT = 3993
const BASE = process.env.JA_BASE_URL || `http://127.0.0.1:${PORT}`
const STUB = process.env.JA_STUB_URL || 'http://127.0.0.1:5555'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/ja-dashboard'
// Shared with the rest of the Japanese work. Best effort: a container without
// it keeps the screenshots in QA_SCREENSHOT_DIR alone.
const MIRROR = '/mnt/project-files/japanese/dashboard'
const PID = 'a1111111-2222-3333-4444-555555555555'
const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const HEBREW = /[֐-׿]/
/** Kana or kanji. The one thing an English page can never produce by accident. */
const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/
/** Every language names ITSELF in its own script in the switcher — the one legitimate Hebrew. */
const ENDONYMS = new Set(['עברית'])

mkdirSync(SHOTS, { recursive: true })
let mirror = null
try { mkdirSync(MIRROR, { recursive: true }); mirror = MIRROR } catch { /* not this container */ }

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }
const done = () => console.log(`\n${pass} passed, ${fail} failed`)

// ── the dictionary, read at run time ────────────────────────────────────────
// The markers are the dictionary's own words. Reading them here (rather than
// copying strings into this file) is the whole point: a re-worded dictionary
// re-words the markers with it, and a marker can never be a stale string that
// the product stopped using.
function dictionaries() {
  const code = `
    const { getDashboardDictionary } = require('./lib/i18n/dashboard/getDashboardDictionary')
    const flat = (o, p, out) => {
      for (const k of Object.keys(o || {})) {
        const v = o[k]; const key = p ? p + '.' + k : k
        if (typeof v === 'string') out[key] = v
        else if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out)
      }
      return out
    }
    process.stdout.write(JSON.stringify({
      ja: flat(getDashboardDictionary('ja'), '', {}),
      en: flat(getDashboardDictionary('en'), '', {}),
    }))`
  const r = spawnSync(join(ROOT, 'node_modules/.bin/tsx'), ['-e', code], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`reading the dictionary failed: ${(r.stderr || '').split('\n').slice(-6).join(' ')}`)
  return JSON.parse(r.stdout)
}

/** The rail's own labels — the chrome every screen has. Paths, never strings. */
const RAIL_PATHS = ['sidebar.groupMain', 'sidebar.groupResearch', 'sidebar.groupMonitoring', 'sidebar.groupAccount',
  'sidebar.dashboard', 'sidebar.projects', 'sidebar.keywords', 'sidebar.keywordResearch', 'sidebar.projectSettings',
  'sidebar.reports', 'sidebar.siteHealth', 'sidebar.billing', 'sidebar.logout']
const RAIL_MIN = 6

/**
 * A screen's own markers: every leaf of its dictionary section whose Japanese
 * DIFFERS from the English at the same path, carries kana or kanji, is long
 * enough not to collide by accident, and is plain prose (no interpolation, no
 * digits) so the comparison is against text the page can actually contain.
 */
function sectionMarkers(dict, sections, chromeWords) {
  const out = []
  for (const s of sections) {
    for (const k of Object.keys(dict.ja)) {
      if (k !== s && !k.startsWith(`${s}.`)) continue
      const ja = dict.ja[k]
      if (typeof ja !== 'string' || ja.length < 4 || ja.length > 40) continue
      if (/[{}%\d]/.test(ja)) continue
      if (!JAPANESE.test(ja)) continue       // a Latin brand is no evidence of Japanese
      if (dict.en[k] === ja) continue        // untranslated: its presence proves nothing
      if (chromeWords.has(ja)) continue      // the rail says it too: it is not evidence about this screen
      if (FIXTURE_TEXT.includes(ja)) continue  // the merchant's own words, not the dictionary's
      out.push({ path: k, text: ja })
    }
  }
  return out
}

/*
 * THE FIXTURE'S OWN WORDS, STRUCK OUT OF EVERY POOL.
 *
 * The measurement is about the UI's words, not the merchant's, and in Japanese
 * the two collide in a way they do not in the Latin languages: the fixture
 * business is 「早川水道サービス」 and
 * `projectSettings.profile.commerce.service.label` is 「サービス」, which is a
 * substring of it. A screen that merely echoed the project name would then
 * answer for a dictionary section it never read — and the ENGLISH CONTROL is
 * what caught it, reporting a Japanese marker on an English page where none
 * could be. Rather than raise the length floor (which would be arbitrary and
 * would throw away real labels), any marker contained in the fixture's own text
 * is removed. Declared after the fixture it reads, and hoisted into
 * sectionMarkers by `const`: the function is only ever called from inside the
 * async body below, long after this line has run.
 */
const FIXTURE_TEXT = [
  '早川水道サービス', 'hayakawa-suido.jp', '東京',
  '東京 水道修理', '給湯器の修理', '排水管の詰まり', '水道の緊急対応',
  '東水道センター', 'tosuido-center.jp',
  '台所の排水口を自分で直す手順', '水漏れの調査にかかる費用',
  '水道修理', '水漏れの調査', '壁のしみ', '下水管の清掃', '浴室の防水',
].join('\n')

/** Every word the CHROME renders. Struck out of the per-screen pools above. */
const CHROME_SECTIONS = ['sidebar', 'workspace', 'common', 'contact', 'topBarActions', 'railWaiting', 'connectionStatus', 'trialBar']
function chromeVocabulary(dict) {
  const words = new Set()
  for (const k of Object.keys(dict.ja)) {
    if (CHROME_SECTIONS.some((s) => k === s || k.startsWith(`${s}.`))) words.add(dict.ja[k])
  }
  return words
}

// ── the screens ─────────────────────────────────────────────────────────────
// `sections` are the dictionary sections the screen renders from (the ja
// parts are organised by exactly these names, see lib/i18n/dashboard/ja/).
//
// `/projects/<id>` is deliberately NOT one of them: it is a retired address that
// answers 307 to /dashboard?projectId=… (app/projects/[id]/page.tsx), so listing
// it would measure the home screen twice and count it as coverage it is not.
const SCREENS = [
  { name: '01-home-tableau', path: `/dashboard?projectId=${PID}`, ready: '[data-dashboard-widget="hero"]', sections: ['dashboardHome'] },
  { name: '02-projects', path: '/projects', sections: ['projects'] },
  { name: '03-clients', path: '/clients', sections: ['clients'] },
  { name: '04-project-settings', path: `/settings?projectId=${PID}`, ready: '#profile', sections: ['projectSettings'] },
  { name: '05-content-hub', path: `/content?projectId=${PID}`, sections: ['contentHub'] },
  { name: '06-content-strategy', path: `/content/strategy?projectId=${PID}`, sections: ['contentStrategy', 'strategyInsights'] },
  { name: '07-article-editor', path: `/content/articles/ga-1?projectId=${PID}`, sections: ['articleEditorToolbar', 'contentHub'] },
  { name: '08-keyword-research', path: `/keyword-research?projectId=${PID}`, ready: '#research-table', sections: ['keywordResearch'] },
  { name: '09-keywords', path: `/keywords?projectId=${PID}`, sections: ['keywordsPage'] },
  { name: '10-scans', path: `/scans?projectId=${PID}`, sections: ['scans'] },
  { name: '11-reports', path: `/reports?projectId=${PID}`, sections: ['reports'] },
  { name: '12-site-health', path: `/site-health?projectId=${PID}`, sections: ['siteHealth'] },
  { name: '13-links', path: `/site-links?projectId=${PID}`, sections: ['siteLinks'] },
  { name: '14-ai-visibility', path: `/ai-visibility?projectId=${PID}`, sections: ['aiVisibilityOverview'] },
  { name: '15-billing', path: '/billing', sections: ['billing'] },
]

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// ── the fixture: the reviewer's project, in Japanese, with no Hebrew in it ──
// Deliberately Japanese DATA: a Hebrew fixture would trip the Hebrew detector
// on text the product merely echoed, and the measurement is about the UI's own
// words, not the merchant's.
const H = { 'content-type': 'application/json', authorization: 'Bearer stub-service-key', apikey: 'stub-service-key' }
const iso = (ms) => new Date(ms).toISOString()
async function rest(method, path, body) {
  const r = await fetch(`${STUB}/rest/v1/${path}`, { method, headers: H, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}`)
}
async function seed() {
  await fetch(`${STUB}/__stub/reset`).catch(() => {})
  const now = Date.now()
  await rest('PATCH', `projects?id=eq.${PID}`, { name: '早川水道サービス', business_name: '早川水道サービス',
    target_domain: 'hayakawa-suido.jp', country: 'JP', city: '東京', language: 'en', device_type: 'desktop', scan_frequency: 'monthly' })
  const KW = [['東京 水道修理', 'google_maps', 3, 2], ['給湯器の修理', 'google_search', 5, 3],
    ['排水管の詰まり', 'google_search', 19, 17], ['水道の緊急対応', 'google_search', null, null]]
  await rest('POST', 'tracking_targets', KW.map(([keyword, engine_type], i) => ({ id: `tt-${i + 1}`, project_id: PID, user_id: USER, keyword, engine_type,
    is_active: true, avg_monthly_searches: 1000 + i, created_at: iso(now - 35 * 86400000) })))
  const D1 = now - 30 * 86400000, D2 = now - 3 * 3600000
  await rest('POST', 'scan_results', KW.flatMap(([keyword, engine_type, before, after], i) => [
    { id: `sr-${i}-a`, scan_id: 'scan-1', tracking_target_id: `tt-${i + 1}`, keyword, engine_type, found: before !== null, position: before, checked_at: iso(D1) },
    { id: `sr-${i}-b`, scan_id: 'scan-2', tracking_target_id: `tt-${i + 1}`, keyword, engine_type, found: after !== null, position: after,
      change_value: before && after ? before - after : null, checked_at: iso(D2), result_url: after ? 'https://hayakawa-suido.jp/service' : null },
  ]))
  await rest('POST', 'ai_visibility_competitors', [{ id: 'c1', project_id: PID, user_id: USER, name: '東水道センター',
    domain: 'tosuido-center.jp', is_active: true, created_at: iso(now - 20 * 86400000) }])
  await rest('POST', 'keyword_competitor_positions', [2, 3].map((n) => ({ tracking_target_id: `tt-${n}`,
    competitor_domain: 'tosuido-center.jp', position: n, url: 'https://tosuido-center.jp/', checked_at: iso(D2) })))
  await rest('POST', 'generated_articles', [
    { id: 'ga-1', project_id: PID, user_id: USER, title: '台所の排水口を自分で直す手順', status: 'draft',
      created_at: iso(now - 2 * 86400000), updated_at: iso(now - 86400000) },
    { id: 'ga-2', project_id: PID, user_id: USER, title: '水漏れの調査にかかる費用', status: 'published',
      created_at: iso(now - 86400000), updated_at: iso(now - 86400000), published_at: iso(now - 86400000) },
  ])
}
// The seeding scan, answered in the browser (it would otherwise call providers).
const START = Date.now() - 3 * 86400000
const seedRun = { ok: true, run: { id: 'run-1', stage: 'b', status: 'done', stalled: false, startedAt: iso(START),
  steps: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((step) => ({ step, status: 'done', errorCode: null, itemCount: null, startedAt: null, finishedAt: null })),
  summary: { version: 1, source: 'scan', domain: 'hayakawa-suido.jp', url: 'https://hayakawa-suido.jp/', scannedAt: iso(START), locale: 'en',
    storefrontLocked: false, siteAccess: 'direct', business: null, audiences: [], seedKeywords: ['水道修理'], topics: [],
    findings: [], findingsOmitted: 0, geo: { state: 'measured', unavailableReason: null, passed: 3, total: 4, signals: [] }, competitors: [],
    counters: { keywords: 6, fixes: 0, geo: 3, articles: 0, competitors: 1 }, sitemapUrlCount: 40, sitemapTruncated: false } } }
const LEVELS = ['LOW', 'MEDIUM', 'HIGH']
const research = { ok: true, market: { country: 'JP', language: 'ja' }, fetchedAt: iso(START + 60000), truncated: false, tracked: [],
  keywords: ['排水管の詰まり', '水漏れの調査', '壁のしみ', '給湯器の修理', '下水管の清掃', '浴室の防水'].map((keyword, i) => ({ keyword,
    avgMonthlySearches: 5000 - i * 400, competition: LEVELS[i % 3], competitionIndex: 15 + i * 13, lowTopOfPageBid: 1.5 + i, highTopOfPageBid: 6 + i * 2,
    currency: 'JPY', origins: ['site'], competitors: [], relevant: true })) }

;(async () => {
  if (process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED !== 'true') {
    console.log('NEXT_PUBLIC_JAPANESE_SITE_ENABLED is not "true". Next inlines it at BUILD time, so')
    console.log('without it the dashboard cannot be Japanese and every assertion here would report a')
    console.log('product defect that is really a missing flag. Run:')
    console.log('  NEXT_PUBLIC_JAPANESE_SITE_ENABLED=true bash scripts/qa/journeys.sh japanese-dashboard')
    // A SKIP, not a failure — the same reason the French, Portuguese and
    // Italian journeys skip. The flag is off in the shared journeys build,
    // which mirrors production, and a failure there would make the whole set
    // permanently red and teach everyone to ignore it. This journey is run on
    // its own, with the flag, and its count is recorded in the thread when it is.
    console.log('skipped (needs its own build) — 0 passed, 0 failed')
    return
  }

  let dict
  try { dict = dictionaries() } catch (e) { check('the ja dictionary is readable', false, e.message); done(); process.exitCode = 1; return }

  // The instrument itself, before any page: a marker that equals its English
  // counterpart proves nothing, so the rail list is checked for drift first.
  const chrome = chromeVocabulary(dict)
  const railAll = RAIL_PATHS.map((p) => ({ path: p, text: dict.ja[p] }))
  const railMissing = railAll.filter((m) => typeof m.text !== 'string' || m.text.length === 0)
  const railSameAsEn = railAll.filter((m) => m.text && dict.en[m.path] === m.text)
  const rail = railAll.filter((m) => m.text && dict.en[m.path] !== m.text)
  check('the rail markers come from the dictionary', railMissing.length === 0, railMissing.map((m) => m.path).join(', '))
  if (railSameAsEn.length) console.log(`    · rail labels identical in English, struck out: ${railSameAsEn.map((m) => `${m.path}="${m.text}"`).join(', ')}`)
  // Unlike Italian, EVERY Japanese rail label differs from English, because the
  // script differs. So this is the French bar, not the Italian one.
  check('every rail label differs from English', rail.length === railAll.length,
    `${rail.length} of ${railAll.length} differ`)
  check('every rail label is written in Japanese', rail.every((m) => JAPANESE.test(m.text)),
    rail.filter((m) => !JAPANESE.test(m.text)).map((m) => `${m.path}="${m.text}"`).join(', '))
  // The fixture filter, made visible: every leaf it removes is printed, so a
  // pool that is quietly being emptied by the fixture is seen rather than
  // guessed at. The English control remains the guard; this is the log.
  const struck = Object.keys(dict.ja).filter((k) => {
    const t = dict.ja[k]
    return typeof t === 'string' && t.length >= 4 && t.length <= 40 && JAPANESE.test(t)
      && !/[{}%\d]/.test(t) && dict.en[k] !== t && FIXTURE_TEXT.includes(t)
  })
  console.log(`    · markers struck out for being the fixture's own words: ${struck.length}${struck.length ? ` (${struck.slice(0, 6).map((k) => `${k}="${dict.ja[k]}"`).join(', ')})` : ''}`)

  let server = null
  if (OWN_SERVER) {
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', SERPER_API_KEY: 'unreachable-by-design',
      ENABLE_CONTENT: 'true', NEXT_PUBLIC_ENABLE_CONTENT: 'true', NEXT_PUBLIC_JAPANESE_SITE_ENABLED: 'true' }
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: ROOT, detached: true, stdio: 'ignore', env })
  }
  const kill = () => { if (server) { try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } } }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); console.log(`${pass} passed, ${fail + 1} failed`); process.exitCode = 1; return }
  try { await seed() } catch (e) { check('the fixture seeds', false, e.message) }

  const { chromium } = require(require.resolve('playwright-core', { paths: [ROOT] }))
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    /**
     * One signed-in page in one language. `nothing leaves 127.0.0.1` is the
     * route handler, exactly as axe-a11y.js has it.
     */
    const signIn = async (cookieLocale, contextLocale) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: contextLocale })
      await ctx.addCookies([{ name: 'dashboard-language', value: cookieLocale, url: BASE }])
      const page = await ctx.newPage()
      await page.route('**/*', (route) => {
        const req = route.request()
        const u = new URL(req.url())
        if (u.hostname !== '127.0.0.1') return route.abort()
        if (u.pathname === `/api/projects/${PID}/seed` && req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(seedRun) })
        if (u.pathname === '/api/keyword-research/scan') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(research) })
        return route.continue()
      })
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.fill('input[type="email"]', 'reviewer@example.com')
      await page.fill('input[type="password"]', 'whatever')
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')])
      return { ctx, page }
    }

    const go = async (page, path, ready) => {
      let status = null
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null)
      if (resp) status = resp.status()
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
      if (ready) await page.locator(ready).first().waitFor({ timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(1200)
      return status
    }

    /**
     * THE MEASUREMENT. One pass in the page: the document's lang/dir, and the
     * VISIBLE text (innerText, so a hidden template cannot answer for a screen)
     * with every `lang=he` element hidden for the read and restored after it —
     * the endonym exception, applied narrowly and reported so it can be judged.
     */
    const measure = (page) => page.evaluate(() => {
      const marked = [...document.body.querySelectorAll('[lang]')]
        .filter((el) => /^he(-|$)/i.test(el.getAttribute('lang') || ''))
      const prior = marked.map((el) => el.style.display)
      const excluded = marked.map((el) => ({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim() }))
      marked.forEach((el) => { el.style.display = 'none' })
      const main = document.querySelector('main')
      const text = document.body.innerText || ''
      const mainText = (main && main.innerText) || ''
      marked.forEach((el, i) => { el.style.display = prior[i] })
      return {
        lang: document.documentElement.getAttribute('lang'),
        dir: document.documentElement.getAttribute('dir'),
        hasMain: !!main,
        text,
        mainText,
        excluded,
      }
    })

    const shoot = async (page, name) => {
      const file = join(SHOTS, `${name}.png`)
      await page.screenshot({ path: file, fullPage: true }).catch(() => {})
      if (mirror) { try { copyFileSync(file, join(mirror, `${name}.png`)) } catch { /* mirror is best effort */ } }
    }

    /** Every Hebrew run in the text, with a little context, so a failure is actionable. */
    const hebrewRuns = (text) => {
      const out = []
      for (const line of text.split('\n')) {
        if (!HEBREW.test(line)) continue
        out.push(line.trim().slice(0, 80))
        if (out.length >= 5) break
      }
      return out
    }

    /** How much of a text is kana or kanji — the script test, as a share. */
    const japaneseShare = (text) => {
      const stripped = text.replace(/\s/g, '')
      if (!stripped.length) return 0
      return (stripped.match(/[぀-ヿ㐀-䶿一-鿿]/g) || []).length / stripped.length
    }

    /**
     * The guided tour starts by itself on a fresh account and covers the top of
     * the first screen it meets. It is dismissed once, as a merchant would, so
     * the screenshots show the SCREENS rather than a tour card.
     */
    const dismissTour = async (page, skipLabel) => {
      if (skipLabel) await page.locator('button', { hasText: skipLabel }).first().click({ timeout: 5000 }).catch(() => {})
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(500)
    }

    // ── the Japanese dashboard ─────────────────────────────────────────────
    const { page } = await signIn('ja', 'ja-JP')
    await go(page, `/dashboard?projectId=${PID}`, '[data-dashboard-widget="hero"]')
    await dismissTour(page, dict.ja['guide.tour.skip'])
    let screens = 0
    for (const s of SCREENS) {
      const status = await go(page, s.path, s.ready)
      const m = await measure(page)
      await shoot(page, s.name)
      screens++
      check(`${s.name}: 200 and rendered`, status === 200 && m.hasMain && m.text.trim().length > 300,
        `status=${status} main=${m.hasMain} text=${m.text.trim().length} chars`)
      check(`${s.name}: <html lang="ja" dir="ltr">`, m.lang === 'ja' && m.dir === 'ltr', `lang=${m.lang} dir=${m.dir}`)
      const stray = m.excluded.filter((e) => !ENDONYMS.has(e.text))
      check(`${s.name}: only the language endonym carries lang=he`, stray.length === 0,
        stray.map((e) => `<${e.tag}>"${e.text.slice(0, 60)}"`).join(' | '))
      const runs = hebrewRuns(m.text)
      check(`${s.name}: no Hebrew in the rendered text`, runs.length === 0, runs.length ? `Hebrew on ${s.name} (${s.path}): ${runs.map((r) => `"${r}"`).join(' | ')}` : '')
      // THE SCRIPT TEST. A tenth of the non-space characters inside <main>
      // being kana or kanji is a low bar for a Japanese screen — the fixture's
      // own domains, prices and brand names are Latin — and an unreachable one
      // for an English screen, which is what the English control proves below.
      const share = japaneseShare(m.mainText)
      check(`${s.name}: <main> is written in Japanese, not English`, share >= 0.1,
        `only ${(share * 100).toFixed(1)}% of <main> is kana or kanji`)
      const railFound = rail.filter((r) => r.text && m.text.includes(r.text))
      check(`${s.name}: the rail is Japanese (${RAIL_MIN}+ of ${rail.length} labels)`, railFound.length >= RAIL_MIN,
        `found ${railFound.length}: ${railFound.map((r) => r.text).join(', ')} — sought ${rail.map((r) => r.text).join(', ')}`)
      const pool = sectionMarkers(dict, s.sections, chrome)
      const hit = pool.filter((p) => m.mainText.includes(p.text))
      check(`${s.name}: its own copy is Japanese, inside <main> (${s.sections.join('+')})`, pool.length > 0 && hit.length > 0,
        pool.length === 0 ? `no usable marker in ${s.sections.join('+')}` : `none of ${pool.length} markers present in <main>; e.g. ${pool.slice(0, 8).map((p) => `${p.path}="${p.text}"`).join(' | ')}`)
      // Printed pass or fail: a check that is barely scraping by should be
      // visible, not hidden behind a tick.
      console.log(`    · ${s.name}: body ${m.text.trim().length} chars, <main> ${m.mainText.trim().length} (${(share * 100).toFixed(1)}% ja); rail ${railFound.length}/${rail.length}; own markers ${hit.length}/${pool.length}${hit.length ? ` (e.g. "${hit[0].text}")` : ''}`)
    }

    // The GUIDE — a menu in the top bar rather than a screen of its own, so it
    // is opened and measured where it lives. The guided tour starts by itself
    // on a fresh account and covers the bar, so it is closed first: otherwise
    // this surface measures the tour's words and calls them the menu's.
    await go(page, `/dashboard?projectId=${PID}`, '[data-dashboard-widget="hero"]')
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(500)
    const guideBtn = page.locator('button', { hasText: dict.ja['guide.label'] }).first()
    const guideMenu = page.locator('[role="menu"]').first()
    if (await guideBtn.count()) {
      await guideBtn.click({ timeout: 10000 }).catch(() => {})
      await guideMenu.waitFor({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(400)
      const opened = await guideMenu.count() > 0 && await guideMenu.isVisible().catch(() => false)
      check('16-guide-menu: the Guide menu opens', opened, 'no visible [role="menu"] after clicking the Guide pill')
      const menuText = opened ? await guideMenu.innerText().catch(() => '') : ''
      const m = await measure(page)
      await shoot(page, '16-guide-menu')
      screens++
      const runs = hebrewRuns(m.text)
      check('16-guide-menu: no Hebrew in the rendered text', runs.length === 0, runs.map((r) => `"${r}"`).join(' | '))
      const pool = sectionMarkers(dict, ['guide'], chrome)
      const hit = pool.filter((p) => menuText.includes(p.text))
      check('16-guide-menu: the menu itself is Japanese', pool.length > 0 && hit.length > 0,
        `none of ${pool.length} markers present in the menu; e.g. ${pool.slice(0, 8).map((p) => `${p.path}="${p.text}"`).join(' | ')}`)
      console.log(`    · 16-guide-menu: menu ${menuText.trim().length} chars; own markers ${hit.length}/${pool.length}${hit.length ? ` (e.g. "${hit[0].text}")` : ''}`)
      await page.keyboard.press('Escape').catch(() => {})
    } else {
      check('16-guide-menu: the Guide pill is there', false, `no button reading "${dict.ja['guide.label']}"`)
    }

    // ── the POSITIVE CONTROL ───────────────────────────────────────────────
    // The same instrument, unchanged, against the HEBREW dashboard. It must
    // find Hebrew (so the detector detects) and must find none of the Japanese
    // rail markers (so the marker check discriminates). Without this pair, a
    // detector that measured nothing would report a clean sweep.
    const control = await signIn('he', 'he-IL')
    await go(control.page, `/dashboard?projectId=${PID}`, '[data-dashboard-widget="hero"]')
    await dismissTour(control.page, null)   // Hebrew labels are not in this journey's two dictionaries; Escape closes it
    const cStatus = await go(control.page, `/dashboard?projectId=${PID}`, '[data-dashboard-widget="hero"]')
    const cm = await measure(control.page)
    await shoot(control.page, '99-control-hebrew-dashboard')
    const cRuns = hebrewRuns(cm.text)
    check('control: the Hebrew dashboard rendered', cStatus === 200 && cm.hasMain && cm.text.trim().length > 300,
      `status=${cStatus} main=${cm.hasMain} text=${cm.text.trim().length} chars`)
    check('control: <html lang="he" dir="rtl">', cm.lang === 'he' && cm.dir === 'rtl', `lang=${cm.lang} dir=${cm.dir}`)
    check('control: the SAME detector FINDS Hebrew there', cRuns.length > 0,
      'the no-Hebrew assertions above measured nothing')
    const cRail = rail.filter((r) => r.text && cm.text.includes(r.text))
    check('control: none of the Japanese rail markers are there', cRail.length === 0, cRail.map((r) => r.text).join(', '))

    // ── the SECOND CONTROL: the same instrument against ENGLISH ────────────
    // The Hebrew control proves the Hebrew detector detects. It cannot prove
    // the "not silently English" half, because an English dashboard has no
    // Hebrew in it either — and an English dashboard is EXACTLY the failure the
    // merge-over-English fallback would produce. So the script test and the
    // marker checks are run once more with the cookie set to `en`, over three
    // of the same screens, and every one of them must now FAIL to find Japanese.
    const eng = await signIn('en', 'en-US')
    await go(eng.page, `/dashboard?projectId=${PID}`, '[data-dashboard-widget="hero"]')
    await dismissTour(eng.page, dict.en['guide.tour.skip'])
    for (const s of SCREENS.filter((x) => ['01-home-tableau', '04-project-settings', '12-site-health'].includes(x.name))) {
      const st = await go(eng.page, s.path, s.ready)
      const em = await measure(eng.page)
      const eRail = rail.filter((r) => r.text && em.text.includes(r.text))
      const ePool = sectionMarkers(dict, s.sections, chrome)
      const eHit = ePool.filter((pp) => em.mainText.includes(pp.text))
      const eShare = japaneseShare(em.mainText)
      check(`control(en) ${s.name}: rendered in English`, st === 200 && em.lang === 'en' && em.mainText.trim().length > 150,
        `status=${st} lang=${em.lang} main=${em.mainText.trim().length} chars`)
      check(`control(en) ${s.name}: the script test does NOT pass`, eShare < 0.1, `${(eShare * 100).toFixed(1)}% of <main> is kana or kanji`)
      check(`control(en) ${s.name}: the rail check does NOT pass`, eRail.length < RAIL_MIN, `found ${eRail.length}: ${eRail.map((r) => r.text).join(', ')}`)
      check(`control(en) ${s.name}: NO Japanese marker of its own section`, eHit.length === 0, eHit.slice(0, 5).map((pp) => `${pp.path}="${pp.text}"`).join(' | '))
    }
    await shoot(eng.page, '98-control-english-site-health')

    console.log(`\nscreens measured: ${screens} (plus the Hebrew and English controls)`)
    console.log(`screenshots: ${SHOTS}${mirror ? ` and ${mirror}` : ''}`)
  } catch (e) {
    check('the journey ran to its end', false, e.message)
  } finally {
    await browser.close()
    kill()
    done()
    process.exitCode = fail === 0 ? 0 : 1
  }
})()
