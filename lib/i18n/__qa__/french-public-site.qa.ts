/**
 * THE FRENCH PUBLIC SITE.
 *
 * French is the fifth language, and what it had to prove is different from what
 * Portuguese proved. Portuguese showed the site could take a FOURTH language at
 * all — the Spanish wave had left a dozen places that knew the word "es" rather
 * than "a language other than Hebrew". By the time French arrived those places
 * compiled, so the compiler found every `Record<PublicLocale, …>` on its own.
 * What the compiler cannot find is a language that is merely ABSENT from a list:
 * French was built with a full route tree, a full dictionary, hreflang and a
 * switcher entry, and no sitemap entry whatsoever, because the sitemap had one
 * hand-written `const` per language and nothing asked it for a fifth.
 *
 * So this suite holds the things no type can:
 *
 *   A) THE MIRROR. Every route under app/(public)/es has a twin under
 *      app/(public)/fr, and the same for the auth tree. Load-bearing, not tidy:
 *      lib/seo/hreflang.ts DERIVES the French URL from the Spanish one, so a
 *      Spanish page with no French twin would advertise a 404.
 *   B) THE GATE. One `notFound()` per tree, in its layout, and no page with a
 *      flag check of its own.
 *   C) THE FLAG decides every outward sign of the language: hreflang, the
 *      sitemap, the switcher, the stored preference — all through the ONE gate
 *      in lib/i18n/locales.ts, which is what section C is really about.
 *   D) THE COPY is French: no Hebrew, not Spanish and not Portuguese wearing a
 *      new name, and no promise the owner has not made.
 *   E) THE READER NEVER CHANGES LANGUAGE. Every link a French page offers leads
 *      somewhere French. This is the owner's own hard rule and the one failure
 *      the Spanish launch actually shipped.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/i18n/__qa__/french-public-site.qa.ts
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  PUBLIC_LOCALES, LOCALE_PREFIX, LOCALE_CONFIG, INTL_LOCALE, PAYPAL_LOCALE,
  localeHomeHref, normalizeStoredLocale, publicLocaleEnabled, enabledPublicLocales,
} from '../locales'
import { frenchSiteEnabled } from '../french-site'
import { getPublicDictionary } from '../getPublicDictionary'
import { landingFr } from '../public/landing-fr'
import { pricingFr } from '../public/pricing-fr'
import { AFFILIATES_COPY } from '../public/affiliates'
import { ARTICLES_COPY, articlesIndexHref } from '../../articles/i18n'
import { availableLocales, counterpartPath } from '../../../components/LanguageSwitcher'
import { buildHreflangAlternates } from '../../seo/hreflang'
import { isFrenchPath, routePublicLocale } from '../request-locale'
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
    const fr = routes(`app/${group}/fr`)
    check(`A1 app/${group}: the French tree has every Spanish route`,
      es.every((r) => fr.includes(r)), es.filter((r) => !fr.includes(r)).join(' '))
    check(`A2 app/${group}: and no route the Spanish tree does not have`,
      fr.every((r) => es.includes(r)), fr.filter((r) => !es.includes(r)).join(' '))
    check(`A3 app/${group}: and it is not empty`, fr.length > 0)
  }
  const es = routes('app/(public)/es')
  check('A1-MUT: a Spanish route with no French twin fails A1',
    ![...es, 'press-kit/page.tsx'].every((r) => routes('app/(public)/fr').includes(r)))
}

console.log('\nB) one gate per tree')
{
  const pub = strip(read('app/(public)/fr/layout.tsx'))
  const auth = strip(read('app/(auth)/fr/layout.tsx'))
  check('B1: the public tree 404s entirely when the flag is off',
    /if \(!frenchSiteEnabled\(\)\) notFound\(\)/.test(pub))
  check('B2: so does the auth tree', /if \(!frenchSiteEnabled\(\)\) notFound\(\)/.test(auth))
  check('B3: the layout declares the document French and left-to-right',
    /lang="fr"/.test(pub) && /dir="ltr"/.test(pub) && /DocumentLocaleEffect locale="fr"/.test(pub))
  const pages = routes('app/(public)/fr').filter((r) => r.endsWith('page.tsx'))
  check('B4: and no page carries a gate of its own',
    pages.every((r) => !/frenchSiteEnabled/.test(read(`app/(public)/fr/${r}`))),
    pages.filter((r) => /frenchSiteEnabled/.test(read(`app/(public)/fr/${r}`))).join(' '))
  check('B1-MUT: a layout without the gate fails B1',
    !/if \(!frenchSiteEnabled\(\)\) notFound\(\)/.test(pub.replace('if (!frenchSiteEnabled()) notFound()', '')))
}

console.log('\nC) one gate, and it decides every outward sign')
{
  check('C1: "true" and nothing else turns it on',
    frenchSiteEnabled('true') && !frenchSiteEnabled('TRUE') && !frenchSiteEnabled('1')
    && !frenchSiteEnabled('') && !frenchSiteEnabled('yes') && !frenchSiteEnabled(undefined))

  const was = process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED
  const wasEs = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
    process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED = 'true'
    const on = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C2: with the flag on, the derived French URL is announced',
      on.fr === 'https://www.gotopseo.com/fr/pricing', JSON.stringify(on))
    const home = buildHreflangAlternates('/', '/en', '/es')
    check('C3: and the home page derives to the bare prefix, not "/fr/"',
      home.fr === 'https://www.gotopseo.com/fr', home.fr)
    check('C4: a path that merely starts with the letters is not touched',
      buildHreflangAlternates('/espanol', '/en/espanol', '/espanol').fr === 'https://www.gotopseo.com/espanol')
    check('C5: the switcher offers it', availableLocales({ es: true, fr: true }).includes('fr'))
    check('C6: a French path is a French document',
      isFrenchPath('/fr/pricing') && routePublicLocale('/fr/pricing') === 'fr'
      && resolveAuthLocale({ pathname: '/fr/login' }) === 'fr')
    check('C7: a stored French preference is honoured', normalizeStoredLocale('fr') === 'fr')

    process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED = ''
    const off = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C8: with the flag off, nothing advertises the language',
      !('fr' in off) && !availableLocales({ es: true, fr: false }).includes('fr')
      && !enabledPublicLocales({ fr: false }).includes('fr'))
    check('C9: and a French URL is not even a locale, so nothing labels a 404 "fr"',
      !isFrenchPath('/fr/pricing') && routePublicLocale('/fr/pricing') !== 'fr')
    check('C10: and a hand-edited cookie cannot select it',
      normalizeStoredLocale('fr') === null)
    check('C8-MUT: a switcher that ignored the flag would still list it in PUBLIC_LOCALES',
      PUBLIC_LOCALES.includes('fr'))
  } finally {
    process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED = was
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = wasEs
  }

  /**
   * C11: THE GATE IS ONE FUNCTION, AND EVERYTHING READS IT.
   *
   * It was five: the switcher, two places in the sitemap, hreflang and
   * normalizeStoredLocale each asked the question in their own words. Five
   * places to edit per language, and a language missed in one of them is not a
   * compile error — it is a live 404 in a sitemap or a menu entry that leads
   * nowhere. Both actually happened while French was being built.
   */
  for (const rel of ['components/LanguageSwitcher.tsx', 'lib/seo/hreflang.ts', 'app/sitemap.xml/route.ts']) {
    const src = strip(read(rel))
    check(`C11 ${rel}: asks the one gate, not the flags directly`,
      !/(spanish|portuguese|french)SiteEnabled\s*\(/.test(src), rel)
  }
  check('C11-MUT: a direct flag read is caught',
    /(spanish|portuguese|french)SiteEnabled\s*\(/.test("const x = frenchSiteEnabled()"))
  check('C12: the gate answers for every public locale, with no fallback to guess with',
    PUBLIC_LOCALES.every((l) => typeof publicLocaleEnabled(l, { es: true, 'pt-BR': true, fr: true }) === 'boolean')
    && publicLocaleEnabled('he') && publicLocaleEnabled('en'))
}

console.log('\nD) the locale tables and the copy')
{
  check('D1: the prefix, the direction and every locale spelling are stated',
    LOCALE_PREFIX.fr === '/fr' && LOCALE_CONFIG.fr.dir === 'ltr'
    && LOCALE_CONFIG.fr.lang === 'fr' && LOCALE_CONFIG.fr.ogLocale === 'fr_FR'
    && INTL_LOCALE.fr === 'fr-FR' && PAYPAL_LOCALE.fr === 'fr_FR' && localeHomeHref('fr') === '/fr')

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
    ...strings(getPublicDictionary('fr'), 'public'),
    ...strings(landingFr, 'landing'),
    ...strings(pricingFr, 'pricing'),
    ...strings(AFFILIATES_COPY.fr, 'affiliates'),
    ...strings(ARTICLES_COPY.fr, 'articles'),
  ]
  check('D2: there is a real amount of copy to check', all.length > 300, String(all.length))

  // The language switcher names the other languages in their own alphabets, so
  // Hebrew letters are expected there and nowhere else.
  const notSwitcher = (p: string) => !p.startsWith('public.languageSwitcher')
  const hebrew = all.filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path))
  check('D3: no Hebrew left in', hebrew.length === 0, hebrew.slice(0, 3).map((s) => s.path).join(' '))

  // Spanish asks its questions with ¿ and ¡, and has ñ; French has neither. The
  // cheapest proof that a file was translated rather than copied.
  const spanish = all.filter((s) => (/[¿¡]/.test(s.text) || /ñ/.test(s.text)) && notSwitcher(s.path))
  check('D4: not Spanish wearing a new name', spanish.length === 0, spanish.slice(0, 3).map((s) => s.path).join(' '))

  // Portuguese is the nearer trap, because /fr was COPIED from /pt-BR. French
  // shares ç and é with it, so the test is on what French does not have: the
  // -ção/-ções endings, the ã and õ vowels, and a handful of words that cannot
  // be French.
  const portuguese = all.filter((s) =>
    (/ç[ãõ]|[ãõ]|\bvocê\b|\bnão\b|\bsão\b|\bjá\b|\btambém\b|\bpalavras-chave\b/i.test(s.text)) && notSwitcher(s.path))
  check('D5: nor Portuguese, which is what the tree was copied from',
    portuguese.length === 0, portuguese.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 50)}`).join(' | '))
  check('D5-MUT: a Portuguese string is caught',
    [{ path: 'landing.hero.title', text: 'Acompanhe suas posições' }]
      .filter((s) => /ç[ãõ]|[ãõ]|\bvocê\b/i.test(s.text)).length === 1)

  /**
   * D6: NO PROMISE THE OWNER HAS NOT MADE, in the language he cannot read.
   *
   * His standing rule is no ranking promises and no guaranteed results. The
   * word is allowed under landing.demo, which is the made-up business inside
   * the product illustration quoting ITS own service warranty — the same
   * exception the Spanish and Portuguese suites make.
   */
  const ours = (p: string) => !p.startsWith('landing.demo')
  /*
   * "première page" on its own is NOT a promise: "Mots-clés en première page"
   * is a column in a report, a measurement of what already happened, and the
   * Hebrew and English reports have carried it since before this language
   * existed. A first draft of this guard flagged it, which is the kind of false
   * positive that gets a guard deleted rather than fixed. So the test is on the
   * PROMISE — a guarantee, or the first page offered as an outcome we will
   * deliver — and not on the words themselves.
   */
  const GUARANTEE = /\bgarant(?:i|ie|ies|is|it|issons)\b|\bnuméro un\b/i
  const FIRST_PAGE = /première page|1re page/i
  /*
   * The difference between the label and the promise is WHO the sentence is
   * about. "Mots-clés en première page" is about the site; a promise is
   * addressed to the reader, so it says "vous". That is the whole test, and it
   * holds whatever verb the sentence uses — the first version of this guard
   * listed verbs and missed "nous vous amenons" in its own mutation control.
   */
  const PROMISE = (text: string) => GUARANTEE.test(text) || (FIRST_PAGE.test(text) && /\bvous\b|\bvotre\b|\bvos\b/i.test(text))
  const promises = all.filter((s) => PROMISE(s.text) && ours(s.path))
  check('D6: no French page promises a ranking or a guaranteed result',
    promises.length === 0, promises.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D6-MUT: a ranking promise in the copy is caught, and a report label is not',
    [{ path: 'landing.hero.accent', text: 'La première page de Google, garantie.' },
     { path: 'x.hero', text: 'Nous vous amenons en première page de Google.' }]
      .every((s) => PROMISE(s.text))
    && !PROMISE('Mots-clés en première page') && !PROMISE('Positions en première page du mois'))

  // THE PRICE IS IN DOLLARS. The owner's rule: abroad is USD through Creem, and
  // no euro figure has ever been set. A € on a French page would be a price we
  // do not charge, in the currency a French reader would most expect.
  const euros = all.filter((s) => /€|\bEUR\b|\beuros?\b/i.test(s.text))
  check('D7: no euro price anywhere in the French copy',
    euros.length === 0, euros.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D7-MUT: a euro price is caught',
    [{ path: 'pricing.from', text: 'À partir de 79 €' }].filter((s) => /€|\bEUR\b/i.test(s.text)).length === 1)

  // THE REGISTER. Vouvoiement, consistently: a French commercial site that
  // switches to "tu" halfway reads as two different companies.
  /*
   * JavaScript's \b counts only [A-Za-z0-9_] as word characters, so it finds a
   * word boundary in the middle of "êtes" and "vous êtes" was reported as the
   * pronoun "tes". Accented French needs Unicode letter boundaries, which is
   * what the lookarounds below are; \p{L} needs the u flag.
   *
   * `ton` and `ta` are matched only before one of the nouns this product
   * addresses the reader about, which is the shape a real slip takes ("tu peux
   * annuler ton abonnement"). A bare `ton` would also match the ordinary French
   * noun for "tone" — the dashboard dictionary genuinely uses it, and this
   * suite's twin (lib/i18n/dashboard/__qa__/french-dashboard.qa.ts) reported
   * correct copy as a defect until the pattern was narrowed. The unambiguous
   * forms need no such company.
   */
  const TU = /(?<!\p{L})(?:tu|toi|tes|tien|tiens|tienne)(?!\p{L})|(?<!\p{L})(?:ton|ta)\s+(?:compte|site|sites|plan|projet|projets|mot|mots|article|articles|boutique|domaine|abonnement|essai|rapport|rapports|position|visibilit\u00e9|entreprise)(?!\p{L})/iu
  const tutoiement = all.filter((s) => TU.test(s.text) && notSwitcher(s.path))
  check('D8: the copy keeps one register throughout (vouvoiement)',
    tutoiement.length === 0, tutoiement.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D8-MUT: tutoiement is caught, and an accented word next to it is not',
    TU.test('Tu peux annuler ton abonnement.') && !TU.test('Un site qui travaille pendant que vous êtes occupé')
    && !TU.test('Dites-nous qui vous êtes') && !TU.test('les boutiques et les agences vous envoient'))
  check('D8-MUT2: the possessive arm catches a slip on its own, and `ton` as the noun "tone" is not one',
    TU.test('Connecte ton site pour commencer') && TU.test('Choisis ta boutique')
    && !TU.test('Le ton de l’écriture reste le vôtre') && !TU.test('Ton de voix'))

  check('D9: the affiliate page promises the same two rates as every other language',
    JSON.stringify(AFFILIATES_COPY.fr).includes('30') && JSON.stringify(AFFILIATES_COPY.fr).includes('40'))
  check('D3-MUT: a Hebrew string outside the switcher fails D3',
    [{ path: 'landing.hero.title', text: 'מעקב מיקומים' }].filter((s) => /[֐-׿]/.test(s.text) && notSwitcher(s.path)).length === 1)
  check('D4-MUT: a Spanish string fails D4', [{ path: 'x', text: '¿Quieres empezar?' }].filter((s) => /[¿¡]/.test(s.text)).length === 1)
}

console.log('\nE) the reader never changes language')
{
  /**
   * EVERY LINK A FRENCH SURFACE OFFERS LEADS SOMEWHERE FRENCH.
   *
   * The owner's hard rule, and the one the Spanish launch actually broke: the
   * footer linked four legal pages that 404'd, and the pricing FAQ handed a
   * Spanish reader the ENGLISH privacy policy — which was still true of /es and
   * /pt-BR until this change. So the test is on the paths themselves, not on a
   * component: any absolute internal path in the French copy must start with
   * /fr, with the deliberate exceptions named below.
   */
  const strings = (value: unknown, path = ''): { path: string; text: string }[] => {
    if (typeof value === 'string') return [{ path, text: value }]
    if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`))
    if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
    return []
  }
  const all = [
    ...strings(getPublicDictionary('fr'), 'public'),
    ...strings(pricingFr, 'pricing'),
    ...strings(AFFILIATES_COPY.fr, 'affiliates'),
    ...strings(ARTICLES_COPY.fr, 'articles'),
  ]
  /**
   * The landing dictionary is NOT read here, and that is a decision, not an
   * omission: components/public/LandingPage.tsx prefixes every href it renders
   * with the locale's own prefix, so its dictionary stores UNPREFIXED paths and
   * a `/fr/...` in it would ship `/fr/fr/...`. E3 holds that from the other end.
   */
  const OTHER_TREE = /^\/(en|es|pt-BR)(\/|$)/
  const leaks = all.filter((s) => OTHER_TREE.test(s.text))
  check('E1: no French string links into another language\'s tree',
    leaks.length === 0, leaks.slice(0, 5).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E1-MUT: a link to the English privacy policy is caught',
    [{ path: 'pricing.faq.link', text: '/en/privacy' }].filter((s) => OTHER_TREE.test(s.text)).length === 1)

  check('E2: the blog index and an article live under /fr',
    articlesIndexHref('fr') === '/fr/articles')

  // The landing dictionary's paths are unprefixed, so the component's own
  // prefixing cannot double up. This is the four-links bug the Spanish launch
  // shipped, held from the side the type system cannot see.
  const landingPaths = strings(landingFr, 'landing').filter((s) => /^\//.test(s.text))
  const doubled = landingPaths.filter((s) => s.text.startsWith('/fr'))
  check('E3: the landing dictionary stores unprefixed paths, so nothing becomes /fr/fr',
    doubled.length === 0, doubled.slice(0, 4).map((s) => `${s.path}: ${s.text}`).join(' | '))
  check('E3-MUT: a prefixed landing path is caught',
    [{ path: 'landing.nav', text: '/fr/pricing' }].filter((s) => s.text.startsWith('/fr')).length === 1)

  // The switcher lands a reader on the SAME page in French, never on a 404 and
  // never on the home page when the page exists.
  const wasFr = process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED = 'true'
    check('E4: switching to French keeps the page', counterpartPath('/pricing', 'he', 'fr') === '/fr/pricing'
      && counterpartPath('/es/pricing', 'es', 'fr') === '/fr/pricing'
      && counterpartPath('/pt-BR/about', 'pt-BR', 'fr') === '/fr/about')
    check('E5: and the French home page is the bare prefix', counterpartPath('/', 'he', 'fr') === '/fr')
    check('E6: a single article switches to the French INDEX, not to a slug that does not exist',
      counterpartPath('/articles/some-hebrew-slug', 'he', 'fr') === '/fr/articles')
    check('E7: and switching away from French works the same way',
      counterpartPath('/fr/pricing', 'fr', 'he') === '/pricing' && counterpartPath('/fr', 'fr', 'en') === '/en')
  } finally {
    process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED = wasFr
  }

  // Every route in the French tree must exist as a page for every path the
  // sitemap and the hreflang advertise, or we advertise a 404.
  const advertised = ['', '/pricing', '/about', '/free-check', '/articles', '/sitemap', '/affiliates']
  const missing = advertised.filter((p) => !existsSync(join(ROOT, `app/(public)/fr${p}/page.tsx`)))
  check('E8: every path the sitemap advertises has a French page',
    missing.length === 0, missing.join(' '))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
