/**
 * finalizeRecommendationAttempt (Increment 2) — behavior + identity QA.
 *
 * Proves the extracted route post-processing preserves rule order, suggestion order,
 * rejection reasons/counts, and emits per-suggestion finalization outcomes. The
 * full-route behavioral identity is additionally proven by the browser E2E + the
 * frozen suite (both exercise the live route) staying green after the extraction.
 */
import { finalizeRecommendationAttempt } from '../recommendations/finalize-attempt'
import { buildKeywordGuardFromData, type KeywordGuard } from '../recommendations/keyword-guard'
import type { TopicSuggestion } from '../recommendations/types'

let pass = 0, fail = 0
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

const sug = (title: string, primaryKeyword: string, extra: Partial<TopicSuggestion> = {}): TopicSuggestion => ({
  id: `opportunity:${title}`, title, primaryKeyword, secondaryKeywords: [], searchIntent: 'informational',
  recommendedWordCount: 1000, angle: '', suggestedInternalLinks: [], source: 'hybrid', suggestionReason: 'סיבה תקינה וברורה לנושא.', suggestionScore: 0.8, ...extra,
})

function guardOf(): KeywordGuard {
  return buildKeywordGuardFromData({
    topics: [{ topic: 'מדריך קיים לחלוטין', primary_keyword: 'מדריך קיים' }],
    generatedArticleTitles: [],
    trackingKeywords: [],
    ideas: [{ title: 'רעיון ממתין', primary_keyword: 'ביטוי ממתין רחב', fingerprint: 'fp1', status: 'pending' }],
    scanTargets: [],
    shopifyEntities: [{ title: 'מוצר בעלות ישות', handle: 'x', entity_type: 'product' }],
  })
}
const existingPages = Array.from(guardOf().entityOwners).map((n) => ({ name: n, pageType: 'unknown' as const }))

async function main() {
  console.log('FINALIZE) deterministic route post-processing, order + reasons preserved')
  {
    const guard = guardOf()
    const engine = [
      sug('נושא נקי ראשון', 'ביטוי נקי ראשון'),                 // accepted
      sug('מדריך קיים לחלוטין', 'ביטוי אחר'),                    // title_exists
      sug('נושא על מוצר בעלות ישות', 'מוצר בעלות ישות'),          // exact_existing_keyword_owner (entity name)
      sug('נושא נקי שני', 'ביטוי נקי שני'),                      // accepted
    ]
    const fin = finalizeRecommendationAttempt({ guard, existingPages }, engine)
    check('F1. two clean suggestions survive, in original order', fin.finalSuggestions.length === 2 && fin.finalSuggestions[0].title === 'נושא נקי ראשון' && fin.finalSuggestions[1].title === 'נושא נקי שני', JSON.stringify(fin.finalSuggestions.map((s) => s.title)))
    check('F2. title_exists counted', fin.filteredTitleExists === 1 && fin.exactTopicDuplicates === 1)
    check('F3. exact_existing_keyword_owner counted', fin.exactExistingKeywordOwner === 1)
    check('F4. every engine suggestion has an outcome', fin.finalizationOutcomes.length === 4)
    check('F5. outcomes carry the right removal reasons', fin.finalizationOutcomes.filter((o) => o.removed).map((o) => o.reason).sort().join(',') === ['exact_existing_keyword_owner', 'title_exists'].sort().join(','), JSON.stringify(fin.finalizationOutcomes))
    check('F6. accepted outcomes are not removed', fin.finalizationOutcomes.filter((o) => !o.removed).length === 2)
  }

  console.log('FINALIZE) intra-run dedup collapses identical siblings')
  {
    const guard = guardOf()
    const engine = [sug('אותו נושא בדיוק', 'אותו ביטוי בדיוק'), sug('אותו נושא בדיוק', 'אותו ביטוי בדיוק')]
    const fin = finalizeRecommendationAttempt({ guard, existingPages }, engine)
    check('F7. two identical → one survivor (intra-run) or one title_exists (intra-batch)', fin.finalSuggestions.length === 1, JSON.stringify({ n: fin.finalSuggestions.length, intra: fin.intraRun.removed }))
  }

  console.log('FINALIZE) an empty engine batch finalizes to empty without error')
  {
    const fin = finalizeRecommendationAttempt({ guard: guardOf(), existingPages }, [])
    check('F8. empty in → empty out', fin.finalSuggestions.length === 0 && fin.finalizationOutcomes.length === 0)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
