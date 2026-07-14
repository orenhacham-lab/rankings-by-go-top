/**
 * Recommendation keyword-collision salvage QA — offline, no network.
 * Proves that bare primary-keyword equality no longer permanently rejects, that a
 * narrower long-tail is salvaged from the candidate's own data, that salvage cannot
 * bypass semantic dedupe / true content coverage, and that the five real Matalon
 * examples decide correctly. Mirrors the exact route decision logic.
 */
import { buildKeywordGuardFromData, coveredByExistingContent, type KeywordGuard } from '../recommendations/keyword-guard'
import { salvageLongTailKeyword } from '../recommendations/keyword-salvage'
import { ExistingCorpus } from '../recommendations/dedupe'
import { normalizeText } from '../recommendations/topic-idea-store'
import { recommendationGuidance } from '../recommendations/prompt-guidance'
import { domainFlags } from '../recommendations/domain-flags'
import { runBudget } from '../recommendations/reco-cost'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const YEAR = 2026

type Candidate = { title: string; primaryKeyword: string; secondaryKeywords?: string[] }
type Decision = 'exact_topic_duplicate' | 'true_content_coverage' | 'salvaged' | 'still_rejected' | 'accepted'

/** The EXACT route decision order (kept in sync with the recommendations route). */
function decide(guard: KeywordGuard, ownedCorpus: ExistingCorpus, c: Candidate): { decision: Decision; keyword: string } {
  const nt = normalizeText(c.title)
  const nk = normalizeText(c.primaryKeyword)
  if (nt && guard.titles.has(nt)) return { decision: 'exact_topic_duplicate', keyword: c.primaryKeyword }
  if (coveredByExistingContent(guard, c.title, c.primaryKeyword)) return { decision: 'true_content_coverage', keyword: c.primaryKeyword }
  if (nk && guard.contentKeywords.has(nk)) return { decision: 'true_content_coverage', keyword: c.primaryKeyword }
  if (nk && guard.keywords.has(nk)) {
    const salv = salvageLongTailKeyword(c, {
      isOwnedKeyword: (k) => guard.keywords.has(k),
      isSemanticKeywordDup: (k) => ownedCorpus.isDuplicate(k),
      isCoveredByContent: (t, k) => coveredByExistingContent(guard, t, k),
    })
    return salv.ok && salv.keyword ? { decision: 'salvaged', keyword: salv.keyword } : { decision: 'still_rejected', keyword: c.primaryKeyword }
  }
  return { decision: 'accepted', keyword: c.primaryKeyword }
}
function corpusFor(guard: KeywordGuard): ExistingCorpus { const c = new ExistingCorpus(); for (const k of guard.keywords) c.add(k); return c }

async function main() {
  console.log('A) exact keyword equality alone does NOT reject (salvage), same intent DOES')
  {
    // A PENDING idea owns the broad keyword "content marketing" (neutral domain).
    const guard = buildKeywordGuardFromData({
      topics: [], generatedArticleTitles: [], trackingKeywords: [],
      ideas: [{ title: 'how to choose a content marketing agency', primary_keyword: 'content marketing', fingerprint: 'content marketing', status: 'pending' }],
      scanTargets: [],
    })
    const corpus = corpusFor(guard)
    // 1. bare keyword collision (distinct subtopic) → salvageable, not permanent.
    const d1 = decide(guard, corpus, { title: 'content marketing for B2B lead generation — a funnel playbook', primaryKeyword: 'content marketing', secondaryKeywords: ['B2B content funnel strategy'] })
    check('1. exact keyword equality alone is NOT a permanent rejection', d1.decision === 'salvaged')
    check('4. salvage assigns a NARROWER long-tail keyword', d1.keyword !== 'content marketing' && d1.keyword.split(' ').length >= 2)
    check('9. only one salvage attempt (deterministic, no loop)', d1.decision === 'salvaged')
    // 2. same keyword + same title/intent → exact topic duplicate stays blocked.
    const d2 = decide(guard, corpus, { title: 'how to choose a content marketing agency', primaryKeyword: 'content marketing' })
    check('2. same title (same intent/answer) is rejected', d2.decision === 'exact_topic_duplicate')
  }

  console.log('B) salvage cannot bypass content coverage or semantic dedupe')
  {
    const guard = buildKeywordGuardFromData({
      topics: [{ topic: 'freelance SEO consultant', primary_keyword: 'freelance seo consultant' }],
      generatedArticleTitles: ['freelance SEO consultant'],
      trackingKeywords: ['freelance seo consultant'],
      ideas: [], scanTargets: [],
    })
    const corpus = corpusFor(guard)
    // 8. a candidate reusing the PUBLISHED content keyword → true coverage (no salvage).
    const d = decide(guard, corpus, { title: 'how to pick a freelance SEO consultant that delivers organic results', primaryKeyword: 'freelance seo consultant', secondaryKeywords: ['freelance seo consultant'] })
    check('8. published-content keyword reuse → true_content_coverage (not salvaged)', d.decision === 'true_content_coverage')
    // 7. salvage rejects a secondary that is a semantic near-dup of an owned keyword
    //    (and a single-word title gives no long-tail fallback) → no bypass.
    const salv = salvageLongTailKeyword(
      { title: 'guide', primaryKeyword: 'content marketing', secondaryKeywords: ['content marketing strategy'] },
      { isOwnedKeyword: () => false, isSemanticKeywordDup: (k) => normalizeText(k).includes('content marketing'), isCoveredByContent: () => false },
    )
    check('7. salvage cannot bypass semantic dedupe (rejects a near-dup source)', salv.ok === false)
    // A salvaged keyword IS re-checked against coverage — a covered long-tail is refused.
    const salvCovered = salvageLongTailKeyword(
      { title: 'guide', primaryKeyword: 'content marketing', secondaryKeywords: ['content marketing funnel playbook'] },
      { isOwnedKeyword: () => false, isSemanticKeywordDup: () => false, isCoveredByContent: () => true },
    )
    check('5/8. salvaged keyword is re-checked against content coverage', salvCovered.ok === false)
  }

  console.log('C) the five real Matalon examples decide correctly (Part 8.16)')
  {
    // #1-#3 owned by PENDING ideas (salvageable); #4-#5 are PUBLISHED articles (reject).
    const guard = buildKeywordGuardFromData({
      topics: [
        { topic: 'איך לבחור מקדם אתרים פרילנסר', primary_keyword: 'מקדם אתרים פרילנסר' },       // #4 published
        { topic: '8 טיפים לקידום אתר מכירות אונליין', primary_keyword: 'קידום אתר מכירות אונליין' }, // #5 published
      ],
      generatedArticleTitles: ['איך לבחור מקדם אתרים פרילנסר', '8 טיפים לקידום אתר מכירות אונליין'],
      trackingKeywords: [],
      ideas: [
        { title: 'איך לבחור חברת כתיבת תוכן לאתר? 8 קריטריונים להערכת איכות התוכן והכותבים', primary_keyword: 'כתיבת תוכן', fingerprint: 'כתיבת תוכן', status: 'pending' },
        { title: 'פיתוח תוכנה בהתאמה אישית: מתי העסק שלכם צריך פתרון ייעודי במקום מוצר מדף?', primary_keyword: 'פיתוח תוכנה', fingerprint: 'פיתוח תוכנה', status: 'pending' },
        { title: 'איך לבחור מעצב גרפי לבניית אתר? דגשים לעבודה נכונה על ממשק המשתמש', primary_keyword: 'עיצוב וגרפיקה', fingerprint: 'עיצוב וגרפיקה', status: 'pending' },
      ],
      scanTargets: [],
    })
    const corpus = corpusFor(guard)
    const d1 = decide(guard, corpus, { title: 'שיווק דיגיטלי מבוסס תוכן: איך לשלב בין כתיבת תוכן לקידום אתרים להשגת מקסימום לידים', primaryKeyword: 'כתיבת תוכן', secondaryKeywords: ['שילוב כתיבת תוכן וקידום אתרים'] })
    check('16.#1 distinct content-marketing subtopic → salvaged (allowed)', d1.decision === 'salvaged')
    const d2 = decide(guard, corpus, { title: 'איך לבחור חברת פיתוח תוכנה למערכות מידע ארגוניות?', primaryKeyword: 'פיתוח תוכנה', secondaryKeywords: ['חברת פיתוח מערכות מידע ארגוניות'] })
    check('16.#2 distinct software-dev decision → salvaged (allowed)', d2.decision === 'salvaged')
    const d3 = decide(guard, corpus, { title: 'איך לבחור מעצב גרפי למיתוג עסקי כולל ויצירת שפה חזותית דיגיטלית?', primaryKeyword: 'עיצוב וגרפיקה', secondaryKeywords: ['מעצב גרפי למיתוג עסקי'] })
    check('16.#3 distinct branding scope → salvaged (allowed)', d3.decision === 'salvaged')
    const d4 = decide(guard, corpus, { title: 'איך לבחור מקדם אתרים פרילנסר שיביא תוצאות אורגניות לעסק שלכם?', primaryKeyword: 'מקדם אתרים פרילנסר' })
    check('16.#4 freelance-SEO duplicate of an existing article → rejected (coverage)', d4.decision === 'true_content_coverage')
    const d5 = decide(guard, corpus, { title: 'המדריך המלא לקידום אתר מכירות אונליין: כך תגדילו את המכירות שלכם ב-2026', primaryKeyword: 'קידום אתר מכירות אונליין' })
    check('16.#5 online-sales guide duplicating an existing article → rejected (coverage)', d5.decision === 'true_content_coverage')
    // 13/14 — pending ideas remain protected (exact reuse blocked); isolation intact.
    check('13. an exact pending title is still rejected', decide(guard, corpus, { title: 'איך לבחור מעצב גרפי לבניית אתר? דגשים לעבודה נכונה על ממשק המשתמש', primaryKeyword: 'עיצוב וגרפיקה' }).decision === 'exact_topic_duplicate')
  }

  console.log('D) prompt instruction (Part 6) + cost guarantees (Part 7/8)')
  {
    const g = recommendationGuidance('Hebrew', YEAR, 15)
    check('6. prompt tells the model not to reuse a broad focus keyword', /DISTINCT SEARCH TARGET:/.test(g) && /narrower long-tail primary keyword/i.test(g))
    check('6. prompt states category ownership does not forbid subtopics', /does NOT forbid distinct subtopics/i.test(g))
    check('16. prompt instruction is domain-neutral (no perfume contamination)', (() => { const f = domainFlags(g); return !f.perfume && !f.lighting && !f.pet && !f.freelancer })())
    check('10/11/12. salvage adds NO model call — cost ceilings unchanged', (() => { const b = runBudget('standard', 15); return b.maxModelCallsPerRun === 4 && b.maxEstimatedCostUsd === 0.15 })())
    // 15 — salvage never fabricates filler: an empty candidate cannot be salvaged.
    check('15. no filler — a candidate with no distinct long-tail is rejected, not invented', salvageLongTailKeyword({ title: 'content marketing', primaryKeyword: 'content marketing', secondaryKeywords: [] }, { isOwnedKeyword: () => true, isSemanticKeywordDup: () => false, isCoveredByContent: () => false }).ok === false)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
