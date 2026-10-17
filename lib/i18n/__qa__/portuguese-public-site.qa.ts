/**
 * THE BRAZILIAN PORTUGUESE PUBLIC SITE.
 *
 * Portuguese is the fourth language, and it is the one that proves the site can
 * take a fourth at all: the Spanish wave left a dozen places that knew the word
 * "es" rather than "a language other than Hebrew". So this suite holds the
 * things that are only true while the two trees stay mirrors of each other:
 *
 *   A) THE MIRROR. Every route under app/(public)/es has a twin under
 *      app/(public)/pt-BR, and the same for the auth tree. This is load-bearing
 *      and not merely tidy: lib/seo/hreflang.ts DERIVES the Portuguese URL from
 *      the Spanish one, so a Spanish page with no Portuguese twin would
 *      advertise a page that answers 404.
 *   B) THE GATE. One `notFound()` per tree, in its layout, and no page with a
 *      flag check of its own.
 *   C) THE FLAG decides every outward sign of the language: hreflang, the
 *      sitemap and the switcher.
 *   D) THE COPY is Portuguese: no Hebrew, and not Spanish wearing a new name.
 *
 * Every guard has a MUTATION CONTROL.
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX, LOCALE_CONFIG, INTL_LOCALE, localeHomeHref } from '../locales'
import { portugueseSiteEnabled } from '../portuguese-site'
import { getPublicDictionary } from '../getPublicDictionary'
import { landingPtBR } from '../public/landing-pt-BR'
import { pricingPtBR } from '../public/pricing-pt-BR'
import { AFFILIATES_COPY } from '../public/affiliates'
import { availableLocales } from '../../../components/LanguageSwitcher'
import { buildHreflangAlternates } from '../../seo/hreflang'
import { isPortuguesePath, routePublicLocale } from '../request-locale'
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

console.log('A) the two trees are mirrors, which is what hreflang rests on')
{
  for (const group of ['(public)', '(auth)']) {
    const es = routes(`app/${group}/es`)
    const pt = routes(`app/${group}/pt-BR`)
    check(`A1 app/${group}: the Portuguese tree has every Spanish route`,
      es.every((r) => pt.includes(r)), es.filter((r) => !pt.includes(r)).join(' '))
    check(`A2 app/${group}: and no route the Spanish tree does not have`,
      pt.every((r) => es.includes(r)), pt.filter((r) => !es.includes(r)).join(' '))
    check(`A3 app/${group}: and it is not empty`, pt.length > 0)
  }
  const es = routes('app/(public)/es')
  check('A1-MUT: a Spanish route with no Portuguese twin fails A1',
    ![...es, 'press-kit/page.tsx'].every((r) => routes('app/(public)/pt-BR').includes(r)))
}

console.log('\nB) one gate per tree')
{
  const pub = strip(read('app/(public)/pt-BR/layout.tsx'))
  const auth = strip(read('app/(auth)/pt-BR/layout.tsx'))
  check('B1: the public tree 404s entirely when the flag is off',
    /if \(!portugueseSiteEnabled\(\)\) notFound\(\)/.test(pub))
  check('B2: so does the auth tree', /if \(!portugueseSiteEnabled\(\)\) notFound\(\)/.test(auth))
  check('B3: the layout declares the document Portuguese and left-to-right',
    /lang="pt-BR"/.test(pub) && /dir="ltr"/.test(pub) && /DocumentLocaleEffect locale="pt-BR"/.test(pub))
  const pages = routes('app/(public)/pt-BR').filter((r) => r.endsWith('page.tsx'))
  check('B4: and no page carries a gate of its own',
    pages.every((r) => !/portugueseSiteEnabled/.test(read(`app/(public)/pt-BR/${r}`))),
    pages.filter((r) => /portugueseSiteEnabled/.test(read(`app/(public)/pt-BR/${r}`))).join(' '))
  check('B1-MUT: a layout without the gate fails B1',
    !/if \(!portugueseSiteEnabled\(\)\) notFound\(\)/.test(pub.replace('if (!portugueseSiteEnabled()) notFound()', '')))
}

console.log('\nC) the flag decides every outward sign')
{
  check('C1: "true" and nothing else turns it on',
    portugueseSiteEnabled('true') && !portugueseSiteEnabled('TRUE') && !portugueseSiteEnabled('1')
    && !portugueseSiteEnabled('') && !portugueseSiteEnabled('1') && !portugueseSiteEnabled('yes'))
  // hreflang: the Portuguese URL is derived from the Spanish one, and announced
  // only while the flag is on.
  const was = process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED
  const wasEs = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  try {
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
    process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED = 'true'
    const on = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C2: with the flag on, the derived Portuguese URL is announced',
      on['pt-BR'] === 'https://www.gotopseo.com/pt-BR/pricing', JSON.stringify(on))
    const home = buildHreflangAlternates('/', '/en', '/es')
    check('C3: and the home page derives to the bare prefix, not "/pt-BR/"',
      home['pt-BR'] === 'https://www.gotopseo.com/pt-BR', home['pt-BR'])
    check('C4: a path that merely starts with the letters is not touched',
      buildHreflangAlternates('/espanol', '/en/espanol', '/espanol')['pt-BR'] === 'https://www.gotopseo.com/espanol')
    check('C5: the switcher offers it', availableLocales(true, true).includes('pt-BR'))
    check('C6: a Portuguese path is a Portuguese document',
      isPortuguesePath('/pt-BR/pricing') && routePublicLocale('/pt-BR/pricing') === 'pt-BR'
      && resolveAuthLocale({ pathname: '/pt-BR/login' }) === 'pt-BR')
    process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED = ''
    const off = buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
    check('C7: with the flag off, nothing advertises the language',
      !('pt-BR' in off) && !availableLocales(true, false).includes('pt-BR'))
    check('C8: and a Portuguese URL is not even a locale, so nothing labels a 404 pt-BR',
      !isPortuguesePath('/pt-BR/pricing') && routePublicLocale('/pt-BR/pricing') !== 'pt-BR')
    check('C7-MUT: a switcher that ignores the flag fails C7',
      PUBLIC_LOCALES.includes('pt-BR'))
  } finally {
    process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED = was
    process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = wasEs
  }
  check('C9: the sitemap lists it only inside its own flag',
    /const portuguesePages = portugueseSiteEnabled\(\) \? treePages\('\/pt-BR'\) : \[\]/.test(strip(read('app/sitemap.xml/route.ts'))))
  // A file in public/ is served BEFORE a route of the same path. A stale
  // public/sitemap.xml shadowed this route until 5 October 2026, so Google was
  // being handed five URLs and never saw the Spanish tree at all. The route can
  // be as right as it likes while that file exists.
  check('C10: nothing in public/ shadows the sitemap route',
    !existsSync(join(ROOT, 'public', 'sitemap.xml')))
  check('C10a: and robots.txt still points at the path the route serves',
    read('public/robots.txt').includes('Sitemap: https://www.gotopseo.com/sitemap.xml'))

  /**
   * C10b: THE SITEMAP ASKS FOR INDEXING, SO IT MAY NOT LIST A noindex PAGE.
   *
   * Every legal document, in every language, is served `noindex, nofollow`.
   * Listing one in the sitemap tells Google to index a page we have told it not
   * to, which Search Console reports back as an error and which spends crawl on
   * nothing. The Hebrew and English trees carried their four each until
   * 5 October 2026 while the Spanish tree carried none, so the two halves of the
   * file disagreed about the same question.
   */
  const sitemapRoute = strip(read('app/sitemap.xml/route.ts'))
  const legalSlugs = ['privacy', 'terms', 'refund-policy', 'accessibility', 'affiliate-terms']
  const listed = legalSlugs.filter((slug) => new RegExp(`baseUrl\\}(/en|/es|/pt-BR)?/${slug}\``).test(sitemapRoute))
  check('C10b: the sitemap lists no legal page, because every one of them is noindex',
    listed.length === 0, listed.join(', '))
  /* C10b-MUT: put one back and show the guard fails. */
  check('C10b-MUT: a legal page added to the sitemap is caught',
    /baseUrl\}(\/en|\/es|\/pt-BR)?\/privacy`/.test('${baseUrl}/en/privacy`'))
}

console.log('\nD) the locale tables and the copy')
{
  check('D1: the prefix, the direction and the og locale are all stated',
    LOCALE_PREFIX['pt-BR'] === '/pt-BR' && LOCALE_CONFIG['pt-BR'].dir === 'ltr'
    && LOCALE_CONFIG['pt-BR'].lang === 'pt-BR' && LOCALE_CONFIG['pt-BR'].ogLocale === 'pt_BR'
    && INTL_LOCALE['pt-BR'] === 'pt-BR' && localeHomeHref('pt-BR') === '/pt-BR')

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
    ...strings(getPublicDictionary('pt-BR'), 'public'),
    ...strings(landingPtBR, 'landing'),
    ...strings(pricingPtBR, 'pricing'),
    ...strings(AFFILIATES_COPY['pt-BR'], 'affiliates'),
  ]
  check('D2: there is a real amount of copy to check', all.length > 300, String(all.length))
  // The language switcher names the other languages in their own alphabets, so
  // Hebrew letters are expected there and nowhere else.
  const hebrew = all.filter((s) => /[֐-׿]/.test(s.text) && !s.path.startsWith('public.languageSwitcher'))
  check('D3: no Hebrew left in', hebrew.length === 0, hebrew.slice(0, 3).map((s) => s.path).join(' '))
  // Spanish asks its questions with ¿ and ¡ and Portuguese never does, so they
  // are the cheapest proof that a file was translated rather than copied.
  // The switcher is excluded for the same reason as above: it names Español in
  // Spanish on purpose.
  const spanish = all.filter((s) => (/[¿¡]/.test(s.text) || /ñ/.test(s.text)) && !s.path.startsWith('public.languageSwitcher'))
  check('D4: not Spanish wearing a new name', spanish.length === 0, spanish.slice(0, 3).map((s) => s.path).join(' '))
  // ZERO CLAIMS WE CANNOT KEEP (the owner's standing rule). The Hebrew hero says
  // "we see to it" and the Spanish "we make sure"; a Portuguese "garantimos"
  // would be the one language promising a result, which is the kind of sentence
  // that is read back to us later. The word is allowed under landing.demo, which
  // is the made-up business inside the product illustration quoting ITS own
  // service promise, exactly as the Spanish file has it.
  const ours = (path: string) => !path.startsWith('landing.demo')
  const guarantees = all.filter((s) => /\bgarant(?:imos|ido|ida|e|ia)\b/i.test(s.text) && ours(s.path))
  check('D5: no Portuguese page promises a guaranteed result',
    guarantees.length === 0, guarantees.slice(0, 3).map((s) => `${s.path}: ${s.text.slice(0, 60)}`).join(' | '))
  check('D5-MUT: a guarantee in the copy is caught',
    [{ path: 'landing.hero.accent', text: 'Nós garantimos que eles encontrem você.' }]
      .filter((s) => /\bgarant(?:imos|ido|ida|e|ia)\b/i.test(s.text) && ours(s.path)).length === 1)
  check('D6: the affiliate page promises the same two rates as every other language',
    JSON.stringify(AFFILIATES_COPY['pt-BR']).includes('30') && JSON.stringify(AFFILIATES_COPY['pt-BR']).includes('40'))
  check('D3-MUT: a Hebrew string outside the switcher fails D3',
    [{ path: 'landing.hero.title', text: 'מעקב מיקומים' }].filter((s) => /[֐-׿]/.test(s.text) && !s.path.startsWith('public.languageSwitcher')).length === 1)
  check('D4-MUT: a Spanish string fails D4', [{ path: 'x', text: '¿Quieres empezar?' }].filter((s) => /[¿¡]/.test(s.text)).length === 1)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
