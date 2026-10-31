/**
 * THE JAPANESE PUBLIC SITE.
 *
 * Japanese is the seventh language and the twin of
 * lib/i18n/__qa__/italian-public-site.qa.ts. The compiler finds most of a missing
 * language on its own, because the gate is one function and every
 * `Record<PublicLocale, …>` stops compiling without the new key. What it cannot
 * find is a language merely ABSENT from a hand-written list, or a translation
 * that is the language it was copied FROM wearing a new name.
 *
 * Japanese is also the first language on this site that is NOT written in a Latin
 * or Hebrew script, and that changes two of these guards rather than only their
 * vocabulary:
 *
 *   · THE SCRIPT IS THE TEST. In French or Italian a copied-from language can
 *     only be caught by its function words. In Japanese a string that carries no
 *     kana and no kanji at all is almost certainly still the language it was
 *     copied from, whatever words it uses — so section D asks whether each
 *     sentence is WRITTEN in Japanese, which is a far stronger question than
 *     asking whether it avoids a list of Italian words. The exceptions are
 *     explicit: a brand name, a URL, a price, a bare number.
 *   · LENGTH IS NOT A COUNT OF WORDS. Japanese has no spaces, so nothing here
 *     measures copy by splitting on them; where a floor is needed it is read
 *     through lib/text/segment.ts, the seam the content pipeline already uses.
 *
 * The sections are the same as every other language's:
 *
 *   A) THE MIRROR. Every route under app/(public)/es has a twin under
 *      app/(public)/ja, and the same for the auth tree — load-bearing, because
 *      lib/seo/hreflang.ts DERIVES the Japanese URL from the Spanish one, so a
 *      Spanish page with no Japanese twin would advertise a 404.
 *   B) THE GATE. One `notFound()` per tree, in its layout, and no page with a
 *      flag check of its own.
 *   C) THE FLAG decides every outward sign of the language.
 *   D) THE COPY is Japanese: written in Japanese, in one register, with no
 *      promise the owner has not made and no euro price.
 *   E) THE READER NEVER CHANGES LANGUAGE.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/i18n/__qa__/japanese-public-site.qa.ts
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  PUBLIC_LOCALES, LOCALE_PREFIX, LOCALE_CONFIG, INTL_LOCALE, PAYPAL_LOCALE,
  localeHomeHref, normalizeStoredLocale, publicLocaleEnabled, enabledPublicLocales,
} from '../locales'
import { japaneseSiteEnabled } from '../japanese-site'
import { getPublicDictionary } from '../getPublicDictionary'
import { landingJa } from '../public/landing-ja'
import { pricingJa } from '../public/pricing-ja'
import { AFFILIATES_COPY } from '../public/affiliates'
import { ARTICLES_COPY, articlesIndexHref } from '../../articles/i18n'
import { availableLocales, counterpartPath } from '../../../components/LanguageSwitcher'
import { buildHreflangAlternates } from '../../seo/hreflang'
import { isJapanesePath, routePublicLocale } from '../request-locale'
import { resolveAuthLocale } from '../auth-locale'
import { wordCount, textScript } from '../../text/segment'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every route file under a tree, as a path relative to that tree. */
function routes(dir: string): string[] {
  const base = join(ROOT, dir)
  if (!existsSync(base)) return []
  const walk = (rel: string): string[] =>
    readdirSync(join(base, rel), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(rel ? `${rel}/${e.name}` : e.name)
        : e.name === 'page.tsx' || e.name === 'layout.tsx' ? [rel ? `${rel}/${e.name}` : e.name] : [])
  return walk('').sort()
}

/** Every string in a dictionary, with the path that leads to it. */
const strings = (value: unknown, path = ''): { path: string; text: string }[] => {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

console.log('A) the trees are mirrors, which is what hreflang rests on')
{
  for (const group of ['(public)', '(auth)']) {
    const es = routes(`app/${group}/es`)
    const ja = routes(`app/${group}/ja`)
    check(`A1 app/${group}: the Japanese tree has every Spanish route`,
      es.every((r) => ja.includes(r)), es.filter((r) => !ja.includes(r)).join(' '))
    /*
     * A2 allows ONE extra route, and only in the public tree: /ja/tokusho, the
     * 特定商取引法に基づく表記 page. 特定商取引法第11条 requires a distance seller to
     * display the seller, the price, the payment terms and the cancellation terms
     * in its advertisement, and Japan is the only market whose law asks for that
     * page — so it has no Spanish twin by design, it is `noindex`, and the
     * hreflang map never derives it. Any OTHER extra route is a route the
     * Spanish tree does not have, which is what this check is for.
     */
    const extras = ja.filter((r) => !es.includes(r))
    const allowed = group === '(public)' ? ['tokusho/page.tsx'] : []
    check(`A2 app/${group}: and no route the Spanish tree does not have, beyond the ones Japanese law requires`,
      extras.every((r) => allowed.includes(r)), extras.filter((r) => !allowed.includes(r)).join(' '))
    check(`A3 app/${group}: and it is not empty`, ja.length > 0)
  }
  const es = routes('app/(public)/es')
  check('A1-MUT: a Spanish route with no Japanese twin fails A1',
    ![...es, 'press-kit/page.tsx'].every((r) => routes('app/(public)/ja').includes(r)))
  check('A2-MUT: an extra route that is not the tokusho page fails A2',
    !['tokusho/page.tsx', 'kampai/page.tsx'].every((r) => ['tokusho/page.tsx'].includes(r)))
}

console.log('\nB) one gate per tree')
{
  const pub = strip(read('app/(public)/ja/layout.tsx'))
  const auth = strip(read('app/(auth)/ja/layout.tsx'))
  check('B1: the public tree 404s entirely when the flag is off',
    /if \(!japaneseSiteEnabled\(\)\) notFound\(\)/.test(pub))
  check('B2: so does the auth tree', /if \(!japaneseSiteEnabled\(\)\) notFound\(\)/.test(auth))
  check('B3: the layout declares the document Japanese and left-to-right',
    /lang="ja"/.test(pub) && /dir="ltr"/.test(pub) && /DocumentLocaleEffect locale="ja"/.test(pub))
  const pages = routes('app/(public)/ja').filter((r) => r.endsWith('page.tsx'))
  check('B4: and no page carries a gate of its own',
    pages.every((r) => !/japaneseSiteEnabled/.test(read(`app/(public)/ja/${r}`))),
    pages.filter((r) => /japaneseSiteEnabled/.test(read(`app/(public)/ja/${r}`))).join(' '))
  check('B1-MUT: a layout without the gate fails B1',
    !/if \(!japaneseSiteEnabled\(\)\) notFound\(\)/.test(pub.replace('if (!japaneseSiteEnabled()) notFound()', '')))
}

console.log('\nC) one gate, and it decides every outward sign')
{
  check('C1: "true" and nothing else turns it on',
    japaneseSiteEnabled('true') && !japaneseSiteEnabled('TRUE') && !japaneseSiteEnabled('1')
    && !japaneseSiteEnabled('') && !japaneseSiteEnabled('yes') && !japaneseSiteEnabled(undefined))

  const was = process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED
  const wasEs = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
    process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED = 'true'
    const on = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C2: with the flag on, the derived Japanese URL is announced',
      on.ja === 'https://www.gotopseo.com/ja/pricing', JSON.stringify(on))
    const home = buildHreflangAlternates('/', '/en', '/es')
    check('C3: and the home page derives to the bare prefix, not "/ja/"',
      home.ja === 'https://www.gotopseo.com/ja', home.ja)
    check('C4: a path that merely starts with the letters is not touched',
      buildHreflangAlternates('/japan', '/en/japan', '/japan').ja === 'https://www.gotopseo.com/japan')
    check('C5: the switcher offers it', availableLocales({ es: true, ja: true }).includes('ja'))
    check('C6: a Japanese path is a Japanese document',
      isJapanesePath('/ja/pricing') && routePublicLocale('/ja/pricing') === 'ja'
      && resolveAuthLocale({ pathname: '/ja/login' }) === 'ja')
    check('C7: a stored Japanese preference is honoured', normalizeStoredLocale('ja') === 'ja')

    process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED = ''
    const off = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C8: with the flag off, nothing advertises the language',
      !('ja' in off) && !availableLocales({ es: true, ja: false }).includes('ja')
      && !enabledPublicLocales({ ja: false }).includes('ja'))
    check('C9: and a Japanese URL is not even a locale, so nothing labels a 404 "ja"',
      !isJapanesePath('/ja/pricing') && routePublicLocale('/ja/pricing') !== 'ja')
    check('C10: and a hand-edited cookie cannot select it', normalizeStoredLocale('ja') === null)
    check('C8-MUT: a switcher that ignored the flag would still list it in PUBLIC_LOCALES',
      PUBLIC_LOCALES.includes('ja'))
  } finally {
    process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED = was
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = wasEs
  }

  /** C11: THE GATE IS ONE FUNCTION, AND EVERYTHING READS IT. */
  for (const rel of ['components/LanguageSwitcher.tsx', 'lib/seo/hreflang.ts', 'app/sitemap.xml/route.ts']) {
    const src = strip(read(rel))
    check(`C11 ${rel}: asks the one gate, not the flags directly`,
      !/(spanish|portuguese|french|italian|japanese)SiteEnabled\s*\(/.test(src), rel)
  }
  check('C11-MUT: a direct flag read is caught',
    /(spanish|portuguese|french|italian|japanese)SiteEnabled\s*\(/.test('const x = japaneseSiteEnabled()'))
  check('C12: the gate answers for every public locale, with no fallback to guess with',
    PUBLIC_LOCALES.every((l) => typeof publicLocaleEnabled(l, { es: true, 'pt-BR': true, fr: true, it: true, ja: true }) === 'boolean')
    && publicLocaleEnabled('he') && publicLocaleEnabled('en'))
}

console.log('\nD) the locale tables and the copy')
{
  check('D1: the prefix, the direction and every locale spelling are stated',
    LOCALE_PREFIX.ja === '/ja' && LOCALE_CONFIG.ja.dir === 'ltr'
    && LOCALE_CONFIG.ja.lang === 'ja' && LOCALE_CONFIG.ja.ogLocale === 'ja_JP'
    && INTL_LOCALE.ja === 'ja-JP' && PAYPAL_LOCALE.ja === 'ja_JP' && localeHomeHref('ja') === '/ja')

  const all = [
    ...strings(getPublicDictionary('ja'), 'public'),
    ...strings(landingJa, 'landing'),
    ...strings(pricingJa, 'pricing'),
    ...strings(AFFILIATES_COPY.ja, 'affiliates'),
    ...strings(ARTICLES_COPY.ja, 'articles'),
  ]
  check('D2: there is a real amount of copy to check', all.length > 300, String(all.length))

  // The language switcher names the other languages in their own alphabets, so
  // Hebrew letters are expected there and nowhere else.
  const notSwitcher = (p: string) => !p.startsWith('public.languageSwitcher')
  const hebrew = all.filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path))
  check('D3: no Hebrew left in', hebrew.length === 0, hebrew.slice(0, 3).map((s) => s.path).join(' '))

  /*
   * D4: EVERY SENTENCE IS WRITTEN IN JAPANESE.
   *
   * This replaces the per-language word lists the Latin-script suites need. A
   * Japanese sentence contains kana or kanji; a string that contains neither is
   * either the language this tree was copied from, or one of four things that
   * legitimately carry no Japanese at all:
   *
   *   · a path or a URL ("/pricing", "https://…", "mailto:…");
   *   · a brand, a product name or an abbreviation ("Go Top SEO", "ChatGPT",
   *     "WCAG 2.1", "SEO");
   *   · a number, a price or a date ("79", "249", "2026-10-30", "100%");
   *   · a punctuation-only or empty string.
   *
   * So the test is: a string with LETTERS in it, long enough to be prose, must
   * be written in Japanese. `textScript` answers off the characters themselves,
   * which is the same seam the content pipeline measures Japanese with.
   */
  const LOOKS_TECHNICAL = (t: string) =>
    /^[\s\p{P}\p{S}\d]*$/u.test(t)                        // punctuation, digits, nothing
    || /^(?:\/|https?:|mailto:|tel:|#|data:)/.test(t)     // a path, a URL, an anchor
    || /^[A-Za-z0-9 .+&'’()\-/_%:,]{1,28}$/.test(t)       // a short Latin label or brand
    // A LIST OF BRAND NAMES, which is Latin on purpose and is punctuated in
    // Japanese: 「ChatGPT、Gemini、Perplexity、Copilot、Grok、Google AI」. Each
    // comma-separated piece must be at most two words, so a brand list passes
    // and an untranslated English SENTENCE ("All rights reserved") does not.
    || (/^[A-Za-z0-9 .+&'’()\-/_%:,、・]+$/.test(t)
      && t.split(/[,、・]/).every((piece) => piece.trim().split(/\s+/).filter(Boolean).length <= 2))
  /*
   * The ONE path that is English in every language, including this one: the
   * copyright line. It is a legal notice in the form the whole site uses, and
   * translating it per language is how two of them end up disagreeing about the
   * year or the company. Named here rather than pattern-matched, so adding a
   * second English string takes a decision.
   */
  const ENGLISH_BY_DESIGN = ['public.footer.copyright']
  const notJapanese = all.filter((s) =>
    notSwitcher(s.path) && !ENGLISH_BY_DESIGN.includes(s.path)
    && !LOOKS_TECHNICAL(s.text) && textScript(s.text) !== 'ja')
  check('D4: every sentence of the Japanese copy is written in Japanese',
    notJapanese.length === 0, notJapanese.slice(0, 4).map((s) => `${s.path}: ${s.text.slice(0, 50)}`).join(' | '))
  check('D4-MUT: an Italian sentence left behind is caught, and a brand or a path is not',
    textScript('Monitoraggio delle parole chiave e visibilità') !== 'ja'
    && !LOOKS_TECHNICAL('Monitoraggio delle parole chiave e visibilità nei motori AI')
    && LOOKS_TECHNICAL('/pricing') && LOOKS_TECHNICAL('Go Top SEO') && LOOKS_TECHNICAL('WCAG 2.1')
    && LOOKS_TECHNICAL('ChatGPT、Gemini、Perplexity、Copilot、Grok、Google AI')
    && !LOOKS_TECHNICAL('Track your rankings in Google and in the AI engines every month')
    && textScript('検索順位の計測') === 'ja')

  /*
   * D5: NO PROMISE THE OWNER HAS NOT MADE, in a language he cannot read.
   *
   * His standing rule is no ranking promises and no guaranteed results. In
   * Japanese the shapes that break it are 保証 (a guarantee), 必ず／確実に
   * (certainly), and a first page or a number-one position offered TO THE
   * READER. 「1位」 on its own is a report column — a measurement of what
   * already happened — so, as in every other language's suite, the test is who
   * the sentence is about, and landing.demo is the made-up business inside the
   * product illustration quoting its own warranty.
   */
  const ours = (p: string) => !p.startsWith('landing.demo')
  const GUARANTEE = /保証(?!の対象外)|必ず|確実に|間違いなく/
  const FIRST_PLACE = /1位|一位|検索結果の1ページ目|上位表示/
  const READER = /お客様|あなた|御社|貴社|いたします|します/
  const PROMISE = (t: string) => GUARANTEE.test(t) || (FIRST_PLACE.test(t) && READER.test(t))
  const promises = all.filter((s) => PROMISE(s.text) && ours(s.path))
  check('D5: no Japanese page promises a ranking or a guaranteed result',
    promises.length === 0, promises.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D5-MUT: a ranking promise is caught, and a report label is not',
    PROMISE('Google 検索の1ページ目を保証します。')
    && PROMISE('お客様を検索結果の1ページ目にお連れします。')
    && !PROMISE('1位のキーワード数')
    && !PROMISE('今月の1位の推移'))

  /*
   * D6: THE REGISTER. です・ます throughout, and no 謙譲語 — the same contract the
   * Japanese legal documents are held to by
   * components/public/__qa__/translated-legal-coverage.qa.ts, and for the same
   * reason: 「ご案内させていただきます」 makes the sentence about the company's
   * deference instead of about what the reader gets, and 弊社 belongs to a sales
   * letter. The plain だ／である forms are the other failure, and a marketing page
   * that switches into them mid-section reads as two different writers.
   */
  const HUMBLE = /させていただ|いたします|弊社|小社/
  const PLAIN = /である。|する。|ない。|だ。/
  const humble = all.filter((s) => HUMBLE.test(s.text))
  const plain = all.filter((s) => PLAIN.test(s.text))
  check('D6: no 謙譲語 in the public copy', humble.length === 0,
    humble.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 50)}`).join(' | '))
  check('D6b: and no である体 either', plain.length === 0,
    plain.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 50)}`).join(' | '))
  check('D6-MUT: the humble and plain forms are caught, and plain polite copy is not',
    HUMBLE.test('ご案内させていただきます。') && HUMBLE.test('弊社のサービスです。')
    && PLAIN.test('本サービスは有料である。')
    && !HUMBLE.test('7日間の無料トライアルを始めましょう。')
    && !PLAIN.test('サイトを接続すると、順位の計測が始まります。'))

  // THE PRICE IS IN DOLLARS. Abroad is USD through Creem, and no euro or yen
  // figure has ever been set: a ¥ on a Japanese page would be the currency a
  // Japanese reader would most expect, which is the worst place to invent one.
  const currency = all.filter((s) => /€|\bEUR\b|\beuros?\b|¥|円(?!グラフ)|\bJPY\b/i.test(s.text))
  check('D7: no euro and no yen price anywhere in the Japanese copy',
    currency.length === 0, currency.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D7-MUT: a yen price is caught, and the dollar price is not',
    /€|¥|円(?!グラフ)|\bJPY\b/i.test('月額 9,800 円から') && !/€|¥|円(?!グラフ)|\bJPY\b/i.test('月額 79 米ドルから'))

  check('D8: the affiliate page states the same two rates as every other language',
    JSON.stringify(AFFILIATES_COPY.ja).includes('30') && JSON.stringify(AFFILIATES_COPY.ja).includes('40'))
  check('D3-MUT: a Hebrew string outside the switcher fails D3',
    [{ path: 'landing.hero.title', text: 'מעקב מיקומים' }].filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path)).length === 1)

  /*
   * D9: THE HEADLINES ARE NOT MEASURED IN SPACES.
   *
   * A Japanese headline has no spaces, so any length rule written as a word
   * split reads it as one word. The floor here goes through the segmenter, which
   * is the same seam lib/content and components/public/__qa__/comparison-pages
   * use, and it is a floor on SUBSTANCE: the hero has to say something.
   */
  const hero = strings(landingJa.hero, 'landing.hero').map((s) => s.text).join('')
  check('D9: the hero says something, counted through the segmenter, not by spaces',
    wordCount(hero) > 20 && hero.split(/\s+/).length < wordCount(hero),
    `${wordCount(hero)} segmented vs ${hero.split(/\s+/).length} space-split`)
  check('D9-MUT: a space split would have called the Japanese hero a handful of words',
    wordCount('検索順位の計測とAIでの可視性') > 4 && '検索順位の計測とAIでの可視性'.split(/\s+/).length === 1)

  /*
   * D10: THE PAGE FILES THEMSELVES, NOT ONLY THE DICTIONARIES.
   *
   * D4 reads the dictionaries. On 2026-10-31 it was green while ten pages of the
   * LIVE Japanese site were showing ITALIAN: twelve route files under
   * app/(public)/ja carried their copy inline, had been copied from
   * app/(public)/it, and were never translated. No dictionary was involved, so
   * no dictionary guard could see it. This one reads the route files — their
   * string literals AND their JSX text — and asks D4's question of each.
   *
   * It is stricter than D4 in one place on purpose. D4 lets a short Latin string
   * through as a brand or a label, and '11 anni di SEO,' is fifteen characters:
   * it was the HEADLINE of /ja/about and it would have passed. So here a Latin
   * string is prose, however short, when it has four or more words, or three
   * with a lower-case word among them — which 'Go Top SEO' and 'Shopify App
   * Store' do not have, and 'Prezzi - Go Top SEO' does.
   */
  const pageStrings = (src: string): string[] => {
    const body = strip(src)
    const out: string[] = []
    for (const m of body.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) out.push((m[1] ?? m[2] ?? '').trim())
    for (const m of body.matchAll(/>([^<>{}]+)</g)) out.push(m[1].trim())
    return out.filter(Boolean)
  }
  // Tailwind lives in these files too. A class list is Latin on purpose and is
  // never prose, so it is excluded by SHAPE before the language question.
  const CLASS_LIST = (t: string) => /^[a-z0-9\-:[\]./ %_,()&>#+*='"]+$/.test(t)
  const LATIN_ONLY = (t: string) => !/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(t)
  const LATIN_PROSE = (t: string) => {
    if (!LATIN_ONLY(t)) return false
    const words = t.split(/\s+/).filter(Boolean)
    return words.length >= 4 || (words.length === 3 && words.some((w) => /^[a-zà-ÿ]{2,}$/.test(w)))
  }
  /*
   * The 特商法 page prints the seller's REGISTERED details, which exist only in
   * their Latin form: the company as it is registered, the person responsible,
   * and the registered address. 特定商取引法第11条 asks for those details as they
   * are, so they are named here rather than pattern-matched — a fourth Latin
   * line on that page should take a decision, not slip through a rule.
   */
  const REGISTERED = [
    'Oren Hacham',
    'HaRechasim 24/2, Ramat Gan 5235524, Israel',
    // The author of the articles, as the Person their JSON-LD points at. It is
    // the same Hebrew string in every tree, because it is his name.
    'אורן חכם',
  ]
  // A module specifier and an e-mail address are code and contact details, not
  // copy. Both are anchored, so an English SENTENCE with an address in it is
  // still prose.
  const NOT_COPY = (t: string) =>
    /^[@.][\w@./-]*$/.test(t)
    || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(t)
  const foreignOnPage = (text: string) =>
    !REGISTERED.includes(text) && !CLASS_LIST(text) && !NOT_COPY(text)
    && (LATIN_PROSE(text) || (!LOOKS_TECHNICAL(text) && textScript(text) !== 'ja'))
  const pageLeaks = routes('app/(public)/ja').flatMap((r) =>
    pageStrings(read(`app/(public)/ja/${r}`)).filter(foreignOnPage).map((t) => `${r}: ${t.slice(0, 45)}`))
  check('D10: every sentence the Japanese PAGE FILES print is written in Japanese',
    pageLeaks.length === 0, `${pageLeaks.length}: ${pageLeaks.slice(0, 5).join(' | ')}`)

  const MUT_ITALIAN = `const COPY = {
    title: '11 anni di SEO,',
    className: 'flex min-h-screen flex-col bg-canvas',
  }
  export default function P() { return <p>I dati vengono dall&rsquo;API di Google Ads.</p> }`
  const MUT_JAPANESE = `const COPY = {
    title: 'SEOの11年の実務を、',
    className: 'flex min-h-screen flex-col bg-canvas',
  }
  export default function P() { return <p>データはGoogle AdsのAPIから取得しています。</p> }`
  check('D10-MUT: an Italian headline and an Italian JSX line are both caught, and the Japanese page and its class lists are not',
    pageStrings(MUT_ITALIAN).filter(foreignOnPage).length === 2
    && pageStrings(MUT_JAPANESE).filter(foreignOnPage).length === 0
    && !foreignOnPage('Go Top SEO') && !foreignOnPage('flex min-h-screen flex-col bg-canvas')
    && !foreignOnPage('@/components/public/FeaturePage') && !foreignOnPage('oren@gotop.co.il')
    && foreignOnPage('Mappa del sito | Go Top SEO')
    && foreignOnPage('Write to oren@gotop.co.il and we will answer you shortly'),
    `${pageStrings(MUT_ITALIAN).filter(foreignOnPage).join(' | ')} / ${pageStrings(MUT_JAPANESE).filter(foreignOnPage).join(' | ')}`)
}

console.log('\nE) the reader never changes language')
{
  const all = [
    ...strings(getPublicDictionary('ja'), 'public'),
    ...strings(pricingJa, 'pricing'),
    ...strings(AFFILIATES_COPY.ja, 'affiliates'),
    ...strings(ARTICLES_COPY.ja, 'articles'),
  ]
  const OTHER_TREE = /^\/(en|es|pt-BR|fr|it)(\/|$)/
  const leaks = all.filter((s) => OTHER_TREE.test(s.text))
  check('E1: no Japanese string links into another language\'s tree',
    leaks.length === 0, leaks.slice(0, 5).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E1-MUT: a link to the English privacy policy is caught',
    [{ path: 'pricing.faq.link', text: '/en/privacy' }].filter((s) => OTHER_TREE.test(s.text)).length === 1)

  check('E2: the blog index and an article live under /ja', articlesIndexHref('ja') === '/ja/articles')

  const landingPaths = strings(landingJa, 'landing').filter((s) => /^\//.test(s.text))
  const doubled = landingPaths.filter((s) => s.text.startsWith('/ja'))
  check('E3: the landing dictionary stores unprefixed paths, so nothing becomes /ja/ja',
    doubled.length === 0, doubled.slice(0, 4).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E3-MUT: a prefixed landing path is caught',
    [{ path: 'landing.nav', text: '/ja/pricing' }].filter((s) => s.text.startsWith('/ja')).length === 1)

  const wasJa = process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED = 'true'
    check('E4: switching to Japanese keeps the page', counterpartPath('/pricing', 'he', 'ja') === '/ja/pricing'
      && counterpartPath('/es/pricing', 'es', 'ja') === '/ja/pricing'
      && counterpartPath('/it/about', 'it', 'ja') === '/ja/about')
    check('E5: and the Japanese home page is the bare prefix', counterpartPath('/', 'he', 'ja') === '/ja')
    check('E6: a single article switches to the Japanese INDEX, not to a slug that does not exist',
      counterpartPath('/articles/some-hebrew-slug', 'he', 'ja') === '/ja/articles')
    check('E7: and switching away from Japanese works the same way',
      counterpartPath('/ja/pricing', 'ja', 'he') === '/pricing' && counterpartPath('/ja', 'ja', 'en') === '/en')
  } finally {
    process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED = wasJa
  }

  const advertised = ['', '/pricing', '/about', '/free-check', '/articles', '/sitemap', '/affiliates']
  const missing = advertised.filter((p) => !existsSync(join(ROOT, `app/(public)/ja${p}/page.tsx`)))
  check('E8: every path the sitemap advertises has a Japanese page', missing.length === 0, missing.join(' '))

  /*
   * E9: THE 特定商取引法 PAGE EXISTS, IS LINKED AND IS NOT INDEXED.
   *
   * It is the one page Japanese law adds, so nothing else in this repository
   * would notice it disappearing. It must be reachable from the footer of the
   * Japanese tree — a required disclosure nobody can find is not a disclosure —
   * and it must stay out of the index and out of the sitemap, because it is a
   * legal notice for a buyer, not a page to rank.
   */
  const tokusho = read('app/(public)/ja/tokusho/page.tsx')
  check('E9: the tokusho page declares itself Japanese and noindex',
    /locale="ja"/.test(tokusho) && /robots:\s*'noindex, nofollow'/.test(tokusho))
  const footer = strip(read('components/Footer.tsx'))
  check('E10: and the footer links it for Japanese readers only',
    /locale === 'ja' &&[\s\S]{0,200}JAPANESE_TOKUSHO_LINK\.href/.test(footer))
  check('E10-MUT: a footer that linked it in every language would be caught',
    !/locale === 'ja' &&[\s\S]{0,200}JAPANESE_TOKUSHO_LINK\.href/
      .test("<li><Link href={JAPANESE_TOKUSHO_LINK.href}>{JAPANESE_TOKUSHO_LINK.label}</Link></li>"))
  check('E11: the sitemap does not advertise it',
    !/tokusho/.test(read('app/sitemap.xml/route.ts')))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
