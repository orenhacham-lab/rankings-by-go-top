/**
 * Prompt-only recommendation QA — offline, no network.
 * Proves the minimal non-destructive validation + that the prompts carry the
 * required instructions. Uses MOCKED model outputs (plain objects), never a live
 * model, so it proves the APPLICATION does not mutate Hebrew — it cannot prove
 * live Gemini quality (that is the Preview smoke).
 */
import { validateIdea, normalizeTitleKey, hasStaleCurrentYear, isHistoricalYear } from '../validate'
import { recommendationGuidance, structuredOutputContract, pendingTopicsBlock, projectContextBlock, deriveProjectFocus, type PendingTopic } from '../prompt-guidance'
import { buildPrompt, completeSiteScanIdeas, type SiteScanModelCall, type RunScope } from '../site-scan'
import { domainFlags, isCrossDomain, fingerprint } from '../domain-flags'
import { RECOMMENDATION_MODEL_PRIMARY, RECOMMENDATION_MODEL_FALLBACK, RECOMMENDATION_MODEL_VERSION } from '../model'
import { absorbPendingIntoAvoid, type PendingRow } from '../pending-avoid'
import { ExistingCorpus } from '../dedupe'
import { buildClustersPrompt, isVocabAligned, type ClusterInput } from '../keyword-research'
import { readFileSync } from 'fs'
import { join } from 'path'

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
    check('grounding: only project-owned facts', /use ONLY facts and entities present in the project-owned context/i.test(g))
    check('entity precision is domain-NEUTRAL (no real brand)', /do not treat two distinct named entities as identical merely because they share a generic word/i.test(g))
    check('no invented audiences/rarity/trends', /invent audiences, safety claims, limited editions, rarity/i.test(g))
    check('year 2026, keep historical', new RegExp(`${YEAR}`).test(g) && /שנות ה-90|historical years/i.test(g))
    check('no internal labels in reasons', /NEVER expose internal labels|cluster 8/i.test(g))
    const c = structuredOutputContract('Hebrew', 20)
    check('schema requires evidenceSummary + entity fields', /evidenceSummary/.test(c) && /sourceEntityName/.test(c) && /sourceEntityType/.test(c))
    check('schema: valid JSON, no markdown', /ONLY valid JSON/.test(c) && /no markdown/.test(c))
    const sp = buildPrompt('Hebrew', 'a store', 'CATEGORIES: some category | category', [], 20, ['קיים מאמר'])
    check('site-scan prompt injects the shared (neutral) guidance', /use ONLY facts and entities present in the project-owned context/i.test(sp))
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

    const SCOPE: RunScope = { generationRunId: 'run-A', requestedProjectId: 'proj-A', source: 'site_scan' }
    const modelCall = (ideas: ReturnType<typeof idea>[], over: Partial<SiteScanModelCall> = {}): SiteScanModelCall =>
      ({ prompt: 'P', responseText: JSON.stringify({ topics: ideas }), ideas, ok: true, modelUsed: RECOMMENDATION_MODEL_PRIMARY, parseError: null, ...over })

    // F.2/F.5: primary returns 16 → completion asked for exactly 4 → final 20.
    {
      const calls: { need: number; avoid: string[]; seq: number }[] = []
      let call = 0
      const r = await completeSiteScanIdeas(20, ['קיים מאמר'], YEAR, {
        scope: SCOPE,
        runCall: async (need, avoid, _p, seq) => { calls.push({ need, avoid, seq }); const ideas = call === 0 ? many('בסיס', 16) : many('השלמה', 4); call++; return modelCall(ideas) },
      })
      check('first call requests 20', calls[0].need === 20)
      check('completion requested exactly 4', calls[1] && calls[1].need === 4, `got ${calls[1]?.need}`)
      check('4 valid completion ideas → final 20', r.validIdeas.length === 20, `got ${r.validIdeas.length}`)
      check('completion model is the centralized primary', r.modelUsed === RECOMMENDATION_MODEL_PRIMARY)
      check('completion avoid includes already-generated titles', calls[1].avoid.includes('בסיס 1') && calls[1].avoid.includes('בסיס 16'))
      check('completion avoid keeps existing article title', calls[1].avoid.includes('קיים מאמר'))
      check('each call has a distinct callSequence', calls[0].seq === 0 && calls[1].seq === 1)
    }

    // F.6: completion returns only 2 → final 18, shortfall recorded, no filler.
    {
      let call = 0
      const r = await completeSiteScanIdeas(20, [], YEAR, { scope: SCOPE, runCall: async () => { const ideas = call === 0 ? many('בסיס', 16) : many('השלמה', 2); call++; return modelCall(ideas) } })
      check('2 valid completion ideas → final 18', r.validIdeas.length === 18, `got ${r.validIdeas.length}`)
      check('exact shortfall recorded (2)', r.shortfall === 2)
    }

    // I.3: a truncated/unparseable response persists ZERO partial topics + ONE clean retry.
    {
      let call = 0
      const purposes: string[] = []
      const r = await completeSiteScanIdeas(20, [], YEAR, {
        scope: SCOPE,
        runCall: async (_n, _a, purpose) => {
          purposes.push(purpose)
          if (call++ === 0) return modelCall([], { ok: false, parseError: 'unparseable', truncated: true, responseText: '{"topics":[{"title":"חצי' })
          return modelCall(many('נקי', 20))
        },
      })
      check('truncated call yields ZERO partial topics from that call', r.validIdeas.length === 20) // only the retry's clean 20
      check('exactly one clean retry after parse failure', purposes.filter((p) => p === 'retry_after_parse_failure').length === 1, purposes.join(','))
      check('primary was first', purposes[0] === 'primary')
    }

    // I.5: a response bound to another run/project cannot be consumed (runCall is a
    // per-run closure; here we prove the trace binds each call to THIS run only).
    {
      const r = await completeSiteScanIdeas(20, [], YEAR, {
        scope: SCOPE, collectTrace: true,
        runCall: async () => modelCall(many('נקי', 20)),
      })
      check('every trace entry carries THIS run id + project', r.trace.length > 0 && r.trace.every((t) => t.generationRunId === 'run-A' && t.requestedProjectId === 'proj-A'))
      check('every trace entry is source site_scan', r.trace.every((t) => t.source === 'site_scan'))
    }

    // I.6: two concurrent projects cannot exchange call contexts (separate scopes,
    // separate closures, separate traces).
    {
      const runA = completeSiteScanIdeas(20, ['A-existing'], YEAR, { scope: { generationRunId: 'run-A', requestedProjectId: 'proj-A', source: 'site_scan' }, collectTrace: true, runCall: async () => modelCall(many('פרילנסר', 20)) })
      const runB = completeSiteScanIdeas(20, ['B-existing'], YEAR, { scope: { generationRunId: 'run-B', requestedProjectId: 'proj-B', source: 'site_scan' }, collectTrace: true, runCall: async () => modelCall(many('בושם', 20)) })
      const [ra, rb] = await Promise.all([runA, runB])
      check('run A trace bound to proj-A only', ra.trace.every((t) => t.requestedProjectId === 'proj-A' && t.generationRunId === 'run-A'))
      check('run B trace bound to proj-B only', rb.trace.every((t) => t.requestedProjectId === 'proj-B' && t.generationRunId === 'run-B'))
      check('runs did not share candidate arrays', ra.validIdeas !== rb.validIdeas && ra.validIdeas.length === 20 && rb.validIdeas.length === 20)
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
    // G.2: DOMAIN-NEUTRAL duplicate rule — the INSTRUCTION text carries no niche
    // example (the pending DATA legitimately reflects the project, so test a block
    // built from a neutral pending topic).
    const neutralBlock = pendingTopicsBlock([{ title: 'נושא כללי', primaryKeyword: 'מילת מפתח', intent: 'informational', secondaryKeywords: [] }])
    const nf = domainFlags(neutralBlock)
    check('pending-block INSTRUCTIONS carry NO niche example', !nf.perfume && !nf.lighting && !nf.pet && !nf.freelancer)
    check('duplicate rule is abstract (same core question)', /ask the same core question/i.test(block))
    // G.3: comparison dimensions required
    check('requires core question comparison', /core question/i.test(block))
    check('requires expected answer comparison', /expect materially the same answer/i.test(block))
    check('requires search intent comparison', /search intent/i.test(block))
    check('requires same sections comparison', /would require substantially the same sections/i.test(block))
    // D: preserve distinct depth
    check('allows materially different follow-up (no over-block)', /materially different entities.*or section structure|do NOT over-block/i.test(block))
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

  console.log('J) Keyword Research — editorial batch reasoning, no keyword→title templates')
  {
    const clusters: ClusterInput[] = [
      { primaryKeyword: 'גוף תאורה צמוד תקרה', secondaryKeywords: ['גופי תאורה צמודי תקרה', 'מאווררי תקלה', 'מראה עם תאורה'], volume: 2400 },
      { primaryKeyword: 'מראה עם תאורה איקאה', secondaryKeywords: [], volume: 1900 },
      { primaryKeyword: 'בית מנורה', secondaryKeywords: [], volume: 900 },
    ]
    const p = buildClustersPrompt(clusters, 'he', 'חשמל אור בע"מ', ['גופי תאורה צמודי תקרה', 'מנורות תלויות', 'תאורת פסים'], '')

    // I.1: the deterministic keyword→title template is GONE from production code
    // (the phrase may appear in the PROMPT as a forbidden example — that's the
    // point — but never as a template-literal title construction).
    const src = readFileSync(join(process.cwd(), 'lib/content/recommendations/keyword-research.ts'), 'utf8')
    check('no "[keyword]: המדריך המלא" template construction in source', !src.includes('}: המדריך המלא') && !src.includes('The complete guide to ${'))
    check('title comes only from the model (no title fallback expression)', !/title\s*=\s*g\?\.title\?\.trim\(\)\s*\|\|/.test(src))
    // Prompt forbids the template + keyword-as-title.
    check('prompt: keywords are evidence, never ready-made titles', /Raw keywords are EVIDENCE, not ready-made titles/.test(p))
    check('prompt: never append המדריך המלא', /NEVER copy a keyword and append.*המדריך המלא/.test(p))

    // I.2: navigational/competitor classified + rejected by default (NEUTRAL, no niche example).
    check('prompt: reject navigational/competitor (abstract)', /REJECT a navigational\/competitor query \(one naming another store, brand or site\)/.test(p))
    check('prompt: competitor allowed only with explicit comparison support', /unless the offering explicitly supports comparison/.test(p))
    // I.3/I.4: malformed/ambiguous rejected without support (abstract rule, no niche example).
    check('prompt: reject malformed/ambiguous (abstract)', /REJECT a malformed or ambiguous query unless the supplied offering makes its meaning clear/.test(p))

    // I.5: consolidation of synonymous clusters into ONE topic (abstract).
    check('prompt: consolidate same-question clusters (abstract)', /CONSOLIDATE clusters that express the same core question/.test(p))
    check('prompt: mergedKeywords field in schema', /"mergedKeywords"/.test(p))
    check('prompt: fewer topics than clusters allowed (quality over count)', /FEWER topics than clusters/.test(p))

    // I.6: secondaries must belong to the SAME article (abstract, no niche example).
    check('prompt: same-article secondaries (abstract)', /choose ONLY terms that belong in the SAME article/.test(p))
    check('related terms passed only as CANDIDATES', /secondary CANDIDATES/.test(p))

    // I.7: business scope from offering only — the brand-name trap (abstract).
    check('prompt: scope from offering, never business name', /BUSINESS SCOPE comes ONLY from the supplied offering.*NEVER from the business name/s.test(p))
    check('prompt: a word in the business name is not scope evidence', /A word appearing inside the business name is NOT evidence/.test(p))
    // The KR instructions themselves (empty clusters + empty offer) carry NO domain.
    const krInstructionsOnly = buildClustersPrompt([], 'he', '', [], '')
    const kf = domainFlags(krInstructionsOnly)
    check('prompt: KR instructions are domain-NEUTRAL', !kf.perfume && !kf.lighting && !kf.pet && !kf.freelancer)

    // Reason must explain gap + relevance, not just volume; volume passed as evidence.
    check('prompt: reason explains gap+relevance not only volume', /CONTENT GAP and business relevance.*not just the search volume/s.test(p))
    check('prompt: monthlyVolume supplied per cluster', /"monthlyVolume":2400/.test(p))
    check('prompt: strict rejected classification schema', /"rejected":\[\{"primaryKeyword"/.test(p) && /navigational\|competitor\|malformed\|ambiguous\|out_of_scope/.test(p))
    check('prompt: every cluster accounted for exactly once', /Every supplied cluster must appear exactly once/.test(p))

    // I.8: valid technical lighting keywords are NOT blocked by the deterministic
    // gates. Vocab mirrors what a real lighting-store scan absorbs (exact tokens
    // from titles like "תאורת פסים" / "נורות לד גוון אור חם" / "תאורה לסלון").
    const lightingVocab = new Set(['תאורה', 'תאורת', 'גופי', 'מנורות', 'תקרה', 'פסים', 'לד', 'נורות', 'גוון', 'אור', 'סלון', 'מסלול'])
    check('valid lighting keyword passes the vocab gate', isVocabAligned('תאורת פסים לסלון', lightingVocab))
    check('kelvin/CRI-style keyword passes the vocab gate', isVocabAligned('נורות לד גוון אור', lightingVocab))
    check('track-lighting keyword passes the vocab gate', isVocabAligned('תאורת מסלול לתקרה', lightingVocab))

    // I.12: pending block still injected into the KR prompt when present.
    const p2 = buildClustersPrompt(clusters, 'he', '', [], 'ALREADY-PENDING topics TEST-BLOCK')
    check('KR prompt injects the pending block', p2.includes('ALREADY-PENDING topics TEST-BLOCK'))
  }

  console.log('K) domain-flag diagnostics — FIX VERIFICATION (shared guidance is now clean)')
  {
    // Multi-signal (≥2 distinct terms) — one incidental word does not trip it.
    check('perfume text flagged', domainFlags('בושם אוד וניל EDP').perfume)
    check('freelancer text flagged', domainFlags('פיתוח תוכנה SEO UX פרילנסר').freelancer)
    check('single overlapping word NOT flagged (multi-signal)', !domainFlags('מאמר על חשמל בבית').perfume)
    check('cross-domain detected', isCrossDomain('בושם אוד וניל + פיתוח תוכנה SEO פרילנסר'))
    check('fingerprint is stable + content-free', fingerprint('שלום עולם') === fingerprint('שלום   עולם') && /^[0-9a-f]{16}$/.test(fingerprint('x')))

    // FIX: the SHARED guidance/pending instructions carry NO business domain.
    const guidance = recommendationGuidance('Hebrew', YEAR, 20)
    const gf = domainFlags(guidance)
    check('recommendationGuidance triggers NO domain flag', !gf.perfume && !gf.lighting && !gf.pet && !gf.freelancer)
    check('recommendationGuidance has no perfume brand/ingredient/term', !/בושם|בשמי|oud|edp|edt|amouage|acqua di parma|profumum|tom ford|ex nihilo|borouj|sandalwood|וניל/i.test(guidance))
    check('recommendationGuidance has no lighting/pet/freelancer example', !/תאורה|קלווין|dog|כלב|פרילנסר|wordpress|shopify/i.test(guidance))
    const pblock = pendingTopicsBlock([{ title: 'נושא כללי', primaryKeyword: 'מילת מפתח', intent: 'informational', secondaryKeywords: [] }])
    const pf = domainFlags(pblock)
    check('pendingTopicsBlock triggers NO domain flag', !pf.perfume && !pf.lighting && !pf.pet && !pf.freelancer)
    check('structuredOutputContract has no niche example', !domainFlags(structuredOutputContract('Hebrew', 20)).perfume)

    // A Matalon (freelancer) Site Scan prompt is now flagged ONLY by its own
    // project context — NOT perfume. Same for appliance / pet / supplement.
    const focusFreelancer = deriveProjectFocus({ projectName: 'מטלון', domain: 'matalon.co.il', ownedCategories: ['פיתוח תוכנה', 'נגישות אתרים', 'שיווק דיגיטלי', 'עיצוב UX'], existingTopics: [] })
    const freelancerBlock = projectContextBlock({ projectName: 'מטלון', domain: 'matalon.co.il', language: 'he', ...focusFreelancer, ownedCategories: ['פיתוח תוכנה', 'נגישות אתרים', 'שיווק דיגיטלי'], existingTopics: [] })
    const matalonPrompt = buildPrompt('Hebrew', 'מטלון', 'CATEGORIES: פיתוח תוכנה | category', [], 20, ['פיתוח תוכנה לעסקים'], pblock, freelancerBlock)
    check('Matalon Site Scan prompt is NOT perfume-flagged', !domainFlags(matalonPrompt).perfume)
    check('Matalon prompt IS freelancer-flagged from its own context', domainFlags(matalonPrompt).freelancer)

    const applianceBlock = projectContextBlock({ projectName: 'מוצרי חשמל', domain: 'x.co.il', language: 'he', primaryProjectFocus: 'מקררים', secondaryProjectAreas: ['מדיחי כלים', 'מכונות כביסה'], ownedCategories: ['מקררים', 'מכונות כביסה', 'מדיחי כלים', 'קומקומים'], existingTopics: [] })
    const appliancePrompt = buildPrompt('Hebrew', 'מוצרי חשמל', 'CATEGORIES: מקררים | category', [], 20, [], pblock, applianceBlock)
    check('appliance prompt is NOT perfume-flagged', !domainFlags(appliancePrompt).perfume)
    const petBlock = projectContextBlock({ projectName: 'חנות כלבים', domain: 'p.co.il', language: 'he', primaryProjectFocus: 'מיטות לכלבים', secondaryProjectAreas: ['רצועות', 'קערות'], ownedCategories: ['מיטות לכלבים', 'רצועות', 'קערות'], existingTopics: [] })
    const petPrompt = buildPrompt('Hebrew', 'חנות כלבים', 'CATEGORIES: מיטות לכלבים | category', [], 20, [], pblock, petBlock)
    check('pet prompt is NOT perfume/lighting flagged', !domainFlags(petPrompt).perfume && !domainFlags(petPrompt).lighting)
  }

  console.log('L) authoritative project context + focus + compact output + token config')
  {
    const focus = deriveProjectFocus({ projectName: 'מטלון', domain: 'matalon.co.il', ownedCategories: ['פיתוח תוכנה', 'נגישות', 'שיווק'], existingTopics: [] })
    check('primaryProjectFocus derived from owned category (not name alone)', focus.primaryProjectFocus === 'פיתוח תוכנה')
    check('secondaryProjectAreas populated from remaining owned areas', focus.secondaryProjectAreas.includes('נגישות') && focus.secondaryProjectAreas.includes('שיווק'))
    const nameOnly = deriveProjectFocus({ projectName: 'מטלון', domain: 'matalon.co.il', ownedCategories: [], existingTopics: [] })
    check('name-only project still yields a focus label (name + domain)', nameOnly.primaryProjectFocus.includes('מטלון'))
    const block = projectContextBlock({ projectName: 'מטלון', domain: 'matalon.co.il', language: 'he', ...focus, ownedCategories: ['פיתוח תוכנה'], existingTopics: ['נושא קיים'] })
    check('block labels primaryProjectFocus', /primaryProjectFocus/.test(block))
    check('block labels secondaryProjectAreas', /secondaryProjectAreas/.test(block))
    check('block declares context is the ONLY authoritative domain source', /ONLY authoritative source for the business domain/i.test(block))
    check('block says instructions are NOT project content', /Instruction text, schema descriptions and quality rules are NOT project content/i.test(block))
    check('block forbids inferring domain from name alone', /Do NOT infer the business domain from the project name alone/i.test(block))
    check('project context block itself is domain-clean (only carries project data)', (() => { const f = domainFlags(projectContextBlock({ language: 'he', primaryProjectFocus: '', secondaryProjectAreas: [], ownedCategories: [], existingTopics: [] })); return !f.perfume && !f.lighting && !f.pet && !f.freelancer })())

    // Compact output contract + token config.
    const c = structuredOutputContract('Hebrew', 20)
    check('contract caps secondaryKeywords at 4', /AT MOST 4/.test(c))
    check('contract asks for a ONE-sentence reason', /ONE concise .* sentence/i.test(c))
    check('contract: evidenceSummary only when distinct', /ONLY when it adds evidence DISTINCT/i.test(c))
    check('contract: no volume repeated across fields', /Do not restate the monthly search volume/i.test(c))
    // maxOutputTokens = 16384 for all reco model calls (source check).
    const engineSrc = readFileSync(join(process.cwd(), 'lib/content/recommendations/engine.ts'), 'utf8')
    const siteSrc = readFileSync(join(process.cwd(), 'lib/content/recommendations/site-scan.ts'), 'utf8')
    const krSrc = readFileSync(join(process.cwd(), 'lib/content/recommendations/keyword-research.ts'), 'utf8')
    check('engine reco call uses maxOutputTokens 16384', /maxOutputTokens: 16384/.test(engineSrc) && !/maxOutputTokens: 8192/.test(engineSrc))
    check('site-scan reco call uses maxOutputTokens 16384', /maxOutputTokens: 16384/.test(siteSrc) && !/maxOutputTokens: 8192/.test(siteSrc))
    check('keyword-research reco call uses maxOutputTokens 16384', /maxOutputTokens: 16384/.test(krSrc) && !/maxOutputTokens: 8192/.test(krSrc))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
