/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * THE BRAZILIAN PORTUGUESE DASHBOARD, MEASURED IN A REAL BROWSER.
 *
 * lib/i18n/dashboard/pt-BR/ is a directory of parts merged over ENGLISH by
 * getDashboardDictionary. A dictionary QA suite proves the OBJECT is complete
 * leaf for leaf; it cannot prove that a SCREEN renders from it. This journey
 * does that: real Chromium, a real `next start` production build, the Supabase
 * stub, the reviewer's login, `dashboard-language=pt-BR` on the browser and an
 * `pt-BR` context locale — then, on every dashboard screen:
 *
 *   1. the document answered 200 and actually rendered (a <main>, real text);
 *   2. <html lang> is pt-BR and <html dir> is ltr;
 *   3. there is NO HEBREW anywhere in the visible text, and a failure names the
 *      offending string and the screen;
 *   4. the screen is not silently ENGLISH: the visible text carries markers
 *      taken FROM THE DICTIONARY AT RUN TIME — never hand-typed here, so they
 *      cannot drift — and every marker used is first proven to DIFFER from the
 *      English value at the same dictionary path, which is what makes its
 *      presence evidence of Portuguese rather than of a page that rendered at
 *      all. Two bars per screen: at least 6 of the rail's labels (the chrome,
 *      which every screen has), and at least one marker from the screen's OWN
 *      dictionary section found INSIDE <main> — the screen's body, not the
 *      chrome around it. The second bar is deliberately hard to satisfy by
 *      accident: a marker the chrome also uses (every `sidebar`, `workspace`,
 *      `common`, `contact`, `topBarActions` or `railWaiting` value) is struck
 *      out of the pool, so the rail cannot answer for the screen; and the
 *      counts are printed on every screen whether it passes or fails, so a
 *      check that is quietly scraping by is visible in the log.
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
 *   part is missing. So the Portuguese marker checks are run once more with the
 *   cookie set to `en` over three of the same screens, and every one of them
 *   must FAIL to find Portuguese.
 *
 * THE BUILD FLAG. The Portuguese language is gated by
 * NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED, which Next inlines at BUILD time: with
 * it off, `normalizeStoredLocale` refuses the cookie and the dashboard is not
 * Portuguese at all. scripts/qa/journeys.sh passes the ambient environment
 * through to `npx next build`, so the flag is set on the script itself — it
 * needs no change to the script:
 *
 *   NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED=true bash scripts/qa/journeys.sh portuguese-dashboard
 *
 * The journey refuses to run without it rather than reporting a false defect.
 *
 * Standalone, against a server and stub that are already running:
 *   PT_BASE_URL=http://127.0.0.1:3989 PT_STUB_URL=http://127.0.0.1:5555 \
 *   NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED=true node lib/__qa__/reviewer-journey/portuguese-dashboard.js
 */
const { spawn, spawnSync } = require('child_process')
const { join, resolve } = require('path')
const { mkdirSync, copyFileSync } = require('fs')

const ROOT = resolve(__dirname, '../../..')
const OWN_SERVER = !process.env.PT_BASE_URL
const PORT = 3989
const BASE = process.env.PT_BASE_URL || `http://127.0.0.1:${PORT}`
const STUB = process.env.PT_STUB_URL || 'http://127.0.0.1:5555'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/pt-dashboard'
// Shared with the rest of the Portuguese work. Best effort: a container without
// it keeps the screenshots in QA_SCREENSHOT_DIR alone.
const MIRROR = '/mnt/project-files/portuguese/dashboard'
const PID = 'a1111111-2222-3333-4444-555555555555'
const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const HEBREW = /[֐-׿]/
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
      pt: flat(getDashboardDictionary('pt-BR'), '', {}),
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
 * A screen's own markers: every leaf of its dictionary section whose Portuguese
 * DIFFERS from the English at the same path, is long enough not to collide by
 * accident, and is plain prose (no interpolation, no digits) so the comparison
 * is against text the page can actually contain.
 */
function sectionMarkers(dict, sections, chromeWords) {
  const out = []
  for (const s of sections) {
    for (const k of Object.keys(dict.pt)) {
      if (k !== s && !k.startsWith(`${s}.`)) continue
      const pt = dict.pt[k]
      if (typeof pt !== 'string' || pt.length < 8 || pt.length > 70) continue
      if (/[{}%\d]/.test(pt)) continue
      if (dict.en[k] === pt) continue        // untranslated: its presence proves nothing
      if (chromeWords.has(pt)) continue      // the rail says it too: it is not evidence about this screen
      out.push({ path: k, text: pt })
    }
  }
  return out
}

/** Every word the CHROME renders. Struck out of the per-screen pools above. */
const CHROME_SECTIONS = ['sidebar', 'workspace', 'common', 'contact', 'topBarActions', 'railWaiting', 'connectionStatus', 'trialBar']
function chromeVocabulary(dict) {
  const words = new Set()
  for (const k of Object.keys(dict.pt)) {
    if (CHROME_SECTIONS.some((s) => k === s || k.startsWith(`${s}.`))) words.add(dict.pt[k])
  }
  return words
}

// ── the screens ─────────────────────────────────────────────────────────────
// `sections` are the dictionary sections the screen renders from (the pt-BR
// parts are organised by exactly these names, see lib/i18n/dashboard/pt-BR/).
//
// `/projects/<id>` is deliberately NOT one of them: it is a retired address that
// answers 307 to /dashboard?projectId=… (app/projects/[id]/page.tsx), so listing
// it would measure the home screen twice and count it as coverage it is not.
const SCREENS = [
  { name: '01-home-painel', path: `/dashboard?projectId=${PID}`, ready: '[data-dashboard-widget="hero"]', sections: ['dashboardHome'] },
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

// ── the fixture: the reviewer's project, in Portuguese, with no Hebrew in it ──
// Deliberately Portuguese DATA: a Hebrew fixture would trip the Hebrew detector
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
  await rest('PATCH', `projects?id=eq.${PID}`, { name: 'Encanador Rápido', business_name: 'Encanador Rápido',
    target_domain: 'encanador-sp.com.br', country: 'BR', city: 'São Paulo', language: 'en', device_type: 'desktop', scan_frequency: 'monthly' })
  const KW = [['encanador em são paulo', 'google_maps', 3, 2], ['consertar aquecedor', 'google_search', 5, 3],
    ['desentupimento', 'google_search', 19, 17], ['encanador de emergência', 'google_search', null, null]]
  await rest('POST', 'tracking_targets', KW.map(([keyword, engine_type], i) => ({ id: `tt-${i + 1}`, project_id: PID, user_id: USER, keyword, engine_type,
    is_active: true, avg_monthly_searches: 1000 + i, created_at: iso(now - 35 * 86400000) })))
  const D1 = now - 30 * 86400000, D2 = now - 3 * 3600000
  await rest('POST', 'scan_results', KW.flatMap(([keyword, engine_type, before, after], i) => [
    { id: `sr-${i}-a`, scan_id: 'scan-1', tracking_target_id: `tt-${i + 1}`, keyword, engine_type, found: before !== null, position: before, checked_at: iso(D1) },
    { id: `sr-${i}-b`, scan_id: 'scan-2', tracking_target_id: `tt-${i + 1}`, keyword, engine_type, found: after !== null, position: after,
      change_value: before && after ? before - after : null, checked_at: iso(D2), result_url: after ? 'https://encanador-sp.com.br/servicos' : null },
  ]))
  await rest('POST', 'ai_visibility_competitors', [{ id: 'c1', project_id: PID, user_id: USER, name: 'Encanador Rival',
    domain: 'rival-encanador.com.br', is_active: true, created_at: iso(now - 20 * 86400000) }])
  await rest('POST', 'keyword_competitor_positions', [2, 3].map((n) => ({ tracking_target_id: `tt-${n}`,
    competitor_domain: 'rival-encanador.com.br', position: n, url: 'https://rival-encanador.com.br/', checked_at: iso(D2) })))
  await rest('POST', 'generated_articles', [
    { id: 'ga-1', project_id: PID, user_id: USER, title: 'Como desentupir a pia sozinho', status: 'draft',
      created_at: iso(now - 2 * 86400000), updated_at: iso(now - 86400000) },
    { id: 'ga-2', project_id: PID, user_id: USER, title: 'Quanto custa achar um vazamento', status: 'published',
      created_at: iso(now - 86400000), updated_at: iso(now - 86400000), published_at: iso(now - 86400000) },
  ])
}

// The seeding scan, answered in the browser (it would otherwise call providers).
const START = Date.now() - 3 * 86400000
const seedRun = { ok: true, run: { id: 'run-1', stage: 'b', status: 'done', stalled: false, startedAt: iso(START),
  steps: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((step) => ({ step, status: 'done', errorCode: null, itemCount: null, startedAt: null, finishedAt: null })),
  summary: { version: 1, source: 'scan', domain: 'encanador-sp.com.br', url: 'https://encanador-sp.com.br/', scannedAt: iso(START), locale: 'en',
    storefrontLocked: false, siteAccess: 'direct', business: null, audiences: [], seedKeywords: ['encanador'], topics: [],
    findings: [], findingsOmitted: 0, geo: { state: 'measured', unavailableReason: null, passed: 3, total: 4, signals: [] }, competitors: [],
    counters: { keywords: 6, fixes: 0, geo: 3, articles: 0, competitors: 1 }, sitemapUrlCount: 40, sitemapTruncated: false } } }
const LEVELS = ['LOW', 'MEDIUM', 'HIGH']
const research = { ok: true, market: { country: 'BR', language: 'pt' }, fetchedAt: iso(START + 60000), truncated: false, tracked: [],
  keywords: ['desentupimento', 'achar vazamento', 'infiltração na parede', 'consertar aquecedor', 'limpeza de esgoto', 'impermeabilizar box'].map((keyword, i) => ({ keyword,
    avgMonthlySearches: 5000 - i * 400, competition: LEVELS[i % 3], competitionIndex: 15 + i * 13, lowTopOfPageBid: 1.5 + i, highTopOfPageBid: 6 + i * 2,
    currency: 'BRL', origins: ['site'], competitors: [], relevant: true })) }

;(async () => {
  if (process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED !== 'true') {
    console.log('NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED is not "true". Next inlines it at BUILD time, so')
    console.log('without it the dashboard cannot be Portuguese and every assertion here would report a')
    console.log('product defect that is really a missing flag. Run:')
    console.log('  NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED=true bash scripts/qa/journeys.sh portuguese-dashboard')
    check('the Portuguese build flag is set', false, 'NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED !== "true"')
    done()
    process.exitCode = 1
    return
  }

  let dict
  try { dict = dictionaries() } catch (e) { check('the pt-BR dictionary is readable', false, e.message); done(); process.exitCode = 1; return }

  // The instrument itself, before any page: a marker that equals its English
  // counterpart proves nothing, so the rail list is checked for drift first.
  const chrome = chromeVocabulary(dict)
  const rail = RAIL_PATHS.map((p) => ({ path: p, text: dict.pt[p] }))
  const railMissing = rail.filter((m) => typeof m.text !== 'string' || m.text.length === 0)
  const railSameAsEn = rail.filter((m) => dict.en[m.path] === m.text)
  check('the rail markers come from the dictionary', railMissing.length === 0, railMissing.map((m) => m.path).join(', '))
  check('every rail marker differs from its English value', railSameAsEn.length === 0, railSameAsEn.map((m) => `${m.path}="${m.text}"`).join(', '))
  check(`at least ${RAIL_MIN} rail markers exist to look for`, rail.length - railMissing.length >= RAIL_MIN, `${rail.length - railMissing.length}`)

  let server = null
  if (OWN_SERVER) {
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', SERPER_API_KEY: 'unreachable-by-design',
      ENABLE_CONTENT: 'true', NEXT_PUBLIC_ENABLE_CONTENT: 'true', NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED: 'true' }
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

    // ── the Portuguese dashboard ───────────────────────────────────────────
    const { page } = await signIn('pt-BR', 'pt-BR')
    let screens = 0
    for (const s of SCREENS) {
      const status = await go(page, s.path, s.ready)
      const m = await measure(page)
      await shoot(page, s.name)
      screens++
      check(`${s.name}: 200 and rendered`, status === 200 && m.hasMain && m.text.trim().length > 300,
        `status=${status} main=${m.hasMain} text=${m.text.trim().length} chars`)
      check(`${s.name}: <html lang="pt-BR" dir="ltr">`, m.lang === 'pt-BR' && m.dir === 'ltr', `lang=${m.lang} dir=${m.dir}`)
      const stray = m.excluded.filter((e) => !ENDONYMS.has(e.text))
      check(`${s.name}: only the language endonym carries lang=he`, stray.length === 0,
        stray.map((e) => `<${e.tag}>"${e.text.slice(0, 60)}"`).join(' | '))
      const runs = hebrewRuns(m.text)
      check(`${s.name}: no Hebrew in the rendered text`, runs.length === 0, runs.length ? `Hebrew on ${s.name} (${s.path}): ${runs.map((r) => `"${r}"`).join(' | ')}` : '')
      const railFound = rail.filter((r) => r.text && m.text.includes(r.text))
      check(`${s.name}: the rail is Portuguese (${RAIL_MIN}+ of ${rail.length} labels)`, railFound.length >= RAIL_MIN,
        `found ${railFound.length}: ${railFound.map((r) => r.text).join(', ')} — sought ${rail.map((r) => r.text).join(', ')}`)
      const pool = sectionMarkers(dict, s.sections, chrome)
      const hit = pool.filter((p) => m.mainText.includes(p.text))
      check(`${s.name}: its own copy is Portuguese, inside <main> (${s.sections.join('+')})`, pool.length > 0 && hit.length > 0,
        pool.length === 0 ? `no usable marker in ${s.sections.join('+')}` : `none of ${pool.length} markers present in <main>; e.g. ${pool.slice(0, 8).map((p) => `${p.path}="${p.text}"`).join(' | ')}`)
      // Printed pass or fail: a check that is barely scraping by should be
      // visible, not hidden behind a tick.
      console.log(`    · ${s.name}: body ${m.text.trim().length} chars, <main> ${m.mainText.trim().length}; rail ${railFound.length}/${rail.length}; own markers ${hit.length}/${pool.length}${hit.length ? ` (e.g. "${hit[0].text}")` : ''}`)
    }

    // The GUIDE — a menu in the top bar rather than a screen of its own, so it
    // is opened and measured where it lives. The guided tour starts by itself
    // on a fresh account and covers the bar, so it is closed first: otherwise
    // this surface measures the tour's words and calls them the menu's.
    await go(page, `/dashboard?projectId=${PID}`, '[data-dashboard-widget="hero"]')
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(500)
    const guideBtn = page.locator('button', { hasText: dict.pt['guide.label'] }).first()
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
      check('16-guide-menu: the menu itself is Portuguese', pool.length > 0 && hit.length > 0,
        `none of ${pool.length} markers present in the menu; e.g. ${pool.slice(0, 8).map((p) => `${p.path}="${p.text}"`).join(' | ')}`)
      console.log(`    · 16-guide-menu: menu ${menuText.trim().length} chars; own markers ${hit.length}/${pool.length}${hit.length ? ` (e.g. "${hit[0].text}")` : ''}`)
      await page.keyboard.press('Escape').catch(() => {})
    } else {
      check('16-guide-menu: the Guide pill is there', false, `no button reading "${dict.pt['guide.label']}"`)
    }

    // ── the POSITIVE CONTROL ───────────────────────────────────────────────
    // The same instrument, unchanged, against the HEBREW dashboard. It must
    // find Hebrew (so the detector detects) and must find none of the
    // Portuguese rail markers (so the marker check discriminates). Without this
    // pair, a detector that measured nothing would report a clean sweep.
    const control = await signIn('he', 'he-IL')
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
    check('control: none of the Portuguese rail markers are there', cRail.length === 0, cRail.map((r) => r.text).join(', '))

    // ── the SECOND CONTROL: the same instrument against ENGLISH ────────────
    // The Hebrew control proves the Hebrew detector detects. It cannot prove
    // the "not silently English" half, because an English dashboard has no
    // Hebrew in it either — and an English dashboard is EXACTLY the failure the
    // merge-over-English fallback would produce. So the marker checks are run
    // once more with the cookie set to `en`, over three of the same screens,
    // and every one of them must now FAIL to find Portuguese.
    const eng = await signIn('en', 'en-US')
    for (const s of SCREENS.filter((x) => ['01-home-painel', '04-project-settings', '12-site-health'].includes(x.name))) {
      const st = await go(eng.page, s.path, s.ready)
      const em = await measure(eng.page)
      const eRail = rail.filter((r) => r.text && em.text.includes(r.text))
      const ePool = sectionMarkers(dict, s.sections, chrome)
      const eHit = ePool.filter((pp) => em.mainText.includes(pp.text))
      check(`control(en) ${s.name}: rendered in English`, st === 200 && em.lang === 'en' && em.mainText.trim().length > 150,
        `status=${st} lang=${em.lang} main=${em.mainText.trim().length} chars`)
      check(`control(en) ${s.name}: the rail check does NOT pass`, eRail.length < RAIL_MIN, `found ${eRail.length}: ${eRail.map((r) => r.text).join(', ')}`)
      check(`control(en) ${s.name}: NO Portuguese marker of its own section`, eHit.length === 0, eHit.slice(0, 5).map((pp) => `${pp.path}="${pp.text}"`).join(' | '))
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
