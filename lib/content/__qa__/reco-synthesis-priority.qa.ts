/**
 * SOFT synthesis-batch priority — PILLAR-AUTHORITY correction.
 *
 * A pillar grants Tier 0 to a candidate only when the candidate contains the pillar's core
 * anchor head + adds a distinct token, AND one authority condition holds:
 *   (A) STRONG PILLAR OVERLAP — the candidate shares ≥2 distinctive pillar tokens (incl. the
 *       anchor); OR
 *   (B) INDEPENDENT ANCHOR CORROBORATION — the anchor is confirmed by another owned
 *       non-product source of a DIFFERENT type (same anchor as ITS own head).
 * A multi-token pillar is NO LONGER auto-trusted; corroboration counts independent source
 * TYPES (two category rows never corroborate each other). Product/commercial precedence and
 * pool membership are unchanged. Reuses topicSignature/distinctiveTokensOf/canonicalVariants.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
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
const rec = (r: ReturnType<typeof buildBriefPool>, s: string) => bp(r).find((p) => p.subject === s)

function main() {
  console.log('A) MULTI-TOKEN NOISE PILLAR — category+category is NOT independent corroboration')
  {
    const cands = ['one sport', 'sport live streaming', 'sport center', '808 sport']
    const r = buildBriefPool(base({ keywordResearch: kr(cands), entities: [{ name: 'sport', url: '/c/1', type: 'category' }, { name: 'sport pants', url: '/c/2', type: 'category' }] }))
    check('A. none is Tier 0 (shares only the anchor sport, not a 2nd pillar token; no cross-type corroboration)', cands.every((c) => rec(r, c)?.tier !== 0 && rec(r, c)?.matchedPillar === null))
    check('A. all remain in the pool as Tier 1', cands.every((c) => subs(r).includes(c) && rec(r, c)?.tier === 1))
    check('A. no rejection introduced', Object.keys(rej(r)).length === 0)
  }

  console.log('B) INDEPENDENT TYPE CORROBORATION — tracked_keyword + category corroborate the מתנות anchor')
  {
    const cands = ['מתנות שאפשר להכין בבית', 'מתנות לאמא בת 60', 'מתנות לעסקים', 'מתנות מגניבות לגבר']
    const r = buildBriefPool(base({ keywordResearch: kr(cands), trackedKeywords: ['מתנות קטנות לילדות'], entities: [{ name: 'מתנות לגבר', url: '/c/men', type: 'category' }] }))
    check('B. all are Tier 0 via anchor-corroboration across two independent source types', cands.every((c) => { const p = rec(r, c); return p?.tier === 0 && p?.matchedPillarAnchorHead === 'מתנ' && p?.pillarAnchorCorroborated === true }))
    check('B. all remain in the pool', cands.every((c) => subs(r).includes(c)))
  }

  console.log('C) STRONG PILLAR OVERLAP — ≥2 shared pillar tokens; no 2nd source type required')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['בגדי ספורט נשים']), entities: [{ name: 'בגדי נשים', url: '/c/w', type: 'category' }] }))
    const p = rec(r, 'בגדי ספורט נשים')
    check('C. Tier 0 because two pillar tokens (בגדי + נשים) are shared', p?.tier === 0 && (p?.matchedPillarTokens.length ?? 0) >= 2 && p?.pillarAnchorCorroborated === false)
  }

  console.log('D) SERVICE STRONG OVERLAP — multi-token pillar core overlap is strong')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['נזילה בניאגרה סמויה']), entities: [{ name: 'ניאגרה סמויה', url: '/c/n', type: 'category' }] }))
    const p = rec(r, 'נזילה בניאגרה סמויה')
    check('D. Tier 0 via strong overlap (ניאגרה + סמויה shared)', p?.tier === 0 && (p?.matchedPillarTokens.length ?? 0) >= 2)
  }

  console.log('E) UNRELATED CROSS-TYPE EVIDENCE does not corroborate the sport anchor')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['sport live streaming']), trackedKeywords: ['בגדי יד שנייה'], entities: [{ name: 'sport', url: '/c/s', type: 'category' }] }))
    check('E. sport live streaming is NOT Tier 0 (a fashion tracked keyword does not carry the sport anchor)', rec(r, 'sport live streaming')?.tier !== 0)
    check('E. it remains in the pool', subs(r).includes('sport live streaming'))
  }

  console.log('F) POOL IDENTITY — same opportunityId set + count; only tier/order metadata changes')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['מתנות לגבר', 'one sport', 'sport pants מחיר', 'בגדי ספורט נשים', 'מתנות מגניבות לילדים']), trackedKeywords: ['מתנות קטנות לילדות'], entities: [{ name: 'מתנות לגבר', url: '/c/g', type: 'category' }, { name: 'sport', url: '/c/s', type: 'category' }, { name: 'sport pants', url: '/c/sp', type: 'category' }, { name: 'בגדי נשים', url: '/c/w', type: 'category' }] }))
    const before = r.pool.map((b) => b.opportunityId)
    const pillars = buildBusinessPillars({ trackedKeywords: ['מתנות קטנות לילדות'], projectFocus: [], entities: [{ name: 'מתנות לגבר', url: '/c/g', type: 'category' }, { name: 'sport pants', url: '/c/sp', type: 'category' }, { name: 'בגדי נשים', url: '/c/w', type: 'category' }] })
    const reordered = prioritizeBriefsForSynthesis(r.pool.slice().reverse(), { pillars })
    const after = reordered.map((b) => b.opportunityId)
    check('F. exact same SET of opportunityIds before/after', before.length === after.length && new Set(before).size === new Set([...before, ...after]).size)
    check('F. exact same COUNT, no new rejection', before.length === after.length && !('product_entity_support_only' in rej(r)))
    check('F. every brief has one unique rank 0..n-1 and one tier ∈ {0,1,2}', (() => { const rk = reordered.map((b) => b.priority?.finalSynthesisRank); return new Set(rk).size === rk.length && rk.every((x) => typeof x === 'number' && x! >= 0 && x! < rk.length) && reordered.every((b) => [0, 1, 2].includes(b.priority?.tier as number)) })())
  }

  console.log('RETAINED) product precedence, modifier-only, single-token noise (from prior patches)')
  {
    // product precedence — a productAffinity candidate is never Tier 0.
    const pr = buildBriefPool(base({ keywordResearch: kr(['רחפן לילדים עם מצלמה']), trackedKeywords: ['מתנות קטנות לילדות'], entities: [{ name: 'רחפן עם מצלמה לילדים', url: '/p/1', type: 'product' }] }))
    check('R. productAffinity → Tier 2 / product_shaped, never Tier 0', rec(pr, 'רחפן לילדים עם מצלמה')?.tier === 2 && rec(pr, 'רחפן לילדים עם מצלמה')?.productAffinity === true)
    check('R. the product remains available in relatedEntities', (pr.pool.find((b) => b.subject === 'רחפן לילדים עם מצלמה')?.relatedEntities ?? []).some((e) => e.type === 'product'))
    // modifier-only recipient/audience token never grants Tier 0.
    const mo = buildBriefPool(base({ keywordResearch: kr(['מוצרים לגבר']), trackedKeywords: ['מתנות קטנות לילדות'], entities: [{ name: 'מתנות לגבר', url: '/c/men', type: 'category' }] }))
    check('R. modifier-only (לגבר) → NOT Tier 0, matchedPillarAnchorHead null', rec(mo, 'מוצרים לגבר')?.tier !== 0 && rec(mo, 'מוצרים לגבר')?.matchedPillarAnchorHead === null)
    // uncorroborated single-token category never grants Tier 0.
    const st = buildBriefPool(base({ keywordResearch: kr(['sport highlights']), entities: [{ name: 'sport', url: '/c/s', type: 'category' }] }))
    check('R. uncorroborated single-token sport → NOT Tier 0', rec(st, 'sport highlights')?.tier !== 0)
  }

  console.log('SOURCE) authority rule + type-based corroboration in production code')
  {
    const ob = readFileSync(join(__dirname, '../recommendations/opportunity-brief.ts'), 'utf8')
    check('multi-token pillars are NO LONGER auto-eligible (pillarEligibleForTier0 removed)', !/function pillarEligibleForTier0/.test(ob))
    check('authority = strong overlap (≥2 shared pillar tokens) OR cross-type corroboration', /const strongOverlap = sharedPillarTokens\.length >= 2/.test(ob) && /if \(!strongOverlap && !corroborated\) continue/.test(ob))
    check('corroboration is by independent source TYPE, not source string (q.type === self.type skipped; own anchor head)', /q\.type === self\.type/.test(ob) && /anchorCorroboratedByType/.test(ob) && /const qAnchor = anchorHeadOf\(q\)/.test(ob))
    check('source-authority order tracked>category>service>homepage>project_focus', /PILLAR_AUTHORITY_ORDER/.test(ob) && /tracked_keyword: 0, category: 1, service: 2, homepage: 3, corroborated_project_focus: 4/.test(ob))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
