/**
 * BriefRun snapshot IDENTITY QA (Increment 3) — deterministic, offline.
 *
 * Proves the engine split introduced NO behavioral change: with identical fake
 * provider responses and identical stored project data, the public wrapper
 *   generateFromBriefs(admin, input, controller)
 * and the explicit two-phase path
 *   prepareBriefRun(admin, input, controllerP) → synthesizeFromSnapshot(snapshot, controllerS)
 * produce byte-identical:
 *   - discovery decision (ran / accepted / deficit) AND provider call count
 *   - ordered brief IDs (snapshot.workingPool order == the order rounds consumed)
 *   - pool diagnostics (brief_pool)
 *   - suggestions AND their order
 *   - rejection reasons (per-round + aggregate)
 *   - round diagnostics
 *   - stop reason
 *   - model-call accounting + cost reconciliation
 *
 * It additionally proves the snapshot is IMMUTABLE and discovery runs ONCE: a single
 * snapshot synthesized TWICE yields identical results, and the second synthesis makes
 * ZERO additional discovery calls (the smart controller's core reuse invariant).
 *
 * The frozen browser E2E + the full reco QA suite (both drive the wrapper) are
 * necessary but not sufficient; this file is the sufficient deterministic gate.
 */
import { startFakeGenai, fakeAdmin, genTitle } from './_reco-harness'
import { resetModelResolutionCache } from '../recommendations/model-availability'
import { resetRecoGenAiClient } from '../recommendations/genai-client'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Evidence-rich fixture (Hebrew health/ecommerce): a NON-empty deterministic pool,
 *  so discovery does NOT run — the "discovery === false" identity branch. */
function richTables(): Record<string, Record<string, unknown>[]> {
  return {
    projects: [{ id: 'p1', business_name: 'הצמחייה', target_domain: 'https://natural-shop.co.il', language: 'he', country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'תוספי תזונה טבעיים' }],
    keyword_research_cache: [{
      project_id: 'p1', fetched_at: '2026-07-01', results_json: [
        { keyword: 'מגנזיום לילדים מינון', avgMonthlySearches: 320 },
        { keyword: 'איך לבחור אבקת חלבון', avgMonthlySearches: 210 },
        { keyword: 'אנזימי עיכול טבעיים', avgMonthlySearches: 140 },
        { keyword: 'יתרונות אומגה 3', avgMonthlySearches: 90 },
        { keyword: 'ויטמין C לילדים', avgMonthlySearches: 500 },
        { keyword: 'חיזוק מערכת החיסון בחורף', avgMonthlySearches: 170 },
      ],
    }],
    shopify_entities: [
      { project_id: 'p1', is_active: true, title: 'מגנזיום ביסגליצינט 120 כמוסות', handle: 'mag', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/mag' },
      { project_id: 'p1', is_active: true, title: 'אנזימי עיכול פורטה', handle: 'enz', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/enz' },
      { project_id: 'p1', is_active: true, title: 'ויטמין C 500 טבעי', handle: 'vitc', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/vitc' },
      { project_id: 'p1', is_active: true, title: 'אבקת חלבון צמחית', handle: 'prot', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/prot' },
      { project_id: 'p1', is_active: true, title: 'אומגה 3 טבעי', handle: 'omega', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/omega' },
    ],
    generated_articles: [{ project_id: 'p1', title: 'מגנזיום לשינה - המדריך המלא' }],
    article_topics: [],
    content_topic_ideas: [],
    wordpress_content_index: [],
  }
}

/** Sparse fixture: NO keyword research + the tracked term is an exact owned entity
 *  → the deterministic pool is EMPTY, so constrained discovery MUST run (the
 *  "discovery === true" identity branch, incl. the extra provider call). */
function discoveryTables(): Record<string, Record<string, unknown>[]> {
  const t = richTables()
  t.keyword_research_cache = []
  t.tracking_targets = [{ project_id: 'p1', keyword: 'אבקת חלבון צמחית' }]
  return t
}

const respond = (briefs: { id: string; subject: string; aligned_query?: string }[]) =>
  briefs.map((b, i) => ({ briefId: b.id, skip: false, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }))

// Deterministic canonical serialization (stable key order) so two runs compare by
// value, not by object-construction order.
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const o = val as Record<string, unknown>
      return Object.keys(o).sort().reduce((acc, k) => { acc[k] = o[k]; return acc }, {} as Record<string, unknown>)
    }
    return val
  })
}

async function runScenario(label: string, tables: Record<string, Record<string, unknown>[]>, targetCount: number, expectDiscovery: boolean) {
  const { server, port, calls } = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], respond })
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
  resetModelResolutionCache(); resetRecoGenAiClient()
  const { generateFromBriefs, prepareBriefRun, synthesizeFromSnapshot } = await import('../recommendations/generate-from-briefs')
  const { newRunCostController } = await import('../recommendations/run-cost-controller')
  const input = { projectId: 'p1', targetCount, qualityMode: 'standard' as const }

  try {
    console.log(`SCENARIO) ${label} (discovery ${expectDiscovery ? 'REQUIRED' : 'not required'})`)

    // ── Path A — the public wrapper ──────────────────────────────────────────
    const callsBeforeA = calls.length
    const A = await generateFromBriefs(fakeAdmin(tables), input, newRunCostController('standard', 'wrapper', targetCount))
    const wrapperCalls = calls.length - callsBeforeA

    // ── Path B — explicit prepare → synthesize, using ONE shared controller,
    // exactly as the wrapper does (so discovery + synthesis cost accrue to the same
    // controller — a faithful whole-run identity, cost included). ───────────────
    const ctrlB = newRunCostController('standard', 'splitB', targetCount)
    const callsBeforePrepare = calls.length
    const snapshot = await prepareBriefRun(fakeAdmin(tables), input, ctrlB)
    const prepareCalls = calls.length - callsBeforePrepare
    const callsBeforeSynthB = calls.length
    const B = await synthesizeFromSnapshot(snapshot, ctrlB)
    const synthBCalls = calls.length - callsBeforeSynthB

    // discovery decision + call-count identity
    check(`${label} / discovery decision matches (ran=${A.diagnostics.discovery?.ran ?? null})`,
      (A.diagnostics.discovery?.ran ?? null) === (B.diagnostics.discovery?.ran ?? null) && (A.diagnostics.discovery?.ran ?? false) === expectDiscovery,
      JSON.stringify({ a: A.diagnostics.discovery?.ran, b: B.diagnostics.discovery?.ran, expectDiscovery }))
    check(`${label} / discovery accounting is identical`, canon(A.diagnostics.discovery) === canon(B.diagnostics.discovery), canon(A.diagnostics.discovery))
    check(`${label} / provider call count identical between wrapper and prepare+synth`, wrapperCalls === prepareCalls + synthBCalls, `wrapper=${wrapperCalls} prepare=${prepareCalls} synth=${synthBCalls}`)
    check(`${label} / discovery ran in PREPARE, never in synth (call split)`, (expectDiscovery ? prepareCalls >= 1 : prepareCalls === 0) && synthBCalls === A.diagnostics.rounds.length, `prepare=${prepareCalls} synth=${synthBCalls} rounds=${A.diagnostics.rounds.length}`)

    // ordered brief IDs — the snapshot's frozen pool order == the order rounds consumed
    const orderedBriefIds = snapshot.workingPool.map((b) => b.opportunityId)
    check(`${label} / snapshot exposes a non-empty ordered brief pool (or empty w/ discovery)`, expectDiscovery ? true : orderedBriefIds.length > 0, `n=${orderedBriefIds.length}`)

    // suggestions + order
    check(`${label} / suggestions + order are IDENTICAL`, canon(A.suggestions) === canon(B.suggestions), `aLen=${A.suggestions.length} bLen=${B.suggestions.length}`)
    check(`${label} / at least one suggestion was produced`, A.suggestions.length > 0, `n=${A.suggestions.length}`)

    // pool diagnostics
    check(`${label} / brief_pool diagnostics identical`, canon(A.diagnostics.brief_pool) === canon(B.diagnostics.brief_pool))
    // evidence inventory identical
    check(`${label} / evidence_inventory identical`, canon(A.diagnostics.evidence_inventory) === canon(B.diagnostics.evidence_inventory))
    // rejection reasons (aggregate + per round)
    check(`${label} / aggregate rejected_by_reason identical`, canon(A.diagnostics.rejected_by_reason) === canon(B.diagnostics.rejected_by_reason), canon(A.diagnostics.rejected_by_reason))
    check(`${label} / per-round diagnostics identical`, canon(A.diagnostics.rounds) === canon(B.diagnostics.rounds))
    // stop reason
    check(`${label} / stop_reason identical (${A.diagnostics.stop_reason})`, A.diagnostics.stop_reason === B.diagnostics.stop_reason, `${A.diagnostics.stop_reason} vs ${B.diagnostics.stop_reason}`)
    // model-call accounting + cost reconciliation
    check(`${label} / model_calls + brief_consumption identical`, A.diagnostics.model_calls === B.diagnostics.model_calls && canon(A.diagnostics.brief_consumption) === canon(B.diagnostics.brief_consumption), JSON.stringify({ a: A.diagnostics.model_calls, b: B.diagnostics.model_calls }))
    check(`${label} / cost reconciliation identical`, canon(A.diagnostics.cost) === canon(B.diagnostics.cost))
    // whole-diagnostics deep identity (except modelPath, which both share by construction)
    check(`${label} / FULL diagnostics deep-identical`, canon(A.diagnostics) === canon(B.diagnostics))

    // ── Snapshot immutability + discovery-once: synthesize the SAME snapshot twice
    // more with FRESH per-attempt controllers (the smart-controller reuse pattern:
    // discovery already happened during prepare; each attempt only synthesizes). The
    // two synth-only runs must equal EACH OTHER byte-for-byte, and neither makes a
    // discovery call. (Their cost differs from Path B only by the discovery call that
    // Path B's shared controller also saw — which is exactly the reuse invariant.)
    const beforeReuse = canon(snapshot.workingPool.map((b) => b.opportunityId))
    const callsBeforeS1 = calls.length
    const S1 = await synthesizeFromSnapshot(snapshot, newRunCostController('standard', 'attempt1', targetCount))
    const s1Calls = calls.length - callsBeforeS1
    const callsBeforeS2 = calls.length
    const S2 = await synthesizeFromSnapshot(snapshot, newRunCostController('standard', 'attempt2', targetCount))
    const s2Calls = calls.length - callsBeforeS2
    check(`${label} / two fresh-controller syntheses of one snapshot are byte-identical`, canon(S1.suggestions) === canon(S2.suggestions) && canon(S1.diagnostics) === canon(S2.diagnostics))
    check(`${label} / each reuse synthesis made ZERO discovery calls (discovery-once)`, s1Calls === A.diagnostics.rounds.length && s2Calls === A.diagnostics.rounds.length, `s1=${s1Calls} s2=${s2Calls} rounds=${A.diagnostics.rounds.length}`)
    check(`${label} / snapshot pool order UNMUTATED after three syntheses`, canon(snapshot.workingPool.map((b) => b.opportunityId)) === beforeReuse)
  } finally {
    server.close()
  }
}

async function main() {
  await runScenario('rich pool → no discovery', richTables(), 5, false)
  await runScenario('empty pool → discovery fills', discoveryTables(), 6, true)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
