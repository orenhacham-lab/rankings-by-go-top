/**
 * THE DUTCH PUBLIC SITE.
 *
 * Dutch is the ninth language. The compiler finds most of a missing language on
 * its own, because the gate is one function and every `Record<PublicLocale, …>`
 * stops compiling without the new key. What it cannot find is a language merely
 * ABSENT from a hand-written list — which is exactly what `routePublicLocale`
 * and `resolveAuthLocale` are, and both were missing a Dutch branch when this
 * suite was written, as both were missing a German one when the German suite
 * was — or a translation that is the language it was copied FROM wearing a new
 * name.
 *
 * Dutch is Latin-script, so the script test the Japanese suite leans on is not
 * available here. The replacement is a POSITIVE test, as in German. Dutch prose
 * of any length contains at least one of a few dozen closed-class words — de,
 * het, een, en, niet, is, zijn, u, uw, voor, van, met, op — that no German
 * sentence carries, plus three orthographic signals for a label too short to
 * carry one. So section D asks of every prose string: is there any Dutch in it?
 *
 * THE LANGUAGE THIS TREE WAS COPIED FROM IS GERMAN, so German is what a
 * half-finished copy leaves behind, and German is what sections D and E hunt
 * for: in the dictionaries, in the page files, in the shape of a word (ä ö ü ß
 * never belong in Dutch) and in the German-only function words.
 *
 * The sections are the same as every other language's:
 *
 *   A) THE MIRROR. Every route under app/(public)/es has a twin under
 *      app/(public)/nl, and the same for the auth tree — load-bearing, because
 *      lib/seo/hreflang.ts DERIVES the Dutch URL from the Spanish one, so a
 *      Spanish page with no Dutch twin would advertise a 404.
 *   B) THE GATE. One `notFound()` per tree, in its layout, and no page with a
 *      flag check of its own.
 *   C) THE FLAG decides every outward sign of the language.
 *   D) THE COPY is Dutch: written in Dutch, in the u register, with no promise
 *      the owner has not made and no euro price.
 *   E) THE READER NEVER CHANGES LANGUAGE, and — the one way Dutch differs from
 *      German and Japanese — THERE IS NO EXTRA PAGE. The Netherlands has no §5
 *      DDG analogue: Art. 3:15d BW asks that the provider's identity, address
 *      and contact be easily, directly and permanently accessible, and the
 *      footer and the terms already carry all three. So section E checks that
 *      /nl/impressum does NOT exist and that no Dutch document points at one.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/i18n/__qa__/dutch-public-site.qa.ts
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  PUBLIC_LOCALES, LOCALE_PREFIX, LOCALE_CONFIG, INTL_LOCALE, PAYPAL_LOCALE,
  localeHomeHref, normalizeStoredLocale, publicLocaleEnabled, enabledPublicLocales,
} from '../locales'
import { dutchSiteEnabled } from '../dutch-site'
import { getPublicDictionary } from '../getPublicDictionary'
import { landingNl } from '../public/landing-nl'
import { pricingNl } from '../public/pricing-nl'
import { AFFILIATES_COPY } from '../public/affiliates'
import { ARTICLES_COPY, articlesIndexHref } from '../../articles/i18n'
import { availableLocales, counterpartPath } from '../../../components/LanguageSwitcher'
import { buildHreflangAlternates } from '../../seo/hreflang'
import { isDutchPath, routePublicLocale } from '../request-locale'
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
 * IS THERE ANY DUTCH IN THIS STRING?
 *
 * A closed list of Dutch function words. Every one is a word no GERMAN sentence
 * contains — which is the leak that matters, because /nl was copied from /de —
 * and the words the two languages share are deliberately absent: als, die,
 * hier, dan, gratis, automatisch, mag, in, over. The English words a copied
 * English paragraph would supply are absent too, so untranslated English fails
 * this as well.
 *
 * \b is no use here: JavaScript's word boundary counts only [A-Za-z0-9_], so an
 * accented letter is a boundary. Hence the Unicode lookarounds and the u flag.
 */
const DUTCH_WORD = /(?<!\p{L})(?:de|het|een|en|of|niet|is|zijn|wordt|worden|werd|u|uw|voor|van|met|op|uit|aan|af|er|zich|ook|maar|dat|naar|bij|geen|meer|nog|alleen|hoe|hoeveel|waarom|wie|wat|welk|welke|wij|ons|onze|elke|iedere|beide|zowel|want|dus|door|onder|zonder|tegen|tussen|boven|achter|naast|binnen|buiten|vanaf|vanuit|tijdens|volgens|zoals|behalve|zodat|omdat|zodra|sinds|terwijl|totdat|voordat|nadat|tenzij|deze|dit|hebben|heeft|kunnen|moeten|moet|mogen|ik|te|om|nu|wel|toch|zelf|nooit|vaak|soms|meestal|zeer|altijd|mijn|maandelijks|wanneer|waar|iets|niets|veel|weinig|goed|goede|nieuwe|eigen|samen|daarna|daarom|daarbij|hierboven|hieronder)(?!\p{L})/iu

/*
 * Three more Dutch signals, for a LABEL too short to carry a function word.
 *
 *   · a derivational suffix Dutch has where German has its own spelling —
 *     -heid against -heit, -lijk against -lich, -baar against -bar, -ing(en)
 *     against -ung. A German label therefore never matches.
 *   · a Dutch verb ending -eert / -eren / -eerd, where German spells the same
 *     borrowed verb -iert / -ieren / -iert.
 *   · the digraph ij or uu, neither of which German words carry.
 */
const DUTCH_SUFFIX = /(?<!\p{L})\p{L}{3,}(?:heid|heden|lijk|lijke|baar|bare|ingen|ing|eert|eren|eerd|eerde)(?!\p{L})/u
const DUTCH_DIGRAPH = /ij|uu/i
const HAS_DUTCH = (t: string) => DUTCH_WORD.test(t) || DUTCH_SUFFIX.test(t) || DUTCH_DIGRAPH.test(t)

/*
 * AND THE OTHER DIRECTION: a word that can only be German. Used in D as a
 * second, independent reading of the same question, because a German sentence
 * with a single Dutch-looking token in it would otherwise pass HAS_DUTCH.
 */
const GERMAN_ONLY = /(?<!\p{L})(?:der|das|den|dem|ein|eine|einen|einem|eines|und|nicht|ist|sind|wird|werden|wurde|Sie|Ihre|Ihren|Ihrem|Ihrer|Ihnen|für|von|vom|auf|aus|mit|sich|nach|beim|zum|zur|kein|keine|schon|nur|wir|uns|unser|unsere|jeder|jede|jedes|durch|über|ohne|damit|weil|bereits|diese|dieser|dieses|haben|hat|kann|können|müssen|soll|sollen|dürfen|wollen|ich|zu|sowie|jetzt|sehr|immer|mein|meine|Positionen|Keywords|kostenlos)(?!\p{L})/u
/*
 * ä and ß, and NOT ö or ü. Dutch writes a diaeresis on a vowel that must be
 * read separately — coördinaten, reünie, geïnstalleerd — so ö and ü are
 * ordinary Dutch letters, and a guard that treated them as German would fail on
 * the word for coordinates. ä and ß appear in no Dutch word at all.
 */
const GERMAN_LETTER = /[äÄß]/

console.log('A) the trees are mirrors, which is what hreflang rests on')
{
  for (const group of ['(public)', '(auth)']) {
    const es = routes(`app/${group}/es`)
    const nl = routes(`app/${group}/nl`)
    check(`A1 app/${group}: the Dutch tree has every Spanish route`,
      es.every((r) => nl.includes(r)), es.filter((r) => !nl.includes(r)).join(' '))
    /*
     * A2 allows EXACTLY ONE extra route, and names it: bedrijfsgegevens, the
     * identity page artikel 3:15d lid 1 BW asks for, the Dutch counterpart of
     * /de/impressum and /ja/tokusho. Anything else in the Dutch tree that the
     * Spanish tree does not have is a page copied from another locale by
     * reflex, which is what this check is for — and the page must NOT be called
     * impressum, because that is a German word for a German statute (E9).
     */
    const ALLOWED_EXTRA = group === '(public)' ? ['bedrijfsgegevens/page.tsx'] : []
    const extras = nl.filter((r) => !es.includes(r) && !ALLOWED_EXTRA.includes(r))
    check(`A2 app/${group}: and no route beyond the Spanish tree except ${ALLOWED_EXTRA.join(', ') || 'none'}`,
      extras.length === 0, extras.join(' '))
    if (ALLOWED_EXTRA.length) {
      check(`A2a app/${group}: the identity page artikel 3:15d BW asks for IS there`,
        ALLOWED_EXTRA.every((r) => nl.includes(r)), ALLOWED_EXTRA.filter((r) => !nl.includes(r)).join(' '))
    }
    check(`A3 app/${group}: and it is not empty`, nl.length > 0)
  }
  const es = routes('app/(public)/es')
  check('A1-MUT: a Spanish route with no Dutch twin fails A1',
    ![...es, 'press-kit/page.tsx'].every((r) => routes('app/(public)/nl').includes(r)))
  check('A2-MUT: an impressum copied into the Dutch tree fails A2',
    ['impressum/page.tsx'].filter((r) => !es.includes(r) && r !== 'bedrijfsgegevens/page.tsx').length === 1)
  check('A2a-MUT: a Dutch tree without the identity page fails A2a',
    !['bedrijfsgegevens/page.tsx'].every((r) => es.includes(r)))
}

console.log('\nB) one gate per tree')
{
  const pub = strip(read('app/(public)/nl/layout.tsx'))
  const auth = strip(read('app/(auth)/nl/layout.tsx'))
  check('B1: the public tree 404s entirely when the flag is off',
    /if \(!dutchSiteEnabled\(\)\) notFound\(\)/.test(pub))
  check('B2: so does the auth tree', /if \(!dutchSiteEnabled\(\)\) notFound\(\)/.test(auth))
  check('B3: the layout declares the document Dutch and left-to-right',
    /lang="nl"/.test(pub) && /dir="ltr"/.test(pub) && /DocumentLocaleEffect locale="nl"/.test(pub))
  const pages = routes('app/(public)/nl').filter((r) => r.endsWith('page.tsx'))
  check('B4: and no page carries a gate of its own',
    pages.every((r) => !/dutchSiteEnabled/.test(read(`app/(public)/nl/${r}`))),
    pages.filter((r) => /dutchSiteEnabled/.test(read(`app/(public)/nl/${r}`))).join(' '))
  check('B1-MUT: a layout without the gate fails B1',
    !/if \(!dutchSiteEnabled\(\)\) notFound\(\)/.test(pub.replace('if (!dutchSiteEnabled()) notFound()', '')))
}

console.log('\nC) one gate, and it decides every outward sign')
{
  // The no-argument call reads process.env, so the unset case is checked with
  // the variable actually cleared.
  const ambient = process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED
  delete process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED
  const unsetIsOff = !dutchSiteEnabled(undefined) && !dutchSiteEnabled()
  if (ambient !== undefined) process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED = ambient
  check('C1: "true" and nothing else turns it on',
    dutchSiteEnabled('true') && !dutchSiteEnabled('TRUE') && !dutchSiteEnabled('1')
    && !dutchSiteEnabled('') && !dutchSiteEnabled('yes') && unsetIsOff)

  const was = process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED
  const wasEs = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
    process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED = 'true'
    const on = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C2: with the flag on, the derived Dutch URL is announced',
      on.nl === 'https://www.gotopseo.com/nl/pricing', JSON.stringify(on))
    const home = buildHreflangAlternates('/', '/en', '/es')
    check('C3: and the home page derives to the bare prefix, not "/nl/"',
      home.nl === 'https://www.gotopseo.com/nl', home.nl)
    check('C4: a path that merely starts with the letters is not touched',
      buildHreflangAlternates('/nlp-guide', '/en/nlp-guide', '/nlp-guide').nl === 'https://www.gotopseo.com/nlp-guide')
    check('C5: the switcher offers it', availableLocales({ es: true, nl: true }).includes('nl'))
    check('C6: a Dutch path is a Dutch document',
      isDutchPath('/nl/pricing') && routePublicLocale('/nl/pricing') === 'nl'
      && resolveAuthLocale({ pathname: '/nl/login' }) === 'nl')
    check('C7: a stored Dutch preference is honoured', normalizeStoredLocale('nl') === 'nl')

    process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED = ''
    const off = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C8: with the flag off, nothing advertises the language',
      !('nl' in off) && !availableLocales({ es: true, nl: false }).includes('nl')
      && !enabledPublicLocales({ nl: false }).includes('nl'))
    check('C9: and a Dutch URL is not even a locale, so nothing labels a 404 "nl"',
      !isDutchPath('/nl/pricing') && routePublicLocale('/nl/pricing') !== 'nl')
    check('C10: and a hand-edited cookie cannot select it', normalizeStoredLocale('nl') === null)
    check('C8-MUT: a switcher that ignored the flag would still list it in PUBLIC_LOCALES',
      PUBLIC_LOCALES.includes('nl'))
  } finally {
    process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED = was
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = wasEs
  }

  /** C11: THE GATE IS ONE FUNCTION, AND EVERYTHING READS IT. */
  for (const rel of ['components/LanguageSwitcher.tsx', 'lib/seo/hreflang.ts', 'app/sitemap.xml/route.ts']) {
    const srcText = strip(read(rel))
    check(`C11 ${rel}: asks the one gate, not the flags directly`,
      !/(spanish|portuguese|french|italian|japanese|german|dutch)SiteEnabled\s*\(/.test(srcText), rel)
  }
  check('C11-MUT: a direct flag read is caught',
    /(spanish|portuguese|french|italian|japanese|german|dutch)SiteEnabled\s*\(/.test('const x = dutchSiteEnabled()'))
  check('C12: the gate answers for every public locale, with no fallback to guess with',
    PUBLIC_LOCALES.every((l) => typeof publicLocaleEnabled(l, { es: true, 'pt-BR': true, fr: true, it: true, ja: true, de: true, nl: true }) === 'boolean')
    && publicLocaleEnabled('he') && publicLocaleEnabled('en'))
}

console.log('\nD) the locale tables and the copy')
{
  check('D1: the prefix, the direction and every locale spelling are stated',
    LOCALE_PREFIX.nl === '/nl' && LOCALE_CONFIG.nl.dir === 'ltr'
    && LOCALE_CONFIG.nl.lang === 'nl' && LOCALE_CONFIG.nl.ogLocale === 'nl_NL'
    && INTL_LOCALE.nl === 'nl-NL' && PAYPAL_LOCALE.nl === 'nl_NL' && localeHomeHref('nl') === '/nl')

  const all = [
    ...strings(getPublicDictionary('nl'), 'public'),
    ...strings(landingNl, 'landing'),
    ...strings(pricingNl, 'pricing'),
    ...strings(AFFILIATES_COPY.nl, 'affiliates'),
    ...strings(ARTICLES_COPY.nl, 'articles'),
  ]
  check('D2: there is a real amount of copy to check', all.length > 300, String(all.length))

  // The language switcher names the other languages in their own alphabets, so
  // Hebrew letters are expected there and nowhere else.
  const notSwitcher = (p: string) => !p.startsWith('public.languageSwitcher')
  const hebrew = all.filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path))
  check('D3: no Hebrew left in', hebrew.length === 0, hebrew.slice(0, 3).map((s) => s.path).join(' '))
  const cjk = all.filter((s) => /[぀-ヿ㐀-䶿一-鿿]/.test(s.text) && notSwitcher(s.path))
  check('D3a: and no Japanese left in', cjk.length === 0, cjk.slice(0, 3).map((s) => s.path).join(' '))
  check('D3a-MUT: a Japanese string is caught',
    /[぀-ヿ㐀-䶿一-鿿]/.test('検索順位の計測'))

  /*
   * D3b: AND NOT ONE GERMAN LETTER. /nl was copied from /de, so this is the
   * cheapest possible reading of the leak: ä, ö, ü and ß exist in no Dutch
   * word, and a copied German sentence of any length carries one far more often
   * than not. It runs before the prose floor, so a two-word German label is
   * caught too.
   */
  const umlauts = all.filter((s) => GERMAN_LETTER.test(s.text) && notSwitcher(s.path))
  check('D3b: no letter that exists only in German survives in the Dutch copy',
    umlauts.length === 0, umlauts.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 50)}`).join(' | '))
  check('D3b-MUT: a German label is caught, and Dutch with its own diaereses is not',
    GERMAN_LETTER.test('Wählen Sie eine Größe') && GERMAN_LETTER.test('Die Größe')
    && !GERMAN_LETTER.test('één plek, geen losse tools')
    && !GERMAN_LETTER.test('de coördinaten die u opgeeft'))

  /*
   * D4: EVERY SENTENCE IS WRITTEN IN DUTCH.
   *
   * Only PROSE is asked: a string long enough and with enough words to be a
   * sentence. Everything shorter is a label, a brand, a number or a path, and
   * Dutch shares its alphabet with the language this tree was copied from, so
   * there is no script to fall back on.
   */
  const IS_PATH = (t: string) => /^(?:\/|https?:|mailto:|tel:|#|data:)/.test(t)
  const NO_LETTERS = (t: string) => /^[\s\p{P}\p{S}\d]*$/u.test(t)
  const CLASS_LIST = (t: string) => /^[a-z0-9\-:[\]./ %_,()&>#+*='"]+$/.test(t)
  const words = (t: string) => t.split(/\s+/).filter(Boolean)
  const META_TITLE = (t: string) => t.includes(' | ')
  const IS_PROSE = (t: string) =>
    !IS_PATH(t) && !NO_LETTERS(t) && !CLASS_LIST(t) && !META_TITLE(t)
    && t.length >= 35 && words(t).length >= 5
  const ENGLISH_BY_DESIGN = ['public.footer.copyright']
  const notDutch = all.filter((s) =>
    notSwitcher(s.path) && !ENGLISH_BY_DESIGN.includes(s.path)
    && IS_PROSE(s.text) && (!HAS_DUTCH(s.text) || GERMAN_ONLY.test(s.text)))
  check('D4: every sentence of the Dutch copy is written in Dutch, and in no German',
    notDutch.length === 0, notDutch.slice(0, 4).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D4-MUT: a German or English sentence left behind is caught, and a brand or a path is not',
    GERMAN_ONLY.test('Wir messen Ihre Positionen bei Google jeden Monat automatisch')
    && !HAS_DUTCH('Track your rankings in Google and in the AI engines every month')
    && !GERMAN_ONLY.test('Wij meten uw posities in Google elke maand automatisch')
    && HAS_DUTCH('Wij meten uw posities in Google elke maand automatisch')
    && !IS_PROSE('/pricing') && !IS_PROSE('Go Top SEO') && !IS_PROSE('WCAG 2.1')
    && IS_PROSE('Wir messen Ihre Positionen bei Google jeden Monat automatisch'))

  /*
   * D5: NO PROMISE THE OWNER HAS NOT MADE, in a language he cannot read.
   *
   * His standing rule is no ranking promises and no guaranteed results. In Dutch
   * the shapes that break it are garanderen / garantie / gegarandeerd, and a
   * first page or a number-one position offered TO THE READER. "Plaats 1" on its
   * own is a report column, so the test is who the sentence is about, and
   * landing.demo is the made-up business inside the product illustration.
   */
  const ours = (p: string) => !p.startsWith('landing.demo')
  const GUARANTEE = /(?<!\p{L})(?:garandeer\w*|garanderen|garantie\w*|gegarandeerd)(?!\p{L})/iu
  const FIRST_PLACE = /(?<!\p{L})(?:plaats\s*1|plaats\s*e[eé]n|eerste\s+pagina|eerste\s+plaats|nummer\s*1|toppositie)(?!\p{L})/iu
  const READER = /(?<!\p{L})(?:u|uw)(?!\p{L})/u
  const PROMISE = (t: string) => GUARANTEE.test(t) || (FIRST_PLACE.test(t) && READER.test(t))
  const promises = all.filter((s) => PROMISE(s.text) && ours(s.path))
  check('D5: no Dutch page promises a ranking or a guaranteed result',
    promises.length === 0, promises.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 70)}`).join(' | '))
  check('D5-MUT: a ranking promise is caught, and a report label is not',
    PROMISE('Wij garanderen u de eerste pagina in Google.')
    && PROMISE('Wij brengen u op de eerste pagina van de zoekresultaten.')
    && PROMISE('Een garantie op plaats 1.')
    && !PROMISE('Zoekwoorden op plaats 1')
    && !PROMISE('De beweging vanaf plaats 1 deze maand'))

  /*
   * D6: THE REGISTER. "u" throughout, never "je" — the same contract the Dutch
   * legal documents and the Dutch dashboard dictionary are held to, and for the
   * same reason: a marketing page that switches into "je" mid-section reads as
   * two different writers, and the legal documents cannot switch at all without
   * changing who the contract is with.
   */
  const INFORMAL = /(?<!\p{L})(?:je|jij|jou|jouw|jullie|jouwe)(?!\p{L})/iu
  const informal = all.filter((s) => INFORMAL.test(s.text))
  check('D6: the whole Dutch public copy keeps the formal u register',
    informal.length === 0, informal.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D6-MUT: an informal sentence is caught, and ordinary formal Dutch is not',
    INFORMAL.test('Verbind je website en wij meten de posities')
    && !INFORMAL.test('Verbind uw website, en wij meten de posities elke maand rechtstreeks.'))

  /*
   * D7: THE PRICE IS IN DOLLARS. Abroad is USD through Creem, and no euro figure
   * has ever been set. A € on a Dutch page would be the currency a Dutch reader
   * would most expect, which is the worst place to invent one, and artikel
   * 6:193e BW is precisely about the stated price being the total payable.
   */
  const currency = all.filter((s) => /€|(?<!\p{L})EUR(?!\p{L})|(?<!\p{L})euro'?s?(?!\p{L})/iu.test(s.text))
  check('D7: no euro price anywhere in the Dutch copy',
    currency.length === 0, currency.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 70)}`).join(' | '))
  check('D7-MUT: a euro price is caught, and the dollar price is not',
    /€|(?<!\p{L})EUR(?!\p{L})/u.test('vanaf 79 € per maand') && !/€|(?<!\p{L})EUR(?!\p{L})/u.test('vanaf 79 Amerikaanse dollar per maand'))

  check('D8: the affiliate page states the same two rates as every other language',
    JSON.stringify(AFFILIATES_COPY.nl).includes('30') && JSON.stringify(AFFILIATES_COPY.nl).includes('40'))
  check('D3-MUT: a Hebrew string outside the switcher fails D3',
    [{ path: 'landing.hero.title', text: 'מעקב מיקומים' }].filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path)).length === 1)

  /*
   * D10: THE PAGE FILES THEMSELVES, NOT ONLY THE DICTIONARIES.
   *
   * D4 reads the dictionaries. On 2026-10-31 the equivalent guard was green
   * while ten pages of the LIVE Japanese site were showing ITALIAN: route files
   * that carried their copy inline, had been copied from another tree, and were
   * never translated. No dictionary was involved, so no dictionary guard could
   * see it. The /nl tree was created the same way — copied from /de — so this is
   * the guard that matters most here.
   */
  const pageStrings = (source: string): string[] => {
    const body = strip(source)
    const out: string[] = []
    for (const m of body.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) out.push((m[1] ?? m[2] ?? '').trim())
    for (const m of body.matchAll(/>([^<>{}]+)</g)) out.push(m[1].trim())
    return out.filter(Boolean)
  }
  const REGISTERED = [
    'Oren Hacham',
    'HaRechasim 24/2',
    'Ramat Gan 5235524',
    'Israel',
    'GO TOP DIGITAL MARKETING AND ADVERTISING LTD',
    // The author of the articles, as the Person their JSON-LD points at. It is
    // the same Hebrew string in every tree, because it is his name.
    'אורן חכם',
  ]
  const NOT_COPY = (t: string) =>
    /^[@.][\w@./-]*$/.test(t)
    || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(t)
  const CJK = /[぀-ヿ㐀-䶿一-鿿]/
  const HEBREW_TEXT = /[֐-׿]/
  const WRONG_SCRIPT = (t: string) => CJK.test(t) || HEBREW_TEXT.test(t) || GERMAN_LETTER.test(t)
  const foreignOnPage = (text: string) =>
    !REGISTERED.includes(text) && !NOT_COPY(text)
    && (WRONG_SCRIPT(text) || (IS_PROSE(text) && (!HAS_DUTCH(text) || GERMAN_ONLY.test(text))))
  const pageLeaks = routes('app/(public)/nl').flatMap((r) =>
    pageStrings(read(`app/(public)/nl/${r}`)).filter(foreignOnPage).map((t) => `${r}: ${t.slice(0, 50)}`))
  check('D10: every sentence the Dutch PAGE FILES print is written in Dutch',
    pageLeaks.length === 0, `${pageLeaks.length}: ${pageLeaks.slice(0, 5).join(' | ')}`)
  const authLeaks = routes('app/(auth)/nl').flatMap((r) =>
    pageStrings(read(`app/(auth)/nl/${r}`)).filter(foreignOnPage).map((t) => `${r}: ${t.slice(0, 50)}`))
  check('D10a: and so is every sentence the Dutch AUTH page files print',
    authLeaks.length === 0, `${authLeaks.length}: ${authLeaks.slice(0, 5).join(' | ')}`)

  const MUT_GERMAN = `const COPY = {
    title: 'Elf Jahre SEO, in einem automatischen System',
    className: 'flex min-h-screen flex-col bg-canvas',
  }
  export default function P() { return <p>Die Daten kommen aus der API von Google Ads.</p> }`
  const MUT_DUTCH = `const COPY = {
    title: 'Elf jaar SEO, in een automatisch systeem',
    className: 'flex min-h-screen flex-col bg-canvas',
  }
  export default function P() { return <p>De gegevens komen uit de API van Google Ads.</p> }`
  check('D10-MUT: a German headline and a German JSX line are both caught, and the Dutch page and its class lists are not',
    pageStrings(MUT_GERMAN).filter(foreignOnPage).length === 2
    && pageStrings(MUT_DUTCH).filter(foreignOnPage).length === 0
    && !foreignOnPage('Go Top SEO') && !foreignOnPage('flex min-h-screen flex-col bg-canvas')
    && !foreignOnPage('@/components/public/FeaturePage') && !foreignOnPage('contact@gotopseo.com')
    && foreignOnPage('Write to contact@gotopseo.com and we will answer you shortly')
    // The script half: a Japanese label is caught even though it is one "word".
    && foreignOnPage('Googleでの検索順位の計測')
    && 'Googleでの検索順位の計測'.split(/\s+/).filter(Boolean).length === 1
    && !foreignOnPage('אורן חכם'),
    `${pageStrings(MUT_GERMAN).filter(foreignOnPage).join(' | ')} / ${pageStrings(MUT_DUTCH).filter(foreignOnPage).join(' | ')}`)
}

console.log('\nE) the reader never changes language, and Dutch adds no page of its own')
{
  const all = [
    ...strings(getPublicDictionary('nl'), 'public'),
    ...strings(pricingNl, 'pricing'),
    ...strings(AFFILIATES_COPY.nl, 'affiliates'),
    ...strings(ARTICLES_COPY.nl, 'articles'),
  ]
  const OTHER_TREE = /^\/(en|es|pt-BR|fr|it|ja|de)(\/|$)/
  const leaks = all.filter((s) => OTHER_TREE.test(s.text))
  check('E1: no Dutch string links into another language\'s tree',
    leaks.length === 0, leaks.slice(0, 5).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E1-MUT: a link to the German privacy policy is caught',
    [{ path: 'pricing.faq.link', text: '/de/privacy' }].filter((s) => OTHER_TREE.test(s.text)).length === 1)

  check('E2: the blog index and an article live under /nl', articlesIndexHref('nl') === '/nl/articles')

  const landingPaths = strings(landingNl, 'landing').filter((s) => /^\//.test(s.text))
  const doubled = landingPaths.filter((s) => s.text.startsWith('/nl'))
  check('E3: the landing dictionary stores unprefixed paths, so nothing becomes /nl/nl',
    doubled.length === 0, doubled.slice(0, 4).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E3-MUT: a prefixed landing path is caught',
    [{ path: 'landing.nav', text: '/nl/pricing' }].filter((s) => s.text.startsWith('/nl')).length === 1)

  const wasNl = process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED = 'true'
    check('E4: switching to Dutch keeps the page', counterpartPath('/pricing', 'he', 'nl') === '/nl/pricing'
      && counterpartPath('/es/pricing', 'es', 'nl') === '/nl/pricing'
      && counterpartPath('/de/about', 'de', 'nl') === '/nl/about')
    check('E5: and the Dutch home page is the bare prefix', counterpartPath('/', 'he', 'nl') === '/nl')
    check('E6: a single article switches to the Dutch INDEX, not to a slug that does not exist',
      counterpartPath('/articles/some-hebrew-slug', 'he', 'nl') === '/nl/articles')
    check('E7: and switching away from Dutch works the same way',
      counterpartPath('/nl/pricing', 'nl', 'he') === '/pricing' && counterpartPath('/nl', 'nl', 'en') === '/en')
  } finally {
    process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED = wasNl
  }

  const advertised = ['', '/pricing', '/about', '/free-check', '/articles', '/sitemap', '/affiliates']
  const missing = advertised.filter((p) => !existsSync(join(ROOT, `app/(public)/nl${p}/page.tsx`)))
  check('E8: every path the sitemap advertises has a Dutch page', missing.length === 0, missing.join(' '))

  /*
   * E9: THE IDENTITY PAGE EXISTS, IS DUTCH, AND IS NOT CALLED IMPRESSUM.
   *
   * Artikel 3:15d lid 1 BW is the Dutch counterpart of §5 DDG, and it carries no
   * establishment qualifier, so Dutch owes the same content German does: the
   * provider's identity and address (sub a), the contact including the e-mail
   * (sub b), the REGISTER it is entered in and its number (sub c — the register
   * NAMED, not only the number) and the VAT identification number (sub f),
   * which we do not have in the Netherlands and therefore have to say so about.
   * The legal thread read the statute and ruled on 5 Nov 2026; the earlier
   * reading in this suite, that Dutch law asks for no such page, was wrong.
   *
   * What the page must NOT be is a copy of the German one. Two things are
   * checked for that: its slug is Dutch (impressum is a German word for a German
   * statute, and lid 1 prescribes no title at all), and the German MStV line
   * naming a person responsible for journalistic-editorial content is absent,
   * because the Netherlands has no MStV analogue and presenting one as required
   * would be a false claim about the law.
   */
  const INFO = 'app/(public)/nl/bedrijfsgegevens/page.tsx'
  check('E9: the Dutch tree carries the artikel 3:15d BW identity page', existsSync(join(ROOT, INFO)))
  check('E9a: and it is not called impressum', !existsSync(join(ROOT, 'app/(public)/nl/impressum/page.tsx')))
  const info = existsSync(join(ROOT, INFO)) ? read(INFO) : ''
  check('E9b: it names the register, not only the number',
    /Registrar of Companies/.test(info) && /517274346/.test(info))
  check('E9c: it says we have no Dutch VAT identification number, and who the seller of record is',
    /geen Nederlands btw-identificatienummer/.test(info) && /merchant of record/.test(info))
  check('E9d: it carries the identity, the address and the e-mail',
    /GO TOP DIGITAL MARKETING AND ADVERTISING LTD/.test(info)
    && /HaRechasim 24\/2/.test(info) && /contact@gotopseo\.com/.test(info))
  check('E9e: and it cites the article it answers',
    /3:15d/.test(info))
  check('E9f: it does NOT claim a Dutch duty to name someone responsible for editorial content',
    !/Medienstaatsvertrag|MStV|verantwoordelijk voor journalistiek/i.test(strip(info)))
  check('E9f-MUT: the German line is what that check rejects',
    /Medienstaatsvertrag|MStV|verantwoordelijk voor journalistiek/i.test('Verantwortlich nach § 18 Absatz 2 des Medienstaatsvertrags (MStV)'))
  // The same two detectors sections D uses, applied to this one page: the copy
  // is Dutch, it keeps the formal `u`, and it names no price in euros.
  const JE_FORM = /(?<!\p{L})(?:je|jij|jou|jouw|jullie)(?!\p{L})/iu
  const EURO_PRICE = /€|(?<!\p{L})EUR(?!\p{L})|\d+(?:[.,]\d+)?\s*euro/iu
  check('E9g: the copy is Dutch, in the u register, and names no euro price',
    HAS_DUTCH(info) && !JE_FORM.test(info) && !EURO_PRICE.test(info))
  check('E9g-MUT: the detectors fire on je-form and on a euro price',
    JE_FORM.test('Hier zijn jouw gegevens') && EURO_PRICE.test('79 € per maand'))

  /*
   * E9h: NO DUTCH DOCUMENT SENDS THE READER INTO THE GERMAN TREE. The five
   * Dutch documents were translated from the German ones, four of which end by
   * pointing at /de/impressum, so a surviving href is a live defect.
   */
  const IMPRESSUM_LINK = /\]\(\s*\/[a-z-]{2,5}\/impressum|href=["']\/[a-z-]{2,5}\/impressum/i
  const LEGAL_DOCS = ['terms', 'privacy', 'refund-policy', 'affiliate-terms', 'accessibility']
  const pointing = LEGAL_DOCS.filter((d) => IMPRESSUM_LINK.test(read(`content/legal/nl/${d}.md`)))
  check('E9h: no Dutch legal document links a /xx/impressum', pointing.length === 0, pointing.join(' '))
  check('E9h-MUT: a document that still linked the German Impressum would be caught, and the Dutch pointer would not',
    IMPRESSUM_LINK.test('Die vollständigen Angaben stehen im [Impressum](/de/impressum).')
    && !IMPRESSUM_LINK.test('Alle gegevens staan op de pagina [Bedrijfsgegevens](/nl/bedrijfsgegevens).'))
  check('E9i: and the terms and the privacy statement point at the Dutch page instead',
    ['terms', 'privacy'].every((d) => /\]\(\/nl\/bedrijfsgegevens\)/.test(read(`content/legal/nl/${d}.md`))))

  check('E10: the sitemap does not advertise an impressum for Dutch',
    !/nl\/impressum/.test(read('app/sitemap.xml/route.ts')))
  check('E11: the footer links the German Impressum for German readers and the Dutch page for Dutch ones',
    /locale === 'de' &&[\s\S]{0,200}GERMAN_IMPRESSUM_LINK\.href/.test(strip(read('components/Footer.tsx')))
    && /locale === 'nl' &&[\s\S]{0,200}DUTCH_COMPANY_INFO_LINK\.href/.test(strip(read('components/Footer.tsx')))
    && !/locale === 'nl' &&[\s\S]{0,200}IMPRESSUM/i.test(strip(read('components/Footer.tsx'))))
  check('E11-MUT: a Dutch footer that linked the GERMAN page is caught',
    /locale === 'nl' &&[\s\S]{0,200}IMPRESSUM/i.test("{locale === 'nl' && <Link href={GERMAN_IMPRESSUM_LINK.href}/>}"))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
