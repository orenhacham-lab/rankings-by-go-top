/**
 * Brazilian Portuguese content language — the contract that a pt-BR article is
 * actually written in Portuguese, and never silently in Hebrew or Spanish.
 *
 * Portuguese was a RESEARCH-only language until 17 Oct 2026: `ContentLanguage`
 * was he | en | es, so a value of 'pt' normalized to Hebrew and a Portuguese
 * project would have been written, audited and rendered in Hebrew. Adding the
 * language is adding its DATA — every word list, prompt line, heading and audit
 * table behind the type — so these checks call the real functions and each group
 * ends with a MUTATION CONTROL proving the check can fail.
 *
 * Mirrors spanish-content-language.qa.ts, which owns the same contract for es.
 */
import { normalizeContentLanguage, contentDirection, contentScript, languageNameInEnglish, toHebrewOrEnglish, contentLanguageOrEnglish, CONTENT_LANGUAGES } from '../language'
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
/** Marks Portuguese carries and English does not. */
const PORTUGUESE_MARK = /[ãõçáéêíóúâ]/i
/** Spanish-only marks: a Portuguese string carrying one is Spanish left behind. */
const SPANISH_ONLY = /[ñ¿¡]/

function main() {
  console.log('Brazilian Portuguese content language')

  // ── 1) Normalization: every spelling of Portuguese lands on 'pt-BR' ────────
  for (const raw of ['pt-BR', 'pt', 'PT', ' pt-br ', 'pt_BR', 'pt-PT', 'português']) {
    const got = normalizeContentLanguage(raw)
    check(`1. "${raw}" → pt-BR`, got === 'pt-BR', got)
  }
  check('1a. the other languages still normalize as they did',
    normalizeContentLanguage('he') === 'he' && normalizeContentLanguage('iw') === 'he'
    && normalizeContentLanguage('en-US') === 'en' && normalizeContentLanguage('es-MX') === 'es')
  check('1b. an unknown language still falls back to Hebrew (unchanged behavior)',
    normalizeContentLanguage('ar') === 'he' && normalizeContentLanguage('') === 'he' && normalizeContentLanguage(null) === 'he')
  check('1c. a research-only language still reads as English, not Hebrew',
    contentLanguageOrEnglish('fr') === 'en' && contentLanguageOrEnglish('pt-BR') === 'pt-BR')
  // MUTATION CONTROL: the pre-wave rule sent Portuguese to Hebrew.
  check('1d. MUTATION CONTROL — the old rule (anything not en/es/he is Hebrew) would fail this suite',
    normalizeContentLanguage('pt-BR') !== 'he' && CONTENT_LANGUAGES.includes('pt-BR'))

  // ── 2) Script and direction ───────────────────────────────────────────────
  check('2. Portuguese is latin script', contentScript('pt-BR') === 'latin')
  check('2a. Portuguese reads left-to-right', contentDirection('pt-BR') === 'ltr')
  check('2b. it names itself Brazilian Portuguese to the model', languageNameInEnglish('pt-BR') === 'Brazilian Portuguese')
  check('2c. Hebrew is still hebrew/rtl', contentScript('he') === 'hebrew' && contentDirection('he') === 'rtl')
  check('2d. MUTATION CONTROL — pt-BR would be wrong as rtl', contentDirection('pt-BR') !== 'rtl')

  // ── 3) Topic suggestions come back in Portuguese ──────────────────────────
  const ptTopics = suggestTopics('tênis de corrida', 'pt-BR', 'commercial', 6)
  check('3. Portuguese topics are produced', ptTopics.length >= 4, String(ptTopics.length))
  check('3a. no Hebrew letter appears in a Portuguese topic', !HEBREW.test(ptTopics.join(' ')), ptTopics.join(' | ').slice(0, 90))
  check('3b. the topics read as Portuguese', ptTopics.some((t) => PORTUGUESE_MARK.test(t)), ptTopics[0])
  check('3c. no Spanish-only mark leaked in', !SPANISH_ONLY.test(ptTopics.join(' ')), ptTopics.join(' | ').slice(0, 90))
  const esTopics = suggestTopics('zapatillas de running', 'es', 'commercial', 6)
  check('3d. MUTATION CONTROL — the Portuguese set is not the Spanish one', ptTopics[0] !== esTopics[0])

  // ── 4) The AI-visibility question suggested for a Portuguese article ──────
  check('4. a Portuguese project resolves to the Portuguese suggestion language', suggestionLanguage('pt-BR') === 'pt-BR')
  const ptQ = suggestAiQuery({ keyword: 'melhor cafeteira elétrica', title: null, language: 'pt-BR', brandTerms: [] })
  check('4a. a Portuguese question is produced', !!ptQ, String(ptQ))
  check('4b. the question is in Portuguese, not Hebrew and not Spanish',
    !!ptQ && !HEBREW.test(ptQ) && !SPANISH_ONLY.test(ptQ), String(ptQ))
  const ptQ2 = suggestAiQuery({ keyword: 'como escolher uma cafeteira?', title: null, language: 'pt-BR', brandTerms: [] })
  check('4c. a keyword already phrased as a question is kept as one', !!ptQ2 && /como/i.test(ptQ2), String(ptQ2))
  const heQ = suggestAiQuery({ keyword: 'מכונת קפה מומלצת', title: null, language: 'he', brandTerms: [] })
  check('4d. MUTATION CONTROL — the Portuguese question is not the Hebrew one', ptQ !== heQ)

  // ── 5) Article HTML: headings and direction follow the language ───────────
  const article = {
    title: 'Como escolher uma cafeteira', slug: 'como-escolher-uma-cafeteira', metaTitle: 'Cafeteiras',
    metaDescription: 'Guia', excerpt: 'Guia', searchIntent: 'commercial',
    directAnswer: 'Escolha de acordo com o café que você bebe todos os dias.',
    intro: ['A escolha depende do uso.'],
    sections: [{ heading: 'Tipos de cafeteira', answerFirst: 'São três famílias.', paragraphs: ['Cada família serve a um uso diferente.'], bullets: ['Filtro', 'Espresso'], table: { caption: 'Comparação', columns: ['Tipo', 'Preço'], rows: [['Filtro', 'Baixo'], ['Espresso', 'Alto']] }, subsections: [] }],
    comparisonTables: [], faq: [{ question: 'Quanto custa?', answer: 'Depende do tipo e da marca que você escolher no fim.' }],
    imagePrompt: '', warnings: [],
  }
  const ptHtml = buildArticleHtml(article as never, 'pt-BR', true)
  check('5. the Portuguese FAQ heading is Portuguese', ptHtml.includes('Perguntas frequentes'), ptHtml.slice(0, 60))
  check('5a. it carries no Hebrew and no Spanish heading',
    !ptHtml.includes('שאלות נפוצות') && !ptHtml.includes('Preguntas frecuentes'))
  check('5b. a Portuguese table is NOT marked rtl', !/<table dir="rtl"/.test(ptHtml))
  check('5c. the Portuguese table of contents label is Portuguese', ptHtml.includes('Índice'))
  const heHtml = buildArticleHtml(article as never, 'he', true)
  check('5d. MUTATION CONTROL — a Hebrew table is still marked rtl and the HTML differs',
    /<table dir="rtl"/.test(heHtml) && ptHtml !== heHtml)

  // ── 6) The audit judges a Portuguese article by the latin script ──────────
  const ptBody = '<h2>Tipos de cafeteira</h2><p>' + 'A cafeteira de filtro prepara um café suave e atende a quem bebe várias xícaras. '.repeat(6) + '</p>'
  const ptAudit = runArticleAudit({ desiredWordCount: 900, ctaDetails: {}, brandName: null, businessName: null, contentHtml: ptBody, title: 'Como escolher uma cafeteira', metaTitle: 'Cafeteiras', metaDescription: 'Guia prático para escolher uma cafeteira segundo o café que você bebe todos os dias em casa.', primaryKeyword: 'cafeteira', secondaryKeywords: [], faq: [], anchors: [], language: 'pt-BR', includeBrandName: false, ctaPreference: 'none' } as never)
  const ptLangCheck = ptAudit.checks.find((c) => c.code === 'language_matches')
  check('6. the Portuguese article passes language_matches', !!ptLangCheck && ptLangCheck.ok, JSON.stringify(ptLangCheck))
  const heInPtAudit = runArticleAudit({ desiredWordCount: 900, ctaDetails: {}, brandName: null, businessName: null, contentHtml: '<h2>סוגי מכונות קפה</h2><p>' + 'מכונת קפה טפטוף מתאימה למי ששותה כמה כוסות ביום. '.repeat(6) + '</p>', title: 'איך לבחור מכונת קפה', metaTitle: 'מכונות קפה', metaDescription: 'מדריך לבחירת מכונת קפה לפי סוג הקפה שאתם שותים בכל יום בבית.', primaryKeyword: 'מכונת קפה', secondaryKeywords: [], faq: [], anchors: [], language: 'pt-BR', includeBrandName: false, ctaPreference: 'none' } as never)
  const heInPtCheck = heInPtAudit.checks.find((c) => c.code === 'language_matches')
  check('6a. MUTATION CONTROL — a HEBREW body returned for a Portuguese project FAILS language_matches',
    !!heInPtCheck && !heInPtCheck.ok, JSON.stringify(heInPtCheck))

  // ── 7) Anchor quality knows the Portuguese mechanical phrases ─────────────
  const mech = analyzeAnchorQuality('<h2>Guia</h2>' + '<p>Texto de apoio para afastar o link do começo do artigo.</p>'.repeat(4) + '<p>Para mais informações <a href="https://x.com.br">clique aqui</a>.</p>', 'pt-BR')
  check('7. a mechanical Portuguese anchor phrase is caught', mech.warnings.includes('anchor_inserted_mechanically'), JSON.stringify(mech.warnings))
  const natural = analyzeAnchorQuality('<h2>Guia</h2>' + '<p>Texto de apoio para afastar o link do começo do artigo.</p>'.repeat(4) + '<p>A <a href="https://x.com.br">cafeteira de filtro</a> serve para várias xícaras.</p>', 'pt-BR')
  check('7a. MUTATION CONTROL — a natural Portuguese anchor is NOT flagged mechanical',
    !natural.warnings.includes('anchor_inserted_mechanically'), JSON.stringify(natural.warnings))

  // ── 8) The owner-facing reason is written in Portuguese ───────────────────
  check('8. every content language has reason text', CONTENT_LANGUAGES.every((l) => !!REASON_TEXT[l].neutral))
  check('8a. the Portuguese neutral reason is Portuguese, not Hebrew and not Spanish',
    !HEBREW.test(REASON_TEXT['pt-BR'].neutral) && !SPANISH_ONLY.test(REASON_TEXT['pt-BR'].neutral)
    && PORTUGUESE_MARK.test(REASON_TEXT['pt-BR'].neutral), REASON_TEXT['pt-BR'].neutral)
  check('8b. its numbers are grouped as Brazilian', REASON_TEXT['pt-BR'].numberLocale === 'pt-BR')
  const ptDemand = demandSentence('pt-BR', 'cafeteira de filtro', 1200)
  check('8c. the Portuguese demand sentence names the query and the volume',
    ptDemand.includes('cafeteira de filtro') && /1[.,]?200/.test(ptDemand) && !HEBREW.test(ptDemand), ptDemand)
  check('8d. the Portuguese provenance summary is Portuguese',
    hybridProvenanceReason(['site_scan', 'keyword'], 'pt-BR', '').includes('Apoiado'),
    hybridProvenanceReason(['site_scan', 'keyword'], 'pt-BR', ''))
  check('8e. MUTATION CONTROL — the Portuguese reason is neither the Hebrew nor the Spanish one',
    REASON_TEXT['pt-BR'].neutral !== REASON_TEXT.he.neutral && REASON_TEXT['pt-BR'].neutral !== REASON_TEXT.es.neutral)

  // ── 9) The layers with no Portuguese bank fall back to ENGLISH ────────────
  check('9. toHebrewOrEnglish sends Portuguese to English, never to Hebrew', toHebrewOrEnglish('pt-BR') === 'en')
  check('9a. the AI-visibility templates answer English for Portuguese, not Hebrew',
    normalizeLanguage('pt-BR') === 'en' && normalizeLanguage('pt') === 'en')
  check('9b. MUTATION CONTROL — a Hebrew project is still Hebrew there, and an unknown one still falls back',
    normalizeLanguage('he') === 'he' && normalizeLanguage('ar') === 'he')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
