/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * OWASP Top 10:2025 audit — every application-level hole the audit found,
 * attacked over HTTP against a real `next start` production build, with the
 * Supabase stub standing in for the database. No network beyond localhost.
 *
 * Each check is an ATTACK that must now fail, or a legitimate call that must
 * still work. Run the same file against a build of origin/main to see the
 * attacks succeed (the mutation control: a check that cannot fail tests
 * nothing).
 *
 *   node lib/__qa__/reviewer-journey/supabase-stub.js &
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5555 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=stub-anon-key SUPABASE_SERVICE_ROLE_KEY=stub-service-key \
 *     npx next build
 *   node lib/__qa__/reviewer-journey/security-owasp.js
 */
const { spawn } = require('child_process')
const APP_DIR = process.env.QA_APP_DIR || '/home/user/rankings-by-go-top'
const PORT = Number(process.env.QA_PORT || 3991), BASE = `http://127.0.0.1:${PORT}`
const STUB = process.env.QA_STUB_URL || 'http://127.0.0.1:5555'
const SERVICE = { apikey: 'stub-service-key', Authorization: 'Bearer stub-service-key', 'Content-Type': 'application/json' }
const CRON_SECRET = 'qa-cron-secret-value'
const REVIEWER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const OWN_PROJECT = 'a1111111-2222-3333-4444-555555555555'
const VICTIM = '99999999-9999-4999-8999-999999999999'
const VICTIM_PROJECT = 'b9999999-9999-4999-8999-999999999999'
const ORPHAN_PROJECT = 'c9999999-9999-4999-8999-999999999999'
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
const db = async () => (await fetch(`${STUB}/__stub/db`)).json()
const stubRequests = async () => (await fetch(`${STUB}/__stub/requests`)).json()
const insert = (table, row) => fetch(`${STUB}/rest/v1/${table}`, { method: 'POST', headers: SERVICE, body: JSON.stringify(row) })

;(async () => {
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: STUB,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
    SERPER_API_KEY: 'unreachable-by-design',
    CRON_SECRET,
    INTERNAL_API_TOKEN: 'qa-internal-token',
    RESEND_API_KEY: '',
  }
  // A server left on this port (e.g. from a run against another build) would
  // silently answer for the build under test. Refuse rather than measure it.
  if (await fetch(BASE, { redirect: 'manual' }).then(() => true, () => false)) {
    console.log(`port ${PORT} is already serving — stop that server first`); process.exit(1)
  }
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: APP_DIR, detached: true, stdio: 'ignore', env,
  })
  const kill = () => {
    try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ }
    // `next start` re-parents next-server; make sure nothing keeps the port.
    try { require('child_process').execSync(`pkill -9 -f "[n]ext start -p ${PORT}"; pkill -9 -f "[n]ext-server"`, { stdio: 'ignore' }) } catch { /* none left */ }
  }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); process.exit(1) }
  await fetch(`${STUB}/__stub/reset`).catch(() => {})

  // A second tenant, and a legacy project with no owner.
  await insert('profiles', { id: VICTIM, role: 'user' })
  await insert('clients', { id: 'client-victim', user_id: VICTIM, name: 'Victim', is_active: true })
  await insert('projects', { id: VICTIM_PROJECT, user_id: VICTIM, client_id: 'client-victim', name: 'Victim project',
    target_domain: 'victim.example', country: 'US', language: 'en', is_active: true, scan_frequency: 'manual' })
  await insert('tracking_targets', { id: 'victim-target', user_id: VICTIM, project_id: VICTIM_PROJECT,
    keyword: 'victim secret keyword', engine_type: 'google_search', target_domain: 'victim.example', is_active: true })
  await insert('projects', { id: ORPHAN_PROJECT, user_id: null, name: 'Legacy', is_active: true })
  await insert('subscriptions', { id: 'sub-victim', user_id: VICTIM, status: 'cancelled', trial_ends_at: null })

  try {
    console.log('A01/A07 — unauthenticated attacks')
    for (const [method, path] of [['GET', '/api/setup/logs'], ['GET', '/api/setup/status'], ['POST', '/api/setup/test-scan']]) {
      const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ keyword: 'x', targetDomain: 'x.com' }) : undefined })
      check(`${method} ${path} without a session → 401`, r.status === 401, `got ${r.status}`)
    }
    for (const path of ['/api/debug-env', '/api/debug-scan', '/api/debug-oauth-flow', '/api/get-oauth-config']) {
      const r = await fetch(BASE + path)
      check(`${path} no longer exists → 404`, r.status === 404, `got ${r.status}`)
    }
    {
      const r = await fetch(`${BASE}/api/auth/create-trial`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: VICTIM, trialEndsAt: '2099-01-01T00:00:00Z' }) })
      const sub = (await db()).subscriptions.find((s) => s.user_id === VICTIM)
      check('create-trial for another user, signed out → 401', r.status === 401, `got ${r.status}`)
      check('…and the victim subscription is untouched', sub && sub.status === 'cancelled' && sub.trial_ends_at == null,
        JSON.stringify(sub))
    }
    {
      const r = await fetch(`${BASE}/api/send-notification-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: '<a href="https://evil.example">x</a>', email: 'a@b.c' }) })
      check('send-notification-email signed out → 401', r.status === 401, `got ${r.status}`)
    }
    {
      const before = (await stubRequests()).length
      const r = await fetch(`${BASE}/api/auth/callback?code=forged&state=custom-google_abc&next=//evil.example`, { redirect: 'manual' })
      const loc = r.headers.get('location') || ''
      const after = (await stubRequests()).slice(before)
      check('callback with a custom-google_ state is refused', /\/login\?error=oauth/.test(loc), loc)
      check('…never touches the Admin auth API (no password bridge)', !after.some((q) => q.path.startsWith('/auth/v1/admin')),
        JSON.stringify(after.map((q) => q.path)))
      check('…and never redirects off-site', !/evil\.example/.test(loc), loc)
    }

    console.log('A01 — site-health fixes, signed out')
    {
      const get = await fetch(`${BASE}/api/site-health/fixes?projectId=${OWN_PROJECT}`)
      check('GET /api/site-health/fixes signed out → 401', get.status === 401, `got ${get.status}`)
      const approve = await fetch(`${BASE}/api/site-health/fixes`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: OWN_PROJECT, action: 'approve', approved: true, kind: 'title_long', pageUrl: 'https://go-top-seo-test.myshopify.com/', fix: { type: 'seo_title', value: 'x' } }) })
      check('approve a fix signed out → 401', approve.status === 401, `got ${approve.status}`)
      const plugin = await fetch(`${BASE}/api/site-health/plugin`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: OWN_PROJECT, action: 'issue' }) })
      check('issue a plugin key signed out → 401', plugin.status === 401, `got ${plugin.status}`)
      const zip = await fetch(`${BASE}/api/site-health/plugin-zip`)
      const zipBytes = Buffer.from(await zip.arrayBuffer())
      check('plugin zip signed out → 401, no bytes of the zip', zip.status === 401 && zipBytes.subarray(0, 2).toString() !== 'PK', `got ${zip.status}`)
      const d = await db()
      check('…nothing was queued or paired', !(d.site_fix_jobs || []).length && !(d.site_fix_plugin_links || []).length && !(d.site_fix_audit || []).length)
    }

    console.log('A02 — cron endpoints')
    {
      const none = await fetch(`${BASE}/api/schedule`)
      const wrong = await fetch(`${BASE}/api/schedule`, { headers: { Authorization: 'Bearer nope' } })
      const right = await fetch(`${BASE}/api/schedule`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } })
      check('/api/schedule without the secret → 401', none.status === 401, `got ${none.status}`)
      check('/api/schedule with a wrong secret → 401', wrong.status === 401, `got ${wrong.status}`)
      check('/api/schedule with the right secret is accepted (regression)', right.status !== 401 && right.status !== 503, `got ${right.status}`)
    }

    console.log('A02 — security headers')
    {
      const home = await fetch(`${BASE}/`, { redirect: 'manual' })
      check('home: X-Content-Type-Options nosniff', home.headers.get('x-content-type-options') === 'nosniff')
      check('home: frame-ancestors self (anti-clickjacking)', /frame-ancestors 'self'/.test(home.headers.get('content-security-policy') || ''),
        home.headers.get('content-security-policy'))
      check('home: X-Frame-Options SAMEORIGIN', home.headers.get('x-frame-options') === 'SAMEORIGIN')
      check('home: HSTS present', /max-age=\d+/.test(home.headers.get('strict-transport-security') || ''))
      const login = await fetch(`${BASE}/login`, { redirect: 'manual' })
      check('login: frame-ancestors self', /frame-ancestors 'self'/.test(login.headers.get('content-security-policy') || ''))
      const shop = await fetch(`${BASE}/shopify/app`, { redirect: 'manual' })
      const csp = shop.headers.get('content-security-policy') || ''
      check('shopify/app: still frameable by Shopify Admin (regression)',
        /frame-ancestors https:\/\/admin\.shopify\.com/.test(csp) && !/'self'/.test(csp) && !shop.headers.get('x-frame-options'),
        `csp=${csp} xfo=${shop.headers.get('x-frame-options')}`)
    }

    console.log('A05 — stored XSS through publish-article')
    {
      const payload = { title: 'QA', slug: 'qa-xss', content: '<p>ok</p><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><table class="t"><tr><td style="color:red">cell</td></tr></table>' }
      const bad = await fetch(`${BASE}/api/publish-article`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' }, body: JSON.stringify(payload) })
      check('publish-article with a wrong token → 401', bad.status === 401, `got ${bad.status}`)
      const ok = await fetch(`${BASE}/api/publish-article`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer qa-internal-token' }, body: JSON.stringify(payload) })
      const row = ((await db()).articles || []).find((a) => a.slug === 'qa-xss')
      check('publish-article with the token still publishes (regression)', ok.status === 201 && !!row, `got ${ok.status}`)
      const c = row ? row.content : ''
      check('stored content has no handler, script or javascript: URL', !/onerror|<script|javascript:/i.test(c), c)
      check('stored content keeps table, class and style (existing articles use them)', /<table class="t">/.test(c) && /style="color:red"/.test(c), c)
    }

    console.log('A01 — signed-in cross-tenant attacks')
    const { chromium } = require(`${APP_DIR}/node_modules/playwright-core`)
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
    try {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.fill('input[type="email"]', 'reviewer@example.com')
      await page.fill('input[type="password"]', 'whatever')
      await Promise.all([
        page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
        page.click('button[type="submit"]'),
      ])
      const api = ctx.request
      const signedIn = !new URL(page.url()).pathname.startsWith('/login')
      check('reviewer signs in through the real form', signedIn, page.url())

      {
        const scansBefore = ((await db()).scans || []).length
        const r = await api.post(`${BASE}/api/scan`, { data: { projectId: VICTIM_PROJECT } })
        const text = await r.text()
        const d = await db()
        check('scan of ANOTHER tenant\'s project → 404', r.status() === 404, `got ${r.status()} ${text.slice(0, 200)}`)
        check('…response carries none of the victim\'s keywords', !/victim secret keyword/.test(text))
        check('…no scan row created, no claim taken', (d.scans || []).length === scansBefore
          && !(d.operation_claims || []).some((c) => String(c.scope || '').includes(VICTIM_PROJECT)))
        // The reviewer's own project, with one active keyword, so a 404 here can
        // only mean the ownership check refused a legitimate owner.
        await insert('tracking_targets', { id: 'own-target', user_id: REVIEWER, project_id: OWN_PROJECT,
          keyword: 'shopify', engine_type: 'google_search', target_domain: 'go-top-seo-test.myshopify.com', is_active: true })
        const own = await api.post(`${BASE}/api/scan`, { data: { projectId: OWN_PROJECT } })
        const ownText = await own.text()
        check('scan of the reviewer\'s OWN project passes the ownership check (regression)',
          own.status() !== 401 && own.status() !== 403 && !/Project not found/.test(ownText), `got ${own.status()} ${ownText.slice(0, 200)}`)
      }
      {
        const r = await api.post(`${BASE}/api/auth/create-trial`, { data: { userId: VICTIM, trialEndsAt: '2099-01-01T00:00:00Z' } })
        const d = await db()
        const victim = d.subscriptions.find((s) => s.user_id === VICTIM)
        const mine = d.subscriptions.filter((s) => s.user_id === REVIEWER)
        check('create-trial signed in answers for the SESSION user (regression)', r.status() === 200, `got ${r.status()}`)
        check('…the victim\'s subscription is untouched', victim && victim.status === 'cancelled' && victim.trial_ends_at == null, JSON.stringify(victim))
        check('…the reviewer gets ONE trial, capped at 7 days from account creation, not 2099',
          mine.length === 1 && Date.parse(mine[0].trial_ends_at) < Date.now() + 2 * 86400000, JSON.stringify(mine))
        await api.post(`${BASE}/api/auth/create-trial`, { data: {} })
        check('…calling again does not create or extend anything', (await db()).subscriptions.filter((s) => s.user_id === REVIEWER).length === 1)
      }
      {
        // Site-health fixes: another tenant's project is never read, queued or paired.
        const get = await api.get(`${BASE}/api/site-health/fixes?projectId=${VICTIM_PROJECT}`)
        check('site-health fixes of ANOTHER tenant\'s project → 404', get.status() === 404, `got ${get.status()}`)
        const approve = await api.post(`${BASE}/api/site-health/fixes`, { data: { projectId: VICTIM_PROJECT, action: 'approve', approved: true,
          kind: 'title_long', pageUrl: 'https://victim.example/', fix: { type: 'seo_title', value: 'Hijacked title' } } })
        check('approve a fix on ANOTHER tenant\'s project → 404', approve.status() === 404, `got ${approve.status()}`)
        const pair = await api.post(`${BASE}/api/site-health/plugin`, { data: { projectId: VICTIM_PROJECT, action: 'issue' } })
        check('issue a plugin key for ANOTHER tenant\'s project → 404', pair.status() === 404, `got ${pair.status()}`)
        const d = await db()
        check('…no job, audit row or plugin key was written for the victim',
          !(d.site_fix_jobs || []).some((j) => j.project_id === VICTIM_PROJECT) && !(d.site_fix_audit || []).some((a) => a.project_id === VICTIM_PROJECT)
          && !(d.site_fix_plugin_links || []).some((l) => l.project_id === VICTIM_PROJECT))
        const off = await api.post(`${BASE}/api/site-health/fixes`, { data: { projectId: OWN_PROJECT, action: 'approve', approved: true,
          kind: 'title_long', pageUrl: 'https://evil.example/', fix: { type: 'seo_title', value: 'x' } } })
        const offBody = await off.json().catch(() => ({}))
        check('a fix aimed at a page off the project\'s site is refused', off.status() >= 400 && off.status() < 500 && offBody.ok === false, `got ${off.status()} ${JSON.stringify(offBody)}`)
        const zip = await api.get(`${BASE}/api/site-health/plugin-zip`)
        const bytes = await zip.body()
        check('the plugin zip is served to a signed-in user (regression)', zip.status() === 200 && bytes.subarray(0, 2).toString() === 'PK'
          && /application\/zip/.test(zip.headers()['content-type'] || ''), `got ${zip.status()}`)
      }
      {
        const r = await api.get(`${BASE}/api/setup/logs`)
        check('setup/logs as a non-admin → 403', r.status() === 403, `got ${r.status()}`)
        const g = await api.post(`${BASE}/api/google-ads/debug-customers`)
        check('google-ads/debug-customers as a non-admin → 403 (or 503 unconfigured before auth)', g.status() === 403 || g.status() === 503, `got ${g.status()}`)
      }
      {
        const r = await api.get(`${BASE}/api/projects/${ORPHAN_PROJECT}/ai-profile`)
        check('ai-profile of a project with NO owner → 403', r.status() === 403, `got ${r.status()}`)
        const own = await api.get(`${BASE}/api/projects/${OWN_PROJECT}/ai-profile`)
        check('ai-profile of the reviewer\'s own project is not refused (regression)', own.status() !== 403 && own.status() !== 401, `got ${own.status()}`)
      }
      {
        const r = await api.post(`${BASE}/api/send-notification-email`, { data: { fullName: '<b>x</b>', email: 'attacker@evil.example' } })
        const body = await r.json().catch(() => ({}))
        check('send-notification-email signed in ignores the body and skips a 6-day-old account', r.status() === 200 && body.skipped === 'not_fresh',
          `got ${r.status()} ${JSON.stringify(body)}`)
      }
    } finally {
      await browser.close()
    }
  } catch (e) {
    check('journey completed without throwing', false, e && e.stack)
  } finally {
    kill()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
})()
