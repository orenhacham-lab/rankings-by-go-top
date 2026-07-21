/**
 * STAGE D — Pro-first BROWSER E2E (offline). Boots the app with the Pro-first
 * controller ON (RECO_PRO_FIRST_CONTROLLER; the UI receives it as a server-derived
 * prop — no NEXT_PUBLIC mirror) and proves, through the REAL browser + route + engine
 * over fake providers, all nine production scenarios:
 *
 *   1. Pro non-empty              → Pro selected, Flash NOT attempted, ideas render+save
 *   2. Pro under-yield non-empty  → Pro selected, Flash NOT attempted
 *   3. Pro zero + Flash success   → single Flash fallback, Flash selected, saved
 *   4. genuine no-batch (cold)    → empty state, no writes, Flash NOT attempted
 *   5. Pro unavailable/downgraded → one Flash execution, provenance pro_unavailable
 *   6. fallback budget blocked    → Flash NOT attempted, no batch
 *   7. flash_unavailable          → Pro zero + no Flash-class model → Flash NOT run, no batch
 *   8. no ideas table (42P01)     → Pro batch returns session-only, persisted:false, 0 writes
 *   9. persistence count truthful  → one duplicate → UI shows inserted (N-1), never attempted N
 *
 * The UI contract (single button, no selector, no model/tier/fallback wording) is
 * asserted too. Scenario truth is read from the Preview-only productionProvenance in the
 * response (never shown to the user), plus the rendered ideas.
 *
 * Run: node lib/content/__qa__/e2e/run-browser-e2e-profirst.mjs
 */
import { spawn } from 'child_process'
import { mkdirSync } from 'fs'
import { createRequire } from 'module'
import { startMockSupabase, startFakeGemini, e2eSeedTables, E2E_PROJECT_ID, E2E_COLDSTART_PROJECT_ID } from './mock-backend.mjs'

const require = createRequire('/opt/node22/lib/node_modules/')
const { chromium } = require('playwright')
const ROOT = new URL('../../../../', import.meta.url).pathname
const SHOTS = process.env.E2E_SHOT_DIR || `${ROOT}.e2e-shots`
mkdirSync(SHOTS, { recursive: true })

let pass = 0, fail = 0
const check = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) } }
async function waitFor(url, ms) { const end = Date.now() + ms; while (Date.now() < end) { try { const r = await fetch(url); if (r.status < 500) return true } catch {} await new Promise((r) => setTimeout(r, 1000)) } return false }

let portBase = 3940
async function boot({ models = ['gemini-2.5-flash', 'gemini-2.5-pro'], geminiState, extraEnv = {}, absentTables = [], contentIdeasDuplicates = 0 }) {
  const supa = await startMockSupabase(e2eSeedTables(), { verbose: false, absentTables, contentIdeasDuplicates })
  const gemini = await startFakeGemini({ models, state: geminiState })
  const PORT = (portBase += 3)
  const env = {
    ...process.env, NODE_ENV: 'development', PORT: String(PORT),
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supa.port}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-key',
    NEXT_PUBLIC_ENABLE_CONTENT: 'true', ENABLE_CONTENT: 'true', NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION: 'true', ENABLE_CONTENT_AUTOMATION: 'true',
    GEMINI_API_KEY: 'e2e-key', RECO_GENAI_BASE_URL: `http://127.0.0.1:${gemini.port}`, RECO_ISOLATION_DIAGNOSTICS: '1',
    RECO_PRO_FIRST_CONTROLLER: 'true', // the SINGLE authoritative flag (server-derived)
    HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '', ...extraEnv,
  }
  const next = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  next.stderr.on('data', (d) => { const s = String(d); if (/Error/.test(s) && !/Deprecation/.test(s)) console.log('[next:err]', s.trim().slice(0, 160)) })
  const cleanup = () => { try { process.kill(-next.pid, 'SIGKILL') } catch {} try { next.kill('SIGKILL') } catch {} try { supa.server.close() } catch {} try { gemini.server.close() } catch {} }
  const up = await waitFor(`http://127.0.0.1:${PORT}/login`, 120_000)
  if (!up) { cleanup(); throw new Error('server did not come up') }
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: 'he-IL' })
  page.setDefaultTimeout(60_000)
  await page.route(/googletagmanager|fonts\.googleapis|fonts\.gstatic/, (r) => r.abort())
  // Login.
  await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => { const b = document.querySelector('button[type="submit"]'); return !!b && Object.getOwnPropertyNames(b).some((k) => k.startsWith('__reactProps') || k.startsWith('__reactFiber')) }, { timeout: 90_000 })
  await page.fill('input[type="email"]', 'e2e@test.local'); await page.fill('input[type="password"]', 'e2e-password')
  for (let a = 0; a < 3 && page.url().includes('/login'); a++) { await page.click('button[type="submit"]'); await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 20_000 }).catch(() => {}) }
  return { supa, gemini, browser, page, cleanup, PORT }
}

async function gotoProject(page, PORT, projectId) {
  await page.goto(`http://localhost:${PORT}/content?projectId=${projectId}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /צור המלצות/ }).first().waitFor({ state: 'visible', timeout: 90_000 })
}
async function generate(page) {
  const btn = page.getByRole('button', { name: /צור המלצות/ }).first()
  const respPromise = page.waitForResponse((r) => r.url().includes('/api/content/automation/recommendations') && r.request().method() === 'POST', { timeout: 120_000 })
  await btn.click()
  const resp = await respPromise
  const req = JSON.parse(resp.request().postData() ?? '{}')
  const data = await resp.json().catch(() => ({}))
  return { status: resp.status(), req, data, prov: data?.meta?.isolationDebug?.productionProvenance ?? null }
}

async function main() {
  // ── BOOT A — Pro available, normal budget; scenarios 1–4 via mutable state ──
  {
    const st = { proMode: 'ok', flashMode: 'ok', proUnderYield: false }
    const b = await boot({ geminiState: st })
    check('BOOT-A up', true)
    // UI contract.
    await gotoProject(b.page, b.PORT, E2E_PROJECT_ID)
    check('UI: single צור המלצות button + selector hidden + no model line', (await b.page.getByRole('button', { name: /צור המלצות/ }).count()) >= 1 && (await b.page.getByTestId('reco-quality-selector').count()) === 0 && (await b.page.getByTestId('reco-model-path').count()) === 0)

    // Scenario 2 FIRST (clean inventory): Pro under-yield → Pro selected, no Flash.
    st.proUnderYield = true
    const s2 = await generate(b.page)
    check('S2. Pro under-yield non-empty → Pro selected, Flash NOT attempted', s2.status === 200 && s2.req.qualityMode === undefined && s2.prov?.selectedModel === 'pro' && s2.prov?.flashAttempted === false && (s2.data?.meta?.newlyAddedCount ?? 0) > 0, JSON.stringify(s2.prov))
    st.proUnderYield = false

    // Scenario 1: Pro full non-empty → Pro selected, no Flash.
    await gotoProject(b.page, b.PORT, E2E_PROJECT_ID)
    const s1 = await generate(b.page)
    check('S1. Pro non-empty → Pro selected, Flash NOT attempted, ideas saved', s1.status === 200 && s1.prov?.selectedModel === 'pro' && s1.prov?.flashAttempted === false && (s1.data?.suggestions ?? []).length > 0, JSON.stringify(s1.prov))
    // UI wording + article-only rendering (this task).
    const bodyText = await b.page.locator('body').innerText()
    const improveLabel = await b.page.getByTestId('reco-improve-one').first().innerText().catch(() => '')
    check('S1a. per-item action label is "שיפור ניסוח" (no model-upgrade wording)', improveLabel.includes('שיפור ניסוח') && !bodyText.includes('שפר עם Gemini Pro'), JSON.stringify({ improveLabel }))
    check('S1b. every displayed recommendation is a blog article — none says "דף נחיתה מסחרי" / "שיפור עמוד קיים"', !bodyText.includes('דף נחיתה מסחרי') && !bodyText.includes('שיפור עמוד קיים'))
    check('S1c. response path = pro_first_production; selectedModel=pro; flashAttempted=false', (s1.data?.meta?.runtimeDiag?.path === 'pro_first_production' || s1.data?.meta?.isolationDebug?.runtimeDiag?.path === 'pro_first_production') && s1.prov?.selectedModel === 'pro' && s1.prov?.flashAttempted === false, JSON.stringify({ rd: s1.data?.meta?.runtimeDiag ?? s1.data?.meta?.isolationDebug?.runtimeDiag }))

    // Scenario 3: Pro zero (provider fail) + Flash success → single Flash fallback.
    st.proMode = 'provider_fail'
    await gotoProject(b.page, b.PORT, E2E_PROJECT_ID)
    const s3 = await generate(b.page)
    check('S3. Pro zero + Flash → single Flash fallback selected, recorded as Flash', s3.status === 200 && s3.prov?.selectedModel === 'flash' && s3.prov?.flashAttempted === true && s3.prov?.fallbackReason === 'pro_provider_failure_rescue' && /flash/.test(s3.prov?.modelUsedForPersistence ?? '') && !/pro/.test(s3.prov?.modelUsedForPersistence ?? ''), JSON.stringify(s3.prov))
    check('S3b. the user sees NO model/tier/fallback wording', !/Gemini|gemini-2\.5|Flash|\bPro\b|fallback|downgrade/i.test((await b.page.locator('body').innerText()).replace(/שיפור ניסוח/g, '')))
    st.proMode = 'ok'

    // Scenario 4: cold-start project (no evidence) → genuine no-batch empty state.
    await gotoProject(b.page, b.PORT, E2E_COLDSTART_PROJECT_ID)
    const s4 = await generate(b.page)
    check('S4. genuine exhaustion (cold start) → no batch, no writes, Flash NOT attempted', s4.status === 200 && s4.prov?.selectedModel === 'none' && s4.prov?.flashAttempted === false && s4.prov?.persistedWrites === 0 && (s4.data?.suggestions ?? []).length === 0, JSON.stringify(s4.prov))
    await b.page.screenshot({ path: `${SHOTS}/07-profirst-a.png`, fullPage: true }).catch(() => {})
    await b.browser.close(); b.cleanup()
  }

  // ── BOOT B — Pro UNAVAILABLE (models list has no Pro) → scenario 5 ──
  {
    const b = await boot({ models: ['gemini-2.5-flash'], geminiState: { proMode: 'ok', flashMode: 'ok', proUnderYield: false } })
    check('BOOT-B up', true)
    await gotoProject(b.page, b.PORT, E2E_PROJECT_ID)
    const s5 = await generate(b.page)
    check('S5. Pro unavailable → ONE Flash execution, provenance pro_unavailable, Pro never recorded', s5.status === 200 && s5.prov?.proAttempted === false && s5.prov?.fallbackReason === 'pro_unavailable' && s5.prov?.flashAttempted === true && (s5.prov?.selectedModel === 'flash' ? /flash/.test(s5.prov?.modelUsedForPersistence ?? '') : true), JSON.stringify(s5.prov))
    check('S5b. user sees no fallback/model wording', !/Gemini|gemini-2\.5|Flash|\bPro\b|fallback|downgrade/i.test((await b.page.locator('body').innerText()).replace(/שיפור ניסוח/g, '')))
    await b.page.screenshot({ path: `${SHOTS}/07-profirst-b.png`, fullPage: true }).catch(() => {})
    await b.browser.close(); b.cleanup()
  }

  // ── BOOT C — tiny premium budget → scenario 6 (fallback budget blocked) ──
  {
    const b = await boot({ geminiState: { proMode: 'provider_fail', flashMode: 'ok', proUnderYield: false }, extraEnv: { RECO_MAX_ESTIMATED_COST_USD_PREMIUM: '0.0000001' } })
    check('BOOT-C up', true)
    await gotoProject(b.page, b.PORT, E2E_PROJECT_ID)
    const s6 = await generate(b.page)
    check('S6. fallback budget blocked → Flash NOT attempted, typed fallback_budget_blocked, no batch', s6.status === 200 && s6.prov?.flashAttempted === false && s6.prov?.fallbackReason === 'fallback_budget_blocked' && s6.prov?.selectedModel === 'none' && (s6.data?.suggestions ?? []).length === 0, JSON.stringify(s6.prov))
    await b.page.screenshot({ path: `${SHOTS}/07-profirst-c.png`, fullPage: true }).catch(() => {})
    await b.browser.close(); b.cleanup()
  }

  // ── BOOT D — NO Flash-class model offered (models list has only Pro) + Pro fails →
  //    scenario 7 (flash_unavailable: Flash NOT run, no batch, no writes) ──
  {
    const b = await boot({ models: ['gemini-2.5-pro'], geminiState: { proMode: 'provider_fail', flashMode: 'ok', proUnderYield: false } })
    check('BOOT-D up', true)
    await gotoProject(b.page, b.PORT, E2E_PROJECT_ID)
    const s7 = await generate(b.page)
    check('S7. Pro zero + NO Flash-class model → flash_unavailable, Flash NOT attempted, 0 writes, empty state', s7.status === 200 && s7.prov?.fallbackReason === 'flash_unavailable' && s7.prov?.flashAttempted === false && s7.prov?.selectedModel === 'none' && s7.prov?.persistedWrites === 0 && (s7.data?.suggestions ?? []).length === 0, JSON.stringify(s7.prov))
    await b.page.screenshot({ path: `${SHOTS}/07-profirst-d.png`, fullPage: true }).catch(() => {})
    await b.browser.close(); b.cleanup()
  }

  // ── BOOT E — content_topic_ideas table ABSENT (migration not applied) → the route's
  //    session-only path. Pro produces a real batch, but persistence is impossible:
  //    persistOutcome === null → suggestions still return to the client, persisted:false,
  //    persistedWrites === 0. Proves Blocker 4: no false "saved" claim without a table. ──
  {
    const b = await boot({ geminiState: { proMode: 'ok', flashMode: 'ok', proUnderYield: false }, absentTables: ['content_topic_ideas'] })
    check('BOOT-E up', true)
    await gotoProject(b.page, b.PORT, E2E_PROJECT_ID)
    const s8 = await generate(b.page)
    check('S8. no ideas table → Pro batch returns to client session-only, persisted:false, persistedWrites=0',
      s8.status === 200
      && s8.prov?.selectedModel === 'pro'
      && s8.prov?.persistedWrites === 0
      && s8.data?.meta?.persisted === false
      && (s8.data?.suggestions ?? []).length > 0,
      JSON.stringify({ selectedModel: s8.prov?.selectedModel, persistedWrites: s8.prov?.persistedWrites, persisted: s8.data?.meta?.persisted, n: (s8.data?.suggestions ?? []).length }))
    await b.page.screenshot({ path: `${SHOTS}/08-profirst-e.png`, fullPage: true }).catch(() => {})
    await b.browser.close(); b.cleanup()
  }

  // ── BOOT F — TRUTHFUL persistence count. One inserted row collides with a pre-existing
  //    pending row (ON CONFLICT DO NOTHING) → attempted = N, inserted = N-1, duplicate = 1.
  //    The user-facing count MUST be the inserted rows (N-1), never the attempted N — a
  //    duplicate is never counted as newly added. ──
  {
    const b = await boot({ geminiState: { proMode: 'ok', flashMode: 'ok', proUnderYield: false }, contentIdeasDuplicates: 1 })
    check('BOOT-F up', true)
    await gotoProject(b.page, b.PORT, E2E_PROJECT_ID)
    const s9 = await generate(b.page)
    const dbg = s9.data?.meta?.isolationDebug ?? {}
    const attempted = dbg.persistence_attempted ?? dbg.pipeline?.persistence_attempted_count
    const inserted = dbg.persistence_inserted ?? dbg.pipeline?.persistence_inserted_count
    const duplicate = dbg.persistence_duplicate ?? dbg.pipeline?.persistence_duplicate_count
    const added = s9.data?.meta?.newlyAddedCount
    const runSummary = await b.page.locator('body').innerText()
    // The visible "נוספו X רעיונות חדשים" must show the INSERTED count, not the attempted.
    const showsInserted = new RegExp(`נוספו\\s+${inserted}\\s+רעיונות`).test(runSummary)
    const showsAttempted = attempted !== inserted && new RegExp(`נוספו\\s+${attempted}\\s+רעיונות`).test(runSummary)
    check('S9. persistence count is TRUTHFUL: one duplicate → added = inserted = attempted-1, never attempted',
      s9.status === 200 && duplicate === 1 && inserted === attempted - 1 && added === inserted
      && dbg.persistedCurrentRunCount === inserted && showsInserted && !showsAttempted,
      JSON.stringify({ attempted, inserted, duplicate, added, persistedCurrentRunCount: dbg.persistedCurrentRunCount, showsInserted, showsAttempted }))
    await b.page.screenshot({ path: `${SHOTS}/09-profirst-f.png`, fullPage: true }).catch(() => {})
    await b.browser.close(); b.cleanup()
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}
main().catch((e) => { console.error('E2E crashed:', e); process.exit(1) })
