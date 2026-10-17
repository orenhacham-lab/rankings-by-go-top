/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * The author box in the settings, end to end in the browser (Hebrew, the
 * owner's language, then English):
 *
 *   1. settings → "writing guidelines": the author-box preview shows the name
 *      the system picked (here the business name: no WordPress user can be
 *      read from the stub), where it came from, the line from the business
 *      description and where the link goes;
 *   2. typing an author name changes the preview at once, and says so;
 *   3. a link that is not http(s) is refused on save, nothing is written;
 *   4. a valid link and the name are saved on the owner's row, and the
 *      preview links there.
 *
 *   node lib/__qa__/reviewer-journey/author-box-settings.js
 *
 * JOURNEY_BASE=<url> drives an app that is already running; STUB_URL points at
 * a stub on another port; AUTHOR_BOX_SHOT copies the Hebrew preview screenshot
 * to that path.
 */
const { spawn } = require('child_process')
const { copyFileSync, mkdirSync } = require('fs')
const { dirname, join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3993)
const BASE = process.env.JOURNEY_BASE || `http://127.0.0.1:${PORT}`
const STUB = process.env.STUB_URL || 'http://127.0.0.1:5555'
const APP_DIR = process.env.JOURNEY_APP_DIR || join(__dirname, '..', '..', '..')
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/author-box-settings'
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

const USER_ID = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06' // the stub's user
const PROJECT_ID = 'a1111111-2222-3333-4444-555555555555' // the stub's project

const stub = (path) => fetch(`${STUB}${path}`).then((r) => r.json()).catch(() => null)
const rest = (method, path, body) => fetch(`${STUB}/rest/v1/${path}`, {
  method, headers: { 'content-type': 'application/json', apikey: 'stub-service-key', authorization: 'Bearer stub-service-key' }, body: JSON.stringify(body),
})
const styleRow = async () => (((await stub('/__stub/db')) || {}).project_article_styles || []).find((r) => r.project_id === PROJECT_ID)

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

const COPY = {
  he: {
    business: 'מאפיית לוי', domain: 'levi-bakery.co.il', language: 'he',
    description: 'מאפייה משפחתית בחיפה שאופה לחם מחמצת מאז 1998. אנחנו גם שולחים משלוחים למשרדים בצפון.',
    line: 'מאפייה משפחתית בחיפה שאופה לחם מחמצת מאז 1998.', heading: 'על הכותב', name: 'דנה כהן',
    sourceBusiness: 'שם העסק', sourceOverride: 'השם שכתבתם',
  },
  en: {
    business: 'Levi Bakery', domain: 'levi-bakery.example', language: 'en',
    description: 'Family bakery in Haifa baking sourdough since 1998. We also deliver to offices across the north.',
    line: 'Family bakery in Haifa baking sourdough since 1998.', heading: 'About the author', name: 'Dana Cohen',
    sourceBusiness: 'your business name', sourceOverride: 'the name you typed',
  },
}

/** The author-box part of the card, clear of the sticky top bar. */
async function shootCard(page, path) {
  await page.$eval('[data-writing-author-box]', (el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -96) })
  await page.waitForTimeout(400)
  const b = await page.$eval('[data-writing-author-box]', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
  await page.screenshot({ path, clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: b.width + 24, height: Math.min(b.height + 24, 1100 - b.y) } })
}

const text = (page, sel) => page.$eval(sel, (el) => el.textContent || '').catch(() => '')

async function run(browser, locale) {
  const c = COPY[locale]
  console.log(`\n${locale}) the author box in the settings`)
  await stub('/__stub/reset')
  await stub('/__stub/fixture?account=web')
  // A WordPress site (its user cannot be read from the stub, so the business name is picked).
  await stub('/__stub/fixture?wp=connected')
  await rest('PATCH', `projects?id=eq.${PROJECT_ID}`, { business_name: c.business, name: c.business, target_domain: c.domain, language: c.language })
  await rest('PATCH', `project_profiles?project_id=eq.${PROJECT_ID}`, { description: c.description })
  await rest('POST', 'project_article_styles', { project_id: PROJECT_ID, user_id: USER_ID, design: 'formatted', brand_colors: ['#c60035'], image_style: 'realistic',
    hero_ratio: '16:9', inline_images: 0, own_images_only: false, official_profiles: {}, article_cta: {}, writing_guidance: {},
    author_box: true, theme_author_box: null, theme_author_box_checked_at: null, author_box_name: null, author_box_url: null, author_box_image: 'none' })

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, locale: locale === 'he' ? 'he-IL' : 'en-US' })
  const page = await ctx.newPage()
  for (let attempt = 0; attempt < 2 && (attempt === 0 || page.url().includes('/login')); attempt += 1) {
    await page.goto(`${BASE}${locale === 'he' ? '' : '/en'}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForFunction(() => !!window.next, { timeout: 30000 }).catch(() => {})
    await page.fill('input[type="email"]', 'reviewer@example.com')
    await page.fill('input[type="password"]', 'whatever')
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
  }
  check(`${locale}: signed in`, !page.url().includes('/login'), page.url())

  await page.goto(`${BASE}/settings?projectId=${PROJECT_ID}&lang=${locale}#writing-guidance`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const ready = await page.waitForSelector('[data-author-box-preview="ready"]', { timeout: 90000 }).then(() => true).catch(() => false)
  check(`${locale}: the card shows the author-box preview`, ready)
  if (!ready) { await page.screenshot({ path: join(SHOTS, `${locale}-0-settings.png`), fullPage: true }); await ctx.close(); return }
  const sample = await text(page, '[data-author-box-sample]')
  check(`${locale}: the preview: the heading, the business name, the description's first sentence`, sample.includes(c.heading) && sample.includes(c.business) && sample.includes(c.line), sample)
  check(`${locale}: …it says where the name came from`, (await text(page, '[data-author-box-source]')).includes(c.sourceBusiness), await text(page, '[data-author-box-source]'))
  check(`${locale}: …and where the link goes (the home page: no about page is known)`, (await text(page, '[data-author-box-link]')) === `https://${c.domain}/`, await text(page, '[data-author-box-link]'))
  check(`${locale}: on WordPress the image choice is offered, "no image" chosen`, (await page.$$eval('[data-author-box-image] [role="radio"]', (els) => els.map((e) => e.getAttribute('aria-checked')))).join(',') === 'true,false')
  const shot = join(SHOTS, `${locale}-1-preview.png`)
  await shootCard(page, shot)
  if (locale === 'he' && process.env.AUTHOR_BOX_SHOT) {
    mkdirSync(dirname(process.env.AUTHOR_BOX_SHOT), { recursive: true })
    copyFileSync(shot, process.env.AUTHOR_BOX_SHOT)
  }

  await page.fill('#author-box-name', c.name)
  const typed = await text(page, '[data-author-box-name]')
  check(`${locale}: a typed name wins in the preview at once, and says so`, typed === c.name && (await text(page, '[data-author-box-source]')).includes(c.sourceOverride), typed)

  await page.fill('#author-box-url', 'javascript:alert(1)')
  await page.click('#writing-guidance [data-settings-save] button:last-child')
  const refused = await page.waitForSelector('#author-box-url-error', { timeout: 10000 }).then(() => true).catch(() => false)
  const afterBad = await styleRow()
  check(`${locale}: a javascript: link is refused on save, nothing written`, refused && afterBad && afterBad.author_box_url == null && afterBad.author_box_name == null, JSON.stringify(afterBad && { n: afterBad.author_box_name, u: afterBad.author_box_url }))

  await page.fill('#author-box-url', 'https://levi.example/team')
  check(`${locale}: a valid link shows in the preview`, (await text(page, '[data-author-box-link]')) === 'https://levi.example/team')
  await page.click('#writing-guidance [data-settings-save] button:last-child')
  let row = null
  for (let i = 0; i < 40; i++) { row = await styleRow(); if (row && row.author_box_url) break; await page.waitForTimeout(250) }
  check(`${locale}: the name and the link are saved on the owner's row`, row && row.user_id === USER_ID && row.author_box_name === c.name && row.author_box_url === 'https://levi.example/team', JSON.stringify(row && { n: row.author_box_name, u: row.author_box_url }))
  await shootCard(page, join(SHOTS, `${locale}-2-saved.png`))
  await ctx.close()
}

;(async () => {
  let server = null
  if (!process.env.JOURNEY_BASE) {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: APP_DIR, detached: true, stdio: 'ignore',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', ENABLE_SEED_SCAN: 'true', ENABLE_CONTENT: 'true' },
    })
  }
  const kill = () => { if (server) try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } }
  if (!(await waitFor(server, 120000))) { console.log('server did not start'); kill(); console.log('\n0 passed, 1 failed'); process.exitCode = 1; return }
  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    for (const locale of ['he', 'en']) await run(browser, locale)
  } finally {
    await browser.close()
    kill()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exitCode = fail ? 1 : 0
})()
