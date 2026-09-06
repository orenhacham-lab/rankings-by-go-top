/**
 * THE AUTH SURFACE renders in the request's language, on the server, before
 * hydration.
 *
 * WHAT THE LAST ACCEPTANCE PASS MISSED. /login was recorded as English because
 * the response carried `<html lang="en" dir="ltr">` and an English <title>.
 * The BODY was Hebrew. Correct attributes over Hebrew copy is worse than either
 * error alone: it tells a crawler and a screen reader to read Hebrew as English.
 *
 * THE CAUSE was one line, in both auth pages:
 *
 *     const lang = langParam === 'en' || pathname?.startsWith('/en/') ? 'en' : 'he'
 *
 * Both pages already carried COMPLETE Hebrew and English dictionaries — labels,
 * placeholders, validation messages, provider errors, success states, footer
 * links. Nothing needed translating. The selector simply never consulted the
 * request contract, so everything that was not an /en URL or an explicit ?lang
 * got Hebrew.
 *
 * WHAT IS PROVEN HERE. renderToStaticMarkup runs the REAL page components with
 * NO effects — the state a reviewer stares at during load — through the REAL
 * AuthLocaleProvider the layout supplies.
 *
 * Run: npx tsx lib/i18n/__qa__/auth-surface-language.qa.ts
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolveAuthLocale } from '../auth-locale'
import type { Locale } from '../locales'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const HEBREW = /[֐-׿]/
/** React escapes &, <, >, " and ' in text; compare against what is emitted. */
const esc = (v: string) => v
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

/*
 * Next's router hooks are the ONLY substitution. During a real SSR they return
 * the request's own pathname and query; here they are driven explicitly so each
 * route/?lang combination can be exercised. Everything else — the provider, the
 * pages, their dictionaries — is the real code.
 */
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

const { AuthLocaleProvider } = require(join(ROOT, 'components/auth/AuthLocaleProvider.tsx'))
const LOGIN = require(join(ROOT, 'app/(auth)/login/page.tsx'))
const SIGNUP = require(join(ROOT, 'app/(auth)/signup/page.tsx'))
const EN_LOGIN = require(join(ROOT, 'app/(auth)/en/login/page.tsx'))
const EN_SIGNUP = require(join(ROOT, 'app/(auth)/en/signup/page.tsx'))

/** The dictionaries the pages actually ship, read out of their own source. */
function uiStrings(rel: string, locale: Locale): Record<string, string> {
  const src = read(rel)
  const block = src.slice(src.indexOf(`  ${locale}: {`))
  const out: Record<string, string> = {}
  const body = block.slice(0, block.indexOf('\n  },'))
  // Both quote styles: a value containing an apostrophe is written with double
  // quotes ("Don't have an account?"), and reading only one style silently
  // dropped it from the audit.
  for (const m of body.matchAll(/^\s{4}(\w+): '((?:[^'\\]|\\.)*)',$/gm)) out[m[1]] = m[2].replace(/\\'/g, "'")
  for (const m of body.matchAll(/^\s{4}(\w+): "((?:[^"\\]|\\.)*)",$/gm)) out[m[1]] = m[2].replace(/\\"/g, '"')
  return out
}

/** Render a page through the REAL provider, with NO effects executed. */
function firstRender(Page: any, serverLocale: Locale, pathname: string, search = ''): string {
  PATHNAME = pathname
  SEARCH = new URLSearchParams(search)
  return renderToStaticMarkup(
    createElement(AuthLocaleProvider as never, { locale: serverLocale, children: createElement(Page as never) } as never) as never,
  )
}

async function main() {
  // ── A) the selector ────────────────────────────────────────────────────────
  console.log('A) the language selector now consults the request contract')
  {
    check('A1: the server-resolved locale decides a bare /login',
      resolveAuthLocale({ pathname: '/login', serverLocale: 'en' }) === 'en'
      && resolveAuthLocale({ pathname: '/login', serverLocale: 'he' }) === 'he')
    check('A2: the /en route still decides for itself, over everything',
      resolveAuthLocale({ pathname: '/en/login', serverLocale: 'he', langParam: 'he' }) === 'en')
    check('A3: an explicit ?lang still overrides the server locale',
      resolveAuthLocale({ pathname: '/login', langParam: 'en', serverLocale: 'he' }) === 'en'
      && resolveAuthLocale({ pathname: '/login', langParam: 'he', serverLocale: 'en' }) === 'he')
    check('A4: a junk ?lang is ignored, not obeyed',
      resolveAuthLocale({ pathname: '/login', langParam: 'zz', serverLocale: 'en' }) === 'en')
    check('A5: with no signal at all it stays Hebrew (unchanged legacy default)',
      resolveAuthLocale({ pathname: '/login' }) === 'he')
    // The OLD selector, for contrast: it could not see the server locale at all.
    const oldSelector = (pathname: string, langParam: string | null) =>
      (langParam === 'en' || pathname.startsWith('/en/') ? 'en' : 'he')
    check('A6: the OLD selector answered Hebrew for an English-resolved /login',
      oldSelector('/login', null) === 'he')
  }

  // ── B) /login, both languages, first render ────────────────────────────────
  console.log('\nB) /login — the complete visible surface')
  {
    const en = uiStrings('app/(auth)/login/page.tsx', 'en')
    const he = uiStrings('app/(auth)/login/page.tsx', 'he')
    check('B0: both dictionaries were parsed out of the page',
      Object.keys(en).length >= 10 && Object.keys(he).length >= 10,
      `${Object.keys(en).length}/${Object.keys(he).length}`)

    const enHtml = firstRender(LOGIN.default, 'en', '/login')
    for (const key of ['heading', 'emailLabel', 'passwordLabel', 'loginBtn', 'dontHaveAccount', 'startTrial', 'subtitle', 'accessibility', 'privacy', 'articles']) {
      check(`B1-${key}: English "${en[key]}" is in the FIRST render`, enHtml.includes(esc(en[key])), en[key])
    }
    check('B2: NOT ONE Hebrew character appears',
      !HEBREW.test(enHtml), (enHtml.match(/[֐-׿][^<]*/g) ?? []).slice(0, 5).join(' | '))
    const mainDir = (html: string) => (html.match(/<main[^>]*\sdir="(rtl|ltr)"/) ?? [])[1]
    check('B3: the page direction agrees', mainDir(enHtml) === 'ltr', mainDir(enHtml))
    check('B4: the footer links point at the English tree',
      enHtml.includes('/en/privacy') && enHtml.includes('/en/accessibility') && !enHtml.includes('href="/privacy"'))
    check('B5: the sign-up link points at the English signup', enHtml.includes('/en/signup'))

    const heHtml = firstRender(LOGIN.default, 'he', '/login')
    for (const key of ['heading', 'emailLabel', 'passwordLabel', 'loginBtn', 'dontHaveAccount']) {
      check(`B6-${key}: Hebrew "${he[key]}" is in the FIRST render`, heHtml.includes(esc(he[key])), he[key])
    }
    check('B7: …and the English copy is absent', !heHtml.includes(en.heading) && !heHtml.includes(en.emailLabel))
    // The email/password inputs carry their own dir="ltr" by design; the PAGE's
    // direction is what must follow the language.
    check('B8: direction agrees', mainDir(heHtml) === 'rtl', mainDir(heHtml))
    check('B9: the Hebrew render points at the Hebrew legal tree',
      heHtml.includes('href="/privacy"') && !heHtml.includes('/en/privacy'))
    check('B10: the two renders genuinely differ', enHtml !== heHtml)

    // The /en route, whatever the server resolved.
    const enRoute = firstRender(EN_LOGIN.default, 'he', '/en/login')
    check('B11: /en/login is English even when the server resolved Hebrew',
      enRoute.includes(en.heading) && !HEBREW.test(enRoute), (enRoute.match(/[֐-׿][^<]*/g) ?? []).slice(0, 3).join(' | '))
    // The ?lang the OAuth callback and the English sitemap still send.
    const langQuery = firstRender(LOGIN.default, 'he', '/login', 'lang=en')
    check('B12: ?lang=en still works on the Hebrew route', langQuery.includes(en.heading) && !HEBREW.test(langQuery))
  }

  // ── C) /signup, both languages, incl. validation and success copy ─────────
  console.log('\nC) /signup — labels, validation and success states')
  {
    const en = uiStrings('app/(auth)/signup/page.tsx', 'en')
    const he = uiStrings('app/(auth)/signup/page.tsx', 'he')
    const enHtml = firstRender(SIGNUP.default, 'en', '/signup')
    for (const key of ['heading', 'fullName', 'email', 'companyName', 'phone', 'password', 'confirmPassword', 'termsCheckbox', 'signupBtn', 'trialBadge', 'alreadyHaveAccount', 'signIn']) {
      check(`C1-${key}: English "${en[key]}" is in the FIRST render`, enHtml.includes(esc(en[key])), en[key])
    }
    check('C2: NOT ONE Hebrew character appears',
      !HEBREW.test(enHtml), (enHtml.match(/[֐-׿][^<]*/g) ?? []).slice(0, 5).join(' | '))
    check('C3: direction agrees', /<main[^>]*\sdir="ltr"/.test(enHtml))
    const heHtml = firstRender(SIGNUP.default, 'he', '/signup')
    check('C4: the Hebrew render carries the Hebrew copy and the RTL direction',
      heHtml.includes(he.heading) && heHtml.includes(he.signupBtn) && /<main[^>]*\sdir="rtl"/.test(heHtml))
    check('C5: /en/signup is English even when the server resolved Hebrew',
      firstRender(EN_SIGNUP.default, 'he', '/en/signup').includes(en.heading))

    // VALIDATION + PROVIDER ERROR + SUCCESS copy, both languages, read out of the
    // nested err:/success: blocks the component renders into its alert regions.
    const nested = (locale: Locale, group: 'err' | 'success'): Record<string, string> => {
      const src = read('app/(auth)/signup/page.tsx')
      const localeBlock = src.slice(src.indexOf(`  ${locale}: {`))
      const groupStart = localeBlock.indexOf(`    ${group}: {`)
      const body = localeBlock.slice(groupStart, localeBlock.indexOf('\n    },', groupStart))
      const out: Record<string, string> = {}
      for (const m of body.matchAll(/^\s{6}(\w+): '((?:[^'\\]|\\.)*)',$/gm)) out[m[1]] = m[2].replace(/\\'/g, "'")
      return out
    }
    const enErr = nested('en', 'err'), heErr = nested('he', 'err')
    const enOk = nested('en', 'success'), heOk = nested('he', 'success')
    check('C6-0: both err dictionaries were parsed', Object.keys(enErr).length >= 8 && Object.keys(heErr).length >= 8,
      `${Object.keys(enErr).length}/${Object.keys(heErr).length}`)
    for (const k of Object.keys(heErr)) {
      check(`C6-${k}: the validation/error message exists in BOTH languages and differs`,
        (enErr[k] ?? '').length > 3 && (heErr[k] ?? '').length > 3 && enErr[k] !== heErr[k]
        && !HEBREW.test(enErr[k] ?? '') && HEBREW.test(heErr[k] ?? ''),
        `${enErr[k]} / ${heErr[k]}`)
    }
    for (const k of Object.keys(heOk)) {
      check(`C7-${k}: the success message exists in both languages`,
        (enOk[k] ?? '').length > 3 && !HEBREW.test(enOk[k] ?? '') && HEBREW.test(heOk[k] ?? ''),
        `${enOk[k]} / ${heOk[k]}`)
    }
  }

  // ── D) the LOADING state ───────────────────────────────────────────────────
  console.log('\nD) the loading state')
  {
    // The submit button renders `loading` through the shared Button, whose busy
    // state is an aria-hidden spinner plus the SAME label — so a loading form is
    // still in the request's language, and carries no Hebrew of its own.
    const btn = read('components/ui/Button.tsx')
    check('D1: the shared Button contributes no language of its own while loading',
      !HEBREW.test(btn), (btn.match(/[֐-׿][^<]*/g) ?? []).slice(0, 3).join(' | '))
    check('D2: …and the Suspense fallback both pages use is text-free',
      /fallback=\{<div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100" \/>\}/.test(read('app/(auth)/login/page.tsx'))
      && /fallback=\{<div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100" \/>\}/.test(read('app/(auth)/signup/page.tsx')))
    const enHtml = firstRender(LOGIN.default, 'en', '/login')
    check('D3: the submit control renders its English label, not a Hebrew one',
      enHtml.includes(uiStrings('app/(auth)/login/page.tsx', 'en').loginBtn))
  }

  // ── E) the layout actually supplies the locale ─────────────────────────────
  console.log('\nE) the server layout is what feeds it')
  {
    const layout = read('app/(auth)/layout.tsx')
    check('E1: the (auth) layout resolves the locale with the SAME server resolver',
      /await getServerLocale\(\)/.test(layout) && /from '@\/lib\/i18n\/server-locale'/.test(layout))
    check('E2: …and provides it to the forms', /<AuthLocaleProvider locale=\{locale\}>/.test(layout))
    const provider = read('components/auth/AuthLocaleProvider.tsx')
    check('E3: the provider holds a value only — no state, no effect, so SSR and the first client render agree',
      !/useState|useEffect/.test(provider))
    for (const p of ['app/(auth)/login/page.tsx', 'app/(auth)/signup/page.tsx']) {
      check(`E4: ${p} reads it through the shared resolver`,
        /resolveAuthLocale\(\{ pathname, langParam, serverLocale \}\)/.test(read(p))
        && /useAuthServerLocale\(\)/.test(read(p)))
    }
  }

  // ── F) REGRESSION GUARD + MUTATION CONTROL ────────────────────────────────
  console.log('\nF) guard and mutation control')
  {
    const { execSync } = require('child_process')
    // Every Hebrew string in the auth pages must live inside the `he:` block.
    for (const rel of ['app/(auth)/login/page.tsx', 'app/(auth)/signup/page.tsx']) {
      const src = read(rel)
      const heBlockStart = src.indexOf('  he: {')
      const heBlockEnd = src.indexOf('\n  },', heBlockStart)
      const outside = src.slice(0, heBlockStart) + src.slice(heBlockEnd)
      check(`F1: ${rel} has NO Hebrew outside its he: dictionary`,
        !HEBREW.test(outside), (outside.match(/[֐-׿][^\n]{0,40}/g) ?? []).slice(0, 4).join(' | '))
    }
    check('F2: neither page hard-codes the old Hebrew-defaulting selector',
      !/\? 'en' : 'he'/.test(read('app/(auth)/login/page.tsx'))
      && !/\? 'en' : 'he'/.test(read('app/(auth)/signup/page.tsx')))
    // Scanned in JS: grep matches BYTES here, so an em-dash in a comment reads as
    // a hit and the guard would be noise instead of a guard.
    const sharedFiles = execSync(`find components/auth "app/(auth)" -name '*.tsx' | sort`, { cwd: ROOT, encoding: 'utf8' })
      .trim().split('\n')
      .filter((f: string) => f && f !== 'app/(auth)/login/page.tsx' && f !== 'app/(auth)/signup/page.tsx')
    check('F3-0: the shared auth files were found', sharedFiles.length >= 4, JSON.stringify(sharedFiles))
    const withHebrew = sharedFiles.filter((f: string) => HEBREW.test(read(f)))
    check('F3: the shared auth components contain no hard-coded Hebrew at all',
      withHebrew.length === 0, JSON.stringify(withHebrew))

    // MUTATION: put one Hebrew label back where the English render can reach it.
    const en = uiStrings('app/(auth)/login/page.tsx', 'en')
    const he = uiStrings('app/(auth)/login/page.tsx', 'he')
    const mutatedDict = { ...en, heading: he.heading }
    const mutatedHtml = firstRender(LOGIN.default, 'en', '/login').replace(en.heading, mutatedDict.heading)
    check('F4: restoring ONE Hebrew label makes the English assertion fail (B2 is not vacuous)',
      HEBREW.test(mutatedHtml) && mutatedHtml.includes(he.heading))
    check('F5: …while the unmutated render passes it', !HEBREW.test(firstRender(LOGIN.default, 'en', '/login')))
  }

  // ── G) every dashboard consumer is inside its provider ────────────────────
  console.log('\nG) provider coverage')
  {
    const { execSync } = require('child_process')
    const consumers = execSync(
      `grep -rl "useDashboardLanguage()" --include=*.tsx app components || true`,
      { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter((x: string) => !!x)
    check('G1: the audit found the consumers', consumers.length > 40, String(consumers.length))
    const stray = consumers.filter((f: string) => /^app\/\((auth|public|legal)\)\//.test(f) || /^app\/shopify\//.test(f))
    check('G2: NO consumer sits on an auth, public, legal or Shopify route — those have no dashboard provider',
      stray.length === 0, JSON.stringify(stray))
    const dashLayout = read('app/(dashboard)/layout.tsx')
    check('G3: the dashboard layout wraps every one of its routes in the provider',
      /<DashboardLanguageProvider initialLocale=\{initialLocale\}>/.test(dashLayout))
    check('G4: the auth pages do NOT use the dashboard hook — they take the locale as a prop',
      !/useDashboardLanguage\(\)/.test(read('app/(auth)/login/page.tsx'))
      && !/useDashboardLanguage\(\)/.test(read('app/(auth)/signup/page.tsx')))
    const hook = read('lib/i18n/dashboard/useDashboardLanguage.tsx')
    check('G5: a missing provider throws in development instead of guessing',
      /if \(process\.env\.NODE_ENV !== 'production'\) throw new Error\(message\)/.test(hook))
    const hookCode = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    check('G6: …and production returns ONE constant, identical on server and client',
      /return REQUEST_FALLBACK_LOCALE/.test(hookCode) && !/document\.documentElement\.lang/.test(hookCode))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
