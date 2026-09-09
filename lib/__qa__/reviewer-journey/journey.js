/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS scripts, run with `node`, never bundled. */
/* The reviewer journey, in real Chromium, against a real production build. */
const { spawn } = require('child_process')
const { join } = require('path')
const { mkdirSync } = require('fs')
const PORT = 3991, BASE = `http://127.0.0.1:${PORT}`
const SHOTS = process.env.QA_SCREENSHOT_DIR
const PROJECT_ID = 'a1111111-2222-3333-4444-555555555555'
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

;(async () => {
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: '/home/user/rankings-by-go-top', detached: true, stdio: 'ignore',
    env: { ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:5555',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
      NEXT_PUBLIC_ENABLE_AI_VISIBILITY: 'true', ENABLE_AI_VISIBILITY: 'true' },
  })
  const kill = () => { try { process.kill(-server.pid, 'SIGKILL') } catch {} }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); return }

  // A FRESH FIXTURE, whatever ran before. These journeys share one stub
  // process; without this the second one to run inherits the first one's rows
  // and fails for a reason that has nothing to do with the code under test.
  await fetch('http://127.0.0.1:5555/__stub/reset', { method: 'GET' }).catch(() => {})

  const { chromium } = require('/home/user/rankings-by-go-top/node_modules/playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    const consoleErrors = [], graph = []
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) consoleErrors.push(m.text()) })
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
    page.on('request', (r) => graph.push({ method: r.method(), url: r.url() }))
    // Only the local server and the local stub may be reached.
    await page.route('**/*', (route) => {
      const h = new URL(route.request().url()).hostname
      return h === '127.0.0.1' ? route.continue() : route.abort()
    })

    // ── log in through the real form ──────────────────────────────────────
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.fill('input[type="email"]', 'reviewer@example.com')
    await page.fill('input[type="password"]', 'whatever')
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
    check('reviewer reaches an authenticated page (not bounced to /login or /billing)',
      !page.url().includes('/login') && !page.url().includes('/billing'), page.url())
    await page.screenshot({ path: join(SHOTS, 'journey-1-after-login.png'), fullPage: true })

    // ── the project detail page: request graph + completion ───────────────
    graph.length = 0
    const t0 = Date.now()
    await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    let settled = false
    try { await page.getByRole('button', { name: /Add keyword|הוסף מילת מפתח/ }).first().waitFor({ timeout: 30000 }); settled = true } catch {}
    const elapsed = Date.now() - t0
    check('the project page finishes loading (spinner resolves)', settled, `${elapsed}ms`)
    console.log(`    ↳ settled in ${elapsed}ms`)
    const supaCalls = graph.filter((r) => r.url.includes('127.0.0.1:5555'))
    console.log(`    ↳ client request graph: ${supaCalls.length} Supabase calls`)
    for (const c of supaCalls.slice(0, 12)) console.log(`       ${c.method} ${c.url.replace('http://127.0.0.1:5555', '')}`)
    await page.screenshot({ path: join(SHOTS, 'journey-2-project.png'), fullPage: true })

    // ── add the keyword `shopify` ─────────────────────────────────────────
    await page.getByRole('button', { name: /Add keyword|הוסף מילת מפתח/ }).first().click()
    const form = page.locator('form:has(input[name="keyword"])').first()
    await form.locator('input[name="keyword"]').fill('shopify')
    await page.screenshot({ path: join(SHOTS, 'journey-3-add-keyword-form.png'), fullPage: true })
    await form.locator('button[type="submit"]').first().click()
    await page.waitForTimeout(3000)
    const errBox = await page.locator('.bg-red-50, .text-red-700').allInnerTexts().catch(() => [])
    const visibleError = errBox.map((s) => s.trim()).filter(Boolean).join(' | ')
    check('no error is shown after submitting the keyword', visibleError === '', visibleError)
    await page.screenshot({ path: join(SHOTS, 'journey-4-after-add.png'), fullPage: true })

    const db = await (await fetch('http://127.0.0.1:5555/__stub/db')).json()
    check('the keyword row was actually created in the database',
      db.tracking_targets.length === 1 && db.tracking_targets[0].keyword === 'shopify',
      JSON.stringify(db.tracking_targets.map((r) => r.keyword)))
    check('…with the submitted engine and the project location mode',
      db.tracking_targets[0]?.engine_type === 'google_search' && db.tracking_targets[0]?.location_mode === 'project',
      JSON.stringify(db.tracking_targets[0] ?? {}))

    // ── the AI allocation, through the real dispatch route ────────────────
    const aiRes = await page.evaluate(async (pid) => {
      const r = await fetch('/api/ai-visibility/runs', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: pid, promptId: 'prompt-1', engine: 'chatgpt' }) })
      let b = null; try { b = await r.json() } catch {}
      return { status: r.status, body: b }
    }, PROJECT_ID)
    check('the AI dispatch is not refused with a zero allowance',
      aiRes.status !== 403 && aiRes.body?.code !== 'QUOTA_AI_SCANS' && aiRes.body?.limit !== 0,
      `${aiRes.status} ${JSON.stringify(aiRes.body).slice(0, 160)}`)
    const db2 = await (await fetch('http://127.0.0.1:5555/__stub/db')).json()
    check('an AI-check allowance was reserved against the real Advanced limit',
      db2.usage_reservations.length === 1, JSON.stringify(db2.usage_reservations))

    check('no console error on the journey', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)))
    check('no hydration mismatch', !consoleErrors.some((e) => /hydrat|did not match/i.test(e)))

    await ctx.close()
  } finally { await browser.close().catch(() => {}); kill() }
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})()
