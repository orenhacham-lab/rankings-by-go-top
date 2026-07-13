/**
 * Grounding + entity-validation + count-preservation harness (stabilized).
 * Pure logic + injected repair/refill stubs (offline, deterministic). Covers the
 * PR #22 stabilization requirements: safe canonical resolution, natural claim
 * repair (no destructive deletion), supporting-link independence, structured
 * reasons, and a realistic requested-12 → final-12 count-preservation funnel.
 */
import {
  normEntityToken, entityTokens, brandTokens, isBrandedTopic, entityMatchesBrand, matchingEntities,
  resolveEntities, entityAliases, filterBrandLinks, comparisonSides, comparisonIsGrounded,
  unsupportedClaims, claimsProtectedAudience, hasUnsupportedClaim, sanitizeReason, isNonEvidenceReason,
  assessGrounding, cannibalizesAnswer, collapseCrossSource, canonicalizeBrandForms, buildEvidenceReason,
  type EntityRecord, type GroundingEvidence,
} from '../grounding'
import { refineAndSelect, type RefineCtx, type RepairTitleFn, type RefillFn } from '../refine'
import type { TopicSuggestion } from '../types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const YEAR = 2026
const ent = (id: string, type: EntityRecord['type'], title: string, url?: string): EntityRecord => ({ id, type, title, url })
const mk = (title: string, kw = title, score = 0.7, reason = 'נושא תומך אמיתי', intent = 'informational'): TopicSuggestion =>
  ({ id: `t:${title}`, title, primaryKeyword: kw, secondaryKeywords: [], searchIntent: intent, recommendedWordCount: 1000, angle: '', suggestedInternalLinks: [], source: 'site_scan', suggestionReason: reason, suggestionScore: score })

// A NATURAL bounded repair stub: rewrites a weak/claim-laden title into a clean,
// claim-free Hebrew title that preserves the Latin brand when present. Never a
// token-deleted fragment.
const stubRepair: RepairTitleFn = async (c) => {
  const latin = (c.title.match(/[A-Za-z][A-Za-z'’.\-]*/) || c.primaryKeyword.match(/[A-Za-z][A-Za-z'’.\-]*/) || [])[0]
  return { title: latin ? `כך תבחרו בושם ${latin} שמתאים לכם` : 'כך תבחרו בושם שמתאים לכם לפי הצורך', reason: 'נושא מעשי וממוקד' }
}

async function main() {
  console.log('1) canonical entity identity — Acqua di Parma ≠ Profumum Roma')
  {
    const entities = [ent('gid://acqua', 'brand', 'Acqua di Parma Colonia'), ent('gid://prof1', 'product', 'Profumum Roma Acqua Viva'), ent('gid://prof2', 'product', 'Profumum Roma Acqua e Zucchero')]
    const brandEn = brandTokens('Acqua di Parma guide', 'Acqua di Parma')
    check('brand phrase multi-token', brandEn.length >= 2, brandEn.join(','))
    check('Acqua di Parma matches its own entity', entityMatchesBrand(brandEn, 'Acqua di Parma Colonia'))
    check('does NOT match Profumum Roma Acqua Viva', !entityMatchesBrand(brandEn, 'Profumum Roma Acqua Viva'))
    check('only the real brand entity resolves', matchingEntities(brandEn, entities).length === 1 && matchingEntities(brandEn, entities)[0].id === 'gid://acqua')
  }

  console.log('2) unsupported children-perfume idea discarded')
  {
    const noChild: GroundingEvidence = { entities: [ent('gid://n', 'category', 'בשמי נישה')], keywordBacked: false, existingTitles: [] }
    check('claimsProtectedAudience(לילדים)', claimsProtectedAudience('בשמי נישה לילדים'))
    check('children NOT grounded', !assessGrounding(mk('בשמי נישה לילדים'), noChild).grounded)
    check('children claim unsupported w/o evidence', unsupportedClaims('בשמי נישה לילדים', 'בשמי נישה').some((c) => c.discard))
    check('children claim SUPPORTED w/ child products', !unsupportedClaims('בשמי נישה לילדים', 'בשמים לילדים ללא אלכוהול').some((c) => c.discard))
  }

  console.log('3) Calvin Klein with no matching entity → discarded')
  {
    const ev: GroundingEvidence = { entities: [ent('gid://tf', 'brand', 'Tom Ford'), ent('gid://gucci', 'category', 'Gucci')], keywordBacked: false, existingTitles: [] }
    check('CK (he) NOT grounded', !assessGrounding(mk('מדריך מלא לבשמי קלווין קליין', 'קלווין קליין'), ev).grounded)
    check('CK (latin) NOT grounded', !assessGrounding(mk('Calvin Klein perfumes guide', 'Calvin Klein'), ev).grounded)
  }

  console.log('4) safe canonical matching — no unsafe fuzzy merges (negative tests)')
  {
    const twoClose = [ent('gid://a', 'brand', 'בורוג׳ Borouj'), ent('gid://b', 'brand', 'בורוס Boros')]
    const res = resolveEntities(brandTokens("בשמי ברוז'", "ברוז'"), twoClose)
    check('ambiguous fuzzy does NOT resolve', res.matches.length === 0 && res.ambiguous)
    check('ambiguous → no canonical rewrite', canonicalizeBrandForms("בשמי ברוז' לגבר", twoClose) === "בשמי ברוז' לגבר")
    const one = [ent('gid://borouj', 'brand', 'בורוג׳ Borouj')]
    check("single-brand fuzzy resolves ברוז' → Borouj", resolveEntities(brandTokens("בשמי ברוז'", "ברוז'"), one).matches.length === 1)
    check('Amouage topic does not match Armani entity', !entityMatchesBrand(brandTokens('Amouage guide', 'Amouage'), 'Armani'))
    check('Woods Collection ≠ Wood Essence', matchingEntities(brandTokens('Woods Collection guide', 'Woods Collection'), [ent('gid://we', 'brand', 'Wood Essence')]).length === 0)
  }

  console.log('5) exact English/Hebrew alias canonicalizes')
  {
    const aliases = entityAliases('בורוג׳ Borouj')
    check('alias set has hebrew form', aliases.has('בורוג'))
    check('alias set has latin form', aliases.has('borouj'))
    const entities = [ent('gid://tf', 'brand', 'Tom Ford טום פורד')]
    check('English alias resolves', matchingEntities(['tom', 'ford'], entities).length === 1)
    check('Hebrew alias resolves', matchingEntities(brandTokens('בשמי טום פורד', 'טום פורד'), entities).length === 1)
  }

  console.log('6) natural claim repair — not destructive token deletion')
  {
    const entities = [ent('gid://gucci', 'category', 'Gucci')]
    const ev: GroundingEvidence = { entities, keywordBacked: false, existingTitles: [] }
    const ctx: RefineCtx = {
      existingTitles: [], language: 'he', year: YEAR, isDuplicate: () => false,
      assessGrounding: (c) => assessGrounding(c, ev), evidenceTextFor: () => entities.map((e) => e.title).join(' '), existingTopics: [],
    }
    const gucci = mk("בשמי גוצ'י: ניחוחות אייקוניים וטרנדים חדשים", 'Gucci')
    check('gucci claim detected unsupported', hasUnsupportedClaim(gucci.title, 'Gucci'))
    const { selected: gSel } = await refineAndSelect([gucci], 1, ctx, stubRepair, null)
    check('gucci survives (valid topic)', gSel.length === 1)
    check('gucci title has NO iconic/trend claim after repair', gSel.length === 1 && !/אייקוני|טרנד/.test(gSel[0].title), gSel[0]?.title)
    check('gucci title is natural (non-trivial length, brand kept)', gSel.length === 1 && gSel[0].title.length > 8 && /Gucci/.test(gSel[0].title), gSel[0]?.title)
    check('gucci reason is structured evidence (mentions entity)', gSel.length === 1 && /Gucci/.test(gSel[0].suggestionReason))

    const oCtx: RefineCtx = { ...ctx, assessGrounding: (c) => assessGrounding(c, { entities: [], keywordBacked: true, existingTitles: [] }), evidenceTextFor: () => '' }
    const { selected: oSel } = await refineAndSelect([mk('בשמים מזרחיים אותנטיים ואייקוניים', 'בשמים מזרחיים')], 1, oCtx, stubRepair, null)
    const { selected: sSel } = await refineAndSelect([mk('הבושם המושלם לקיץ הלוהט', 'בושם לקיץ')], 1, oCtx, stubRepair, null)
    check('oriental repaired claim-free', oSel.length === 1 && !/מזרחי|אייקוני/.test(oSel[0].title), oSel[0]?.title)
    check('seasonal repaired claim-free', sSel.length === 1 && !/לקיץ|לוהט/.test(sSel[0].title), sSel[0]?.title)

    const luxCtx: RefineCtx = {
      existingTitles: [], language: 'he', year: YEAR, isDuplicate: () => false,
      assessGrounding: (c) => assessGrounding(c, { entities: [], keywordBacked: true, existingTitles: [] }),
      evidenceTextFor: () => '', existingTopics: [{ title: 'איך לאחסן בשמים בבית', primaryKeyword: 'אחסון בשמים', searchIntent: 'care' }],
    }
    const { selected: lSel } = await refineAndSelect([mk('כיצד לאחסן בשמים יוקרתיים בבית', 'אחסון בשמים יוקרתיים', 0.7, 'r', 'care')], 1, luxCtx, stubRepair, null)
    check('luxury-storage discarded via cannibalization', lSel.length === 0)
  }

  console.log('7) supporting-link validation is independent of topic validity')
  {
    const entities = [ent('gid://acqua', 'category', 'Acqua di Parma', 'https://s/acqua'), ent('gid://prof1', 'product', 'Profumum Roma Acqua Viva', 'https://s/prof1')]
    const ev: GroundingEvidence = { entities, keywordBacked: false, existingTitles: [] }
    const g = assessGrounding(mk('בשמי Acqua di Parma', 'Acqua di Parma'), ev)
    check('Acqua topic grounded (category exists)', g.grounded && g.primaryEntityId === 'gid://acqua')
    const brand = brandTokens('בשמי Acqua di Parma', 'Acqua di Parma')
    const links = [{ url: 'https://s/prof1', anchor: 'Profumum Roma Acqua Viva' }, { url: 'https://s/acqua', anchor: 'Acqua di Parma' }]
    const { kept, dropped } = filterBrandLinks(brand, links, (u) => entities.find((e) => e.url === u)?.title)
    check('Profumum link removed', dropped.some((l) => l.url === 'https://s/prof1'))
    check('only Acqua link retained', kept.length === 1 && kept[0].url === 'https://s/acqua')
    const noneKept = filterBrandLinks(brand, [{ url: 'https://s/prof1', anchor: 'Profumum Roma Acqua Viva' }], (u) => entities.find((e) => e.url === u)?.title)
    check('topic keeps zero links when none valid (not rejected)', noneKept.kept.length === 0)
  }

  console.log('8) no internal labels in reasons (structured evidence)')
  {
    check('cluster 8 stripped', sanitizeReason('נושא תומך (לפי סריקת האתר: cluster 8)').indexOf('cluster') === -1)
    check('מותגים פופולריים → empty', sanitizeReason('מותגים פופולריים').length === 0)
    check('cluster-only is non-evidence', isNonEvidenceReason('cluster 2'))
    const r = buildEvidenceReason({ grounded: true, kind: 'entity', canonicalEntityName: 'Tom Ford', primaryEntityType: 'category', supportingEntityIds: ['a', 'b', 'c'] }, 'he', 'Tom Ford')
    check('structured reason names entity + count, no label', /Tom Ford/.test(r) && /3/.test(r) && !/cluster/i.test(r), r)
  }

  console.log('9) cross-source duplicate collapse + cannibalization false-positive protection')
  {
    const a = { ...mk('בשמי מזרחיים למתחילים', 'בשמים מזרחיים', 0.6), supportingSources: ['site_scan'] as unknown[] }
    const b = { ...mk('בשמי מזרחיים למתחילים', 'בשמים מזרחיים', 0.8), supportingSources: ['keyword_research_url'] as unknown[] }
    const collapsed = collapseCrossSource([a, b])
    check('cross-source duplicate collapsed to one', collapsed.length === 1 && collapsed[0].suggestionScore === 0.8)
    const existing = [{ title: 'המסע של וניל ממדגסקר לבקבוק הבושם שלך', primaryKeyword: 'וניל בבישום', searchIntent: 'informational' }]
    check('vanilla paraphrase cannibalizes', cannibalizesAnswer(mk('המסע של ניחוחות וניל אל הבושם', 'וניל'), existing))
    check('vanilla EXTRACTION angle survives', !cannibalizesAnswer(mk('שיטות חילוץ וניל: הפקה טבעית מול סינתטית', 'חילוץ וניל'), existing))
  }

  console.log('10) comparison: both products must exist')
  {
    const entities = [ent('gid://t1', 'product', "Andy Tauer L'Air du Desert Marocain"), ent('gid://t2', 'product', 'Andy Tauer Lonestar Memories')]
    check('grounded when both exist', comparisonIsGrounded("L'Air du Desert Marocain vs Lonestar Memories", entities))
    check('blocked when second missing', !comparisonIsGrounded("L'Air du Desert Marocain vs Woods Collection Nabab", entities))
    check('two sides detected', comparisonSides('Creed Aventus vs Dior Sauvage') !== null)
  }

  console.log('11) determinism + immutable source objects')
  {
    const entities = [ent('gid://tf', 'brand', 'Tom Ford')]
    const ev: GroundingEvidence = { entities, keywordBacked: false, existingTitles: [] }
    const ctx: RefineCtx = { existingTitles: [], language: 'he', year: YEAR, isDuplicate: () => false, assessGrounding: (c) => assessGrounding(c, ev), evidenceTextFor: () => 'Tom Ford', existingTopics: [] }
    const src = mk('מדריך לבשמי Tom Ford לפי אירוע', 'Tom Ford')
    const before = JSON.stringify(src)
    const r1 = await refineAndSelect([src], 1, ctx, stubRepair, null)
    const r2 = await refineAndSelect([src], 1, ctx, stubRepair, null)
    check('source object not mutated', JSON.stringify(src) === before)
    check('deterministic', JSON.stringify(r1.selected.map((s) => s.title)) === JSON.stringify(r2.selected.map((s) => s.title)))
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n===== REALISTIC COUNT-PRESERVATION FUNNEL (requested 12) =====')
  {
    const entities: EntityRecord[] = [
      ent('gid://gucci', 'category', 'Gucci'), ent('gid://tomford', 'brand', 'Tom Ford'),
      ent('gid://amouage', 'brand', 'Amouage'), ent('gid://acqua', 'brand', 'Acqua di Parma Colonia'),
      ent('gid://guerlain', 'brand', 'Guerlain'), ent('gid://nishane', 'brand', 'Nishane'),
      ent('gid://xerjoff', 'brand', 'Xerjoff'), ent('gid://mfk', 'brand', 'Maison Francis Kurkdjian'),
      ent('gid://creed', 'brand', 'Creed'), ent('gid://borouj', 'brand', 'בורוג׳ Borouj'),
      ent('gid://byredo', 'brand', 'Byredo'), ent('gid://lelabo', 'brand', 'Le Labo'),
      ent('gid://tauer1', 'product', "Andy Tauer L'Air du Desert Marocain"), ent('gid://tauer2', 'product', 'Andy Tauer Lonestar Memories'),
    ]
    const existingTopics = [
      { title: 'המסע של וניל ממדגסקר לבקבוק הבושם שלך', primaryKeyword: 'וניל בבישום', searchIntent: 'informational' },
      { title: 'איך לאחסן בשמים בבית', primaryKeyword: 'אחסון בשמים', searchIntent: 'care' },
    ]
    const ev: GroundingEvidence = { entities, keywordBacked: false, existingTitles: existingTopics.map((t) => t.title) }
    const ctx: RefineCtx = {
      existingTitles: existingTopics.map((t) => t.title), language: 'he', year: YEAR,
      isDuplicate: () => false, assessGrounding: (c) => assessGrounding(c, ev),
      evidenceTextFor: () => entities.map((e) => e.title).join(' '), existingTopics,
    }
    // 20 candidates = 6 invalid + 14 valid, but the 14 valid map to only 8 DISTINCT
    // entity+intent clusters (6 are same-entity/intent duplicates that diversity
    // collapses) → first-pass yields 8 < 12, forcing the bounded refill to supply
    // 4 fresh grounded topics from underused indexed brands → final 12.
    const initial: TopicSuggestion[] = [
      mk('בשמי נישה לילדים', 'בשמי נישה לילדים', 0.6, 'פונה לקהל יעד חדש'),                            // unsupported children
      mk('מדריך מלא לבשמי קלווין קליין', 'קלווין קליין', 0.6, 'מותגים פופולריים'),                       // nonexistent CK entity
      mk("Andy Tauer L'Air du Desert Marocain vs Woods Collection Nabab", 'tauer vs woods', 0.6, 'cluster 2'), // invalid comparison
      mk('המסע של ניחוחות וניל אל הבושם', 'וניל', 0.6, 'מותגים מרובים'),                                 // vanilla cannibalization
      mk('כיצד לאחסן בשמים יוקרתיים בבית', 'אחסון בשמים יוקרתיים', 0.6, 'נושא כללי', 'care'),             // storage cannibalization
      mk('בשמי גוצ׳י נדירים במהדורה מוגבלת', 'Gucci', 0.6, 'cluster 8'),                                 // unsupported rarity claim
      // 8 distinct grounded entities:
      mk('מדריך לבשמי Tom Ford', 'Tom Ford', 0.75, 'קיים מותג'),
      mk('מדריך לבשמי Amouage', 'Amouage', 0.74),
      mk('מדריך לבשמי Gucci', 'Gucci', 0.73),
      mk('מדריך לבשמי Acqua di Parma', 'Acqua di Parma', 0.72),
      mk('מדריך לבשמי Guerlain', 'Guerlain', 0.71),
      mk('מדריך לבשמי Nishane', 'Nishane', 0.7),
      mk('מדריך לבשמי Xerjoff', 'Xerjoff', 0.69),
      mk('מדריך לבשמי Maison Francis Kurkdjian', 'Maison Francis Kurkdjian', 0.68),
      // 6 same-entity/intent duplicates → collapse into the 8 clusters above:
      mk('עוד על בשמי Tom Ford', 'Tom Ford', 0.5),
      mk('עוד על בשמי Amouage', 'Amouage', 0.5),
      mk('עוד על בשמי Gucci', 'Gucci', 0.5),
      mk('עוד על בשמי Acqua di Parma', 'Acqua di Parma', 0.5),
      mk('עוד על בשמי Guerlain', 'Guerlain', 0.5),
      mk('עוד על בשמי Nishane', 'Nishane', 0.5),
    ]
    // Refill draws only from UNDERUSED real indexed brands (never invalid ones).
    const refillPool = [
      mk('מדריך לבשמי Creed', 'Creed', 0.6), mk('בשמי בורוג׳ לגבר', 'בורוג׳', 0.6),
      mk('מדריך לבשמי Byredo', 'Byredo', 0.6), mk('מדריך לבשמי Le Labo', 'Le Labo', 0.6),
    ]
    let refillCalls = 0
    const refill: RefillFn = async (need) => { refillCalls++; return refillPool.slice(0, Math.min(refillPool.length, need + 1)) }
    const { selected, funnel } = await refineAndSelect(initial, 12, ctx, stubRepair, refill)
    const firstSel = funnel.initialCandidates - funnel.discardedUnsupported - funnel.discardedCannibalization - funnel.discardedDuplicate - funnel.discardedUnrecoverableGeneric
    console.log(`  initial candidates ......... ${funnel.initialCandidates}`)
    console.log(`  repaired ................... ${funnel.repaired}`)
    console.log(`  valid without repair ....... ${funnel.validNoRepair}`)
    console.log(`  discarded unsupported ...... ${funnel.discardedUnsupported}`)
    console.log(`  discarded cannibalization .. ${funnel.discardedCannibalization}`)
    console.log(`  discarded duplicate ........ ${funnel.discardedDuplicate}`)
    console.log(`  discarded unrecoverable .... ${funnel.discardedUnrecoverableGeneric}`)
    console.log(`  first-pass grounded kept ... ${firstSel}`)
    console.log(`  refill requested ........... ${funnel.refillRequested}`)
    console.log(`  refill accepted ............ ${funnel.refillAccepted}`)
    console.log(`  FINAL selection ............ ${funnel.finalCount}`)
    console.log(`  final reason ............... ${funnel.reason ?? '(none)'}`)
    const invalidDiscarded = funnel.discardedUnsupported + funnel.discardedCannibalization
    check('the 6 invalid topics were rejected', invalidDiscarded >= 6, `got ${invalidDiscarded}`)
    check('refill ran once', refillCalls === 1)
    check('FINAL count is exactly 12', funnel.finalCount === 12, `got ${funnel.finalCount}`)
    check('no final shortfall reason', !funnel.reason)
    check('every result grounded (no fabricated filler)', selected.every((s) => assessGrounding(s, ev).grounded))
    const entKeys = selected.map((s) => brandTokens(s.title, s.primaryKeyword).join(' '))
    check('no entity dominates (≤2 per entity)', Math.max(...Object.values(entKeys.reduce<Record<string, number>>((m, k) => { m[k] = (m[k] || 0) + 1; return m }, {}))) <= 2)
    check('no internal label in any reason', selected.every((s) => !/cluster|מותגים פופולריים|קהל יעד|נושא כללי/.test(s.suggestionReason)))
    check('rejected entities NOT reintroduced (no CK / children)', selected.every((s) => !/קלווין|קליין|לילדים/.test(s.title)))
  }

  console.log('\nprimitives sanity')
  check('normEntityToken strips geresh', normEntityToken('בורוג׳') === 'בורוג')
  check('entityTokens drops filler', !entityTokens('בשמי טום פורד').includes('בשמי'))
  check('isBrandedTopic latin', isBrandedTopic('מדריך לבשמי Gucci', 'Gucci'))
  check('isBrandedTopic false for informational', !isBrandedTopic('איך לבחור בושם ערב לגבר', 'בושם ערב'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
