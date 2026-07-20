/**
 * SOFT synthesis-batch priority (Best Gifts follow-up) — non-destructive tiering.
 *
 * Replaces the hard product-admission rejection with a pure deterministic REORDER at the
 * pool→synthesis boundary. No brief is added or removed: every brief that passes the
 * existing ownership/coverage/pending/semantic-duplicate gates stays in the pool. Order:
 * Tier 0 (pillar-aligned distinct need) → Tier 1 (other independent article) → Tier 2
 * (product-shaped/commercial), each ordered by the existing briefScore desc → opportunityId,
 * with the existing family round-robin applied INSIDE each tier. Pillars come only from
 * owned NON-product evidence (tracked/category/service/homepage/corroborated focus).
 */
import { buildBriefPool, prioritizeBriefsForSynthesis, buildBusinessPillars } from '../recommendations/opportunity-brief'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
type Opts = Partial<Parameters<typeof buildBriefPool>[0]>
const kr = (qs: string[]) => qs.map((q, i) => ({ query: q, volume: 500 - i * 7 }))
const base = (o: Opts = {}): Parameters<typeof buildBriefPool>[0] => ({
  language: 'he', keywordResearch: [], trackedKeywords: [], projectFocus: [], entities: [],
  publishedCoverage: [], pendingExactKeys: new Set<string>(), pendingSignatures: [],
  isOwnedByEntity: () => false, isCoveredByContent: () => false,
  domainTypeWords: new Set<string>(), attributeTokens: new Set<string>(), ...o,
})
const subs = (r: ReturnType<typeof buildBriefPool>) => r.pool.map((b) => b.subject)
const rej = (r: ReturnType<typeof buildBriefPool>) => r.diagnostics.rejected_by_reason
const bp = (r: ReturnType<typeof buildBriefPool>) => r.diagnostics.brief_priority ?? []
const tierOf = (r: ReturnType<typeof buildBriefPool>, subject: string) => bp(r).find((p) => p.subject === subject)?.tier
const rankOf = (r: ReturnType<typeof buildBriefPool>, subject: string) => bp(r).find((p) => p.subject === subject)?.finalSynthesisRank ?? -1

function main() {
  console.log('A) BROAD ECOMMERCE PILLAR — recipient long-tails Tier 0, products/store/delivery Tier 2')
  {
    const gifts = ['מתנות לגבר', 'מתנות לאישה', 'מתנות לילדים', 'מתנות לעסקים', 'מתנות לסבא', 'מתנות לאמא בת 60']
    const all = [...gifts, 'חנות מתנות', 'משלוח מתנות', 'מכונת סוכר ביתית', 'גלובוס כדור הארץ']
    const r = buildBriefPool(base({ keywordResearch: kr(all), entities: [{ name: 'מתנות', url: '/c/gifts', type: 'category' }, { name: 'מכונת סוכר ביתית מקצועית', url: '/p/1', type: 'product' }, { name: 'גלובוס כדור הארץ מואר', url: '/p/2', type: 'product' }] }))
    check('A. all 10 distinct candidates REMAIN in the pool (no hard rejection)', all.every((q) => subs(r).includes(q)) && r.pool.length === 10)
    check('A. no subject_head_cap and no product_entity_support_only rejection', !('subject_head_cap' in rej(r)) && !('product_entity_support_only' in rej(r)))
    check('A. the six recipient/audience needs are Tier 0', gifts.every((g) => tierOf(r, g) === 0))
    check('A. חנות מתנות and משלוח מתנות are NOT Tier 0 (local-commercial)', tierOf(r, 'חנות מתנות') !== 0 && tierOf(r, 'משלוח מתנות') !== 0)
    check('A. bare product candidates are Tier 2 (strongly product-affiliated)', tierOf(r, 'מכונת סוכר ביתית') === 2 && tierOf(r, 'גלובוס כדור הארץ') === 2)
    const maxTier0 = Math.max(...gifts.map((g) => rankOf(r, g)))
    const minTier2 = Math.min(rankOf(r, 'מכונת סוכר ביתית'), rankOf(r, 'גלובוס כדור הארץ'), rankOf(r, 'חנות מתנות'), rankOf(r, 'משלוח מתנות'))
    check('A. every Tier-0 candidate ranks before every Tier-2 candidate', maxTier0 < minTier2, `maxT0=${maxTier0} minT2=${minTier2}`)
  }

  console.log('B) FALSE-POSITIVE REGRESSION — מארזים למשלוח stays in the pool, never product-rejected')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['מארזים למשלוח']), entities: [{ name: 'מארז כוסות וויסקי', url: '/p/1', type: 'product' }] }))
    check('B. candidate remains in the pool; not rejected because of the product', subs(r).includes('מארזים למשלוח') && !('product_entity_support_only' in rej(r)))
    check('B. productAffinity is FALSE (single shared token מארז never qualifies)', bp(r).find((p) => p.subject === 'מארזים למשלוח')?.productAffinity === false)
  }

  console.log('C) INDEPENDENT PRODUCT-RELATED NEED — question outranks bare product; product preserved')
  {
    const bare = buildBriefPool(base({ keywordResearch: kr(['מנורת פלזמה']), entities: [{ name: 'מנורת פלזמה כדור חשמלי RGB', url: '/p/1', type: 'product' }] }))
    check('C. bare product phrase remains eligible and is Tier 2 (product-affine)', subs(bare).includes('מנורת פלזמה') && tierOf(bare, 'מנורת פלזמה') === 2)
    const q = buildBriefPool(base({ keywordResearch: kr(['איך פועלת מנורת פלזמה', 'מנורת שולחן']), entities: [{ name: 'מנורת פלזמה כדור חשמלי RGB', url: '/p/1', type: 'product' }] }))
    check('C. the independent question is a higher tier (0/1) than a bare product', (tierOf(q, 'איך פועלת מנורת פלזמה') ?? 2) < 2)
    check('C. an admitted product-related article keeps the product in relatedEntities', (q.pool.find((b) => b.subject === 'איך פועלת מנורת פלזמה')?.relatedEntities ?? []).some((e) => e.type === 'product'))
    // NOTE: bare phrase + "איך פועלת …" together collapse via the FROZEN semantic-dup — an
    // EXISTING blocker, not the product rule; here they are tested apart to show eligibility.
  }

  console.log('D) NARROW SERVICE — brand variants still collapse; distinct needs separate; no product logic')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['תיקון ניאגרה סמויה jomo', 'תיקון ניאגרה סמויה oli', 'תיקון ניאגרה סמויה פלסאון', 'נזילה באסלה', 'מצוף ניאגרה', 'כפתור ניאגרה', 'החלפת ניאגרה']), entities: [{ name: 'ניאגרה סמויה', url: '/c/n', type: 'category' }] }))
    check('D. brand variants still collapse via semantic-dup (2 rejected), no product rule used', (rej(r).brief_semantic_duplicate ?? 0) === 2 && !('product_entity_support_only' in rej(r)))
    check('D. distinct problem/task needs remain separate in the pool', ['מצוף ניאגרה', 'כפתור ניאגרה', 'החלפת ניאגרה', 'נזילה באסלה'].every((q) => subs(r).includes(q)))
  }

  console.log('E) FASHION — relevant briefs Tier 0/1; off-domain sport/Ronaldo get NO pillar priority')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['בגדי נשים אונליין', 'שמלות כלה יד שנייה', 'איך לשלב בגד גוף', 'sport live 365', 'ronaldo messi']), entities: [{ name: 'בגדי נשים', url: '/c/women', type: 'category' }, { name: 'בגדי יד שנייה', url: '/c/second', type: 'category' }] }))
    check('E. no fashion candidate lost; all 5 remain in the pool', r.pool.length === 5)
    check('E. relevant fashion briefs rank in Tier 0/1', (tierOf(r, 'בגדי נשים אונליין') ?? 9) <= 1 && (tierOf(r, 'שמלות כלה יד שנייה') ?? 9) <= 1 && (tierOf(r, 'איך לשלב בגד גוף') ?? 9) <= 1)
    check('E. off-domain sport/Ronaldo evidence gets NO pillar alignment (matchedPillar null, never Tier 0)',
      bp(r).find((p) => p.subject === 'sport live 365')?.matchedPillar === null && tierOf(r, 'sport live 365') !== 0 && bp(r).find((p) => p.subject === 'ronaldo messi')?.matchedPillar === null && tierOf(r, 'ronaldo messi') !== 0)
  }

  console.log('F) POOL IDENTITY — prioritize returns the SAME briefs, same count, only order changes')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['מתנות לגבר', 'מכונת סוכר ביתית', 'איך לבחור רחפן', 'חנות מתנות', 'מתנות לאישה']), entities: [{ name: 'מתנות', url: '/c/g', type: 'category' }, { name: 'מכונת סוכר ביתית פרו', url: '/p/1', type: 'product' }] }))
    const before = r.pool.map((b) => b.opportunityId)
    const pillars = buildBusinessPillars({ trackedKeywords: [], projectFocus: [], entities: [{ name: 'מתנות', url: '/c/g', type: 'category' }] })
    const reordered = prioritizeBriefsForSynthesis(r.pool.slice().reverse(), { pillars })
    const after = reordered.map((b) => b.opportunityId)
    check('F. exact same SET of pool member ids before/after prioritization', before.length === after.length && new Set(before).size === new Set([...before, ...after]).size)
    check('F. exact same COUNT (no additions, no removals)', before.length === after.length && after.length === 5)
    check('F. every brief has exactly one rank (0..n-1, unique)', (() => { const ranks = reordered.map((b) => b.priority?.finalSynthesisRank); return new Set(ranks).size === ranks.length && ranks.every((x) => typeof x === 'number' && x >= 0 && x < ranks.length) })())
    check('F. every brief carries exactly one tier ∈ {0,1,2}', reordered.every((b) => [0, 1, 2].includes(b.priority?.tier as number)))
  }

  console.log('PILLARS) built only from owned NON-product evidence (never products / KR-alone)')
  {
    const pillars = buildBusinessPillars({ trackedKeywords: ['מתנות מקוריות'], projectFocus: ['מתנות', 'משהו לא קשור'], entities: [{ name: 'מתנות לגבר', url: '/c/men', type: 'category' }, { name: 'שירות עטיפה', url: '/s/wrap', type: 'service' }, { name: 'מנורת פלזמה', url: '/p/1', type: 'product' }, { name: 'דף הבית', url: 'https://shop.example.co.il/', type: 'page' }] })
    check('includes tracked_keyword / category / service / homepage', pillars.some((p) => p.type === 'tracked_keyword') && pillars.some((p) => p.type === 'category') && pillars.some((p) => p.type === 'service') && pillars.some((p) => p.type === 'homepage'))
    check('a PRODUCT is NEVER a pillar', !pillars.some((p) => p.source === 'מנורת פלזמה'))
    check('project focus is a pillar ONLY when corroborated (מתנות corroborated; unrelated term excluded)',
      pillars.some((p) => p.type === 'corroborated_project_focus' && p.source === 'מתנות') && !pillars.some((p) => p.source === 'משהו לא קשור'))
  }

  console.log('TRACE) generate-from-briefs would prove admitted-in === admitted-out (rank/consumed fields present)')
  {
    // finalSynthesisRank is contiguous over the whole pool → in===out by construction.
    const r = buildBriefPool(base({ keywordResearch: kr(['מתנות לגבר', 'מתנות לאישה', 'מכונת סוכר ביתית']), entities: [{ name: 'מתנות', url: '/c/g', type: 'category' }] }))
    const ranks = bp(r).map((p) => p.finalSynthesisRank).sort((a, b) => a - b)
    check('every admitted brief has a unique contiguous rank 0..n-1', ranks.length === r.pool.length && ranks.every((x, i) => x === i))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
