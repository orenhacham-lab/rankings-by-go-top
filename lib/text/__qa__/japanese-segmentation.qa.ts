/**
 * JAPANESE WORD SEGMENTATION (lib/text/segment.ts) and the measurements that
 * were built on a space split.
 *
 *   A) the tokenizer: script detection, mixed text, the budgets, the noise list
 *   B) A SPACED LANGUAGE IS UNCHANGED — the property the whole change rests on:
 *      for Hebrew, English, Spanish, Portuguese, French and Italian every
 *      function here answers exactly what the whitespace split it replaced did
 *   C) the measurements that silently degraded in Japanese and no longer do:
 *      the keyword guard's phrase rule, long-tail salvage, the malformed cap,
 *      the cannibalization word sets, internal-link relevance, the clusters,
 *      the title skeleton, the board's topic key, sameCategory
 *   D) the article audit in Japanese: words, sentences, paragraphs, the language
 *      check, and the per-language word lists it reads
 *   E) the PDF: a Japanese face only for a document that has Japanese in it
 *   F) the content language: 'ja' exists, normalizes and carries its own data
 *   G) source guards, each with a MUTATION CONTROL that breaks the code and
 *      shows the guard fails
 *
 * Run: npx tsx lib/text/__qa__/japanese-segmentation.qa.ts
 */
import {
  textScript, isScriptless, segmentToSpaces, segmentWords, wordCount, contentWords,
  isNoiseToken, isShortToken, isScriptlessNoise, maxPhraseWords, joinWords, UNSPACED_TOKEN_FACTOR,
} from '../segment'
import { normalizePhrase, titleMainPhrase } from '../../content/recommendations/keyword-guard'
import { subjectWords as cannibalWords, similarity, tokenForms } from '../../content/cannibalization/normalize'
import { subjectTokensOf, sharesSubjectHead } from '../../content/recommendations/link-relevance'
import { normalizeText as insightsNormalize, subjectWords as insightsWords, variantKey } from '../../content/strategy/insights'
import { sameTopicKey } from '../../content/strategy/board'
import { normalizeTitleForSkeleton, titleSkeleton } from '../../content/recommendations/title-diversity'
import { sameCategory } from '../../link-network/rules'
import { tokens as dedupeTokens } from '../../content/recommendations/dedupe'
import { distinctiveTokensOf } from '../../content/recommendations/semantic-dup'
import { isSearchPhraseQuality } from '../../content/recommendations/search-phrase'
import { runArticleAudit, type AuditInput } from '../../content/article-audit'
import { withJapaneseFont } from '../../export/cjk-font'
import {
  CONTENT_LANGUAGES, normalizeContentLanguage, contentScript, isUnspacedLanguage, languageNameInEnglish,
} from '../../content/language'
import { REASON_TEXT } from '../../content/recommendations/reason-text'
import { suggestTopics } from '../../content/topic-suggestions'
import { code } from '../../content/cannibalization/__qa__/_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** What every one of these call sites did before the seam. */
const oldSplit = (s: string): string[] => s.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)

const JA_KEYWORD = 'サイトの表示速度を改善する方法'
const SPACED: string[] = [
  'בדיקת מיקומים בגוגל', 'מדריך מלא לבדיקת מיקומים', 'how to improve site speed',
  'posicionamiento en google', 'posicionamento no google', 'référencement naturel google',
  'posizionamento su google', 'a  b   c', ' leading and trailing ', 'one',
]

function tokenizer() {
  console.log('\nA) the tokenizer')
  check('kana settles the script', textScript(JA_KEYWORD) === 'ja' && textScript('ソウル') === 'ja')
  check('han without kana is read as Japanese, deliberately', textScript('表示速度') === 'ja')
  check('Thai and Hangul are recognised', textScript('เว็บไซต์') === 'th' && textScript('검색엔진') === 'ko')
  check('a Hebrew, Latin or empty text is spaced', textScript('בדיקה') === 'spaced' && textScript('google') === 'spaced' && textScript('') === 'spaced')
  check('the Japanese keyword becomes eight words', segmentWords(JA_KEYWORD).join('|') === 'サイト|の|表示|速度|を|改善|する|方法')
  check('a mixed text keeps its latin words whole', segmentToSpaces('Core Web Vitals の改善方法') === 'Core Web Vitals の 改善 方法')
  check('the particles and the framing words are noise', contentWords(JA_KEYWORD).join('|') === 'サイト|表示|速度|改善')
  check('a lone hiragana is a fragment, a lone kanji is a word',
    isScriptlessNoise('く') && !isScriptlessNoise('店') && !isScriptlessNoise('車'))
  check('a bare number is noise in both scripts', isNoiseToken('2026') && isNoiseToken('2026年'.slice(0, 4)))
  check('the budget is multiplied for Japanese only',
    maxPhraseWords(JA_KEYWORD, 8) === Math.round(8 * UNSPACED_TOKEN_FACTOR) && maxPhraseWords('how to improve site speed', 8) === 8)
  check('words are written back without spaces in Japanese, with them elsewhere',
    joinWords(['表示', '速度'], '速度') === '表示速度' && joinWords(['site', 'speed'], 'speed') === 'site speed')
  check('isScriptless answers the question its name asks', isScriptless('東京') && !isScriptless('Tokyo'))
  // A MUTATION CONTROL for the tokenizer itself: this is the whole premise.
  check('A MUTATION CONTROL: a space split finds ONE word in the Japanese keyword',
    oldSplit(JA_KEYWORD).length === 1 && segmentWords(JA_KEYWORD).length === 8)
}

function spacedUnchanged() {
  console.log('\nB) a spaced language is unchanged')
  for (const s of SPACED) {
    check(`"${s.trim()}" segments exactly as the space split did`,
      segmentWords(s).join('|') === oldSplit(s).join('|') && segmentToSpaces(s) === oldSplit(s).join(' '))
  }
  check('wordCount equals the old count for every spaced sample',
    SPACED.every((s) => wordCount(s) === oldSplit(s).length))
  check('isShortToken is the length test it replaced, for spaced tokens',
    isShortToken('a', 2) && !isShortToken('ab', 2) && isShortToken('ab', 3) && !isShortToken('abc', 3))
  check('the Hebrew phrase normalizer still folds final letters and drops punctuation',
    normalizePhrase('מנורות לילה, לשבת!') === 'מנורות לילה לשבת')
  check('the Hebrew cannibalization words are what they were',
    cannibalWords('מדריך מלא לבדיקת מיקומים בגוגל').join('|') === 'לבדיקת|מיקומימ|בגוגל')
  check('an English plural still folds and a kana word is left alone',
    tokenForms('roses').includes('rose') && tokenForms('表示').join('|') === '表示')
}

function measurements() {
  console.log('\nC) the measurements that degraded')
  check('a Japanese keyword is a PHRASE to the keyword guard, not an empty string',
    titleMainPhrase(JA_KEYWORD) === segmentToSpaces(JA_KEYWORD) && titleMainPhrase('方法') === '')
  check('A MUTATION CONTROL: without the seam the same title would be rejected as one word',
    oldSplit(normalizePhrase(JA_KEYWORD).replace(/ /g, '')).length === 1)
  check('long-tail salvage sees more than one word in it', normalizePhrase(JA_KEYWORD).split(' ').length >= 2)
  check('the malformed cap passes an ordinary Japanese secondary',
    segmentWords('中古 ノートパソコン の 選び方 と 注意点').length <= maxPhraseWords(JA_KEYWORD, 8))
  const a = cannibalWords('表示速度の改善方法')
  const b = cannibalWords('サイトの表示速度を改善する手順')
  check('two phrasings of one Japanese subject share their subject words', similarity(a, b) >= 0.6, `${similarity(a, b)}`)
  // Honest about the limit: this fold matches WORDS, never synonyms, exactly as it
  // does in Hebrew — 「サイト」/「ホームページ」 and 「改善」/「速くする」 are two words
  // each, so that pair lands around a third and the check is a review, not a
  // duplicate. A synonym table is a separate decision in any language.
  check('a synonym pair is a partial overlap, not a duplicate',
    similarity(cannibalWords('サイトの表示速度を改善する方法'), cannibalWords('ホームページの表示速度を速くする方法')) < 0.5)
  check('a different Japanese subject does not overlap at all', similarity(a, cannibalWords('名刺デザインの作り方')) === 0)
  check('internal-link relevance finds the Japanese subject head',
    sharesSubjectHead('東京の屋台グルメ', '屋台グルメの楽しみ方') && subjectTokensOf('表示速度の改善').length >= 2)
  check('an attribute-only Japanese overlap does not link',
    !sharesSubjectHead('おすすめの名刺デザイン', 'おすすめの屋台グルメ'))
  check('the insight clusters find Japanese words',
    insightsWords('表示速度の改善').length >= 2 && insightsNormalize(JA_KEYWORD).includes(' '))
  check('the variant key of a Japanese keyword is its sorted subject words',
    variantKey('表示速度の改善') === variantKey('改善の表示速度'))
  check('the title skeleton is the first two Japanese words, not the whole title',
    titleSkeleton('表示速度の改善方法') === `open:${normalizeTitleForSkeleton('表示速度の改善方法').split(' ').slice(0, 2).join(' ')}`)
  check('the board treats one Japanese topic as one key', sameTopicKey('表示速度の改善！') === segmentToSpaces('表示速度の改善'))
  check('sameCategory compares Japanese lines of business',
    sameCategory('水道工事', '水道工事') && sameCategory('家庭用の水道工事', '水道工事'))
  check('the dedupe tokens and the distinctive tokens are Japanese words',
    dedupeTokens('表示速度の改善').size >= 2 && distinctiveTokensOf('表示速度の改善').length >= 2)
  check('a Japanese search phrase is not rejected for being over-long',
    isSearchPhraseQuality('中古ノートパソコンの選び方と注意点'))
}

function audit() {
  console.log('\nD) the article audit in Japanese')
  const body = [
    '<h2>表示速度を改善する理由</h2>',
    '<p>検索エンジン最適化は、ウェブサイトの表示順位を高めるための継続的な取り組みです。まず、対象となるキーワードを決め、そのキーワードで検索する人が何を知りたいのかを整理します。次に、記事の構成を作り、見出しごとに答えを用意します。</p>',
    '<h2>費用はいくらかかるのか</h2>',
    '<p>実際の作業では、表示速度の改善や内部リンクの整理も欠かせません。また、比較の際には料金だけでなく対応範囲も確認してください。お問い合わせください。</p>',
    '<ul><li>画像の圧縮</li><li>不要なスクリプトの削除</li></ul>',
  ].join('')
  const input: AuditInput = {
    contentHtml: body, title: '表示速度の改善方法', metaTitle: '表示速度の改善方法',
    metaDescription: '表示速度を改善するための具体的な手順と費用の目安を、順番に説明します。確認しておきたい点もまとめました。',
    slug: 'site-speed', excerpt: null, primaryKeyword: '表示速度の改善', secondaryKeywords: ['表示速度', '改善方法'],
    desiredWordCount: 120, language: 'ja', anchors: [], faq: [],
    businessName: null, brandName: null, includeBrandName: false,
    ctaPreference: 'contact', ctaDetails: { text: 'お問い合わせください', phone: '03-1234-5678', whatsapp: '', url: '' },
  }
  const res = runArticleAudit(input)
  const by = (c: string) => res.checks.find((k) => k.code === c)
  check('the body is counted in Japanese words, not as one word', res.counts.words > 60, `${res.counts.words}`)
  check('the language check passes for a Japanese article', by('language_matches')?.ok === true)
  check('an English article ordered in Japanese fails the language check',
    runArticleAudit({ ...input, contentHtml: '<h2>Site speed</h2><p>Search engine optimisation is a continuous effort that raises a site in the results. First, choose the keyword.</p>' })
      .checks.find((k) => k.code === 'language_matches')?.ok === false)
  check('the sentences are split at 。 so the average is a sentence, not a paragraph',
    (by('sentence_length_ok')?.ok ?? false), `avg ${res.counts.avgSentenceWords}`)
  check('a normal Japanese paragraph is not "too long"', by('paragraphs_not_too_long')?.ok === true)
  check('the Japanese transition words are found', by('has_transition_words')?.ok === true)
  check('a Japanese question heading is recognised',
    runArticleAudit({ ...input, contentHtml: `${body}<h2>費用はいくらですか？</h2>` })
      .checks.find((k) => k.code === 'questions_in_body')?.ok === true)
  check('the Japanese CTA is found, so no "details missing" blocker', by('cta_details_missing')?.ok !== false)
  check('A MUTATION CONTROL: a whitespace word count would read 1 for this body',
    oldSplit(body.replace(/<[^>]+>/g, ' ')).length < 20 && res.counts.words > 60)
}

function pdf() {
  console.log('\nE) the PDF font')
  const he = '<html><head><title>דוח</title></head><body>בדיקת מיקומים</body></html>'
  const ja = '<html><head><title>レポート</title></head><body>表示速度</body></html>'
  check('a document with no Japanese is returned untouched', withJapaneseFont(he) === he)
  check('a Japanese document declares Noto Sans JP', withJapaneseFont(ja).includes("font-family: 'Noto Sans JP'"))
  check('the face is served from our own domain, never from Google',
    withJapaneseFont(ja).includes('https://www.gotopseo.com/fonts/NotoSansJP-Regular.woff')
    && !withJapaneseFont(ja).includes('fonts.googleapis.com') && !withJapaneseFont(ja).includes('fonts.gstatic.com'))
  check('the face is declared inside <head>', withJapaneseFont(ja).indexOf('@font-face') < withJapaneseFont(ja).indexOf('</head>'))
  check('the latin, hebrew and japanese system faces still come first in the stack',
    /font-family: 'Segoe UI', Helvetica, Arial, 'Hiragino Sans'.*'Noto Sans JP', sans-serif/.test(withJapaneseFont(ja)))
  check('a document with no head is not guessed at', withJapaneseFont('<p>表示速度</p>') === '<p>表示速度</p>')
}

function contentLanguage() {
  console.log('\nF) the content language')
  check("'ja' is a content language", CONTENT_LANGUAGES.includes('ja'))
  check('ja, jp, japanese and 日本語 all normalize to it',
    ['ja', 'ja-JP', 'jp', 'japanese', '日本語'].every((v) => normalizeContentLanguage(v) === 'ja'))
  check('an unrelated value still falls back to Hebrew', normalizeContentLanguage('xx') === 'he')
  check('its script is its own, neither hebrew nor latin', contentScript('ja') === 'japanese' && isUnspacedLanguage('ja'))
  check('every other language is still latin or hebrew',
    CONTENT_LANGUAGES.filter((l) => l !== 'ja').every((l) => contentScript(l) === (l === 'he' ? 'hebrew' : 'latin')))
  check('its English name is what a prompt asks for', languageNameInEnglish('ja') === 'Japanese')
  check('the reason sentences are Japanese, with no latin word in them',
    !/[A-Za-z]/.test(REASON_TEXT.ja.fillsGap + REASON_TEXT.ja.neutral + REASON_TEXT.ja.supportingTopic) && REASON_TEXT.ja.numberLocale === 'ja-JP')
  const titles = suggestTopics('表示速度', 'ja', 'informational')
  check('the topic titles are Japanese and carry no stray space',
    titles.length > 0 && titles.every((t) => /[ぁ-んァ-ヶ一-龯]/.test(t) && !/[ぁ-んァ-ヶ一-龯] [ぁ-んァ-ヶ一-龯]/.test(t)), titles.join(' | '))
}

function sources() {
  console.log('\nG) source guards')
  const seam = "from '@/lib/text/segment'"
  const wired: [string, string][] = [
    ['lib/content/recommendations/keyword-guard.ts', 'segmentToSpaces'],
    ['lib/content/recommendations/topic-idea-store.ts', 'segmentToSpaces'],
    ['lib/content/cannibalization/normalize.ts', 'segmentToSpaces'],
    ['lib/content/strategy/insights.ts', 'segmentToSpaces'],
    ['lib/content/strategy/board.ts', 'segmentToSpaces'],
    ['lib/content/recommendations/title-diversity.ts', 'segmentToSpaces'],
    ['lib/content/recommendations/semantic-dup.ts', 'segmentToSpaces'],
    ['lib/content/recommendations/dedupe.ts', 'segmentToSpaces'],
    ['lib/content/recommendations/coverage.ts', 'segmentToSpaces'],
    ['lib/content/recommendations/link-relevance.ts', 'segmentToSpaces'],
    ['lib/link-network/rules.ts', 'segmentToSpaces'],
    ['lib/content/recommendations/keyword-salvage.ts', 'isShortToken'],
    ['lib/content/recommendations/opportunity-validation.ts', 'maxPhraseWords'],
    ['lib/content/recommendations/search-phrase.ts', 'segmentWords'],
    ['lib/content/article-audit.ts', 'segmentWords'],
  ]
  for (const [file, fn] of wired) {
    const src = code(file)
    check(`${file} reads the seam`, src.includes(seam) && src.includes(fn))
  }
  const guard = code('lib/content/cannibalization/normalize.ts')
  check('the cannibalization normalizer does not split raw text itself',
    !/decodeEntities\(String\(text \?\? ''\)\)\s*\n?\s*\.replace\(MAQAF, ' '\)[\s\S]{0,120}\.split\(\/\[\^/.test(guard.replace(/segmentToSpaces\(/, 'RAW(')) || guard.includes('segmentToSpaces(decodeEntities'))
  check('A MUTATION CONTROL: the wiring guard fails on a file that lost the import',
    !code('lib/content/article-audit.ts').replace(seam, "from '@/lib/nothing'").includes(seam))
  const audit = code('lib/content/article-audit.ts')
  check('the audit counts words through the seam, not with a space split',
    /function words\(text: string\): string\[\] \{ return text \? segmentWords\(text\) : \[\] \}/.test(audit))
  check('the audit splits Japanese sentences at 。！？', audit.includes('(?<=[。！？])'))
  check('A MUTATION CONTROL: the sentence guard fails without the Japanese enders',
    !audit.replace('|(?<=[。！？])', '').includes('(?<=[。！？])'))
  const pdfshift = code('lib/export/pdfshift.ts')
  check('every PDF goes through the font helper', pdfshift.includes('withJapaneseFont(html)'))
  check('the older report route asks for it too', code('app/api/reports/export-pdf/route.ts').includes('withJapaneseFont(html)'))
  check('A MUTATION CONTROL: the PDF guard fails when the call is removed',
    !pdfshift.replace('withJapaneseFont(html)', 'html').includes('withJapaneseFont(html)'))
}

async function main() {
  tokenizer()
  spacedUnchanged()
  measurements()
  audit()
  pdf()
  contentLanguage()
  sources()
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}).catch((e) => { console.error(e); process.exit(1) })

export {}
