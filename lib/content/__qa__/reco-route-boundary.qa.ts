/**
 * Route → persistence → reload BOUNDARY QA (Stabilization Phase 1, Part G) — offline
 * but NOT pure-helper-only: it drives the REAL insertPendingIdeas / loadPendingIdeas /
 * ideaToSuggestion code against a contract-faithful in-memory Supabase adapter that
 * mimics ON CONFLICT (project_id,fingerprint) DO NOTHING RETURNING. It proves the
 * persistence/reload/count contract that the pure-helper suite never crossed, the F
 * typed-error conditions, the C pending-vs-published separation, and — by source
 * assertion — that the default path is opportunity-first (A) and the unsafe brand /
 * relevance gates cannot reject (B).
 */
import { readFileSync } from 'fs'
import { insertPendingIdeas, loadPendingIdeas, ideaToSuggestion, topicIdeaFingerprint } from '../recommendations/topic-idea-store'
import type { TopicSuggestion } from '../recommendations/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = '/home/user/rankings-by-go-top'
const read = (p: string) => readFileSync(`${ROOT}/${p}`, 'utf8')

const sug = (kw: string, title = kw): TopicSuggestion => ({ id: `opportunity:${kw}`, title, primaryKeyword: kw, secondaryKeywords: [], searchIntent: 'informational', recommendedWordCount: 1000, angle: '', suggestedInternalLinks: [], source: 'hybrid', suggestionReason: 'r', suggestionScore: 0.7 })

/** Contract-faithful in-memory Supabase admin (only the surface the store uses). */
function fakeAdmin(seed: Record<string, unknown>[] = [], opts: { failInsertCode?: string; hideReload?: boolean } = {}) {
  const rows: Record<string, unknown>[] = [...seed]
  let n = 1000
  const from = () => {
    const st: { op: string; payload?: Record<string, unknown>[]; updates?: Record<string, unknown>; filters: Record<string, unknown>; inFilter?: { col: string; vals: unknown[] } } = { op: 'select', filters: {} }
    const exec = () => {
      if (st.op === 'upsert') {
        if (opts.failInsertCode) return { data: null, error: { code: opts.failInsertCode, message: 'boom' } }
        const inserted: { id: string }[] = []
        for (const row of st.payload ?? []) {
          if (rows.some((r) => r.project_id === row.project_id && r.fingerprint === row.fingerprint)) continue // ON CONFLICT DO NOTHING
          const full = { id: `row${n++}`, status: 'pending', created_at: '', secondary_keywords: [], suggested_internal_links: [], link_plan: null, ...row }
          rows.push(full); inserted.push({ id: full.id as string })
        }
        return { data: inserted, error: null }
      }
      if (st.op === 'update') { for (const r of rows) if (r.project_id === st.filters.project_id && st.inFilter?.vals.includes(r.id)) Object.assign(r, st.updates); return { data: null, error: null } }
      let out = rows.filter((r) => Object.entries(st.filters).every(([k, v]) => r[k] === v))
      if (opts.hideReload) out = []
      return { data: out, error: null }
    }
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      upsert(payload: Record<string, unknown>[]) { st.op = 'upsert'; st.payload = payload; return b },
      update(u: Record<string, unknown>) { st.op = 'update'; st.updates = u; return b },
      select() { return b }, eq(col: string, val: unknown) { st.filters[col] = val; return b }, in(col: string, vals: unknown[]) { st.inFilter = { col, vals }; return b }, order() { return b }, maybeSingle() { return b },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(res, rej) },
    })
    return b
  }
  return { admin: { from } as never, rows }
}

async function main() {
  console.log('A) route default path is opportunity-first; content-plan flag-gated (source)')
  {
    const route = read('app/api/content/automation/recommendations/route.ts')
    check('A. content-plan is gated behind RECO_ENABLE_CONTENT_PLAN', /RECO_ENABLE_CONTENT_PLAN === '1'/.test(route) && /const useContentPlan/.test(route))
    const defaultBlock = route.split('// DEFAULT — EVIDENCE-FIRST brief engine')[1]?.split('pathContract')[0] ?? ''
    check('A. the DEFAULT (else) branch calls the EVIDENCE-FIRST brief engine', /generateFromBriefs\(auth\.admin, \{ projectId: auth\.project\.id, targetCount: 12, qualityMode, userId: auth\.user\.id \}/.test(route) && defaultBlock.includes('generateFromBriefs') && !defaultBlock.includes('generateOpportunities('))
    check('A. the tiered generator is reachable ONLY behind RECO_TIERED_OPPORTUNITIES', /RECO_TIERED_OPPORTUNITIES === '1'/.test(route) && route.split('else if (useTiered)')[1]?.split('} else ')[0]?.includes('generateOpportunities') === true)
    check('A. generateContentPlan is only reached inside the flag branch (not the default)', route.split('else if (useContentPlan)')[1]?.includes('generateContentPlan') && !route.split('} else {').pop()!.includes('generateContentPlan'))
    check('A/D10. premium is ACCEPTED (no 400) and threaded into the engine', !/premium_not_available/.test(route) && /qualityMode: 'standard' \| 'premium'/.test(route) && /qualityMode, userId: auth\.user\.id \}, controller\)|targetCount: 12, qualityMode, userId/.test(route))
    check('A/D10. the model path is surfaced in Preview diagnostics', /model_path: briefDiagnostics\?\.modelPath/.test(route) && /briefDiagnostics: briefDiagnostics \?\? null/.test(route))
  }

  console.log('B) unsafe brand + relevance gates are diagnostics-only (source)')
  {
    const go = read('lib/content/recommendations/generate-opportunities.ts')
    check('B. the external-business classifier shadows, never returns a rejection', /shadow\('competitor_brand_leakage'\)/.test(go) && !/return \{ rejectionReason: 'competitor_brand_leakage' \}/.test(go))
    check('B. keyword-research queries are NOT spliced/removed by the classifier', !/keywordResearch\.splice/.test(go))
    check('B. only the exact title→keyword mutation stays a hard reject', /if \(detectUnsafeNamedEntityMutation\(o\.title, primaryKeyword, brandSafety\)\) return \{ rejectionReason: 'unsafe_named_entity_mutation' \}/.test(go))
    check('B. commercial-fit + relevance rejections are behind default-off flags', /GATE_COMMERCIAL_FIT = process\.env\.RECO_GATE_COMMERCIAL_FIT === '1'/.test(go) && /GATE_BUSINESS_RELEVANCE = process\.env\.RECO_GATE_BUSINESS_RELEVANCE === '1'/.test(go) && /if \(GATE_COMMERCIAL_FIT\) return/.test(go))
  }

  console.log('G) real persist → reload → count round trip (fake DB)')
  {
    const { admin } = fakeAdmin()
    const three = [sug('טיפוח ורדים בבית'), sug('בחירת זר כלה'), sug('משלוח פרחים בירושלים')]
    const out = await insertPendingIdeas(admin, { projectId: 'p1', userId: 'u1', batchId: 'b1', source: 'hybrid', suggestions: three })
    check('G1/2/3. the exact 3 suggestions are inserted (attempted=inserted=3)', out !== null && out.attempted === 3 && out.inserted === 3 && out.duplicate === 0 && out.failed === 0)
    const reloaded = await loadPendingIdeas(admin, 'p1')
    check('G4. loadPendingIdeas returns the 3 persisted rows', Array.isArray(reloaded) && reloaded.length === 3)
    const rebuilt = (reloaded ?? []).map(ideaToSuggestion)
    check('G5. newlyAddedCount would be the inserted count (3), and reload rebuilds them', out!.inserted === 3 && rebuilt.length === 3 && rebuilt.every((s) => three.some((t) => t.primaryKeyword === s.primaryKeyword)))
    check('G6. inserted>0 ⇒ the UI cannot render "0 new" (newlyAddedCount=inserted>0)', out!.inserted > 0)
  }

  console.log('C) pending exact-duplicate blocked; distinct long-tail under broad pending allowed')
  {
    // Seed a pending row with the fingerprint of one incoming suggestion (exact dup).
    const dupSug = sug('בחירת זר כלה')
    const { admin } = fakeAdmin([{ project_id: 'p1', status: 'pending', fingerprint: topicIdeaFingerprint(dupSug.primaryKeyword, dupSug.title), primary_keyword: dupSug.primaryKeyword, title: dupSug.title }])
    const out = await insertPendingIdeas(admin, { projectId: 'p1', userId: 'u1', batchId: 'b', source: 'hybrid', suggestions: [sug('טיפוח ורדים'), dupSug] })
    check('C. an EXACT pending duplicate is skipped (inserted 1, duplicate 1)', out!.inserted === 1 && out!.duplicate === 1)

    // A BROAD pending idea "פרחים" must NOT block a distinct long-tail (different fingerprint).
    const { admin: admin2 } = fakeAdmin([{ project_id: 'p1', status: 'pending', fingerprint: topicIdeaFingerprint('פרחים', 'פרחים'), primary_keyword: 'פרחים', title: 'פרחים' }])
    const longTail = sug('משלוח פרחים לחתונה בירושלים')
    const out2 = await insertPendingIdeas(admin2, { projectId: 'p1', userId: 'u1', batchId: 'b', source: 'hybrid', suggestions: [longTail] })
    check('C. a distinct long-tail under a broad pending idea IS inserted (not blocked)', out2!.inserted === 1 && topicIdeaFingerprint(longTail.primaryKeyword, longTail.title) !== topicIdeaFingerprint('פרחים', 'פרחים'))
  }

  console.log('F) typed persistence-failure + reload-mismatch conditions')
  {
    // Hard insert failure → failed>0, inserted 0, duplicate 0 → the route returns a typed 500.
    const { admin } = fakeAdmin([], { failInsertCode: '42P10' })
    const out = await insertPendingIdeas(admin, { projectId: 'p1', userId: 'u1', batchId: 'b', source: 'hybrid', suggestions: [sug('א'), sug('ב')] })
    const failCond = !!out && out.attempted > 0 && out.inserted === 0 && out.duplicate === 0
    check('F. a hard insert failure is TYPED (attempted>0, inserted=0, duplicate=0, failed>0)', failCond && out!.failed === 2 && out!.failure === '42P10')

    // Insert succeeds but reload cannot see the rows → persistence_reload_mismatch condition.
    const { admin: admin2 } = fakeAdmin([], { hideReload: true })
    const s = [sug('נושא חדש א'), sug('נושא חדש ב')]
    const ins = await insertPendingIdeas(admin2, { projectId: 'p1', userId: 'u1', batchId: 'b', source: 'hybrid', suggestions: s })
    const reload = await loadPendingIdeas(admin2, 'p1')
    const reloadedFps = new Set((reload ?? []).map((r) => r.fingerprint))
    const freshFps = s.map((x) => topicIdeaFingerprint(x.primaryKeyword, x.title))
    const mismatch = ins!.inserted > 0 && !freshFps.some((fp) => reloadedFps.has(fp))
    check('F. inserted>0 but invisible on reload ⇒ persistence_reload_mismatch condition holds', ins!.inserted === 2 && mismatch)
    // Route wires both typed errors.
    const route = read('app/api/content/automation/recommendations/route.ts')
    check('F. the route returns typed persistence_failed + persistence_reload_mismatch', /error: 'persistence_failed'/.test(route) && /error: 'persistence_reload_mismatch'/.test(route) && /status: 500/.test(route))
  }

  console.log('E/G) truthful funnel + no customer cost/call/up-to-30 text')
  {
    const route = read('app/api/content/automation/recommendations/route.ts')
    check('E. the customer funnel always carries engineFiltered (raw − engine-accepted)', /engineFiltered = Math\.max\(0, rawGeneratedCount - engineAcceptedCount\)/.test(route) && /funnel: \{ generated:[^}]*engineFiltered/.test(route))
    check('E. newlyAddedCount is the truthful inserted count, not pre-insert fresh', /newlyAddedCount: persistOutcome \? persistOutcome\.inserted : fresh\.length/.test(route))
    const ui = read('components/content/AutomationIdeas.tsx')
    const i18nHe = read('lib/i18n/dashboard/he.ts')
    check('G. no content-plan mode selector / cost / calls / up-to-30 wording in the card', !/planMode|PLAN_MODES|planSafeNote|planFewFound|cost_per_accepted|actual_calls/.test(ui))
    check('G. the up-to-30 / plan i18n keys were removed', !/planSafeNote|planFewFound|planModeQuick/.test(i18nHe))
    check('G. body sends qualityMode EXPLICITLY on every request (no requestedCount)', !/requestedCount: PLAN_MODES/.test(ui) && /JSON\.stringify\(\{ projectId: requestProjectId, source, keyword: keyword\.trim\(\), clientRequestId, qualityMode \}\)/.test(ui))
    check('G/D10. operator quality selector exists (flag-gated) with truthful model labels', /NEXT_PUBLIC_RECO_QUALITY_SELECTOR === '1'/.test(ui) && /reco-quality-mode/.test(ui) && /qualityPro/.test(ui) && /qualityDowngraded/.test(ui))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
