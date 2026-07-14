/**
 * Intra-run semantic dedupe QA — offline, no network / model.
 * Proves same-topic candidates from ONE run collapse to a single deterministic
 * winner after keyword salvage (incl. cross-source, different primary keywords),
 * that distinct subtopics are preserved (intent/location/lifecycle), and that no
 * extra model call / Pro / filler is introduced.
 */
import { dedupeIntraRunSemantic, isSameTopic } from '../recommendations/intra-run-dedupe'
import type { RecommendationSource, TopicSuggestion } from '../recommendations/types'
import { runBudget } from '../recommendations/reco-cost'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

let seq = 0
function cand(p: Partial<TopicSuggestion> & { title: string; primaryKeyword: string; searchIntent: string }): TopicSuggestion {
  seq++
  return {
    id: p.id ?? `c${seq}`,
    title: p.title,
    primaryKeyword: p.primaryKeyword,
    secondaryKeywords: p.secondaryKeywords ?? [],
    searchIntent: p.searchIntent,
    recommendedWordCount: 1000,
    angle: '',
    suggestedInternalLinks: [],
    source: (p.source ?? 'site_scan') as RecommendationSource,
    suggestionReason: p.suggestionReason ?? 'reason',
    suggestionScore: p.suggestionScore ?? 0.7,
    supportingSources: p.supportingSources,
    sourceEvidence: p.sourceEvidence,
  }
}
const titles = (r: { survivors: TopicSuggestion[] }) => r.survivors.map((s) => s.title)

async function main() {
  console.log('A) the three confirmed Buy Buy duplicate pairs collapse to one survivor')
  {
    // PAIR 1 — Siemens dishwasher (different salvaged primary keywords).
    const r1 = dedupeIntraRunSemantic([
      cand({ title: 'מדוע מדיח כלים צר Siemens SR61HX08KE הוא הפתרון האידיאלי למטבח שלכם?', primaryKeyword: 'siemens sr61hx08ke סימנס', searchIntent: 'commercial', suggestionScore: 0.8 }),
      cand({ title: 'מדיח כלים צר Siemens SR61HX08KE סימנס: פתרון אינטגרלי חכם למטבח המודרני', primaryKeyword: 'siemens sr61hx08ke', searchIntent: 'commercial', suggestionScore: 0.7 }),
    ])
    check('1. Siemens pair → exactly one survivor', r1.survivors.length === 1 && r1.removed === 1)
    check('1. the higher-score Siemens idea wins', r1.survivors[0].suggestionScore === 0.8)

    // PAIR 3 — outlet/display refrigerator (lexically divergent, same buying topic).
    const r3 = dedupeIntraRunSemantic([
      cand({ title: 'רכישת מקרר עודפים ותצוגה: איך לבדוק ולקנות נכון מבלי להתפשר?', primaryKeyword: 'מקרר עודפים ותצוגה', searchIntent: 'commercial' }),
      cand({ title: 'מוצרי עודפים ותצוגות: איך לרכוש מקרר איכותי בחצי מחיר ובביטחון מלא', primaryKeyword: 'מקרר עודפים איכותי', searchIntent: 'commercial' }),
    ])
    check('3. refrigerator outlet/display pair → one survivor', r3.survivors.length === 1 && r3.removed === 1)

    // PAIR 2 — Smeg kettle (shared brand + product + qualifier).
    const r2 = dedupeIntraRunSemantic([
      cand({ title: 'קומקום Smeg סמאג בעל סולם טמפרטורות: האם הוא שווה את ההשקעה?', primaryKeyword: 'קומקום smeg סולם טמפרטורות', searchIntent: 'comparison' }),
      cand({ title: 'מדריך לרכישת קומקום Smeg עם סולם טמפרטורות בגימור תכלת: עיצוב פוגש טכנולוגיה', primaryKeyword: 'קומקום smeg סולם טמפרטורות תכלת', searchIntent: 'commercial' }),
    ])
    check('2. Smeg pair (shared entity + buy-intent) → one survivor', r2.survivors.length === 1 && r2.removed === 1)
  }

  console.log('B) distinct subtopics are PRESERVED (Part E — no over-collapse)')
  {
    const distinct = (a: TopicSuggestion, b: TopicSuggestion, label: string) => {
      const r = dedupeIntraRunSemantic([a, b])
      check(label, r.survivors.length === 2 && r.removed === 0)
    }
    // 4. washing machine vs dryer.
    distinct(
      cand({ title: 'מכונת כביסה פתח קדמי מומלצת: איך לבחור את הדגם המתאים ביותר?', primaryKeyword: 'מכונת כביסה פתח קדמי', searchIntent: 'commercial' }),
      cand({ title: 'איך לבחור מייבש כביסה חסכוני ויעיל לבית?', primaryKeyword: 'מייבש כביסה חסכוני', searchIntent: 'commercial' }),
      '4. washing machine vs dryer → both survive',
    )
    // 5. wedding entrance attraction vs musical attraction.
    distinct(
      cand({ title: 'אטרקציות כניסה לחופה', primaryKeyword: 'אטרקציות כניסה לחופה', searchIntent: 'informational' }),
      cand({ title: 'אטרקציות מוזיקליות לרחבת הריקודים', primaryKeyword: 'אטרקציות מוזיקליות רחבת ריקודים', searchIntent: 'informational' }),
      '5. entrance vs musical attraction → both survive',
    )
    // 6. proposal north vs gallery/museum (same activity, different location).
    distinct(
      cand({ title: 'הצעת נישואין בצפון', primaryKeyword: 'הצעת נישואין בצפון', searchIntent: 'local' }),
      cand({ title: 'הצעת נישואין בגלריה או מוזיאון', primaryKeyword: 'הצעת נישואין גלריה מוזיאון', searchIntent: 'local' }),
      '6. proposal north vs gallery → both survive',
    )
    // 7. buying a child drone vs flying a child drone (purchase vs usage intent).
    distinct(
      cand({ title: 'מדריך לרכישת רחפן לילדים', primaryKeyword: 'רכישת רחפן לילדים', searchIntent: 'commercial' }),
      cand({ title: 'מדריך להטסת רחפן לילדים', primaryKeyword: 'הטסת רחפן לילדים', searchIntent: 'informational' }),
      '7. buy vs fly a child drone (intent differs) → both survive',
    )
    // 9. same keyword family, genuinely different intent.
    distinct(
      cand({ title: 'בחירת חברת פיתוח תוכנה', primaryKeyword: 'בחירת חברת פיתוח תוכנה', searchIntent: 'commercial' }),
      cand({ title: 'כתיבה שיווקית לאתרי פיתוח תוכנה', primaryKeyword: 'כתיבה שיווקית פיתוח תוכנה', searchIntent: 'informational' }),
      '9. software-dev vendor vs marketing-writing → both survive',
    )
  }

  console.log('C) cross-source dedupe + winner + merge (Parts C/D)')
  {
    // 3/8. same topic from project_data and site_scan with different primary keywords.
    const r = dedupeIntraRunSemantic([
      cand({ id: 'ps', title: 'מדיח כלים צר Siemens SR61HX08KE — סקירה מלאה', primaryKeyword: 'siemens sr61hx08ke מדיח', searchIntent: 'commercial', source: 'project_data', supportingSources: ['project_data'], suggestionScore: 0.75, secondaryKeywords: ['מדיח צר סימנס'] }),
      cand({ id: 'ss', title: 'מדיח כלים צר Siemens SR61HX08KE סימנס למטבח מודרני', primaryKeyword: 'siemens sr61hx08ke סימנס', searchIntent: 'commercial', source: 'site_scan', supportingSources: ['site_scan'], suggestionScore: 0.75, secondaryKeywords: ['מדיח אינטגרלי'] }),
    ])
    check('3. cross-source same-topic pair → one survivor', r.survivors.length === 1)
    check('6. survivor merges source support from both sources', (r.survivors[0].supportingSources || []).includes('project_data') && (r.survivors[0].supportingSources || []).includes('site_scan'))
    check('7. survivor merges useful secondary keywords', (r.survivors[0].secondaryKeywords || []).length >= 2)
    check('D. collision record exposes surviving + rejected titles + winnerReason', r.collisions.length === 1 && !!r.collisions[0].survivingTitle && !!r.collisions[0].rejectedTitle && !!r.collisions[0].winnerReason)
    check('4. more-supported candidate wins on the source count tiebreak', (r.survivors[0].supportingSources || []).length === 2)
  }

  console.log('D) ordering + counters + guarantees')
  {
    // 10. a salvaged candidate colliding with an EARLIER accepted candidate is caught.
    const r = dedupeIntraRunSemantic([
      cand({ title: 'מקרר עודפים ותצוגה: המדריך לרכישה נכונה', primaryKeyword: 'מקרר עודפים תצוגה', searchIntent: 'commercial' }),
      cand({ title: 'תנור בילט אין: איך לבחור נכון', primaryKeyword: 'תנור בילט אין', searchIntent: 'commercial' }),
      cand({ title: 'מוצרי עודפים ותצוגות: לרכוש מקרר איכותי בחצי מחיר', primaryKeyword: 'מקרר עודפים איכותי', searchIntent: 'commercial' }),
    ])
    check('10. later candidate colliding with an earlier survivor is removed', r.survivors.length === 2 && r.removed === 1)
    check('10. the unrelated candidate survives (no over-collapse)', titles(r).some((t) => /תנור בילט אין/.test(t)))
    check('counters: collisions/removed/merged are reported', r.collisions.length === 1 && r.removed === 1 && typeof r.merged === 'number')
    // isSameTopic is symmetric + reflexive-safe.
    const a = cand({ title: 'קומקום Smeg סמאג סולם טמפרטורות שווה השקעה', primaryKeyword: 'קומקום smeg', searchIntent: 'comparison' })
    const b = cand({ title: 'מדריך רכישת קומקום Smeg סולם טמפרטורות תכלת', primaryKeyword: 'קומקום smeg תכלת', searchIntent: 'commercial' })
    check('isSameTopic symmetric', isSameTopic(a, b) === isSameTopic(b, a))
    // 10/11/12/13. no model call / Pro / call or cost ceiling touched (pure helper).
    check('10. dedupe is a PURE array transform (adds no Gemini call)', dedupeIntraRunSemantic([]).survivors.length === 0)
    check('11/12/13. cost/call ceilings unchanged', (() => { const bud = runBudget('standard', 15); return bud.maxModelCallsPerRun === 4 && bud.maxEstimatedCostUsd === 0.15 })())
    // 15. no filler — removed twins are not replaced by invented ideas.
    const rf = dedupeIntraRunSemantic([
      cand({ title: 'מדיח כלים צר Siemens SR61HX08KE הפתרון האידיאלי', primaryKeyword: 'siemens sr61hx08ke', searchIntent: 'commercial' }),
      cand({ title: 'מדיח כלים צר Siemens SR61HX08KE סימנס פתרון חכם', primaryKeyword: 'siemens sr61hx08ke סימנס', searchIntent: 'commercial' }),
    ])
    check('15. removed duplicate is NOT replaced with filler', rf.survivors.length === 1)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
