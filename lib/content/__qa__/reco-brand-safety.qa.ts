/**
 * Brand-safety QA (P0) — offline, domain-neutral. Competitor names come from a
 * user-maintained list (here: test fixtures), NEVER hardcoded in the engine. Proves:
 * a competitor keyword is blocked; the own brand is allowed; a generic phrase is
 * allowed; a one-character mutation of a title word into a business name is rejected;
 * a competitor term anywhere (title/keyword/secondary/reason/anchor/target) rejects the
 * WHOLE opportunity; competitor queries are classified so they can be dropped from
 * demand; variant/prefix/suffix forms are matched.
 */
import { buildBrandSafety, parseCompetitorList, classifyKeywordEntity, containsCompetitorTerm, detectUnsafeNamedEntityMutation, scanSuggestionBrandSafety } from '../recommendations/brand-safety'
import { contentTokens } from '../recommendations/evidence-cluster'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const tokSet = (arr: string[]) => new Set(arr.flatMap((s) => contentTokens(s)))

async function main() {
  // Own brand "הפרחים של ארז"; competitors "פרחי אביה" / "פרחי דליה"; generic vocab
  // from the shop's own product/coverage terms (so "פרחי"/"פרחים" are known-generic
  // and the distinctive name tokens are אביה/דליה/ארז).
  const bs = buildBrandSafety({
    businessName: 'הפרחים של ארז',
    competitorTerms: ['פרחי אביה', 'פרחי דליה'],
    genericVocab: tokSet(['זר פרחים', 'פרחי בר', 'משלוח פרחים בירושלים', 'עציץ קאלות']),
  })

  console.log('A) classification (competitor / own / generic)')
  {
    check('competitor keyword → competitor_brand', classifyKeywordEntity('פרחי אביה ירושלים', bs) === 'competitor_brand')
    check('second competitor → competitor_brand', classifyKeywordEntity('משלוח פרחי דליה', bs) === 'competitor_brand')
    check('own brand query → own_brand (not blocked)', classifyKeywordEntity('הפרחים של ארז ליד הבית', bs) === 'own_brand')
    check('genuinely generic phrase → generic_query (allowed)', classifyKeywordEntity('פרחי אביב ירושלים', bs) === 'generic_query')
    check('a near-generic word ("אביב") is NOT mis-flagged as the competitor "אביה"', classifyKeywordEntity('פרחי אביב', bs) === 'generic_query')
  }

  console.log('B) variant / prefix / suffix matching')
  {
    check('proclitic prefix ("לפרחי אביה") still matches the competitor', containsCompetitorTerm('לפרחי אביה בירושלים', bs))
    check('location suffix ("פרחי אביה ירושלים") still matches', containsCompetitorTerm('פרחי אביה ירושלים', bs))
    check('a clean generic phrase does NOT match', !containsCompetitorTerm('פרחי אביב ירושלים', bs))
  }

  console.log('C) unsafe named-entity mutation (title generic → keyword name)')
  {
    check('title "פרחי אביב" → keyword "פרחי אביה" is an unsafe mutation', detectUnsafeNamedEntityMutation('פרחי אביב ירושלים: אילו פרחים מתאימים', 'פרחי אביה ירושלים', bs))
    check('a legitimate keyword variation is NOT a mutation', !detectUnsafeNamedEntityMutation('טיפוח ורדים בבית', 'טיפוח ורדים בגינה', bs))
    check('an exact-title keyword is NOT a mutation', !detectUnsafeNamedEntityMutation('פרחי אביב ירושלים', 'פרחי אביב ירושלים', bs))
  }

  console.log('D) whole-opportunity rejection scan (title/keyword/secondary/reason/anchor/target)')
  {
    check('competitor in a SECONDARY keyword → whole opportunity rejected', (() => { const r = scanSuggestionBrandSafety({ title: 'פרחי אביב ירושלים', primaryKeyword: 'פרחי אביב', secondaryKeywords: ['פרחי דליה ירושלים'], suggestionReason: 'r' }, bs); return !r.safe && r.reason === 'competitor_brand_leakage' })())
    check('competitor in the REASON → rejected', !scanSuggestionBrandSafety({ title: 'זר לחתונה', suggestionReason: 'בהשוואה לפרחי אביה' }, bs).safe)
    check('competitor in a link ANCHOR → rejected', !scanSuggestionBrandSafety({ title: 'זר לחתונה', anchors: ['משלוח פרחי אביה'] }, bs).safe)
    check('competitor in a target TITLE → rejected', !scanSuggestionBrandSafety({ title: 'זר לחתונה', targetTitles: ['פרחי דליה בירושלים'] }, bs).safe)
    check('a fully clean suggestion passes', scanSuggestionBrandSafety({ title: 'איך לבחור זר כלה', primaryKeyword: 'בחירת זר כלה', secondaryKeywords: ['זר כלה עונתי'], suggestionReason: 'מדריך בחירה', anchors: ['זר כלה'], targetTitles: ['זר כלה קלאסי'] }, bs).safe)
    check('own brand in a field is NOT a competitor leak', scanSuggestionBrandSafety({ title: 'הפרחים של ארז — מדריך', primaryKeyword: 'בחירת זר' }, bs).safe)
  }

  console.log('E) demand cannot promote competitors; list parsing; no-list safety')
  {
    check('a competitor query is not generic → dropped from demand/seeding', classifyKeywordEntity('פרחי אביה', bs) !== 'generic_query')
    check('parseCompetitorList splits comma/newline lists', parseCompetitorList('פרחי אביה, פרחי דליה\nפרחי כהן').length === 3)
    const empty = buildBrandSafety({ businessName: 'x', competitorTerms: [], genericVocab: [] })
    check('no configured competitor terms → nothing is ever flagged', !containsCompetitorTerm('פרחי אביה ירושלים', empty) && classifyKeywordEntity('פרחי אביה', empty) === 'generic_query')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
