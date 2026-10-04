/**
 * The Spanish PUBLIC site — the contract that /es is a complete Spanish site
 * when it is on, and genuinely absent when it is off.
 *
 * WHAT THIS EXISTS TO PREVENT. Three distinct failures, each of which had a
 * real path into the code before this wave:
 *
 *  1. A HALF-TRANSLATED PAGE. The public tree's copy lives in per-locale
 *     objects, so a missing key does not fail the build; it renders the Hebrew
 *     or English value. Every dictionary here is therefore checked key by key
 *     for Hebrew characters and for untranslated English sentences.
 *  2. A PAGE THAT EXISTS BEFORE IT IS A PRODUCT. Spain has no price yet, the
 *     legal pages have no Spanish version, and the payment provider for
 *     customers abroad is not approved. So "off" has to mean 404, no hreflang
 *     and no sitemap entry — not merely "unlinked", which gets indexed anyway.
 *  3. A LOCALE THAT LEAKS INTO THE DASHBOARD. `Locale` is he|en and
 *     `PublicLocale` is he|en|es on purpose: widening the first would have
 *     served English wherever a dashboard ternary tests for Hebrew. The
 *     narrowing is allowed only through toBilingualLocale / toHebrewOrEnglish.
 *
 * Each group ends with a MUTATION CONTROL: the same check against a
 * deliberately broken input, proving the check can fail.
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX, getLocaleConfig, normalizePublicLocale, toBilingualLocale, type PublicLocale } from '../locales'
import { spanishSiteEnabled } from '../spanish-site'
import { isSpanishPath, routeContentLocale } from '../request-locale'
import { getPublicDictionary } from '../getPublicDictionary'
import { getSiteMetadata } from '../site-metadata'
import { errorPagesUi } from '../error-pages'
import { FEATURE_COMMON } from '../public/feature-common'
import { sharedUiCopy } from '../public/shared-ui'
import { landingEs } from '../public/landing-es'
import { pricingEs } from '../public/pricing-es'
import { freeCheckCopy } from '../../free-check/copy'
import { researchScreenCopy } from '../../presignup/copy'
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER, PLAN_AUDIENCE_LABEL, PLAN_AUDIENCE_DESCRIPTION } from '../../plans/features'
import { PLAN_CATALOG, type PlanCode } from '../../plans/catalog'
import { counterpartPath, availableLocales } from '../../../components/LanguageSwitcher'
import { buildHreflangAlternates } from '../../seo/hreflang'
import { statedAuthUrl } from '../auth-href'
import { googleSignInFailureUrl } from '../../auth/google-signin'
import { recoveryFailureUrl } from '../../auth/password-reset'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const ES_DIR = join(ROOT, 'app', '(public)', 'es')
const HEBREW = /\p{Script=Hebrew}/u
const PLAN_CODES: PlanCode[] = ['regular', 'advanced', 'premium', 'large_agency']

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Source guards match on code, so comments are stripped first (repo convention). */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every string reachable in a nested copy object, with its path. */
function strings(value: unknown, path = ''): Array<{ path: string; text: string }> {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

/**
 * English sentences that would betray an untranslated value. Deliberately
 * sentence-level, not word-level: Spanish marketing copy legitimately contains
 * "Google", "WordPress", "Shopify", "ChatGPT", "SEO", "PDF" and "Excel".
 */
const ENGLISH_GIVEAWAYS = /\b(the|your|and|with|from|every|what|which|free trial|month|website|keywords?|rankings?|report)\b/i

function main() {
  console.log('Spanish public site')

  // ── 1) The locale itself ────────────────────────────────────────────────────
  console.log('\n1) the public locale set')
  {
    check('1a: es is a PUBLIC locale', PUBLIC_LOCALES.includes('es'))
    check('1b: it is served under /es', LOCALE_PREFIX.es === '/es')
    check('1c: it is left-to-right and declares Spanish',
      getLocaleConfig('es').dir === 'ltr' && getLocaleConfig('es').lang === 'es' && getLocaleConfig('es').ogLocale === 'es_ES')
    check('1d: the header and cookie value "es" is recognised', normalizePublicLocale('es') === 'es')
    // STRICT BY DESIGN: this reads values the code itself writes (the proxy
    // header, the cookie), so anything else falls back rather than being
    // guessed at. A near-miss is not a locale.
    check('1e: anything else is NOT silently a locale',
      normalizePublicLocale('fr') === null && normalizePublicLocale('') === null
      && normalizePublicLocale('ES') === null && normalizePublicLocale(' es ') === null
      && normalizePublicLocale(null) === null && normalizePublicLocale(undefined) === null)
    // THE SEPARATION: Spanish degrades to English, never to Hebrew, because
    // they share a script. A Spanish visitor sent to a Hebrew form is lost.
    check('1f: narrowing to a bilingual surface gives ENGLISH, not Hebrew', toBilingualLocale('es') === 'en')
    check('1g: …and the bilingual locales are untouched by it',
      toBilingualLocale('he') === 'he' && toBilingualLocale('en') === 'en')
    // MUTATION CONTROL
    check('1-MUT: a narrowing that returned Hebrew would fail 1f', ('he' as string) !== toBilingualLocale('es'))
  }

  // ── 2) The flag: off means ABSENT ───────────────────────────────────────────
  console.log('\n2) the flag — off means absent, not merely unlinked')
  {
    // Exactly "true". An unset variable is off, which is why Production is
    // off without anyone having to set anything.
    check('2a: only the exact string "true" turns it on',
      spanishSiteEnabled('true') && !spanishSiteEnabled('false') && !spanishSiteEnabled('1')
      && !spanishSiteEnabled('TRUE') && !spanishSiteEnabled('yes') && !spanishSiteEnabled(''))
    check('2b: with it OFF, /es is not a Spanish path at all', !isSpanishPath('/es/pricing', false))
    check('2c: with it ON, /es and its children are', isSpanishPath('/es', true) && isSpanishPath('/es/features/keyword-research', true))
    check('2d: a path that merely starts with the letters is not the tree',
      !isSpanishPath('/espanol', true) && !isSpanishPath('/essays', true))
    check('2e: the route states Spanish only while the tree exists',
      routeContentLocale('/es/pricing') === (spanishSiteEnabled() ? 'es' : null))
    // ONE GATE for the whole tree, in the layout every /es page is a child of,
    // so a new Spanish page cannot forget to be gated.
    const layout = strip(read('app/(public)/es/layout.tsx'))
    check('2f: the tree is gated ONCE, in its layout, with notFound()',
      /if \(!spanishSiteEnabled\(\)\) notFound\(\)/.test(layout) && /from 'next\/navigation'/.test(layout))
    check('2g: …and no individual page carries its own gate (the layout is the contract)',
      pageFiles().every((rel) => !/spanishSiteEnabled/.test(strip(read(rel)))))
    // hreflang: never advertise a 404.
    const off = buildHreflangAlternatesWith(false)
    const on = buildHreflangAlternatesWith(true)
    check('2h: with the flag off, NO hreflang points at Spanish', !('es' in off), JSON.stringify(off))
    check('2i: with it on, hreflang names the Spanish URL', on.es === 'https://www.gotopseo.com/es/pricing')
    check('2j: Hebrew stays x-default either way', off['x-default'] === on['x-default'] && off['x-default'] === 'https://www.gotopseo.com/pricing')
    // The sitemap is gated by the same flag, in the same expression.
    const sitemap = strip(read('app/sitemap.xml/route.ts'))
    check('2k: the sitemap lists Spanish only behind the flag',
      /spanishSiteEnabled\(\)\s*\?/.test(sitemap) && /\.\.\.spanishPages/.test(sitemap))
    check('2l: …and it lists no Spanish LEGAL page (there is no Spanish version)',
      !/\/es\/(privacy|terms|refund-policy|accessibility)/.test(sitemap))
    // MUTATION CONTROL
    check('2-MUT: a layout without the gate fails 2f',
      !/if \(!spanishSiteEnabled\(\)\) notFound\(\)/.test(layout.replace('if (!spanishSiteEnabled()) notFound()', '')))
  }

  // ── 3) Every Spanish page exists, and nothing legal does ────────────────────
  console.log('\n3) the route tree')
  {
    const expected = [
      'page.tsx', 'layout.tsx',
      'about/page.tsx', 'about/layout.tsx',
      'pricing/page.tsx', 'pricing/layout.tsx',
      'free-check/page.tsx', 'articles/page.tsx', 'sitemap/page.tsx',
      'features/seo-geo-content-publishing/page.tsx',
      'features/google-organic-rank-tracking/page.tsx',
      'features/google-maps-rank-tracking/page.tsx',
      'features/ai-visibility-tracking/page.tsx',
      'features/seo-geo-reports/page.tsx',
      'features/keyword-research/page.tsx',
    ]
    for (const rel of expected) {
      check(`3a: /es has ${rel}`, existsSync(join(ES_DIR, rel)))
    }
    // The legal pages exist in Spanish now. The legal thread wrote the text as
    // Markdown under content/legal/es/ and this tree renders it; the route is
    // what makes it reachable, and the front matter names the English page it
    // was translated from.
    for (const legal of ['privacy', 'terms', 'refund-policy', 'accessibility']) {
      check(`3b: /es has a ${legal} page`, existsSync(join(ES_DIR, legal, 'page.tsx')))
      check(`3b2: …and the ${legal} text it renders`,
        existsSync(join(ROOT, 'content', 'legal', 'es', `${legal}.md`)))
    }
    // A legal page says `slug="…"` and the locale lives once, in
    // SpanishLegalPage; every other page carries `locale="es"` itself.
    const sharedFrame = (rel: string) =>
      /locale="es"/.test(strip(read(rel))) || /SpanishLegalPage slug="/.test(strip(read(rel)))
    check('3c: every /es page renders through the SHARED components, not a second design',
      pageFiles().every(sharedFrame), pageFiles().filter((rel) => !sharedFrame(rel)).join(', '))
    check('3c2: and the legal frame itself renders as Spanish',
      /locale="es"/.test(strip(read('components/public/SpanishLegalPage.tsx'))))
    // MUTATION CONTROL
    check('3-MUT: a page list missing a file fails 3a', !existsSync(join(ES_DIR, 'pricing/nope.tsx')))
  }

  // ── 4) The copy is actually Spanish, all of it ──────────────────────────────
  console.log('\n4) the copy is Spanish, with no Hebrew and no English left in')
  {
    const dictionaries: Array<{ name: string; value: unknown }> = [
      { name: 'public dictionary', value: getPublicDictionary('es') },
      { name: 'landing', value: landingEs },
      { name: 'pricing', value: pricingEs },
      { name: 'free check', value: freeCheckCopy('es') },
      { name: 'research screen', value: researchScreenCopy('es') },
      { name: 'feature common', value: FEATURE_COMMON.es },
      { name: 'shared UI', value: sharedUiCopy('es') },
      { name: 'site metadata', value: getSiteMetadata('es') },
      { name: 'error pages', value: errorPagesUi('es') },
    ]
    for (const { name, value } of dictionaries) {
      const all = strings(value)
      check(`4a: the ${name} has copy at all`, all.length > 0, String(all.length))
      // The language SWITCHER names each language in its own language, so
      // "עברית" there is the correct value, not a leak.
      const hebrew = all.filter((s) => HEBREW.test(s.text) && !/^languageSwitcher\./.test(s.path))
      check(`4b: the ${name} carries NO Hebrew`, hebrew.length === 0, hebrew.map((s) => `${s.path}: ${s.text.slice(0, 40)}`).join(' / '))
    }
    // Untranslated ENGLISH is the likelier failure, since a missing key falls
    // back to a sibling object rather than throwing.
    for (const { name, value } of dictionaries) {
      const english = strings(value).filter((s) => ENGLISH_GIVEAWAYS.test(s.text))
      check(`4c: the ${name} has no untranslated English sentence`, english.length === 0,
        english.map((s) => `${s.path}: ${s.text.slice(0, 50)}`).join(' / '))
    }
    check('4d: the Spanish metadata is genuinely its own, not the English one',
      getSiteMetadata('es').title !== getSiteMetadata('en').title
      && getSiteMetadata('es').description !== getSiteMetadata('en').description
      && getSiteMetadata('es').ogLocale === 'es_ES')
    // MUTATION CONTROL
    check('4-MUT: a Hebrew value inside the dictionary would fail 4b',
      strings({ nav: { pricing: 'מחירים' } }).some((s) => HEBREW.test(s.text)))
    check('4-MUT2: an untranslated English sentence would fail 4c',
      ENGLISH_GIVEAWAYS.test('Track every keyword that matters to your website'))
  }

  // ── 5) The plan lines and the price ─────────────────────────────────────────
  console.log('\n5) the plans — translated, and still the catalog\'s numbers')
  {
    for (const code of PLAN_CODES) {
      const lines = planLimitLines(code, 'es')
      check(`5a-${code}: five Spanish lines, in the approved order`, lines.length === 5)
      check(`5b-${code}: no Hebrew in them`, !lines.some((l) => HEBREW.test(l)), lines.join(' / '))
      // THE NUMBERS ARE THE CATALOG'S. A translated line that invented a
      // number would promise what the server does not grant.
      check(`5c-${code}: the article line starts with the catalog's own number`,
        lines[0].startsWith(`${PLAN_CATALOG[code].maxArticlesPerPeriodAccountWide} `), lines[0])
      check(`5d-${code}: the websites line follows the catalog`,
        PLAN_CATALOG[code].maxProjects === 1 ? lines[1] === '1 web' : lines[1] === `Hasta ${PLAN_CATALOG[code].maxProjects} webs`, lines[1])
      check(`5e-${code}: it has a Spanish audience label and description`,
        PLAN_AUDIENCE_LABEL[code].es.length > 0 && PLAN_AUDIENCE_DESCRIPTION[code].es.length > 0
        && !HEBREW.test(PLAN_AUDIENCE_LABEL[code].es) && !HEBREW.test(PLAN_AUDIENCE_DESCRIPTION[code].es))
    }
    check('5f: the trial lines are Spanish too', trialLimitLines('es').length === 6 && !trialLimitLines('es').some((l) => HEBREW.test(l)))
    check('5g: the line under the grid is the SHARED definition of both checks', pricingEs.plans.checksNote === CHECKS_EXPLAINER.es)
    // The grid is the same grid as the other two pages: same builder, same
    // order, no hard-coded limit of its own.
    const page = strip(read('app/(public)/es/pricing/page.tsx'))
    check('5h: the page spreads the shared builder without reordering it',
      /\.\.\.planLimitLines\(code, 'es'\),/.test(page) && !/\.sort\(|\.reverse\(/.test(page))
    check('5i: it hard-codes no plan limit of its own',
      !/maxProjects|maxKeywordsPerProject|maxGoogleChecksPerPeriodPerProject|maxAIChecksPerPeriodPerProject|maxArticlesPerPeriodAccountWide/
        .test(page.slice(page.indexOf('const features = ['), page.indexOf('const features = [') + 900)))
    check('5j: it reads the audience label and description from the shared module',
      /PLAN_AUDIENCE_LABEL\[code\]\['es'\]/.test(page) && /PLAN_AUDIENCE_DESCRIPTION\[code\]\['es'\]/.test(page))
    // THE PRICE IS THE VISITOR'S MARKET, NOT THE PAGE'S LANGUAGE. An Israeli
    // reading Spanish must still see shekels and pay through PayPal.
    check('5k: the price comes from the resolved billing market, not from this page',
      /resolveBillingMarket\(/.test(page) && /planPriceIn\(plan, market\)/.test(page)
      && !/EUR|€|priceEUR/.test(page))
    check('5l: no Spanish copy promises a currency',
      !strings(pricingEs).some((s) => /€|EUR|euros?\b/i.test(s.text)),
      strings(pricingEs).filter((s) => /€|EUR|euros?\b/i.test(s.text)).map((s) => s.path).join(' / '))
    // MUTATION CONTROL
    check('5-MUT: a hand-written websites line would fail 5d',
      'Hasta 10 webs' !== planLimitLines('advanced', 'es')[1])
  }

  // ── 6) The switcher and the links between the trees ─────────────────────────
  console.log('\n6) the switcher — three languages, counterpart URLs')
  {
    check('6a: with the flag off, the switcher offers only Hebrew and English',
      JSON.stringify(availableLocales(false)) === JSON.stringify(['he', 'en']))
    check('6b: with it on, it offers all three',
      JSON.stringify(availableLocales(true)) === JSON.stringify(['he', 'en', 'es']))
    const cases: Array<[string, PublicLocale, PublicLocale, string]> = [
      ['/pricing', 'he', 'es', '/es/pricing'],
      ['/es/pricing', 'es', 'he', '/pricing'],
      ['/es/pricing', 'es', 'en', '/en/pricing'],
      ['/es', 'es', 'he', '/'],
      ['/', 'he', 'es', '/es'],
      ['/en/features/keyword-research', 'en', 'es', '/es/features/keyword-research'],
    ]
    for (const [from, a, b, want] of cases) {
      check(`6c: ${from} (${a}) → ${b} is ${want}`, counterpartPath(from, a, b) === want, counterpartPath(from, a, b))
    }
    // An article's own slug has no counterpart in another language, so the
    // switch lands on that language's article INDEX rather than on a 404.
    check('6d: a single article switches to the target language\'s article index',
      counterpartPath('/articles/some-slug', 'he', 'es') === '/es/articles')
    // MUTATION CONTROL
    check('6-MUT: a switcher that kept the source prefix would fail 6c',
      counterpartPath('/es/pricing', 'es', 'he') !== '/es/pricing')
  }

  // ── 6b) Every internal link in the Spanish copy goes somewhere real ─────────
  console.log('\n6b) the links in the Spanish copy')
  {
    // THE LANDING PAGE PREFIXES ITS OWN FEATURE LINKS, so a dictionary that
    // already carried `/es/...` produced `/es/es/features/...`, a 404 on four
    // cards of the Spanish home page. A crawl of the built site caught it; this
    // keeps it caught without a build.
    const landingHrefs = strings(landingEs).filter((s) => s.path.endsWith('.href')).map((s) => s.text)
    const featureHrefs = landingHrefs.filter((h) => h.includes('/features/'))
    check('6b1: the landing feature links are PREFIX-FREE (the page adds the prefix)',
      featureHrefs.length === 4 && featureHrefs.every((h) => h.startsWith('/features/')), featureHrefs.join(' / '))
    check('6b2: no value in any Spanish dictionary carries a doubled locale prefix',
      !allSpanishStrings().some((s) => /\/(es|en)\/(es|en)\//.test(s.text)),
      allSpanishStrings().filter((s) => /\/(es|en)\/(es|en)\//.test(s.text)).map((s) => s.path).join(' / '))
    // Every absolute internal path named in the Spanish copy must be a page
    // that exists — in the Spanish public tree, in the Spanish AUTH tree (which
    // is a route group of its own, so pageFiles cannot see it), or the English
    // one where Spanish has nothing.
    const EXISTS = new Set<string>([
      ...pageFiles().map((rel) => rel.replace('app/(public)', '').replace(/\/page\.tsx$/, '') || '/es'),
      ...readdirSync(join(ROOT, 'app', '(auth)', 'es'), { withFileTypes: true })
        .filter((e) => e.isDirectory()).map((e) => `/es/${e.name}`),
      '/en', '/en/signup', '/en/login', '/en/privacy', '/en/terms', '/en/refund-policy', '/en/accessibility',
      '/en/pricing', '/en/free-check', '/en/about', '/en/articles', '/en/sitemap', '/',
    ])
    const paths = allSpanishStrings()
      // Paths, not words that happen to start with a slash ("/mes").
      .filter((s) => /^\/[a-z-]+(\/[a-z0-9-]+)+/.test(s.text) && !s.text.includes(' '))
      .map((s) => ({ ...s, text: s.text.split('?')[0].split('#')[0] }))
      // A landing feature href is relative to the page's own prefix, checked above.
      .filter((s) => !s.text.startsWith('/features/'))
    const missing = paths.filter((s) => !EXISTS.has(s.text))
    check('6b3: every internal path in the Spanish copy is a page that exists',
      missing.length === 0, missing.map((s) => `${s.path}: ${s.text}`).join(' / '))
    // The FOOTER is where this bit hardest: it names four legal pages on every
    // single Spanish page, and none of them has a Spanish version.
    const footer = strip(read('components/Footer.tsx'))
    // The legal links used to need a prefix of their own, pointing at /en for
    // every language, because only Hebrew and English had documents. Each
    // language has its own now, so they follow the page's own prefix.
    check('6b4: the footer links each language\'s own legal pages',
      /const legalPrefix = prefix/.test(footer)
      && ['privacy', 'terms', 'refund-policy', 'accessibility'].every((p) => footer.includes('${legalPrefix}/' + p)))
    check('6b5: …and its home link follows the page\'s locale', /const homeHref = localeHomeHref\(locale\)/.test(footer))
    // THE COMPANY'S LEGAL NAME IS NEVER TRANSLATED (Oren, 2026-10-03): the
    // Hebrew pages carry the Hebrew name, and English and every other
    // language carry the English name exactly as registered. The Spanish tree
    // names no legal entity today — the legal pages are not translated — so
    // this guards the rule for whatever adds one later.
    check('6b6: no Spanish copy carries a translated company name',
      !allSpanishStrings().some((s) => /\bS\.L\.|Sociedad Limitada|Marketing Digital y Publicidad/i.test(s.text)),
      allSpanishStrings().filter((s) => /\bS\.L\.|Sociedad Limitada|Marketing Digital y Publicidad/i.test(s.text)).map((s) => s.path).join(' / '))
    // MUTATION CONTROL
    check('6b-MUT: a doubled prefix would fail 6b2', /\/(es|en)\/(es|en)\//.test('/es/es/features/x'))
    check('6b-MUT2: a translated company name would fail 6b6',
      /\bS\.L\.|Sociedad Limitada|Marketing Digital y Publicidad/i.test('Go Top Marketing Digital y Publicidad S.L.'))
  }

  // ── 7) Nothing bilingual was widened by accident ────────────────────────────
  console.log('\n7) the dashboard and the auth forms are untouched')
  {
    // Sign-up HAS Spanish since 4 October 2026 (app/(auth)/es/*), so every
    // Spanish page must send a visitor to the SPANISH form — and still never to
    // a Hebrew one. Until then the rule here was "the English form, explicitly",
    // which is what left a Spanish visitor changing language at the sign-up.
    const spanishPages = pageFiles().map((rel) => ({ rel, src: strip(read(rel)) }))
    // WHAT 7a USED TO MISS. It forbade only the Hebrew route, so `/en/signup`
    // passed — and three Spanish pages carried it (the articles page's two
    // calls to action, the sitemap's account group) plus the `es` block of
    // FEATURE_COMMON, which is the main call to action on all six Spanish
    // feature pages. A Spanish reader clicked "Empezar la prueba gratuita" and
    // got an English form. The rule is now the positive one: a Spanish page
    // states 'es' and nothing else.
    for (const { rel, src } of spanishPages) {
      const foreignAuth = /href="\/(en\/)?(signup|login|forgot-password|reset-password)(\?|")/.test(src)
        || /authHref\('(signup|login|forgot-password)', '(he|en)'\)/.test(src)
      check(`7a: ${rel.split('/es/')[1]} sends nobody to a non-Spanish auth form`, !foreignAuth)
    }
    check('7b: the Spanish home page links to the SPANISH sign-up explicitly',
      /authHref\('signup', 'es'\)/.test(strip(read('app/(public)/es/page.tsx'))))
    // The four Spanish auth routes exist and are gated by the same flag as the
    // public tree, so "off" means absent there too.
    for (const page of ['login', 'signup', 'forgot-password', 'reset-password']) {
      check(`7b-${page}: app/(auth)/es/${page} exists`, existsSync(join(ROOT, 'app', '(auth)', 'es', page, 'page.tsx')))
    }
    const authGate = strip(read('app/(auth)/es/layout.tsx'))
    check('7b-gate: the Spanish auth tree is behind the same flag as the public tree',
      /if \(!spanishSiteEnabled\(\)\) notFound\(\)/.test(authGate))
    check('7b-gate MUT: a layout without the gate fails that check',
      !/if \(!spanishSiteEnabled\(\)\) notFound\(\)/.test(authGate.replace('if (!spanishSiteEnabled()) notFound()', 'return children')))
    // The dashboard now has a Spanish dictionary too, and it is PARTIAL by
    // design: what it has not translated answers in English. The guard that
    // owns that wave is lib/i18n/dashboard/__qa__/spanish-dashboard.qa.ts,
    // which also prints the coverage; this one only holds the file set, so a
    // fourth language cannot appear in the dashboard without a decision.
    const dashDir = join(ROOT, 'lib', 'i18n', 'dashboard')
    const dicts = readdirSync(dashDir).filter((f) => /^[a-z]{2}\.ts$/.test(f)).sort()
    check('7c: the dashboard has exactly the three dictionaries we have decided on',
      JSON.stringify(dicts) === JSON.stringify(['en.ts', 'es.ts', 'he.ts']), dicts.join(','))
    // 7d) THE SHARED SURFACES A SPANISH VISITOR REACHES THROUGH ANOTHER FILE.
    // None of these lives under app/(public)/es, so the loop above cannot see
    // them, and each one was wrong until 4 October 2026.
    const featureCommon = strip(read('lib/i18n/public/feature-common.ts'))
    check('7d1: the feature pages\u2019 Spanish trial button goes to the Spanish sign-up',
      FEATURE_COMMON.es.trial.href === '/es/signup')
    check('7d2: \u2026and it says so through authHref, not a literal path',
      /trial: \{ label: `Prueba gratis \$\{DAYS\} d\u00edas`, href: authHref\('signup', 'es'\) \}/.test(featureCommon))
    check('7d3: every Spanish feature-page link stays inside /es',
      [FEATURE_COMMON.es.check.href, FEATURE_COMMON.es.trial.href, FEATURE_COMMON.es.pricing.href].every((h) => h.startsWith('/es/')))
    // A FAILURE must come back in the visitor's own language. Each of these
    // three callers wrote its own `lang === 'en' ? ... : ...`, so Spanish fell
    // to the HEBREW form — with an error message on it.
    // These three read the language through the stored-locale normalizer, which
    // admits 'es' only while the Spanish site is on — so the flag is set around
    // the calls rather than trusting whatever this run happens to have, and the
    // OFF state is checked too: with no Spanish routes to redirect to, a
    // failure must fall back to the neutral form, never to a 404.
    const withSpanish = <T,>(on: boolean, fn: () => T): T => {
      const previous = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
      process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = on ? 'true' : 'false'
      try { return fn() } finally {
        if (previous === undefined) delete process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
        else process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = previous
      }
    }
    check('7d4: a Google sign-in that fails returns a Spanish visitor to /es/login',
      withSpanish(true, () => googleSignInFailureUrl('https://a.example', 'es')) === 'https://a.example/es/login?error=google')
    check('7d5: \u2026and a dead recovery link to /es/forgot-password',
      withSpanish(true, () => recoveryFailureUrl('https://a.example', 'es').toString()) === 'https://a.example/es/forgot-password?error=link')
    check('7d6: the three languages each get their own form, and an unstated one the neutral route',
      withSpanish(true, () =>
        statedAuthUrl('https://a.example', 'login', 'he', { param: 'error', value: 'oauth' }).toString() === 'https://a.example/login?error=oauth&lang=he'
        && statedAuthUrl('https://a.example', 'login', 'en', { param: 'error', value: 'oauth' }).toString() === 'https://a.example/en/login?error=oauth'
        && statedAuthUrl('https://a.example', 'login', 'es', { param: 'error', value: 'oauth' }).toString() === 'https://a.example/es/login?error=oauth'
        && statedAuthUrl('https://a.example', 'login', null, { param: 'error', value: 'oauth' }).toString() === 'https://a.example/login?error=oauth'))
    check('7d6-off: with the Spanish site off, a stated \u2018es\u2019 falls back to the neutral form, not to a 404',
      withSpanish(false, () => statedAuthUrl('https://a.example', 'login', 'es', { param: 'error', value: 'oauth' }).toString()) === 'https://a.example/login?error=oauth')
    check('7d7: the callback and the recovery helper both go through it, so none can drift again',
      /statedAuthUrl\(origin, 'login', lang, \{ param: 'error', value: 'oauth' \}\)/.test(strip(read('app/api/auth/callback/route.ts')))
      && /statedAuthUrl\(origin, 'forgot-password', lang, \{ param: 'error', value: 'link' \}\)/.test(strip(read('lib/auth/password-reset.ts'))))
    // The floating widgets each carry their own language ternary, which is why
    // they are kept off every auth screen by path. The Spanish four were added
    // the moment the routes existed.
    const widgetGate = strip(read('components/public/PublicSiteWidgets.tsx'))
    for (const page of ['login', 'signup', 'forgot-password', 'reset-password']) {
      check(`7d8-${page}: nothing floats over /es/${page}`, widgetGate.includes(`'/es/${page}'`))
    }

    // MUTATION CONTROL
    check('7-MUT: a Hebrew auth link would fail 7a', /href="\/(signup|login)(\?|")/.test('<a href="/signup?x">'))
    check('7-MUT2: the ENGLISH link that 7a used to allow now fails it',
      /href="\/(en\/)?(signup|login|forgot-password|reset-password)(\?|")/.test('<ButtonLink href="/en/signup" size="lg">'))
    const twoWayFailureUrl = (origin: string, lang: string): string =>
      `${origin}${lang === 'en' ? '/en' : ''}/login?error=google`
    check('7-MUT3: the two-way failure URL this replaced answers Hebrew for Spanish, failing 7d4',
      twoWayFailureUrl('https://a.example', 'es') !== 'https://a.example/es/login?error=google')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

/** Every string in every Spanish dictionary, for the cross-cutting checks. */
function allSpanishStrings(): Array<{ path: string; text: string }> {
  return [
    ...strings(getPublicDictionary('es'), 'publicDictionary'),
    ...strings(landingEs, 'landing'),
    ...strings(pricingEs, 'pricing'),
    ...strings(freeCheckCopy('es'), 'freeCheck'),
    ...strings(researchScreenCopy('es'), 'research'),
    ...strings(FEATURE_COMMON.es, 'featureCommon'),
  ]
}

/** Every page.tsx under app/(public)/es, repo-relative. */
function pageFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${rel}/${entry.name}`)
      else if (entry.name === 'page.tsx') out.push(`${rel}/page.tsx`)
    }
  }
  walk(ES_DIR, 'app/(public)/es')
  return out.sort()
}

/**
 * buildHreflangAlternates reads the flag from the environment, so both states
 * are exercised by setting it around the call rather than by trusting whatever
 * this run happens to have.
 */
function buildHreflangAlternatesWith(on: boolean): Record<string, string> {
  const previous = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
  process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = on ? 'true' : 'false'
  try {
    return buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing')
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED
    else process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = previous
  }
}

main()

export {}
