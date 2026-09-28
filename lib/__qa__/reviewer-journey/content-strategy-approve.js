/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * The owner's report: on the content strategy screen the system already has ideas, but
 * pressing to approve them dropped him into the old list view (/content/strategy?view=list#ideas).
 *
 * In real Chromium, over a real production build and the Supabase stub, logged in
 * through the real form, in Hebrew:
 *   1. the board shows the pending ideas, each with its own approve button;
 *   2. the next-article card swaps its idea without a request, and approves the new one;
 *   3. approve on a board card: the idea shows as approved in "planned" at once, and the
 *      stub's database holds the topic (and, with automation, the idea marked approved);
 *   4. a failed approval puts the idea back and says so in Hebrew, never the server's text;
 *   5. a reload shows the same thing from the server;
 *   6. and through all of it, no address the page was ever at contains view=list.
 *
 * Standalone, against a server and stub that are already running (the server started with
 * ENABLE_CONTENT=true, and ENABLE_CONTENT_AUTOMATION=true for the automation path):
 *   IDEA_BASE_URL=http://127.0.0.1:3831 IDEA_STUB_URL=http://127.0.0.1:5831 node lib/__qa__/reviewer-journey/content-strategy-approve.js
 * Under scripts/qa/journeys.sh it starts its own `next start` on :3993 over the stub on :5555.
 * A build without NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION approves through POST
 * /api/content/topics (no stored idea to mark, no "not a fit"); the journey checks
 * whichever path the build has, and says which.
 */
const { spawn } = require('child_process')
const { join, resolve } = require('path')
const { mkdirSync } = require('fs')

const ROOT = resolve(__dirname, '../../..')
const OWN_SERVER = !process.env.IDEA_BASE_URL
const PORT = 3993
const BASE = process.env.IDEA_BASE_URL || `http://127.0.0.1:${PORT}`
const STUB = process.env.IDEA_STUB_URL || 'http://127.0.0.1:5555'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/content-strategy-approve'
const PID = 'a1111111-2222-3333-4444-555555555555'
const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
mkdirSync(SHOTS, { recursive: true })

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await sleep(500)
  }
  return false
}

const H = { 'content-type': 'application/json', authorization: 'Bearer stub-service-key', apikey: 'stub-service-key' }
const iso = (ms) => new Date(ms).toISOString()
async function rest(method, path, body) {
  const r = await fetch(`${STUB}/rest/v1/${path}`, { method, headers: H, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}`)
}
const db = async () => (await fetch(`${STUB}/__stub/db`)).json()

const IDEAS = [
  ['idea-1', 'איך לבחור נעלי ריצה לכביש', 'נעלי ריצה לכביש', 0.92],
  ['idea-2', 'נעלי ריצה לשטח: מדריך מלא', 'נעלי ריצה לשטח', 0.88],
  ['idea-3', 'כמה זמן מחזיקות נעלי ריצה', 'אורך חיים נעלי ריצה', 0.81],
  ['idea-4', 'גרבי ריצה מצמר מרינו', 'גרבי ריצה מרינו', 0.77],
]
async function seed() {
  await fetch(`${STUB}/__stub/reset`)
  const now = Date.now()
  await rest('PATCH', `projects?id=eq.${PID}`, { name: 'נעלי ריצה', business_name: 'נעלי ריצה', target_domain: 'run-shop.co.il', country: 'IL', language: 'he' })
  await rest('POST', 'content_topic_ideas', IDEAS.map(([id, title, primary_keyword, score], i) => ({
    id, project_id: PID, user_id: USER, status: 'pending', source: 'hybrid', title, primary_keyword,
    suggestion_reason: 'ביטוי עם כוונת קנייה ואין לכם עמוד שעונה עליו.', score, fingerprint: `fp-${id}`,
    created_at: iso(now - (i + 1) * 3600000), updated_at: iso(now) })))
  await rest('POST', 'generated_articles', [{ id: 'ga-1', project_id: PID, user_id: USER, title: 'המדריך לנעלי ריצה למתחילים', status: 'published',
    created_at: iso(now - 9 * 86400000), updated_at: iso(now - 8 * 86400000), published_at: iso(now - 8 * 86400000) }])
}

;(async () => {
  let server = null
  if (OWN_SERVER) {
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', ENABLE_CONTENT: 'true', ENABLE_CONTENT_AUTOMATION: 'true' }
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: ROOT, detached: true, stdio: 'ignore', env })
  }
  const kill = () => { if (server) { try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } } }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); console.log(`${pass} passed, ${fail + 1} failed`); return }
  try { await seed() } catch (e) { check('the fixture seeds', false, e.message) }

  const { chromium } = require(require.resolve('playwright-core', { paths: [ROOT] }))
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' })
    await ctx.addCookies([{ name: 'dashboard-language', value: 'he', url: BASE }])
    const page = await ctx.newPage()
    await page.route('**/*', (route) => (new URL(route.request().url()).hostname !== '127.0.0.1' ? route.abort() : route.continue()))
    // Every address the page is ever at, and every idea request it makes.
    const urls = []
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()) })
    const posts = []
    page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/content\//.test(r.url())) posts.push(new URL(r.url()).pathname) })

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.fill('input[type="email"]', 'reviewer@example.com')
    await page.fill('input[type="password"]', 'whatever')
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')])
    await page.goto(`${BASE}/content/strategy?projectId=${PID}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})

    const ideasCol = page.locator('[data-strategy-column="ideas"]')
    const plannedCol = page.locator('[data-strategy-column="planned"]')
    const card = (id) => page.locator(`[data-strategy-card="idea:${id}"]`)
    await card('idea-3').waitFor({ timeout: 30000 }).catch(() => {})

    // 1 — every idea on the board has its own approve button.
    const withButton = await ideasCol.locator('[data-strategy-card^="idea:"] [data-idea-action="approve"]').count()
    check('1: every pending idea card on the board has an approve button', withButton === IDEAS.length, `${withButton} of ${IDEAS.length}`)
    check('1b: the next-article card acts on its idea, and nothing on the page links to the list view',
      (await page.locator('[data-next-idea-actions]').count()) === 1 && (await page.locator('a[href*="view=list"]').count()) === 0)

    // 2 — the next-article card (while it is still an idea): swap, with no request, then approve.
    const next = page.locator('[data-next-idea-actions]')
    const nextTitle = async () => (await page.locator('[data-next-title]').first().textContent() || '').trim()
    const before = await nextTitle()
    const postsBeforeSwap = posts.length
    await next.locator('[data-idea-action="swap"]').click()
    await sleep(400)
    const afterSwap = await nextTitle()
    check('2: "swap topic" brings the next pending idea, without any request', before === IDEAS[0][1] && afterSwap !== before && posts.length === postsBeforeSwap, `${before} → ${afterSwap}`)
    await next.locator('[data-idea-action="approve"]').click()
    await plannedCol.locator('[data-strategy-card]', { hasText: afterSwap }).first().waitFor({ timeout: 15000 }).catch(() => {})
    check('2b: approve on the next-article card plans its idea', (await plannedCol.getByText(afterSwap, { exact: true }).count()) === 1)
    await sleep(1200)

    // 3 — approve on a board card.
    const title2 = IDEAS[2][1]
    await card('idea-3').locator('[data-idea-action="approve"]').click()
    const approvedChip = plannedCol.locator('[data-strategy-card]', { hasText: title2 }).locator('[data-approved-now]')
    await approvedChip.waitFor({ timeout: 15000 }).catch(() => {})
    check('3: the idea shows as approved, in "planned"', (await approvedChip.count()) === 1)
    check('3b: and it left the ideas column', (await ideasCol.getByText(title2, { exact: true }).count()) === 0)
    await sleep(1200)
    const viaIdeas = posts.includes('/api/content/automation/topics/bulk')
    console.log(`    (approved through ${viaIdeas ? 'POST /api/content/automation/topics/bulk (automation)' : 'POST /api/content/topics (no automation in this build)'})`)
    let d = await db()
    const topic = (d.article_topics || []).find((t) => t.topic === title2)
    check('3c: the stub\'s database holds the topic, for this project and owner', !!topic && topic.project_id === PID && topic.user_id === USER, JSON.stringify(topic))
    if (viaIdeas) {
      const idea = (d.content_topic_ideas || []).find((i) => i.id === 'idea-3')
      check('3d: approved as an approved topic, and the stored idea marked approved with it', topic && topic.status === 'approved' && idea && idea.status === 'approved' && idea.approved_topic_id === topic.id, JSON.stringify(idea))
    }
    await page.screenshot({ path: join(SHOTS, 'approved-on-board.png'), fullPage: true }).catch(() => {})

    // 4 — a failure puts the idea back, in our words.
    const leak = 'duplicate key value violates unique constraint "article_topics_pkey"'
    await page.route('**/api/content/**', (route) => (route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: leak }) })
      : route.continue()))
    const remaining = await ideasCol.locator('[data-strategy-card^="idea:"]').first().getAttribute('data-strategy-card')
    await page.locator(`[data-strategy-card="${remaining}"] [data-idea-action="approve"]`).click()
    await page.getByText('לא הצלחנו לאשר את הרעיון. נסו שוב בעוד רגע.').first().waitFor({ timeout: 10000 }).catch(() => {})
    const body = await page.locator('body').innerText()
    check('4: a failed approval says so in Hebrew', /לא הצלחנו לאשר את הרעיון/.test(body))
    check('4b: never with the server\'s text', !body.includes('duplicate key') && !body.includes('article_topics_pkey'))
    check('4c: and the idea is back among the ideas', (await page.locator(`[data-strategy-column="ideas"] [data-strategy-card="${remaining}"]`).count()) === 1)
    await page.unroute('**/api/content/**')

    // 5 — the server agrees after a reload.
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {})
    await plannedCol.getByText(title2, { exact: true }).first().waitFor({ timeout: 20000 }).catch(() => {})
    check('5: after a reload the approved ideas are planned, and not ideas', (await plannedCol.getByText(title2, { exact: true }).count()) === 1
      && (await ideasCol.getByText(title2, { exact: true }).count()) === 0 && (await plannedCol.getByText(afterSwap, { exact: true }).count()) === 1)

    // 6 — never the list view.
    const listed = urls.filter((u) => /[?&]view=list/.test(u))
    check('6: no address the page was ever at contains view=list', listed.length === 0 && !/view=list/.test(page.url()), listed.join(' | '))
    await page.screenshot({ path: join(SHOTS, 'after-reload.png'), fullPage: true }).catch(() => {})
  } catch (e) {
    check('the journey ran to its end', false, e.message)
  } finally {
    await browser.close()
    kill()
    console.log(`\n${pass} passed, ${fail} failed`)
  }
})()
