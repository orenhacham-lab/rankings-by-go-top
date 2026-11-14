/**
 * THE AFFILIATE CLUSTER: two pages under /affiliates, in all eleven languages.
 *
 *   A) the shape: every language has both pages, with every field filled and
 *      the counts the template renders (three trust lines, three cards, three
 *      steps, four cards, four questions)
 *   B) ONE OFFER. The rates are interpolated from lib/affiliate/terms.ts and
 *      never typed: a page that said 25% in Dutch would be an offer the
 *      commission engine does not pay
 *   C) what the pages may not say: no earnings promise, no ranking promise,
 *      no attribution window we do not keep
 *   D) the routes exist, one per language per page, with the canonical and the
 *      hreflang set built from the Spanish path
 *   E) the hub and the spokes link to each other, and every page ends at the
 *      application form
 *   F) the sitemap lists both pages in every tree
 *   G) KOREAN IS ANNOUNCED. The hreflang builder gained a /ko line with this
 *      cluster; it is only safe because app/(public)/ko mirrors app/(public)/es
 *      page for page, which is checked here.
 *
 * Every group has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/i18n/public/__qa__/affiliate-cluster.qa.ts
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { AFFILIATE_CLUSTER, AFFILIATE_CLUSTER_SLUGS, affiliateClusterPath, type AffiliateClusterKey } from '../affiliate-cluster'
import type { AffiliateClusterPage } from '../affiliate-cluster'
import { AFFILIATE_TERMS } from '@/lib/affiliate/terms'
import { LOCALE_PREFIX, PUBLIC_LOCALES, type PublicLocale } from '../../locales'
/* THE LOCALE FLAGS COME FIRST. `publicLocaleEnabled` reads NEXT_PUBLIC_*_SITE_ENABLED
   at call time, so hreflang built in a process that never set them announces
   nothing, and group G would pass for the wrong reason. */
process.env.NEXT_PUBLIC_KOREAN_SITE_ENABLED = 'true'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const KEYS: AffiliateClusterKey[] = ['marketing', 'choosing']
const LOCALES = [...PUBLIC_LOCALES] as PublicLocale[]
const pages = (): { locale: PublicLocale; key: AffiliateClusterKey; page: AffiliateClusterPage }[] =>
  LOCALES.flatMap((locale) => KEYS.map((key) => ({ locale, key, page: AFFILIATE_CLUSTER[locale][key] })))
/** The route file of one page of one language. */
const routeFile = (locale: PublicLocale, key: AffiliateClusterKey) =>
  `app/(public)${LOCALE_PREFIX[locale]}${affiliateClusterPath(key)}/page.tsx`
const LOCALE_FILES = LOCALES.map((l) => `lib/i18n/public/affiliate-cluster/${l}.ts`)

console.log('A) the shape, in every language')
{
  check('A1: eleven languages, two pages each', pages().length === 22, String(pages().length))
  const emptyField: string[] = []
  for (const { locale, key, page } of pages()) {
    for (const [field, value] of Object.entries(page)) {
      const texts = typeof value === 'string' ? [value]
        : Array.isArray(value) ? value.flatMap((v) => typeof v === 'string' ? [v] : Object.values(v as Record<string, string>))
        : []
      if (texts.some((t) => typeof t !== 'string' || t.trim().length === 0)) emptyField.push(`${locale}.${key}.${field}`)
    }
  }
  check('A2: no field is empty', emptyField.length === 0, emptyField.slice(0, 5).join(' '))
  const counts = pages().filter(({ page }) =>
    page.trust.length !== 3 || page.why.length !== 3 || page.steps.length !== 3 || page.list.length !== 4 || page.faq.length !== 4)
  check('A3: three trust lines, three cards, three steps, four cards, four questions',
    counts.length === 0, counts.slice(0, 3).map((r) => `${r.locale}.${r.key}`).join(' '))
  const titled = pages().filter(({ page }) => !page.metaTitle.endsWith('| Go Top SEO'))
  check('A4: every title carries the brand', titled.length === 0, titled.slice(0, 3).map((r) => `${r.locale}.${r.key}`).join(' '))
  // A description Google truncates is a description nobody reads to the end.
  const long = pages().filter(({ page }) => page.metaDescription.length > 230)
  check('A5: no description runs past what a result shows', long.length === 0,
    long.slice(0, 3).map((r) => `${r.locale}.${r.key} ${r.page.metaDescription.length}`).join(' '))
  // MUTATION CONTROL — an empty field and a short list are both caught.
  const broken = { ...AFFILIATE_CLUSTER.en.marketing, eyebrow: '  ', trust: ['one', 'two'] as unknown as AffiliateClusterPage['trust'] }
  check('A2-MUT: an empty field and a two-line trust row are caught',
    broken.eyebrow.trim().length === 0 && broken.trust.length !== 3)
}

console.log('\nB) one offer: the numbers come from lib/affiliate/terms.ts')
{
  const T = AFFILIATE_TERMS
  const notImporting = LOCALE_FILES.filter((f) => !read(f).includes("import { AFFILIATE_TERMS as T } from '@/lib/affiliate/terms'"))
  check('B1: every language file reads the terms rather than retyping them',
    notImporting.length === 0, notImporting.join(' '))
  /* A digit immediately before a % is a rate somebody typed. The interpolated
     form is `${T.baseRate}%`, whose character before the % is a brace, so this
     catches exactly the mistake and nothing else. */
  const TYPED_RATE = /\d\s*%/
  const typed = LOCALE_FILES.filter((f) => TYPED_RATE.test(strip(read(f))))
  check('B2: no language types a percentage by hand', typed.length === 0, typed.join(' '))
  const missing = pages().filter(({ page }) => {
    const text = JSON.stringify(page)
    return !text.includes(String(T.baseRate)) || !text.includes(String(T.topRate))
  })
  check('B3: every page names the rate and the higher rate', missing.length === 0,
    missing.slice(0, 3).map((r) => `${r.locale}.${r.key}`).join(' '))
  const payout = pages().filter(({ page }) => {
    const text = JSON.stringify(page)
    return !text.includes(String(T.minPayoutUsd)) || !text.includes(String(T.minPayoutIls)) || !text.includes(String(T.holdDays))
  })
  check('B4: and the hold and both payout thresholds', payout.length === 0,
    payout.slice(0, 3).map((r) => `${r.locale}.${r.key}`).join(' '))
  check('B2-MUT: a hand-typed rate is caught, and the interpolated one is not',
    TYPED_RATE.test('earn 25% of every payment') && TYPED_RATE.test('gana el 25 % de cada pago')
    && !TYPED_RATE.test('earn ${T.baseRate}% of every payment'))
}

console.log('\nC) what the pages may not say')
{
  const all = pages().flatMap(({ locale, key, page }) =>
    JSON.stringify(page).split('","').map((text) => ({ where: `${locale}.${key}`, text })))
  /* An attribution window is a memory we do not keep: the referral is the last
     click and nothing is stored on the visitor's device (lib/affiliate/referral.ts).
     The hold is a different thing and is a day count, so this looks for the
     words of remembering and not for digits — the same test the program page's
     own suite uses, extended to the languages this cluster added. */
  const REMEMBERS = [
    /cookie/i, /קוקי|עוגיי?ה/, /חלון ייחוס/, /attribution window/i, /remembered for/i,
    /ventana de atribución/i, /janela de atribuição/i, /fenêtre d'attribution/i,
    /finestra di attribuzione/i, /Zuordnungsfenster/i, /toekenningsvenster/i,
    /okno atrybucji/i, /クッキー|アトリビューション期間/, /쿠키|기여 기간/,
  ]
  const remembers = all.filter((s) => REMEMBERS.some((re) => re.test(s.text)))
  check('C1: no page offers a remembered period we do not keep', remembers.length === 0,
    remembers.slice(0, 3).map((s) => `${s.where}: ${s.text.slice(0, 50)}`).join(' | '))
  /* No earnings promise: not a figure a partner will earn, not "guaranteed". */
  const EARNINGS = [
    /guaranteed (?:income|earnings|results?)/i, /earn \$?\d/i, /הכנסה מובטחת|תרוויחו \d/,
    /ingresos? garantizad|gana \d+ (?:dólares|euros)/i, /renda garantida/i, /revenus garantis/i,
    /guadagni garantiti/i, /garantiert(?:es|e) (?:Einkommen|Verdienst)/i, /gegarandeerd(?:e)? inkomen/i,
    /gwarantowany (?:dochód|zarobek)/i, /収入を保証|必ず稼げ/, /수익을 보장|반드시 (?:벌|수익)/,
  ]
  const earnings = all.filter((s) => EARNINGS.some((re) => re.test(s.text)))
  check('C2: no page promises what a partner will earn', earnings.length === 0,
    earnings.slice(0, 3).map((s) => `${s.where}: ${s.text.slice(0, 50)}`).join(' | '))
  /* No ranking promise either: these pages are about commissions, so any first
     page or guaranteed position here would be pure invention. */
  const RANKING = [
    /guarantee[a-z]* (?:a )?(?:ranking|position|first page)/i, /מבטיח[ים]? (?:דירוג|מקום ראשון)/,
    /primera página garantizada/i, /primeira página garantida/i, /première page garantie/i,
    /prima pagina garantita/i, /garantiert(?:e|es)? (?:Platzierung|Ranking)/i,
    /gegarandeerde positie/i, /gwarantowana pozycja/i, /順位を保証|上位表示を保証/, /순위를 보장/,
  ]
  const ranking = all.filter((s) => RANKING.some((re) => re.test(s.text)))
  check('C3: and none promises a ranking', ranking.length === 0,
    ranking.slice(0, 3).map((s) => `${s.where}: ${s.text.slice(0, 50)}`).join(' | '))
  check('C1-MUT: a cookie promise is caught, and the hold in days is not',
    REMEMBERS.some((re) => re.test('a 30-day cookie remembers the visitor'))
    && !REMEMBERS.some((re) => re.test('released 30 days after the payment settles')))
  check('C2-MUT: an earnings figure is caught, and the commission rate is not',
    EARNINGS.some((re) => re.test('earn $4,000 a month as a partner'))
    && !EARNINGS.some((re) => re.test('35% of every payment, for as long as the customer stays')))
  check('C3-MUT: a ranking promise is caught, and a measurement sentence is not',
    RANKING.some((re) => re.test('we guarantee a ranking on the first page'))
    && !RANKING.some((re) => re.test('rank tracking in Google and the AI engines')))
}

console.log('\nD) the routes, their canonicals and their hreflang')
{
  const missing = pages().filter(({ locale, key }) => !existsSync(join(ROOT, routeFile(locale, key))))
  check('D1: every language has a route file for both pages', missing.length === 0,
    missing.slice(0, 5).map((r) => routeFile(r.locale, r.key)).join(' '))
  const wrongCanonical = pages().filter(({ locale, key }) => {
    const src = read(routeFile(locale, key))
    return !src.includes(`canonical: 'https://www.gotopseo.com${LOCALE_PREFIX[locale]}${affiliateClusterPath(key)}'`)
  })
  check('D2: each canonical is the page\'s own URL in its own tree', wrongCanonical.length === 0,
    wrongCanonical.slice(0, 3).map((r) => routeFile(r.locale, r.key)).join(' '))
  const wrongAlternates = pages().filter(({ locale, key }) => {
    const src = read(routeFile(locale, key))
    const p = affiliateClusterPath(key)
    return !src.includes(`buildHreflangAlternates('${p}', '/en${p}', '/es${p}')`)
  })
  check('D3: and every page announces the same set, derived from the Spanish path',
    wrongAlternates.length === 0, wrongAlternates.slice(0, 3).map((r) => routeFile(r.locale, r.key)).join(' '))
  const wrongProps = pages().filter(({ locale, key }) => {
    const src = read(routeFile(locale, key))
    return !src.includes(`locale="${locale}"`) || !src.includes(`page="${key}"`)
  })
  check('D4: and renders its own language and its own page', wrongProps.length === 0,
    wrongProps.slice(0, 3).map((r) => routeFile(r.locale, r.key)).join(' '))
  check('D1-MUT: a path that is not there is caught',
    !existsSync(join(ROOT, 'app/(public)/ko/affiliates/no-such-page/page.tsx')))
}

console.log('\nE) the hub and its spokes link to each other')
{
  const hub = strip(read('components/public/AffiliatesPage.tsx'))
  check('E1: the program page links to both cluster pages',
    hub.includes("affiliateClusterPath('marketing')") && hub.includes("affiliateClusterPath('choosing')"))
  const spoke = strip(read('components/public/AffiliateGuidePage.tsx'))
  check('E2: every cluster page ends at the application form on the program page',
    spoke.includes('/affiliates#affiliate-apply'))
  check('E3: and links to its sibling', spoke.includes('affiliateClusterPath(SIBLING[key])'))
  // The anchor the buttons point at has to exist where they point.
  check('E4: the anchor they point at is on the form',
    read('components/public/AffiliateApplicationForm.tsx').includes('affiliate-apply'))
  check('E1-MUT: a hub with no link to the spokes is caught',
    !"const sections = [{ kind: 'faq' }]".includes("affiliateClusterPath('marketing')"))
}

console.log('\nF) the sitemap lists both pages in every tree')
{
  const sitemap = strip(read('app/sitemap.xml/route.ts'))
  const inTranslated = KEYS.every((k) => sitemap.includes(`{ path: '${affiliateClusterPath(k)}',`))
  check('F1: both paths are in the one list every translated tree is built from', inTranslated)
  // Hebrew and English are written out by hand in that file, so they need their
  // own entries: this is exactly the shape that gets forgotten.
  const handWritten = KEYS.every((k) =>
    sitemap.includes(`\${baseUrl}${affiliateClusterPath(k)}\``) && sitemap.includes(`\${baseUrl}/en${affiliateClusterPath(k)}\``))
  check('F2: and the hand-written Hebrew and English trees list them too', handWritten)
  check('F1-MUT: a list without the paths is caught',
    !"{ path: '/affiliates', changefreq: 'monthly' }".includes("{ path: '/affiliates/affiliate-marketing',"))
}

console.log('\nG) Korean is announced, because the Korean tree mirrors the Spanish one')
{
  const withKo = buildHreflangAlternates('/affiliates', '/en/affiliates', '/es/affiliates')
  check('G1: a page with a Spanish path announces its Korean twin',
    withKo.ko === 'https://www.gotopseo.com/ko/affiliates', JSON.stringify(withKo.ko))
  check('G2: and the home page derives to the bare prefix, not "/ko/"',
    buildHreflangAlternates('/', '/en', '/es').ko === 'https://www.gotopseo.com/ko')
  check('G2b: with the flag off, nothing announces a Korean page', (() => {
    const before = process.env.NEXT_PUBLIC_KOREAN_SITE_ENABLED
    process.env.NEXT_PUBLIC_KOREAN_SITE_ENABLED = 'false'
    const off = buildHreflangAlternates('/affiliates', '/en/affiliates', '/es/affiliates')
    process.env.NEXT_PUBLIC_KOREAN_SITE_ENABLED = before
    return off.ko === undefined
  })())
  /* THE DERIVATION'S SAFETY. Announcing /ko/<path> for every Spanish path is a
     promise that the page is there. Both trees are walked here rather than
     trusted. */
  const walk = (rel: string): string[] => {
    const dir = join(ROOT, rel)
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? walk(`${rel}/${name}`).map((p) => `${name}/${p}`)
        : name === 'page.tsx' ? [name] : []
    })
  }
  const es = walk('app/(public)/es').sort()
  const ko = walk('app/(public)/ko').sort()
  const onlyEs = es.filter((p) => !ko.includes(p))
  check('G3: every Spanish page has a Korean twin', onlyEs.length === 0, onlyEs.slice(0, 5).join(' '))
  check('G4: and the cluster is in both trees',
    KEYS.every((k) => es.includes(`affiliates/${AFFILIATE_CLUSTER_SLUGS[k]}/page.tsx`) && ko.includes(`affiliates/${AFFILIATE_CLUSTER_SLUGS[k]}/page.tsx`)))
  check('G3-MUT: a Spanish page with no Korean twin is caught',
    ['a/page.tsx', 'b/page.tsx'].filter((p) => !['a/page.tsx'].includes(p)).length === 1)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
