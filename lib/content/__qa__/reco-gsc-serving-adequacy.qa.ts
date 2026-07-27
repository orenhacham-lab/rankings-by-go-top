/**
 * GSC serving-adequacy QA.
 *
 * DEFECT: matchExistingContent rule 1 compares the GSC ranking page against the project's own
 * indexed URLs. But GSC data IS (query, page) pairs where the page is on this site — so for a
 * well-indexed site that comparison is a TAUTOLOGY. It matched at confidence 1 for essentially
 * every query, determineType rule 2 classified all of them improve_existing_page, and
 * supporting_content_candidate became unreachable. Measured: 721 -> 0 and 471 -> 0 on two
 * unrelated sites; a third produced 69/2449 (2.8%) ONLY because its crawl was incomplete.
 * The better a site was indexed, the more completely GSC was disabled as a topic source.
 *
 * FIX (one insertion point, engine.ts): the match is nulled when the page is in our index but
 * is NOT serving the query (averagePosition > SERVING_POSITION_MAX). That corrects BOTH
 * blocking points at once — determineType rule 2 and the adapter's existingContentMatch===null
 * filter read the same match.
 *
 * VERIFIABILITY GATE (absolute constraint): a query whose ranking page is NOT in our index is
 * never admitted. We cannot inspect a page we have not crawled, so we cannot prove it does not
 * already target the query — and admitting it could put two pages on one query.
 *
 * distinctPageCount is DIAGNOSTIC ONLY and deliberately not part of the predicate: three pages
 * competing at position 2 means the site is winning, and a fourth page there is pure
 * cannibalisation with no upside.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildOpportunities, SERVING_POSITION_MAX } from '../../gsc/opportunities/engine'
import { filterEligibleGscOpportunities, summarizeOpportunityRun } from '../../gsc/recommendations/adapter'
import { assessNeedCannibalization } from '../recommendations/coverage'
import type { ContentEvidence, OpportunityRunMeta } from '../../gsc/opportunities/types'
import type { GscMetricRow } from '../../gsc/summary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const RUN: OpportunityRunMeta = { projectId: 'p', syncRunId: 'run-90', windowDays: 90, dateStart: '2026-04-11', dateEnd: '2026-07-09' } as OpportunityRunMeta
const PAGE = 'https://x.co/blog/treadmill-guide'
const OTHER = 'https://x.co/blog/other'

/** One cluster: a query ranking on `page` at `position`, optionally split across a 2nd page. */
function rows(query: string, position: number, opts?: { page?: string; clicks?: number; secondPage?: string }): GscMetricRow[] {
  const page = opts?.page ?? PAGE
  const base: GscMetricRow[] = [{ query, page, clicks: opts?.clicks ?? 0, impressions: 400, ctr: 0, position } as GscMetricRow]
  if (opts?.secondPage) base.push({ query, page: opts.secondPage, clicks: 0, impressions: 200, ctr: 0, position } as GscMetricRow)
  return base
}
/** Evidence in which `indexedUrls` decides whether the ranking page resolves. */
const evidence = (indexed: string[], titles: string[] = []): ContentEvidence => ({
  topics: titles.map((t) => ({ topic: t, primaryKeyword: t, secondaryKeywords: [] })),
  articles: [], indexedUrls: indexed,
}) as ContentEvidence

const one = (query: string, position: number, indexed: string[], opts?: Parameters<typeof rows>[2]) =>
  buildOpportunities(rows(query, position, opts), evidence(indexed), RUN)[0]

const Q = 'how to choose a folding treadmill for home'

function main() {
  console.log('GSC serving adequacy — the tautology fix + verifiability gate\n')

  // ── A) pages that genuinely own a query are UNTOUCHED ─────────────────────────
  console.log('A) a page that genuinely serves the query is classified exactly as today')
  {
    for (const pos of [1, 3, 8, 15, 20]) {
      const o = one(Q, pos, [PAGE])
      check(`A. position ${pos}, in index, single page → improve_existing_page (unchanged)`,
        o.opportunityType === 'improve_existing_page' && o.servesQuery === true && o.existingContentMatch !== null,
        JSON.stringify({ type: o.opportunityType, serves: o.servesQuery }))
    }
    // BOUNDARY — pins the threshold so a future edit cannot drift it silently.
    check(`A6. exactly ${SERVING_POSITION_MAX} → still serving`, one(Q, SERVING_POSITION_MAX, [PAGE]).servesQuery === true)
    check(`A7. exactly ${SERVING_POSITION_MAX + 1} → NOT serving`, one(Q, SERVING_POSITION_MAX + 1, [PAGE]).servesQuery === false)
    check('A8. the constant is 20', SERVING_POSITION_MAX === 20)
  }

  // ── B) the fix: in the index but not serving becomes a candidate ──────────────
  console.log('\nB) in the index but ranking badly → supporting_content_candidate')
  {
    const o = one(Q, 80, [PAGE])
    check('B1. position 80, in index → supporting_content_candidate',
      o.opportunityType === 'supporting_content_candidate', o.opportunityType)
    check('B2. …the match is nulled (fixes determineType AND the adapter filter at once)',
      o.existingContentMatch === null)
    check('B3. …pageInSiteIndex true, servesQuery false', o.pageInSiteIndex === true && o.servesQuery === false)
    const { eligible, counts } = filterEligibleGscOpportunities([o], new Set())
    check('B4. the adapter admits it', eligible.length === 1, JSON.stringify(counts))
    check('B5. …and does NOT count it as unresolvable', counts.unresolvablePageCount === 0)
  }

  // ── C) distinctPageCount is DIAGNOSTIC ONLY ──────────────────────────────────
  console.log('\nC) multi-page is a diagnostic, never part of the predicate')
  {
    const o = one(Q, 5, [PAGE, OTHER], { secondPage: OTHER })
    check('C1. position 5 across 2 pages → STILL serving (site is winning; no 3rd page)',
      o.servesQuery === true && o.opportunityType === 'improve_existing_page',
      JSON.stringify({ type: o.opportunityType, serves: o.servesQuery, pages: o.distinctPageCount }))
    check('C2. multi-page is still recorded as a signal', o.distinctPageCount === 2 && o.signals.includes('multi_page_signal'))
    const src = stripComments(read('lib/gsc/opportunities/engine.ts'))
    check('C3. the predicate does NOT reference distinctPageCount',
      /const servesQuery = pageInSiteIndex && averagePosition <= SERVING_POSITION_MAX/.test(src))
  }

  // ── D) THE ABSOLUTE CONSTRAINT — the two cases named in review ────────────────
  console.log('\nD) never two pages targeting one query')
  {
    // D1/D2 — an UNVERIFIABLE page is never admitted, at any position.
    for (const pos of [80, 40, 25]) {
      const o = one(Q, pos, [])                       // index does NOT contain the ranking page
      const { eligible, counts } = filterEligibleGscOpportunities([o], new Set())
      check(`D. position ${pos}, page NOT in index → not admitted`,
        eligible.length === 0 && o.pageInSiteIndex === false,
        JSON.stringify({ eligible: eligible.length, counts }))
    }
    const oU = one(Q, 80, [])
    check('D4. …and it is COUNTED as unresolvable, not silently dropped',
      filterEligibleGscOpportunities([oU], new Set()).counts.unresolvablePageCount === 1)

    // D5 — the reviewed scenario: our page TARGETS the query (title ≈ query) and ranks 80.
    // The candidate is admitted by the adapter (page is ours, not serving) and MUST then be
    // blocked by the engine's need-level cannibalisation gate, which is what actually
    // enforces "one query, one page".
    const cann = assessNeedCannibalization(
      { primaryKeyword: Q, title: Q, intent: 'informational' },
      [{ title: Q, url: PAGE, type: 'article', sourceKey: `cov:${Q}` }],
    )
    check('D5. a page whose SUBJECT is the query blocks it — matchType exact',
      cann.matchType === 'exact', JSON.stringify(cann.matchType))
    check('D6. …which validatePolished turns into existing_content_owns_need',
      /if \(cann\.matchType === 'exact'\)[\s\S]{0,200}?existing_content_owns_need/.test(
        stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))))
    // D7 — a page that merely ranks incidentally (different subject) does NOT block, which is
    // the whole point of the fix.
    const cannOther = assessNeedCannibalization(
      { primaryKeyword: Q, title: Q, intent: 'informational' },
      [{ title: 'best protein powder for beginners', url: OTHER, type: 'article', sourceKey: 'cov:other' }],
    )
    check('D7. an unrelated page does NOT block (incidental ranking is a real gap)',
      cannOther.matchType === 'distinct', JSON.stringify(cannOther.matchType))
  }

  // ── E) the four downstream guards still gate every admitted candidate ─────────
  console.log('\nE) downstream guards intact')
  {
    const ad = stripComments(read('lib/gsc/recommendations/adapter.ts'))
    const gb = stripComments(read('lib/content/recommendations/gsc-briefs.ts'))
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('E1. adapter: type + intent + bare-head + decision filters unchanged',
      /opportunityType === 'supporting_content_candidate'/.test(ad) && /ELIGIBLE_INTENTS\.has\(o\.queryIntent\)/.test(ad)
      && /contentTokenSet\(o\.primaryQuery\)\.length >= 2/.test(ad) && /!decided\.has\(o\.id\)/.test(ad))
    check('E2. adapter: existingContentMatch === null still required', /o\.existingContentMatch === null/.test(ad))
    check('E3. gsc-briefs: coverage / ownership / duplicate guards intact',
      /partitionSubjectBearing\(candidates\)/.test(gb) && /isCoveredByContent/.test(gb)
      && /isOwnedByEntity/.test(gb) && /isHighConfidenceDuplicate/.test(gb))
    check('E4. GSC briefs run the SAME validatePolished', /const r = validatePolished\(polishedT, brief\)/.test(gfb))
    check('E5. need-level cannibalisation still runs on every candidate', /assessNeedCannibalization\(/.test(gfb))
    check('E6. MAX_TRIAL_GSC_BRIEFS still caps batch participation', /const MAX_TRIAL_GSC_BRIEFS = 2\b/.test(gfb))
    check('E7. gscSourceBudget unchanged', /return Math\.min\(60, Math\.max\(20, base \* 3\)\)/.test(stripComments(read('lib/content/recommendations/gsc-briefs.ts'))))
  }

  // ── F) diagnostics — the attribution that was missing ────────────────────────
  console.log('\nF) attribution: where every opportunity went')
  {
    const all = [one(Q, 2, [PAGE]), one('another treadmill query here', 80, [PAGE]), one('third query about running', 80, [])]
    const s = summarizeOpportunityRun(all)
    check('F1. typeDistribution covers all four types', Object.keys(s.typeDistribution).length === 4)
    check('F2. positionBuckets split by clicks', Object.keys(s.positionBuckets).join('|') === '1-3|4-10|11-20|21-50|51+')
    check('F3. reclassifiedByServingGate counts in-index-but-not-serving', s.reclassifiedByServingGate === 1, JSON.stringify(s))
    check('F4. pageNotInSiteIndexCount counts unverifiable pages', s.pageNotInSiteIndexCount === 1, JSON.stringify(s))
    check('F5. multiPageCount recorded', typeof s.multiPageCount === 'number')
    const ad = stripComments(read('lib/gsc/recommendations/adapter.ts'))
    check('F6. the threshold is echoed back for tuning', /diag\.servingPositionMax = SERVING_POSITION_MAX/.test(ad))
    check('F7. unresolvablePageCount surfaced in diagnostics', /diag\.unresolvablePageCount = counts\.unresolvablePageCount/.test(ad))
  }

  // ── G) FROZEN ────────────────────────────────────────────────────────────────
  console.log('\nG) FROZEN — nothing else moved')
  {
    const cm = stripComments(read('lib/gsc/opportunities/content-match.ts'))
    const en = stripComments(read('lib/gsc/opportunities/engine.ts'))
    check('G1. matchExistingContent itself is UNCHANGED (still URL → 0.9 → ≥0.5 token)',
      /confidence: 1,/.test(cm) && /confidence: 0\.9,/.test(cm) && /Math\.max\(0\.5, Math\.min\(0\.85/.test(cm))
    check('G2. determineType\'s three rules unchanged',
      /improve_title_meta_ctr/.test(en) && /c\.match\.confidence >= 0\.5/.test(en)
      && /intent_supports_new_content/.test(en))
    check('G3. no paid call added — buildOpportunities is pure over synced rows',
      !/fetch\(|generateRecommendationJSON|generateKeywordIdeas/.test(en))
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('G4. PAID_CALL_CAP still 3', /const PAID_CALL_CAP = 3\b/.test(gfb))
    check('G5. the ceiling + dangling-tail fixes intact',
      /lowYieldAcceptedCeiling\(input\.targetCount\)/.test(stripComments(read('lib/content/recommendations/low-yield-fallback.ts')))
      && /ו\?\(\?:איך\|כיצד\)/.test(stripComments(read('lib/content/recommendations/search-phrase.ts'))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
