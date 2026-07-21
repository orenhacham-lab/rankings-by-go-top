/**
 * SOFT synthesis-batch priority — CORE-HEAD pillar correction (two proven defects).
 *
 * (A) Product/commercial precedence now runs BEFORE Tier-0 pillar alignment, so a
 *     productAffinity=true candidate is never Tier 0. (B) Tier-0 pillar alignment now
 *     requires the candidate to contain the pillar's CORE ANCHOR HEAD — a shared
 *     recipient/audience/attribute modifier (לילד / לגבר) can no longer create Tier 0.
 *     (C) A single-token category/service/homepage pillar (or a project-focus pillar)
 *     grants Tier 0 only when its anchor head is independently corroborated by another
 *     owned non-product source. Non-destructive: no brief is added or removed; pool
 *     membership and all frozen gates are unchanged. Reuses topicSignature /
 *     distinctiveTokensOf / canonicalVariants only.
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
const rec = (r: ReturnType<typeof buildBriefPool>, s: string) => bp(r).find((p) => p.subject === s)

function main() {
  console.log('A) PRODUCT PRECEDENCE — a productAffinity candidate is never Tier 0')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['רחפן לילדים עם מצלמה']), trackedKeywords: ['מתנות קטנות לילדות'], entities: [{ name: 'רחפן עם מצלמה לילדים', url: '/p/1', type: 'product' }] }))
    const p = rec(r, 'רחפן לילדים עם מצלמה')
    check('A. candidate remains in the pool', subs(r).includes('רחפן לילדים עם מצלמה'))
    check('A. productAffinity=true → Tier 2 / product_shaped, never Tier 0', !!p && p.productAffinity === true && p.tier === 2 && p.priorityReason === 'product_shaped')
    check('A. product remains available in relatedEntities', (r.pool.find((b) => b.subject === 'רחפן לילדים עם מצלמה')?.relatedEntities ?? []).some((e) => e.type === 'product'))
    check('A. no new rejection', !('product_entity_support_only' in rej(r)))
  }

  console.log('B) MODIFIER-ONLY — a shared recipient/audience modifier cannot grant Tier 0')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['מכונת שערות סבתא לילדים', 'מוצרים לגבר']), trackedKeywords: ['מתנות קטנות לילדות'], entities: [{ name: 'מתנות לגבר', url: '/c/men', type: 'category' }] }))
    const a = rec(r, 'מכונת שערות סבתא לילדים'); const b2 = rec(r, 'מוצרים לגבר')
    check('B. both remain in the pool', subs(r).includes('מכונת שערות סבתא לילדים') && subs(r).includes('מוצרים לגבר'))
    check('B. neither is Tier 0 (modifier-only לילד / לגבר)', a?.tier !== 0 && b2?.tier !== 0)
    check('B. matchedPillarAnchorHead is not satisfied (null)', a?.matchedPillarAnchorHead === null && b2?.matchedPillarAnchorHead === null)
  }

  console.log('C) VALID GIFT CORE — candidates that contain the מתנות anchor + a distinct token → Tier 0')
  {
    const cands = ['מתנות שאפשר להכין בבית', 'מתנות לאמא בת 60', 'מתנות לעסקים', 'מתנות לחינה', 'מתנות מגניבות לגבר']
    const r = buildBriefPool(base({ keywordResearch: kr([...cands, 'מכונת סוכר ביתית']), trackedKeywords: ['מתנות קטנות לילדות'], entities: [{ name: 'מתנות לגבר', url: '/c/men', type: 'category' }, { name: 'מכונת סוכר ביתית פרו', url: '/p/1', type: 'product' }] }))
    check('C. all 5 gift core extensions are Tier 0 and match the מתנ anchor', cands.every((c) => { const p = rec(r, c); return p?.tier === 0 && p?.matchedPillarAnchorHead === 'מתנ' }), JSON.stringify(cands.map((c) => [c, rec(r, c)?.tier])))
    check('C. all remain in the pool', cands.every((c) => subs(r).includes(c)))
    const maxT0 = Math.max(...cands.map((c) => rec(r, c)!.finalSynthesisRank))
    const t2 = rec(r, 'מכונת סוכר ביתית')
    check('C. Tier-0 gift extensions rank before the Tier-2 product', !!t2 && t2.tier === 2 && maxT0 < t2.finalSynthesisRank)
  }

  console.log('D) SINGLE-WORD NOISE PILLAR — uncorroborated single-token category never grants Tier 0')
  {
    const cands = ['one sport', 'sport live streaming', 'sport center', '808 sport']
    const r = buildBriefPool(base({ keywordResearch: kr(cands), entities: [{ name: 'sport', url: '/c/sport', type: 'category' }] }))
    check('D. all remain in the pool', cands.every((c) => subs(r).includes(c)))
    check('D. none receives Tier 0 from the uncorroborated single-word pillar; matchedPillar null', cands.every((c) => { const p = rec(r, c); return p?.tier !== 0 && p?.matchedPillar === null }))
    check('D. no off-domain rejection introduced', Object.keys(rej(r)).length === 0)
  }

  console.log('E) RELEVANT FASHION CORE — בגדי core is verified; sport noise does not gain the same priority')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['בגדי ספורט נשים', 'בגדי ספורט לנשים', 'שמלות כלה יד שנייה', 'sport live streaming']), trackedKeywords: ['חנות בגדי יד שנייה'], entities: [{ name: 'בגדי נשים', url: '/c/women', type: 'category' }, { name: 'sport', url: '/c/sport', type: 'category' }] }))
    check('E. בגדי ספורט candidates receive Tier 0 through the verified בגדי core', rec(r, 'בגדי ספורט נשים')?.tier === 0 && rec(r, 'בגדי ספורט לנשים')?.tier === 0)
    check('E. relevant fashion retained at Tier 0/1 (not demoted to Tier 2)', (rec(r, 'שמלות כלה יד שנייה')?.tier ?? 9) <= 1)
    check('E. off-domain sport does NOT gain בגדי/pillar priority (not Tier 0)', rec(r, 'sport live streaming')?.tier !== 0)
    check('E. no fashion candidate lost', ['בגדי ספורט נשים', 'בגדי ספורט לנשים', 'שמלות כלה יד שנייה'].every((c) => subs(r).includes(c)))
  }

  console.log('F) SERVICE DOMAIN — multi-token pillar core head; brand variants still collapse (frozen)')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['מצוף ניאגרה', 'כפתור ניאגרה', 'מנגנון ניאגרה ישן', 'נזילה בניאגרה סמויה', 'תיקון ניאגרה סמויה jomo', 'תיקון ניאגרה סמויה oli', 'תיקון ניאגרה סמויה פלסאון']), entities: [{ name: 'ניאגרה סמויה', url: '/c/n', type: 'category' }] }))
    check('F. distinct problem/component needs are Tier 0 via the ניאגרה core head', ['מצוף ניאגרה', 'כפתור ניאגרה', 'מנגנון ניאגרה ישן', 'נזילה בניאגרה סמויה'].every((c) => rec(r, c)?.tier === 0))
    check('F. Jomo/OLI/Plasson brand variants still collapse via semantic-dup (unchanged)', (rej(r).brief_semantic_duplicate ?? 0) === 2)
  }

  console.log('G) PRODUCT QUESTION — productAffinity does not force a genuine question to Tier 2')
  {
    const bareR = buildBriefPool(base({ keywordResearch: kr(['מתנה בקופסה']), entities: [{ name: 'מתנה בקופסה מיוחדת', url: '/p/1', type: 'product' }] }))
    check('G. a bare product phrase is Tier 2 when productAffinity=true', rec(bareR, 'מתנה בקופסה')?.tier === 2 && rec(bareR, 'מתנה בקופסה')?.productAffinity === true)
    // The genuine question, with a corroborated מתנות core (category + tracked), is NOT forced
    // to Tier 2 by productAffinity (it is not product-affine) and validly contains the core.
    const qR = buildBriefPool(base({ keywordResearch: kr(['איך לבחור מתנה בקופסה']), trackedKeywords: ['מתנות מקוריות'], entities: [{ name: 'מתנות לכל אירוע', url: '/c/gifts', type: 'category' }, { name: 'מתנה בקופסה מיוחדת', url: '/p/1', type: 'product' }] }))
    const q = rec(qR, 'איך לבחור מתנה בקופסה')
    check('G. the genuine question is NOT Tier 2 (not forced by productAffinity)', !!q && q.tier !== 2 && q.productAffinity === false)
    check('G. neither candidate removed', subs(bareR).includes('מתנה בקופסה') && subs(qR).includes('איך לבחור מתנה בקופסה'))
  }

  console.log('H) POOL IDENTITY — same opportunityId set + count; only tier/order metadata changes')
  {
    const r = buildBriefPool(base({ keywordResearch: kr(['מתנות לגבר', 'מכונת סוכר ביתית', 'איך לבחור רחפן', 'חנות מתנות', 'מתנות מגניבות לילדים']), trackedKeywords: ['מתנות קטנות לילדות'], entities: [{ name: 'מתנות לגבר', url: '/c/g', type: 'category' }, { name: 'מכונת סוכר ביתית פרו', url: '/p/1', type: 'product' }] }))
    const before = r.pool.map((b) => b.opportunityId)
    const pillars = buildBusinessPillars({ trackedKeywords: ['מתנות קטנות לילדות'], projectFocus: [], entities: [{ name: 'מתנות לגבר', url: '/c/g', type: 'category' }] })
    const reordered = prioritizeBriefsForSynthesis(r.pool.slice().reverse(), { pillars })
    const after = reordered.map((b) => b.opportunityId)
    check('H. exact same SET of opportunityIds before/after', new Set(before).size === new Set([...before, ...after]).size && before.length === after.length)
    check('H. exact same COUNT, no new rejection', before.length === after.length && !('product_entity_support_only' in rej(r)))
    check('H. every brief has exactly one unique rank 0..n-1 and one tier', (() => { const rk = reordered.map((b) => b.priority?.finalSynthesisRank); return new Set(rk).size === rk.length && rk.every((x) => typeof x === 'number' && x! >= 0 && x! < rk.length) && reordered.every((b) => [0, 1, 2].includes(b.priority?.tier as number)) })())
  }

  console.log('CORROBORATION) single-token pillar needs an independent owned non-product source')
  {
    // ריהוט (single-token category) IS corroborated by the tracked keyword "ריהוט משרדי"
    // (same canonical anchor ריהוט); the single-token category "sport" has NO corroborator.
    const pillars = buildBusinessPillars({ trackedKeywords: ['ריהוט משרדי'], projectFocus: [], entities: [{ name: 'ריהוט', url: '/c/f', type: 'category' }, { name: 'sport', url: '/c/s', type: 'category' }] })
    const r = buildBriefPool(base({ keywordResearch: kr(['ריהוט לחדר ילדים', 'sport live streaming']), trackedKeywords: ['ריהוט משרדי'], entities: [{ name: 'ריהוט', url: '/c/f', type: 'category' }, { name: 'sport', url: '/c/s', type: 'category' }] }))
    check('corroborated single-token ריהוט → its extension is Tier 0 (anchor independently corroborated)', rec(r, 'ריהוט לחדר ילדים')?.tier === 0 && rec(r, 'ריהוט לחדר ילדים')?.pillarAnchorCorroborated === true)
    check('uncorroborated single-token sport → its extension is NOT Tier 0', rec(r, 'sport live streaming')?.tier !== 0)
    check('pillars built from owned non-product sources (category + tracked present)', pillars.some((p) => p.type === 'category') && pillars.some((p) => p.type === 'tracked_keyword'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
