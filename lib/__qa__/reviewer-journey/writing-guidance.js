/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * The owner's writing guidelines, end to end in the browser:
 *
 *   1. settings → "writing guidelines": type standing instructions, add what
 *      the business does not offer, save; the row the database holds is the
 *      owner's, with exactly that, and the article design is untouched;
 *   2. an article's page → "what should change in the next articles?": write a
 *      note and save it; it becomes a rule of the article's project, with the
 *      article it came from, and the article itself is not changed;
 *   3. back in the settings, the rule is listed and can be deleted.
 *
 * Every screen in Hebrew (the owner's language) and English; screenshots of each.
 *
 *   node lib/__qa__/reviewer-journey/writing-guidance.js
 *
 * JOURNEY_BASE=<url> drives an app that is already running; STUB_URL points at
 * a stub on another port.
 */
const { spawn } = require('child_process')
const { mkdirSync } = require('fs')
const { join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3991)
const BASE = process.env.JOURNEY_BASE || `http://127.0.0.1:${PORT}`
const STUB = process.env.STUB_URL || 'http://127.0.0.1:5555'
const APP_DIR = process.env.JOURNEY_APP_DIR || '/home/user/rankings-by-go-top'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/writing-guidance'
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

const USER_ID = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06' // the stub's user
const PROJECT_ID = 'a1111111-2222-3333-4444-555555555555' // the stub's project
const ARTICLE_ID = 'c1111111-2222-3333-4444-555555555555'

const stub = (path) => fetch(`${STUB}${path}`).then((r) => r.json()).catch(() => null)
const insert = (table, row) => fetch(`${STUB}/rest/v1/${table}`, {
  method: 'POST', headers: { 'content-type': 'application/json', apikey: 'stub-service-key', authorization: 'Bearer stub-service-key' }, body: JSON.stringify(row),
})
const guidanceRows = async () => (((await stub('/__stub/db')) || {}).project_article_styles || []).filter((r) => r.project_id === PROJECT_ID)

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
  he: { instructions: 'כתבו בגוף ראשון רבים. הדגישו שאנחנו עובדים רק עם חומרים מאירופה. אל תזכירו מחירים.', exclusion: 'תיקוני צנרת', note: 'האחריות שלנו היא שנתיים, לא שנה', noteSaved: 'מהמאמר הבא נכתוב לפי זה' },
  en: { instructions: 'Write as "we". Stress that we only use materials made in Europe. Never mention prices.', exclusion: 'Plumbing repairs', note: 'Our warranty is two years, not one', noteSaved: 'From the next article on' },
}

async function run(browser, locale) {
  const c = COPY[locale]
  console.log(`\n${locale}) writing guidelines`)
  await stub('/__stub/reset')
  await stub('/__stub/fixture?account=web')
  await insert('project_article_styles', { project_id: PROJECT_ID, user_id: USER_ID, design: 'formatted', brand_colors: ['#c60035'], image_style: 'realistic',
    hero_ratio: '16:9', inline_images: 0, own_images_only: false, official_profiles: {}, article_cta: {}, writing_guidance: {} })
  await insert('generated_articles', { id: ARTICLE_ID, user_id: USER_ID, project_id: PROJECT_ID, topic_id: null, language: locale,
    title: locale === 'he' ? 'שיפוץ אמבטיה: כל מה שצריך לדעת' : 'Bathroom renovation: what to know', slug: 'bathroom-renovation',
    meta_title: 'x', meta_description: 'x', excerpt: 'x', status: 'draft',
    content_html: locale === 'he' ? '<h2>מה כולל שיפוץ אמבטיה</h2><p>שיפוץ אמבטיה כולל פירוק, איטום, ריצוף והתקנת כלים.</p>' : '<h2>What a renovation covers</h2><p>Stripping, waterproofing, tiling and fittings.</p>',
    faq_json: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() })

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: locale === 'he' ? 'he-IL' : 'en-US' })
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

  // 1) settings
  await page.goto(`${BASE}/settings?projectId=${PROJECT_ID}&lang=${locale}#writing-guidance`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const card = await page.waitForSelector('[data-writing-guidance=""]', { timeout: 90000 }).then(() => true).catch(() => false)
  check(`${locale}: the settings show the writing guidelines card`, card)
  if (!card) { await page.screenshot({ path: join(SHOTS, `${locale}-0-settings.png`), fullPage: true }); await ctx.close(); return }
  await page.$eval('#writing-guidance', (el) => el.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: join(SHOTS, `${locale}-1-settings-empty.png`) })
  const switchOn = await page.$eval('[data-writing-mention] [role="switch"]', (el) => el.getAttribute('aria-checked')).catch(() => null)
  check(`${locale}: "mention the business" is on by default`, switchOn === 'true', String(switchOn))
  await page.fill('#writing-instructions', c.instructions)
  await page.fill('#writing-exclusion', c.exclusion)
  await page.keyboard.press('Enter')
  const chips = await page.$$eval('[data-writing-exclusions] li', (els) => els.length).catch(() => 0)
  check(`${locale}: Enter adds the exclusion as a chip`, chips === 1, String(chips))
  await page.click('#writing-guidance [data-settings-save] button:last-child')
  // Wait for the save itself ("unsaved changes" also contains the Hebrew word for saved).
  for (let i = 0; i < 40 && !((await guidanceRows())[0] || {}).writing_guidance?.instructions; i++) await page.waitForTimeout(250)
  await page.waitForSelector('#writing-guidance footer [data-dirty]', { state: 'detached', timeout: 20000 }).catch(() => {})
  let rows = await guidanceRows()
  const g = rows[0] && rows[0].writing_guidance
  check(`${locale}: one row, the owner's, holding exactly what was typed`, rows.length === 1 && rows[0].user_id === USER_ID && g && g.instructions === c.instructions && JSON.stringify(g.exclusions) === JSON.stringify([c.exclusion]), JSON.stringify(rows))
  check(`${locale}: the article design on that row is untouched`, rows[0] && rows[0].design === 'formatted' && JSON.stringify(rows[0].brand_colors) === JSON.stringify(['#c60035']))
  await page.$eval('#writing-guidance', (el) => el.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: join(SHOTS, `${locale}-2-settings-saved.png`) })

  // 2) the article's page
  await page.goto(`${BASE}/content/articles/${ARTICLE_ID}?lang=${locale}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const box = await page.waitForSelector('[data-writing-feedback] textarea', { timeout: 90000 }).then(() => true).catch(() => false)
  check(`${locale}: the article page offers "what should change in the next articles?"`, box)
  if (!box) { await page.screenshot({ path: join(SHOTS, `${locale}-3-article.png`), fullPage: true }); await ctx.close(); return }
  const before = JSON.stringify(((await stub('/__stub/db')).generated_articles || []).find((a) => a.id === ARTICLE_ID))
  await page.fill('[data-writing-feedback] textarea', c.note)
  await page.screenshot({ path: join(SHOTS, `${locale}-3-article-note.png`) })
  await page.click('[data-writing-feedback-save]')
  await page.waitForFunction((t) => document.querySelector('[data-writing-feedback]')?.textContent?.includes(t), c.noteSaved, { timeout: 20000 }).catch(() => {})
  const said = await page.innerText('[data-writing-feedback]').catch(() => '')
  check(`${locale}: the card says it is saved for the next articles`, said.includes(c.noteSaved), said.slice(-160))
  rows = await guidanceRows()
  const rules = (rows[0] && rows[0].writing_guidance && rows[0].writing_guidance.rules) || []
  check(`${locale}: the note is a rule of the article's project, with the article it came from`, rules.length === 1 && rules[0].text === c.note && rules[0].article_id === ARTICLE_ID, JSON.stringify(rules))
  check(`${locale}: …and the instructions saved before are still there`, rows[0] && rows[0].writing_guidance.instructions === c.instructions)
  const after = JSON.stringify(((await stub('/__stub/db')).generated_articles || []).find((a) => a.id === ARTICLE_ID))
  check(`${locale}: the article itself is not changed`, before === after)
  await page.screenshot({ path: join(SHOTS, `${locale}-4-article-saved.png`) })

  // 3) back in the settings
  await page.goto(`${BASE}/settings?projectId=${PROJECT_ID}&lang=${locale}#writing-guidance`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('[data-writing-rules=""] li', { timeout: 90000 }).catch(() => {})
  const listed = await page.$$eval('[data-writing-rules=""] li', (els) => els.map((e) => e.textContent || '')).catch(() => [])
  check(`${locale}: the settings list the rule`, listed.length === 1 && listed[0].includes(c.note), JSON.stringify(listed))
  await page.$eval('#writing-guidance', (el) => el.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: join(SHOTS, `${locale}-5-settings-rule.png`) })
  await page.click('[data-writing-rules=""] li button')
  await page.click('#writing-guidance [data-settings-save] button:last-child')
  await page.waitForTimeout(1500)
  rows = await guidanceRows()
  check(`${locale}: deleting the rule and saving leaves none`, rows[0] && rows[0].writing_guidance.rules.length === 0, JSON.stringify(rows[0] && rows[0].writing_guidance))
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
