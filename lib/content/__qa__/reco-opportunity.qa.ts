/**
 * Content-opportunity model QA — offline, domain-neutral, MULTI-INDUSTRY fixtures.
 * Proves the deterministic backbone: multi-signal cannibalization (REJECT/ALLOW/
 * REVIEW), the article-worthiness gate + typed reasons, entity grouping into broader
 * opportunities, source-only expansion rejection, and cross-project isolation. Uses
 * generic industries (electronics, SaaS, garden, clinic) — no single-store bias.
 */
import { assessCannibalization, evaluateArticleWorthiness, distinctivenessScore, OPPORTUNITY_TYPES, type ExistingPageSignal } from '../recommendations/opportunity'
import { groupEntitiesByTheme } from '../recommendations/entity-grouping'
import { recommendationGuidance } from '../recommendations/prompt-guidance'
import { domainFlags } from '../recommendations/domain-flags'
import { runBudget } from '../recommendations/reco-cost'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const page = (name: string, pageType: ExistingPageSignal['pageType'] = 'product', intent?: ExistingPageSignal['intent']): ExistingPageSignal => ({ name, pageType, intent })
const worthy = (primaryKeyword: string, title: string, pages: ExistingPageSignal[], extra: Partial<Parameters<typeof evaluateArticleWorthiness>[0]> = {}) =>
  evaluateArticleWorthiness({ primaryKeyword, title, existingPages: pages, hasEvidence: true, businessRelevant: true, ...extra })

async function main() {
  console.log('A) exact + near-exact commercial ownership (M1/M2/M12/M13/M14)')
  {
    const pages = [page('sony wh-1000xm5 headphones'), page('standing desk converter', 'category'), page('lawn mower cordless', 'product')]
    check('M1. exact commercial keyword → REJECT', assessCannibalization('sony wh-1000xm5 headphones', 'commercial', pages).outcome === 'reject')
    check('M2. entity + generic only ("… best/price") → REJECT (weak_entity_modifier)', worthy('sony wh-1000xm5 headphones best price', 'buy it', pages).rejection_reason === 'weak_entity_modifier')
    check('M12/M13/M14. exact category/product ownership → typed exact reason', worthy('standing desk converter', 'the converter', pages).rejection_reason === 'exact_existing_keyword_owner')
    check('M9. source-only expansion (only entity+generic tokens, rearranged) → rejected', worthy('cordless lawn mower', 'x', [page('lawn mower cordless')]).rejection_reason === 'source_only_entity_expansion' || worthy('cordless lawn mower', 'x', [page('lawn mower cordless')]).rejection_reason === 'weak_entity_modifier')
  }

  console.log('B) genuine informational long-tails survive (M3/M5/M7)')
  {
    const pages = [page('sony wh-1000xm5 headphones'), page('standing desk converter', 'category')]
    check('M3. distinct how-to long-tail → ALLOW', assessCannibalization('how to reduce ear fatigue with over ear headphones', 'informational', pages).outcome === 'allow_distinct')
    check('M3. worthiness passes for a distinct informational long-tail', worthy('how to reduce ear fatigue with over ear headphones', 'ear fatigue guide: causes and fixes', pages, { intent: 'informational', secondaryKeywords: ['headphone comfort'] }).ok)
    check('M5. care/maintenance long-tail survives', worthy('how to clean and maintain a standing desk motor', 'desk motor maintenance', pages, { secondaryKeywords: ['desk care'] }).ok)
    check('M7. question with distinct need survives', worthy('is a standing desk good for lower back pain', 'standing desk and back pain', pages, { intent: 'informational', secondaryKeywords: ['back pain'] }).ok)
  }

  console.log('C) cannibalization REVIEW (ambiguous) vs ALLOW/REJECT (G)')
  {
    const pages = [page('project management software', 'category', 'commercial')]
    // commercial page + commercial candidate + single weak modifier, high overlap → REVIEW.
    const r = assessCannibalization('project management software tool', 'commercial', pages)
    check('G. commercial overlap + single modifier → REVIEW (not auto reject/allow)', r.outcome === 'review')
    // informational angle on the same entity → ALLOW.
    check('G. informational angle on same entity → ALLOW', assessCannibalization('how to choose project management software for remote teams', 'informational', pages).outcome === 'allow_distinct')
    check('G. exact → REJECT', assessCannibalization('project management software', 'commercial', pages).outcome === 'reject')
    check('G. does NOT reject every phrase containing the entity', assessCannibalization('project management software onboarding checklist', 'informational', pages).outcome !== 'reject')
  }

  console.log('D) entity grouping into ONE broader opportunity (M4/M6/M10/H)')
  {
    // Several products sharing a theme token → one group (garden hoses of many types).
    const entities = [
      { name: 'expandable garden hose 25ft' }, { name: 'heavy duty garden hose 50ft' },
      { name: 'flexible garden hose 100ft' }, { name: 'ceramic plant pot large' },
    ]
    const { groups, ungrouped } = groupEntitiesByTheme(entities, 2)
    check('M10/H. multiple entities sharing a theme → ONE group', groups.length >= 1 && groups[0].members.length >= 3)
    check('H. the group theme is a shared token (garden/hose)', groups.some((g) => g.themeTokens.some((t) => /garden|hose/.test(t))))
    check('H. an entity with a unique theme stays ungrouped (distinct demand kept)', ungrouped.some((e) => /ceramic plant pot/.test(e.name)))
    check('H. does NOT force a group when nothing is shared', groupEntitiesByTheme([{ name: 'alpha widget' }, { name: 'beta gadget' }], 2).groups.length === 0)
  }

  console.log('E) evidence + relevance + depth gates (F) and isolation (M8/M16/M17)')
  {
    const pages = [page('crm platform', 'category')]
    check('M8/F4. no evidence → unsupported_by_evidence', worthy('emerging crm trends discussion', 'trends', pages, { hasEvidence: false }).rejection_reason === 'unsupported_by_evidence')
    check('F5. not business-relevant → low_business_relevance', worthy('unrelated cooking recipe idea', 'recipe', pages, { businessRelevant: false }).rejection_reason === 'low_business_relevance')
    check('F3. too-thin bare single-word term → insufficient_content_depth', worthy('gardening', 'gardening', pages).rejection_reason === 'insufficient_content_depth')
    check('M16. cross-project isolation — no existing pages → nothing owned', evaluateArticleWorthiness({ primaryKeyword: 'sony wh-1000xm5 headphones', title: 'x', existingPages: [], hasEvidence: true, businessRelevant: true }).cannibalization.outcome !== 'reject')
    check('M17. distinctiveness of pure expansion is ~0, of real long-tail is high', distinctivenessScore(['crm', 'platform'], pages) < 0.2 && distinctivenessScore(['how', 'to', 'migrate', 'from', 'legacy', 'crm'], pages) > 0.5)
  }

  console.log('F) prompt + types + cost (D/E/M20)')
  {
    const g = recommendationGuidance('English', 2026, 15)
    check('E/D. prompt is opportunity-first with source roles', /OPPORTUNITY-FIRST:/.test(g) && /keyword-research signals for real demand/.test(g) && /never one article per scanned entity/.test(g))
    check('domain-neutral prompt (no injected industry flags)', (() => { const f = domainFlags(g); return !f.perfume && !f.lighting && !f.pet && !f.freelancer })())
    check('opportunity types are domain-neutral, "product article" is NOT one', !(OPPORTUNITY_TYPES as readonly string[]).includes('product_article') && OPPORTUNITY_TYPES.includes('comparison'))
    check('M20. cost/model ceilings unchanged (Flash-only 4 calls / $0.15)', (() => { const b = runBudget('standard', 15); return b.maxModelCallsPerRun === 4 && b.maxEstimatedCostUsd === 0.15 })())
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
