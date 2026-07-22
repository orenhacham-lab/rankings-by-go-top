/**
 * Stage E3A — recommendation preparation-order QA (FIX 1-4). Proves GSC is integrated BEFORE
 * constrained discovery, the combined pool passes through the EXISTING priority/family helper
 * (no GSC-specific tier, GSC never force-first, GSC can earn a first batch), the discovery
 * deficit/skip logic, truthful consumed/accepted diagnostics wiring, and flag-off identity.
 * Functional checks reuse the real exported priority helper; the rest are source contracts.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildBusinessPillars, prioritizeBriefsForSynthesis, type OpportunityBrief } from '../../../content/recommendations/opportunity-brief'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

function brf(subject: string, o: { id?: string; kind?: string; family?: 'informational' | 'comparison' | 'commercial'; score?: number } = {}): OpportunityBrief {
  return {
    opportunityId: o.id ?? `b:${subject}`, subject, searchNeed: 'informational', family: o.family ?? 'informational',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sourceEvidence: [{ kind: (o.kind ?? 'keyword_research') as any, text: subject }],
    alignedDemandQuery: null, demandVolumeSource: null, intendedIntent: 'informational', intendedPageType: 'article',
    existingContentGap: true, relatedEntities: [], publishedCoverage: [], confidence: 0.5, briefScore: o.score ?? 0.5,
  }
}

function main() {
  console.log('GSC Stage E3A — preparation order (FIX 1-4)')
  const pillars = buildBusinessPillars({ trackedKeywords: ['folding treadmill'], projectFocus: [], entities: [] })

  // ── FIX 2 — combined pool uses the existing priority; GSC never force-first ──
  {
    // A pillar-aligned keyword_research brief is Tier 0; a GSC brief (kind 'gsc') is never
    // Tier 0 (fromQueryOrFocus is false for 'gsc') → it cannot jump ahead of a Tier-0 need.
    const normalT0 = brf('folding treadmill maintenance schedule', { id: 'n0', kind: 'keyword_research', score: 0.40 })
    const gscHigh = brf('folding treadmill assembly instructions', { id: 'gsc:o1', kind: 'gsc', score: 0.99 })
    const ordered = prioritizeBriefsForSynthesis([normalT0, gscHigh], { pillars })
    check('(8) combined pool ordered by the existing prioritizeBriefsForSynthesis (Tier 0 first)', ordered[0].opportunityId === 'n0')
    check('(10) a GSC brief is NOT forced first merely for a high score', ordered[0].priority?.tier === 0 && (ordered.find((b) => b.opportunityId === 'gsc:o1')?.priority?.tier ?? 9) > 0)
    check('(11) normal briefs retain existing priority semantics (pillar → Tier 0)', normalT0.priority?.tier === 0)
    // Input-order independence.
    const rev = prioritizeBriefsForSynthesis([gscHigh, normalT0], { pillars })
    check('(order) prioritization is input-order independent', ordered.map((b) => b.opportunityId).join(',') === rev.map((b) => b.opportunityId).join(','))
  }
  {
    // (9) When priority warrants (same tier, higher briefScore), a GSC brief reaches the front.
    const normalT1 = brf('elliptical trainer cleaning routine', { id: 'n1', kind: 'keyword_research', score: 0.30 })
    const gscT1 = brf('rowing machine noise reduction tips', { id: 'gsc:o2', kind: 'gsc', score: 0.80 })
    const ordered = prioritizeBriefsForSynthesis([normalT1, gscT1], { pillars })
    check('(9) a GSC brief CAN reach the first batch when its earned priority warrants', ordered[0].opportunityId === 'gsc:o2' && ordered[0].priority?.tier === 1)
  }
  {
    // ── FIX 2 — one 0–1 scale: within the same tier/family, ordering is pure briefScore DESC.
    // A GSC brief on the OLD 0–100 scale (0.78 → 78) would have leap-frogged both normals; on the
    // normalized scale it sits correctly between them. Proves no hidden GSC-source boost.
    const normalHi = brf('sauna blanket weight loss facts', { id: 'nh', kind: 'keyword_research', score: 0.82 })
    const gscMid = brf('sauna blanket temperature safety guide', { id: 'gsc:o3', kind: 'gsc', score: 0.78 })
    const normalLo = brf('sauna blanket cleaning steps', { id: 'nl', kind: 'keyword_research', score: 0.65 })
    const ordered = prioritizeBriefsForSynthesis([normalLo, gscMid, normalHi], { pillars })
    check('(FIX2) same tier/family: normal 0.82 > GSC 0.78 > normal 0.65 (one scale)', ordered.map((b) => b.opportunityId).join(',') === 'nh,gsc:o3,nl')
    check('(FIX2) GSC 0.78 does NOT win the batch over normal 0.82 (no source boost)', ordered[0].opportunityId === 'nh')
    check('(FIX2) GSC 0.78 outranks normal 0.65 on merit (earned, not boosted)', ordered.indexOf(gscMid) < ordered.indexOf(normalLo))
    check('(FIX2) all three share tier 1 (GSC earns no special tier)', ordered.every((b) => b.priority?.tier === 1))
  }
  {
    // (12) family round-robin remains active INSIDE a tier on the combined pool.
    const briefs = [
      brf('a info topic one', { id: 'i1', family: 'informational', score: 0.50 }),
      brf('b info topic two', { id: 'i2', family: 'informational', score: 0.49 }),
      brf('c comparison topic', { id: 'c1', family: 'comparison', score: 0.48 }),
    ]
    const ordered = prioritizeBriefsForSynthesis(briefs, { pillars })
    // round-robin: info, comparison, info (not info, info, comparison).
    check('(12) family round-robin active on the combined pool', ordered.map((b) => b.family).join(',') === 'informational,comparison,informational')
  }

  // ── FIX 1 — discovery deficit/skip arithmetic (the exact engine decision) ────
  const deficitDecision = (poolLen: number, gscNew: number, target: number) => { const combined = poolLen + gscNew; return { runs: combined < target, deficit: Math.max(0, target - combined) } }
  {
    const a = deficitDecision(7, 5, 12) // GSC fully fills the deficit
    check('(2)(3) normal 7 + GSC 5, target 12 → combined 12, discovery does NOT run', a.runs === false && a.deficit === 0)
    const b = deficitDecision(7, 2, 12) // GSC partially fills
    check('(4)(5) normal 7 + GSC 2, target 12 → combined 9, discovery deficit = 3', b.runs === true && b.deficit === 3)
  }

  // ── Source contracts (order + reuse + diagnostics wiring + flag-off) ────────
  const gen = read('lib/content/recommendations/generate-from-briefs.ts')
  check('(1) GSC integration runs BEFORE constrained discovery', gen.indexOf('integrateGscBriefs(') < gen.indexOf('CONSTRAINED DISCOVERY'))
  check('(7) no unprioritized GSC tail (old post-discovery push removed)', !/workingPool\.push\(\.\.\.gscIntegration\.gscBriefs\)/.test(gen))
  check('(8) combined pool re-uses prioritizeBriefsForSynthesis + buildBusinessPillars', /prioritizeBriefsForSynthesis\(\[\.\.\.pool, \.\.\.gscIntegration\.gscBriefs\], \{ pillars: buildBusinessPillars\(/.test(gen))
  const genCode = gen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('(2b) no GSC-specific priority tier introduced', !/gsc.*tier|tier.*gsc/i.test(genCode))
  check('(5) discovery deficit is computed from the combined workingPool', /const deficit = input\.targetCount - workingPool\.length/.test(gen) && /const workingPool = \[\.\.\.prioritizedPool\]/.test(gen))
  check('(6) discovery duplicate signatures include admitted GSC briefs (from workingPool)', /existingPoolSignatures: workingPool\.map/.test(gen))
  check('(13)(14)(15) flag-off / no-contribution → pool used unchanged (byte-identical branch)', /const prioritizedPool = gscContributed[\s\S]{0,320}\n\s*: pool/.test(gen))
  check('(16) consumedGscBriefIds derived from the real consumption map', /consumedGscBriefIds = workingPool\.filter\(\(b\) => b\.opportunityId\.startsWith\('gsc:'\) && consumptionByBriefId\.has/.test(gen))
  check('(17) acceptedGscBriefIds derived from accepted candidate outcomes', /acceptedGscBriefIds = candidateOutcomes\.filter\(\(o\) => o\.outcome === 'accepted' && \(o\.opportunityId \?\? ''\)\.startsWith\('gsc:'\)\)/.test(gen))
  check('(18) selected ≠ consumed (distinct fields carried)', /combinedPoolSizeBeforeDiscovery/.test(gen) && /consumedGscBriefCount/.test(gen))
  check('(20) paid-call cap unchanged (MAX_ROUNDS = 2)', /const MAX_ROUNDS = 2/.test(gen))
  check('(discoverySkip) skip-because-GSC flag set truthfully', /discoverySkippedBecauseGscFilledDeficit = gscInput\.enabled && pool\.length < input\.targetCount && workingPool\.length >= input\.targetCount/.test(gen))

  const gscBriefs = read('lib/content/recommendations/gsc-briefs.ts')
  check('(19) merged evidence distinguished from a new GSC-origin brief', /mergedIntoExistingCount\+\+/.test(gscBriefs) && /addedAsNewBriefCount = selected\.length/.test(gscBriefs))
  // FIX 1 — the 0–100 → 0–1 mapping is applied to BOTH confidence and briefScore (one scale).
  check('(FIX1) normalizedOpportunityScore = clamp(0..100)/100 (4-dp)', /Math\.min\(100, Math\.max\(0, c\.opportunityScore\)\) \/ 100/.test(gscBriefs) && /\* 10000\) \/ 10000/.test(gscBriefs))
  check('(FIX1) mapped score used for both confidence and briefScore', /confidence: normalizedOpportunityScore/.test(gscBriefs) && /briefScore: normalizedOpportunityScore/.test(gscBriefs))
  check('(FIX1) raw opportunityScore is NOT assigned to briefScore', !/briefScore: c\.opportunityScore/.test(gscBriefs))
  // FIX 3 — selectedBriefIds holds the matched normal brief id on merge + deterministic dedup.
  check('(FIX3) merge pushes the matched normal brief id (not the raw GSC id)', /diagnostics\.selectedBriefIds\.push\(match\.opportunityId\)/.test(gscBriefs))
  check('(FIX3) selectedBriefIds deduped first-seen', /diagnostics\.selectedBriefIds = Array\.from\(new Set\(diagnostics\.selectedBriefIds\)\)/.test(gscBriefs))
  // FIX 4 — mergedGscEvidence populated at integration; consumed/accepted filled at synthesis.
  check('(FIX4) integration records mergedGscEvidence with raw gscOpportunityId + briefId', /mergedGscEvidence\.push\(\{ gscOpportunityId: c\.opportunityId, briefId: match\.opportunityId, consumed: false, accepted: false \}\)/.test(gscBriefs))
  check('(FIX4) synthesis fills mergedGscEvidence consumed/accepted from consumption map + outcomes', /mergedGscEvidence = \(snapshot\.gscInput\.mergedGscEvidence[\s\S]{0,240}consumed: consumptionByBriefId\.has\(rec\.briefId\)[\s\S]{0,240}accepted: candidateOutcomes\.some\(\(o\) => o\.opportunityId === rec\.briefId && o\.outcome === 'accepted'\)/.test(gen))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
