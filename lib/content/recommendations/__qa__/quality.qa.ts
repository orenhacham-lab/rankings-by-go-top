/**
 * Recommendation-quality harness (v3) — PURE logic + injected repair/refill.
 */
import {
  isGenericTitle, isPureGenericTitle, formulaicFamily, titleSkeleton, subjectKey,
  repairStaleYear, hasHistoricalYearContext, looksEnglish, repairReason, hasMixedBrandForm,
  primaryEntityKey, intentBucket, cannibalizes, selectDiverse, isUnsupportedClaim, needsTitleRepair,
} from '../quality'
import { refineAndSelect, type RefineCtx, type RepairTitleFn, type RefillFn } from '../refine'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const YEAR = 2026
const ent = (t: string) => primaryEntityKey(t, '')
const mk = (title: string, kw = title, score = 0.7, reason = 'r', intent = 'informational') =>
  ({ id: 't', title, primaryKeyword: kw, secondaryKeywords: [] as string[], searchIntent: intent, recommendedWordCount: 1000, angle: '', suggestedInternalLinks: [] as { url: string; anchor: string }[], source: 'site_scan' as const, suggestionReason: reason, suggestionScore: score })

// A deterministic repair stub: turns a weak title into a distinct natural one.
const stubRepair: RepairTitleFn = async (c) => ({ title: `איך לבחור ${c.primaryKeyword} לפי הצורך`, reason: 'נושא מעשי וממוקד' })
const noCtx: RefineCtx = { existingTitles: [], language: 'he', year: YEAR, isDuplicate: () => false }

async function main() {
  console.log('quality primitives (regression)')
  check('brand+tips pure-generic', isPureGenericTitle('Tom Ford - טום פורד — טעויות נפוצות וטיפים'))
  check('"גלו את סודות" formulaic', formulaicFamily('גלו את סודות הבישום') === 'secrets')
  check('brand+colon skeleton', titleSkeleton('Tom Ford: מדריך') === 'lead_sep')
  check('rare/limited unsupported', isUnsupportedClaim('בשמים נדירים במהדורה מוגבלת'))
  check('needsTitleRepair on lead_sep', needsTitleRepair('Ex Nihilo: השוואת הניחוחות'))
  check('needsTitleRepair false on natural', !needsTitleRepair('איך לבחור בושם ערב לגבר'))

  console.log('4) context-aware stale year')
  check('"לשנת 2024" repaired', repairStaleYear('הבשמים המומלצים לנשים לשנת 2024', YEAR).changed)
  check('"שנות ה-90" preserved', !repairStaleYear('הבשמים האייקוניים של שנות ה-90', YEAR).changed)
  check('"בין 2000 ל-2010" preserved', !repairStaleYear('איך השתנה עולם הבישום בין 2000 ל-2010', YEAR).changed)
  check('"הושקו בשנת 1985" preserved', !repairStaleYear('בשמים שהושקו בשנת 1985', YEAR).changed)

  console.log('6) cannibalization false-positive protection')
  {
    const existing = ['איך להתחיל את המסע בעולם הבישום', 'מדריך מתנות בושם']
    check('journey broadening cannibalizes', cannibalizes('המסע בעולם הבישום: איך להתחיל את הדרך לניחוח המושלם', existing))
    check('distinct: scent-family finder survives', !cannibalizes('איך לזהות את משפחת הריח שמתאימה לך כשמתחילים להתנסות בבשמים', existing))
    check('distinct: samples vs full bottle survives', !cannibalizes('דוגמיות או בקבוק מלא: הדרך הנכונה להתחיל להתנסות בבשמים', existing))
    check('distinct: discovery-set gift survives', !cannibalizes('סט התנסות בשמים כמתנה למי שרק מתחיל', existing))
    check('distinct: gift by recipient survives', !cannibalizes('בושם מתנה לפי טעם המקבל: מדריך בחירה', existing))
  }

  console.log('4/8) no fixed skeleton cap')
  {
    // 6 lead_sep, limit 6 → all survive (no hard cap); order is by utility.
    const six = ['Amouage', 'Tom Ford', 'Guerlain', 'Nishane', 'Byron', 'Borouj'].map((b, i) => mk(`${b}: מדריך`, b.toLowerCase(), 0.7 - i * 0.001))
    const out = selectDiverse(six, 6)
    check('no fixed cap — all lead_sep can survive when no alternative', out.length === 6)
  }

  console.log('1) requested 12 with ≥12 grounded → returns exactly 12 (no refill)')
  {
    const distinct = ['בושם ערב לגבר','בושם יום לאישה','בשמי אוד למתחילים','ניחוחות ורד רומנטיים','דוגמיות בושם להתנסות','בושם קיץ קליל','בושם חורף עוטף','מארז בושם כמתנה','בושם יוניסקס יומיומי','ניחוח וניל מתוק','בושם מאסק נקי','בשמי נישה ישראליים','בושם עדין למשרד','בושם לחתונה','בושם ספורט רענן','ניחוח ציטרוס מרענן']
    const items = distinct.map((t, i) => mk(t, `k${i}`, 0.8 - i * 0.01))
    const refill: RefillFn = async () => { throw new Error('refill should NOT be called') }
    const { selected, funnel } = await refineAndSelect(items, 12, noCtx, stubRepair, refill)
    check('returns exactly 12', selected.length === 12)
    check('funnel refillRequested = 0', funnel.refillRequested === 0)
    check('no reason (count met)', funnel.reason === undefined)
  }

  console.log('2) initial leaves 9 → one bounded refill supplies 3 → 12')
  {
    // 9 valid distinct + 5 duplicates (of the same 3 subjects) → 9 survive first pass.
    const validSubjects = ['בושם ערב לגבר','בשמי אוד למתחילים','ניחוח ורד רומנטי','דוגמיות בושם להתנסות','בושם קיץ קליל','מארז בושם מתנה','בושם יוניסקס יומי','ניחוח וניל מתוק','בושם עדין למשרד']
    const valid = validSubjects.map((t, i) => mk(t, `k${i}`, 0.82 - i * 0.01))
    const dups = Array.from({ length: 5 }, () => mk('בושם ערב לגבר', 'k0', 0.4))
    let refillArgs: { avoid: string[] } | null = null
    const refill: RefillFn = async (need, avoid) => {
      refillArgs = { avoid }
      const rf = ['בושם פרחוני לאביב','ניחוח עצי ליום','בושם גורמה מתוק','בושם ימי רענן','בושם עור עשיר']
      return rf.slice(0, need + 2).map((t, i) => mk(t, `rf${i}`, 0.6))
    }
    const { selected, funnel } = await refineAndSelect([...valid, ...dups], 12, noCtx, stubRepair, refill)
    check('final returns 12', selected.length === 12)
    check('refillRequested = 3', funnel.refillRequested === 3)
    check('refillAccepted ≥ 3', funnel.refillAccepted >= 3)
    check('no duplicate titles in result', new Set(selected.map((s) => s.title)).size === selected.length)
    check('refill avoid includes an already-selected subject', !!refillArgs && (refillArgs as { avoid: string[] }).avoid.some((a) => a.includes('בושם ערב לגבר')))
    check('reason undefined (count met)', funnel.reason === undefined)
  }

  console.log('3) weak title but valid topic → repaired, not discarded')
  {
    let repairCalls = 0
    const repair: RepairTitleFn = async (c) => { repairCalls++; return { title: `איך לבחור בין בשמי ${c.primaryKeyword}`, reason: 'השוואה מעשית' } }
    const items = [mk('Ex Nihilo: השוואת הניחוחות הפופולריים ביותר של המותג', 'ex nihilo', 0.75, 'r', 'comparison')]
    const { selected, funnel } = await refineAndSelect(items, 1, noCtx, repair, null)
    check('repair was called', repairCalls === 1)
    check('topic kept (not discarded)', selected.length === 1)
    check('title repaired (no longer lead_sep)', titleSkeleton(selected[0].title) !== 'lead_sep')
    check('funnel repaired = 1', funnel.repaired === 1)
    check('primaryKeyword preserved', selected[0].primaryKeyword === 'ex nihilo')
    check('intent preserved', selected[0].searchIntent === 'comparison')
  }

  console.log('4b) unsupported topic → discarded, NOT repaired')
  {
    let repairCalls = 0
    const repair: RepairTitleFn = async () => { repairCalls++; return { title: 'x', reason: 'y' } }
    const { selected, funnel } = await refineAndSelect([mk('מהדורות מוגבלות נדירות של המותג')], 1, noCtx, repair, null)
    check('unsupported discarded', selected.length === 0)
    check('repair NOT called for unsupported', repairCalls === 0)
    check('funnel discardedUnsupported = 1', funnel.discardedUnsupported === 1)
    check('reason insufficient (empty)', funnel.reason === 'insufficient_distinct_grounded_topics')
  }

  console.log('7) refill still short → fewer + exact reason')
  {
    const items = ['בושם ערב לגבר','בשמי אוד למתחילים','ניחוח ורד רומנטי','דוגמיות בושם להתנסות'].map((t, i) => mk(t, `k${i}`, 0.7))
    const refill: RefillFn = async () => [] // corpus exhausted
    const { selected, funnel } = await refineAndSelect(items, 10, noCtx, stubRepair, refill)
    check('returns the 4 valid (not padded)', selected.length === 4)
    check('exact reason', funnel.reason === 'insufficient_distinct_grounded_topics')
    check('no fabricated filler', selected.length === 4)
  }

  console.log('11) source objects immutable + deterministic')
  {
    const items = [mk('Tom Ford: מדריך', 'tom ford', 0.8), mk('איך לבחור בושם', 'k', 0.7)]
    const snap = JSON.stringify(items)
    const r1 = await refineAndSelect(items, 2, noCtx, stubRepair, null)
    check('inputs not mutated', JSON.stringify(items) === snap)
    const r2 = await refineAndSelect(items, 2, noCtx, stubRepair, null)
    check('deterministic selection', r1.selected.map((s) => s.title).join('|') === r2.selected.map((s) => s.title).join('|'))
  }

  // ================= BEFORE / AFTER FUNNEL (20-topic Preview) =================
  console.log('\n===== BEFORE / AFTER FUNNEL (20-topic Preview, requested 12) =====')
  {
    const preview = [
      'Amouage: גלו את סודות המותג', 'Ex Nihilo: השוואת הניחוחות הפופולריים ביותר של המותג',
      'Borouj: המדריך המלא לבשמים הערביים', 'Byron: הניחוחות ששינו את עולם הבישום',
      'Clive Christian: הבשמים היקרים והנדירים ביותר', 'Guerlain: המסע אל ההיסטוריה של המותג',
      'Kilian Paris: המדריך המלא לניחוחות העשירים והאלגנטיים', 'Maison Francis Kurkdjian: הטרנד החם ביותר',
      'Nishane: מבחר הניחוחות הטובים ביותר', 'Profumum Roma: לחשוף את סודות הבישום האיטלקי',
      'Tom Ford: כל מה שצריך לדעת', 'Tom Ford — טעויות נפוצות וטיפים',
      'הבשמים המומלצים ביותר לנשים לשנת 2024', 'המסע בעולם הבישום: איך להתחיל את הדרך לניחוח המושלם',
      'מתנות בושם מושלמות: איך לבחור את הניחוח', 'כיצד לתחזק ולאחסן בשמים בצורה נכונה',
      'איך לבחור בושם ערב לגבר לפי אישיות', 'השוואה בין הבשמים הבולטים של אקס ניהילו',
      'בשמי אוד למתחילים: מאיפה כדאי להתחיל', 'איזה בושם של גרלן מתאים לקיץ',
    ].map((t, i) => ({ ...mk(t, t, 0.75 - i * 0.01, 'Provides a deep dive into a critical consumer concern'), searchIntent: 'informational' }))
    const existing = ['איך להתחיל את המסע בעולם הבישום', 'מדריך מתנות בושם']
    const ctx: RefineCtx = { existingTitles: existing, language: 'he', year: YEAR, isDuplicate: () => false }
    // Deterministic repair that mimics Gemini producing a natural title per topic.
    let repairN = 0
    const repair: RepairTitleFn = async (c) => { repairN++; return { title: `${['איך לבחור','מדריך מעשי ל','למי מתאים','השוואה בין'][repairN % 4]} ${c.primaryKeyword.replace(/[:—-].*/, '').slice(0, 22)} ${repairN}`, reason: 'נושא ממוקד' } }
    const refill: RefillFn = async (need) => Array.from({ length: need + 3 }, (_, i) => mk(`רעיון רענן וממוקד ${i}`, `rf${i}`, 0.6))

    const engBrandStart = (l: { title: string }[]) => l.filter((x) => /^[A-Za-z]/.test(x.title)).length
    const colonBrand = (l: { title: string }[]) => l.filter((x) => /^[A-Za-z][A-Za-z '’.-]*:/.test(x.title)).length
    const generic = (l: { title: string }[]) => l.filter((x) => isGenericTitle(x.title)).length
    const stale = (l: { title: string }[]) => l.filter((x) => repairStaleYear(x.title, YEAR).changed).length

    const { selected, funnel } = await refineAndSelect(preview, 12, ctx, repair, refill)
    const engReasons = selected.filter((x) => looksEnglish((x as { suggestionReason?: string }).suggestionReason || '')).length

    console.log(`  requested ...................... ${funnel.requested}`)
    console.log(`  initial candidates ............. ${funnel.initialCandidates}`)
    console.log(`  valid without repair ........... ${funnel.validNoRepair}`)
    console.log(`  repaired successfully .......... ${funnel.repaired}`)
    console.log(`  discarded (duplicate) .......... ${funnel.discardedDuplicate}`)
    console.log(`  discarded (cannibalization) .... ${funnel.discardedCannibalization}`)
    console.log(`  discarded (unsupported) ........ ${funnel.discardedUnsupported}`)
    console.log(`  discarded (unrecoverable) ...... ${funnel.discardedUnrecoverableGeneric}`)
    console.log(`  refill requested ............... ${funnel.refillRequested}`)
    console.log(`  refill accepted ................ ${funnel.refillAccepted}`)
    console.log(`  FINAL result count ............. ${funnel.finalCount}${funnel.reason ? ` (${funnel.reason})` : ''}`)
    console.log(`  ---`)
    console.log(`  English-brand starts    before=${engBrandStart(preview)}  after=${engBrandStart(selected)}`)
    console.log(`  brand-colon formula     before=${colonBrand(preview)}  after=${colonBrand(selected)}`)
    console.log(`  generic/AI phrases      before=${generic(preview)}  after=${generic(selected)}`)
    console.log(`  stale-current-year      before=${stale(preview)}  after=${stale(selected)}`)
    console.log(`  English reasons         before=20  after=${engReasons}`)

    check('FINAL count preserved (=12)', funnel.finalCount === 12)
    check('generic/AI titles → 0', generic(selected) === 0)
    check('brand-colon formula → 0', colonBrand(selected) === 0)
    check('stale-year → 0', stale(selected) === 0)
    check('English reasons → 0', engReasons === 0)
    check('cannibalizing journey broadening removed', !selected.some((x) => x.title.includes('המסע בעולם הבישום: איך להתחיל')))
    const wide = await refineAndSelect(preview, 20, ctx, repair, refill)
    check('good natural topic not discarded', wide.selected.some((x) => x.title.includes('בושם ערב לגבר')) || wide.funnel.discardedUnrecoverableGeneric === 0)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
