/**
 * Source-role classifier (Best Gifts follow-up) — OWNED PRODUCTS ARE SUPPORT
 * EVIDENCE / LINK TARGETS, NOT STANDALONE ARTICLE-BRIEF SUBJECTS.
 *
 * A candidate is support_only_product ONLY when ALL hold (domain-neutral, existing
 * helpers only): (1) grounded in an owned entity of type `product`; (2) a bare/near-bare
 * representation of that one product (every distinctive token is a product token or a
 * generic modifier, head is a product token); (3) no independent supported need
 * (informational searchNeed, no need-bearing token beyond the product). Anything
 * ambiguous stays article_candidate. The product is never removed — it stays available
 * for relatedEntities / links. The gate runs at brief admission, before scoring/ranking.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildBriefPool, classifyCandidateSourceRole } from '../recommendations/opportunity-brief'
import { normalizePhrase } from '../recommendations/keyword-guard'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const prod = (name: string, url = '/p/x') => ({ name, url, type: 'product' as const })
const cls = (subject: string, searchNeed: string, rel: { name: string; url?: string | null; type?: string }[]) =>
  classifyCandidateSourceRole({ subject, searchNeed, relatedEntities: rel } as Parameters<typeof classifyCandidateSourceRole>[0])

type Opts = Partial<Parameters<typeof buildBriefPool>[0]>
const kr = (qs: string[]) => qs.map((q, i) => ({ query: q, volume: 100 + i }))
const base = (o: Opts = {}): Parameters<typeof buildBriefPool>[0] => ({
  language: 'he', keywordResearch: [], trackedKeywords: [], projectFocus: [], entities: [],
  publishedCoverage: [], pendingExactKeys: new Set<string>(), pendingSignatures: [],
  isOwnedByEntity: () => false, isCoveredByContent: () => false,
  domainTypeWords: new Set<string>(), attributeTokens: new Set<string>(), ...o,
})
const subs = (r: ReturnType<typeof buildBriefPool>) => r.pool.map((b) => b.subject)
const rej = (r: ReturnType<typeof buildBriefPool>) => r.diagnostics.rejected_by_reason

function main() {
  console.log('CLASSIFIER) direct — the binary role decision')
  check('A. bare owned product → support_only_product (matched tokens exposed)', (() => {
    const r = cls('מנורת פלזמה', 'informational', [prod('מנורת פלזמה כדור חשמלי RGB', '/p/1')])
    return r.role === 'support_only_product' && r.productEntity?.name === 'מנורת פלזמה כדור חשמלי RGB' && r.productEntity?.url === '/p/1' && r.matchedEntityTokens.length >= 2 && !!r.confidenceReason
  })())
  check('B. near-bare product phrase (subset of product tokens) → support_only_product',
    cls('מכונת מסטיקים', 'informational', [prod('מכונת מסטיקים ביתית')]).role === 'support_only_product')
  check('C. independent informational NEED ("איך פועלת …") → article_candidate', cls('איך פועלת מנורת פלזמה', 'question', [prod('מנורת פלזמה')]).role === 'article_candidate')
  check('D. broader audience/use-case need → article_candidate', cls('מתנות מדעיות לילדים שאוהבים ניסויים', 'informational', [prod('ערכת מדע לילדים')]).role === 'article_candidate')
  check('I. weak/partial product overlap (residual need-bearing token) → article_candidate', cls('מנורת שולחן מעוצבת', 'informational', [prod('מנורת פלזמה')]).role === 'article_candidate')
  check('only PRODUCT type triggers: same phrase against a CATEGORY entity → article_candidate', cls('מנורת פלזמה', 'informational', [{ name: 'מנורת פלזמה', type: 'category', url: '/c' }]).role === 'article_candidate')
  check('no related product → article_candidate', cls('מנורת פלזמה', 'informational', []).role === 'article_candidate')
  check('a commercial/local need (שירות/חנות/משלוח) is never product support-only', cls('משלוח מתנות', 'local_commercial', [prod('מארז מתנה')]).role === 'article_candidate')

  check('false-positive guard: 1 shared token (מארז ⟵ מארז כוסות וויסקי) → article_candidate (never product-affine)',
    cls('מארזים למשלוח', 'informational', [prod('מארז כוסות וויסקי')]).role === 'article_candidate')

  console.log('SOFT) buildBriefPool — product-shaped query STAYS in the pool (Tier 2), pillar need ranks ahead')
  {
    const r = buildBriefPool(base({
      // The מתנ anchor is independently corroborated across two source TYPES (tracked keyword
      // "מתנות מקוריות" + category "מתנות לכל אירוע"), so a gift extension sharing only the
      // anchor is authoritatively Tier 0 under the pillar-authority contract.
      keywordResearch: kr(['מנורת פלזמה', 'מנורת שולחן מעוצבת', 'מתנות לגבר']),
      trackedKeywords: ['מתנות מקוריות'],
      entities: [{ name: 'מנורת פלזמה כדור חשמלי RGB', url: '/p/1', type: 'product' }, { name: 'מתנות לכל אירוע', url: '/c/gifts', type: 'category' }],
    }))
    check('all three queries REMAIN in the pool (no hard product rejection)', ['מנורת פלזמה', 'מנורת שולחן מעוצבת', 'מתנות לגבר'].every((q) => subs(r).includes(q)))
    check('product_entity_support_only is no longer a rejection reason', !('product_entity_support_only' in rej(r)))
    const bp = r.diagnostics.brief_priority ?? []
    const bare = bp.find((p) => p.subject === 'מנורת פלזמה')
    const gift = bp.find((p) => p.subject === 'מתנות לגבר')
    check('bare product → productAffinity + Tier 2', !!bare && bare.tier === 2 && bare.productAffinity === true)
    check('pillar-aligned gift need (מתנ anchor corroborated across types) → Tier 0, ranks AHEAD of the Tier-2 product',
      !!gift && gift.tier === 0 && gift.pillarAnchorCorroborated === true && gift.matchedPillarAnchorHead === 'מתנ' && gift.matchedPillarType === 'tracked_keyword' && (gift.finalSynthesisRank < (bare?.finalSynthesisRank ?? 99)))
    const art = r.pool.find((b) => b.subject === 'מנורת שולחן מעוצבת')
    check('EVIDENCE products remain: an article sharing a token still lists the product in relatedEntities',
      !!art && (art.relatedEntities ?? []).some((e) => e.type === 'product' && e.name.includes('מנורת פלזמה')))
  }

  console.log('E) broad shared-head gift needs — dd492b7 behavior unchanged (no product owners)')
  {
    const gifts = ['מתנות לגבר', 'מתנות לאישה', 'מתנות לילדים', 'מתנות לעסקים', 'מתנות לסבא', 'מתנות לאמא בת 60']
    const r = buildBriefPool(base({ keywordResearch: kr(gifts) }))
    check('E. all 6 distinct gift needs admitted; no subject_head_cap; no product_entity_support_only',
      gifts.every((g) => subs(r).includes(g)) && (rej(r).subject_head_cap ?? 0) === 0 && (rej(r).product_entity_support_only ?? 0) === 0, JSON.stringify(rej(r)))
  }

  console.log('F) narrow brand variants — semantic-dup unchanged; product gate not involved')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['תיקון ניאגרה סמויה jomo', 'תיקון ניאגרה סמויה oli', 'תיקון ניאגרה סמויה פלסאון']) }))
    check('F. 1 admitted, 2 brief_semantic_duplicate, 0 product_entity_support_only',
      r.pool.length === 1 && (rej(r).brief_semantic_duplicate ?? 0) === 2 && (rej(r).product_entity_support_only ?? 0) === 0, JSON.stringify({ pool: subs(r), rejected: rej(r) }))
  }

  console.log('G) category/service owner — exact ownership still wins, NOT reclassified as product')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['שמלות כלה']), entities: [{ name: 'שמלות כלה', url: '/collections/bridal', type: 'category' }], isOwnedByEntity: (s) => s === 'שמלות כלה' }))
    check('G. category owner → exact_existing_keyword_owner (unchanged); product gate not applied',
      (rej(r).exact_existing_keyword_owner ?? 0) === 1 && (rej(r).product_entity_support_only ?? 0) === 0)
  }

  console.log('H) existing coverage + pending blockers — unchanged')
  {
    const cov = buildBriefPool(base({ keywordResearch: kr(['שולחן עץ מלא']), entities: [{ name: 'שולחן עץ מלא לסלון', type: 'product', url: '/p/9' }], isCoveredByContent: (s) => s.includes('שולחן') }))
    check('H. published coverage still blocks first (covered_by_existing_content), not product gate',
      (rej(cov).covered_by_existing_content ?? 0) === 1 && (rej(cov).product_entity_support_only ?? 0) === 0)
    const pex = buildBriefPool(base({ keywordResearch: kr(['מנורת פלזמה']), entities: [{ name: 'מנורת פלזמה כדור', type: 'product', url: '/p/1' }], pendingExactKeys: new Set([normalizePhrase('מנורת פלזמה')]) }))
    check('H. pending exact still blocks first (pending_exact_duplicate), not product gate',
      (rej(pex).pending_exact_duplicate ?? 0) === 1 && (rej(pex).product_entity_support_only ?? 0) === 0)
  }

  console.log('J) unrelated fashion project, no product-dominant candidate → pool byte-equivalent')
  {
    const fashionKr = ['איך לשלב צבעים בלבוש', 'טרנדים באופנת חורף', 'השוואת בדים לחליפה']
    const entities = [{ name: 'חנות אופנה', url: '/', type: 'category' as const }]
    const r = buildBriefPool(base({ keywordResearch: kr(fashionKr), entities }))
    check('J. no candidate classified support_only; all 3 fashion article needs admitted',
      (rej(r).product_entity_support_only ?? 0) === 0 && fashionKr.every((q) => subs(r).includes(q)), JSON.stringify({ pool: subs(r), rejected: rej(r) }))
  }

  console.log('GUARD) source: NO hard product rejection; SOFT tier priority; helpers reused; dd492b7 intact')
  {
    const ob = readFileSync(join(__dirname, '../recommendations/opportunity-brief.ts'), 'utf8')
    check('product affinity is a SIGNAL only — product_entity_support_only is NEVER a rejection reason',
      !/reject\('product_entity_support_only'/.test(ob) && !/support_only_examples/.test(ob))
    check('SOFT ordering: tier (0<1<2) → existing briefScore → opportunityId, family round-robin INSIDE each tier',
      /export function prioritizeBriefsForSynthesis/.test(ob) && /for \(const tier of \[0, 1, 2\] as const\)/.test(ob) && /b\.briefScore - a\.briefScore \|\| \(a\.opportunityId < b\.opportunityId/.test(ob) && /familyInterleave\(group\)/.test(ob))
    check('pillars from OWNED NON-product evidence only (tracked/category/service/homepage/corroborated focus)',
      /type: 'tracked_keyword'/.test(ob) && /type: 'category'/.test(ob) && /type: 'service'/.test(ob) && /type: 'homepage'/.test(ob) && /corroborated_project_focus/.test(ob))
    check('productAffinity signal requires ≥2 shared product tokens (kills the מארז single-token false positive)',
      /if \(matched\.length < 2\) continue/.test(ob))
    check('classifier reuses existing helpers only (distinctiveTokensOf / canonicalVariants / GENERIC_TOKENS / searchNeed / entity.type)',
      /distinctiveTokensOf\(candidate\.subject\)/.test(ob) && /GENERIC_CANON/.test(ob) && /e\.type === 'product'/.test(ob) && /candidate\.searchNeed !== 'informational'/.test(ob) && /canonicalVariants/.test(ob))
    const gfb = readFileSync(join(__dirname, '../recommendations/generate-from-briefs.ts'), 'utf8')
    check('FROZEN: production still calls buildBriefPool without a head-cap option (dd492b7 intact)',
      /buildBriefPool\(\{/.test(gfb) && !/buildBriefPool\([^)]*maxPerSubjectHead/.test(gfb))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
