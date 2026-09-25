/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * /api/content/automation/cron answers at once and runs the automation AFTER
 * the response, over a real `next start` build and the Supabase stub.
 *
 * Why: cron-job.org disconnects after 30s; a generation takes 20–110s. On
 * 25 Sep two items were published in Production while cron-job.org recorded
 * both runs as FAILED, and a scheduler that sees repeated failures disables
 * the job. Asserted here:
 *   - the authorized call returns 202 while the runner's first read is still
 *     in flight (the stub delays article_pools by STUB_SLOW_MS — without the
 *     delay the old, synchronous route would also look "fast");
 *   - the runner's database reads happen AFTER that response (stub request log);
 *   - a missing/wrong secret still gets 401 and starts no work.
 *
 *   STUB_SLOW_TABLE=article_pools STUB_SLOW_MS=6000 node lib/__qa__/reviewer-journey/supabase-stub.js &
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5555 … npx next build
 *   node lib/__qa__/reviewer-journey/automation-cron-after.js
 */
const { spawn } = require('child_process')
const APP_DIR = process.env.QA_APP_DIR || '/home/user/rankings-by-go-top'
const PORT = 3994, BASE = `http://127.0.0.1:${PORT}`, STUB = 'http://127.0.0.1:5555'
const SECRET = 'qa-cron-secret-value'
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }
const stubRequests = async () => (await fetch(`${STUB}/__stub/requests`)).json()
const runnerReads = (reqs) => reqs.filter((q) => /\/rest\/v1\/(article_pools|article_pool_items)/.test(q.path))

;(async () => {
  if (await fetch(BASE).then(() => true, () => false)) { console.log(`port ${PORT} is already serving`); process.exit(1) }
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: APP_DIR, detached: true, stdio: 'ignore',
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', CRON_SECRET: SECRET, ENABLE_CONTENT: 'true', ENABLE_CONTENT_AUTOMATION: 'true' },
  })
  const kill = () => {
    try { process.kill(-server.pid, 'SIGKILL') } catch { /* gone */ }
    try { require('child_process').execSync(`pkill -9 -f "[n]ext start -p ${PORT}"`, { stdio: 'ignore' }) } catch { /* none */ }
  }
  for (let i = 0; i < 180 && !(await fetch(BASE).then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 500))
  try {
    await fetch(`${STUB}/__stub/reset`)

    const bad = await fetch(`${BASE}/api/content/automation/cron`, { headers: { Authorization: 'Bearer wrong' } })
    await new Promise((r) => setTimeout(r, 1500))
    check('wrong secret → 401', bad.status === 401, `got ${bad.status}`)
    check('…and no automation work started', runnerReads(await stubRequests()).length === 0)

    const before = (await stubRequests()).length
    const t0 = Date.now()
    const ok = await fetch(`${BASE}/api/content/automation/cron`, { headers: { Authorization: `Bearer ${SECRET}` } })
    const body = await ok.json().catch(() => ({}))
    const elapsed = Date.now() - t0
    const readsAtResponse = runnerReads((await stubRequests()).slice(before)).length
    check('authorized call → 202 accepted', ok.status === 202 && body.accepted === true, `got ${ok.status} ${JSON.stringify(body)}`)
    check('…answered in under 3 seconds (a scheduler with a 30s limit sees success)', elapsed < 3000, `${elapsed}ms`)

    let readsLater = 0
    for (let i = 0; i < 20 && readsLater === 0; i++) {
      await new Promise((r) => setTimeout(r, 500))
      readsLater = runnerReads((await stubRequests()).slice(before)).length
    }
    check('the runner DID run after the response (it read the pools)', readsLater > 0, `reads at response=${readsAtResponse}, later=${readsLater}`)
  } catch (e) {
    check('journey completed without throwing', false, e && e.stack)
  } finally {
    kill()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
})()
