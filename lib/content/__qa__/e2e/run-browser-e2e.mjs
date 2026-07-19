/**
 * BROWSER end-to-end QA (offline): real Next.js dev server + real UI + real
 * route + real evidence-first engine + ACTUAL @google/genai SDK — only the two
 * external providers (Supabase, Gemini) are local fixture servers.
 *
 * Flow: /login (real signInWithPassword against mock GoTrue) → /content?projectId
 * → click "מצא רעיונות" → intercept the API response → assert the UI renders the
 * EXACT persisted ideas with truthful counts (no "generated N / 0 new"
 * contradiction) → screenshots.
 *
 * Run: node lib/content/__qa__/e2e/run-browser-e2e.mjs
 */
import { spawn } from 'child_process'
import { mkdirSync } from 'fs'
import { createRequire } from 'module'
import { startMockSupabase, startFakeGemini, e2eSeedTables, E2E_PROJECT_ID } from './mock-backend.mjs'

const require = createRequire('/opt/node22/lib/node_modules/')
const { chromium } = require('playwright')

const ROOT = new URL('../../../../', import.meta.url).pathname
const SHOTS = process.env.E2E_SHOT_DIR || `${ROOT}.e2e-shots`
mkdirSync(SHOTS, { recursive: true })

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function waitFor(url, ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return true } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function main() {
  const supa = await startMockSupabase(e2eSeedTables(), { verbose: process.env.E2E_DEBUG === '1' })
  const gemini = await startFakeGemini({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'] })
  console.log(`mock supabase :${supa.port} · fake gemini :${gemini.port}`)

  const PORT = 3700 + Math.floor((Date.now() / 1000) % 250)
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supa.port}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-key',
    NEXT_PUBLIC_ENABLE_CONTENT: 'true',
    ENABLE_CONTENT: 'true',
    NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION: 'true',
    ENABLE_CONTENT_AUTOMATION: 'true',
    ENABLE_INTERNAL_LINK_PLANNING: 'true',
    NEXT_PUBLIC_ENABLE_INTERNAL_LINK_PLANNING: 'true',
    GEMINI_API_KEY: 'e2e-key',
    RECO_GENAI_BASE_URL: `http://127.0.0.1:${gemini.port}`,
    RECO_ISOLATION_DIAGNOSTICS: '1',
    NEXT_PUBLIC_RECO_QUALITY_SELECTOR: '1',
    // Never talk to the outside world from the dev server.
    HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '',
  }
  const next = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  next.stdout.on('data', (d) => { const s = String(d); if (/error|Error/.test(s)) console.log('[next]', s.trim().slice(0, 300)) })
  next.stderr.on('data', (d) => { const s = String(d); if (!/Warning|Deprecation/.test(s)) console.log('[next:err]', s.trim().slice(0, 300)) })

  const cleanup = () => { try { process.kill(-next.pid, 'SIGKILL') } catch {} try { next.kill('SIGKILL') } catch {} try { supa.server.close() } catch {} try { gemini.server.close() } catch {} }
  process.on('exit', cleanup)

  const up = await waitFor(`http://127.0.0.1:${PORT}/login`, 120_000)
  check('next dev server is up', up)
  if (!up) { cleanup(); process.exit(1) }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: 'he-IL' })
  page.setDefaultTimeout(60_000)
  if (process.env.E2E_DEBUG === '1') {
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 200)) })
    page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
    page.on('requestfailed', (r) => console.log('[reqfail]', r.method(), r.url().slice(0, 120), r.failure()?.errorText))
    page.on('request', (r) => { if (r.url().includes('/auth/v1/')) console.log('[auth-req]', r.method(), r.url().slice(0, 120)) })
    page.on('response', (r) => { if (r.url().includes('/auth/v1/')) console.log('[auth-res]', r.status(), r.url().slice(0, 120)) })
  }

  // Block external hosts (fonts/GTM) — the sandbox has no egress and their
  // hanging requests only delay page settle. The app must work without them.
  await page.route(/googletagmanager|fonts\.googleapis|fonts\.gstatic/, (r) => r.abort())

  // ── 1) Real login through the UI against mock GoTrue ──
  await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' })
  // Wait for REAL React hydration (props attached to the submit button) — a
  // pre-hydration click submits the form natively and never calls supabase.
  await page.waitForFunction(() => {
    const btn = document.querySelector('button[type="submit"]')
    return !!btn && Object.getOwnPropertyNames(btn).some((k) => k.startsWith('__reactProps') || k.startsWith('__reactFiber'))
  }, { timeout: 90_000 })
  await page.fill('input[type="email"]', 'e2e@test.local')
  await page.fill('input[type="password"]', 'e2e-password')
  await page.screenshot({ path: `${SHOTS}/01-login.png` })
  for (let attempt = 0; attempt < 3 && page.url().includes('/login'); attempt++) {
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 20_000 }).catch(() => {})
    if (page.url().includes('/login')) {
      await page.waitForTimeout(2000)
      if (!(await page.inputValue('input[type="email"]').catch(() => ''))) {
        await page.fill('input[type="email"]', 'e2e@test.local')
        await page.fill('input[type="password"]', 'e2e-password')
      }
    }
  }
  check('login navigates away from /login', !page.url().includes('/login'), page.url())

  // ── 2) Content hub for the seeded project ──
  await page.goto(`http://localhost:${PORT}/content?projectId=${E2E_PROJECT_ID}`, { waitUntil: 'domcontentloaded' })
  const genButton = page.getByRole('button', { name: /מצא רעיונות/ }).first()
  await genButton.waitFor({ state: 'visible', timeout: 90_000 })
  check('the ideas section renders with the generate button', true)
  await page.screenshot({ path: `${SHOTS}/02-content-hub.png`, fullPage: true })

  // ── 3) Generate as PREMIUM via the production model selector (מתקדם = Pro) ──
  const selector = page.getByTestId('reco-quality-selector')
  check('production model selector is visible', await selector.isVisible().catch(() => false))
  await selector.getByRole('radio', { name: /Gemini Pro/ }).click().catch(() => {})
  const respPromise = page.waitForResponse((r) => r.url().includes('/api/content/automation/recommendations') && r.request().method() === 'POST', { timeout: 120_000 })
  await genButton.click()
  const resp = await respPromise
  const reqBody = JSON.parse(resp.request().postData() ?? '{}')
  check('UI sends qualityMode EXPLICITLY (premium)', reqBody.qualityMode === 'premium', JSON.stringify(reqBody))
  const data = await resp.json().catch(() => ({}))
  check('recommendations API returned 200', resp.status() === 200, `status ${resp.status()}`)
  const meta = data?.meta ?? {}
  check('run used the evidence-first path', meta?.isolationDebug?.runtimeDiag?.path === 'evidence_first_briefs' || meta?.isolationDebug?.briefDiagnostics?.engine === 'evidence_first_briefs', JSON.stringify(meta?.isolationDebug?.runtimeDiag ?? null))
  const mp = meta?.isolationDebug?.briefDiagnostics?.modelPath
  check('LIVE-CONTRACT: requestedTier=premium, tierUsed=pro, downgraded=false', mp?.requestedTier === 'premium' && mp?.tierUsed === 'pro' && mp?.downgraded === false, JSON.stringify(mp ?? null))
  check('the actual model id used is a Pro model', gemini.calls.every((c) => c.model.includes('pro')), JSON.stringify(gemini.calls.map((c) => c.model)))
  // REGRESSION TRAP (live 400 class): the strict fake rejects Pro+budget0 with
  // the real INVALID_ARGUMENT — this flow would hard-fail if 0 were ever sent.
  check('Pro calls carried a VALID thinkingBudget (>=128, never 0) on the wire', gemini.calls.every((c) => (c.thinkingBudget ?? 0) >= 128), JSON.stringify(gemini.calls.map((c) => c.thinkingBudget)))
  const mcfg = meta?.isolationDebug?.briefDiagnostics?.modelConfig
  check('modelConfig surfaced in Preview diagnostics (budgeted thinking)', mcfg?.thinkingMode === 'budgeted' && (mcfg?.thinkingBudget ?? 0) >= 128 && (mcfg?.maxOutputTokens ?? 0) > (mcfg?.thinkingBudget ?? 0), JSON.stringify(mcfg ?? null))
  const rounds = meta?.isolationDebug?.briefDiagnostics?.rounds ?? []
  check('no provider-failed briefs on the premium run', rounds.every((r) => r.provider_failed_briefs === 0), JSON.stringify(rounds.map((r) => r.provider_failed_briefs)))
  check('newlyAddedCount > 0 (ideas persisted)', (meta.newlyAddedCount ?? 0) > 0, `newlyAddedCount=${meta.newlyAddedCount}`)
  check('persistence contract: inserted equals newlyAddedCount', meta?.isolationDebug?.persistence_inserted === meta.newlyAddedCount, `inserted=${meta?.isolationDebug?.persistence_inserted}`)
  const pipeline = meta?.isolationDebug?.pipeline ?? {}
  check('pipeline reconciliation: raw >= accepted, counts present', typeof pipeline.raw_generated_count === 'number' && typeof pipeline.persistence_inserted_count === 'number' && pipeline.raw_generated_count >= (pipeline.engine_accepted_count ?? 0), JSON.stringify(pipeline))
  check('at most TWO paid calls (constrained discovery + ONE batched synthesis)', gemini.calls.length <= 2, JSON.stringify(gemini.calls))

  // Preview model-path line is rendered for the operator (truthful wording).
  await page.waitForTimeout(500)
  const mpLine = page.getByTestId('reco-model-path')
  check('operator sees the ACTUAL model used (no false tier wording)', ((await mpLine.textContent().catch(() => '')) ?? '').includes('pro'), (await mpLine.textContent().catch(() => 'missing')) ?? 'missing')

  // ── 4) UI truthfulness: cards match the persisted ideas ──
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/03-ideas-rendered.png`, fullPage: true })
  const bodyText = await page.textContent('body')
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : []
  check('API returned suggestions', suggestions.length > 0, `${suggestions.length}`)
  // The list collapses to 3 by default — expand before asserting all titles.
  const expand = page.getByRole('button', { name: /הצג עוד רעיונות/ }).first()
  if (await expand.isVisible().catch(() => false)) { await expand.click(); await page.waitForTimeout(400) }
  const expandedText = await page.textContent('body')
  const renderedCount = suggestions.filter((s) => (expandedText ?? '').includes(s.title)).length
  check('EVERY suggestion title is visible in the UI (after expand)', renderedCount === suggestions.length, `${renderedCount}/${suggestions.length} rendered`)
  check('UI cannot show a generated-N-added-0 contradiction', (meta.newlyAddedCount ?? 0) > 0 && renderedCount > 0)
  const dbRows = supa.tables.content_topic_ideas ?? []
  check('DB truly holds the persisted rows (mock store)', dbRows.length === meta.newlyAddedCount, `db=${dbRows.length} vs newlyAdded=${meta.newlyAddedCount}`)
  check('no truncated keyword persisted', dbRows.every((r) => !/(של|עם|או|ו)$/.test(String(r.primary_keyword ?? '').trim())))
  check('no malformed demand claim rendered', !/(אלפי|מאות)\s+חיפושים/.test(bodyText ?? ''))

  // ── 5) Reload survives (persistence → reload → render) ──
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /מצא רעיונות|מצא רעיונות נוספים/ }).first().waitFor({ state: 'visible', timeout: 90_000 })
  await page.waitForTimeout(2500)
  const expand2 = page.getByRole('button', { name: /הצג עוד רעיונות/ }).first()
  if (await expand2.isVisible().catch(() => false)) { await expand2.click(); await page.waitForTimeout(400) }
  const afterReload = await page.textContent('body')
  const stillVisible = suggestions.filter((s) => (afterReload ?? '').includes(s.title)).length
  check('ideas survive a full page reload (persist → reload → render)', stillVisible === suggestions.length, `${stillVisible}/${suggestions.length}`)
  await page.screenshot({ path: `${SHOTS}/04-after-reload.png`, fullPage: true })

  // ── 6) The /reco-qa ONE-ACTION acceptance runner works end-to-end ──
  await page.goto(`http://localhost:${PORT}/reco-qa`, { waitUntil: 'domcontentloaded' })
  const runBtn = page.getByRole('button', { name: /הרץ בדיקת קבלה/ })
  await runBtn.waitFor({ state: 'visible', timeout: 90_000 })
  await page.waitForFunction(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('הרץ בדיקת קבלה'))
    return !!btn && Object.getOwnPropertyNames(btn).some((k) => k.startsWith('__react'))
  }, undefined, { timeout: 90_000 })
  const qaRespPromise = page.waitForResponse((r) => r.url().includes('/api/content/automation/reco-qa'), { timeout: 180_000 })
  await runBtn.click()
  const qaResp = await qaRespPromise
  const qaData = await qaResp.json().catch(() => ({}))
  check('reco-qa runner returned 200', qaResp.status() === 200, `status ${qaResp.status()}`)
  check('reco-qa acceptance verdict is PASS (three-way verdict system)', qaData?.acceptance?.verdict === 'PASS' && qaData?.acceptance?.passed === true, JSON.stringify({ verdict: qaData?.acceptance?.verdict, failed: (qaData?.acceptance?.rules ?? []).filter((r) => !r.pass).map((r) => r.id) }))
  check('reco-qa proves the premium model path in one action', qaData?.run?.modelPath?.tierUsed === 'pro' && qaData?.run?.modelPath?.downgraded === false, JSON.stringify(qaData?.run?.modelPath ?? null))
  check('reco-qa reports full topic lists (titles/keywords/reasons/links)', Array.isArray(qaData?.topics) && qaData.topics.length > 0 && qaData.topics.every((t) => t.title && t.primaryKeyword && typeof t.reason === 'string' && Array.isArray(t.links)), `${(qaData?.topics ?? []).length} topics`)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/05-reco-qa-runner.png`, fullPage: true })
  check('runner page renders a PASS verdict', ((await page.textContent('body')) ?? '').includes('PASS'))

  // ── 7) The QA/admin Flash-vs-Pro comparison route smoke (fake providers) ──
  check('the QA-only comparison section is present on /reco-qa', (await page.locator('[data-testid="reco-qa-comparison"]').count()) === 1)
  // Drive the protected /compare endpoint through the authenticated browser session:
  // preflight (no spend) → confirmed run (one snapshot, ≥3 Flash + ≥3 Pro).
  const cmp = await page.evaluate(async (projectId) => {
    const post = (b) => fetch('/api/content/automation/reco-qa/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json())
    const pre = await post({ projectId, targetCount: 6, attemptsPerModel: 3, confirm: false })
    const run = await post({ projectId, targetCount: 6, attemptsPerModel: 3, confirm: true })
    return { pre, run }
  }, E2E_PROJECT_ID)
  check('compare PREFLIGHT returns a max authorized cost (no spend)', cmp.pre?.preflight === true && typeof cmp.pre?.maxAuthorizedCostUsd === 'number' && cmp.pre?.persist === false, JSON.stringify(cmp.pre).slice(0, 200))
  check('compare RUN prepared ONE snapshot + ran ≥3 Flash and ≥3 Pro', cmp.run?.ok === true && typeof cmp.run?.snapshotId === 'string' && (cmp.run?.attempts ?? []).filter((a) => a.role === 'flash').length >= 3 && (cmp.run?.attempts ?? []).filter((a) => a.role === 'pro').length >= 3, JSON.stringify({ snap: cmp.run?.snapshotId, n: (cmp.run?.attempts ?? []).length }))
  check('compare RUN persisted NOTHING (persist:false, 0 writes)', cmp.run?.persist === false && cmp.run?.persistedWrites === 0)
  check('compare RUN discovery accounted once (prep provider calls ≤ 1)', typeof cmp.run?.preparationProviderCalls === 'number' && cmp.run.preparationProviderCalls <= 1)
  check('compare RUN aggregates present for both models', !!cmp.run?.aggregate?.flash && !!cmp.run?.aggregate?.pro && cmp.run.aggregate.flash.totalAttempts >= 3)
  check('compare RUN every attempt reconciled + rows carry telemetry', (cmp.run?.attempts ?? []).every((a) => typeof a.attemptId === 'string' && typeof a.finalizedCount === 'number' && typeof a.latencyMs === 'number' && typeof a.callCount === 'number'))
  check('compare RUN blind file + mapping are SEPARATE outputs', cmp.run?.mapping && (cmp.run?.blindAvailable === false || (cmp.run?.blindReview && !('mapping' in cmp.run.blindReview))))
  check('compare RUN response leaks no raw model telemetry (modelUsed/requestedTier)', !/modelUsed|requestedTier|finalizedSuggestions/.test(JSON.stringify({ attempts: cmp.run?.attempts, aggregate: cmp.run?.aggregate })))
  await page.screenshot({ path: `${SHOTS}/06-reco-qa-compare.png`, fullPage: true }).catch(() => {})

  await browser.close()
  cleanup()
  console.log(`\n${pass} passed, ${fail} failed`)
  console.log(`screenshots: ${SHOTS}`)
  process.exit(fail > 0 ? 1 : 0)
}
main().catch((e) => { console.error('E2E crashed:', e); process.exit(1) })
