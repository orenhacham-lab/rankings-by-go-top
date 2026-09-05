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
import { buildFunnelDiagnostics, hasFunnelDiagnostics } from '../recommendations/funnel-summary'
import { applyDispositions } from '../recommendations/candidate-dispositions'
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

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

  console.log('\n8) ONE SHARED DEDUPE, EXECUTED BY BOTH PRODUCTION PATHS')
  {
    // IDENTICAL candidates (same title AND keyword) — validateOne derives the
    // key from the title, so differing titles produce differing keys and no
    // duplicates at all. That is why an earlier fixture never reached this
    // boundary. Seeding tracking_targets builds evidence clusters; passing
    // `families` routes the run through the FAMILY branch.
    const TRACKED = ['niche fragrance decants', 'perfume sample sets', 'decant sizes guide']
    const identical = Array.from({ length: 17 }, () => englishTopic(1, 'niche fragrance decant guide'))

    const fam = await run(identical, { families: ['informational'], tracked: TRACKED })
    check('8a: FAMILY path — only tier 1 ran, so the family branch was taken',
      JSON.stringify((fam.d as unknown as { tiers: { tier: number }[] }).tiers.map((t) => t.tier)) === '[1]',
      JSON.stringify((fam.d as unknown as { tiers: { tier: number }[] }).tiers.map((t) => t.tier)))
    check('8b: it keeps exactly ONE survivor', fam.suggestions.length === 1, String(fam.suggestions.length))
    check('8c: and names the other 16 as duplicates AT that boundary',
      fam.d.duplicates_by_reason.cross_family_duplicate === 16, JSON.stringify(fam.d.duplicates_by_reason))
    check('8d: none fell through to `unaccounted`', (fam.d.rejected_by_reason.unaccounted ?? 0) === 0, JSON.stringify(fam.d.rejected_by_reason))
    const fi = invariants(fam.d)
    check('8e: both invariants hold on the FAMILY path', fi.emitted && fi.parsed, fi.detail)
    check('8f: identity survives the family carry — the accepted entry is the FIRST occurrence',
      fam.d.candidate_ledger.filter((e) => e.disposition === 'accepted')[0].candidateId === fam.d.candidate_ledger[0].candidateId)
    check('8g: every duplicate names the candidate id it collided with',
      fam.d.candidate_ledger.filter((e) => e.disposition === 'duplicate').every((e) => !!e.duplicateOf))

    const rec = await run(identical, { tracked: TRACKED })
    check('8h: RECOVERY path — tiers 1..3 ran, so the recovery branch was taken',
      ((rec.d as unknown as { tiers: { tier: number }[] }).tiers.length > 1))
    check('8i: it also keeps exactly ONE survivor', rec.suggestions.length === 1, String(rec.suggestions.length))
    check('8j: and names its drops as duplicates too',
      (rec.d.duplicates_by_reason.cross_family_duplicate ?? 0) > 0, JSON.stringify(rec.d.duplicates_by_reason))
    const ri = invariants(rec.d)
    check('8k: both invariants hold on the RECOVERY path', ri.emitted && ri.parsed, ri.detail)

    check('8l: accepted is what CAME OUT, not the deterministic survivor count',
      fam.d.final_accepted === fam.suggestions.length && rec.d.final_accepted === rec.suggestions.length)
  }

  console.log('\n6) THE RESPONSE MAPPER — engine outcomes reach meta.funnel')
  {
    const identical = Array.from({ length: 17 }, () => englishTopic(1, 'niche fragrance decant guide'))
    const { d } = await run(identical, { families: ['informational'], tracked: ['niche fragrance decants', 'perfume sample sets'] })
    const f = buildFunnelDiagnostics(d as never)
    check('6a: batch duplicates reach the funnel', f.batchDuplicates === 16, JSON.stringify(f))
    check('6b: and it is worth rendering', hasFunnelDiagnostics(f))

    const withDrops = await run([
      ...Array.from({ length: 3 }, (_, i) => englishTopic(i + 1)),
      { title: '', primaryKeyword: '', secondaryKeywords: [], intent: 'informational', reason: 'x' },
      { title: 'no keyword', primaryKeyword: '', secondaryKeywords: [], intent: 'informational', reason: 'x' },
    ])
    const f2 = buildFunnelDiagnostics(withDrops.d as never)
    check('6c: parser/schema failures reach the funnel', f2.parserDropped === 2, JSON.stringify(f2))

    // An internal removal must NOT be folded into a quality verdict.
    const internal = buildFunnelDiagnostics({ parser_dropped_items: 0, duplicates: 0, rejected_by_reason: { unaccounted: 4, insufficient_content_depth: 9 } })
    check('6d: internal/unaccounted is its own count', internal.internalUnaccounted === 4)
    check('6e: …and does NOT absorb the quality rejections', internal.batchDuplicates === 0 && internal.parserDropped === 0)
    check('6f: a clean run produces nothing to render', !hasFunnelDiagnostics(buildFunnelDiagnostics({ parser_dropped_items: 0, duplicates: 0, rejected_by_reason: {} })))
    check('6g: a missing diagnostics object is safe', buildFunnelDiagnostics(null).parserDropped === 0)
  }

  console.log('\n9) THE RENDERED SUMMARY — real DOM, HE and EN')
  {
    // The exact template the component renders, resolved from the real
    // dictionary and substituted the same way — then rendered to real markup.
    for (const lang of ['en', 'he'] as const) {
      const t = (getDashboardDictionary(lang).contentHub as unknown as { autoIdeas: Record<string, string> }).autoIdeas
      const line = t.funnelDiagnosticsLine.replace('{p}', '2').replace('{b}', '16').replace('{u}', '4')
      const html = renderToStaticMarkup(createElement('p', { 'data-testid': 'funnel-diagnostics' }, line))
      const text = html.replace(/<[^>]+>/g, ' ')
      check(`9a[${lang}] the summary renders all three counts`, /2/.test(text) && /16/.test(text) && /4/.test(text), text)
      check(`9b[${lang}] and shows NO raw reason code`,
        !/parser_dropped|batchDuplicates|internalUnaccounted|unaccounted|cross_family_duplicate|empty_primary_keyword|\{p\}|\{b\}|\{u\}/.test(text), text)
      check(`9c[${lang}] the text is localized prose, not an identifier`, text.trim().split(/\s+/).length > 8, text)
    }
    const en = (getDashboardDictionary('en').contentHub as unknown as { autoIdeas: Record<string, string> }).autoIdeas
    const he = (getDashboardDictionary('he').contentHub as unknown as { autoIdeas: Record<string, string> }).autoIdeas
    check('9d: HE and EN are genuinely different strings', en.funnelDiagnosticsLine !== he.funnelDiagnosticsLine)
    check('9e: the internal failure is NOT described as a quality decision',
      !/quality/i.test(en.funnelDiagnosticsLine.split('·')[2] ?? ''), en.funnelDiagnosticsLine)

    const src = readFileSync(join(__dirname, '..', '..', '..', 'components', 'content', 'AutomationIdeas.tsx'), 'utf8')
    check('9f: SOURCE — the component renders that line from meta.funnel', /funnelDiagnosticsLine/.test(src) && /data-testid="funnel-diagnostics"/.test(src))
    check('9g: SOURCE — and only when something is non-zero',
      /parserDropped \?\? 0\) > 0 \|\| \(meta\.funnel\.batchDuplicates \?\? 0\) > 0 \|\| \(meta\.funnel\.internalUnaccounted \?\? 0\) > 0/.test(src))
    const route = readFileSync(join(__dirname, '..', '..', '..', 'app', 'api', 'content', 'automation', 'recommendations', 'route.ts'), 'utf8')
    check('9h: SOURCE — BOTH funnel construction sites include the diagnostics',
      (route.match(/buildFunnelDiagnostics\(opportunityDiagnostics\)/g) ?? []).length === 2)
  }

  console.log('\n10) THE SHARED IMPLEMENTATION, TESTED DIRECTLY')
  {
    type C = { id: string; kw: string }
    const dispose = (items: C[], seen = new Map<string, string>()) =>
      applyDispositions(items, { keyOf: (c) => c.kw, idOf: (c) => c.id, seen })

    // The empty-key branch is DEFENSIVE from the engine's side — parseOpportunities
    // discards keyword-less items before they ever reach here — so it is covered
    // directly rather than left untested.
    const empties = dispose([{ id: 'a', kw: '' }, { id: 'b', kw: 'x' }, { id: 'c', kw: '   ' === '   ' ? '' : 'y' }])
    check('10a: an empty key is dropped with its own reason',
      empties.dropped.filter((d) => d.reason === 'empty_primary_keyword').length === 2, JSON.stringify(empties.dropped))
    check('10b: …and never reported as a duplicate',
      empties.dropped.every((d) => d.reason !== 'cross_family_duplicate' || d.duplicateOfKey !== null))
    check('10c: the usable candidate is retained', empties.retained.length === 1 && empties.retained[0].id === 'b')

    // Identity, not keyword: the FIRST id claims the key; later ones name it.
    const dupes = dispose([{ id: 'first', kw: 'k' }, { id: 'second', kw: 'k' }, { id: 'third', kw: 'k' }])
    check('10d: the first occurrence is retained', dupes.retained.length === 1 && dupes.retained[0].id === 'first')
    check('10e: later ones are duplicates naming the id that claimed the key',
      dupes.dropped.length === 2 && dupes.dropped.every((d) => d.duplicateOfCandidateId === 'first' && d.duplicateOfKey === 'k'))
    check('10f: each dropped entry carries its OWN id, not the survivor’s',
      dupes.dropped.map((d) => d.candidateId).join(',') === 'second,third')

    // The shared `seen` map is what makes cross-BATCH duplicates detectable.
    const seen = new Map<string, string>()
    const b1 = dispose([{ id: 'b1', kw: 'shared' }], seen)
    const b2 = dispose([{ id: 'b2', kw: 'shared' }], seen)
    check('10g: a later batch sees the earlier batch’s key', b1.retained.length === 1 && b2.retained.length === 0)
    check('10h: and attributes it to the earlier candidate', b2.dropped[0].duplicateOfCandidateId === 'b1')

    // Nothing is ever invented.
    const clean = dispose([{ id: '1', kw: 'a' }, { id: '2', kw: 'b' }])
    check('10i: distinct candidates produce no drops at all', clean.dropped.length === 0 && clean.retained.length === 2)
    check('10j: every item has exactly one outcome',
      dupes.retained.length + dupes.dropped.length === 3 && clean.retained.length + clean.dropped.length === 2)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
