/**
 * The signed-out pages and the "missing / broken" pages on the design contract
 * (§1, §2, §5, §7, §8, §13), checked by rendering the REAL pages (react-dom/
 * server, the real AuthLocaleProvider and dictionaries) and from source:
 *   A) sign in, sign up, forgot and reset password (he + en) all draw the
 *      paper-canvas AuthShell: one surface card, the task as the one H1, no
 *      gradient, no raw colour, no glyph separators;
 *   B) their controls are the primitives: ui/Input, ui/Button, ui/Checkbox for
 *      the terms, ui/Notice for errors and confirmations (alert/status);
 *   C) no public overlay (cookie banner, WhatsApp, accessibility button) on any
 *      auth route, in either language;
 *   D) 404, the dashboard error boundary and the global error page are branded,
 *      follow the language, and never print the error's own text;
 *   E) the workspace switcher and the guide use at most 6 type sizes, all tokens.
 * Every check has a mutation control.
 *   npx tsx components/auth/__qa__/auth-shell.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Locale } from '../../../lib/i18n/locales'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const HEBREW = /[֐-׿]/
const count = (s: string, re: RegExp) => (s.match(new RegExp(re.source, 'g')) ?? []).length

// Next's router hooks are the only substitution (as in lib/i18n/__qa__/auth-surface-language.qa.ts).
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
const { DashboardLanguageProvider } = require(join(ROOT, 'lib/i18n/dashboard/useDashboardLanguage.tsx'))
const { shouldRenderPublicWidgets } = require(join(ROOT, 'components/public/PublicSiteWidgets.tsx'))
const PAGES: Record<string, any> = {
  '/login': require(join(ROOT, 'app/(auth)/login/page.tsx')).default,
  '/signup': require(join(ROOT, 'app/(auth)/signup/page.tsx')).default,
  '/forgot-password': require(join(ROOT, 'app/(auth)/forgot-password/page.tsx')).default,
  '/reset-password': require(join(ROOT, 'app/(auth)/reset-password/page.tsx')).default,
  '/en/login': require(join(ROOT, 'app/(auth)/en/login/page.tsx')).default,
  '/en/signup': require(join(ROOT, 'app/(auth)/en/signup/page.tsx')).default,
  '/en/forgot-password': require(join(ROOT, 'app/(auth)/en/forgot-password/page.tsx')).default,
  '/en/reset-password': require(join(ROOT, 'app/(auth)/en/reset-password/page.tsx')).default,
}
const DashboardError = require(join(ROOT, 'app/(dashboard)/error.tsx')).default

function renderAuth(path: string, search = '', locale: Locale = path.startsWith('/en') ? 'en' : 'he'): string {
  PATHNAME = path
  SEARCH = new URLSearchParams(search)
  return renderToStaticMarkup(h(AuthLocaleProvider as never, { locale, children: h(PAGES[path]) } as never) as never)
}

const RAW = /(?<![\w-])(?:[\w-]+:)*(?:bg|text|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
const BANNED = /\btext-(?:xs|sm|base|lg|xl|2xl)\b|\bshadow-(?:sm|md|lg|xl|2xl)\b|\brounded-(?:md|lg|xl|2xl|3xl)\b|\bbg-gradient-|\btransition-all\b/

// ── A) one frame for every auth page ──────────────────────────────────────────
console.log('A) the paper-canvas AuthShell')
const rendered = Object.fromEntries(Object.keys(PAGES).map((p) => [p, renderAuth(p)]))
{
  const shell = (s: string) => /<main[^>]*data-auth-shell[^>]*class="[^"]*\bbg-canvas\b/.test(s)
    && count(s, /rounded-card border border-line bg-surface/) === 1 && !BANNED.test(s) && !RAW.test(s)
  for (const [path, html] of Object.entries(rendered)) check(`A1 ${path}: canvas, one surface card, no gradient/raw colour/banned class`, shell(html))
  check('MUT: the old gradient page fails A1', !shell(rendered['/login'].replace('bg-canvas', 'bg-gradient-to-br from-blue-50 to-slate-100')))
  const oneH1 = (s: string) => count(s, /<h1\b/) === 1 && /<h1 class="text-title font-bold tracking-tight text-ink"/.test(s)
  for (const [path, html] of Object.entries(rendered)) check(`A2 ${path}: one H1, on the title token`, oneH1(html))
  check('MUT: the brand as a second H1 fails A2', !oneH1(rendered['/login'].replace('<p class="mt-3', '<h1 class="mt-3')))
  const language = (path: string, s: string) => (path.startsWith('/en') ? !HEBREW.test(s) && /dir="ltr"/.test(s) : HEBREW.test(s) && /<main[^>]*dir="rtl"/.test(s))
  check('A3: each page speaks its route\'s language and direction', Object.entries(rendered).every(([p, s]) => language(p, s)))
  check('MUT: an English page with Hebrew in it fails A3', !language('/en/login', rendered['/en/login'] + 'כניסה'))
  const noGlyph = (s: string) => !/[•←→✕✓]/.test(s.replace(/placeholder="[^"]*"/g, ''))
  check('A4: no glyph separators or arrows (the footer dots are drawn, the back link is lucide)', Object.values(rendered).every(noGlyph))
  check('MUT: the old "•" separator fails A4', !noGlyph(rendered['/login'].replace('</nav>', '<span>•</span></nav>')))
  const src = strip(read('components/auth/AuthShell.tsx'))
  const tokensOnly = (s: string) => !RAW.test(s) && !BANNED.test(s)
  check('A5: AuthShell source is tokens only', tokensOnly(src))
  check('MUT: a raw slate in AuthShell fails A5', !tokensOnly(src + ' text-slate-800'))
}

// ── B) primitives ─────────────────────────────────────────────────────────────
console.log('\nB) the controls are the primitives')
{
  const signupSrc = strip(read('app/(auth)/signup/page.tsx'))
  const usesCheckbox = (s: string) => /<Checkbox\b[\s\S]*?id="terms"/.test(s) && !/<input\b[^>]*type="checkbox"/.test(s)
  check('B1: the terms box is ui/Checkbox (id="terms" kept for the journeys)', usesCheckbox(signupSrc))
  check('MUT: a native checkbox back fails B1', !usesCheckbox(signupSrc.replace('<Checkbox', '<input type="checkbox"')))
  const box = rendered['/signup']
  check('B2: …and it renders on tokens', /id="terms"[^>]*class="[^"]*appearance-none[^"]*border-line-strong/.test(box) || /class="[^"]*appearance-none[^"]*border-line-strong[^"]*"[^>]*id="terms"/.test(box) || (/id="terms"/.test(box) && /appearance-none/.test(box)))
  const err = renderAuth('/login', 'error=oauth')
  const alertNotice = (s: string) => /role="alert"[^>]*data-notice="bad"/.test(s) && /rounded-inset/.test(s)
  check('B3: a sign-in error is a bad ui/Notice (role=alert)', alertNotice(err))
  check('MUT: the old red box fails B3', !alertNotice(err.replace('data-notice="bad"', 'class="bg-red-50"')))
  const forgotErr = renderAuth('/forgot-password', 'error=link')
  check('B4: the forgot-password link error is a bad ui/Notice', alertNotice(forgotErr))
  const pages = ['app/(auth)/login/page.tsx', 'app/(auth)/signup/page.tsx', 'components/auth/ForgotPasswordForm.tsx', 'components/auth/ResetPasswordForm.tsx'].map((f) => strip(read(f)))
  const noHandBoxes = (list: string[]) => list.every((s) => !/role="(?:alert|status)"/.test(s) && /NoticeBox/.test(s))
  check('B5: no hand-made alert/status boxes left in the auth pages', noHandBoxes(pages))
  check('MUT: a hand-made role="alert" div fails B5', !noHandBoxes([...pages, '<div role="alert" className="p-3">x</div> NoticeBox']))
  const button = strip(read('components/auth/GoogleSignInButton.tsx'))
  check('B6: the Google button is on tokens (its logo keeps Google\'s own colours)', !RAW.test(button) && !BANNED.test(button) && /bg-surface/.test(button))
}

// ── C) no public overlays on auth routes ──────────────────────────────────────
console.log('\nC) nothing floats over an auth form')
{
  const routes = Object.keys(PAGES)
  const hidden = (fn: (auth: boolean, p: string) => boolean) => routes.every((p) => fn(false, p) === false && fn(false, `${p}/x`) === false)
  check(`C1: the cookie banner, WhatsApp and accessibility floats are off on all ${routes.length} auth routes`, hidden(shouldRenderPublicWidgets))
  check('C2: …and still on for the public site', shouldRenderPublicWidgets(false, '/') === true && shouldRenderPublicWidgets(false, '/en/pricing') === true)
  check('MUT: a gate that forgets /forgot-password fails C1', !hidden((a, p) => (p.includes('forgot-password') ? true : shouldRenderPublicWidgets(a, p))))
}

// ── D) branded 404 / error pages ──────────────────────────────────────────────
console.log('\nD) 404, the screen error and the global error')
{
  const secret = new Error('upstream 500: relation "profiles" does not exist') as Error & { digest?: string }
  secret.digest = '3141592653'
  const renderError = (locale: Locale) => renderToStaticMarkup(h(DashboardLanguageProvider as never, { initialLocale: locale, children: h(DashboardError, { error: secret, retry: () => {} }) } as never) as never)
  const he = renderError('he'), en = renderError('en')
  const safe = (s: string) => !s.includes('relation') && !s.includes('upstream') && s.includes('3141592653')
  check('D1: the screen error never prints the error\'s text (only its digest, for support)', safe(he) && safe(en))
  check('MUT: printing error.message fails D1', !safe(he + secret.message))
  const branded = (s: string) => /data-status-screen/.test(s) && /rounded-card border border-line bg-surface/.test(s) && /size-10 items-center justify-center rounded-inset bg-action-soft text-action/.test(s)
    && count(s, /<h1\b/) === 1 && /<button[^>]*>[^<]*<\/button>/.test(s)
  check('D2: branded card, icon squircle, one H1, a retry button', branded(he) && branded(en))
  check('MUT: a bare "Something went wrong" fails D2', !branded('<div><h2>Something went wrong!</h2></div>'))
  check('D3: Hebrew and English follow the dashboard language', HEBREW.test(he) && !HEBREW.test(en) && /dir="rtl"/.test(he) && /dir="ltr"/.test(en))
  const files = ['app/not-found.tsx', 'app/(dashboard)/error.tsx', 'app/global-error.tsx', 'components/layout/StatusScreen.tsx'].map((f) => strip(read(f)))
  const noRaw = (list: string[]) => list.every((s) => !/\berror\.(?:message|stack|cause)\b|String\(error\)|\{error\}/.test(s))
  check('D4: none of the error pages renders error.message / stack / the error itself', noRaw(files))
  check('MUT: {error.message} in global-error fails D4', !noRaw([...files, '<p>{error.message}</p>']))
  const [notFound, , globalError] = files
  check('D5: 404 is branded and resolves the request language', /<StatusScreen\b/.test(notFound) && /getRootRequestContext\(\)/.test(notFound) && /errorPagesUi\(locale\)/.test(notFound))
  check('D6: global-error draws its own <html lang dir>, imports the styles, follows the request contract',
    /<html lang=\{lang\} dir=\{dir\}>/.test(globalError) && /import '\.\/globals\.css'/.test(globalError) && /resolveRequestLocale\(/.test(globalError) && /bg-canvas/.test(globalError))
  const copy = require(join(ROOT, 'lib/i18n/error-pages.ts')).ERROR_PAGES_UI
  const flat = (o: any): string[] => Object.values(o).flatMap((v: any) => (typeof v === 'string' ? [v] : flat(v)))
  const parity = (a: any, b: any): boolean => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort())
    && Object.keys(a).every((k) => typeof a[k] !== 'object' || parity(a[k], b[k]))
  check('D7: the copy has the same keys in both languages, and the English is English', parity(copy.he, copy.en) && !flat(copy.en).some((s) => HEBREW.test(s)))
  check('MUT: a missing English key fails D7', !parity(copy.he, { ...copy.en, notFound: { ...copy.en.notFound, title: undefined } }) || !parity(copy.he, { ...copy.en, extra: {} }))
}

// ── E) switcher + guide type scale ────────────────────────────────────────────
console.log('\nE) the switcher and the guide: ≤6 type sizes, tokens only')
{
  const SIZE = /\btext-(?:xs|sm|base|lg|xl|[2-9]xl|display|title|metric|section|copy|caption|overline|\[[^\]]+\])\b/g
  const sizes = (s: string) => new Set(s.match(SIZE) ?? [])
  const ok = (s: string) => sizes(s).size <= 6 && [...sizes(s)].every((c) => /text-(display|title|metric|section|copy|caption|overline)$/.test(c))
  for (const f of ['components/layout/WorkspaceSwitcher.tsx', 'components/guide/GuideMenu.tsx']) {
    const src = strip(read(f))
    check(`E1 ${f}: ${sizes(src).size} sizes, all tokens`, ok(src), [...sizes(src)].join(' '))
  }
  const sw = strip(read('components/layout/WorkspaceSwitcher.tsx'))
  check('MUT: a text-sm back in the switcher fails E1', !ok(sw + ' text-sm'))
  check('E2: no banned radius/shadow in the shell and guide', ['components/layout/WorkspaceSwitcher.tsx', 'components/guide/GuideMenu.tsx', 'components/layout/Sidebar.tsx', 'components/layout/TrialBar.tsx'].every((f) => !BANNED.test(strip(read(f)))))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
export {}
