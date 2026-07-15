/**
 * Production opportunity-first generation-path QA (Parts B/C/D/E/F) — offline,
 * domain-neutral, MULTI-INDUSTRY fixtures. Proves the ACTUAL production pipeline
 * pieces that replace source-first fan-out:
 *   B. cross-source EvidenceCluster builder (one cluster combines many sources;
 *      never one cluster per product; entities-alone never form a cluster).
 *   C. source ALLOCATION has no fixed per-source quota — all clusters ranked
 *      together; source_label reflects evidence composition, not a generation slot.
 *   D. keyword-research demand is part of cluster ranking (real volume lifts a
 *      cluster; zero volume is NOT fabricated into demand).
 *   E. entity grouping lands sibling entities in ONE cluster, not N clusters.
 *   F. internal-link role mapper: typed roles + reasons + scores; the primary
 *      commercial target is never demoted for a longer candidate and never appears
 *      again as a supporting link; unrelated is dropped; URLs de-duplicated.
 * Uses generic industries (audio, garden, ceramics) — no single-store bias.
 */
import {
  buildEvidenceClusters, rankClusters, selectClustersWithinBudget,
  type EvidenceInput,
} from '../recommendations/evidence-cluster'
import { mapLinkRoles, orderedLinksForOpportunity, type LinkCandidateEntity } from '../recommendations/link-role-mapper'
import { parseOpportunities } from '../recommendations/opportunity-synthesis'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  console.log('A) cross-source EvidenceCluster builder (B/C/E)')
  {
    const input: EvidenceInput = {
      keywordResearch: [
        { query: 'wireless headphones review', volume: 800 },
        { query: 'wireless earbuds comparison', volume: 500 },
        { query: 'garden hose expandable', volume: 300 },
        { query: 'garden hose reel', volume: 200 },
      ],
      trackedKeywords: ['wireless audio'],
      projectFocus: ['wireless audio gear'],
      entities: [
        { name: 'wireless headphones pro', type: 'product', url: '/p/wh' },
        { name: 'expandable garden hose 25ft', type: 'product', url: '/p/gh1' },
        { name: 'heavy garden hose 50ft', type: 'product', url: '/p/gh2' },
        // Two sibling entities sharing a theme but with NO demand/project signal.
        { name: 'ceramic mug blue', type: 'product', url: '/p/m1' },
        { name: 'ceramic mug red', type: 'product', url: '/p/m2' },
      ],
      existingCoverage: [{ title: 'wireless headphones buying guide', kind: 'article' }],
    }
    const clusters = buildEvidenceClusters(input)
    const byTheme = new Map(clusters.map((c) => [c.canonical_topic, c]))
    const wireless = byTheme.get('wireless')
    const garden = byTheme.get('garden')

    check('B. clusters are built from shared themes (wireless + garden)', !!wireless && !!garden)
    check('B/C. a single cluster COMBINES multiple sources → source_label "combined"',
      !!wireless && wireless.source_composition.length >= 3 && wireless.source_label === 'combined',
      wireless && `${wireless.source_label}/${wireless.source_composition.join(',')}`)
    check('B. demand_volume aggregates keyword-research volume (800+500=1300)', wireless?.demand_volume === 1300, String(wireless?.demand_volume))
    check('B. missing_coverage FALSE when an existing article already covers the theme', wireless?.missing_coverage === false)
    check('B. missing_coverage TRUE when demand exists but no article covers it', garden?.missing_coverage === true)
    check('B/E. NOT one cluster per product — 2 garden products share ONE cluster', garden?.commercial_entities.length === 2, String(garden?.commercial_entities.length))
    check('B. entities-ALONE (ceramic mug, no demand/project) never form a cluster', !byTheme.has('ceramic') && !byTheme.has('mug'))
    check('B. cluster carries its keyword-research queries as evidence', (wireless?.keyword_research_queries.length ?? 0) === 2)
  }

  console.log('B) source ALLOCATION — global ranking, no fixed per-source quota (C)')
  {
    const input: EvidenceInput = {
      keywordResearch: [
        { query: 'wireless headphones review', volume: 800 },
        { query: 'wireless earbuds comparison', volume: 500 },
        { query: 'garden hose expandable', volume: 300 },
        { query: 'garden hose reel', volume: 200 },
      ],
      trackedKeywords: ['wireless audio'],
      projectFocus: ['wireless audio gear'],
      entities: [{ name: 'wireless headphones pro', type: 'product', url: '/p/wh' }, { name: 'expandable garden hose 25ft', type: 'product', url: '/p/gh1' }, { name: 'heavy garden hose 50ft', type: 'product', url: '/p/gh2' }],
      existingCoverage: [],
    }
    const ranked = rankClusters(buildEvidenceClusters(input))
    check('C. rankClusters is sorted strongest-first (score desc)', ranked.every((c, i) => i === 0 || ranked[i - 1].score >= c.score))
    check('C. the strongest cluster wins globally regardless of source (demand-led wireless first)', ranked[0]?.canonical_topic === 'wireless')
    check('C. selectClustersWithinBudget honors the cluster cap (global, not per-source)', selectClustersWithinBudget(ranked, 1).length === 1)
    check('C. source_label reflects evidence composition, not a generation slot', ranked.every((c) => ['keyword_research', 'project_data', 'site_scan', 'combined'].includes(c.source_label)))
  }

  console.log('C) keyword-research demand drives ranking, not fabricated (D)')
  {
    // Two independent themes with NO shared tokens: one has real volume, one has 0.
    const input: EvidenceInput = {
      keywordResearch: [
        { query: 'quokkarun apples', volume: 5000 },
        { query: 'quokkarun bananas', volume: 5000 },
        { query: 'narwhaljog cherries', volume: 0 },
        { query: 'narwhaljog dates', volume: null },
      ],
      trackedKeywords: [], projectFocus: [], entities: [], existingCoverage: [],
    }
    const clusters = buildEvidenceClusters(input)
    const ranked = rankClusters(clusters)
    const demand = new Map(clusters.map((c) => [c.canonical_topic, c.demand_volume]))
    check('D. real keyword volume produces demand (quokkarun=10000)', demand.get('quokkarun') === 10000)
    check('D. zero/null volume is NOT fabricated into demand (narwhaljog=0)', demand.get('narwhaljog') === 0)
    check('D. the demand-backed cluster outranks the zero-demand one', ranked[0]?.canonical_topic === 'quokkarun')
    check('D. a zero-demand cluster still forms (gate not lowered, demand not invented)', demand.has('narwhaljog'))
  }

  console.log('D) internal-link role mapper — typed roles + primary discipline + dedup (F)')
  {
    const oppKeyword = 'best wireless headphones for running'
    const oppTitle = 'wireless running headphones guide'
    const candidates: LinkCandidateEntity[] = [
      { url: '/p/wireless-running-headphones', title: 'wireless running headphones', type: 'product' }, // best commercial → primary
      { url: '/c/wireless-headphones', title: 'wireless headphones', type: 'category' },                // related commercial → secondary
      { url: '/blog/wireless-running-guide', title: 'wireless running guide', type: 'post' },           // informational → supporting
      { url: '/p/garden-hose', title: 'garden hose', type: 'product' },                                 // unrelated → dropped
      { url: '/p/wireless-running-headphones/', title: 'dup slash', type: 'product' },                  // dup URL (trailing slash)
    ]
    const mapped = mapLinkRoles(oppKeyword, oppTitle, candidates)
    const byUrl = new Map(mapped.assignments.map((a) => [a.url, a]))

    check('F. a primary commercial target is chosen (highest-overlap commercial page)', mapped.primaryTarget?.url === '/p/wireless-running-headphones')
    check('F. primary is NOT demoted to supporting merely for a longer candidate', mapped.primaryTarget?.role === 'primary_commercial_target')
    check('F. every assignment carries a typed role + reason + numeric score', mapped.assignments.every((a) => !!a.role && !!a.reason && typeof a.score === 'number'))
    check('F. related commercial page → secondary_commercial_target', byUrl.get('/c/wireless-headphones')?.role === 'secondary_commercial_target')
    check('F. related informational post → supporting_informational_link', byUrl.get('/blog/wireless-running-guide')?.role === 'supporting_informational_link')
    check('F. an unrelated candidate is dropped (no target beats a wrong target)', !mapped.assignments.some((a) => a.url === '/p/garden-hose'))
    check('F. URLs are de-duplicated (trailing-slash dup collapses)', mapped.assignments.filter((a) => a.url.replace(/\/+$/, '') === '/p/wireless-running-headphones').length === 1)

    const ordered = orderedLinksForOpportunity(mapped)
    check('F. ordered links put the primary target FIRST', ordered[0]?.url === '/p/wireless-running-headphones' && ordered[0]?.role === 'primary_commercial_target')
    check('F. the primary URL never reappears as a supporting link (excluded)', ordered.filter((l) => l.url === '/p/wireless-running-headphones').length === 1)
    check('F. ordered links are URL-unique', ordered.length === new Set(ordered.map((l) => l.url.replace(/\/+$/, ''))).size)
  }

  console.log('E) defensive opportunity parse (production synthesis contract)')
  {
    const good = JSON.stringify({ topics: [{ title: 'A', primaryKeyword: 'a kw', secondaryKeywords: ['x'], intent: 'informational', reason: 'r' }, { title: '', primaryKeyword: 'skip' }, { title: 'B', primaryKeyword: '' }] })
    const parsed = parseOpportunities(good)
    check('parse keeps only rows with title + primaryKeyword', parsed.length === 1 && parsed[0].title === 'A')
    check('parse preserves secondaryKeywords + intent + reason', parsed[0].secondaryKeywords[0] === 'x' && parsed[0].intent === 'informational' && parsed[0].reason === 'r')
    const noisy = 'here you go:\n```json\n' + JSON.stringify({ topics: [{ title: 'C', primaryKeyword: 'c kw' }] }) + '\n```'
    check('parse extracts JSON embedded in prose/fences', parseOpportunities(noisy).length === 1)
    check('parse returns [] on non-JSON garbage (never throws)', parseOpportunities('not json at all').length === 0)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
