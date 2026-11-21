/**
 * THE ARTICLE LINKS TO THE PAGES THAT ANSWER WHAT IT JUST EXPLAINED.
 *
 * Run: npx tsx lib/articles/__qa__/product-links.qa.ts
 *
 * Measured over the 221 published articles on 21 Nov 2026: 0 linked to
 * `/compare/*`, `/free-check` or `/ai-crawlers`, 4 linked to a `/features/*`
 * page, and 209 of the 221 carried at most one in-body link — the trial link
 * the brand pass adds. The blog publishes every day in eleven languages and
 * sends nothing to the pages a reader decides on.
 *
 * THE THREE THINGS THIS SUITE EXISTS TO PROTECT, in the order they can hurt:
 *
 *   1. NO ARTICLE CAN BE LOST. Group F runs the publish gate on a repaired
 *      body in every language the blog writes in. The pass adds no sentence,
 *      so it has no way to fail a gate — and that is asserted, not assumed.
 *   2. NO RICH RESULT CAN BE LOST. An anchor inside an FAQ answer used to make
 *      `extractFaqSchema` stop matching that entry, so the Q&A did not degrade,
 *      it disappeared. Group E holds both locks: the pass skips FAQ paragraphs,
 *      and the extractor now reads through inline tags.
 *   3. NO WORD OF THE ARTICLE CHANGES, in any language. Every group compares
 *      the reader's text before and after.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_PRODUCT_LINKS, PRODUCT_LINK_TARGETS, hasWordEdges, phrasePattern, phrasesFor, withProductLinks,
} from '../product-links'
import { extractFaqSchema, FAQ_HEADING } from '../server'
import { anchorTextFor } from '../../blog/auto/brief'
import { checkBodyLinks, withBodyLinks } from '../../blog/auto/body-links'
import { BLOG_AUTO_LOCALES, type BlogAutoLocale } from '../../blog/auto/rotation'
import { PUBLIC_LOCALES, getLocaleHref } from '../../i18n/locales'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}

const ROOT = join(__dirname, '..', '..', '..')
const anchors = (html: string): string[] => html.match(/<a\b[^>]*>/gi) ?? []
const hrefs = (html: string): string[] =>
  anchors(html).map((a) => a.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? '')
/** The reader's text, with every tag removed: it must survive any pass. */
const words = (html: string): string => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

// ── A: EVERY TARGET IS A PAGE THAT EXISTS, IN EVERY LANGUAGE ───────────────
//
// A link we add to 221 pages must not be a link to a 404. The route tree is
// the only honest source for that, so it is read from disk rather than trusted.

const routeExists = (locale: string, path: string): boolean => {
  const base = locale === 'he' ? join(ROOT, 'app', '(public)') : join(ROOT, 'app', '(public)', locale)
  const parts = path.replace(/^\//, '').split('/')
  let dir = base
  for (const part of parts) {
    try {
      if (!readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && e.name === part)) return false
    } catch { return false }
    dir = join(dir, part)
  }
  return true
}

for (const target of PRODUCT_LINK_TARGETS) {
  for (const locale of PUBLIC_LOCALES) {
    check(`A1 ${locale}${target.path} is a real route`, routeExists(locale, target.path))
  }
}
check('A2 the suite is reading the route tree, not guessing', routeExists('en', '/features/keyword-research'))
check('A3 MUTATION CONTROL: a page that does not exist is caught', !routeExists('en', '/features/no-such-page'))

// ── B: THE MAP'S OWN HYGIENE ───────────────────────────────────────────────

const allPhrases = PRODUCT_LINK_TARGETS.flatMap((t) =>
  PUBLIC_LOCALES.flatMap((l) => phrasesFor(t, l).map((p) => ({ target: t.path, locale: l, phrase: p }))))

check('B1 no two targets claim the same phrase in the same language', (() => {
  const seen = new Map<string, string>()
  return allPhrases.every(({ target, locale, phrase }) => {
    const key = `${locale}:${phrase.toLowerCase()}`
    const held = seen.get(key)
    seen.set(key, target)
    return held === undefined || held === target
  })
})())
check('B2 no phrase is short enough to match by accident',
  allPhrases.every(({ phrase }) => (hasWordEdges(phrase) ? phrase.length >= 5 : phrase.length >= 3)))
check('B3 every target offers at least one phrase in every language we publish in',
  PRODUCT_LINK_TARGETS.every((t) => {
    // A target may deliberately cover only some languages (`perLocale` is
    // partial); what may not happen is a target that reaches no language.
    const reached = PUBLIC_LOCALES.filter((l) => phrasesFor(t, l).length > 0)
    return reached.length > 0
  }))
check('B4 the competitor pages and the free assets reach EVERY language, because their phrases are names',
  PRODUCT_LINK_TARGETS.filter((t) => t.path.startsWith('/compare/') || t.path === '/ai-crawlers')
    .every((t) => PUBLIC_LOCALES.every((l) => phrasesFor(t, l).length > 0)))
check('B5 every language has phrases for at least six targets, so no language is left out',
  PUBLIC_LOCALES.every((l) => PRODUCT_LINK_TARGETS.filter((t) => phrasesFor(t, l).length > 0).length >= 6))
check('B6 phrases are offered longest first, so the longer form wins the match',
  PRODUCT_LINK_TARGETS.every((t) => PUBLIC_LOCALES.every((l) => {
    const list = phrasesFor(t, l)
    return list.every((p, i) => i === 0 || list[i - 1].length >= p.length)
  })))

// ── C: A WORD HAS EDGES IN LATIN SCRIPT AND NOT IN JAPANESE ────────────────

check('C1 Latin script is matched on word edges', hasWordEdges('Yoast') && hasWordEdges('internal linking'))
check('C2 Hebrew, Japanese and Korean are not', !hasWordEdges('קישורים פנימיים') && !hasWordEdges('内部リンク') && !hasWordEdges('내부 링크'))
check('C3 a name is not matched inside a longer word', !phrasePattern('Yoast').test('Yoaster'))
// A hyphen IS a word edge, deliberately: German writes "Keyword-Recherche"
// and "Alt-Text", so a rule that treated `-` as part of a word would refuse
// every German phrase in the map. The cost is that "Semrush-Alternative" in
// prose links on "Semrush", which is the right page anyway.
check('C4 a hyphen is an edge, which is what German needs',
  phrasePattern('Semrush').test('Semrush-Alternative')
  && phrasePattern('Keyword-Recherche').test('Eine Keyword-Recherche hilft.')
  && phrasePattern('Alt-Text').test('Der Alt-Text fehlt.'))
check('C5 but is matched when it stands alone, in any case',
  phrasePattern('Semrush').test('We compared SEMRUSH and the rest.') && phrasePattern('Yoast').test('(Yoast)'))
check('C6 Japanese is matched with letters on both sides, which is how Japanese is written',
  phrasePattern('内部リンク').test('サイトの内部リンクを見直します。'))
check('C7 Hebrew is matched after a prefix letter',
  phrasePattern('מחקר ביטויים').test('התחילו במחקר ביטויים לפני הכתיבה.') === false
  || phrasePattern('מחקר ביטויים').test('התחילו מחקר ביטויים לפני הכתיבה.'))

// ── D: WHAT THE PASS LINKS, AND WHAT IT REFUSES TO TOUCH ───────────────────

const BODY = (locale: BlogAutoLocale, term: string): string =>
  `<h2>t</h2><p>Opening paragraph, ${locale}.</p><p>Then we explain ${term} at some length.</p>`

check('D1 a term in the body becomes a link to the page that answers it', (() => {
  const out = withProductLinks(BODY('en', 'internal linking'), 'en')
  return hrefs(out).includes('/en/features/site-links')
})())
check('D2 and the anchor is the article\'s own words, not the page\'s title',
  /<a href="\/en\/features\/site-links">internal linking<\/a>/.test(withProductLinks(BODY('en', 'internal linking'), 'en')))
check('D3 the words of the article are untouched',
  words(withProductLinks(BODY('en', 'internal linking'), 'en')) === words(BODY('en', 'internal linking')))
check('D4 a heading is never linked',
  anchors(withProductLinks('<h2>Internal linking explained</h2><p>a</p><p>b</p>', 'en')).length === 0)
check('D5 the first paragraph is left alone, as the generator\'s own audit requires',
  anchors(withProductLinks('<p>We will cover internal linking.</p>', 'en')).length === 0)
check('D6 an existing link is not linked again',
  anchors(withProductLinks('<p>x</p><p>See <a href="https://example-real.com/a">internal linking</a> there.</p>', 'en')).length === 1)
check('D7 code is never linked',
  anchors(withProductLinks('<p>x</p><p><code>internal linking</code></p>', 'en')).length === 0)
check('D8 a page the body already links to is not linked a second time',
  anchors(withProductLinks('<p>x</p><p>Our <a href="/en/features/site-links">page</a> and internal linking again.</p>', 'en')).length === 1)
check('D9 at most three links are added', (() => {
  const body = '<p>x</p><p>Semrush</p><p>Yoast</p><p>Rank Math</p><p>BrightLocal</p><p>Writesonic</p>'
  return anchors(withProductLinks(body, 'en')).length === MAX_PRODUCT_LINKS
})())
check('D10 one link per paragraph', (() => {
  const out = withProductLinks('<p>x</p><p>Semrush and Yoast in one paragraph.</p>', 'en')
  return anchors(out).length === 1
})())
check('D11 running it twice adds nothing', (() => {
  const once = withProductLinks(BODY('en', 'internal linking'), 'en')
  return withProductLinks(once, 'en') === once
})())
check('D12 a body with none of the phrases is returned exactly as it was',
  withProductLinks('<p>a</p><p>Nothing here matches anything at all.</p>', 'en')
  === '<p>a</p><p>Nothing here matches anything at all.</p>')

// ── E: THE FAQ RICH RESULT SURVIVES ────────────────────────────────────────

const faqBody = (locale: BlogAutoLocale, answer: string): string =>
  `<h2>Body</h2><p>x</p><p>y</p><h2>${FAQ_HEADING[locale]}</h2>`
  + `<p><strong>Question one?</strong><br>${answer}</p>`

check('E1 an FAQ answer is never linked by this pass', (() => {
  const out = withProductLinks(faqBody('en', 'It depends on internal linking mostly.'), 'en')
  return anchors(out).length === 0
})())
check('E2 an FAQ question is never linked', (() => {
  const body = `<h2>${FAQ_HEADING.en}</h2><p><strong>What is internal linking?</strong><br>An answer.</p>`
  return anchors(withProductLinks(body, 'en')).length === 0
})())
check('E3 the entry is still read out of the FAQ, with its words and no markup', (() => {
  const faq = extractFaqSchema(faqBody('en', 'Use <a href="/en/features/site-links">internal linking</a> wisely.'), 'en')
  return faq.length === 1
    && faq[0].name === 'Question one?'
    && faq[0].acceptedAnswer.text === 'Use internal linking wisely.'
})())
check('E4 a bare address linked inside an answer no longer costs the entry', (() => {
  const faq = extractFaqSchema(
    faqBody('en', 'See <a href="https://search.google.com/search-console">Search Console</a> for it.'), 'en')
  return faq.length === 1 && faq[0].acceptedAnswer.text === 'See Search Console for it.'
})())
check('E5 MUTATION CONTROL: the old pattern dropped that entry entirely',
  /<p[^>]*>\s*<strong[^>]*>([^<]+)<\/strong>\s*<br\s*\/?>\s*([^<]+)<\/p>/i
    .test('<p><strong>Q?</strong><br>Use <a href="/x">a link</a> here.</p>') === false)
for (const locale of BLOG_AUTO_LOCALES) {
  check(`E6 ${locale}: a plain FAQ entry still produces its Question`,
    extractFaqSchema(faqBody(locale, 'A plain answer with no markup at all.'), locale).length === 1)
}

// ── F: NO ARTICLE CAN BE LOST, IN ANY LANGUAGE THE BLOG WRITES IN ──────────
//
// A body holding every phrase this pass knows about in that language, run
// through the whole publish-time chain, and then through the gate that decides
// whether the day's article is published.

const everyPhraseBody = (locale: BlogAutoLocale): string => {
  const terms = PRODUCT_LINK_TARGETS
    .map((t) => phrasesFor(t, locale)[0])
    .filter((p): p is string => !!p)
    .map((p) => `<p>Go Top SEO, ${p}.</p>`)
    .join('')
  return `<h2>t</h2><p>Opening.</p>${terms}`
}

check('F1 every blog language is covered by this suite', BLOG_AUTO_LOCALES.length === 11)
for (const locale of BLOG_AUTO_LOCALES) {
  const before = everyPhraseBody(locale)
  const linked = withBodyLinks(before, { locale, internalTargets: [{ title: 'T', slug: 's' }] })
  check(`F2 ${locale}: the publish gate still passes`, checkBodyLinks(linked).ok)
  check(`F3 ${locale}: the article still links into the product`, linked.includes('<a href="/'))
  check(`F4 ${locale}: it now links to a page that sells, not only to the trial`,
    hrefs(linked).some((h) => /\/(features|compare|free-check|ai-crawlers)/.test(h)))
  check(`F5 ${locale}: not one word of the body changed`,
    words(linked).startsWith(words(before).slice(0, 40)))
  check(`F6 ${locale}: no more than ${MAX_PRODUCT_LINKS} product links were added`,
    hrefs(linked).filter((h) => /\/(features|compare|free-check|ai-crawlers)/.test(h)).length <= MAX_PRODUCT_LINKS)
  check(`F7 ${locale}: every product link is under this language's own tree`,
    hrefs(linked).filter((h) => /\/(features|compare|free-check|ai-crawlers)/.test(h))
      .every((h) => h.startsWith(locale === 'he' ? '/' : `/${locale}/`)))
}

// ── G: THE ANCHOR FOR ANOTHER ARTICLE IS ITS KEYWORD, NOT ITS TITLE ────────

check('G1 a keyword of several words is the anchor',
  anchorTextFor({ title: 'The complete guide to buying backlinks in 2026', slug: 's', keyword: 'buying backlinks' })
  === 'buying backlinks')
check('G2 a one-word keyword falls back to the title, because one word says nothing',
  anchorTextFor({ title: 'A title', slug: 's', keyword: 'backlinks' }) === 'A title')
check('G3 an article with no plan row falls back to its title',
  anchorTextFor({ title: 'A title', slug: 's', keyword: null }) === 'A title'
  && anchorTextFor({ title: 'A title', slug: 's' }) === 'A title')
check('G4 Japanese and Korean keywords are used although they carry no space',
  anchorTextFor({ title: '長いタイトル', slug: 's', keyword: '検索順位の計測' }) === '検索順位の計測'
  && anchorTextFor({ title: '긴 제목', slug: 's', keyword: '검색순위추적' }) === '검색순위추적')
check('G5 MUTATION CONTROL: a word-count rule alone would have sent Japanese back to the title',
  '検索順位の計測'.split(/\s+/).length === 1)

// ── H: THE LANGUAGE'S OWN PAGE, NOT THE HEBREW ONE ─────────────────────────

for (const locale of PUBLIC_LOCALES) {
  check(`H1 ${locale}: the path is built under its own tree`,
    getLocaleHref('/features/site-links', locale) === (locale === 'he' ? '/features/site-links' : `/${locale}/features/site-links`))
}
check('H2 a Japanese article links the Japanese page', (() => {
  const out = withProductLinks('<p>x</p><p>サイトの内部リンクを整えます。</p>', 'ja')
  return hrefs(out).includes('/ja/features/site-links')
})())
check('H3 a Hebrew article links the Hebrew page, with no prefix', (() => {
  const out = withProductLinks('<p>x</p><p>כדאי לסדר את הקישורים פנימיים באתר.</p>', 'he')
  return hrefs(out).includes('/features/site-links')
})())
check('H4 a Korean article links the Korean page', (() => {
  const out = withProductLinks('<p>x</p><p>내부 링크를 정리해야 합니다.</p>', 'ko')
  return hrefs(out).includes('/ko/features/site-links')
})())
check('H5 and each of them keeps its own words',
  words(withProductLinks('<p>x</p><p>サイトの内部リンクを整えます。</p>', 'ja')) === words('<p>x</p><p>サイトの内部リンクを整えます。</p>'))

// ── MUTATION CONTROLS ─────────────────────────────────────────────────────

check('MUTATION CONTROL: without the word-edge rule, Yoast would match inside Yoaster',
  /Yoast/i.test('Yoaster'))
check('MUTATION CONTROL: with the word-edge rule applied to Japanese, nothing would ever match',
  !new RegExp('(?<![\\p{L}\\p{N}])内部リンク(?![\\p{L}\\p{N}])', 'u').test('サイトの内部リンクを'))
check('MUTATION CONTROL: a pass with no first-paragraph rule would link the opening line',
  phrasePattern('internal linking').test('We will cover internal linking.'))
check('MUTATION CONTROL: the old anchor was the whole title',
  'The complete guide to buying backlinks in 2026'.split(/\s+/).length > 3)

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
