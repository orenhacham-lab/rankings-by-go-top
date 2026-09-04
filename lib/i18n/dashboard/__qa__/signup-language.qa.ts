/**
 * Area G — English signup must open the app in English (and Hebrew in Hebrew), with the
 * switcher still overriding at any time. Behavioral coverage of the single resolution
 * rule (resolveDashboardLocale / normalizeLocale — the exact logic the provider runs)
 * plus source-contract that the four narrow wiring points are in place.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveDashboardLocale, normalizeLocale, DASHBOARD_LANGUAGE_STORAGE_KEY } from '../useDashboardLanguage'
import { resolveRequestLocale } from '../../request-locale'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// The signup form's language-derivation predicate (mirrors SignupForm exactly).
const deriveSignupLang = (langParam: string | null, pathname: string): 'he' | 'en' =>
  langParam === 'en' || pathname.startsWith('/en/') ? 'en' : 'he'

function main() {
  console.log('Area G — signup language → dashboard language')

  // ── normalizeLocale: only he|en survive; anything else (browser junk) → null.
  check('normalizeLocale accepts he/en only', normalizeLocale('he') === 'he' && normalizeLocale('en') === 'en')
  check('normalizeLocale rejects junk / missing', normalizeLocale('fr') === null && normalizeLocale(undefined) === null && normalizeLocale('EN') === null && normalizeLocale('') === null)

  // ── Signup-origin derivation: EN route or ?lang=en → en; everything else → he (NOT browser lang).
  check('EN route (/en/signup) derives en', deriveSignupLang(null, '/en/signup') === 'en')
  check('?lang=en derives en', deriveSignupLang('en', '/signup') === 'en')
  check('HE route derives he', deriveSignupLang(null, '/signup') === 'he')
  check('unknown ?lang falls back to he', deriveSignupLang('fr', '/signup') === 'he')

  // ── 1) EN signup → EN dashboard (immediate-session: signup seeded localStorage='en').
  check('(1) EN signup, storage seeded en → dashboard en', resolveDashboardLocale('en', 'en') === 'en')
  // ── 2) HE signup → HE dashboard (storage he, or empty with he seed).
  check('(2) HE signup, storage he → dashboard he', resolveDashboardLocale('he', 'he') === 'he')
  check('(2) HE signup, empty storage + he metadata → he', resolveDashboardLocale(null, 'he') === 'he')
  // ── 3) EN email-confirmation on a FRESH browser: empty storage, en from auth metadata seed.
  check('(3) fresh device, empty storage + en metadata → en', resolveDashboardLocale(null, 'en') === 'en')
  check('(3) fresh device, no storage & no metadata → he default', resolveDashboardLocale(null, undefined) === 'he')
  // ── 4) The switcher ALWAYS overrides — a stored choice beats the metadata seed both ways.
  check('(4) stored he overrides en metadata (switched to he after en signup)', resolveDashboardLocale('he', 'en') === 'he')
  check('(4) stored en overrides he metadata (switched to en after he signup)', resolveDashboardLocale('en', 'he') === 'en')

  console.log('WIRING) the four narrow integration points')
  const signup = strip(read('app/(auth)/signup/page.tsx'))
  const callback = strip(read('app/api/auth/callback/route.ts'))
  const layout = strip(read('app/(dashboard)/layout.tsx'))

  // 1 — signup persists the derived locale into auth metadata (not browser language).
  check('signup writes locale into signUp metadata (options.data)', /data:\s*\{[\s\S]*?locale:\s*lang/.test(signup))
  // 2 — immediate-session path seeds the EXISTING dashboard-language store.
  check('signup seeds the existing localStorage key on immediate session',
    new RegExp(`localStorage\\.setItem\\(DASHBOARD_LANGUAGE_STORAGE_KEY,\\s*lang\\)`).test(signup))
  check('signup imports the shared store key (no second competing key)', /DASHBOARD_LANGUAGE_STORAGE_KEY/.test(signup) && DASHBOARD_LANGUAGE_STORAGE_KEY === 'dashboard-language')
  // 4 — emailRedirectTo carries ?lang so the confirmation hop preserves the choice.
  check('signup emailRedirectTo carries &lang=${lang}', /emailRedirectTo:[^\n]*&lang=\$\{lang\}/.test(signup))
  // callback preserves a validated lang on the redirect.
  check('callback reads + validates lang and sets it on the redirect',
    /searchParams\.get\('lang'\)/.test(callback) && /lang === 'en' \|\| lang === 'he'/.test(callback) && /dest\.searchParams\.set\('lang', lang\)/.test(callback))
  const rootLayout = read('app/layout.tsx')
  // 3 — the layout still seeds from auth metadata, now THROUGH the server locale
  // resolver (cookie first, metadata as the fresh-device seed). The shape changed
  // with the server language contract; the guarantee did not.
  check('dashboard layout seeds the provider from the server-resolved locale',
    /getServerLocale\(user\.user_metadata\?\.locale/.test(layout))
  check('and the root document applies the SAME seed, so the two agree',
    /getServerLocale\(localeSeed\)/.test(rootLayout) && /user\?\.user_metadata\?\.locale/.test(rootLayout))
  {
    check('a signup-EN seed still wins on a device with no cookie',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: null, seed: 'en' }) === 'en')
    check('but an explicit cookie still outranks the seed',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: 'he', seed: 'en' }) === 'he')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
