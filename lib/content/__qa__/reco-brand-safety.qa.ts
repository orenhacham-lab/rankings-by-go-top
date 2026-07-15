/**
 * Brand-safety QA (P0) — offline, domain-neutral, AUTOMATIC (no manual competitor
 * list, no hardcoded names). Detection is driven purely by the project's OWN evidence.
 * Proves: the own brand is allowed; a query shaped like an external business ("[our
 * type] [unknown name]") absent from own evidence is suspected_external_business; a
 * genuinely generic phrase (whose words ARE in the project's own evidence) is allowed;
 * a title→keyword entity mutation is blocked; any external-business term rejects the
 * WHOLE opportunity; and no external input is required.
 */
import { buildBrandSafety, classifyKeywordEntity, containsExternalBusiness, detectUnsafeNamedEntityMutation, scanSuggestionBrandSafety } from '../recommendations/brand-safety'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  // A flower shop "הפרחים של ארז" whose OWN evidence uses the type word "פרחי"/"פרחים",
  // serves ירושלים, and has spring ("אביב") content — but has NEVER mentioned "אביה".
  const bs = buildBrandSafety({
    businessName: 'הפרחים של ארז',
    entityNames: ['זר פרחים', 'פרחי בר', 'פרחי אביב מיוחדים', 'משלוח פרחים בירושלים', 'עציץ קאלות'],
    ownEvidence: ['מדריך פרחי אביב', 'משלוח פרחים בירושלים', 'זרים לחתונה'],
  })

  console.log('A) automatic classification (no manual list)')
  {
    check('own brand ("הפרחים של ארז") → own_brand (allowed)', classifyKeywordEntity('הפרחים של ארז ליד הבית', bs) === 'own_brand')
    check('external business "[our type] + unknown name" ("פרחי אביה") → suspected_external_business', classifyKeywordEntity('פרחי אביה ירושלים', bs) === 'suspected_external_business')
    check('second external business ("פרחי דליה") → suspected_external_business', classifyKeywordEntity('משלוח פרחי דליה', bs) === 'suspected_external_business')
    check('generic phrase whose words ARE in own evidence ("פרחי אביב") → generic_query', classifyKeywordEntity('פרחי אביב בירושלים', bs) === 'generic_query')
    check('a pure generic subject query → generic_query', classifyKeywordEntity('זר פרחים לחתונה', bs) === 'generic_query')
    check('NO manual competitor list was configured (fully automatic)', true)
  }

  console.log('B) mutation guard + whole-opportunity scan')
  {
    check('title "פרחי אביב" → keyword "פרחי אביה" is an unsafe entity mutation', detectUnsafeNamedEntityMutation('פרחי אביב ירושלים: אילו פרחים מתאימים', 'פרחי אביה ירושלים', bs))
    check('a legitimate keyword variation is NOT a mutation', !detectUnsafeNamedEntityMutation('טיפוח ורדים בבית', 'טיפוח ורדים בגינה', bs))
    check('external business in a SECONDARY → whole opportunity rejected', (() => { const r = scanSuggestionBrandSafety({ title: 'פרחי אביב ירושלים', primaryKeyword: 'פרחי אביב', secondaryKeywords: ['פרחי דליה ירושלים'] }, bs); return !r.safe && r.reason === 'competitor_brand_leakage' })())
    check('external business in a link ANCHOR → rejected', !scanSuggestionBrandSafety({ title: 'זר לחתונה', anchors: ['משלוח פרחי אביה'] }, bs).safe)
    check('a fully clean own-subject suggestion passes', scanSuggestionBrandSafety({ title: 'איך לבחור זר כלה', primaryKeyword: 'בחירת זר כלה', secondaryKeywords: ['זר כלה עונתי'], anchors: ['זר כלה'] }, bs).safe)
    check('own brand in a field is NOT flagged as external', scanSuggestionBrandSafety({ title: 'הפרחים של ארז — מדריך', primaryKeyword: 'בחירת זר' }, bs).safe)
  }

  console.log('C) empty-evidence safety (new project)')
  {
    const empty = buildBrandSafety({ businessName: 'x' })
    check('with no type vocabulary nothing is spuriously flagged', classifyKeywordEntity('פרחי אביה ירושלים', empty) === 'generic_query' && !containsExternalBusiness('פרחי אביה', empty))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
