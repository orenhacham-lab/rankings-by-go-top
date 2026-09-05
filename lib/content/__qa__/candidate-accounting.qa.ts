/**
 * Topic-candidate funnel — ACCOUNTING AND OBSERVABILITY.
 *
 * SCOPE, stated up front: this exercises the REAL exported
 * generateOpportunities with a narrow injected candidate source (no model
 * call). It proves the funnel reports every candidate's fate truthfully. It
 * does NOT claim to explain the production 17→0 incident — see the note at the
 * end of section 5 for exactly what is and is not established.
 *
 * The reported symptom was "N candidates generated, 0 accepted, every
 * rejection counter zero". Two real reporting defects are covered here:
 *
 *   1. plan_stage_ids.generated_candidates was assigned ONLY inside the
 *      family-cluster branch, so a run that fell through to the tier-2/3
 *      recovery path reported 0 candidates generated no matter what it did —
 *      and the reconciliation then had nothing to reconcile.
 *   2. The cross-family dedupe loop discarded candidates with a bare
 *      `continue` after they had been counted, so the loss reached no ledger.
 *
 * Every candidate now carries EXACTLY ONE disposition, and dedupe removals are
 * kept in their own bucket so they cannot double-count against rejections.
 *
 * Run: npx tsx lib/content/__qa__/candidate-accounting.qa.ts
 */

import { FakeAdmin } from '../../__qa__/_fake-admin'
import { generateOpportunities } from '../recommendations/generate-opportunities'
import { newRunCostController } from '../recommendations/run-cost-controller'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const PROJECT = 'afrodite'

/** An ENGLISH project, like the one in the incident. No Hebrew anywhere. */
function world() {
  return new FakeAdmin({
    projects: [{ id: PROJECT, user_id: 'u1', business_name: 'Afrodite Decants', target_domain: 'afroditedecants.com', language: 'en', country: 'IL', is_active: true }],
    article_topics: [], generated_articles: [], gsc_query_page_metrics: [], gsc_sync_runs: [],
  })
}

/** Candidates shaped exactly like the model's JSON output. */
type Topic = { title: string; primaryKeyword: string; secondaryKeywords: string[]; intent: string; reason: string }
const englishTopic = (i: number, keyword?: string): Topic => ({
  title: `How to choose a niche fragrance decant ${i}`,
  primaryKeyword: keyword ?? `niche fragrance decant guide ${i}`,
  secondaryKeywords: ['perfume samples', 'decant sizes'],
  intent: 'informational',
  reason: 'Buyers compare decant sizes before committing to a full bottle.',
})

/** Run the REAL production module against a deterministic batch. */
async function run(topics: unknown[], opts: { families?: string[]; tracked?: string[] } = {}) {
  const admin = world()
  // Seeding tracked keywords builds evidence clusters, which — together with
  // `families` — routes the run through the FAMILY branch rather than the
  // recovery tiers. Both paths dedupe, and both must attribute.
  if (opts.tracked) (admin.tables.tracking_targets = opts.tracked.map((keyword, i) => ({ id: `t${i}`, project_id: PROJECT, keyword })))
  const controller = newRunCostController('standard', 'run-1', 10, { maxModelCallsPerRun: 20, maxEstimatedCostUsd: 5 })
  const res = await generateOpportunities(admin as never, { projectId: PROJECT, targetCount: 17, maxClusters: 14, ...(opts.families ? { families: opts.families as never } : {}) }, controller, {
    generateJson: (async () => ({ ok: true, text: JSON.stringify({ topics }) })) as never,
  })
  const d = res.diagnostics as unknown as {
    plan_stage_ids: { generated_candidates: number; deterministic_survivor_ids: string[] }
    rejected_by_reason: Record<string, number>
    duplicates_by_reason: Record<string, number>
    parser_dropped_items: number
    model_emitted_items: number
    parsed_candidates: number
    final_accepted: number
    duplicates: number
    rejected: number
    candidate_ledger: { candidateId: string; key: string | null; disposition: string; reason: string | null; duplicateOf: string | null; language: string }[]
  }
  return { suggestions: res.suggestions, d }
}
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

/** THE TWO REQUIRED INVARIANTS, checked on every batch this suite runs. */
function invariants(d: { model_emitted_items: number; parser_dropped_items: number; parsed_candidates: number; final_accepted: number; duplicates: number; rejected: number }) {
  return {
    emitted: d.model_emitted_items === d.parser_dropped_items + d.final_accepted + d.duplicates + d.rejected,
    parsed: d.parsed_candidates === d.final_accepted + d.duplicates + d.rejected,
    detail: `emitted=${d.model_emitted_items} dropped=${d.parser_dropped_items} parsed=${d.parsed_candidates} accepted=${d.final_accepted} dup=${d.duplicates} rej=${d.rejected}`,
  }
}

async function main() {
  console.log('Topic-candidate funnel — real production module\n')

  console.log('1) A LEGITIMATE ENGLISH BATCH YIELDS USABLE IDEAS')
  {
    const { suggestions, d } = await run(Array.from({ length: 17 }, (_, i) => englishTopic(i + 1)))
    check('1a: 17 distinct English candidates produce 17 usable ideas', suggestions.length === 17, String(suggestions.length))
    check('1b: generated_candidates reports 17, not 0', d.plan_stage_ids.generated_candidates === 17, String(d.plan_stage_ids.generated_candidates))
    check('1c: nothing was rejected', sum(d.rejected_by_reason) === 0, JSON.stringify(d.rejected_by_reason))
    check('1d: the ledger holds one entry per candidate', d.candidate_ledger.length === 17)
    check('1e: every entry says English — no Hebrew rules were applied',
      d.candidate_ledger.every((e) => e.language === 'en'))
    check('1f: the invariant holds: accepted + duplicate + rejected === generated',
      d.candidate_ledger.filter((e) => e.disposition === 'accepted').length
      + d.candidate_ledger.filter((e) => e.disposition === 'duplicate').length
      + d.candidate_ledger.filter((e) => e.disposition === 'rejected').length === 17)
  }

  console.log('\n2) THE RECOVERY-PATH REPORTING DEFECT')
  {
    // This batch reaches the tier-2/3 recovery path (no clusters exist), which
    // is exactly where generated_candidates used to report 0.
    const { d } = await run(Array.from({ length: 17 }, (_, i) => englishTopic(i + 1)))
    check('2a: the recovery path reports the real candidate count', d.plan_stage_ids.generated_candidates === 17)
    check('2b: and its survivors, so the funnel is reconcilable at all',
      d.plan_stage_ids.deterministic_survivor_ids.length === 17)
  }

  console.log('\n3) EVERY CANDIDATE HAS EXACTLY ONE DISPOSITION')
  {
    // All 17 collapse to ONE key: 1 survives, 16 are duplicates. This is the
    // shape that shows duplicates alone CANNOT produce 17→0.
    const { suggestions, d } = await run(Array.from({ length: 17 }, (_, i) => englishTopic(i + 1, 'niche fragrance decant guide')))
    check('3a: duplicates leave exactly ONE survivor — never zero', suggestions.length === 1, String(suggestions.length))
    check('3b: the other 16 are typed as duplicates, not rejections',
      d.duplicates_by_reason.cross_family_duplicate === 16, JSON.stringify(d.duplicates_by_reason))
    check('3c: duplicates are NOT counted as rejections (no double counting)',
      (d.rejected_by_reason.cross_family_duplicate ?? 0) === 0)
    check('3d: each duplicate names the key that displaced it',
      d.candidate_ledger.filter((e) => e.disposition === 'duplicate').every((e) => !!e.duplicateOf))
    check('3e: the ledger still reconciles', d.candidate_ledger.length === 17
      && d.candidate_ledger.filter((e) => e.disposition === 'accepted').length === 1
      && d.candidate_ledger.filter((e) => e.disposition === 'duplicate').length === 16)
    check('3f: and generated === accepted + duplicate + rejected',
      d.plan_stage_ids.generated_candidates === 17)
  }

  console.log('\n4) THE PARSER’S OWN DROPS ARE VISIBLE')
  {
    // An item with no primaryKeyword never reaches raw_candidates — the parser
    // discards it first. That loss used to be entirely invisible.
    const mixed = [
      ...Array.from({ length: 5 }, (_, i) => englishTopic(i + 1)),
      { title: 'No keyword here', primaryKeyword: '', secondaryKeywords: [], intent: 'informational', reason: 'x' },
      { title: '', primaryKeyword: 'orphan keyword', secondaryKeywords: [], intent: 'informational', reason: 'x' },
    ]
    const { suggestions, d } = await run(mixed)
    check('4a: the well-formed candidates still come through', suggestions.length === 5, String(suggestions.length))
    check('4b: the two malformed items are reported as parser drops', d.parser_dropped_items === 2, String(d.parser_dropped_items))
    check('4c: they are NOT silently absent from every count', d.parser_dropped_items > 0)
  }

  console.log('\n5) WHAT WOULD ACTUALLY PRODUCE 17 → 0')
  {
    // Every candidate rejected by the real validator: the counters must say so.
    const junk = Array.from({ length: 17 }, (_, i) => ({
      title: 'a', primaryKeyword: 'a', secondaryKeywords: [], intent: 'informational', reason: `${i}`,
    }))
    const { suggestions, d } = await run(junk)
    const rejected = sum(d.rejected_by_reason)
    const duplicates = sum(d.duplicates_by_reason)
    check('5a: a batch that genuinely fails validation yields zero ideas', suggestions.length === 0, String(suggestions.length))
    check('5b: and the run EXPLAINS the zero rather than reporting empty counters',
      rejected + duplicates === d.plan_stage_ids.generated_candidates && rejected + duplicates > 0,
      `generated=${d.plan_stage_ids.generated_candidates} rejected=${rejected} duplicates=${duplicates} ${JSON.stringify(d.rejected_by_reason)}`)
    check('5c: every candidate still carries exactly one disposition',
      d.candidate_ledger.length === d.plan_stage_ids.generated_candidates)
    check('5d: and none is left as "accepted" when nothing was accepted',
      d.candidate_ledger.filter((e) => e.disposition === 'accepted').length === suggestions.length)

    // NOT ESTABLISHED — stated so it cannot be mistaken for a conclusion.
    check('5e: SCOPE — the production 17→0 cause is NOT claimed here', true)
    console.log('     ↳ duplicates alone leave one survivor (3a), and the parser')
    console.log('       discards keyword-less items before they are counted (4b),')
    console.log('       so neither explains 17 generated → 0 accepted. Reproducing')
    console.log('       the real incident needs the actual candidate batch, which')
    console.log('       this environment has no database or log access to obtain.')
  }

  console.log('\n7) CANDIDATE IDENTITY, AND THE TWO EXACT INVARIANTS')
  {
    // Repeated keys: identity must survive, and the SURVIVOR must be the one
    // actually kept — reconciling by keyword could reclassify the original.
    const { suggestions, d } = await run(Array.from({ length: 17 }, (_, i) => englishTopic(i + 1, 'niche fragrance decant guide')))
    const ids = d.candidate_ledger.map((e) => e.candidateId)
    check('7a: every candidate has a stable, unique id', new Set(ids).size === 17 && ids.every((x) => !!x))
    const accepted = d.candidate_ledger.filter((e) => e.disposition === 'accepted')
    check('7b: exactly one entry is accepted', accepted.length === 1)
    check('7c: and it is the FIRST occurrence, not a later one reclassified onto',
      accepted[0].candidateId === ids[0], `${accepted[0].candidateId} vs ${ids[0]}`)
    check('7d: the accepted entry corresponds to the returned suggestion', suggestions.length === 1)

    const inv = invariants(d)
    check('7e: INVARIANT model_emitted = dropped + accepted + duplicates + rejected', inv.emitted, inv.detail)
    check('7f: INVARIANT parsed = accepted + duplicates + rejected', inv.parsed, inv.detail)

    // …and on a mixed batch that exercises the parser drop as well.
    const mixed = [
      ...Array.from({ length: 4 }, (_, i) => englishTopic(i + 1)),
      ...Array.from({ length: 3 }, () => englishTopic(99, 'shared decant keyword')),
      { title: '', primaryKeyword: '', secondaryKeywords: [], intent: 'informational', reason: 'x' },
    ]
    const m = await run(mixed)
    const mi = invariants(m.d)
    check('7g: both invariants hold on a mixed batch (drops + duplicates + accepts)', mi.emitted && mi.parsed, mi.detail)
    check('7h: no entry is left without a disposition',
      m.d.candidate_ledger.every((e) => ['accepted', 'duplicate', 'rejected'].includes(e.disposition)))
    check('7i: a removal is NEVER labelled duplicate without a boundary saying so',
      m.d.candidate_ledger.filter((e) => e.disposition === 'duplicate').every((e) => !!e.reason))
  }

  console.log('\n8) COVERAGE GAPS — stated, not papered over')
  {
    // Honest limits of this suite, recorded so they are not mistaken for
    // coverage. Both are about the FAMILY branch, which needs evidence clusters
    // AND candidates rich enough to survive validateOne; the fixtures here reach
    // the recovery branch instead. Verified by mutation: removing the family
    // dedupe attribution, or the identity carried onto the family copy, changes
    // nothing in this suite.
    check('8a: GAP — the family-branch dedupe boundary is NOT covered here', true)
    check('8b: GAP — the family-branch identity carry is NOT covered here', true)
    console.log('     ↳ covered boundaries: validateOne rejection, recovery-tier')
    console.log('       dedupe, parser drop. Mutating each of those fails this suite;')
    console.log('       mutating the two family-branch ones does not.')
  }

  console.log('\n6) THE MERCHANT NEVER SEES A RAW CODE')
  {
    for (const lang of ['en', 'he'] as const) {
      const g = (getDashboardDictionary(lang).contentHub as unknown as { genErrors: Record<string, string> }).genErrors
      for (const code of ['cross_family_duplicate', 'empty_primary_keyword', 'unaccounted']) {
        check(`6a[${lang}] ${code} is localized`, typeof g[code] === 'string' && g[code].length > 10, String(g[code]))
      }
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
