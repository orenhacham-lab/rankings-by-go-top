/**
 * STAGE D — Pro-first BROWSER E2E (offline). Boots the app with the Pro-first
 * controller ON (RECO_PRO_FIRST_CONTROLLER + the client mirror) and proves the
 * user-facing contract: no Flash/Pro selector, one button (צור המלצות), no model /
 * tier / fallback / cost / diagnostics shown, and a real Pro batch renders + persists.
 *
 * The fallback / genuine-exhaustion / pro-unavailable BRANCH logic is proven at the
 * integration level (reco-production-controller.qa: real route pipeline over fake
 * providers) — the single-boot browser harness cannot vary provider behaviour per
 * scenario. This boot proves the Pro-first happy path + the UI contract end-to-end.
 *
 * Run: node lib/content/__qa__/e2e/run-browser-e2e-profirst.mjs
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
const check = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) } }
async function waitFor(url, ms) { const end = Date.now() + ms; while (Date.now() < end) { try { const r = await fetch(url); if (r.status < 500) return true } catch {} await new Promise((r) => setTimeout(r, 1000)) } return false }

async function main() {
  const supa = await startMockSupabase(e2eSeedTables(), { verbose: false })
  const gemini = await startFakeGemini({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'] }) // Pro available
  const PORT = 3960 + Math.floor((Date.now() / 1000) % 30)
  const env = {
    ...process.env, NODE_ENV: 'development', PORT: String(PORT),
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supa.port}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-key',
    NEXT_PUBLIC_ENABLE_CONTENT: 'true', ENABLE_CONTENT: 'true', NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION: 'true', ENABLE_CONTENT_AUTOMATION: 'true',
    GEMINI_API_KEY: 'e2e-key', RECO_GENAI_BASE_URL: `http://127.0.0.1:${gemini.port}`, RECO_ISOLATION_DIAGNOSTICS: '1',
    // Stage D — Pro-first controller ON (server + client mirror).
    RECO_PRO_FIRST_CONTROLLER: 'true', NEXT_PUBLIC_RECO_PRO_FIRST_CONTROLLER: 'true',
    HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '',
  }
  const next = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  next.stderr.on('data', (d) => { const s = String(d); if (!/Warning|Deprecation/.test(s)) console.log('[next:err]', s.trim().slice(0, 200)) })
  const cleanup = () => { try { process.kill(-next.pid, 'SIGKILL') } catch {} try { next.kill('SIGKILL') } catch {} try { supa.server.close() } catch {} try { gemini.server.close() } catch {} }
  process.on('exit', cleanup)

  const up = await waitFor(`http://127.0.0.1:${PORT}/login`, 120_000)
  check('next dev server (Pro-first) is up', up)
  if (!up) { cleanup(); process.exit(1) }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: 'he-IL' })
  page.setDefaultTimeout(60_000)
  await page.route(/googletagmanager|fonts\.googleapis|fonts\.gstatic/, (r) => r.abort())

  // Login.
  await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => { const b = document.querySelector('button[type="submit"]'); return !!b && Object.getOwnPropertyNames(b).some((k) => k.startsWith('__reactProps') || k.startsWith('__reactFiber')) }, { timeout: 90_000 })
  await page.fill('input[type="email"]', 'e2e@test.local'); await page.fill('input[type="password"]', 'e2e-password')
  for (let a = 0; a < 3 && page.url().includes('/login'); a++) { await page.click('button[type="submit"]'); await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 20_000 }).catch(() => {}) }
  check('login navigates away from /login', !page.url().includes('/login'), page.url())

  // Content hub — Pro-first UI contract.
  await page.goto(`http://localhost:${PORT}/content?projectId=${E2E_PROJECT_ID}`, { waitUntil: 'domcontentloaded' })
  const genBtn = page.getByRole('button', { name: /צור המלצות/ }).first()
  await genBtn.waitFor({ state: 'visible', timeout: 90_000 })
  check('Pro-first: single "צור המלצות" button is shown', await genBtn.isVisible())
  check('Pro-first: the Flash/Pro quality selector is HIDDEN', (await page.getByTestId('reco-quality-selector').count()) === 0)
  check('Pro-first: no model-path telemetry line is shown', (await page.getByTestId('reco-model-path').count()) === 0)

  // Generate → the client sends NO tier; the server runs Pro-first; a Pro batch renders.
  const respPromise = page.waitForResponse((r) => r.url().includes('/api/content/automation/recommendations') && r.request().method() === 'POST', { timeout: 120_000 })
  await genBtn.click()
  check('Pro-first: button shows the running label יוצר המלצות…', await page.getByRole('button', { name: /יוצר המלצות/ }).first().isVisible().catch(() => false))
  const resp = await respPromise
  const reqBody = JSON.parse(resp.request().postData() ?? '{}')
  const data = await resp.json().catch(() => ({}))
  check('Pro-first: the client sends NO qualityMode/tier field', reqBody.qualityMode === undefined)
  check('Pro-first: recommendations API returned 200 + persisted', resp.status() === 200 && data?.meta?.persisted === true, `status ${resp.status()}`)
  check('Pro-first: a real batch was produced and saved', Array.isArray(data?.suggestions) && data.suggestions.length > 0 && (data?.meta?.newlyAddedCount ?? 0) > 0, JSON.stringify({ n: (data?.suggestions ?? []).length, added: data?.meta?.newlyAddedCount }))

  // The user must see NO model name / tier / fallback / downgrade / cost wording.
  await page.waitForTimeout(600)
  const controlsText = (await page.locator('body').innerText()).slice(0, 20000)
  check('Pro-first: no model/tier/fallback wording is visible to the user', !/Gemini|gemini-2\.5|Flash|\bPro\b|מהיר — Gemini|מתקדם — Gemini|downgrade|fallback/i.test(controlsText.replace(/שפר עם Gemini Pro/g, '')))
  await page.screenshot({ path: `${SHOTS}/07-profirst.png`, fullPage: true })

  // Persistence survives a reload.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /צור המלצות/ }).first().waitFor({ state: 'visible', timeout: 90_000 })
  await page.waitForTimeout(1500)
  const afterReload = (await page.locator('body').innerText())
  check('Pro-first: saved ideas persist across a reload', (data?.suggestions ?? []).some((s) => afterReload.includes(s.title)), `${(data?.suggestions ?? []).length} ideas`)

  await browser.close(); cleanup()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}
main().catch((e) => { console.error('E2E crashed:', e); process.exit(1) })
