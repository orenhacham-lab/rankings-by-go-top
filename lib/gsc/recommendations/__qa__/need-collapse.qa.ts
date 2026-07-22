/**
 * Stage E3A source-quality cleanup QA — GENERIC, multi-project. Proves the domain-neutral GSC
 * need-collapse + subject-bearing guard: strong near-duplicate query variants collapse into ONE
 * unique need, subjectless generic queries are rejected, meaningful modifiers stay distinct, and
 * the SAME deterministic functions produce the SAME decision across every project type / language.
 * The Ido Sport queries are regression fixtures only — they never define the implementation.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { collapseGscCandidates, partitionSubjectBearing, isSubjectBearingQuery, subjectCoreTokens } from '../../../content/recommendations/gsc-need-collapse'
import type { GscCandidate } from '../types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const cand = (o: Partial<GscCandidate> & { opportunityId: string; primaryQuery: string }): GscCandidate => {
  const d: GscCandidate = { opportunityId: '', primaryQuery: '', relatedQueries: [], page: 'https://x.co/p', clicks: 1, impressions: 100, ctr: 0.01, averagePosition: 8, opportunityScore: 70, reasonCodes: [], queryIntent: 'informational', signals: [], syncRunId: 'r', windowDays: 90 }
  return { ...d, ...o }
}
const collapses = (a: string, b: string) => collapseGscCandidates([cand({ opportunityId: 'a', primaryQuery: a }), cand({ opportunityId: 'b', primaryQuery: b })]).needs.length === 1

function main() {
  console.log('GSC Stage E3A — generic need-collapse + subject-bearing guard')

  // ── NEED COLLAPSE — live regression fixtures (Ido Sport) ────────────────────────
  check('(1) morning-food variants collapse into one need', collapses('מה לאכול לפני אימון בוקר', 'מה טוב לאכול לפני אימון בוקר'))
  check('(2) apostrophe/spelling variants collapse (פוצ׳יוולי / פוציוולי)', collapses("מה זה פוצ'יוולי", 'מה זה פוציוולי'))
  check('(3) "משחק" framing collapses ONLY if the contract proves it (currently distinct → not forced)', collapses('מה זה פיקלבול', 'מה זה משחק פיקלבול') === (subjectCoreTokens('מה זה פיקלבול').join(',') === subjectCoreTokens('מה זה משחק פיקלבול').join(',')))
  check('(4) meaningful audience modifiers stay separate (treadmill subtype)', !collapses('איך לבחור הליכון מתקפל', 'איך לבחור הליכון מקצועי'))
  check('(5) before-vs-after timing modifiers stay separate', !collapses('מה לאכול לפני אימון', 'מה לאכול אחרי אימון'))
  check('(6) folding vs professional treadmill stay separate', !collapses('הליכון לבית קטן', 'הליכון לחדר כושר מקצועי'))
  check('(7) one generic shared token never merges', !collapses('אימון בוקר למתחילים', 'אימון בוקר לספורטאים מקצועיים'))
  check('(8) same question frame, different subject → separate', !collapses('מה זה פוצ׳יוולי', 'מה זה פיקלבול'))

  // ── Representative selection + aggregation ──────────────────────────────────────
  {
    // three variants of one need with different metrics; highest source order is representative.
    const members = [
      cand({ opportunityId: 'lo', primaryQuery: 'כמה עולה ניקיון משרד', opportunityScore: 40, impressions: 300, clicks: 3, averagePosition: 4 }),
      cand({ opportunityId: 'hi', primaryQuery: 'מחיר ניקיון משרדים', opportunityScore: 90, impressions: 100, clicks: 7, averagePosition: 8 }),
      cand({ opportunityId: 'mid', primaryQuery: 'ניקיון משרד מחיר', opportunityScore: 60, impressions: 0, clicks: 0, averagePosition: 8 }),
    ]
    const { needs, collapsedNearDuplicateCount } = collapseGscCandidates(members)
    check('(collapse) all three price-of-office-cleaning variants collapse into one need', needs.length === 1 && collapsedNearDuplicateCount === 2)
    const n = needs[0]
    check('(9) representative = score DESC → impressions DESC → id ASC (hi)', n.candidate.opportunityId === 'hi' && n.candidate.primaryQuery === 'מחיר ניקיון משרדים')
    check('(11) clicks summed (3+7+0=10)', n.candidate.clicks === 10)
    check('(12) impressions summed (300+100+0=400)', n.candidate.impressions === 400)
    check('(13) aggregate CTR = total clicks / total impressions (10/400)', Math.abs(n.candidate.ctr - 10 / 400) < 1e-9)
    check('(14) averagePosition impression-weighted ((4*300+8*100)/400=5)', Math.abs(n.candidate.averagePosition - 5) < 1e-9)
    check('(15) representative opportunityScore retained (90), NOT summed', n.candidate.opportunityScore === 90)
    check('(16) related opportunity ids preserved (deterministic order)', n.relatedOpportunityIds.join(',') === 'hi,mid,lo')
    check('(17) related queries preserved (corresponding order)', n.relatedQueries.join('|') === 'מחיר ניקיון משרדים|ניקיון משרד מחיר|כמה עולה ניקיון משרד' && n.collapsedOpportunityCount === 3)
  }
  {
    // (10) representative selection is input-order independent.
    const a = cand({ opportunityId: 'a', primaryQuery: 'מחיר ניקיון משרד', opportunityScore: 30, impressions: 100 })
    const b = cand({ opportunityId: 'b', primaryQuery: 'כמה עולה ניקיון משרד', opportunityScore: 80, impressions: 100 })
    const r1 = collapseGscCandidates([a, b]).needs[0].candidate.opportunityId
    const r2 = collapseGscCandidates([b, a]).needs[0].candidate.opportunityId
    check('(10) representative selection is input-order independent', r1 === 'b' && r2 === 'b')
  }
  {
    // (18)(19)(20) non-collapsed brief carries singleton provenance.
    const solo = collapseGscCandidates([cand({ opportunityId: 'x', primaryQuery: 'איך להתחיל קליסטניקס' })]).needs[0]
    check('(18-20) non-collapsed need → singleton provenance', solo.relatedOpportunityIds.join(',') === 'x' && solo.relatedQueries.join(',') === 'איך להתחיל קליסטניקס' && solo.collapsedOpportunityCount === 1)
  }
  {
    // (21)(22) truthful collapse + unique-need counts.
    const set = [
      cand({ opportunityId: '1', primaryQuery: 'מה לאכול לפני אימון בוקר', opportunityScore: 90 }),
      cand({ opportunityId: '2', primaryQuery: 'מה טוב לאכול לפני אימון בוקר', opportunityScore: 80 }),
      cand({ opportunityId: '3', primaryQuery: 'איך לבחור הליכון מתקפל', opportunityScore: 70 }),
    ]
    const { needs, collapsedNearDuplicateCount } = collapseGscCandidates(set)
    check('(21) collapsedNearDuplicateCount truthful (3 raw → 2 needs → 1 absorbed)', collapsedNearDuplicateCount === 1)
    check('(22) uniqueNeedCount truthful (2 unique needs)', needs.length === 2)
  }

  // ── SUBJECT-BEARING GUARD ───────────────────────────────────────────────────────
  const reject = ['מה המחיר', 'כמה עולה', 'מחיר', 'מידע נוסף', 'פרטים נוספים', 'צור קשר', 'איך מזמינים', 'איפה קונים', 'what is the price', 'how much does it cost', 'more information', 'contact us', 'how to order', 'where to buy']
  const keep = ['מה המחיר של הליכון מתקפל', 'כמה עולה ספסל משקולות', 'מה זה פוציוולי', 'איך להתחיל קליסטניקס', 'כמה עולה ניקיון משרד', 'מה המחיר של פרגולת אלומיניום', 'מחיר מיטה אורטופדית לכלב', 'how much does office cleaning cost', 'what is the price of an aluminum pergola', 'how to choose an office chair']
  for (const q of reject) check(`(subjectless) rejected: "${q}"`, !isSubjectBearingQuery(q))
  for (const q of keep) check(`(subject-bearing) kept: "${q}"`, isSubjectBearingQuery(q))
  {
    // (17)(18) partition + truthful counts (no business vocabulary needed).
    const { subjectBearing, subjectless } = partitionSubjectBearing([cand({ opportunityId: '1', primaryQuery: 'מה המחיר' }), cand({ opportunityId: '2', primaryQuery: 'מה המחיר של הליכון מתקפל' })])
    check('(guard partition) subjectless separated from subject-bearing', subjectless.length === 1 && subjectBearing.length === 1 && subjectBearing[0].opportunityId === '2')
  }

  // ── MULTI-PROJECT DOMAIN MATRIX (generic; label never changes the decision) ──────
  const MERGE: [string, string, string][] = [
    ['fashion', 'מחיר שמלת ערב', 'כמה עולה שמלת ערב'],
    ['pet', 'מחיר מיטה אורתופדית לכלב', 'כמה עולה מיטה אורתופדית לכלב'],
    ['office-cleaning', 'כמה עולה ניקיון משרד', 'מחיר ניקיון משרדים'],
    ['aluminum', 'מחיר פרגולת אלומיניום', 'כמה עולה פרגולת אלומיניום'],
    ['english', 'how to choose an office chair', 'how do I choose the right office chair'],
  ]
  const NOMERGE: [string, string, string][] = [
    ['fashion-audience', 'שמלת ערב לנשים נמוכות', 'שמלת ערב לנשים גבוהות'],
    ['fashion-subtype', 'איך לבחור שמלת ערב', 'איך לבחור שמלת כלה'],
    ['pet-size', 'מיטה לכלב קטן', 'מיטה לכלב גדול'],
    ['pet-timing', 'מה לתת לכלב לפני אימון', 'מה לתת לכלב אחרי אימון'],
    ['cleaning-usecase', 'ניקיון משרד אחרי שיפוץ', 'ניקיון משרד בערב'],
    ['cleaning-location', 'ניקיון משרדים בתל אביב', 'ניקיון משרדים בירושלים'],
    ['aluminum-subtype', 'פרגולת אלומיניום למרפסת', 'סגירת מרפסת באלומיניום'],
    ['flowers-occasion', 'פרחים ליום הולדת', 'פרחים ליום האהבה'],
    ['legal-location', 'עורך דין פלילי בתל אביב', 'עורך דין פלילי בירושלים'],
    ['legal-usecase', 'עורך דין פלילי למעצר', 'עורך דין פלילי לחקירה'],
    ['english-usecase', 'office chair for back pain', 'office chair for small spaces'],
    ['english-timing', 'what to eat before a workout', 'what to eat after a workout'],
  ]
  for (const [label, a, b] of MERGE) check(`(matrix MERGE ${label}) collapses`, collapses(a, b))
  for (const [label, a, b] of NOMERGE) check(`(matrix KEEP ${label}) stays separate`, !collapses(a, b))

  // Determinism under shuffled input + project-label independence (the function takes NO project).
  {
    const queries = [...MERGE.flatMap(([, a, b]) => [a, b]), ...NOMERGE.flatMap(([, a, b]) => [a, b]), 'מה המחיר', 'what is the price']
    const build = (qs: string[]) => collapseGscCandidates(partitionSubjectBearing(qs.map((q, i) => cand({ opportunityId: `o${i}`, primaryQuery: q, opportunityScore: 100 - i }))).subjectBearing).needs.map((n) => n.relatedQueries.slice().sort().join('|')).sort()
    const forward = build(queries)
    const reversed = build(queries.slice().reverse())
    check('(determinism) collapse result identical under shuffled input', JSON.stringify(forward) === JSON.stringify(reversed))
  }

  // ── PRODUCTION SOURCE CONTRACT — no project/domain/category coupling ─────────────
  const prodFiles = ['lib/content/recommendations/gsc-need-collapse.ts', 'lib/content/recommendations/gsc-briefs.ts', 'lib/gsc/recommendations/adapter.ts', 'lib/content/recommendations/generate-from-briefs.ts']
  const FORBIDDEN = /idosport|ido[_-]?sport|\btreadmill\b|הליכון|פיקלבול|פוציוולי|\bfitness\b|\bnutrition\b|\bsports?\b|project_?id ===|domain ===|target_domain ===|business_name ===/i
  for (const f of prodFiles) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') // strip comments (regression fixtures live in QA, not prod)
    check(`(generic) ${f.split('/').pop()} has no project/domain/category-specific rule`, !FORBIDDEN.test(src))
  }
  const collapseSrc = read('lib/content/recommendations/gsc-need-collapse.ts')
  check('(generic) collapse imports only accepted semantic utils + GSC types (no vocab file)', /from '\.\/semantic-dup'/.test(collapseSrc) && !/category|vocabulary|allowlist|productList|business_?type/i.test(collapseSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')))
  check('(generic) subject guard uses framing removal, not a business word list', /isFramingToken/.test(collapseSrc) && /distinctiveTokensOf/.test(collapseSrc))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
