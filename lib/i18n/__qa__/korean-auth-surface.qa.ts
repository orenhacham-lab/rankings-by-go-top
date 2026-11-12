/**
 * THE KOREAN SITE'S CALL TO ACTION ACTUALLY LEADS SOMEWHERE.
 *
 * THE DEFECT. The eleventh locale shipped with a public tree, a dashboard
 * dictionary and complete Korean words in every auth form — `SIGNUP_UI.ko`,
 * the login form's `ko`, `PASSWORD_UI.ko` — and with NO /ko routes under
 * (auth). `authHref` builds every auth link from `LOCALE_PREFIX`, so the
 * Korean pricing page's one button, the free trial, pointed at `/ko/signup`,
 * and `/ko/signup` was a 404. The trial is the whole reason the legal thread
 * let the locale go live as a marketing-and-trial site, so this was not a
 * polish item: it blocked the flag.
 *
 * WHAT IS GUARDED, and deliberately not only for Korean. The invariant is
 * between two tables that no compiler relates: the prefix a link is built from
 * and the routes that exist on disk. A locale that has one without the other is
 * either a 404 behind a button or a URL whose language nothing can read. So the
 * check runs over EVERY public locale, and the twelfth will be held to it
 * without anyone remembering to add a line.
 *
 * MUTATION CONTROLS throughout.
 *
 * Run: npx tsx lib/i18n/__qa__/korean-auth-surface.qa.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { authHref } from '../auth-href'
import { resolveAuthLocale } from '../auth-locale'
import { isKoreanPath, routePublicLocale } from '../request-locale'
import { LOCALE_PREFIX, PUBLIC_LOCALES, type PublicLocale } from '../locales'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const here = (rel: string) => existsSync(join(ROOT, rel))
const HANGUL = /[가-힯]/

/** Where a link of ours lands on disk, for a locale whose prefix is not ''. */
const routeFileFor = (locale: PublicLocale, page: string) =>
  `app/(auth)${LOCALE_PREFIX[locale]}/${page}/page.tsx`

const AUTH_PAGES = ['signup', 'login', 'forgot-password'] as const

console.log('\nA. every locale a link can be built for has the routes that link points at')
for (const locale of PUBLIC_LOCALES) {
  if (LOCALE_PREFIX[locale] === '') continue // Hebrew uses the bare routes and ?lang
  check(`A1 (${locale}): the three linked auth pages exist on disk`,
    AUTH_PAGES.every((page) => here(routeFileFor(locale, page))),
    AUTH_PAGES.filter((page) => !here(routeFileFor(locale, page))).join(', '))
  check(`A2 (${locale}): and the link authHref builds is exactly that path`,
    AUTH_PAGES.every((page) => authHref(page, locale).split('?')[0] === `${LOCALE_PREFIX[locale]}/${page}`))
  // English is the fallback the contract ends at (lib/i18n/request-locale.ts),
  // so it is never behind a flag and has no gate to check.
  if (locale !== 'en') {
    check(`A3 (${locale}): the tree has ONE gate, so a new page cannot forget to be gated`,
      here(`app/(auth)${LOCALE_PREFIX[locale]}/layout.tsx`)
      && /notFound\(\)/.test(code(`app/(auth)${LOCALE_PREFIX[locale]}/layout.tsx`)))
  }
}
check('A-MUT: the check would fail a locale whose route file is missing',
  !here('app/(auth)/xx/signup/page.tsx'))

console.log('\nB. Korean specifically, because it is the one that was broken')
check('B1: /ko/signup, /ko/login, /ko/forgot-password and /ko/reset-password all exist',
  ['signup', 'login', 'forgot-password', 'reset-password'].every((p) => here(`app/(auth)/ko/${p}/page.tsx`)))
check('B2: the gate is the Korean site flag, the same one the public tree uses',
  /koreanSiteEnabled\(\)/.test(code('app/(auth)/ko/layout.tsx'))
  && /koreanSiteEnabled\(\)/.test(code('app/(public)/ko/layout.tsx')))
check('B3: with the flag OFF the URLs are not Korean, so nothing labels a 404 ko',
  isKoreanPath('/ko/signup', false) === false)
check('B4: with the flag ON the route says its own language, in both readers',
  isKoreanPath('/ko/signup', true) === true
  && resolveAuthLocale({ pathname: '/ko/signup' }) === (isKoreanPath('/ko/signup') ? 'ko' : 'he'))
check('B5: the auth pages reuse the shared forms rather than copying them',
  /from '\.\.\/\.\.\/signup\/page'/.test(code('app/(auth)/ko/signup/page.tsx'))
  && /from '\.\.\/\.\.\/login\/page'/.test(code('app/(auth)/ko/login/page.tsx'))
  && /components\/auth\/ForgotPasswordForm/.test(code('app/(auth)/ko/forgot-password/page.tsx'))
  && /components\/auth\/ResetPasswordForm/.test(code('app/(auth)/ko/reset-password/page.tsx')))

console.log('\nC. the words were already there, which is why this was only routing')
check('C1: the signup form carries a Korean dictionary, in Korean',
  (() => {
    const src = read('app/(auth)/signup/page.tsx')
    const at = src.indexOf('\n  ko: {')
    return at > 0 && HANGUL.test(src.slice(at, at + 2000))
  })())
check('C2: so does the login form',
  (() => {
    const src = read('app/(auth)/login/page.tsx')
    const at = src.indexOf('\n  ko: {')
    return at > 0 && HANGUL.test(src.slice(at, at + 1500))
  })())
check('C3: and the password screens',
  (() => {
    const src = read('lib/i18n/auth-password.ts')
    const at = src.indexOf('\n  ko: {')
    return at > 0 && HANGUL.test(src.slice(at, at + 1500))
  })())

console.log('\nD. the two readers that decide a page\'s language both know ko')
check('D1: resolveAuthLocale has the branch',
  /isKoreanPath\(input\.pathname\)\) return 'ko'/.test(code('lib/i18n/auth-locale.ts')))
check('D2: routePublicLocale has it too, so the document says lang="ko"',
  /isKoreanPath\(p\)\) return 'ko'/.test(code('lib/i18n/request-locale.ts')))
check('D3: and with the flag on, a /ko document is Korean rather than Hebrew',
  routePublicLocale('/ko/pricing') === (isKoreanPath('/ko/pricing') ? 'ko' : null))
check('D-MUT1: dropping the auth branch is caught',
  !/isKoreanPath\(input\.pathname\)\) return 'ko'/.test(
    code('lib/i18n/auth-locale.ts').replace(/if \(isKoreanPath\(input\.pathname\)\) return 'ko'\n/g, '')))
check('D-MUT2: dropping the document branch is caught',
  !/isKoreanPath\(p\)\) return 'ko'/.test(
    code('lib/i18n/request-locale.ts').replace(/if \(isKoreanPath\(p\)\) return 'ko'\n/g, '')))
check('D-MUT3: a gate that is not the Korean flag is caught',
  !/koreanSiteEnabled\(\)/.test(
    code('app/(auth)/ko/layout.tsx').replace(/koreanSiteEnabled\(\)/g, 'true')))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
