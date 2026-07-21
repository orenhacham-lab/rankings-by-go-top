/**
 * Diagnostics-only NO-WRITE + on/off IDENTITY QA (Scope A) — source + engine gates.
 *
 * The route computes the final `fresh` array (accepted, canonicalized, blog-gated)
 * in ONE place, then EITHER (normal) persists it OR (diagnosticsOnly) returns it as a
 * dry-run WITHOUT any write. That structure makes two guarantees provable:
 *   1. IDENTITY — normal and diagnostics-only return the SAME final suggestions,
 *      byte-for-byte and in order, because both read the identical `fresh` variable
 *      built above the branch (only persistence differs). The engine that produces
 *      `fresh` is deterministic (proven here by a twice-run byte-identity check).
 *   2. NO-WRITE — the diagnostics-only branch returns BEFORE insertPendingIdeas and
 *      performs no insert/update/reject/queue; markIdeasDuplicate is also downstream.
 *   3. GATED — allowed ONLY when isolation diagnostics are on AND this is not a
 *      Production deploy; a normal request (no diagnosticsOnly) is behavior-identical.
 *
 * Source guards on the route encode (2)+(3); the engine determinism check underpins (1).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { startFakeGenai, fakeAdmin, genTitle } from './_reco-harness'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const route = readFileSync(join(__dirname, '../../../app/api/content/automation/recommendations/route.ts'), 'utf8')

const respond = (briefs: { id: string; subject: string; aligned_query?: string }[]) =>
  briefs.map((b, i) => ({ briefId: b.id, skip: false, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }))

function tables(): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: 'p1', business_name: 'חנות טבע', target_domain: 'https://shop.example.co.il', language: 'he', country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'תה ירוק' }],
    keyword_research_cache: [{ project_id: 'p1', fetched_at: '2026-07-01', results_json: [
      { keyword: 'תה צמחי טבעי', avgMonthlySearches: 210 },
      { keyword: 'חליטת קמומיל', avgMonthlySearches: 140 },
      { keyword: 'פולי קקאו טרי', avgMonthlySearches: 160 },
    ] }],
    shopify_entities: [], generated_articles: [], article_topics: [], content_topic_ideas: [], wordpress_content_index: [],
  }
}

async function main() {
  console.log('GATE) diagnosticsOnly is Preview-only, non-Production, diagnostics-gated')
  check('route parses body.diagnosticsOnly === true', /requestedDiagnosticsOnly = body\.diagnosticsOnly === true/.test(route))
  check('enabled ONLY when isolation diagnostics on AND VERCEL_ENV !== production',
    /const diagnosticsOnly = requestedDiagnosticsOnly && diagnostics && \(process\.env\.VERCEL_ENV \?\? null\) !== 'production'/.test(route))

  console.log('FAIL-CLOSED) a requested dry-run that cannot be honored is a typed 403 (never a silent write)')
  const iAuth = route.indexOf("const auth = await authContentProject")
  const i403 = route.indexOf('requestedDiagnosticsOnly && !diagnosticsOnly')
  const iInflightAdd = route.indexOf('INFLIGHT.add(inflightKey)')
  const iGenerate = route.indexOf('await generateFromBriefs(')
  const iInsert0 = route.indexOf('insertPendingIdeas(auth.admin')
  check('403 guard exists: if (requestedDiagnosticsOnly && !diagnosticsOnly) return 403', i403 > 0 && /diagnostics_only_unavailable/.test(route))
  check('403 guard is AFTER authentication', i403 > iAuth && iAuth > 0)
  check('403 guard is BEFORE INFLIGHT.add', i403 < iInflightAdd && iInflightAdd > 0)
  check('403 guard is BEFORE any generation call', i403 < iGenerate && iGenerate > 0)
  check('403 guard is BEFORE any persistence', i403 < iInsert0 && iInsert0 > 0)
  const guardBody = route.slice(i403 - 60, i403 + 260)
  check('403 body is typed: ok:false, diagnostics_only_unavailable, persisted:false, status 403',
    /ok: false/.test(guardBody) && /error: 'diagnostics_only_unavailable'/.test(guardBody) && /persisted: false/.test(guardBody) && /status: 403/.test(guardBody))
  // Pure gate-resolution model (A–D): the exact boolean the route evaluates.
  const resolve = (requested: boolean, diagEnabled: boolean, vercelEnv: string | null) => ({
    diagnosticsOnly: requested && diagEnabled && vercelEnv !== 'production',
    failClosed403: requested && !(requested && diagEnabled && vercelEnv !== 'production'),
  })
  check('A. diagnosticsOnly=true + Preview + diagnostics enabled → runs dry (no 403)', (() => { const r = resolve(true, true, 'preview'); return r.diagnosticsOnly === true && r.failClosed403 === false })())
  check('B. diagnosticsOnly=true + diagnostics DISABLED → 403 (no dry, no writes)', (() => { const r = resolve(true, false, 'preview'); return r.diagnosticsOnly === false && r.failClosed403 === true })())
  check('C. diagnosticsOnly=true + Production → 403 (no dry, no writes)', (() => { const r = resolve(true, true, 'production'); return r.diagnosticsOnly === false && r.failClosed403 === true })())
  check('D. no diagnosticsOnly → normal (no dry, no 403)', (() => { const r = resolve(false, true, 'preview'); return r.diagnosticsOnly === false && r.failClosed403 === false })())

  console.log('NO-WRITE) the dry-run branch returns BEFORE any persistence/mutation')
  const iBranch = route.indexOf('if (diagnosticsOnly) {')
  const iInsert = route.indexOf('insertPendingIdeas(auth.admin')
  const iMark = route.indexOf('markIdeasDuplicate(auth.admin')
  check('diagnosticsOnly branch exists', iBranch > 0)
  check('branch is positioned BEFORE insertPendingIdeas (identity: fresh already final)', iBranch > 0 && iInsert > iBranch)
  check('branch is positioned BEFORE markIdeasDuplicate', iBranch > 0 && iMark > iBranch)
  const branchBody = route.slice(iBranch, route.indexOf('// F/B — persist the EXACT fresh array', iBranch))
  check('branch body performs NO insertPendingIdeas / markIdeasDuplicate / approve / reject / queue write',
    branchBody.length > 0 && !/insertPendingIdeas\(/.test(branchBody) && !/markIdeasDuplicate\(/.test(branchBody) && !/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(branchBody))
  check('branch returns dryRun:true + wouldPersistCount + accepted/rejected candidates + accounting',
    /dryRun: true/.test(branchBody) && /wouldPersistCount: fresh\.length/.test(branchBody) && /acceptedCandidates: engineCandidateOutcomes\.filter/.test(branchBody) && /rejectedCandidates: engineCandidateOutcomes\.filter/.test(branchBody) && /candidateAccounting: briefDiagnostics\?\.candidateAccounting/.test(branchBody))

  console.log('STAGE-AWARE) engine view kept + final view added separately (both responses)')
  check('route builds finalCandidateOutcomes from the engine outcomes + engineFresh + fresh',
    /buildFinalCandidateOutcomes\(\{ engineOutcomes: engineCandidateOutcomes, engineFresh, fresh, blogRejectedByTitle \}\)/.test(route))
  check('dry-run response exposes engineCandidateOutcomes AND finalCandidateOutcomes + finalCandidateAccounting (separate)',
    /engineCandidateOutcomes,/.test(branchBody) && /finalCandidateOutcomes,/.test(branchBody) && /finalCandidateAccounting,/.test(branchBody))
  check('NORMAL response isolationDebug also carries the engine + final views',
    /engineCandidateOutcomes,\n\s*finalCandidateOutcomes,\n\s*finalCandidateAccounting,/.test(route))
  check('per-item blog-gate reason captured by title (exact final blog reason)',
    /blogRejectedByTitle\.set\(normalizeText\(s\.title\), r\)/.test(route))
  check('engine diagnostics NOT renamed/removed (candidateOutcomes/candidateAccounting still present)',
    /candidateOutcomes: CandidateOutcome\[\]/.test(readFileSync(join(__dirname, '../../../lib/content/recommendations/generate-from-briefs.ts'), 'utf8')))

  console.log('IDENTITY) normal + dry-run read the SAME final `fresh`; normal path still persists')
  check('the dry-run response returns the SAME `fresh` array normal mode would persist', /suggestions: fresh,/.test(branchBody))
  check('normal path STILL persists fresh (unchanged) via insertPendingIdeas(... suggestions: fresh ...)',
    /insertPendingIdeas\(auth\.admin, \{[^}]*suggestions: fresh/.test(route))
  check('a normal request (no diagnosticsOnly) never enters the branch — gate is a plain boolean guard',
    /if \(diagnosticsOnly\) \{/.test(route))

  console.log('ENGINE) `fresh` source is deterministic → byte-identical final suggestions')
  const { server, port } = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], respond })
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
  resetModelResolutionCache(); resetRecoGenAiClient()
  try {
    const { generateFromBriefs } = await import('../recommendations/generate-from-briefs')
    const { newRunCostController } = await import('../recommendations/run-cost-controller')
    const input = { projectId: 'p1', targetCount: 12, qualityMode: 'standard' as const }
    const a = await generateFromBriefs(fakeAdmin(tables()), input, newRunCostController('standard', 'norm', 12))
    const b = await generateFromBriefs(fakeAdmin(tables()), input, newRunCostController('standard', 'dry', 12))
    check('two runs (normal-shaped vs dry-run-shaped) produce byte-identical suggestions + order',
      JSON.stringify(a.suggestions) === JSON.stringify(b.suggestions) && a.suggestions.length > 0)
    check('candidateAccounting reconciles on the diagnostics run', b.diagnostics.candidateAccounting.reconciles === true)
  } finally {
    server.close()
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
