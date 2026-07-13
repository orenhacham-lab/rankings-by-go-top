/**
 * Prompt-only recommendation QA — offline, no network.
 * Proves the minimal non-destructive validation + that the prompts carry the
 * required instructions. Uses MOCKED model outputs (plain objects), never a live
 * model, so it proves the APPLICATION does not mutate Hebrew — it cannot prove
 * live Gemini quality (that is the Preview smoke).
 */
import { validateIdea, normalizeTitleKey, hasStaleCurrentYear, isHistoricalYear } from '../validate'
import { recommendationGuidance, structuredOutputContract, pendingTopicsBlock, type PendingTopic } from '../prompt-guidance'
import { buildPrompt, completeSiteScanIdeas, type RawIdeaGen } from '../site-scan'
import { RECOMMENDATION_MODEL_PRIMARY, RECOMMENDATION_MODEL_FALLBACK, RECOMMENDATION_MODEL_VERSION } from '../model'
import { absorbPendingIntoAvoid, type PendingRow } from '../pending-avoid'
import { ExistingCorpus } from '../dedupe'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const YEAR = 2026
type Idea = { title?: unknown; primaryKeyword?: unknown; reason?: unknown }
const runValidation = (ideas: Idea[]) => {
  const seen = new Set<string>()
  const kept: Idea[] = []; const rejects: Record<string, number> = {}
  for (const g of ideas) { const r = validateIdea(g, seen, YEAR); if (r) rejects[r] = (rejects[r] ?? 0) + 1; else kept.push(g) }
  return { kept, rejects }
}

async function main() {
  console.log('A) minimal validation is NON-DESTRUCTIVE (byte-identical pass-through)')
  {
    // Real Hebrew words the earlier pipeline corrupted MUST pass through untouched.
    const ideas: Idea[] = [
      { title: 'רכישת דוגמיות בשמים — מדריך מעשי', primaryKeyword: 'דוגמיות בשמים', reason: 'קיימת קטגוריית דוגמיות באתר.' },
      { title: 'איך לבחור מאמר בושם מתאים', primaryKeyword: 'בחירת בושם', reason: 'פער תוכן קיים.' },
    ]
    const { kept } = runValidation(ideas.map((i) => ({ ...i })))
    check('both valid ideas kept', kept.length === 2)
    check('"דוגמיות" preserved exactly', String(kept[0].title).includes('דוגמיות') && !String(kept[0].title).includes('דגים'))
    check('"רכישה" preserved exactly', String(kept[0].title).includes('רכיש') && !/שוקינג/.test(String(kept[0].title)))
    check('"מאמר" preserved exactly', String(kept[1].title).includes('מאמר') && !/ממואיר/.test(String(kept[1].title)))
    check('title returned byte-identical to input', kept[0].title === ideas[0].title)
    // The corrupted forms only exist if the MODEL emits them — the app never creates them.
    check('app does not synthesize "דגים בשמים"', kept.every((k) => !/דגים בשמים/.test(String(k.title))))
    check('normalizeTitleKey does not mutate the stored title (key only)', normalizeTitleKey('רכישת דוגמיות') === 'רכישת דוגמיות' && 'רכישת דוגמיות'.length === 13)
  }

  console.log('B) year validation — reject stale current framing, keep history')
  {
    check('reject "המלצות לשנת 2024"', hasStaleCurrentYear('המלצות בשמים לשנת 2024', YEAR))
    check('keep "שנות ה-90" (historical)', !hasStaleCurrentYear('בשמים אייקוניים של שנות ה-90', YEAR) && isHistoricalYear('בשמים אייקוניים של שנות ה-90'))
    check('keep "בין 2000 ל-2010"', !hasStaleCurrentYear('איך השתנה הבישום בין 2000 ל-2010', YEAR))
    check('keep "הושק בשנת 1985"', !hasStaleCurrentYear('בושם שהושק בשנת 1985', YEAR))
    check('keep evergreen (no year)', !hasStaleCurrentYear('איך לבחור בושם ערב', YEAR))
    const { kept, rejects } = runValidation([{ title: 'הבשמים הטובים ל-2024', primaryKeyword: 'בשמים' }, { title: 'איך לבחור בושם ערב', primaryKeyword: 'בושם ערב' }])
    check('stale-year idea rejected, evergreen kept', kept.length === 1 && rejects.stale_year === 1)
  }

  console.log('C) exact-duplicate + empty + internal-label + missing-field rejection')
  {
    const { kept, rejects } = runValidation([
      { title: 'מדריך לבשמי Tom Ford', primaryKeyword: 'Tom Ford', reason: 'קיים מותג.' },
      { title: 'מדריך לבשמי Tom Ford', primaryKeyword: 'Tom Ford', reason: 'שוב.' },        // exact dup
      { title: '   ', primaryKeyword: 'x', reason: 'r' },                                    // empty title
      { title: 'נושא תקין', primaryKeyword: '', reason: 'r' },                                // empty keyword
      { title: 'נושא עם תווית', primaryKeyword: 'k', reason: 'לפי סריקת האתר: cluster 8' },   // internal label
      { primaryKeyword: 'k', reason: 'r' },                                                   // missing title field
    ])
    check('only the first Tom Ford kept', kept.length === 1)
    check('duplicate rejected', rejects.duplicate_title === 1)
    check('empty title rejected', rejects.empty_title === 1)
    check('empty keyword rejected', rejects.empty_keyword === 1)
    check('internal cluster label rejected', rejects.internal_label === 1)
    check('missing field rejected', rejects.missing_field === 1)
  }

  console.log('D) count preservation — 20 valid ideas → 20 kept (no over-removal)')
  {
    const ideas: Idea[] = Array.from({ length: 20 }, (_, i) => ({ title: `נושא ייחודי מספר ${i + 1} על בשמים`, primaryKeyword: `בושם ${i + 1}`, reason: `ראיה ${i + 1}` }))
    const { kept, rejects } = runValidation(ideas)
    check('all 20 kept', kept.length === 20, `got ${kept.length}`)
    check('zero rejects', Object.keys(rejects).length === 0)
  }

  console.log('E) prompt carries the required instructions (snapshot assertions)')
  {
    const g = recommendationGuidance('Hebrew', YEAR, 20)
    check('instructs natural Hebrew, no corruption', /never invent, shorten|corrupt a Hebrew word|דוגמיות/i.test(g))
    check('names preserved exactly (no new transliteration)', /EXACTLY as supplied|new transliteration/i.test(g))
    check('grounding: only supplied facts', /use ONLY facts and entities supplied/i.test(g))
    check('brand precision (Acqua ≠ Profumum)', /Acqua di Parma.*Profumum Roma|one shared generic word/i.test(g))
    check('no invented children/rarity/trends', /products for children|limited editions|rarity|trends/i.test(g))
    check('year 2026, keep historical', new RegExp(`${YEAR}`).test(g) && /שנות ה-90|historical years/i.test(g))
    check('no internal labels in reasons', /NEVER expose internal labels|cluster 8/i.test(g))
    const c = structuredOutputContract('Hebrew', 20)
    check('schema requires evidenceSummary + entity fields', /evidenceSummary/.test(c) && /sourceEntityName/.test(c) && /sourceEntityType/.test(c))
    check('schema: valid JSON, no markdown', /ONLY valid JSON/.test(c) && /no markdown/.test(c))
    const sp = buildPrompt('Hebrew', 'Oligarch — perfume store', 'CATEGORIES: Tom Ford | brand', [], 20, ['קיים מאמר'])
    check('site-scan prompt injects the shared guidance', /use ONLY facts and entities supplied/i.test(sp))
    check('site-scan schema no longer requests a sourceContext field', !/"sourceContext"/.test(sp) && /evidenceSummary/.test(sp))
  }

  console.log('F) centralized pinned model config (no scattered strings, not flash-lite)')
  {
    check('primary is a pinned Pro id', RECOMMENDATION_MODEL_PRIMARY === 'gemini-2.5-pro')
    check('fallback is NOT flash-lite', RECOMMENDATION_MODEL_FALLBACK !== 'gemini-2.5-flash-lite' && /flash|pro/.test(RECOMMENDATION_MODEL_FALLBACK))
    check('version tag present', typeof RECOMMENDATION_MODEL_VERSION === 'string' && RECOMMENDATION_MODEL_VERSION.length > 0)
  }

  console.log('G) Site Scan count-completion (injected model) — no deterministic fallback')
  {
    const idea = (t: string) => ({ title: t, primaryKeyword: t, reason: `ר-${t}`, evidenceSummary: `ראיה ל-${t}` })
    const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => idea(`${prefix} ${i + 1}`))

    // F.2/F.5: primary returns 16 → completion asked for exactly 4 → final 20.
    {
      const calls: { need: number; avoid: string[] }[] = []
      const stub = (batch1: number, batch2: number): (need: number, avoid: string[]) => Promise<RawIdeaGen> => {
        let call = 0
        return async (need, avoid) => {
          calls.push({ need, avoid })
          const ideas = call === 0 ? many('בסיס', batch1) : many('השלמה', batch2)
          call++
          return { ideas, ok: true, modelUsed: RECOMMENDATION_MODEL_PRIMARY }
        }
      }
      calls.length = 0
      const r = await completeSiteScanIdeas(20, ['קיים מאמר'], YEAR, stub(16, 4))
      check('first call requests 20', calls[0].need === 20)
      check('completion requested exactly 4', calls[1] && calls[1].need === 4, `got ${calls[1]?.need}`)
      check('4 valid completion ideas → final 20', r.validIdeas.length === 20, `got ${r.validIdeas.length}`)
      check('retry was used', r.retryUsed && r.shortfall === 0)
      check('completion model is the centralized primary', r.modelUsed === RECOMMENDATION_MODEL_PRIMARY)
      check('completion avoid includes already-generated titles', calls[1].avoid.includes('בסיס 1') && calls[1].avoid.includes('בסיס 16'))
      check('completion avoid keeps existing article title', calls[1].avoid.includes('קיים מאמר'))
    }

    // F.6: completion returns only 2 → final 18, shortfall recorded, no filler.
    {
      let call = 0
      const stub = async (): Promise<RawIdeaGen> => { const ideas = call === 0 ? many('בסיס', 16) : many('השלמה', 2); call++; return { ideas, ok: true, modelUsed: RECOMMENDATION_MODEL_PRIMARY } }
      const r = await completeSiteScanIdeas(20, [], YEAR, stub)
      check('2 valid completion ideas → final 18', r.validIdeas.length === 18, `got ${r.validIdeas.length}`)
      check('exact shortfall recorded (2)', r.shortfall === 2)
      check('no deterministic filler in the set', r.validIdeas.every((g) => !/טעויות נפוצות וטיפים|המדריך המלא:/.test(g.title || '')))
    }

    // Never emits the legacy fallback templates, and drops invalid/dup in completion.
    {
      let call = 0
      const stub = async (): Promise<RawIdeaGen> => {
        const ideas = call === 0
          ? [...many('בסיס', 15), { title: 'המדריך המלא: Guerlain', primaryKeyword: 'x', reason: 'r' }] // includes a legacy-looking model title (still just data, but…)
          : [idea('חדש א'), idea('בסיס 1') /* dup */, { title: '  ', primaryKeyword: 'y', reason: 'r' } /* empty */]
        call++
        return { ideas, ok: true, modelUsed: RECOMMENDATION_MODEL_PRIMARY }
      }
      const r = await completeSiteScanIdeas(20, [], YEAR, stub)
      check('completion dedups against generated (בסיס 1 dropped)', r.rejects.duplicate_title === 1)
      check('completion drops empty title', r.rejects.empty_title === 1)
      check('no application-side fallback templates injected', r.validIdeas.filter((g) => /טעויות נפוצות וטיפים/.test(g.title || '')).length === 0)
    }
  }

  console.log('H) cross-run dedup — pending suggestions in the avoid corpus + prompt list')
  {
    const corpus = new ExistingCorpus()
    // Existing site content (unchanged behavior).
    corpus.add('איך לאחסן בשמים בבית')
    const existingTitles: string[] = ['איך לאחסן בשמים בבית']

    // First-run PENDING cards the second run must avoid.
    const pending: PendingRow[] = [
      { title: 'איך לגרום לבושם להחזיק מעמד לאורך זמן?', primary_keyword: 'עמידות בושם' },
      { title: 'מה זה בושם נישה? ההבדלים המהותיים בינו לבין בושם מעצבים', primary_keyword: 'בושם נישה מול מעצבים' },
    ]
    const before = pending.map((p) => p.title)
    const added = absorbPendingIntoAvoid(pending, corpus, existingTitles)
    check('all pending titles added to the avoid list', added === 2)
    check('pending titles pushed into existingTitles (Gemini avoid)', existingTitles.includes(pending[0].title) && existingTitles.includes(pending[1].title))
    check('pending title stored BYTE-IDENTICAL (no Hebrew mutation)', existingTitles[existingTitles.length - 1] === before[1])

    // F.6/F.7: exact normalized pending title + keyword are duplicates now.
    check('exact pending title is a duplicate', corpus.isDuplicate('איך לגרום לבושם להחזיק מעמד לאורך זמן?'))
    check('exact pending primary keyword is a duplicate', corpus.isDuplicate('עמידות בושם'))
    // High token-overlap near-dup of a pending title is caught by the EXISTING jaccard.
    check('high-overlap near-dup of a pending title is caught', corpus.isDuplicate('איך לגרום לבושם להחזיק מעמד לאורך זמן'))
    // F.8: existing-content dedup still works (article near-dup blocked).
    check('existing article near-dup still blocked (unchanged)', corpus.isDuplicate('איך לאחסן בשמים בבית בקלות בקלות'.replace('בקלות בקלות', '')))
    // F.9: a genuinely NEW distinct topic is NOT blocked (second run can add it).
    check('distinct new topic survives (not a duplicate)', !corpus.isDuplicate('השוואת תווי ראש בין וניל למוסק בבשמים'))
    check('pending keyword null is tolerated', absorbPendingIntoAvoid([{ title: 'נושא חדש לגמרי על אוד', primary_keyword: null }], corpus, existingTitles) === 1)

    // The prompt itself instructs the model NOT to paraphrase the avoid list.
    const g = recommendationGuidance('Hebrew', YEAR, 20)
    void g
    const kwPromptHasAvoid = buildPrompt('Hebrew', 'ctx', 'digest', [], 20, [pending[0].title])
      .includes('do NOT repeat or paraphrase')
    check('prompt tells the model not to paraphrase pending/existing titles', kwPromptHasAvoid)
  }

  console.log('I) structured pending context + Gemini duplicate self-check')
  {
    const pending: PendingTopic[] = [
      { title: 'טכניקת שכבות (Layering) בבשמים: איך לשלב ניחוחות וליצור חתימת ריח אישית', primaryKeyword: 'שכבות של בשמים', intent: 'informational', secondaryKeywords: ['שילוב בשמים', 'בושם בשכבות', 'perfume layering'] },
      { title: 'מה זה בושם נישה?', primaryKeyword: 'בושם נישה', intent: 'informational', secondaryKeywords: [] },
    ]
    const block = pendingTopicsBlock(pending)
    // G.1: records include title / primaryKeyword / intent / secondaryKeywords
    check('block includes pending title (byte-identical)', block.includes(pending[0].title))
    check('block includes primaryKeyword', block.includes('"primaryKeyword":"שכבות של בשמים"'))
    check('block includes intent', block.includes('"intent":"informational"'))
    check('block includes secondaryKeywords', block.includes('perfume layering') && block.includes('שילוב בשמים'))
    // G.2: explicit duplicate families
    check('family: Layering / שילוב בשמים / perfume layering', /שכבות בושם.*שילוב בשמים.*perfume layering/s.test(block))
    check('family: niche beginner vs what-is-niche', /מה זה בושם נישה.*מדריך למתחילים בבשמי נישה/s.test(block))
    check('family: office vs work perfume', /בושם לעבודה.*בושם למשרד/s.test(block))
    check('family: EDP vs EDT / concentrations', /ריכוזי בושם.*EDP מול EDT/s.test(block))
    check('family: general Oud (and Sandalwood) guides', /Oud.*Sandalwood/s.test(block))
    // G.3: comparison dimensions required
    check('requires core question comparison', /core question/i.test(block))
    check('requires expected answer comparison', /expected answer/i.test(block))
    check('requires search intent comparison', /search intent/i.test(block))
    check('requires planned content sections comparison', /planned content sections/i.test(block))
    // D: preserve distinct depth
    check('allows materially different follow-up (no over-block)', /materially different follow-up|do NOT over-block/i.test(block))
    // G.4: pending context must NOT leak into user-facing reason
    check('instructs to keep the comparison note OUT of reason/evidenceSummary', /NEVER put that note.*reason.*evidenceSummary/s.test(block))
    // empty pending → empty block
    check('no pending → empty block', pendingTopicsBlock([]) === '')
    // The site-scan prompt actually injects the block.
    const sp = buildPrompt('Hebrew', 'ctx', 'digest', [], 20, ['קיים'], block)
    check('site-scan prompt injects the pending block', sp.includes('ALREADY-PENDING topics') && sp.includes('DUPLICATE SELF-CHECK'))
    // no pending block → prompt still valid, no empty artifacts
    check('site-scan prompt without pending block is clean', !buildPrompt('Hebrew', 'ctx', 'digest', [], 20, ['קיים']).includes('ALREADY-PENDING topics'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
