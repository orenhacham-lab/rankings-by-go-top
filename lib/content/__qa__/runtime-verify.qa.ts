/**
 * Runtime-verification QA — offline, no network / DB / Gemini.
 * Proves the deploy-identity endpoint, the WordPress route boundary (incl. the
 * Preview forced-throw catch), the recommendation zero-vs-rejected classification,
 * the first-call budget headroom, and that no secrets/raw prompts are logged. Live
 * SHA / real Buy Buy 500 / live wedding funnel require the user's Preview hit.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { runtimeInfo, isPreviewEnv } from '../../runtime-info'
import { classifyRecoRun, reconcileWithUi } from '../recommendations/run-classify'
import { RunCostController } from '../recommendations/run-cost-controller'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8')

async function main() {
  console.log('A) /api/version + runtime-info use Vercel env values (no hardcoded SHA)')
  {
    const save = { sha: process.env.VERCEL_GIT_COMMIT_SHA, ref: process.env.VERCEL_GIT_COMMIT_REF, env: process.env.VERCEL_ENV, url: process.env.VERCEL_URL }
    process.env.VERCEL_GIT_COMMIT_SHA = 'deadbeefcafe'
    process.env.VERCEL_GIT_COMMIT_REF = 'fix/reco-isolation-diagnostics'
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_URL = 'example.vercel.app'
    const info = runtimeInfo()
    check('1. gitSha comes from VERCEL_GIT_COMMIT_SHA', info.gitSha === 'deadbeefcafe')
    check('1. gitRef comes from VERCEL_GIT_COMMIT_REF', info.gitRef === 'fix/reco-isolation-diagnostics')
    check('1. vercelEnv comes from VERCEL_ENV', info.vercelEnv === 'preview')
    check('1. deploymentUrl comes from VERCEL_URL', info.deploymentUrl === 'example.vercel.app')
    check('1. buildTime present', typeof info.buildTime === 'string' && !!info.buildTime)
    // 4. Missing optional env → nulls, never a throw (import-safe).
    delete process.env.VERCEL_GIT_COMMIT_SHA; delete process.env.VERCEL_GIT_COMMIT_REF; delete process.env.VERCEL_ENV; delete process.env.VERCEL_URL
    const bare = runtimeInfo()
    check('4. missing VERCEL_* env → null values, no throw', bare.gitSha === null && bare.gitRef === null && bare.vercelEnv === null)
    const verSrc = read('../../../app/api/version/route.ts')
    check('/api/version never hardcodes a SHA (reads runtimeInfo)', /runtimeInfo\(\)/.test(verSrc) && !/[0-9a-f]{40}/.test(verSrc))
    process.env.VERCEL_GIT_COMMIT_SHA = save.sha; process.env.VERCEL_GIT_COMMIT_REF = save.ref; process.env.VERCEL_ENV = save.env; process.env.VERCEL_URL = save.url
  }

  console.log('B) WordPress route — Preview forced-throw is caught → typed JSON')
  {
    const saveEnv = { content: process.env.ENABLE_CONTENT, venv: process.env.VERCEL_ENV }
    process.env.ENABLE_CONTENT = 'true'
    process.env.VERCEL_ENV = 'preview'
    const { POST } = await import('../../../app/api/content/articles/[id]/wordpress/route')
    const req = new Request('https://x.test/api/content/articles/abc/wordpress?diagnosticTest=throw', { method: 'POST', body: '{}' })
    const res = await POST(req, { params: Promise.resolve({ id: 'abc' }) })
    check('2. forced throw returns 500 (typed, not a bare crash)', res.status === 500)
    const body = await res.json()
    check('2. body.ok === false', body.ok === false)
    check('2. body.error === unexpected_publish_error', body.error === 'unexpected_publish_error')
    check('2. body.message is a non-empty safe Hebrew string', typeof body.message === 'string' && body.message.length > 0 && /[֐-׿]/.test(body.message))
    check('2. body.diagnosticId present', typeof body.diagnosticId === 'string' && body.diagnosticId.length > 0)
    check('2. diagnosticId interpolated into the message', body.message.includes(body.diagnosticId))
    check('response body carries NO stack/credential keys', !('stack' in body) && !('password' in body) && !('authorization' in body))
    // Production must NOT honor diagnosticTest: the forced-throw branch is gated by
    // isPreviewEnv() (proven here + statically), so it can only fire on Preview.
    process.env.VERCEL_ENV = 'production'
    check('isPreviewEnv() is false off Preview (gate closed in production)', isPreviewEnv() === false)
    const routeSrc = read('../../../app/api/content/articles/[id]/wordpress/route.ts')
    check('forced throw is guarded by isPreviewEnv()', /isPreviewEnv\(\) && new URL\(request\.url\)\.searchParams\.get\('diagnosticTest'\) === 'throw'/.test(routeSrc))
    process.env.ENABLE_CONTENT = saveEnv.content; process.env.VERCEL_ENV = saveEnv.venv
  }

  console.log('C) route boundary structure + Node runtime (static)')
  {
    const src = read('../../../app/api/content/articles/[id]/wordpress/route.ts')
    check('5. route pins export const runtime = nodejs', /export const runtime = 'nodejs'/.test(src))
    // 3. Nothing that can throw executes before the try boundary. Strip comments
    // first so prose ("param await") can't trip the check.
    const head = src.slice(src.indexOf('export async function POST'), src.indexOf('try {'))
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
    check('3. no await statement before the try boundary', !/\bawait\b/.test(head))
    check('3. no supabase client / uuid / json parse before the try boundary', !/createAdminClient\(|randomUUID\(|request\.json\(/.test(head))
    check('3. no DB query before try', !/\bfrom\('generated_articles'\)/.test(head))
    check('route logs [content-wp-export] route stage with gitSha', /\[content-wp-export\] route stage/.test(src) && /gitSha/.test(src))
    check('route emits top_level_catch_entered', /top_level_catch_entered/.test(src))
    check('12. stage logs never include Authorization/password/cookie', !/authorization|application_?password|\bcookie\b/i.test(src))
  }

  console.log('D) recommendation runtime classification (ZERO_CALLS vs REJECTED)')
  {
    check('9. no calls → ZERO_CALLS', classifyRecoRun({ totalCalls: 0, rawCandidates: 0, freshPersisted: 0 }) === 'ZERO_CALLS')
    check('calls, model returned nothing → CALLS_SUCCEEDED_ZERO_OUTPUT', classifyRecoRun({ totalCalls: 2, rawCandidates: 0, freshPersisted: 0, reason: 'model_empty' }) === 'CALLS_SUCCEEDED_ZERO_OUTPUT')
    check('9. calls, raw candidates, all filtered → CANDIDATES_REJECTED', classifyRecoRun({ totalCalls: 2, rawCandidates: 20, freshPersisted: 0 }) === 'CANDIDATES_REJECTED')
    check('CANDIDATES_REJECTED requires rawCandidates > 0 (never at raw 0)', classifyRecoRun({ totalCalls: 2, rawCandidates: 0, freshPersisted: 0 }) !== 'CANDIDATES_REJECTED')
    check('transient failure → CALLS_FAILED', classifyRecoRun({ totalCalls: 1, rawCandidates: 0, freshPersisted: 0, reason: 'model_error' }) === 'CALLS_FAILED')
    check('billing exhausted → CALLS_FAILED', classifyRecoRun({ totalCalls: 1, rawCandidates: 5, freshPersisted: 0, billingExhausted: true }) === 'CALLS_FAILED')
    check('produced new ideas → PRODUCED_NEW', classifyRecoRun({ totalCalls: 2, rawCandidates: 20, freshPersisted: 6 }) === 'PRODUCED_NEW')
    check('UI showed 0 while server produced → UI_RESPONSE_BINDING_ERROR', reconcileWithUi('PRODUCED_NEW', true) === 'UI_RESPONSE_BINDING_ERROR')
    check('UI reconcile is a no-op when server also had 0 new', reconcileWithUi('CANDIDATES_REJECTED', true) === 'CANDIDATES_REJECTED')
  }

  console.log('E) 10. first Flash call is NOT blocked by the default $0.15 budget')
  {
    const c = new RunCostController('standard', 'run', 15)
    const est = c.estimateNextCallUsd('gemini-2.5-flash', 6000, 4096) // a realistic first call
    const gate = c.beforeCall(est)
    check('10. estimated first-call cost is under the $0.15 ceiling', est < 0.15, `est=${est}`)
    check('10. beforeCall allows call #1 on a fresh standard run', gate.allowed === true)
    check('fresh controller reports zero prior calls', c.summary().totalCalls === 0)
  }

  console.log('F) diagnostics/logs carry NO secrets or raw prompts (static)')
  {
    const engineSrc = read('../recommendations/engine.ts')
    // runtimeDiag must expose booleans/counts only — never the prompt text itself.
    const diagBlock = engineSrc.slice(engineSrc.indexOf('meta.runtimeDiag = {'), engineSrc.indexOf('meta.runtimeDiag = {') + 1400)
    check('12. engine runtimeDiag stores a PRESENCE boolean, not the prompt', /repeatedDiscoveryInstructionPresent: guidanceText\.includes/.test(diagBlock) && !/runtimeDiag[\s\S]{0,1400}guidanceText,/.test(diagBlock))
    const recoRouteSrc = read('../../../app/api/content/automation/recommendations/route.ts')
    check('8. reco route surfaces runtimeClass + runtimeDiag at zero', /runtimeClass/.test(recoRouteSrc) && /runtimeDiag: result\.meta\.runtimeDiag/.test(recoRouteSrc))
    check('11. idempotency 409 echoes inFlightHit/recentReplayHit (distinct from 0-new)', /run_in_progress[\s\S]{0,120}inFlightHit/.test(recoRouteSrc))
    check('reco route pins nodejs runtime', /export const runtime = 'nodejs'/.test(recoRouteSrc))
    const pageSrc = read('../../../app/(dashboard)/content/articles/[id]/page.tsx')
    check('6. client reads content-type + parses JSON error body', /res\.headers\.get\('content-type'\)/.test(pageSrc) && /hasJsonBody \? await res\.json/.test(pageSrc))
    check('7. client surfaces message + diagnosticId', /data\.message/.test(pageSrc) && /data\.diagnosticId/.test(pageSrc))
    check('client failure log never dumps the raw body', /\[content-wp-export\] client failure/.test(pageSrc) && !/body: (?:await )?res\.text/.test(pageSrc))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
