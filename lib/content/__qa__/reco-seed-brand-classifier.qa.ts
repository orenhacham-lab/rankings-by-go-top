/**
 * Seed inventory — STRICT named-business exclusion QA.
 *
 * The seed inventory used the BROAD classifier (classifyKeywordEntity via
 * containsExternalBusiness), whose rule is "[own type token] + [any token not already in the
 * project's vocabulary] => suspected external business". That is the definition of a NEW topic
 * opportunity, so for a catalogue project whose entity names repeat type words it excluded
 * essentially every legitimate long-tail seed (a measured florist: competitor_branded 105 of
 * 354 raw seeds, 3 eligible against a threshold of 12), while japan4u — whose entity names are
 * place names with no repeated type token, so typeVocab is empty — was structurally immune.
 *
 * It is ALSO false-negative on real competitors: ownBrandPresent short-circuits before the
 * check, and a branded phrase with no project type token never reaches it.
 *
 * The seed inventory now uses hasNamedExternalBusiness — the strict single-phrase variant this
 * engine already uses for the accepted-output competitor scan. Precision AND recall improve.
 *
 * Proves: legitimate catalogue phrases are kept; legal suffixes and impersonations are still
 * excluded (including the two classes the broad rule wrongly kept); the accepted-output brand
 * gates are untouched; and every frozen constant / exclusion-chain step is intact.
 * Source contracts strip comments first so prose can never satisfy a regex.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildBrandSafety, containsExternalBusiness, hasNamedExternalBusiness } from '../recommendations/brand-safety'
import { MIN_ELIGIBLE_SEEDS, COVERAGE_REJECTION_MIN_RATIO, MAX_SEEDS_SENT } from '../recommendations/low-yield-fallback'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// A catalogue project: entity names repeat type words, so typeVocab is dense — the shape that
// triggers the broad classifier. Business name is an owned NAME phrase (impersonation basis).
const florist = buildBrandSafety({
  businessName: 'פרחי אביב',
  entityNames: [
    'זר ורדים אדומים', 'זר ורדים לבנים', 'זר כלה', 'סידור פרחים לאירוע', 'סידור פרחים גדול',
    'זר פרחים מעורב', 'משלוח פרחים', 'עציץ אורכידאה', 'זר פרחי שדה', 'סידור פרחים לבית',
  ],
})
// A non-catalogue project: place-name entities share no repeated type token → typeVocab empty.
const travel = buildBrandSafety({
  businessName: 'japan4u',
  entityNames: ['טיול ליפן', 'טוקיו', 'קיוטו', 'אוסקה', 'הוקאידו', 'שינקנסן', 'אונסן', 'ריוקאן'],
})

/** The predicate the seed inventory now uses. */
const excluded = (phrase: string, bs = florist) => hasNamedExternalBusiness(phrase, bs).hit
/** The predicate it used to use — kept ONLY to prove the delta is what we intend. */
const excludedByOldBroadRule = (phrase: string, bs = florist) => containsExternalBusiness(phrase, bs)

const LEGIT = [
  'זר פרחים ליום הולדת',
  'משלוח פרחים לחתונה',
  'פרחים לניחום אבלים',
  'זר פרחים ליולדת',
  'מתי לשתול ורדים',
  'סידור פרחים לבר מצווה',
]

function main() {
  console.log('Seed inventory — strict named-business exclusion\n')

  // ── A) the six legitimate catalogue phrases are now KEPT ──────────────────────
  console.log('A) legitimate catalogue seeds are no longer excluded')
  {
    for (const p of LEGIT) check(`A. kept: ${p}`, !excluded(p), JSON.stringify(hasNamedExternalBusiness(p, florist)))
    check('A7. …and ALL SIX were wrongly excluded by the old broad rule (the defect)',
      LEGIT.every((p) => excludedByOldBroadRule(p)))
  }

  // ── B) real competitors are still excluded ────────────────────────────────────
  console.log('\nB) genuine brand signals are still excluded')
  {
    const suffixes: [string, string][] = [
      ['בע״מ', 'דובדבן פרחים בע״מ'], ['Ltd', 'Bloom Ltd'], ['Inc', 'Petals Inc'],
      ['LLC', 'Rose LLC'], ['Corp', 'Flora Corp'], ['גרופ', 'פרחי גרופ'],
    ]
    for (const [label, p] of suffixes) {
      const r = hasNamedExternalBusiness(p, florist)
      check(`B. legal suffix ${label} excluded: ${p}`, r.hit && r.evidence === 'business_legal_suffix', JSON.stringify(r))
    }
    const imp = hasNamedExternalBusiness('פרחי אביה', florist)
    check('B7. name-mutation impersonation still caught (פרחי אביב → פרחי אביה)',
      imp.hit && imp.evidence.startsWith('named_entity_mutation_of:'), JSON.stringify(imp))
    check('B8. impersonation caught inside a longer phrase too',
      hasNamedExternalBusiness('פרחי אביה משלוח', florist).hit)
  }

  // ── C) the two classes the BROAD rule wrongly KEPT are now caught ─────────────
  console.log('\nC) recall improves — cases the old rule let through')
  {
    check('C1. own-brand + legal suffix: old rule KEPT it (ownBrandPresent short-circuit)',
      !excludedByOldBroadRule('פרחי אביב בע״מ'))
    check('C2. …now correctly EXCLUDED', excluded('פרחי אביב בע״מ'))
    check('C3. branded, no project type token: old rule KEPT "Bloom Ltd"',
      !excludedByOldBroadRule('Bloom Ltd'))
    check('C4. …now correctly EXCLUDED', excluded('Bloom Ltd'))
    check('C5. no-type-token suffix "אקמה בע״מ": old kept, strict excludes',
      !excludedByOldBroadRule('אקמה בע״מ') && excluded('אקמה בע״מ'))
    check('C6. impersonation "פרחי אביה": old kept, strict excludes',
      !excludedByOldBroadRule('פרחי אביה') && excluded('פרחי אביה'))
  }

  // ── D) no LEGITIMATE seed is newly lost (the non-monotonic delta is brand-only) ─
  console.log('\nD) the strict rule never newly excludes a non-branded phrase')
  {
    const newlyExcluded = LEGIT.filter((p) => excluded(p) && !excludedByOldBroadRule(p))
    check('D1. none of the legitimate phrases is newly excluded', newlyExcluded.length === 0, JSON.stringify(newlyExcluded))
    // Every phrase strict excludes must carry a real brand signal — never a bare topic.
    const branded = ['פרחי אביב בע״מ', 'Bloom Ltd', 'אקמה בע״מ', 'פרחי אביה', 'פרחי גרופ']
    check('D2. every strict-only exclusion carries suffix or mutation evidence',
      branded.every((p) => { const r = hasNamedExternalBusiness(p, florist); return r.hit && (r.evidence === 'business_legal_suffix' || r.evidence.startsWith('named_entity_mutation_of:')) }))
    check('D3. a descriptor coincidence is NOT an impersonation (ורדים ↔ ורודים)',
      !excluded('זר ורדים ורודים'))
  }

  // ── E) the non-catalogue project shape is unaffected ──────────────────────────
  console.log('\nE) a project with empty typeVocab is unaffected either way')
  {
    check('E1. travel fixture has an EMPTY typeVocab (the japan4u shape)', travel.typeVocab.size === 0,
      JSON.stringify([...travel.typeVocab]))
    const travelPhrases = ['טיול ליפן בסתיו', 'מה לארוז לטוקיו', 'מחירי מלונות בקיוטו']
    check('E2. old rule excluded none of them', travelPhrases.every((p) => !excludedByOldBroadRule(p, travel)))
    check('E3. strict rule also excludes none of them', travelPhrases.every((p) => !excluded(p, travel)))
    check('E4. a legal suffix is still caught for that project too',
      excluded('Tokyo Tours Ltd', travel))
  }

  // ── F) scope containment — accepted-output gates untouched ────────────────────
  console.log('\nF) accepted-output brand gates are untouched')
  {
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    const lyf = stripComments(read('lib/content/recommendations/low-yield-fallback.ts'))
    const cd = stripComments(read('lib/content/recommendations/constrained-discovery.ts'))
    const bsSrc = stripComments(read('lib/content/recommendations/brand-safety.ts'))

    check('F1. seed inventory now calls the STRICT predicate',
      /if \(hasNamedExternalBusiness\(phrase, params\.brandSafety\)\.hit\) \{ exclude\(raw\.source, 'competitor_branded'\); continue \}/.test(lyf))
    check('F2. the seed inventory no longer imports/uses the broad predicate',
      !/containsExternalBusiness/.test(lyf))
    check('F3. exclusion reason string unchanged (before/after diagnostics comparable)',
      /'competitor_branded'/.test(lyf))
    check('F4. accepted-output scan still uses scanSuggestionBrandSafety',
      /const scan = scanSuggestionBrandSafety\(\{ title: t\.title, primaryKeyword/.test(gfb))
    check('F5. accepted-output mutation gate unchanged',
      /if \(detectUnsafeNamedEntityMutation\(t\.title, primaryKeyword, brandSafety\)\) return rej\('unsafe_named_entity_mutation'/.test(gfb))
    check('F6. scanSuggestionBrandSafety still uses the broad predicate internally (unchanged)',
      /if \(val && containsExternalBusiness\(val, bs\)\) return \{ safe: false, reason: 'competitor_brand_leakage'/.test(bsSrc))
    check('F7. brand-safety.ts itself is unmodified — both predicates still exported',
      /export function containsExternalBusiness/.test(bsSrc) && /export function hasNamedExternalBusiness/.test(bsSrc))
    check('F8. RECORDED, not fixed: constrained-discovery still uses the broad predicate',
      /if \(containsExternalBusiness\(subject, ctx\.brandSafety\)\) \{ reject\('discovery_external_business'/.test(cd))
  }

  // ── G) FROZEN — the rest of the chain and every cost constant ─────────────────
  console.log('\nG) FROZEN — exclusion chain, gates and cost constants')
  {
    const lyf = stripComments(read('lib/content/recommendations/low-yield-fallback.ts'))
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    const sd = stripComments(read('lib/content/recommendations/semantic-dup.ts'))
    const opp = stripComments(read('lib/content/recommendations/opportunity.ts'))

    check('G1. every other exclusion-chain step intact',
      ['malformed_generic', 'modifier_only', 'exact_existing_content_keyword', 'exact_entity_owner',
       'pending_exact_idea', 'covered_by_existing_content', 'published_duplicate', 'pending_duplicate',
       'accepted_this_run', 'consumed_brief_duplicate'].every((r) => lyf.includes(`'${r}'`)))
    check('G2. fallback tunables unchanged (12 / 0.5 / 30)',
      MIN_ELIGIBLE_SEEDS === 12 && COVERAGE_REJECTION_MIN_RATIO === 0.5 && MAX_SEEDS_SENT === 30)
    check('G3. the ceiling fix from the parent commit is intact',
      /belowAcceptedCeiling: input\.acceptedCount < lowYieldAcceptedCeiling\(input\.targetCount\)/.test(lyf))
    check('G4. PAID_CALL_CAP still 3', /const PAID_CALL_CAP = 3\b/.test(gfb))
    check('G5. batchSize formula unchanged',
      /const batchSize = Math\.min\(workingPool\.length - cursor, Math\.max\(4, Math\.ceil\(deficit \* 1\.5\)\)\)/.test(gfb))
    check('G6. fallback output still runs the SAME validatePolished (no filler path)',
      /const r = validatePolished\(polishedT, pair\.brief\)/.test(gfb))
    check('G7. brief-vs-brief dedup threshold UNCHANGED at >= 0.5 (change B stays closed)',
      /shared \/ union >= 0\.5/.test(sd))
    check('G8. source_only_entity_expansion intact',
      /return fail\('source_only_entity_expansion', 0, cannib\)/.test(opp))
    check('G9. cannibalisation / pending / intra-run dedupe intact',
      /assessNeedCannibalization\(/.test(gfb) && /pending_semantic_duplicate/.test(gfb) && /intra_run_need_duplicate/.test(gfb))
    // SHAPE C replaced the constant with a supply-scaled quota. The historical value 2
    // survives as the FLOOR (TRIAL_GSC_BASE), so no project can receive fewer trial
    // slots than before; the cap is additive-only and never re-ranks.
    check('G10. GSC trial quota is supply-scaled with the historical 2 as its floor',
      /const TRIAL_GSC_BASE = 2\b/.test(gfb) && /const MAX_TRIAL_GSC_BRIEFS = trialGscBriefQuota\(/.test(gfb))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
