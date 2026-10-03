/**
 * Spanish content language — the contract that a Spanish project is actually
 * written in Spanish, and never silently in Hebrew.
 *
 * Before this wave every content path carried its own
 * `startsWith('en') ? 'en' : 'he'`, so a project whose language was 'es' got a
 * HEBREW article, Hebrew FAQ headings, Hebrew audit word lists and an RTL table.
 * These checks are behavioral (they call the real functions), and each group ends
 * with a MUTATION CONTROL: the same check against a deliberately broken input or
 * a deliberately Hebrew-only lookup, proving the check can fail.
 */
import { normalizeContentLanguage, contentDirection, contentScript, languageNameInEnglish, toHebrewOrEnglish, CONTENT_LANGUAGES } from '../language'
import { suggestTopics } from '../topic-suggestions'
import { suggestAiQuery, suggestionLanguage } from '../ai-query-suggestion'
import { buildArticleHtml } from '../gemini-article'
import { runArticleAudit } from '../article-audit'
import { analyzeAnchorQuality } from '../anchors-check'
import { REASON_TEXT, demandSentence } from '../recommendations/reason-text'
import { hybridProvenanceReason } from '../recommendations/hybrid'
import { normalizeLanguage } from '../../ai-visibility/prompt-templates'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const HEBREW = /\p{Script=Hebrew}/u
const SPANISH_MARK = /[áéíóúñ¿¡]/i

function main() {
  console.log('Spanish content language')

  // ── 1) Normalization: every spelling of Spanish lands on 'es' ───────────────
  for (const raw of ['es', 'ES', ' es ', 'es-ES', 'es-MX', 'es_AR', 'es-419', 'castellano']) {
    const got = normalizeContentLanguage(raw)
    check(`1. "${raw}" → es`, got === 'es', got)
  }
  check('1a. the Spanish name "español" also normalizes to es', normalizeContentLanguage('español') === 'es')
  check('1b. Hebrew and its legacy code still normalize to he',
    normalizeContentLanguage('he') === 'he' && normalizeContentLanguage('iw') === 'he' && normalizeContentLanguage('he-IL') === 'he')
  check('1c. English still normalizes to en', normalizeContentLanguage('en-US') === 'en')
  check('1d. an unknown language still falls back to Hebrew (unchanged behavior)',
    normalizeContentLanguage('ar') === 'he' && normalizeContentLanguage('') === 'he' && normalizeContentLanguage(null) === 'he')
  // MUTATION CONTROL: 'es' must NOT be read as Hebrew — the pre-wave behavior.
  check('1e. MUTATION CONTROL — the old rule (anything not "en" is Hebrew) would fail this suite',
    (String('es').toLowerCase().startsWith('en') ? 'en' : 'he') === 'he' && normalizeContentLanguage('es') !== 'he')

  // ── 2) Script and direction: Spanish is latin and left-to-right ─────────────
  check('2. Spanish is latin script', contentScript('es') === 'latin')
  check('2a. Spanish reads left-to-right', contentDirection('es') === 'ltr')
  check('2b. Hebrew is still hebrew/rtl', contentScript('he') === 'hebrew' && contentDirection('he') === 'rtl')
  check('2c. Spanish names itself "Spanish" to the model', languageNameInEnglish('es') === 'Spanish')
  check('2d. MUTATION CONTROL — es would be wrong as rtl', contentDirection('es') !== 'rtl')

  // ── 3) Topic suggestions come back in Spanish ──────────────────────────────
  const esTopics = suggestTopics('zapatillas de running', 'es', 'commercial', 6)
  check('3. Spanish topics are produced', esTopics.length >= 4, String(esTopics.length))
  check('3a. no Hebrew letter appears in a Spanish topic', !HEBREW.test(esTopics.join(' ')), esTopics.join(' | ').slice(0, 90))
  check('3b. the topics read as Spanish (accents or opening marks)', esTopics.some((t) => SPANISH_MARK.test(t)), esTopics[0])
  const heTopics = suggestTopics('נעלי ריצה', 'he', 'commercial', 6)
  check('3c. Hebrew topics are unchanged', heTopics.length >= 4 && HEBREW.test(heTopics.join(' ')))
  check('3d. MUTATION CONTROL — Spanish and Hebrew topic sets differ', esTopics[0] !== heTopics[0])

  // ── 4) The AI-visibility question suggested for a Spanish article ──────────
  check('4. a Spanish project resolves to the Spanish suggestion language', suggestionLanguage('es-MX') === 'es')
  const esQ = suggestAiQuery({ keyword: 'mejor cafetera de goteo', title: null, language: 'es', brandTerms: [] })
  check('4a. a Spanish question is produced', !!esQ, String(esQ))
  check('4b. the question is in Spanish, not Hebrew', !!esQ && !HEBREW.test(esQ), String(esQ))
  check('4c. the question carries its Spanish opening mark and starts capitalized',
    !!esQ && esQ.includes('¿') && /^[A-ZÁÉÍÓÚÑ¿]/.test(esQ), String(esQ))
  const esQ2 = suggestAiQuery({ keyword: '¿cómo elegir una cafetera?', title: null, language: 'es', brandTerms: [] })
  check('4d. a keyword already phrased as a question is kept as one', !!esQ2 && esQ2.includes('cómo'), String(esQ2))
  const heQ = suggestAiQuery({ keyword: 'מכונת קפה מומלצת', title: null, language: 'he', brandTerms: [] })
  check('4e. the Hebrew question is unchanged', !!heQ && HEBREW.test(heQ), String(heQ))
  check('4f. MUTATION CONTROL — the Spanish question is not the Hebrew one', esQ !== heQ)

  // ── 5) Article HTML: headings and direction follow the language ────────────
  const article = {
    title: 'Cómo elegir una cafetera', slug: 'como-elegir-una-cafetera', metaTitle: 'Cafeteras',
    metaDescription: 'Guía', excerpt: 'Guía', searchIntent: 'commercial',
    directAnswer: 'Elige según el tipo de café que bebes a diario.',
    intro: ['La elección depende del uso.'],
    sections: [{ heading: 'Tipos de cafetera', answerFirst: 'Hay tres familias.', paragraphs: ['Cada familia sirve a un uso distinto.'], bullets: ['Goteo', 'Espresso'], table: { caption: 'Comparación', columns: ['Tipo', 'Precio'], rows: [['Goteo', 'Bajo'], ['Espresso', 'Alto']] }, subsections: [] }],
    comparisonTables: [], faq: [{ question: '¿Cuánto cuesta?', answer: 'Depende del tipo y la marca que elijas al final.' }],
    imagePrompt: '', warnings: [],
  }
  const esHtml = buildArticleHtml(article as never, 'es', true)
  check('5. the Spanish FAQ heading is Spanish', esHtml.includes('Preguntas frecuentes'), esHtml.slice(0, 60))
  check('5a. the Spanish article has no Hebrew FAQ heading', !esHtml.includes('שאלות נפוצות'))
  check('5b. a Spanish table is NOT marked rtl', !/\<table dir="rtl"/.test(esHtml))
  check('5c. the Spanish table of contents label is Spanish', esHtml.includes('Tabla de contenidos'))
  const heHtml = buildArticleHtml(article as never, 'he', true)
  check('5d. a Hebrew table is still marked rtl', /\<table dir="rtl"/.test(heHtml))
  check('5e. MUTATION CONTROL — the Spanish HTML differs from the Hebrew HTML', esHtml !== heHtml)

  // ── 6) The audit judges a Spanish article by the latin script ─────────────
  const esBody = '<h2>Tipos de cafetera</h2><p>' + 'La cafetera de goteo prepara café suave y conviene a quien bebe varias tazas. '.repeat(6) + '</p>'
  const esAudit = runArticleAudit({ desiredWordCount: 900, ctaDetails: {}, brandName: null, businessName: null, contentHtml: esBody, title: 'Cómo elegir una cafetera', metaTitle: 'Cafeteras', metaDescription: 'Guía práctica para elegir una cafetera según el tipo de café que bebes cada día en casa.', primaryKeyword: 'cafetera', secondaryKeywords: [], faq: [], anchors: [], language: 'es', includeBrandName: false, ctaPreference: 'none' } as never)
  const esLangCheck = esAudit.checks.find((c) => c.code === 'language_matches')
  check('6. the Spanish article passes language_matches', !!esLangCheck && esLangCheck.ok, JSON.stringify(esLangCheck))
  const heInEsAudit = runArticleAudit({ desiredWordCount: 900, ctaDetails: {}, brandName: null, businessName: null, contentHtml: '<h2>סוגי מכונות קפה</h2><p>' + 'מכונת קפה טפטוף מתאימה למי ששותה כמה כוסות ביום. '.repeat(6) + '</p>', title: 'איך לבחור מכונת קפה', metaTitle: 'מכונות קפה', metaDescription: 'מדריך לבחירת מכונת קפה לפי סוג הקפה שאתם שותים בכל יום בבית.', primaryKeyword: 'מכונת קפה', secondaryKeywords: [], faq: [], anchors: [], language: 'es', includeBrandName: false, ctaPreference: 'none' } as never)
  const heInEsCheck = heInEsAudit.checks.find((c) => c.code === 'language_matches')
  check('6a. MUTATION CONTROL — a HEBREW body returned for a Spanish project FAILS language_matches',
    !!heInEsCheck && !heInEsCheck.ok, JSON.stringify(heInEsCheck))
  const heAudit = runArticleAudit({ desiredWordCount: 900, ctaDetails: {}, brandName: null, businessName: null, contentHtml: '<h2>סוגי מכונות קפה</h2><p>' + 'מכונת קפה טפטוף מתאימה למי ששותה כמה כוסות ביום. '.repeat(6) + '</p>', title: 'איך לבחור מכונת קפה', metaTitle: 'מכונות קפה', metaDescription: 'מדריך לבחירת מכונת קפה לפי סוג הקפה שאתם שותים בכל יום בבית.', primaryKeyword: 'מכונת קפה', secondaryKeywords: [], faq: [], anchors: [], language: 'he', includeBrandName: false, ctaPreference: 'none' } as never)
  const heLangCheck = heAudit.checks.find((c) => c.code === 'language_matches')
  check('6b. a Hebrew article still passes language_matches for a Hebrew project', !!heLangCheck && heLangCheck.ok)

  // ── 7) Anchor quality knows the Spanish mechanical phrases ───────────────
  const mech = analyzeAnchorQuality('<h2>Guía</h2>' + '<p>Texto de relleno para separar el enlace del comienzo del artículo.</p>'.repeat(4) + '<p>Para más información <a href="https://x.es">haz clic aquí</a>.</p>', 'es')
  check('7. a mechanical Spanish anchor phrase is caught', mech.warnings.includes('anchor_inserted_mechanically'), JSON.stringify(mech.warnings))
  const natural = analyzeAnchorQuality('<h2>Guía</h2>' + '<p>Texto de relleno para separar el enlace del comienzo del artículo.</p>'.repeat(4) + '<p>La <a href="https://x.es">cafetera de goteo</a> sirve para varias tazas.</p>', 'es')
  check('7a. MUTATION CONTROL — a natural Spanish anchor is NOT flagged mechanical',
    !natural.warnings.includes('anchor_inserted_mechanically'), JSON.stringify(natural.warnings))

  // ── 8) The owner-facing reason is written in Spanish ──────────────────────
  check('8. every content language has reason text', CONTENT_LANGUAGES.every((l) => !!REASON_TEXT[l].neutral))
  check('8a. the Spanish neutral reason is Spanish', !HEBREW.test(REASON_TEXT.es.neutral) && SPANISH_MARK.test(REASON_TEXT.es.neutral), REASON_TEXT.es.neutral)
  const esDemand = demandSentence('es', 'cafetera de goteo', 1200)
  check('8b. the Spanish demand sentence names the query and the volume, in Spanish',
    esDemand.includes('cafetera de goteo') && /1[.,]?200/.test(esDemand) && !HEBREW.test(esDemand), esDemand)
  check('8c. a missing demand query produces NO sentence instead of the word "null"',
    demandSentence('es', null, 1200) === '' && demandSentence('he', null, 1200) === '')
  check('8d. the Spanish provenance summary is Spanish',
    !HEBREW.test(hybridProvenanceReason(['site_scan', 'keyword'], 'es', '')) && hybridProvenanceReason(['site_scan', 'keyword'], 'es', '').includes('Respaldado'),
    hybridProvenanceReason(['site_scan', 'keyword'], 'es', ''))
  check('8e. MUTATION CONTROL — the Spanish reason is not the Hebrew one', REASON_TEXT.es.neutral !== REASON_TEXT.he.neutral)

  // ── 9) The layers that are NOT Spanish-aware yet fall back to ENGLISH ────
  check('9. toHebrewOrEnglish sends Spanish to English, never to Hebrew', toHebrewOrEnglish('es') === 'en')
  check('9a. the AI-visibility templates treat a Spanish project as English (latin script)',
    normalizeLanguage('es') === 'en' && normalizeLanguage('es-MX') === 'en')
  check('9b. MUTATION CONTROL — a Hebrew project is still Hebrew there, and an unknown one still falls back',
    normalizeLanguage('he') === 'he' && normalizeLanguage('ar') === 'he')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
