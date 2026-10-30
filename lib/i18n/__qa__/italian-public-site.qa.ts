/**
 * THE ITALIAN PUBLIC SITE.
 *
 * Italian is the sixth language, and the twin of
 * lib/i18n/__qa__/french-public-site.qa.ts. By the time Italian arrived the gate
 * was already one function and every `Record<PublicLocale, …>` was a compile
 * error without it, so the compiler finds most of a missing language on its own.
 * What it still cannot find is a language merely ABSENT from a hand-written list,
 * or a translation that is the language it was copied FROM wearing a new name —
 * and the Italian tree was copied from the French one.
 *
 * So this suite holds the things no type can:
 *
 *   A) THE MIRROR. Every route under app/(public)/es has a twin under
 *      app/(public)/it, and the same for the auth tree. Load-bearing, not tidy:
 *      lib/seo/hreflang.ts DERIVES the Italian URL from the Spanish one, so a
 *      Spanish page with no Italian twin would advertise a 404.
 *   B) THE GATE. One `notFound()` per tree, in its layout, and no page with a
 *      flag check of its own.
 *   C) THE FLAG decides every outward sign of the language: hreflang, the
 *      sitemap, the switcher, the stored preference — all through the ONE gate
 *      in lib/i18n/locales.ts.
 *   D) THE COPY is Italian: no Hebrew, and not Spanish, Portuguese or French
 *      under an Italian label, with no promise the owner has not made and no
 *      euro price, which has never been set.
 *   E) THE READER NEVER CHANGES LANGUAGE. Every link an Italian page offers
 *      leads somewhere Italian.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/i18n/__qa__/italian-public-site.qa.ts
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  PUBLIC_LOCALES, LOCALE_PREFIX, LOCALE_CONFIG, INTL_LOCALE, PAYPAL_LOCALE,
  localeHomeHref, normalizeStoredLocale, publicLocaleEnabled, enabledPublicLocales,
} from '../locales'
import { italianSiteEnabled } from '../italian-site'
import { getPublicDictionary } from '../getPublicDictionary'
import { landingIt } from '../public/landing-it'
import { pricingIt } from '../public/pricing-it'
import { AFFILIATES_COPY } from '../public/affiliates'
import { ARTICLES_COPY, articlesIndexHref } from '../../articles/i18n'
import { availableLocales, counterpartPath } from '../../../components/LanguageSwitcher'
import { buildHreflangAlternates } from '../../seo/hreflang'
import { isItalianPath, routePublicLocale } from '../request-locale'
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

console.log('A) the trees are mirrors, which is what hreflang rests on')
{
  for (const group of ['(public)', '(auth)']) {
    const es = routes(`app/${group}/es`)
    const it = routes(`app/${group}/it`)
    check(`A1 app/${group}: the Italian tree has every Spanish route`,
      es.every((r) => it.includes(r)), es.filter((r) => !it.includes(r)).join(' '))
    check(`A2 app/${group}: and no route the Spanish tree does not have`,
      it.every((r) => es.includes(r)), it.filter((r) => !es.includes(r)).join(' '))
    check(`A3 app/${group}: and it is not empty`, it.length > 0)
  }
  const es = routes('app/(public)/es')
  check('A1-MUT: a Spanish route with no Italian twin fails A1',
    ![...es, 'press-kit/page.tsx'].every((r) => routes('app/(public)/it').includes(r)))
}

console.log('\nB) one gate per tree')
{
  const pub = strip(read('app/(public)/it/layout.tsx'))
  const auth = strip(read('app/(auth)/it/layout.tsx'))
  check('B1: the public tree 404s entirely when the flag is off',
    /if \(!italianSiteEnabled\(\)\) notFound\(\)/.test(pub))
  check('B2: so does the auth tree', /if \(!italianSiteEnabled\(\)\) notFound\(\)/.test(auth))
  check('B3: the layout declares the document Italian and left-to-right',
    /lang="it"/.test(pub) && /dir="ltr"/.test(pub) && /DocumentLocaleEffect locale="it"/.test(pub))
  const pages = routes('app/(public)/it').filter((r) => r.endsWith('page.tsx'))
  check('B4: and no page carries a gate of its own',
    pages.every((r) => !/italianSiteEnabled/.test(read(`app/(public)/it/${r}`))),
    pages.filter((r) => /italianSiteEnabled/.test(read(`app/(public)/it/${r}`))).join(' '))
  check('B1-MUT: a layout without the gate fails B1',
    !/if \(!italianSiteEnabled\(\)\) notFound\(\)/.test(pub.replace('if (!italianSiteEnabled()) notFound()', '')))
}

console.log('\nC) one gate, and it decides every outward sign')
{
  check('C1: "true" and nothing else turns it on',
    italianSiteEnabled('true') && !italianSiteEnabled('TRUE') && !italianSiteEnabled('1')
    && !italianSiteEnabled('') && !italianSiteEnabled('yes') && !italianSiteEnabled(undefined))

  const was = process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED
  const wasEs = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
    process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED = 'true'
    const on = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C2: with the flag on, the derived Italian URL is announced',
      on.it === 'https://www.gotopseo.com/it/pricing', JSON.stringify(on))
    const home = buildHreflangAlternates('/', '/en', '/es')
    check('C3: and the home page derives to the bare prefix, not "/it/"',
      home.it === 'https://www.gotopseo.com/it', home.it)
    check('C4: a path that merely starts with the letters is not touched',
      buildHreflangAlternates('/italia', '/en/italia', '/italia').it === 'https://www.gotopseo.com/italia')
    check('C5: the switcher offers it', availableLocales({ es: true, it: true }).includes('it'))
    check('C6: an Italian path is an Italian document',
      isItalianPath('/it/pricing') && routePublicLocale('/it/pricing') === 'it'
      && resolveAuthLocale({ pathname: '/it/login' }) === 'it')
    check('C7: a stored Italian preference is honoured', normalizeStoredLocale('it') === 'it')

    process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED = ''
    const off = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C8: with the flag off, nothing advertises the language',
      !('it' in off) && !availableLocales({ es: true, it: false }).includes('it')
      && !enabledPublicLocales({ it: false }).includes('it'))
    check('C9: and an Italian URL is not even a locale, so nothing labels a 404 "it"',
      !isItalianPath('/it/pricing') && routePublicLocale('/it/pricing') !== 'it')
    check('C10: and a hand-edited cookie cannot select it',
      normalizeStoredLocale('it') === null)
    check('C8-MUT: a switcher that ignored the flag would still list it in PUBLIC_LOCALES',
      PUBLIC_LOCALES.includes('it'))
  } finally {
    process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED = was
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = wasEs
  }

  /** C11: THE GATE IS ONE FUNCTION, AND EVERYTHING READS IT. */
  for (const rel of ['components/LanguageSwitcher.tsx', 'lib/seo/hreflang.ts', 'app/sitemap.xml/route.ts']) {
    const src = strip(read(rel))
    check(`C11 ${rel}: asks the one gate, not the flags directly`,
      !/(spanish|portuguese|french|italian)SiteEnabled\s*\(/.test(src), rel)
  }
  check('C11-MUT: a direct flag read is caught',
    /(spanish|portuguese|french|italian)SiteEnabled\s*\(/.test("const x = italianSiteEnabled()"))
  check('C12: the gate answers for every public locale, with no fallback to guess with',
    PUBLIC_LOCALES.every((l) => typeof publicLocaleEnabled(l, { es: true, 'pt-BR': true, fr: true, it: true }) === 'boolean')
    && publicLocaleEnabled('he') && publicLocaleEnabled('en'))
}

console.log('\nD) the locale tables and the copy')
{
  check('D1: the prefix, the direction and every locale spelling are stated',
    LOCALE_PREFIX.it === '/it' && LOCALE_CONFIG.it.dir === 'ltr'
    && LOCALE_CONFIG.it.lang === 'it' && LOCALE_CONFIG.it.ogLocale === 'it_IT'
    && INTL_LOCALE.it === 'it-IT' && PAYPAL_LOCALE.it === 'it_IT' && localeHomeHref('it') === '/it')

  /** Every string in a dictionary, with the path that leads to it. */
  const strings = (value: unknown, path = ''): { path: string; text: string }[] => {
    if (typeof value === 'string') return [{ path, text: value }]
    if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`))
    if (value && typeof value === 'object') {
      return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
    }
    return []
  }
  const all = [
    ...strings(getPublicDictionary('it'), 'public'),
    ...strings(landingIt, 'landing'),
    ...strings(pricingIt, 'pricing'),
    ...strings(AFFILIATES_COPY.it, 'affiliates'),
    ...strings(ARTICLES_COPY.it, 'articles'),
  ]
  check('D2: there is a real amount of copy to check', all.length > 300, String(all.length))

  // The language switcher names the other languages in their own alphabets, so
  // Hebrew letters are expected there and nowhere else.
  const notSwitcher = (p: string) => !p.startsWith('public.languageSwitcher')
  const hebrew = all.filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path))
  check('D3: no Hebrew left in', hebrew.length === 0, hebrew.slice(0, 3).map((s) => s.path).join(' '))

  // Spanish asks its questions with ¿ and ¡, and has ñ; Italian has neither.
  const spanish = all.filter((s) => (/[¿¡]/.test(s.text) || /ñ/.test(s.text)) && notSwitcher(s.path))
  check('D4: not Spanish wearing a new name', spanish.length === 0, spanish.slice(0, 3).map((s) => s.path).join(' '))

  // Portuguese: the -ção endings and the nasal vowels, none of which are Italian.
  const portuguese = all.filter((s) =>
    (/ç|[ãõ]|\bvocê\b|\bnão\b|\bsão\b|\btambém\b|\bpalavras-chave\b/i.test(s.text)) && notSwitcher(s.path))
  check('D5: nor Portuguese', portuguese.length === 0,
    portuguese.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 50)}`).join(' | '))

  /*
   * D5b: AND NOT FRENCH, which is what this tree was copied from and therefore
   * the nearest trap. The test is on what Italian does not have: the ç and œ
   * ligature (shared with the Portuguese arm above for ç), the French pronouns
   * and a handful of function words that cannot be Italian. `é` is NOT one of
   * them — Italian spells "perché" with it.
   */
  const FRENCH = /œ|(?<!\p{L})(?:vous|votre|vos|nous|notre|êtes|avec|pour|sans|plus\s+de|mots-clés|référencement|gratuit|votre\s+site)(?!\p{L})/iu
  const french = all.filter((s) => FRENCH.test(s.text) && notSwitcher(s.path))
  check('D5b: nor French, which is what the tree was copied from',
    french.length === 0, french.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 50)}`).join(' | '))
  check('D5b-MUT: a French string is caught, and Italian with an accent is not',
    FRENCH.test('Suivez vos positions avec Go Top SEO')
    && !FRENCH.test('Perché le posizioni contano più di tutto')
    && !FRENCH.test('Monitoraggio delle parole chiave e visibilità nei motori AI'))
  check('D5-MUT: a Portuguese string is caught',
    [{ path: 'landing.hero.title', text: 'Acompanhe suas posições' }]
      .filter((s) => /ç|[ãõ]|\bvocê\b/i.test(s.text)).length === 1)

  /**
   * D6: NO PROMISE THE OWNER HAS NOT MADE, in a language he cannot read.
   *
   * His standing rule is no ranking promises and no guaranteed results. The
   * word is allowed under landing.demo, which is the made-up business inside
   * the product illustration quoting ITS own service warranty — the same
   * exception every other language's suite makes.
   *
   * "prima pagina" on its own is NOT a promise: "Parole chiave in prima pagina"
   * is a report column, a measurement of what already happened. The difference
   * between a label and a promise is WHO the sentence is about, so the test is
   * the first page offered TO THE READER, or a guarantee in any words.
   */
  const ours = (p: string) => !p.startsWith('landing.demo')
  const GUARANTEE = /(?<!\p{L})garan(?:tito|tita|titi|tite|tiamo|tisce|zia|zie)(?!\p{L})|(?<!\p{L})numero\s+uno(?!\p{L})/iu
  const FIRST_PAGE = /prima\s+pagina|1ª\s+pagina/i
  const READER = /(?<!\p{L})(?:vi|vostr[oiae]|ti|tuo|tua|tuoi|tue)(?!\p{L})|(?<!\p{L})(?:portiamo|porteremo|faremo|vi\s+portiamo)(?!\p{L})/iu
  const PROMISE = (text: string) => GUARANTEE.test(text) || (FIRST_PAGE.test(text) && READER.test(text))
  const promises = all.filter((s) => PROMISE(s.text) && ours(s.path))
  check('D6: no Italian page promises a ranking or a guaranteed result',
    promises.length === 0, promises.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D6-MUT: a ranking promise is caught, and a report label is not',
    [{ path: 'landing.hero.accent', text: 'La prima pagina di Google, garantita.' },
     { path: 'x.hero', text: 'Vi portiamo in prima pagina su Google.' }]
      .every((s) => PROMISE(s.text))
    && !PROMISE('Parole chiave in prima pagina') && !PROMISE('Posizioni in prima pagina del mese'))

  // THE PRICE IS IN DOLLARS. Abroad is USD through Creem, and no euro figure has
  // ever been set. A € on an Italian page would be a price we do not charge, in
  // the currency an Italian reader would most expect — the worst place for it.
  const euros = all.filter((s) => /€|\bEUR\b|\beuros?\b/i.test(s.text))
  check('D7: no euro price anywhere in the Italian copy',
    euros.length === 0, euros.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D7-MUT: a euro price is caught',
    [{ path: 'pricing.from', text: 'A partire da 79 €' }].filter((s) => /€|\bEUR\b/i.test(s.text)).length === 1)

  /*
   * THE REGISTER. One register throughout: a commercial site that addresses the
   * reader formally on one page and as "tu" on the next reads as two different
   * companies. The unambiguous informal pronouns, plus the possessives before
   * the nouns this product actually addresses the reader about, which is the
   * shape a real slip takes ("collega il tuo sito").
   *
   * JavaScript's \b counts only [A-Za-z0-9_], so an accented letter is a word
   * boundary and \btu\b would fire inside "attuale". The lookarounds below are
   * Unicode letter boundaries; \p{L} needs the u flag.
   */
  const INFORMAL = /(?<!\p{L})(?:tu|tuoi|tue)(?!\p{L})|(?<!\p{L})(?:tuo|tua)\s+(?:account|sito|siti|piano|progetto|progetti|parola|parole|articolo|articoli|negozio|dominio|abbonamento|prova|report|rapporto|rapporti|posizione|posizioni|visibilità|azienda|attività)(?!\p{L})/iu
  const informal = all.filter((s) => INFORMAL.test(s.text) && notSwitcher(s.path))
  check('D8: the copy keeps one register throughout',
    informal.length === 0, informal.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D8-MUT: the informal register is caught, and an accented word is not',
    INFORMAL.test('Collega il tuo sito per iniziare') && INFORMAL.test('Tu decidi quando pubblicare')
    && !INFORMAL.test('Il piano attuale resta invariato')
    && !INFORMAL.test('La situazione attuale del sito'))

  check('D9: the affiliate page states the same two rates as every other language',
    JSON.stringify(AFFILIATES_COPY.it).includes('30') && JSON.stringify(AFFILIATES_COPY.it).includes('40'))
  check('D3-MUT: a Hebrew string outside the switcher fails D3',
    [{ path: 'landing.hero.title', text: 'מעקב מיקומים' }].filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path)).length === 1)
  check('D4-MUT: a Spanish string fails D4', [{ path: 'x', text: '¿Quieres empezar?' }].filter((s) => /[¿¡]/.test(s.text)).length === 1)
}

console.log('\nE) the reader never changes language')
{
  const strings = (value: unknown, path = ''): { path: string; text: string }[] => {
    if (typeof value === 'string') return [{ path, text: value }]
    if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`))
    if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
    return []
  }
  const all = [
    ...strings(getPublicDictionary('it'), 'public'),
    ...strings(pricingIt, 'pricing'),
    ...strings(AFFILIATES_COPY.it, 'affiliates'),
    ...strings(ARTICLES_COPY.it, 'articles'),
  ]
  const OTHER_TREE = /^\/(en|es|pt-BR|fr)(\/|$)/
  const leaks = all.filter((s) => OTHER_TREE.test(s.text))
  check('E1: no Italian string links into another language\'s tree',
    leaks.length === 0, leaks.slice(0, 5).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E1-MUT: a link to the English privacy policy is caught',
    [{ path: 'pricing.faq.link', text: '/en/privacy' }].filter((s) => OTHER_TREE.test(s.text)).length === 1)

  check('E2: the blog index and an article live under /it', articlesIndexHref('it') === '/it/articles')

  // The landing dictionary's paths are unprefixed, so the component's own
  // prefixing cannot double up.
  const landingPaths = strings(landingIt, 'landing').filter((s) => /^\//.test(s.text))
  const doubled = landingPaths.filter((s) => s.text.startsWith('/it'))
  check('E3: the landing dictionary stores unprefixed paths, so nothing becomes /it/it',
    doubled.length === 0, doubled.slice(0, 4).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E3-MUT: a prefixed landing path is caught',
    [{ path: 'landing.nav', text: '/it/pricing' }].filter((s) => s.text.startsWith('/it')).length === 1)

  const wasIt = process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED = 'true'
    check('E4: switching to Italian keeps the page', counterpartPath('/pricing', 'he', 'it') === '/it/pricing'
      && counterpartPath('/es/pricing', 'es', 'it') === '/it/pricing'
      && counterpartPath('/fr/about', 'fr', 'it') === '/it/about')
    check('E5: and the Italian home page is the bare prefix', counterpartPath('/', 'he', 'it') === '/it')
    check('E6: a single article switches to the Italian INDEX, not to a slug that does not exist',
      counterpartPath('/articles/some-hebrew-slug', 'he', 'it') === '/it/articles')
    check('E7: and switching away from Italian works the same way',
      counterpartPath('/it/pricing', 'it', 'he') === '/pricing' && counterpartPath('/it', 'it', 'en') === '/en')
  } finally {
    process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED = wasIt
  }

  const advertised = ['', '/pricing', '/about', '/free-check', '/articles', '/sitemap', '/affiliates']
  const missing = advertised.filter((p) => !existsSync(join(ROOT, `app/(public)/it${p}/page.tsx`)))
  check('E8: every path the sitemap advertises has an Italian page', missing.length === 0, missing.join(' '))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
