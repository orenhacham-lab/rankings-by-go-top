/**
 * A Brazilian, Italian, Japanese, German, Dutch or Polish project gets its AI
 * visibility questions IN ITS OWN LANGUAGE.
 *
 * Those six content languages were live on the public site while the question
 * generator knew four. `normalizeLanguage` sent pt-BR to English and let the
 * other five fall off the end into the HEBREW fallback, and the vNext intent
 * engine — which has a Hebrew seed pool and an English one and nothing else —
 * handed every one of them "What is a digital marketing agency?" as the first
 * suggestion on the screen.
 *
 *   A  the language gate: `normalizeLanguage` answers each of the six, and the
 *      main path and the safe-curated path both go through it
 *   B  the questions are in the language: its own words, never an English frame,
 *      never a Hebrew character
 *   C  the words AROUND each question — intent label, reason, value reason —
 *      are in the language too
 *   D  the fallback path (no category, no keywords) is in the language
 *   E  the vNext engine is bypassed for all six, because it would answer English
 *   F  Japanese passes the shared quality gate at all: full-width 「？」 and a
 *      nine-character question, with the kana check standing in for the Hebrew
 *      coherence rule
 *   G  each language gets its own phrasing buckets, so the diversity cap does
 *      not collapse its set
 *   H  a price question about a COMPANY is rejected in each language
 *   I  every table is complete for every one of the six
 *
 * Every rule has a mutation control.
 *
 * Run: npx tsx lib/ai-visibility/__qa__/six-language-questions.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import {
  normalizeLanguage,
  generatePromptSuggestions,
  buildFallbackSuggestions,
  qualityFilterQuestions,
  type PromptIntent,
  type PromptLanguage,
} from '../prompt-templates'
import { EXTRA_LANG_PACKS, EXTRA_PROMPT_LANGUAGES } from '../prompt-langs'
import { isInvalidPriceQuestion } from '../smart-question-keyword-enrichment'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))

let mutants = 0
function mutant<T>(file: string, from: string | RegExp, to: string): T {
  const src = read(file)
  const out = src.replace(from, to)
  if (out === src) throw new Error(`mutation did not apply to ${file}: ${String(from)}`)
  const dir = file.slice(0, file.lastIndexOf('/'))
  const pinned = out.replace(/(from\s+|require\(|import\()(['"])(\.\.?\/[^'"]*)\2/g, (_m, pre: string, q: string, spec: string) => `${pre}${q}${join(ROOT, dir, spec)}${q}`)
  const path = join(__dirname, `.qa-mut-6lang-${++mutants}-${file.slice(file.lastIndexOf('/') + 1)}`)
  writeFileSync(path, pinned)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path) as T
  } finally {
    unlinkSync(path)
  }
}

const HEBREW = /[֐-׿]/
const KANA_OR_KANJI = /[぀-ヿ一-鿿]/u

/** An English FRAME — the leak this suite exists to catch. The merchant's own
 *  keyword may well be English, so only the frame is asserted on. */
const ENGLISH_FRAME =
  /(?:^|\s)(?:How much does|How do I|What (?:is|are|to|should)|Which provider|Where (?:can|to)|Reviews of|Best (?:providers|alternatives)|Who is recommended|Is .* a reliable)\b/i

const LANGS = EXTRA_PROMPT_LANGUAGES

/** A project per language, the same business so the sets are comparable. */
const PROJECT = (language: PromptLanguage) => ({
  businessName: 'Acme Clean',
  domain: 'acmeclean.example',
  city: language === 'ja' ? '東京' : 'Berlin',
  country: language === 'pt-BR' ? 'BR' : language === 'ja' ? 'JP' : 'DE',
  keywords: [] as string[],
  category: 'cleaning' as const,
  limit: 8,
  language,
})

/** Does this text read as the language's own, rather than as English? */
function looksNative(text: string, lang: PromptLanguage): boolean {
  if (HEBREW.test(text)) return false
  if (lang === 'ja') return KANA_OR_KANJI.test(text)
  return !ENGLISH_FRAME.test(text)
}

console.log('A) the language gate answers each of the six')
{
  for (const l of LANGS) {
    check(`A1 ${l}: normalizeLanguage('${l}') === '${l}'`, normalizeLanguage(l) === l)
  }
  // The values that actually arrive in project.language are not always the tag.
  check('A2: the spellings a stored row carries resolve too',
    normalizeLanguage('pt') === 'pt-BR' && normalizeLanguage('pt-PT') === 'pt-BR' &&
    normalizeLanguage('Deutsch') === 'de' && normalizeLanguage('de-AT') === 'de' &&
    normalizeLanguage('jp') === 'ja' && normalizeLanguage('日本語') === 'ja' &&
    normalizeLanguage('polski') === 'pl' && normalizeLanguage('nederlands') === 'nl' &&
    normalizeLanguage('italiano') === 'it')
  check('A3: and an unknown language still falls back, rather than throwing',
    normalizeLanguage('xx') === 'he' && normalizeLanguage('ar') === 'he')
  check('A4: the four original languages are untouched',
    normalizeLanguage('he') === 'he' && normalizeLanguage('en') === 'en' &&
    normalizeLanguage('es') === 'es' && normalizeLanguage('fr') === 'fr')

  // MUT: without the registry lookup, pt-BR goes back to English.
  const broken = mutant<{ normalizeLanguage: typeof normalizeLanguage }>(
    'lib/ai-visibility/prompt-templates.ts',
    "  if ((EXTRA_PROMPT_LANGUAGES as string[]).includes(content)) return content as PromptLanguage",
    "  if (false) return content as PromptLanguage"
  ).normalizeLanguage
  check('A5: MUT without the registry lookup, every one of the six falls back again',
    LANGS.every((l) => broken(l) !== l),
    LANGS.map((l) => `${l}->${broken(l)}`).join(' '))
}

console.log('\nB) the questions are in the language')
{
  for (const l of LANGS) {
    const out = generatePromptSuggestions(PROJECT(l))
    check(`B1 ${l}: the main path returns questions at all`, out.length >= 3, `${out.length}`)
    const prompts = out.map((s) => s.prompt)
    check(`B2 ${l}: no English frame and no Hebrew letter in any of them`,
      prompts.every((p) => looksNative(p, l)),
      prompts.filter((p) => !looksNative(p, l)).join(' | '))
  }

  // Japanese is the one with a script of its own, so assert it positively.
  const ja = generatePromptSuggestions(PROJECT('ja')).map((s) => s.prompt)
  check('B3 ja: every question is written in kana or kanji',
    ja.every((p) => KANA_OR_KANJI.test(p)), ja.join(' | '))
  // And the five latin-script ones must still be distinguishable from English:
  // each one's own bank words have to show up.
  const OWN_WORDS: Record<string, RegExp> = {
    'pt-BR': /(melhores|quanto custa|avalia[çc][õo]es|como escolher|empresas)/i,
    it: /(migliori|quanto costa|recensioni|come scegliere|imprese)/i,
    de: /(beste|was kostet|erfahrungen|wie finde ich|firma)/i,
    nl: /(beste|wat kost|ervaringen|hoe kies je|bedrijf)/i,
    pl: /(najlepsze|ile kosztuje|opinie|jak wybra|firm)/i,
  }
  for (const [l, re] of Object.entries(OWN_WORDS)) {
    const set = generatePromptSuggestions(PROJECT(l as PromptLanguage)).map((s) => s.prompt)
    check(`B4 ${l}: at least one question uses the language's own words`,
      set.some((p) => re.test(p)), set.join(' | '))
  }
}

console.log('\nC) the words around each question are in the language too')
{
  for (const l of LANGS) {
    const out = generatePromptSuggestions(PROJECT(l))
    const pack = EXTRA_LANG_PACKS[l]
    const labels = new Set(Object.values(pack.intentLabel))
    check(`C1 ${l}: every intent label comes from this language's table`,
      out.every((s) => labels.has(s.intentLabel)),
      out.map((s) => s.intentLabel).filter((x) => !labels.has(x)).join(' | '))
    check(`C2 ${l}: the reason line is this language's`,
      out.every((s) => !s.reason || s.reason.startsWith(pack.reason.category('').trim().replace(/\s*$/, '').slice(0, 10))),
      out.map((s) => s.reason).join(' | '))
    const valueLines = new Set(Object.values(pack.valueReason))
    check(`C3 ${l}: the value line is one of this language's seven`,
      out.every((s) => !s.valueReason || valueLines.has(s.valueReason)),
      out.map((s) => s.valueReason).filter((x) => x && !valueLines.has(x)).join(' | '))
  }

  // MUT: the reason line names the category from CATEGORY_LABEL_BY_LANG, so
  // that is the table to break — point the pack half of it at the English
  // labels and the German reason line says "cleaning company".
  const brokenLabel = mutant<{ generatePromptSuggestions: typeof generatePromptSuggestions }>(
    'lib/ai-visibility/prompt-templates.ts',
    `  he: HE_CATEGORY_LABEL, en: EN_CATEGORY_LABEL, es: ES_CATEGORY_LABEL, fr: FR_CATEGORY_LABEL,
  ...fromPacks((p) => p.categoryLabel),`,
    `  he: HE_CATEGORY_LABEL, en: EN_CATEGORY_LABEL, es: ES_CATEGORY_LABEL, fr: FR_CATEGORY_LABEL,
  ...fromPacks(() => EN_CATEGORY_LABEL),`
  ).generatePromptSuggestions(PROJECT('de'))
  check('C4: MUT without the pack category labels, the German reason line turns English',
    brokenLabel.some((s) => /cleaning company/.test(s.reason ?? '')),
    brokenLabel.map((s) => s.reason).join(' | '))
}

console.log('\nD) the fallback path is in the language')
{
  for (const l of LANGS) {
    const fb = buildFallbackSuggestions(
      'Acme Clean', null, 'acmeclean.example', 'cleaning',
      l === 'ja' ? '東京' : 'Berlin', [], ['CleanCo'], l
    )
    check(`D1 ${l}: the fallback returns a set`, fb.length >= 3, `${fb.length}`)
    check(`D2 ${l}: in the language, with no English frame`,
      fb.every((s) => looksNative(s.prompt, l)),
      fb.filter((s) => !looksNative(s.prompt, l)).map((s) => s.prompt).join(' | '))
  }

  // The guaranteed-minimum set names no business and no category, so it is the
  // easiest place for an English string to survive unnoticed.
  for (const l of LANGS) {
    const pack = EXTRA_LANG_PACKS[l]
    check(`D3 ${l}: the guaranteed minimum is four questions in the language`,
      pack.genericQuestions.length >= 3 && pack.genericQuestions.every((q) => looksNative(q, l)),
      pack.genericQuestions.join(' | '))
  }

  // MUT: without the pack's name frames, the brand question comes out English.
  const broken = mutant<{ buildFallbackSuggestions: typeof buildFallbackSuggestions }>(
    'lib/ai-visibility/prompt-templates.ts',
    '    if (pack) {\n      for (const q of pack.nameQuestions(cleanName, packForms)) push(q.prompt, q.intent)\n    } else if (lang === \'he\') {',
    '    if (false) {\n    } else if (lang === \'he\') {'
  ).buildFallbackSuggestions(
    'Acme Clean', null, 'acmeclean.example', 'cleaning', 'Berlin', [], ['CleanCo'], 'nl'
  )
  check('D4: MUT without the pack name frames, the Dutch set carries an English one',
    broken.some((s) => ENGLISH_FRAME.test(s.prompt)),
    broken.map((s) => s.prompt).join(' | '))
}

console.log('\nE) the vNext intent engine is bypassed, because it answers English')
{
  const src = code('lib/ai-visibility/prompt-templates.ts')
  check('E1: the guard asks whether the language has a pack, not which language it is',
    /if \(USE_SMART_QUESTIONS_VNEXT && lang !== 'es' && lang !== 'fr' && !packFor\(lang\)\) \{/.test(src))
  for (const l of LANGS) {
    const out = generatePromptSuggestions(PROJECT(l)).map((s) => s.prompt)
    check(`E2 ${l}: the engine's English seed never reaches the screen`,
      !out.some((p) => /digital marketing agency|remodeling contractor/i.test(p)),
      out.join(' | '))
  }

  // MUT: drop the pack test from the guard and the engine takes over again.
  const broken = mutant<{ generatePromptSuggestions: typeof generatePromptSuggestions }>(
    'lib/ai-visibility/prompt-templates.ts',
    "lang !== 'es' && lang !== 'fr' && !packFor(lang)",
    "lang !== 'es' && lang !== 'fr'"
  ).generatePromptSuggestions({ ...PROJECT('de'), category: 'agency' })
  check('E3: MUT without the pack test, a German agency is asked an English question',
    broken.some((s) => ENGLISH_FRAME.test(s.prompt) || /digital marketing agency/i.test(s.prompt)),
    broken.map((s) => s.prompt).join(' | '))

  // The same leak had a second door: the v2 keyword phrasings.
  const v2 = code('lib/ai-visibility/semantic-generator-v2.ts')
  check('E4: the v2 keyword phrasings read the pack before falling to English',
    /phraseNaturalPackQuestion\(need, entity, city, pack\)/.test(v2))
  const withKeyword = generatePromptSuggestions({
    ...PROJECT('de'), keywords: ['Büroreinigung'],
  }).map((s) => s.prompt)
  check('E5: a German keyword is framed in German, not in English',
    withKeyword.every((p) => looksNative(p, 'de')),
    withKeyword.filter((p) => !looksNative(p, 'de')).join(' | '))

  // MUT: send the v2 phrasings back down the English arm and ask it directly.
  // The keyword stays German either way; what comes back English is the FRAME.
  const brokenV2 = mutant<{
    generateHumanLikeSmartQuestions: (ctx: {
      keyword: string; businessName: string | null; city: string | null
      businessCategory: string; language: string
    }) => Array<{ prompt: string }>
  }>(
    'lib/ai-visibility/semantic-generator-v2.ts',
    '    const phrase = pack\n      ? phraseNaturalPackQuestion(need, entity, city, pack)',
    '    const phrase = false\n      ? phraseNaturalPackQuestion(need, entity, city, pack)'
  ).generateHumanLikeSmartQuestions({
    keyword: 'Büroreinigung', businessName: 'Acme Clean', city: 'Berlin',
    businessCategory: 'cleaning', language: 'de',
  })
  check('E6: MUT without the pack arm, the v2 keyword frames come back English',
    brokenV2.length > 0 && brokenV2.some((q) => ENGLISH_FRAME.test(q.prompt)),
    brokenV2.map((q) => q.prompt).join(' | '))
}

console.log('\nF) Japanese gets through the shared quality gate at all')
{
  const jaQuestions = [
    'ジムの評判は？',
    'おすすめの香水は？',
    '清掃会社の選び方は？',
    '東京で清掃会社を探す方法は？',
  ]
  check('F1: a seven-character question ending in 「？」 passes',
    qualityFilterQuestions(jaQuestions, 'ja').length === 4,
    qualityFilterQuestions(jaQuestions, 'ja').join(' | '))
  check('F2: an English frame in a Japanese set is rejected on script',
    qualityFilterQuestions(['How much does office cleaning cost?'], 'ja').length === 0)
  check('F3: and the latin minimum still applies to the latin languages',
    qualityFilterQuestions(['Wat?'], 'nl').length === 0 &&
    qualityFilterQuestions(['Wat kost een schoonmaakbedrijf?'], 'nl').length === 1)

  // MUT: stop accepting the full-width question mark and the bank is gone.
  const broken = mutant<{ qualityFilterQuestions: typeof qualityFilterQuestions }>(
    'lib/ai-visibility/prompt-templates.ts',
    "if (!q.endsWith('?') && !q.endsWith('？')) continue",
    "if (!q.endsWith('?')) continue"
  ).qualityFilterQuestions(jaQuestions, 'ja')
  check('F4: MUT without 「？」, every Japanese question is thrown away', broken.length === 0,
    broken.join(' | '))

  const brokenLen = mutant<{ qualityFilterQuestions: typeof qualityFilterQuestions }>(
    'lib/ai-visibility/prompt-templates.ts',
    "    const minLength = isUnspacedPromptLanguage(language) ? 6 : 8",
    "    const minLength = 8"
  ).qualityFilterQuestions(['ジムの評判は？'], 'ja')
  check('F5: MUT with the latin minimum, the seven-character question is cut',
    brokenLen.length === 0, brokenLen.join(' | '))
}

console.log('\nG) each language has its own phrasing buckets')
{
  for (const l of LANGS) {
    const pack = EXTRA_LANG_PACKS[l]
    check(`G1 ${l}: at least five buckets, so the cap has something to spread over`,
      pack.phrasingBuckets.length >= 5, `${pack.phrasingBuckets.length}`)
    const names = new Set(pack.phrasingBuckets.map((b) => b.bucket))
    check(`G2 ${l}: the bucket names are distinct`, names.size === pack.phrasingBuckets.length)
  }

  // Behaviour: the bank's own questions must not all land in one bucket, or the
  // stage-1 cap of one-per-phrasing cuts the set down.
  const full = generatePromptSuggestions({ ...PROJECT('de'), category: 'perfume' }).length
  const flat = mutant<{ generatePromptSuggestions: typeof generatePromptSuggestions }>(
    'lib/ai-visibility/prompt-templates.ts',
    '    for (const { bucket, test } of pack.phrasingBuckets) {\n      if (test.test(p)) return bucket\n    }',
    '    for (const { bucket, test } of pack.phrasingBuckets) {\n      if (false && test.test(p)) return bucket\n    }'
  ).generatePromptSuggestions({ ...PROJECT('de'), category: 'perfume' })
  check('G3: MUT collapsing the German buckets shrinks the set',
    flat.length < full, `${flat.length} vs ${full}`)
}

console.log('\nH) a price question about a company is rejected in each language')
{
  const NONSENSE: Record<string, string> = {
    'pt-BR': 'Quanto custa uma empresa de limpeza?',
    it: 'Quanto costa un\'impresa di pulizie?',
    ja: '清掃会社の費用はいくら？',
    de: 'Was kostet eine Reinigungsfirma?',
    nl: 'Wat kost een schoonmaakbedrijf?',
    pl: 'Ile kosztuje firma sprzątająca?',
  }
  const REAL: Record<string, string> = {
    'pt-BR': 'Quanto custa a limpeza de um escritório?',
    it: 'Quanto costa la pulizia di un ufficio?',
    ja: 'オフィス清掃の月額費用はいくら？',
    de: 'Was kostet die Büroreinigung im Monat?',
    nl: 'Wat kost kantoorschoonmaak per maand?',
    pl: 'Ile kosztuje sprzątanie biura?',
  }
  for (const l of LANGS) {
    check(`H1 ${l}: the price of a COMPANY is rejected`,
      isInvalidPriceQuestion(NONSENSE[l], l), NONSENSE[l])
    check(`H2 ${l}: the price of the SERVICE is kept`,
      !isInvalidPriceQuestion(REAL[l], l), REAL[l])
  }

  // MUT: without the pack branch the filter never fires for these languages.
  const broken = mutant<{ isInvalidPriceQuestion: typeof isInvalidPriceQuestion }>(
    'lib/ai-visibility/smart-question-keyword-enrichment.ts',
    '  if (pack) {\n    const { priceQuestion, businessEntity } = pack.priceFilter\n    return priceQuestion.test(prompt) && businessEntity.test(prompt)\n  }',
    ''
  ).isInvalidPriceQuestion
  check('H3: MUT without the pack branch, the nonsense question passes in every one',
    LANGS.every((l) => !broken(NONSENSE[l], l)),
    LANGS.filter((l) => broken(NONSENSE[l], l)).join(' '))
}

console.log('\nI) every table is complete for every one of the six')
{
  const CATEGORIES = Object.keys(EXTRA_LANG_PACKS['pt-BR'].categoryLabel) as Array<keyof typeof EXTRA_LANG_PACKS['pt-BR']['categoryLabel']>
  const INTENTS = Object.keys(EXTRA_LANG_PACKS['pt-BR'].intentLabel) as PromptIntent[]
  for (const l of LANGS) {
    const pack = EXTRA_LANG_PACKS[l]
    check(`I1 ${l}: a bank entry for every category, none of them empty`,
      CATEGORIES.every((c) => Array.isArray(pack.bank[c]) && pack.bank[c].length > 0),
      CATEGORIES.filter((c) => !pack.bank[c]?.length).join(' '))
    check(`I2 ${l}: a label for every intent and every category`,
      INTENTS.every((i) => !!pack.intentLabel[i]) && CATEGORIES.every((c) => !!pack.categoryLabel[c]))
    check(`I3 ${l}: no bank question carries an unresolved placeholder other than ours`,
      CATEGORIES.every((c) => pack.bank[c].every((q) =>
        (q.text.match(/\{\{(\w+)\}\}/g) ?? []).every((m) => ['{{business}}', '{{city}}', '{{country}}', '{{domain}}'].includes(m)))))
    check(`I4 ${l}: a city-bearing question declares requiresCity`,
      CATEGORIES.every((c) => pack.bank[c].every((q) => !q.text.includes('{{city}}') || q.requiresCity === true)),
      CATEGORIES.filter((c) => pack.bank[c].some((q) => q.text.includes('{{city}}') && !q.requiresCity)).join(' '))
    check(`I5 ${l}: every question in the bank reads as the language's own`,
      CATEGORIES.every((c) => pack.bank[c].every((q) => looksNative(q.text, l))),
      CATEGORIES.flatMap((c) => pack.bank[c].filter((q) => !looksNative(q.text, l)).map((q) => q.text)).join(' | '))
    check(`I6 ${l}: the service labels name a plural for every category they name`,
      Object.values(pack.serviceLabels).every((f) => !!f && !!f.one && !!f.plural))
  }

  // Portuguese and Italian contract the preposition with the country, so the
  // frames must NOT carry one of their own — "do {{country}}" produced
  // "Melhores agências de SEO do Alemanha".
  for (const l of ['pt-BR', 'it'] as const) {
    const pack = EXTRA_LANG_PACKS[l]
    const offenders = CATEGORIES.flatMap((c) => pack.bank[c]
      .filter((q) => /\b(?:do|no|na|nos|em|in|nel|negli)\s+\{\{country\}\}/i.test(q.text))
      .map((q) => q.text))
    check(`I7 ${l}: no frame writes its own preposition before {{country}}`,
      offenders.length === 0, offenders.join(' | '))
    check(`I8 ${l}: the country table carries the preposition instead`,
      Object.values(pack.countryNames).every((n) => /^(?:no|na|nos|nas|em|in|nel|negli)\s/i.test(n)),
      Object.values(pack.countryNames).filter((n) => !/^(?:no|na|nos|nas|em|in|nel|negli)\s/i.test(n)).join(' | '))
  }

  // Polish cannot decline a merchant-typed city, so it must not try.
  const pl = EXTRA_LANG_PACKS.pl
  const plCity = CATEGORIES.flatMap((c) => pl.bank[c]
    .filter((q) => /\bw\s+\{\{city\}\}/i.test(q.text))
    .map((q) => q.text))
  check('I9 pl: no frame puts a nominative city after "w"', plCity.length === 0, plCity.join(' | '))

  // And Japanese must not rely on the latin word filter it cannot use.
  check('I10 ja: intentWords is empty and intentPhrases carries the work',
    EXTRA_LANG_PACKS.ja.intentWords.size === 0 && EXTRA_LANG_PACKS.ja.intentPhrases.length > 5)
  check('I11: every other pack does have single intent words to strip',
    LANGS.filter((l) => l !== 'ja').every((l) => EXTRA_LANG_PACKS[l].intentWords.size > 5))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
