/**
 * Recovery-tier + Hebrew-joining + keyword-cache QA (P0 Parts C/H/I) — offline,
 * domain-neutral. Proves the tier control flow (Tier 1 success skips 2/3; insufficient
 * escalates; discovery is last; typed no_safe_opportunities only when truly empty),
 * that Hebrew evidence from different sources joins into ONE cluster despite proclitic
 * prefixes / punctuation / final forms, that the real keyword_research_cache shape is
 * parsed without fabricating demand, and that the discovery prompt never claims
 * unknown-volume demand.
 */
import { runRecoveryTiers, TIER_PLANS, type TierPlan } from '../recommendations/recovery-tiers'
import { buildEvidenceClusters, flattenKeywordResearchCache, clustersForTier, type EvidenceInput } from '../recommendations/evidence-cluster'
import { buildDiscoveryPrompt, type DiscoveryEvidence } from '../recommendations/opportunity-synthesis'
import type { ProjectContext } from '../recommendations/prompt-guidance'
import type { TopicSuggestion } from '../recommendations/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const sug = (kw: string, confidenceLevel: TopicSuggestion['confidenceLevel'], discovery = false): TopicSuggestion => ({
  id: `x:${kw}`, title: kw, primaryKeyword: kw, secondaryKeywords: [], searchIntent: 'informational',
  recommendedWordCount: 1000, angle: '', suggestedInternalLinks: [], source: 'hybrid', suggestionReason: '',
  suggestionScore: 0.7, confidenceLevel, discoveryGenerated: discovery,
})
const kk = (s: TopicSuggestion) => s.primaryKeyword.trim().toLowerCase()

async function main() {
  console.log('A) recovery-tier control flow (C / M1–M4, M9, M10)')
  {
    // M1 — Tier 1 alone meets the floor → Tiers 2 & 3 never run.
    const t1 = await runRecoveryTiers({
      targetFloor: 5, keyKey: kk,
      runTier: async (p: TierPlan) => p.tier === 1 ? Array.from({ length: 6 }, (_, i) => sug(`t1 kw ${i}`, 'high_confidence')) : (() => { throw new Error('tier ' + p.tier + ' must NOT run') })(),
    })
    check('M1. Tier 1 success does NOT run Tier 2/3', t1.tiersRun.join(',') === '1' && t1.recoveryTierUsed === 1 && t1.fallbackReason === null)
    check('M1. Tier 1 suggestions kept at high_confidence', t1.suggestions.length === 6 && t1.suggestions.every((s) => s.confidenceLevel === 'high_confidence'))

    // M2 — Tier 1 too few → Tier 2 runs and tops up; Tier 3 not needed.
    const t2 = await runRecoveryTiers({
      targetFloor: 5, keyKey: kk,
      runTier: async (p: TierPlan) => p.tier === 1 ? [sug('a', 'high_confidence'), sug('b', 'high_confidence')]
        : p.tier === 2 ? [sug('c', 'medium_confidence'), sug('d', 'medium_confidence'), sug('e', 'medium_confidence')]
          : (() => { throw new Error('tier 3 must NOT run') })(),
    })
    check('M2. Tier 1 insufficient → Tier 2 runs', t2.tiersRun.join(',') === '1,2' && t2.recoveryTierUsed === 2)
    check('M2. fallbackReason=tier_1_insufficient, discovery not used', t2.fallbackReason === 'tier_1_insufficient' && t2.discoveryUsed === false)
    check('M2. mixed high + medium confidence accumulated', t2.suggestions.length === 5 && t2.suggestions.filter((s) => s.confidenceLevel === 'medium_confidence').length === 3)

    // M3 — Tiers 1 & 2 insufficient → Tier 3 discovery runs.
    const t3 = await runRecoveryTiers({
      targetFloor: 5, keyKey: kk,
      runTier: async (p: TierPlan) => p.tier === 1 ? [sug('a', 'high_confidence')] : p.tier === 2 ? [sug('b', 'medium_confidence')] : [sug('c', 'discovery', true), sug('d', 'discovery', true)],
    })
    check('M3. Tier 2 insufficient → Tier 3 runs', t3.tiersRun.join(',') === '1,2,3' && t3.recoveryTierUsed === 3)
    check('M3/M4. discovery used + labelled discovery', t3.discoveryUsed === true && t3.suggestions.some((s) => s.confidenceLevel === 'discovery' && s.discoveryGenerated))
    check('M10. weak evidence still yields (fewer) suggestions, not zero', t3.suggestions.length === 4 && t3.fallbackReason === 'tier_2_insufficient')

    // typed empty — all tiers dry → no_safe_opportunities, NEVER legacy.
    const empty = await runRecoveryTiers({ targetFloor: 5, keyKey: kk, runTier: async () => [] })
    check('all tiers dry → no_safe_opportunities (recoveryTierUsed=3, discovery attempted)', empty.suggestions.length === 0 && empty.fallbackReason === 'no_safe_opportunities' && empty.recoveryTierUsed === 3 && empty.discoveryUsed === true)

    // cross-tier dedup — a broader tier never re-emits an earlier tier's keyword.
    const dup = await runRecoveryTiers({
      targetFloor: 10, keyKey: kk,
      runTier: async (p: TierPlan) => p.tier === 3 ? [] : [sug('same kw', p.tier === 1 ? 'high_confidence' : 'medium_confidence')],
    })
    check('M9. cross-tier duplicate keyword collapsed to one', dup.suggestions.length === 1 && dup.suggestions[0].confidenceLevel === 'high_confidence')

    check('C. tier plans are strict→broadened→discovery (never legacy)', TIER_PLANS.map((p) => p.tier).join(',') === '1,2,3' && TIER_PLANS[2].discovery === true && !TIER_PLANS.some((p) => (p as { legacy?: boolean }).legacy))
  }

  console.log('B) Hebrew-aware evidence joining across sources (H / M12, M13)')
  {
    // Keyword research + tracked keyword + entity share a Hebrew theme despite a
    // proclitic prefix (ל) and punctuation — they must land in ONE cluster.
    const input: EvidenceInput = {
      keywordResearch: [{ query: 'משלוח פרחים!', volume: 300 }],
      trackedKeywords: ['פרחים'],
      projectFocus: [],
      entities: [{ name: 'זר לחתונה', type: 'product', url: '/p/1' }, { name: 'זר פרחים מעוצב', type: 'product', url: '/p/2' }],
      existingCoverage: [],
    }
    const clusters = buildEvidenceClusters(input)
    // The shared theme token is final-form-normalized (פרחים→פרחימ); assert the JOIN
    // structurally — one cluster pulls the keyword-research query + tracked keyword +
    // entity together — rather than depending on the exact normalized spelling.
    const flowers = clusters.find((c) => c.keyword_research_queries.length > 0 && c.tracked_keywords.length > 0 && c.commercial_entities.length > 0)
    check('M12. Hebrew keyword-research + tracked + entity join into ONE cluster', !!flowers)
    check('M12. the joined cluster combines multiple sources', !!flowers && flowers.source_composition.length >= 2)
    check('M13. proclitic prefix ל does not block joining (לחתונה↔חתונה)', (() => {
      const heb: EvidenceInput = { keywordResearch: [{ query: 'חתונה', volume: 50 }], trackedKeywords: [], projectFocus: [], entities: [{ name: 'זר לחתונה', type: 'product', url: '/p/1' }], existingCoverage: [] }
      return buildEvidenceClusters(heb).some((c) => c.canonical_topic === 'חתונה')
    })())
    check('H. does NOT over-merge genuinely different Hebrew words', (() => {
      // "מים" (water) must not merge into "ים" (sea): prefix strip requires remainder >= 3.
      const x: EvidenceInput = { keywordResearch: [{ query: 'מים מינרלים', volume: 10 }], trackedKeywords: ['ים תיכון'], projectFocus: [], entities: [], existingCoverage: [] }
      return !buildEvidenceClusters(x).some((c) => c.canonical_topic === 'ים')
    })())
  }

  console.log('C) real keyword_research_cache shape parsed, demand not fabricated (I)')
  {
    const rows = [
      { results_json: [{ keyword: 'ord kw a', avgMonthlySearches: 720 }, { keyword: 'ord kw b', avgMonthlySearches: null }] },
      { results_json: [{ keyword: '', avgMonthlySearches: 5 }, { keyword: 'ord kw c', avgMonthlySearches: 0 }] },
      { results_json: 'not-an-array' },
    ]
    const flat = flattenKeywordResearchCache(rows)
    check('I. parses the real {keyword, avgMonthlySearches}[] cache shape', flat.length === 3 && flat[0].query === 'ord kw a' && flat[0].volume === 720)
    check('I. missing volume stays null (not fabricated to a number)', flat.find((f) => f.query === 'ord kw b')?.volume === null)
    check('I. zero volume stays 0 (not invented)', flat.find((f) => f.query === 'ord kw c')?.volume === 0)
    check('I. empty keyword + non-array row are skipped safely', !flat.some((f) => f.query === ''))
  }

  console.log('D) discovery prompt never claims fabricated demand (M11) + tier gating')
  {
    const ctx: ProjectContext = { projectName: 'X', domain: 'x.example', language: 'he', primaryProjectFocus: 'flowers', secondaryProjectAreas: [], ownedCategories: [], existingTopics: [] }
    const ev: DiscoveryEvidence = {
      projectFocus: ['flowers'], trackedKeywords: ['bouquet'],
      demandQueries: [{ q: 'real demand kw', v: 500 }, { q: 'unknown demand kw', v: null }, { q: 'zero demand kw', v: 0 }],
      commercialEntities: [{ name: 'wedding bouquet', type: 'product' }],
      existingCoverage: ['existing guide'],
    }
    const prompt = buildDiscoveryPrompt(ev, ctx, 'Hebrew', 2026, 10)
    check('M11. real-demand query is offered as demand', /real demand kw/.test(prompt) && /WITH real demand/.test(prompt))
    check('M11. unknown/zero volume queries are context-only (do NOT claim volume)', /do NOT claim volume/.test(prompt) && /unknown demand kw/.test(prompt) && /zero demand kw/.test(prompt))
    check('M11. commercial entity is a LINK TARGET, never a primary keyword', /never a primary keyword/.test(prompt) && /wedding bouquet/.test(prompt))
    check('M4. discovery prompt asks for broad user-need opportunity types', /questions|comparisons|troubleshooting/i.test(prompt))
  }

  console.log('E) tier-class selection (Tier 1 = high only, Tier 2 = high+medium)')
  {
    const input: EvidenceInput = {
      keywordResearch: [{ query: 'demand alpha one', volume: 900 }, { query: 'demand alpha two', volume: 400 }], // high (demand>0)
      trackedKeywords: ['beta topic'], projectFocus: ['beta topic area'], // medium theme (no demand)
      entities: [], existingCoverage: [],
    }
    const clusters = buildEvidenceClusters(input)
    const high = clustersForTier(clusters, 1)
    const all = clustersForTier(clusters, 2)
    check('M15/tier. Tier 1 admits only high-confidence clusters', high.every((c) => c.tier_class === 'high') && high.length >= 1)
    check('tier. Tier 2 broadens to include medium clusters', all.length >= high.length)
    check('tier. a zero-demand project-only theme is a MEDIUM cluster', clusters.some((c) => c.canonical_topic.includes('beta') && c.tier_class === 'medium'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
