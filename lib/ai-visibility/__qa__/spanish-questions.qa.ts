/**
 * A Spanish project gets SPANISH AI-visibility questions.
 *
 * The screen was already Spanish; the questions behind it were not. The
 * generator read `language === 'en' ? 'en' : 'he'` in four places, so a Spanish
 * project was handed the HEBREW templates — worse than English, because the
 * merchant could not read a word of it.
 *
 *   A  the language gate: `normalizeLanguage` answers 'es', and the main path
 *      and the safe-curated path both go through it
 *   B  the generated questions are Spanish: Spanish letters and question marks,
 *      and never a Hebrew character
 *   C  the words AROUND each question — intent label, reason, value reason —
 *      are Spanish too
 *   D  the fallback path (no category, no keywords) is Spanish
 *   E  the still-bilingual helpers (intent engine, search objects, LLM seeds)
 *      narrow Spanish to ENGLISH through `toBilingualPromptLanguage`, never to
 *      Hebrew by falling off the end of a `=== 'en' ? … : …`
 *
 * Every rule has a mutation control.
 *
 * Run: npx tsx lib/ai-visibility/__qa__/spanish-questions.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import {
  normalizeLanguage,
  toBilingualPromptLanguage,
  generatePromptSuggestions,
  buildFallbackSuggestions,
  type PromptSuggestion,
} from '../prompt-templates'

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
  const path = join(__dirname, `.qa-mut-esq-${++mutants}-${file.slice(file.lastIndexOf('/') + 1)}`)
  writeFileSync(path, pinned)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path) as T
  } finally {
    unlinkSync(path)
  }
}

const HEBREW = /[֐-׿]/
/** Spanish-specific letters, or the inverted opener Spanish questions carry. */
const SPANISH_MARK = /[¿¡áéíóúñü]/i
const SPANISH_WORD = /\b(qué|que|cómo|como|cuánto|cuál|dónde|conviene|elegir|precio|cuesta|mejor|mejores|mejorar|negocio|negocios|opiniones|comparar|comparativa|diferencia|alternativas|confianza|comprar|compra|servicio|servicios|tienda|tiendas|empresa|empresas|marca|marcas|regalo|regalar|local|oportunidad|visibilidad|competencia|clientes|búsqueda|busca|preguntas|perfil|falta|contexto|completa|precisas|revisar|antes|proveedor|sector|ciudad|zona)\b/i
const isSpanish = (s: string) => !HEBREW.test(s) && (SPANISH_MARK.test(s) || SPANISH_WORD.test(s))

/** A Spanish shop with enough context that the full bank path runs. */
const SHOP = {
  businessName: 'Perfumes Lumen',
  domain: 'perfumeslumen.es',
  city: 'Madrid',
  country: 'ES',
  keywords: ['comprar perfume nicho', 'precio perfume árabe', 'perfume regalo mujer'],
  category: 'perfume' as const,
  limit: 10,
}

/** A Spanish service business, which takes a different branch of the bank. */
const SERVICE = {
  businessName: 'Reformas Vega',
  domain: 'reformasvega.es',
  city: 'Valencia',
  country: 'ES',
  keywords: [],
  category: 'home_improvement_service' as const,
  limit: 10,
}

console.log('\nA) the language gate')
{
  check('A1: normalizeLanguage answers es', normalizeLanguage('es') === 'es')
  check('A2: and for the long and tagged forms',
    normalizeLanguage('spanish') === 'es' && normalizeLanguage('español') === 'es' &&
    normalizeLanguage('es-ES') === 'es' && normalizeLanguage('es_MX') === 'es')
  check('A3: Hebrew and English are untouched',
    normalizeLanguage('he') === 'he' && normalizeLanguage('en') === 'en' && normalizeLanguage(null) === 'he')
  check('A4: an unknown language still falls back, never to an empty bank',
    normalizeLanguage('ar') === 'he')

  const src = code('lib/ai-visibility/prompt-templates.ts')
  check('A5: no generation path narrows with the old `=== \'en\' ? \'en\' : \'he\'`',
    !/=\s*language\s*===\s*'en'\s*\?\s*'en'\s*:\s*'he'/.test(src),
    'that expression hands Spanish the Hebrew templates')
  check('A6: Spanish skips the vNext intent engine, which has no Spanish seeds',
    /USE_SMART_QUESTIONS_VNEXT && lang !== 'es'/.test(src))
}

console.log('\nB) the questions are Spanish')
const es = generatePromptSuggestions({ ...SHOP, language: 'es' })
{
  check('B1: the generator returns a full set', es.length >= 5, `got ${es.length}`)
  const hebrew = es.filter((s) => HEBREW.test(s.prompt))
  check('B2: not one question carries a Hebrew character', hebrew.length === 0,
    hebrew.slice(0, 3).map((s) => s.prompt).join(' | '))
  const notSpanish = es.filter((s) => !isSpanish(s.prompt))
  check('B3: every question reads as Spanish', notSpanish.length === 0,
    notSpanish.slice(0, 3).map((s) => s.prompt).join(' | '))
  check('B4: each one is stored under its own language', es.every((s) => s.language === 'es'))

  const svc = generatePromptSuggestions({ ...SERVICE, language: 'es' })
  check('B5: a service business gets a Spanish set too',
    svc.length >= 4 && svc.every((s) => isSpanish(s.prompt)),
    svc.map((s) => s.prompt).join(' | '))

  // Hebrew still comes out Hebrew — the two paths are independent.
  const he = generatePromptSuggestions({ ...SHOP, language: 'he' })
  check('B6: Hebrew is unchanged by this', he.length >= 5 && he.every((s) => HEBREW.test(s.prompt)))
  check('B7: Spanish and Hebrew are not the same set',
    es.map((s) => s.prompt).join('|') !== he.map((s) => s.prompt).join('|'))

  const broken = mutant<{ generatePromptSuggestions: typeof generatePromptSuggestions }>(
    'lib/ai-visibility/prompt-templates.ts',
    "const lang = normalizeLanguage(language)\n  const themes = extractThemes(keywords)",
    "const lang = language === 'en' ? 'en' : 'he'\n  const themes = extractThemes(keywords)"
  ).generatePromptSuggestions({ ...SHOP, language: 'es' })
  check('B8: MUT the old narrowing brings Hebrew questions back',
    broken.some((s: PromptSuggestion) => HEBREW.test(s.prompt)))
}

console.log('\nC) the words around the question')
{
  const labels = new Set(es.map((s) => s.intentLabel))
  check('C1: no intent label is Hebrew', ![...labels].some((l) => HEBREW.test(l)), [...labels].join(', '))
  // Short nouns do not carry an accent, so these are checked against the
  // Spanish label set rather than by sniffing the text.
  const ES_LABELS = new Set([
    'Recomendación', 'Comparación', 'Precio', 'Antes de comprar', 'Elección',
    'Local', 'Marca', 'Información', 'Alternativas', 'Regalo',
  ])
  check('C2: every intent label is one of the Spanish labels',
    [...labels].every((l) => ES_LABELS.has(l)), [...labels].join(', '))
  const reasons = es.map((s) => s.reason).filter((r) => r && !r.startsWith('['))
  check('C3: no reason line is Hebrew', !reasons.some((r) => HEBREW.test(r)), reasons[0])
  check('C4: the reason lines are Spanish', reasons.length > 0 && reasons.every((r) => isSpanish(r)), reasons[0])
  const values = es.map((s) => s.valueReason).filter(Boolean)
  check('C5: no value reason is Hebrew', !values.some((v) => HEBREW.test(v)), values[0])
  check('C6: the value reasons are Spanish', values.length > 0 && values.every((v) => isSpanish(v)), values[0])

  const broken = mutant<{ generatePromptSuggestions: typeof generatePromptSuggestions }>(
    'lib/ai-visibility/prompt-templates.ts',
    'category: (v) => `Basado en la categoría del negocio: ${v}`',
    'category: (v) => `מבוסס על קטגוריית העסק: ${v}`'
  ).generatePromptSuggestions({ ...SHOP, language: 'es' })
  check('C7: MUT a Hebrew reason line for Spanish fails C3',
    broken.some((s: PromptSuggestion) => HEBREW.test(s.reason)))
}

console.log('\nD) the fallback path')
{
  const fb = buildFallbackSuggestions('Reformas Vega', null, 'reformasvega.es', 'home_improvement_service', 'Valencia', [], [], 'es')
  check('D1: the fallback returns questions', fb.length >= 3, `got ${fb.length}`)
  check('D2: none of them is Hebrew', !fb.some((s) => HEBREW.test(s.prompt)),
    fb.filter((s) => HEBREW.test(s.prompt)).map((s) => s.prompt).join(' | '))
  check('D3: all of them read as Spanish', fb.every((s) => isSpanish(s.prompt)),
    fb.filter((s) => !isSpanish(s.prompt)).map((s) => s.prompt).join(' | '))

  // With no context at all the generator says so, in Spanish, rather than
  // inventing questions about a business it knows nothing about.
  const bare = buildFallbackSuggestions(null, null, null, null, null, [], [], 'es')
  check('D4: with no context at all the message itself is Spanish',
    bare.length > 0 && bare.every((s) => isSpanish(s.prompt)) && bare.every((s) => isSpanish(s.reason)),
    bare.map((s) => s.prompt).join(' | '))

  // The generic minimum set: reached when the business has a category but the
  // intent frames cannot fill three questions.
  const generic = buildFallbackSuggestions(
    'Grupo Avanza', null, 'grupoavanza.es', 'generic', 'Zaragoza',
    ['servicios para empresas'], ['Consultora Ebro'], 'es'
  )
  check('D5: the generic minimum set is Spanish',
    generic.length >= 3 && generic.every((s) => isSpanish(s.prompt)),
    generic.map((s) => s.prompt).join(' | '))

  const broken = mutant<{ buildFallbackSuggestions: typeof buildFallbackSuggestions }>(
    'lib/ai-visibility/prompt-templates.ts',
    "} else if (lang === 'es') {\n      push(`\u00bfQu\u00e9 opiniones hay sobre ${cleanName}?`, 'brand')",
    "} else if (lang === 'zz') {\n      push(`\u00bfQu\u00e9 opiniones hay sobre ${cleanName}?`, 'brand')"
  ).buildFallbackSuggestions(
    'Grupo Avanza', null, 'grupoavanza.es', 'generic', 'Zaragoza',
    ['servicios para empresas'], ['Consultora Ebro'], 'es'
  )
  check('D6: MUT without the Spanish name-based frames, D5 comes out English',
    broken.length > 0 && broken.some((s: PromptSuggestion) => !isSpanish(s.prompt)),
    broken.map((s: PromptSuggestion) => s.prompt).join(' | '))
}

console.log('\nE) the still-bilingual helpers narrow to English')
{
  check('E1: toBilingualPromptLanguage sends Spanish to English',
    toBilingualPromptLanguage('es') === 'en')
  check('E2: and leaves the other two alone',
    toBilingualPromptLanguage('he') === 'he' && toBilingualPromptLanguage('en') === 'en')

  const src = code('lib/ai-visibility/prompt-templates.ts')
  check('E3: the intent engine is called through it',
    /language: toBilingualPromptLanguage\(lang\)/.test(src))
  check('E4: so are the search-object templates',
    /chooseTemplatesByObjectType\(obj, toBilingualPromptLanguage\(lang\), ctx\.city\)/.test(src))
  check('E5: the seed scan narrows before it reaches the bilingual seeds',
    /toBilingualPromptLanguage\(normalizeLanguage\(project\.language\)\)/.test(code('lib/seed-scan/steps-b.ts')))

  // The quality gate must not let a Hebrew string through as Spanish.
  check('E6: the coherence gate rejects Hebrew in any non-Hebrew language',
    /if \(language !== 'he' && hasHebrew\) continue/.test(src))
}

console.log('\nF) the Spanish questions read naturally')
{
  const all = [
    ...es,
    ...generatePromptSuggestions({ ...SERVICE, language: 'es' }),
    ...generatePromptSuggestions({
      businessName: 'Tienda Ola', domain: 'tiendaola.es', city: null, country: 'MX',
      keywords: ['comprar online'], category: 'ecommerce', limit: 10, language: 'es',
    }),
  ].map((s) => s.prompt)

  check('F1: no question doubles its own intent word',
    !all.some((q) => /^¿?cu[áa]nto\s+(?:cuesta|vale)\s+(?:comprar|precio|coste)\b/i.test(q) ||
                     /^opiniones\s+sobre\s+(?:precio|comprar|opiniones)\b/i.test(q)),
    all.filter((q) => /^¿?cu[áa]nto\s+(?:cuesta|vale)\s+(?:comprar|precio|coste)\b/i.test(q)).join(' | '))
  check('F2: no English frame leaks into a Spanish set',
    !all.some((q) => /^(?:Reviews of|How much does|What to check|Which provider|Where to find|Best (?:providers|alternatives))\b/i.test(q)),
    all.filter((q) => /^(?:Reviews of|How much does|Which provider)\b/i.test(q)).join(' | '))
  check('F3: no question uses the Spain-only vosotros form',
    !all.some((q) => /\b\w+[áé]is\b/i.test(q)), all.filter((q) => /\b\w+[áé]is\b/i.test(q)).join(' | '))

  const src = code('lib/ai-visibility/prompt-templates.ts')
  check('F4: the keyword frames are a table, not an isHebrew ternary',
    /const KEYWORD_FRAMES: Record<PromptLanguage/.test(src) &&
    !/prompt: `Reviews of \$\{kw\}`/.test(src))
  check('F5: Spanish prompts get their own phrasing bucket, so the diversity cap does not collapse them',
    /return 'es_recommendation_provider'/.test(src) && /return 'es_price'/.test(src))

  // Without the Spanish phrasing buckets every Spanish prompt lands in
  // 'en_other' and the stage-1 cap of one per phrasing cuts the set to two.
  const flat = mutant<{ generatePromptSuggestions: typeof generatePromptSuggestions }>(
    'lib/ai-visibility/prompt-templates.ts',
    "  } else if (lang === 'es') {\n    // Spanish openers",
    "  } else if (lang === 'zz') {\n    // Spanish openers"
  ).generatePromptSuggestions({ ...SERVICE, language: 'es' })
  check('F6: MUT collapsing the Spanish buckets shrinks the set',
    flat.length < generatePromptSuggestions({ ...SERVICE, language: 'es' }).length,
    `mutant ${flat.length}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
