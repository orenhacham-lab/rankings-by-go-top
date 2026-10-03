/**
 * THE HEBREW SITE STAYS HEBREW, THE ENGLISH SITE STAYS ENGLISH — from the
 * marketing page, through sign-up, sign-in and the email confirmation, into the
 * dashboard's forms, errors and notices.
 *
 * What was wrong, and is proven fixed here:
 *   A) the Hebrew site linked to a bare /signup and /login, so a visitor whose
 *      browser is set to English got an English form (and dashboard) from the
 *      Hebrew site. Links now state the page's language (lib/i18n/auth-href.ts),
 *      and after sign-in / sign-up the app opens in the form's language.
 *   B) a failed email-confirmation link landed on /login?error=oauth — without
 *      the visitor's language, and the page ignored the error; an unconfirmed
 *      email was reported as a wrong password; the logo's alt text was English
 *      on the Hebrew page.
 *   C) the dashboard's server actions threw Hebrew-only text (and appended raw
 *      database / geocoder text); in production the forms showed React's
 *      English "An error occurred in the Server Components render" instead.
 *      Messages now come from ACTION_MESSAGES by the request's locale, and the
 *      forms receive them as values (asActionResult).
 *   D) hard-coded strings on these screens: GUARDS, so a new one fails QA.
 * Shopify surfaces are untouched (English only): shopify-english-journey.qa.ts.
 * Every guard has a MUTATION CONTROL: the same check on a broken copy fails.
 *
 * Run: npx tsx lib/i18n/__qa__/full-language-surfaces.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { authHref, withLocaleParam } from '../auth-href'
import { apiErrorText, UserFacingError } from '../user-facing-error'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const HEBREW = /[א-ת]/
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name)
    if (name === '__qa__' || name === 'node_modules') continue
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, join(ROOT, rel)))
  }
  return out
}

// ── The router hooks, driven per render (as auth-surface-language.qa.ts does) ─
let PATHNAME = '/login'
let SEARCH = new URLSearchParams()
const Mod: any = require('module')
const origLoad = Mod._load
Mod._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => PATHNAME
      : k === 'useSearchParams' ? () => SEARCH
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

/** A literal link to a bare auth route: '/signup' or "/login", not /en/…, not carrying ?lang. */
const BARE_AUTH_LINK = /['"`]\/(?:signup|login)(?![\w/-])(?!\?lang=)/
/** Literal user-facing text thrown by a server action. */
const LITERAL_THROW = /throw new (?:Error|UserFacingError|KeywordQuotaError)\(\s*['"`]/
/** Literal English text in a JSX text node or a user-facing attribute. */
const BRAND_OK = /^(?:Rankings by Go Top|Rankings|by Go Top|Rankings by|Go Top|Google|Shopify|WordPress|AI|GEO|SEO|H2|H3|B|I|ChatGPT|Claude|Gemini|Perplexity|Copilot|Grok|Google AI|acme\.myshopify\.com|Promise|you@example\.com|English|עברית|return|null|else|https?:\/\/\S+)$/
function hardCoded(src: string): string[] {
  const s = strip(src)
  const out: string[] = []
  for (const m of s.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]*[A-Za-zא-ת]{2,}[^"]*)"/g)) if (!BRAND_OK.test(m[1].trim())) out.push(m[0])
  // (?<![=-]) — not an arrow or a comparison: `(s) => s.rate < 60` is code, not text.
  for (const m of s.matchAll(/(?<![=-])>\s*([A-Za-zא-ת][A-Za-zא-ת ,.'!?-]{2,})\s*</g)) if (!BRAND_OK.test(m[1].trim())) out.push(`>${m[1].trim()}<`)
  return out
}

async function main() {
  // ── A) links into the auth surface, and out of it ─────────────────────────
  console.log('A) auth links carry the language of the page that sends you there')
  {
    check('A1: the Hebrew site links to /signup?lang=he and /login?lang=he', authHref('signup', 'he') === '/signup?lang=he' && authHref('login', 'he') === '/login?lang=he')
    check('A2: the English site links to its own routes, /en/signup and /en/login', authHref('signup', 'en') === '/en/signup' && authHref('login', 'en') === '/en/login')
    check('A3: extra query (a free-check claim, a plan) rides along, empty values are dropped',
      authHref('signup', 'he', { claim: 'ab12' }) === '/signup?lang=he&claim=ab12' && authHref('signup', 'en', { plan: 'premium' }) === '/en/signup?plan=premium'
      && authHref('signup', 'he', { claim: null }) === '/signup?lang=he', authHref('signup', 'he', { claim: 'ab12' }))
    check('A4: after sign-in the destination carries the form\'s language, its own query and hash kept',
      withLocaleParam('/dashboard', 'he') === '/dashboard?lang=he' && withLocaleParam('/projects/1?tab=keywords#k', 'en') === '/projects/1?tab=keywords&lang=en#k')
    check('A5: a destination that already chose (the Shopify handoff\'s lang=en) is left exactly as it is',
      withLocaleParam('/shopify/link?lang=en', 'he') === '/shopify/link?lang=en')

    const HEBREW_SITE = ['app/page.tsx', 'components/PublicNav.tsx', 'components/Footer.tsx', ...walk('components/free-check'),
      ...walk('app/(public)').filter((f) => !f.startsWith('app/(public)/en/'))]
    const ENGLISH_SITE = walk('app/(public)/en')
    const AUTH = walk('app/(auth)')
    const offenders = (files: Record<string, string>) => Object.entries(files).filter(([, src]) => BARE_AUTH_LINK.test(src)).map(([f, src]) => `${f}: ${BARE_AUTH_LINK.exec(src)?.[0]}`)
    const sources = Object.fromEntries([...HEBREW_SITE, ...ENGLISH_SITE, ...AUTH].map((f) => [f, strip(read(f))]))
    check(`A6: none of ${Object.keys(sources).length} public/auth files links to a bare /signup or /login`, offenders(sources).length === 0, offenders(sources).join(' | '))
    check('MUTATION CONTROL: a Hebrew page with href="/signup" again is caught',
      offenders({ ...sources, 'app/(public)/about/page.tsx': sources['app/(public)/about/page.tsx'] + '\n<Link href="/signup">x</Link>' }).length === 1)
    check('MUTATION CONTROL: the free check\'s old `${signupHref}?claim=` build of a bare /signup is caught',
      offenders({ x: "const signupHref = locale === 'en' ? '/en/signup' : '/signup'" }).length === 1)

    // The nav renders its sign-in/sign-up buttons only after the browser has
    // asked Supabase who is signed in (an effect), so a static render cannot see
    // them; the nav's source is checked instead, then the builder it uses.
    const nav = strip(read('components/PublicNav.tsx'))
    // The nav is on a THREE-language public site while the auth forms are still
    // bilingual, so it narrows the page's locale at the boundary
    // (toBilingualLocale) instead of inventing a second link builder. Both
    // spellings satisfy this: what matters is that the link comes from authHref
    // and from the page's own locale, not from a ternary on the path.
    const navOk = (src: string) => /const signupHref = authHref\('signup', (?:locale|toBilingualLocale\(locale\))\)/.test(src)
      && /const loginHref = authHref\('login', (?:locale|toBilingualLocale\(locale\))\)/.test(src)
      && (src.match(/href=\{signupHref\}/g) ?? []).length === 2 && (src.match(/href=\{loginHref\}/g) ?? []).length === 2
    check('A7: the nav (desktop and mobile) links to sign-up and sign-in through authHref in the page\'s locale', navOk(nav))
    check('MUTATION CONTROL: the old `locale === \'en\' ? \'/en/signup\' : \'/signup\'` nav is caught',
      !navOk(nav.replace(/const signupHref = authHref\('signup', [^)]*\)?\)/, "const signupHref = locale === 'en' ? '/en/signup' : '/signup'")))
    check('A8: so the Hebrew nav leads to /signup?lang=he and /login?lang=he, the English nav to /en/signup and /en/login',
      authHref('signup', 'he') === '/signup?lang=he' && authHref('login', 'he') === '/login?lang=he' && authHref('signup', 'en') === '/en/signup' && authHref('login', 'en') === '/en/login')
  }

  // ── B) the auth surface itself ─────────────────────────────────────────────
  console.log('\nB) sign-in, sign-up and the confirmation callback')
  {
    const { AuthLocaleProvider } = require(join(ROOT, 'components/auth/AuthLocaleProvider.tsx'))
    const LOGIN = require(join(ROOT, 'app/(auth)/login/page.tsx'))
    const SIGNUP = require(join(ROOT, 'app/(auth)/signup/page.tsx'))
    const render = (Page: any, locale: 'he' | 'en', pathname: string, search = '') => {
      PATHNAME = pathname
      SEARCH = new URLSearchParams(search)
      return renderToStaticMarkup(createElement(AuthLocaleProvider as never, { locale, children: createElement(Page as never) } as never) as never)
    }
    const heErr = render(LOGIN.default, 'he', '/login', 'lang=he&error=oauth')
    const enErr = render(LOGIN.default, 'en', '/en/login', 'error=oauth')
    check('B1: a failed confirmation link is explained on /login, in Hebrew', heErr.includes('קישור האישור אינו תקין או שפג תוקפו') && /role="alert"/.test(heErr))
    check('B2: …and on /en/login, in English, with no Hebrew at all', enErr.includes('This confirmation link is invalid or has expired') && !HEBREW.test(enErr))
    check('B3: without ?error the sign-in form shows no alert', !/role="alert"/.test(render(LOGIN.default, 'he', '/login', 'lang=he')))
    const heLogin = render(LOGIN.default, 'he', '/login', 'lang=he')
    const heSignup = render(SIGNUP.default, 'he', '/signup', 'lang=he')
    check('B4: the logo\'s alt text is Hebrew on the Hebrew pages', heLogin.includes('alt="הלוגו של Go Top SEO"') && heSignup.includes('alt="הלוגו של Go Top SEO"'))
    check('B5: the cross-links stay in Hebrew (/signup?lang=he, /login?lang=he)', heLogin.includes('href="/signup?lang=he"') && heSignup.includes('href="/login?lang=he"'))
    const enSignup = render(SIGNUP.default, 'en', '/en/signup')
    check('B6: the English sign-up links to /en/login and carries no Hebrew', enSignup.includes('href="/en/login"') && !HEBREW.test(enSignup))

    const login = strip(read('app/(auth)/login/page.tsx'))
    const unconfirmed = (src: string) => /code === 'email_not_confirmed'[^\n]*t\.err\.emailNotConfirmed/.test(src)
    check('B7: an unconfirmed email gets its own message, not "wrong password"', unconfirmed(login))
    check('MUTATION CONTROL: a sign-in that maps every failure to badCredentials is caught', !unconfirmed(login.replace(/setError\(code === 'email_not_confirmed'[^\n]*\n/, 'setError(t.err.badCredentials)\n')))
    const opensInLanguage = (src: string) => /router\.replace\(withLocaleParam\(nextPath, lang\)\)/.test(src)
    check('B8: after sign-in the app opens in the form\'s language', opensInLanguage(login))
    check('MUTATION CONTROL: router.replace(nextPath) without the language is caught', !opensInLanguage(login.replace('router.replace(withLocaleParam(nextPath, lang))', 'router.replace(nextPath)')))
    const signup = strip(read('app/(auth)/signup/page.tsx'))
    check('B9: the sign-up\'s "already registered" line sends the visitor to sign in (the reset link lives there), not to a reset of its own', !/reset (?:your )?password|לאפס סיסמה/i.test(signup))

    // The confirmation callback's failure path, run for real.
    const { NextRequest } = require('next/server')
    const { GET } = require(join(ROOT, 'app/api/auth/callback/route.ts'))
    const location = async (qs: string) => ((await GET(new NextRequest(`https://app.example/api/auth/callback?${qs}`))) as Response).headers.get('location') ?? ''
    const he = await location('next=%2Fdashboard&lang=he')
    const en = await location('next=%2Fdashboard&lang=en')
    const none = await location('next=%2Fdashboard')
    check('B10: a failed confirmation returns a Hebrew sign-up to /login?error=oauth&lang=he', he === 'https://app.example/login?error=oauth&lang=he', he)
    check('B11: …and an English one to /en/login?error=oauth', en === 'https://app.example/en/login?error=oauth', en)
    check('B12: …and one without a language to /login?error=oauth, as before', none === 'https://app.example/login?error=oauth', none)
    const cb = strip(read('app/api/auth/callback/route.ts'))
    const cbLocalized = (src: string) => /lang === 'en' \? '\/en\/login' : '\/login'/.test(src) && /if \(lang === 'he'\) failed\.searchParams\.set\('lang', 'he'\)/.test(src)
    check('B13: the callback source builds both language-specific failure URLs', cbLocalized(cb))
    check('MUTATION CONTROL: the old single `/login?error=oauth` redirect is caught', !cbLocalized("return NextResponse.redirect(`${origin}/login?error=oauth`)"))
  }

  // ── C) the dashboard's actions and routes answer in the merchant's language ─
  console.log('\nC) errors from the dashboard\'s server actions and create routes')
  {
    const { ACTION_MESSAGES, asActionResult, bilingualError } = require(join(ROOT, 'lib/i18n/action-messages.ts'))
    const sample = (v: unknown) => (typeof v === 'function' ? (v as (...a: unknown[]) => string)(3, 10, 'Plan') : v) as string
    const heKeys = Object.keys(ACTION_MESSAGES.he).sort(), enKeys = Object.keys(ACTION_MESSAGES.en).sort()
    check('C1: Hebrew and English carry exactly the same messages', JSON.stringify(heKeys) === JSON.stringify(enKeys), `${heKeys.length}/${enKeys.length}`)
    const notHebrew = heKeys.filter((k) => !HEBREW.test(sample(ACTION_MESSAGES.he[k])))
    const notEnglish = enKeys.filter((k) => HEBREW.test(sample(ACTION_MESSAGES.en[k])))
    check('C2: every Hebrew message is Hebrew and every English one has no Hebrew', notHebrew.length === 0 && notEnglish.length === 0, [...notHebrew, ...notEnglish].join(','))
    check('C3: no message names a provider or a database', !Object.values(ACTION_MESSAGES.en).concat(Object.values(ACTION_MESSAGES.he)).map(sample).some((m) => /gemini|google ai studio|nominatim|migration|מיגרציית|supabase|postgres/i.test(m)))

    const refusal = await asActionResult(async () => { throw new UserFacingError('הגעת למגבלה') }, 'qa')
    const raw = await asActionResult(async () => { throw new Error('duplicate key value violates unique constraint "tracking_targets_pkey"') }, 'qa')
    const ok = await asActionResult(async () => ({ created: 2 }), 'qa')
    check('C4: a refusal written for the merchant is returned as written', refusal.ok === false && refusal.error === 'הגעת למגבלה')
    check('C5: a database message is NEVER returned — the localized "saving failed" is', raw.ok === false && !/duplicate key/.test(raw.error) && [ACTION_MESSAGES.he.saveFailed, ACTION_MESSAGES.en.saveFailed].includes(raw.error), raw.ok ? '' : raw.error)
    check('C6: a success is returned as a value', ok.ok === true && ok.created === 2)
    const leaky = async (work: () => Promise<unknown>) => { try { await work(); return { ok: true } } catch (e) { return { ok: false, error: (e as Error).message } } }
    const leaked = (await leaky(async () => { throw new Error('duplicate key value violates unique constraint') })) as { error?: string }
    check('MUTATION CONTROL: a wrapper that passes any error\'s message on is caught by C5\'s predicate', /duplicate key/.test(leaked.error ?? ''))

    const b = bilingualError('projectNameRequired')
    check('C7: the create routes answer in both languages', HEBREW.test(b.error) && !HEBREW.test(b.errorEn) && b.errorEn.length > 3)
    check('C8: a form picks the field for its own language, and falls back when there is none',
      apiErrorText(b, 'en', 'x') === b.errorEn && apiErrorText(b, 'he', 'x') === b.error && apiErrorText({ error: 'רק עברית' }, 'en', 'fallback') === 'fallback' && apiErrorText(null, 'he', 'fb') === 'fb')

    const ACTIONS = ['app/actions/projects.ts', 'app/actions/clients.ts', 'app/actions/tracking-targets.ts', 'app/api/projects/create/route.ts', 'app/api/clients/create/route.ts']
    const actionSrc = Object.fromEntries(ACTIONS.map((f) => [f, strip(read(f))]))
    const hardThrows = (files: Record<string, string>) => Object.entries(files).filter(([, s]) => LITERAL_THROW.test(s) || HEBREW.test(s)).map(([f]) => f)
    check(`C9: ${ACTIONS.length} action/route files hold no literal message and no Hebrew — only ACTION_MESSAGES`, hardThrows(actionSrc).length === 0, hardThrows(actionSrc).join(','))
    check('MUTATION CONTROL: throw new Error(\'לא מחובר\') is caught', hardThrows({ ...actionSrc, x: "throw new Error('לא מחובר')" }).includes('x'))
    check('MUTATION CONTROL: an English literal throw is caught too', hardThrows({ x: "throw new UserFacingError('Project not found')" }).includes('x'))
    const rawToClient = (s: string) => /\{\s*error:\s*message\s*\}|\$\{error\.message\}/.test(s)
    check('C10: no route or action returns a thrown or database message to the merchant', !Object.values(actionSrc).some(rawToClient))
    check('MUTATION CONTROL: `{ error: message }` is caught', rawToClient('return NextResponse.json({ error: message }, { status: 500 })'))

    const FORMS = { 'components/keywords/TrackingTargetForm.tsx': 'saveTrackingTargetsAction', 'components/projects/ProjectForm.tsx': 'saveProjectAction', 'components/clients/ClientForm.tsx': 'saveClientAction' } as const
    const formOk = (src: string, save: string) => new RegExp(`await ${save}\\(`).test(src) && !/\(err as Error\)\.message/.test(src) && !/errorData\.error\b/.test(src)
    for (const [f, save] of Object.entries(FORMS)) check(`C11: ${f} takes its error as a value (${save}), never err.message`, formOk(strip(read(f)), save))
    check('MUTATION CONTROL: a form printing (err as Error).message again is caught',
      !formOk(strip(read('components/keywords/TrackingTargetForm.tsx')) + '\nsetError((err as Error).message)', 'saveTrackingTargetsAction'))

    const tracking = strip(read('lib/seed-scan/tracking.ts'))
    check('C12: the seeding scan tells an entitlement outage by its code, not by the (now localized) text', /code === ENTITLEMENT_UNAVAILABLE_CODE/.test(tracking))
    const { EntitlementUnavailableError, KeywordQuotaError, ENTITLEMENT_UNAVAILABLE_CODE } = require(join(ROOT, 'lib/quota.ts'))
    const enOutage = new EntitlementUnavailableError('en')
    check('C13: the English outage carries the code and English text; a quota refusal keeps its code and class',
      enOutage.code === ENTITLEMENT_UNAVAILABLE_CODE && !HEBREW.test(enOutage.message) && new KeywordQuotaError('x').code === 'QUOTA_KEYWORDS_PER_PROJECT' && new KeywordQuotaError('x') instanceof Error)
  }

  // ── D) hard-coded strings on these screens ────────────────────────────────
  console.log('\nD) no hard-coded strings on the auth and dashboard screens')
  {
    const SCREENS = [
      ...walk('app/(auth)'), ...walk('app/(onboarding)'),
      ...walk('app/(dashboard)').filter((f) => !/\/(admin|reco-qa)\//.test(f)),
      ...walk('components').filter((f) => f.endsWith('.tsx') && !/^components\/(public|shopify|admin|free-check)\//.test(f)
        && !/components\/(PublicNav|Footer|LanguageSwitcher|Breadcrumbs|RichTextEditor|CookieConsent)\.tsx$/.test(f)),
    ].filter((f) => f.endsWith('.tsx'))
    const found = SCREENS.flatMap((f) => hardCoded(read(f)).map((h) => `${f}: ${h}`))
    check(`D1: ${SCREENS.length} auth/onboarding/dashboard files render no literal text or label (brand names aside)`, found.length === 0, found.slice(0, 8).join(' | '))
    const login = read('app/(auth)/login/page.tsx')
    check('MUTATION CONTROL: a literal "Forgot password?" on the sign-in page is caught', hardCoded(login.replace('</form>', '<p>Forgot password?</p></form>')).length === 1)
    // The logo is drawn by the shared auth frame now; its alt comes from the page's dictionary.
    const shell = read('components/auth/AuthShell.tsx')
    check('MUTATION CONTROL: the old alt="Go Top logo" is caught', hardCoded(shell.replace('alt={logoAlt}', 'alt="Go Top logo"')).length === 1)
    check('MUTATION CONTROL: a Hebrew literal label is caught', hardCoded('<button aria-label="סגור">x</button>').length === 1)
    check('MUTATION CONTROL: the old Hebrew-only priority tooltip is caught', hardCoded('<span role="tooltip">\n  התגית מציינת עדיפות למעקב, לא ציון הסריקה.\n</span>').length === 1)
    check('…while code such as `(s) => s.rate < 60` is not text', hardCoded('xs.filter((s) => s.rate < 60)').length === 0)

    const DICT_ONLY = ['components/keywords/TrackingTargetForm.tsx', 'components/content/ArticleContentEditor.tsx', 'components/layout/TrialBar.tsx', 'components/settings/Notice.tsx']
    const hebrewIn = DICT_ONLY.filter((f) => HEBREW.test(strip(read(f))))
    check('D2: the fixed dashboard components hold no Hebrew literal (their copy is in the dictionaries)', hebrewIn.length === 0, hebrewIn.join(','))
    check('MUTATION CONTROL: the old Hebrew ZIP message back in the keyword form is caught',
      HEBREW.test(strip(read(DICT_ONLY[0])) + "\nsetValidationError('ZIP code חייב להיות בדיוק 5 ספרות')"))
    const auto = strip(read('components/content/AutomationIdeas.tsx'))
    check('D3: the ideas screen names no provider to the merchant (Gemini API / Google AI Studio)', !/Gemini API|Google AI Studio/.test(auto) && /t\.aiUnavailable/.test(auto))
    check('MUTATION CONTROL: the old provider message is caught', /Gemini API|Google AI Studio/.test(auto + "\nsetMessage({ text: 'יתרת Gemini API הסתיימה' })"))
  }

  // ── E) the dashboard dictionaries stay in step ─────────────────────────────
  console.log('\nE) the dashboard dictionaries carry every new key in both languages')
  {
    const { getDashboardDictionary } = require(join(ROOT, 'lib/i18n/dashboard/getDashboardDictionary.ts'))
    const he = getDashboardDictionary('he'), en = getDashboardDictionary('en')
    const pairs: [string, string][] = [
      [he.trialBar.upgrade, en.trialBar.upgrade], [he.articleEditorToolbar.insertTable, en.articleEditorToolbar.insertTable],
      [he.trackingTargetForm.errorRadiusZipRequired, en.trackingTargetForm.errorRadiusZipRequired], [he.trackingTargetForm.errorRadiusZipFormat, en.trackingTargetForm.errorRadiusZipFormat],
      [he.contentHub.autoIdeas.aiUnavailable, en.contentHub.autoIdeas.aiUnavailable], [he.common.notAvailable, en.common.notAvailable],
      [he.sidebar.logoAlt, en.sidebar.logoAlt], [he.scans.details.auditRequest, en.scans.details.auditRequest],
    ]
    const bad = pairs.filter(([h, e]) => !(typeof h === 'string' && typeof e === 'string' && HEBREW.test(h) && !HEBREW.test(e)))
    check(`E1: ${pairs.length} new entries are Hebrew in Hebrew and English in English`, bad.length === 0, bad.map((p) => p.join(' / ')).join(' | '))
    const keysDeep = (o: any, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keysDeep(v, `${p}${k}.`) : [`${p}${k}`]))
    const heK = new Set(keysDeep(he)), enK = new Set(keysDeep(en))
    const onlyHe = [...heK].filter((k) => !enK.has(k) && /^(trialBar|articleEditorToolbar|common|sidebar|scans|trackingTargetForm|contentHub\.autoIdeas)\b/.test(k))
    const onlyEn = [...enK].filter((k) => !heK.has(k) && /^(trialBar|articleEditorToolbar|common|sidebar|scans|trackingTargetForm|contentHub\.autoIdeas)\b/.test(k))
    check('E2: the sections this pass touched have the same keys in both languages', onlyHe.length === 0 && onlyEn.length === 0, [...onlyHe, ...onlyEn].slice(0, 6).join(','))
  }

  Mod._load = origLoad
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
