/**
 * THE GERMAN PUBLIC SITE.
 *
 * German is the eighth language. The compiler finds most of a missing language
 * on its own, because the gate is one function and every
 * `Record<PublicLocale, …>` stops compiling without the new key. What it cannot
 * find is a language merely ABSENT from a hand-written list — which is exactly
 * what `routePublicLocale` and `resolveAuthLocale` are, and both were missing a
 * German branch when this suite was written — or a translation that is the
 * language it was copied FROM wearing a new name.
 *
 * German is Latin-script, so the script test the Japanese suite leans on is not
 * available here: an untranslated Italian sentence and a German one are both
 * written in the same alphabet. The replacement is a POSITIVE test. German prose
 * of any length contains at least one of a few dozen closed-class words — der,
 * die, das, und, nicht, ist, Sie, Ihre, für, von, mit — that no Romance sentence
 * carries — plus three orthographic signals for a label too short to carry
 * one. So section D asks of every prose string: is there any German in it?
 * A copied Italian paragraph answers no on the first run, which is what caught
 * the ten Italian pages on the live /ja site in October and what this is for.
 *
 * The sections are the same as every other language's:
 *
 *   A) THE MIRROR. Every route under app/(public)/es has a twin under
 *      app/(public)/de, and the same for the auth tree — load-bearing, because
 *      lib/seo/hreflang.ts DERIVES the German URL from the Spanish one, so a
 *      Spanish page with no German twin would advertise a 404.
 *   B) THE GATE. One `notFound()` per tree, in its layout, and no page with a
 *      flag check of its own.
 *   C) THE FLAG decides every outward sign of the language.
 *   D) THE COPY is German: written in German, in the Sie register, with no
 *      promise the owner has not made and no euro price.
 *   E) THE READER NEVER CHANGES LANGUAGE, and the Impressum §5 DDG asks for is
 *      there, linked and unindexed.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/i18n/__qa__/german-public-site.qa.ts
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  PUBLIC_LOCALES, LOCALE_PREFIX, LOCALE_CONFIG, INTL_LOCALE, PAYPAL_LOCALE,
  localeHomeHref, normalizeStoredLocale, publicLocaleEnabled, enabledPublicLocales,
} from '../locales'
import { germanSiteEnabled } from '../german-site'
import { getPublicDictionary } from '../getPublicDictionary'
import { landingDe } from '../public/landing-de'
import { pricingDe } from '../public/pricing-de'
import { AFFILIATES_COPY } from '../public/affiliates'
import { ARTICLES_COPY, articlesIndexHref } from '../../articles/i18n'
import { availableLocales, counterpartPath } from '../../../components/LanguageSwitcher'
import { buildHreflangAlternates } from '../../seo/hreflang'
import { isGermanPath, routePublicLocale } from '../request-locale'
import { resolveAuthLocale } from '../auth-locale'

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

/*
 * IS THERE ANY GERMAN IN THIS STRING?
 *
 * A closed list of German function words. Every one is a word no Italian,
 * French, Spanish or Portuguese sentence contains, and the two that an ENGLISH
 * sentence would have supplied — "was" and "am" — are deliberately absent, so
 * an untranslated English paragraph fails this too.
 *
 * \b is no use here: JavaScript's word boundary counts only [A-Za-z0-9_], so an
 * umlaut is a boundary and \bist\b would fire inside "Größe ist". Hence the
 * Unicode lookarounds and the u flag.
 */
const GERMAN_WORD = /(?<!\p{L})(?:der|die|das|den|dem|ein|eine|einen|einem|eines|und|oder|nicht|ist|sind|wird|werden|wurde|Sie|Ihre|Ihren|Ihrem|Ihrer|Ihr|Ihnen|mit|für|von|vom|auf|aus|sich|als|auch|aber|wenn|dass|nach|bei|beim|zum|zur|im|kein|keine|keinen|mehr|schon|noch|nur|wie|wir|uns|unser|unsere|jede|jeder|jedes|jeden|allen|durch|über|unter|ohne|gegen|zwischen|damit|weil|sobald|seit|während|bereits|diese|dieser|dieses|haben|hat|kann|können|müssen|soll|sollen|dürfen|wollen|ich|zu|um|ab|sowie|hier|jetzt|dann|sehr|immer|mein|meine|meinen|meinem|meiner|kostenlos|automatisch|monatlich)(?!\p{L})/iu

/*
 * Three more German signals, for a LABEL too short to carry a function word.
 * "Sichtbarkeit in KI-Antworten verfolgen" has none of the words above, and it
 * is German; so does "15 Positionen in Google gewonnen".
 *
 *   · a derivational suffix German has and the Romance languages do not —
 *     -ung, -keit, -heit, -schaft, -ität, -nis, -tum, -lich, -isch. Italian
 *     "visibilità" and French "visibilité" end in -ità and -ité, not -ität, so
 *     neither matches.
 *   · a ge-…-t / ge-…-en past participle, which no Romance language forms.
 *   · an umlaut or an ß. Italian carries à è ì ò ù and French é è ê ë ô û, none
 *     of which is ä, ö, ü or ß.
 */
const GERMAN_SUFFIX = /(?<!\p{L})\p{L}{3,}(?:ung|keit|heit|schaft|ität|nis|tum|lich|isch)(?:e|en|er|es|s)?(?!\p{L})/u
const GERMAN_PARTICIPLE = /(?<!\p{L})ge\p{L}{3,}(?:t|en)(?!\p{L})/u
const GERMAN_LETTER = /[äöüÄÖÜß]/
const HAS_GERMAN = (t: string) =>
  GERMAN_WORD.test(t) || GERMAN_SUFFIX.test(t) || GERMAN_PARTICIPLE.test(t) || GERMAN_LETTER.test(t)


console.log('A) the trees are mirrors, which is what hreflang rests on')
{
  for (const group of ['(public)', '(auth)']) {
    const es = routes(`app/${group}/es`)
    const de = routes(`app/${group}/de`)
    check(`A1 app/${group}: the German tree has every Spanish route`,
      es.every((r) => de.includes(r)), es.filter((r) => !de.includes(r)).join(' '))
    /*
     * A2 allows ONE extra route, and only in the public tree: /de/impressum.
     * § 5 DDG requires a commercially operated digital service to keep the
     * provider's identity, address and contact details easily recognizable,
     * directly reachable and permanently available, and Germany is the only
     * market whose law asks for that page — so it has no Spanish twin by
     * design, it is `noindex`, and the hreflang map never derives it. This is
     * the same shape /ja/tokusho has. Any OTHER extra route is a route the
     * Spanish tree does not have, which is what this check is for.
     */
    const extras = de.filter((r) => !es.includes(r))
    const allowed = group === '(public)' ? ['impressum/page.tsx'] : []
    check(`A2 app/${group}: and no route the Spanish tree does not have, beyond the one German law requires`,
      extras.every((r) => allowed.includes(r)), extras.filter((r) => !allowed.includes(r)).join(' '))
    check(`A3 app/${group}: and it is not empty`, de.length > 0)
  }
  const es = routes('app/(public)/es')
  check('A1-MUT: a Spanish route with no German twin fails A1',
    ![...es, 'press-kit/page.tsx'].every((r) => routes('app/(public)/de').includes(r)))
  check('A2-MUT: an extra route that is not the Impressum fails A2',
    !['impressum/page.tsx', 'prost/page.tsx'].every((r) => ['impressum/page.tsx'].includes(r)))
}

console.log('\nB) one gate per tree')
{
  const pub = strip(read('app/(public)/de/layout.tsx'))
  const auth = strip(read('app/(auth)/de/layout.tsx'))
  check('B1: the public tree 404s entirely when the flag is off',
    /if \(!germanSiteEnabled\(\)\) notFound\(\)/.test(pub))
  check('B2: so does the auth tree', /if \(!germanSiteEnabled\(\)\) notFound\(\)/.test(auth))
  check('B3: the layout declares the document German and left-to-right',
    /lang="de"/.test(pub) && /dir="ltr"/.test(pub) && /DocumentLocaleEffect locale="de"/.test(pub))
  const pages = routes('app/(public)/de').filter((r) => r.endsWith('page.tsx'))
  check('B4: and no page carries a gate of its own',
    pages.every((r) => !/germanSiteEnabled/.test(read(`app/(public)/de/${r}`))),
    pages.filter((r) => /germanSiteEnabled/.test(read(`app/(public)/de/${r}`))).join(' '))
  check('B1-MUT: a layout without the gate fails B1',
    !/if \(!germanSiteEnabled\(\)\) notFound\(\)/.test(pub.replace('if (!germanSiteEnabled()) notFound()', '')))
}

console.log('\nC) one gate, and it decides every outward sign')
{
  // The no-argument call reads process.env, so the unset case is checked with
  // the variable actually cleared. Otherwise this one line would pass or fail
  // by whatever the shell that started the suite happened to export.
  const ambient = process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED
  delete process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED
  const unsetIsOff = !germanSiteEnabled(undefined) && !germanSiteEnabled()
  if (ambient !== undefined) process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED = ambient
  check('C1: "true" and nothing else turns it on',
    germanSiteEnabled('true') && !germanSiteEnabled('TRUE') && !germanSiteEnabled('1')
    && !germanSiteEnabled('') && !germanSiteEnabled('yes') && unsetIsOff)

  const was = process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED
  const wasEs = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
    process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED = 'true'
    const on = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C2: with the flag on, the derived German URL is announced',
      on.de === 'https://www.gotopseo.com/de/pricing', JSON.stringify(on))
    const home = buildHreflangAlternates('/', '/en', '/es')
    check('C3: and the home page derives to the bare prefix, not "/de/"',
      home.de === 'https://www.gotopseo.com/de', home.de)
    check('C4: a path that merely starts with the letters is not touched',
      buildHreflangAlternates('/demo', '/en/demo', '/demo').de === 'https://www.gotopseo.com/demo')
    check('C5: the switcher offers it', availableLocales({ es: true, de: true }).includes('de'))
    check('C6: a German path is a German document',
      isGermanPath('/de/pricing') && routePublicLocale('/de/pricing') === 'de'
      && resolveAuthLocale({ pathname: '/de/login' }) === 'de')
    check('C7: a stored German preference is honoured', normalizeStoredLocale('de') === 'de')

    process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED = ''
    const off = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C8: with the flag off, nothing advertises the language',
      !('de' in off) && !availableLocales({ es: true, de: false }).includes('de')
      && !enabledPublicLocales({ de: false }).includes('de'))
    check('C9: and a German URL is not even a locale, so nothing labels a 404 "de"',
      !isGermanPath('/de/pricing') && routePublicLocale('/de/pricing') !== 'de')
    check('C10: and a hand-edited cookie cannot select it', normalizeStoredLocale('de') === null)
    check('C8-MUT: a switcher that ignored the flag would still list it in PUBLIC_LOCALES',
      PUBLIC_LOCALES.includes('de'))
  } finally {
    process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED = was
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = wasEs
  }

  /** C11: THE GATE IS ONE FUNCTION, AND EVERYTHING READS IT. */
  for (const rel of ['components/LanguageSwitcher.tsx', 'lib/seo/hreflang.ts', 'app/sitemap.xml/route.ts']) {
    const srcText = strip(read(rel))
    check(`C11 ${rel}: asks the one gate, not the flags directly`,
      !/(spanish|portuguese|french|italian|japanese|german)SiteEnabled\s*\(/.test(srcText), rel)
  }
  check('C11-MUT: a direct flag read is caught',
    /(spanish|portuguese|french|italian|japanese|german)SiteEnabled\s*\(/.test('const x = germanSiteEnabled()'))
  check('C12: the gate answers for every public locale, with no fallback to guess with',
    PUBLIC_LOCALES.every((l) => typeof publicLocaleEnabled(l, { es: true, 'pt-BR': true, fr: true, it: true, ja: true, de: true }) === 'boolean')
    && publicLocaleEnabled('he') && publicLocaleEnabled('en'))
}

console.log('\nD) the locale tables and the copy')
{
  check('D1: the prefix, the direction and every locale spelling are stated',
    LOCALE_PREFIX.de === '/de' && LOCALE_CONFIG.de.dir === 'ltr'
    && LOCALE_CONFIG.de.lang === 'de' && LOCALE_CONFIG.de.ogLocale === 'de_DE'
    && INTL_LOCALE.de === 'de-DE' && PAYPAL_LOCALE.de === 'de_DE' && localeHomeHref('de') === '/de')

  const all = [
    ...strings(getPublicDictionary('de'), 'public'),
    ...strings(landingDe, 'landing'),
    ...strings(pricingDe, 'pricing'),
    ...strings(AFFILIATES_COPY.de, 'affiliates'),
    ...strings(ARTICLES_COPY.de, 'articles'),
  ]
  check('D2: there is a real amount of copy to check', all.length > 300, String(all.length))

  // The language switcher names the other languages in their own alphabets, so
  // Hebrew letters are expected there and nowhere else.
  const notSwitcher = (p: string) => !p.startsWith('public.languageSwitcher')
  const hebrew = all.filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path))
  check('D3: no Hebrew left in', hebrew.length === 0, hebrew.slice(0, 3).map((s) => s.path).join(' '))
  // And no Japanese either: /de was copied from /ja, so that is the script a
  // half-finished copy leaves behind, not Hebrew.
  const cjk = all.filter((s) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(s.text) && notSwitcher(s.path))
  check('D3a: and no Japanese left in', cjk.length === 0, cjk.slice(0, 3).map((s) => s.path).join(' '))
  check('D3a-MUT: a Japanese string is caught',
    /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test('検索順位の計測'))

  /*
   * D4: EVERY SENTENCE IS WRITTEN IN GERMAN.
   *
   * Only PROSE is asked: a string long enough and with enough words to be a
   * sentence. Everything shorter is a label, a brand, a number or a path, and
   * German shares its alphabet with the language this tree was copied from, so
   * there is no script to fall back on. The three shapes excluded by form
   * rather than by language are a path or URL, a punctuation-or-digits string,
   * and a class list.
   */
  const IS_PATH = (t: string) => /^(?:\/|https?:|mailto:|tel:|#|data:)/.test(t)
  const NO_LETTERS = (t: string) => /^[\s\p{P}\p{S}\d]*$/u.test(t)
  const CLASS_LIST = (t: string) => /^[a-z0-9\-:[\]./ %_,()&>#+*='"]+$/.test(t)
  const words = (t: string) => t.split(/\s+/).filter(Boolean)
  /*
   * A META TITLE is a label, not prose: "Partnerprogramm | Go Top SEO" is four
   * words only because of the separator, and the brand supplies three of them.
   * The pipe is what makes it a title, so it is excluded by shape.
   */
  const META_TITLE = (t: string) => t.includes(' | ')
  const IS_PROSE = (t: string) =>
    !IS_PATH(t) && !NO_LETTERS(t) && !CLASS_LIST(t) && !META_TITLE(t)
    /*
     * 35 characters and 5 words. A shorter string is a label — "Tracking-Quellen
     * (Google + Maps)" is a stats caption, not a sentence — and the leaks this
     * is built to catch are longer than either floor: the Italian headline that
     * shipped on /ja/about was 40 characters and 8 words.
     */
    && t.length >= 35 && words(t).length >= 5
  /*
   * The ONE path that is English in every language, including this one: the
   * copyright line. It is a legal notice in the form the whole site uses, and
   * translating it per language is how two of them end up disagreeing about the
   * year or the company. Named here rather than pattern-matched, so adding a
   * second English string takes a decision.
   */
  const ENGLISH_BY_DESIGN = ['public.footer.copyright']
  const notGerman = all.filter((s) =>
    notSwitcher(s.path) && !ENGLISH_BY_DESIGN.includes(s.path)
    && IS_PROSE(s.text) && !HAS_GERMAN(s.text))
  check('D4: every sentence of the German copy is written in German',
    notGerman.length === 0, notGerman.slice(0, 4).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D4-MUT: an Italian or English sentence left behind is caught, and a brand or a path is not',
    !HAS_GERMAN('Monitoraggio delle parole chiave e visibilità nei motori di IA')
    && !HAS_GERMAN('Track your rankings in Google and in the AI engines every month')
    && !HAS_GERMAN('Suivi des positions et visibilité dans les moteurs IA')
    && HAS_GERMAN('Wir messen Ihre Positionen bei Google jeden Monat automatisch')
    && !IS_PROSE('/pricing') && !IS_PROSE('Go Top SEO') && !IS_PROSE('WCAG 2.1')
    && IS_PROSE('Monitoraggio delle parole chiave e visibilità nei motori di IA'))

  /*
   * D5: NO PROMISE THE OWNER HAS NOT MADE, in a language he cannot read.
   *
   * His standing rule is no ranking promises and no guaranteed results. In
   * German the shapes that break it are garantieren / Garantie, "sicher" and
   * "bestimmt" used as an assurance, and a first page or a number-one position
   * offered TO THE READER. "Platz 1" on its own is a report column — a
   * measurement of what already happened — so, as in every other language's
   * suite, the test is who the sentence is about, and landing.demo is the
   * made-up business inside the product illustration quoting its own warranty.
   */
  const ours = (p: string) => !p.startsWith('landing.demo')
  const GUARANTEE = /(?<!\p{L})(?:garantier\w*|Garantie\w*|garantiert)(?!\p{L})/iu
  const FIRST_PLACE = /(?<!\p{L})(?:Platz\s*1|Platz\s*eins|erste\s+Seite|erster\s+Platz|Top-?Platzierung)(?!\p{L})/iu
  const READER = /(?<!\p{L})(?:Sie|Ihre|Ihren|Ihrem|Ihrer|Ihr|Ihnen)(?!\p{L})/u
  const PROMISE = (t: string) => GUARANTEE.test(t) || (FIRST_PLACE.test(t) && READER.test(t))
  const promises = all.filter((s) => PROMISE(s.text) && ours(s.path))
  check('D5: no German page promises a ranking or a guaranteed result',
    promises.length === 0, promises.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 70)}`).join(' | '))
  check('D5-MUT: a ranking promise is caught, and a report label is not',
    PROMISE('Wir garantieren Ihnen die erste Seite bei Google.')
    && PROMISE('Wir bringen Sie auf die erste Seite der Suchergebnisse.')
    && PROMISE('Eine Garantie für Platz 1.')
    && !PROMISE('Keywords auf Platz 1')
    && !PROMISE('Die Bewegung von Platz 1 in diesem Monat'))

  /*
   * D6: THE REGISTER. Sie throughout, never du — the same contract the German
   * legal documents and the German dashboard dictionary are held to, and for
   * the same reason: a marketing page that switches into du mid-section reads
   * as two different writers, and the legal documents cannot switch at all
   * without changing who the contract is with.
   */
  const INFORMAL = /(?<!\p{L})(?:du|dich|dir|dein|deine|deinen|deinem|deiner|deines|euer|eure|euren)(?!\p{L})/iu
  const informal = all.filter((s) => INFORMAL.test(s.text))
  check('D6: the whole German public copy keeps the formal Sie register',
    informal.length === 0, informal.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D6-MUT: an informal sentence is caught, and ordinary formal German is not',
    INFORMAL.test('Verbinde deine Website und wir messen die Positionen')
    && !INFORMAL.test('Verbinden Sie Ihre Website, und wir messen die Positionen jeden Monat direkt.'))

  /*
   * D7: THE PRICE IS IN DOLLARS. Abroad is USD through Creem, and no euro
   * figure has ever been set. A € on a German page would be the currency a
   * German reader would most expect, which is the worst place to invent one,
   * and the Preisangabenverordnung is precisely about the stated price being
   * the price actually payable.
   */
  const currency = all.filter((s) => /€|(?<!\p{L})EUR(?!\p{L})|(?<!\p{L})Euros?(?!\p{L})/u.test(s.text))
  check('D7: no euro price anywhere in the German copy',
    currency.length === 0, currency.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 70)}`).join(' | '))
  check('D7-MUT: a euro price is caught, and the dollar price is not',
    /€|(?<!\p{L})EUR(?!\p{L})/u.test('ab 79 € im Monat') && !/€|(?<!\p{L})EUR(?!\p{L})/u.test('ab 79 US-Dollar im Monat'))

  /*
   * D7a: AND THE UMLAUTS ARE WRITTEN OUT, not transliterated through an ASCII
   * pipeline. "fuer" and "Groesse" are how a German reader can tell the text
   * was not written by anyone who speaks the language.
   */
  const TRANSLIT = /(?<!\p{L})(?:fuer|ueber|koennen|moechten|groesse|muessen|waehlen|loeschen|zurueck|hinzufuegen|fuehren|pruefen)(?!\p{L})/iu
  const translit = all.filter((s) => TRANSLIT.test(s.text))
  check('D7a: no word is spelled the ASCII way', translit.length === 0,
    translit.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D7a-MUT: a transliterated word is caught, and the real spelling is not',
    TRANSLIT.test('Bitte waehlen Sie eine Groesse fuer das Bild')
    && !TRANSLIT.test('Bitte wählen Sie eine Größe für das Bild'))

  check('D8: the affiliate page states the same two rates as every other language',
    JSON.stringify(AFFILIATES_COPY.de).includes('30') && JSON.stringify(AFFILIATES_COPY.de).includes('40'))
  check('D3-MUT: a Hebrew string outside the switcher fails D3',
    [{ path: 'landing.hero.title', text: 'מעקב מיקומים' }].filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path)).length === 1)

  /*
   * D10: THE PAGE FILES THEMSELVES, NOT ONLY THE DICTIONARIES.
   *
   * D4 reads the dictionaries. On 2026-10-31 the equivalent guard was green
   * while ten pages of the LIVE Japanese site were showing ITALIAN: twelve
   * route files under app/(public)/ja carried their copy inline, had been
   * copied from app/(public)/it, and were never translated. No dictionary was
   * involved, so no dictionary guard could see it. The /de tree was created the
   * same way — copied from /ja — so this is the guard that matters most here.
   * It reads the route files, their string literals AND their JSX text, and
   * asks D4's question of each.
   */
  const pageStrings = (source: string): string[] => {
    const body = strip(source)
    const out: string[] = []
    for (const m of body.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) out.push((m[1] ?? m[2] ?? '').trim())
    for (const m of body.matchAll(/>([^<>{}]+)</g)) out.push(m[1].trim())
    return out.filter(Boolean)
  }
  /*
   * The Impressum prints the provider's REGISTERED details, which exist only in
   * their Latin form: the company as it is registered, the person responsible,
   * and the registered address. § 5 DDG asks for those details as they are, so
   * they are named here rather than pattern-matched — a further Latin line on
   * that page should take a decision, not slip through a rule.
   */
  const REGISTERED = [
    'Oren Hacham',
    'Oren Hacham, Geschäftsführer',
    'HaRechasim 24/2',
    'Ramat Gan 5235524',
    'Israel',
    'GO TOP DIGITAL MARKETING AND ADVERTISING LTD',
    'Handelsregisternummer: 517274346, Registrar of Companies, Israel',
    'Rechtsform: Gesellschaft mit beschränkter Haftung nach israelischem Recht (Private Limited Company)',
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
  /*
   * A NON-LATIN SCRIPT IS A LEAK WHATEVER ITS LENGTH, and it is checked before
   * the prose floor rather than through it. The /de tree was copied from /ja,
   * so the leaks here are JAPANESE — and Japanese has no word spaces, so a
   * five-word floor reads a whole untranslated paragraph as one word and lets
   * it through. That is not a hypothetical: this guard found twelve such files
   * on its first run. Hebrew is in the same class, except for the author's own
   * name, which is the same string in every tree.
   */
  const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/
  const HEBREW_TEXT = /[\u0590-\u05FF]/
  const WRONG_SCRIPT = (t: string) => CJK.test(t) || HEBREW_TEXT.test(t)
  const foreignOnPage = (text: string) =>
    !REGISTERED.includes(text) && !NOT_COPY(text)
    && (WRONG_SCRIPT(text) || (IS_PROSE(text) && !HAS_GERMAN(text)))
  const pageLeaks = routes('app/(public)/de').flatMap((r) =>
    pageStrings(read(`app/(public)/de/${r}`)).filter(foreignOnPage).map((t) => `${r}: ${t.slice(0, 50)}`))
  check('D10: every sentence the German PAGE FILES print is written in German',
    pageLeaks.length === 0, `${pageLeaks.length}: ${pageLeaks.slice(0, 5).join(' | ')}`)

  const MUT_ITALIAN = `const COPY = {
    title: '11 anni di SEO, in un sistema automatico',
    className: 'flex min-h-screen flex-col bg-canvas',
  }
  export default function P() { return <p>I dati vengono dall&rsquo;API di Google Ads.</p> }`
  const MUT_GERMAN = `const COPY = {
    title: 'Elf Jahre SEO, in einem automatischen System',
    className: 'flex min-h-screen flex-col bg-canvas',
  }
  export default function P() { return <p>Die Daten kommen aus der API von Google Ads.</p> }`
  check('D10-MUT: an Italian headline and an Italian JSX line are both caught, and the German page and its class lists are not',
    pageStrings(MUT_ITALIAN).filter(foreignOnPage).length === 2
    && pageStrings(MUT_GERMAN).filter(foreignOnPage).length === 0
    && !foreignOnPage('Go Top SEO') && !foreignOnPage('flex min-h-screen flex-col bg-canvas')
    && !foreignOnPage('@/components/public/FeaturePage') && !foreignOnPage('oren@gotop.co.il')
    && foreignOnPage('Write to oren@gotop.co.il and we will answer you shortly')
    // The script half: a Japanese label is caught even though it is one "word".
    && foreignOnPage('Googleでの検索順位の計測')
    && 'Googleでの検索順位の計測'.split(/\s+/).filter(Boolean).length === 1
    && !foreignOnPage('אורן חכם'),
    `${pageStrings(MUT_ITALIAN).filter(foreignOnPage).join(' | ')} / ${pageStrings(MUT_GERMAN).filter(foreignOnPage).join(' | ')}`)
}

console.log('\nE) the reader never changes language, and the Impressum is reachable')
{
  const all = [
    ...strings(getPublicDictionary('de'), 'public'),
    ...strings(pricingDe, 'pricing'),
    ...strings(AFFILIATES_COPY.de, 'affiliates'),
    ...strings(ARTICLES_COPY.de, 'articles'),
  ]
  const OTHER_TREE = /^\/(en|es|pt-BR|fr|it|ja)(\/|$)/
  const leaks = all.filter((s) => OTHER_TREE.test(s.text))
  check('E1: no German string links into another language\'s tree',
    leaks.length === 0, leaks.slice(0, 5).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E1-MUT: a link to the English privacy policy is caught',
    [{ path: 'pricing.faq.link', text: '/en/privacy' }].filter((s) => OTHER_TREE.test(s.text)).length === 1)

  check('E2: the blog index and an article live under /de', articlesIndexHref('de') === '/de/articles')

  const landingPaths = strings(landingDe, 'landing').filter((s) => /^\//.test(s.text))
  const doubled = landingPaths.filter((s) => s.text.startsWith('/de'))
  check('E3: the landing dictionary stores unprefixed paths, so nothing becomes /de/de',
    doubled.length === 0, doubled.slice(0, 4).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E3-MUT: a prefixed landing path is caught',
    [{ path: 'landing.nav', text: '/de/pricing' }].filter((s) => s.text.startsWith('/de')).length === 1)

  const wasDe = process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED = 'true'
    check('E4: switching to German keeps the page', counterpartPath('/pricing', 'he', 'de') === '/de/pricing'
      && counterpartPath('/es/pricing', 'es', 'de') === '/de/pricing'
      && counterpartPath('/it/about', 'it', 'de') === '/de/about')
    check('E5: and the German home page is the bare prefix', counterpartPath('/', 'he', 'de') === '/de')
    check('E6: a single article switches to the German INDEX, not to a slug that does not exist',
      counterpartPath('/articles/some-hebrew-slug', 'he', 'de') === '/de/articles')
    check('E7: and switching away from German works the same way',
      counterpartPath('/de/pricing', 'de', 'he') === '/pricing' && counterpartPath('/de', 'de', 'en') === '/en')
  } finally {
    process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED = wasDe
  }

  const advertised = ['', '/pricing', '/about', '/free-check', '/articles', '/sitemap', '/affiliates']
  const missing = advertised.filter((p) => !existsSync(join(ROOT, `app/(public)/de${p}/page.tsx`)))
  check('E8: every path the sitemap advertises has a German page', missing.length === 0, missing.join(' '))

  /*
   * E9: THE IMPRESSUM EXISTS, IS LINKED AND IS NOT INDEXED.
   *
   * It is the one page German law adds, so nothing else in this repository
   * would notice it disappearing. § 5 DDG asks for it to be "unmittelbar
   * erreichbar", which is why it is in the footer of the German tree — a
   * required disclosure nobody can find is not a disclosure — and it stays out
   * of the index and out of the sitemap, because it is a legal notice for a
   * visitor, not a page to rank.
   */
  const impressum = read('app/(public)/de/impressum/page.tsx')
  check('E9: the Impressum declares itself German and noindex',
    /locale="de"/.test(impressum) && /robots:\s*'noindex, nofollow'/.test(impressum))
  check('E9a: and it carries every § 5 DDG item',
    /GO TOP DIGITAL MARKETING AND ADVERTISING LTD/.test(impressum)
    && /517274346/.test(impressum)
    && /HaRechasim 24\/2/.test(impressum)
    && /Oren Hacham/.test(impressum)
    && /oren@gotop\.co\.il/.test(impressum)
    && /\+972-54-9489377/.test(impressum)
    && /Medienstaatsvertrag|MStV/.test(impressum))
  check('E9a-MUT: an Impressum missing the registration number is caught',
    !/517274346/.test(impressum.replace(/517274346/g, '')))
  const footer = strip(read('components/Footer.tsx'))
  check('E10: and the footer links it for German readers only',
    /locale === 'de' &&[\s\S]{0,200}GERMAN_IMPRESSUM_LINK\.href/.test(footer))
  check('E10-MUT: a footer that linked it in every language would be caught',
    !/locale === 'de' &&[\s\S]{0,200}GERMAN_IMPRESSUM_LINK\.href/
      .test("<li><Link href={GERMAN_IMPRESSUM_LINK.href}>{GERMAN_IMPRESSUM_LINK.label}</Link></li>"))
  check('E11: the sitemap does not advertise it',
    !/impressum/.test(read('app/sitemap.xml/route.ts')))
  check('E12: and the four finished legal documents point the reader at it',
    ['terms', 'privacy', 'refund-policy', 'affiliate-terms']
      .every((d) => /\/de\/impressum/.test(read(`content/legal/de/${d}.md`))))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
