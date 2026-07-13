/**
 * Grounding + entity-validation harness — pure logic + injected grounding into
 * the refine pipeline. Covers PR #22 §10 required tests (1–11).
 */
import {
  normEntityToken, entityTokens, brandTokens, entityMatchesBrand, matchingEntities,
  filterBrandLinks, comparisonSides, comparisonIsGrounded, unsupportedClaims,
  claimsProtectedAudience, neutralizeClaims, sanitizeReason, isNonEvidenceReason,
  assessGrounding, cannibalizesAnswer, collapseCrossSource, canonicalizeBrandForms,
  brandSkeleton, type EntityRecord, type GroundingEvidence,
} from '../grounding'
import { refineAndSelect, type RefineCtx, type RepairTitleFn, type RefillFn } from '../refine'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const YEAR = 2026
const ent = (id: string, type: EntityRecord['type'], title: string, url?: string): EntityRecord => ({ id, type, title, url })
const mk = (title: string, kw = title, score = 0.7, reason = 'נושא תומך אמיתי', intent = 'informational') =>
  ({ id: `t:${title}`, title, primaryKeyword: kw, secondaryKeywords: [] as string[], searchIntent: intent, recommendedWordCount: 1000, angle: '', suggestedInternalLinks: [] as { url: string; anchor: string }[], source: 'site_scan' as const, suggestionReason: reason, suggestionScore: score })

const stubRepair: RepairTitleFn = async (c) => ({ title: `איך לבחור ${c.primaryKeyword} לפי הצורך`, reason: 'נושא מעשי וממוקד' })

async function main() {
  // ─────────────────────────────────────────────────────────────────────────
  console.log('1) canonical entity identity — Acqua di Parma ≠ Profumum Roma')
  {
    const entities = [
      ent('gid://acqua', 'brand', 'Acqua di Parma Colonia'),
      ent('gid://prof1', 'product', 'Profumum Roma Acqua Viva'),
      ent('gid://prof2', 'product', 'Profumum Roma Acqua e Zucchero'),
    ]
    const brand = brandTokens('בשמי אקווה די פארמה', 'אקווה די פארמה')
    // English-title fixture (the real store indexes latin brand names):
    const brandEn = brandTokens('Acqua di Parma guide', 'Acqua di Parma')
    check('brand phrase multi-token', brandEn.length >= 2, brandEn.join(','))
    check('Acqua di Parma matches its own entity', entityMatchesBrand(brandEn, 'Acqua di Parma Colonia'))
    check('Acqua di Parma does NOT match Profumum Roma Acqua Viva', !entityMatchesBrand(brandEn, 'Profumum Roma Acqua Viva'))
    check('Acqua di Parma does NOT match Profumum Roma Acqua e Zucchero', !entityMatchesBrand(brandEn, 'Profumum Roma Acqua e Zucchero'))
    const matches = matchingEntities(brandEn, entities)
    check('only the real brand entity matches', matches.length === 1 && matches[0].id === 'gid://acqua')
    // supporting-link filter drops the Profumum links
    const links = [
      { url: 'gid://prof1', anchor: 'Profumum Roma Acqua Viva' },
      { url: 'gid://prof2', anchor: 'Profumum Roma Acqua e Zucchero' },
      { url: 'gid://acqua', anchor: 'Acqua di Parma Colonia' },
    ]
    const titleOf = (u: string) => entities.find((e) => e.id === u)?.title
    const { kept, dropped } = filterBrandLinks(brandEn, links, titleOf)
    check('Profumum links dropped', dropped.length === 2 && kept.length === 1 && kept[0].url === 'gid://acqua')
    void brand
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('2) unsupported children-perfume idea discarded')
  {
    const noChild: GroundingEvidence = { entities: [ent('gid://n', 'category', 'בשמי נישה')], keywordBacked: false, existingTitles: [] }
    check('claimsProtectedAudience(לילדים)', claimsProtectedAudience('בשמי נישה לילדים'))
    const g = assessGrounding(mk('בשמי נישה לילדים'), noChild)
    check('children topic NOT grounded', !g.grounded && g.discardReason === 'unsupported_claim')
    // The child claim is unsupported without child evidence...
    check('children claim unsupported w/o evidence', unsupportedClaims('בשמי נישה לילדים', 'בשמי נישה').some((c) => c.discard))
    // ...and supported once the store actually has child products/content.
    check('children claim SUPPORTED w/ child products', !unsupportedClaims('בשמי נישה לילדים', 'בשמים לילדים ללא אלכוהול').some((c) => c.discard))
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('3) Calvin Klein with no matching entity → discarded')
  {
    const ev: GroundingEvidence = { entities: [ent('gid://tf', 'brand', 'Tom Ford'), ent('gid://gucci', 'category', 'Gucci')], keywordBacked: false, existingTitles: [] }
    const g = assessGrounding(mk('מדריך מלא לבשמי קלווין קליין', 'קלווין קליין', 0.7, 'מותגים פופולריים'), ev)
    check('CK topic NOT grounded (no CK entity)', !g.grounded && g.discardReason === 'ungrounded_entity')
    // Latin form same result
    const g2 = assessGrounding(mk('Calvin Klein perfumes guide', 'Calvin Klein'), ev)
    check('Calvin Klein (latin) NOT grounded', !g2.grounded)
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('4) Gucci category exists → neutral grounded title; unsupported claims removed')
  {
    const ev: GroundingEvidence = { entities: [ent('gid://gucci', 'category', 'Gucci', 'https://s/gucci')], keywordBacked: false, existingTitles: [] }
    const g = assessGrounding(mk('מדריך לבשמי Gucci', 'Gucci'), ev)
    check('Gucci topic grounded (category exists)', g.grounded && g.primaryEntityId === 'gid://gucci')
    check('carries canonical entity name', g.canonicalEntityName === 'Gucci')
    const evText = ['Gucci', 'Gucci'].join(' ')
    const claims = unsupportedClaims('בשמי Gucci האייקוניים והטרנדים החדשים', evText)
    check('iconic+trend flagged unsupported', claims.some((c) => c.label === 'iconic') && claims.some((c) => c.label === 'trending'))
    const n = neutralizeClaims('בשמי Gucci האייקוניים', evText)
    check('iconic neutralized out of title', n.changed && !/אייקוני/.test(n.title), n.title)
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('5) Borouj — one canonical spelling from the indexed entity')
  {
    const entities = [ent('gid://borouj', 'brand', 'בורוג׳ Borouj')]
    check('skeletons close', brandSkeleton('בורוג׳') === brandSkeleton('בורוג'))
    const out1 = canonicalizeBrandForms('בשמי ברוז\' לגבר', entities)
    const out2 = canonicalizeBrandForms('הניחוחות של בורז\' לאישה', entities)
    const out3 = canonicalizeBrandForms('מדריך בורוג׳', entities)
    check('ברוז\' → בורוג׳', out1.includes('בורוג׳'), out1)
    check('בורז\' → בורוג׳', out2.includes('בורוג׳'), out2)
    check('בורוג׳ preserved', out3.includes('בורוג׳'), out3)
    check('one consistent form', out1.includes('בורוג׳') && out2.includes('בורוג׳') && !out1.includes('ברוז') && !out2.includes('בורז'))
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('6) existing vanilla article: paraphrase discarded, distinct angle survives')
  {
    const existing = [{ title: 'המסע של וניל ממדגסקר לבקבוק הבושם שלך', primaryKeyword: 'וניל', searchIntent: 'informational' }]
    const paraphrase = mk('המסע של ניחוחות וניל אל הבושם', 'וניל', 0.7, 'r', 'informational')
    check('vanilla paraphrase cannibalizes', cannibalizesAnswer(paraphrase, existing))
    const distinct = mk('שיטות חילוץ וניל בבישום: הפקה טבעית מול סינתטית', 'חילוץ וניל', 0.7, 'r', 'informational')
    check('vanilla EXTRACTION angle survives', !cannibalizesAnswer(distinct, existing))
    const types = mk('סוגי וניל שונים בבשמים והבדלי הריח', 'סוגי וניל', 0.7, 'r', 'informational')
    check('vanilla TYPES angle survives', !cannibalizesAnswer(types, existing))
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('7) existing storage article: adding "luxury" alone is not distinct')
  {
    const existing = [{ title: 'איך לאחסן בשמים בבית', primaryKeyword: 'אחסון בשמים', searchIntent: 'care' }]
    const luxAdded = mk('כיצד לאחסן בשמים יוקרתיים בבית', 'אחסון בשמים יוקרתיים', 0.7, 'r', 'care')
    // luxury is an unsupported claim (no luxury evidence) AND the answer overlaps.
    check('luxury-storage cannibalizes existing storage', cannibalizesAnswer(luxAdded, existing))
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('8) cross-source eastern-perfume duplicate: one strongest survives')
  {
    const a = { ...mk('בשמי מזרחיים למתחילים', 'בשמים מזרחיים', 0.6), source: 'site_scan' as const, supportingSources: ['site_scan'] as unknown[] }
    const b = { ...mk('בשמי מזרחיים למתחילים', 'בשמים מזרחיים', 0.8), source: 'keyword_research_url' as const, supportingSources: ['keyword_research_url'] as unknown[] }
    const collapsed = collapseCrossSource([a, b])
    check('duplicate collapsed to one', collapsed.length === 1)
    check('strongest survives', collapsed[0].suggestionScore === 0.8)
    const distinct = { ...mk('בושם ערב מזרחי לחתונה', 'בושם מזרחי לחתונה', 0.7), supportingSources: [] as unknown[] }
    check('distinct eastern topic NOT collapsed', collapseCrossSource([a, distinct]).length === 2)
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('9) comparison: both products must exist')
  {
    const entities = [ent('gid://t1', 'product', 'Andy Tauer L\'Air du Desert Marocain'), ent('gid://t2', 'product', 'Andy Tauer Lonestar Memories')]
    check('two comparison sides detected', comparisonSides('Andy Tauer L\'Air du Desert Marocain vs Andy Tauer Lonestar Memories') !== null)
    check('comparison grounded when both exist', comparisonIsGrounded('L\'Air du Desert Marocain vs Lonestar Memories', entities))
    check('comparison blocked when second missing', !comparisonIsGrounded('L\'Air du Desert Marocain vs Woods Collection Nabab', entities))
    const ev: GroundingEvidence = { entities, keywordBacked: false, existingTitles: [] }
    const g = assessGrounding(mk('L\'Air du Desert Marocain vs Woods Collection Nabab', 'tauer vs woods'), ev)
    check('ungrounded comparison discarded', !g.grounded && g.discardReason === 'invalid_comparison')
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('10) user-facing reason cleanup — no cluster ids / internal labels')
  {
    check('cluster 8 stripped', sanitizeReason('נושא תומך (לפי סריקת האתר: cluster 8)').indexOf('cluster') === -1)
    check('מותגים פופולריים stripped', sanitizeReason('מותגים פופולריים').length === 0)
    check('קהל יעד חדש stripped', sanitizeReason('פונה לקהל יעד חדש').length === 0)
    check('cluster-only reason is non-evidence', isNonEvidenceReason('cluster 2'))
    check('real evidence preserved', sanitizeReason('קיימת קטגוריית טום פורד ומספר מוצרים, אך אין מאמר השוואתי').includes('קטגוריית'))
    check('mixed reason keeps concrete part', /קטגוריית/.test(sanitizeReason('מותגים פופולריים, קיימת קטגוריית Gucci')))
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('11) count preserved through grounded replacements (no fabricated filler)')
  {
    const entities = [
      ent('gid://tf', 'brand', 'Tom Ford'), ent('gid://gucci', 'category', 'Gucci'),
      ent('gid://amouage', 'brand', 'Amouage'), ent('gid://guerlain', 'brand', 'Guerlain'),
    ]
    const ev: GroundingEvidence = { entities, keywordBacked: false, existingTitles: [] }
    const ctx: RefineCtx = {
      existingTitles: [], language: 'he', year: YEAR, isDuplicate: () => false,
      assessGrounding: (c) => assessGrounding(c, ev),
      evidenceTextFor: (c) => [c.primaryKeyword, ...entities.map((e) => e.title)].join(' '),
      existingTopics: [],
    }
    // 2 grounded + 2 ungrounded (Calvin Klein, children) → refill supplies grounded.
    const initial = [
      mk('מדריך לבשמי Tom Ford לפי אירוע', 'Tom Ford'),
      mk('איך לבחור בושם Gucci', 'Gucci'),
      mk('מדריך מלא לבשמי קלווין קליין', 'קלווין קליין'),
      mk('בשמי נישה לילדים', 'בשמי ילדים'),
    ]
    let refillCalls = 0
    const refill: RefillFn = async () => {
      refillCalls++
      return [mk('בושם Amouage לערב', 'Amouage'), mk('הניחוחות של Guerlain לאישה', 'Guerlain')]
    }
    const { selected, funnel } = await refineAndSelect(initial, 4, ctx, stubRepair, refill)
    check('ungrounded discarded (2)', funnel.discardedUnsupported === 2, `got ${funnel.discardedUnsupported}`)
    check('refill invoked once', refillCalls === 1)
    check('count restored to 4 via grounded replacements', selected.length === 4, `got ${selected.length}`)
    check('no fabricated filler (all grounded)', selected.every((s) => assessGrounding(s, ev).grounded))
    check('funnel finalCount = 4', funnel.finalCount === 4)
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('primitives sanity')
  {
    check('normEntityToken strips geresh', normEntityToken("בורוג׳") === 'בורוג')
    check('entityTokens drops filler', !entityTokens('בשמי טום פורד').includes('בשמי'))
    check('non-branded informational grounded via keyword', assessGrounding(mk('איך לבחור בושם לפי סוג עור'), { entities: [], keywordBacked: true, existingTitles: [] }).grounded)
    check('non-branded ungrounded label-only discarded', !assessGrounding(mk('נושא כללי', 'נושא', 0.5, 'נושא מעניין'), { entities: [], keywordBacked: false, existingTitles: [] }).grounded)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
