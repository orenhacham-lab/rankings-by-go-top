/**
 * THE AUTH PAGES' BROWSER-TAB TITLES.
 *
 * Measured on production, 15.11.2026: `/signup`, `/login` and `/en/login` all
 * served `<title>Create, schedule and publish SEO & GEO content | Go Top SEO</title>`
 * — the root layout's English home-page title — because the four auth pages are
 * client components and cannot export metadata of their own. A Hebrew visitor's
 * tab therefore spoke English, which the site's own rule forbids.
 *
 *  A) every public locale has a sign-up and a sign-in title, and each one is the
 *     string the page's <h1> actually shows (no drift between tab and heading);
 *  B) forgot/reset read their headings from PASSWORD_UI, so they cannot drift;
 *  C) the path → page mapping covers the locale trees (/en/login) and nothing else;
 *  D) the wiring: the proxy sets the path header and the auth layout titles from it.
 *
 * Source guards strip comments first. Every guard has a mutation control.
 *
 * Run: npx tsx lib/i18n/__qa__/auth-titles.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, type PublicLocale } from '../locales'
import { PASSWORD_UI } from '../auth-password'
import { authHeading, authPageForPath, authPageTitle, type AuthPage } from '../auth-titles'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const code = (rel: string) => strip(readFileSync(join(ROOT, rel), 'utf8'))
/**
 * proxy.ts is read RAW. The shared `strip` treats the `/*` inside the comment
 * "…startsWith('/api/setup')" as a block-comment opener and swallows the next
 * 2,800 characters — which includes the line this guard is about. The line
 * carries no comment of its own, so there is nothing for stripping to do.
 */
const rawCode = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Every `heading:` of a page's own locale dictionary, keyed by locale. */
function headingsOf(rel: string): Record<string, string> {
  const src = code(rel)
  const out: Record<string, string> = {}
  const re = /^ {2}'?([a-zA-Z-]+)'?: \{/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const h = /heading: '([^']*)'/.exec(src.slice(m.index, m.index + 4000))
    if (h) out[m[1]] = h[1]
  }
  return out
}

console.log('A) the tab says what the page says, in every public locale')
{
  const signup = headingsOf('app/(auth)/signup/page.tsx')
  const login = headingsOf('app/(auth)/login/page.tsx')
  const missing = PUBLIC_LOCALES.filter((l) => !authHeading('signup', l) || !authHeading('login', l))
  check('A1: all 11 public locales have a sign-up and a sign-in title', missing.length === 0, missing.join(','))
  const drifted = PUBLIC_LOCALES.filter((l) =>
    (signup[l] && signup[l] !== authHeading('signup', l)) || (login[l] && login[l] !== authHeading('login', l)))
  check('A2: each title is the page\'s own <h1>, word for word', drifted.length === 0, drifted.join(','))
  check('A2-MUT: a heading the pages do not use would be caught',
    PUBLIC_LOCALES.some((l) => signup[l] && signup[l] !== `${authHeading('signup', l)} `))
  check('A3: the title carries the brand suffix the public pages use',
    authPageTitle('login', 'he') === `${authHeading('login', 'he')} - Go Top SEO`)
  check('A4: no title is the home page\'s', PUBLIC_LOCALES.every((l) =>
    !authPageTitle('signup', l).startsWith('Create, schedule and publish')))
}

console.log('B) forgot and reset are read from PASSWORD_UI, never copied')
{
  const ok = PUBLIC_LOCALES.every((l: PublicLocale) =>
    authHeading('forgot-password', l) === PASSWORD_UI[l].forgot.heading
    && authHeading('reset-password', l) === PASSWORD_UI[l].reset.heading)
  check('B1: both password pages take their heading from PASSWORD_UI', ok)
  const titles = code('lib/i18n/auth-titles.ts')
  check('B1-MUT: a second copy of a password heading in the table would be caught',
    !titles.includes(PASSWORD_UI.he.forgot.heading))
}

console.log('C) the path names the page')
{
  const cases: [string, AuthPage | null][] = [
    ['/signup', 'signup'], ['/login', 'login'], ['/en/login', 'login'], ['/pt-BR/signup', 'signup'],
    ['/ko/forgot-password', 'forgot-password'], ['/reset-password/', 'reset-password'],
    ['/dashboard', null], ['/', null], ['/en/pricing', null], [null as unknown as string, null],
  ]
  const wrong = cases.filter(([p, want]) => authPageForPath(p) !== want).map(([p]) => String(p))
  check('C1: every auth path in every tree is named, and nothing else is', wrong.length === 0, wrong.join(','))
}

console.log('D) the wiring')
{
  const proxy = rawCode('proxy.ts')
  const sets = (src: string) => /requestHeaders\.set\(PATHNAME_HEADER, pathname\)/.test(src)
  check('D1: the proxy hands the path forward on PATHNAME_HEADER', sets(proxy))
  check('D1-MUT: a proxy that does not set it fails D1',
    !sets(proxy.replace('requestHeaders.set(PATHNAME_HEADER, pathname)', '')))
  const layout = code('app/(auth)/layout.tsx')
  const titles = (src: string) =>
    /export async function generateMetadata\(\)/.test(src)
    && /authPageForPath\(requestHeaders\.get\(PATHNAME_HEADER\)\)/.test(src)
    && /title: authPageTitle\(page, await getServerPublicLocale\(\)\)/.test(src)
  check('D2: the auth layout titles the page from that header, in the request\'s language', titles(layout))
  check('D2-MUT: the static metadata block (main before the fix) fails D2',
    !titles(layout.replace(/export async function generateMetadata[\s\S]*?\n\}/, 'export const metadata = {}')))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
