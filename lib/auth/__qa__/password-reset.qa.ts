/**
 * Password reset: "forgot password" on the sign-in page, the request form, the
 * recovery link through /api/auth/callback, and the new-password form — both
 * languages, on Supabase Auth's own recovery flow.
 *
 *   A) the request never reveals whether an account exists: every answer
 *      Supabase can give (success, a rate limit only a real account can hit,
 *      any refusal) is the same "if an account exists, we sent a link";
 *   B) the recovery link can only lead to our own reset page (no `next` from
 *      the address), and a dead link returns to the request form, in the
 *      visitor's language;
 *   C) the new password: validated first, every Supabase refusal mapped to our
 *      own words by its code, never by its text;
 *   D) the pages, rendered for real in Hebrew and English, and the sign-in
 *      page's link to them.
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/auth/__qa__/password-reset.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const HEBREW = /[א-ת]/

let PATHNAME = '/forgot-password'
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

type Reset = typeof import('../password-reset')
const REAL: Reset = require('../password-reset')

/** A Supabase client whose recovery endpoint answers `answer` (or throws). */
function recoveryClient(answer: { error: unknown } | 'throw') {
  const calls: { email: string; redirectTo: string }[] = []
  return {
    calls,
    auth: {
      resetPasswordForEmail: async (email: string, options: { redirectTo: string }) => {
        calls.push({ email, redirectTo: options.redirectTo })
        if (answer === 'throw') throw new TypeError('Failed to fetch')
        return answer
      },
    },
  }
}
function updateClient(answer: { error: unknown } | 'throw') {
  const calls: string[] = []
  return {
    calls,
    auth: {
      updateUser: async ({ password }: { password: string }) => {
        calls.push(password)
        if (answer === 'throw') throw new TypeError('Failed to fetch')
        return answer
      },
    },
  }
}
const authError = (code: string, message: string, status = 400) => Object.assign(new Error(message), { code, status, name: 'AuthApiError' })

/** The answers Supabase can give for an address: all must read the same. */
const ANSWERS: [string, { error: unknown }][] = [
  ['an account exists, the link is sent', { error: null }],
  ['no account for the address (Supabase answers success, sends nothing)', { error: null }],
  ['the account asked a moment ago (429, only a real account reaches it)', { error: authError('over_email_send_rate_limit', 'For security purposes, you can only request this after 42 seconds.', 429) }],
  ['any other refusal, with provider text', { error: authError('unexpected_failure', 'Error sending recovery email: smtp 550', 500) }],
]

async function sameAnswerForEveryAccount(mod: Reset): Promise<string[]> {
  const outcomes: string[] = []
  for (const [, answer] of ANSWERS) outcomes.push(await mod.requestPasswordReset(recoveryClient(answer), 'owner@example.com', 'https://app.example/cb'))
  return outcomes
}

async function main() {
  console.log('A) the request never reveals whether an account exists')
  {
    const outcomes = await sameAnswerForEveryAccount(REAL)
    check(`A1: all ${ANSWERS.length} of Supabase's answers read the same to the visitor: "sent"`, outcomes.every((o) => o === 'sent'), outcomes.join(','))
    const c = recoveryClient({ error: null })
    const bad = await REAL.requestPasswordReset(c, 'not-an-email', 'x')
    check('A2: a malformed address is refused before anything is sent', bad === 'invalid_email' && c.calls.length === 0)
    const c2 = recoveryClient({ error: null })
    await REAL.requestPasswordReset(c2, '  owner@example.com ', 'https://app.example/cb')
    check('A3: the address is trimmed and the redirect passed as given', c2.calls[0]?.email === 'owner@example.com' && c2.calls[0]?.redirectTo === 'https://app.example/cb')
    check('A4: only a request that never reached the server is reported (it reveals nothing)', (await REAL.requestPasswordReset(recoveryClient('throw'), 'owner@example.com', 'x')) === 'unavailable')

    // MUTATION CONTROL: a copy that lets Supabase's refusal through.
    const src = read('lib/auth/password-reset.ts')
    const from = '    await client.auth.resetPasswordForEmail(email, { redirectTo })\n'
    const dir = mkdtempSync(join(tmpdir(), 'password-reset-mutant-'))
    try {
      check('MUTATION CONTROL: the call the control breaks is where it expects it', src.split(from).length === 2)
      const file = join(dir, 'password-reset.ts')
      writeFileSync(file, src.replace(from, "    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })\n    if (error) return 'unavailable'\n"))
      const mutant: Reset = require(file)
      const leaked = await sameAnswerForEveryAccount(mutant)
      check('MUTATION CONTROL: a form that reports the rate limit (so tells a real account apart) is caught by A1', !leaked.every((o) => o === 'sent'), leaked.join(','))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  console.log('\nB) the recovery link leads only to our reset page, and a dead one back to the form')
  {
    check('B1: the link lands on our own callback, next fixed to /reset-password, in the form\'s language',
      REAL.recoveryRedirectTo('https://app.example', 'he') === 'https://app.example/api/auth/callback?next=%2Freset-password&lang=he'
      && REAL.recoveryRedirectTo('https://app.example', 'en') === 'https://app.example/api/auth/callback?next=%2Freset-password&lang=en')
    const forgot = strip(read('app/(auth)/forgot-password/page.tsx'))
    const noCallerNext = (s: string) => !/get\(\s*['"]next['"]\s*\)/.test(s) && /recoveryRedirectTo\(appUrl, lang\)/.test(s)
    check('B2: the request form takes no destination from the address', noCallerNext(forgot))
    check('MUTATION CONTROL: a form that forwards ?next= is caught', !noCallerNext(forgot + "\nconst n = searchParams.get('next')"))

    const { NextRequest } = require('next/server')
    const { GET } = require(join(ROOT, 'app/api/auth/callback/route.ts'))
    const location = async (qs: string) => ((await GET(new NextRequest(`https://app.example/api/auth/callback?${qs}`))) as Response).headers.get('location') ?? ''
    const he = await location('next=%2Freset-password&lang=he')
    const en = await location('next=%2Freset-password&lang=en')
    const login = await location('next=%2Fdashboard&lang=he')
    check('B3: a dead recovery link returns to /forgot-password?error=link&lang=he', he === 'https://app.example/forgot-password?error=link&lang=he', he)
    check('B4: …and to /en/forgot-password?error=link in English', en === 'https://app.example/en/forgot-password?error=link', en)
    check('B5: a dead sign-up confirmation still returns to the sign-in page', login === 'https://app.example/login?error=oauth&lang=he', login)
    const recoveryHandled = (loc: string) => /\/forgot-password\?error=link/.test(loc)
    check('MUTATION CONTROL: the callback\'s old answer for every failure (/login?error=oauth) fails B3', !recoveryHandled('https://app.example/login?error=oauth&lang=he'))
  }

  console.log('\nC) the new password')
  {
    const c = updateClient({ error: null })
    check('C1: fewer than 8 characters is refused before anything is sent', (await REAL.setNewPassword(c, 'short', 'short')) === 'too_short' && c.calls.length === 0)
    check('C2: a confirmation that differs is refused before anything is sent', (await REAL.setNewPassword(c, 'longenough1', 'longenough2')) === 'mismatch' && c.calls.length === 0)
    check('C3: a valid password is saved', (await REAL.setNewPassword(c, 'longenough1', 'longenough1')) === 'updated' && c.calls.join() === 'longenough1')
    const cases: [string, unknown, string][] = [
      ['the same password as before', authError('same_password', 'New password should be different from the old password.', 422), 'same_password'],
      ['too weak for the project\'s policy', authError('weak_password', 'Password is known to be weak and easy to guess', 422), 'weak_password'],
      ['no recovery session (the link was not used, or it ended)', Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError' }), 'link_expired'],
      ['anything else, with provider text', authError('unexpected_failure', 'duplicate key value violates unique constraint', 500), 'failed'],
    ]
    for (const [label, error, want] of cases) check(`C4: ${label} → ${want}`, (await REAL.setNewPassword(updateClient({ error }), 'longenough1', 'longenough1')) === want)
    check('C5: a request that never reached the server → failed', (await REAL.setNewPassword(updateClient('throw'), 'longenough1', 'longenough1')) === 'failed')
    const { PASSWORD_UI } = require(join(ROOT, 'lib/i18n/auth-password.ts'))
    const outcomes = ['too_short', 'mismatch', 'same_password', 'weak_password', 'link_expired', 'failed']
    check('C6: every refusal has its own line in both languages', outcomes.every((o) => HEBREW.test(PASSWORD_UI.he.reset.err[o]) && typeof PASSWORD_UI.en.reset.err[o] === 'string' && !HEBREW.test(PASSWORD_UI.en.reset.err[o])))
    const pages = ['app/(auth)/forgot-password/page.tsx', 'app/(auth)/reset-password/page.tsx', 'lib/auth/password-reset.ts'].map((f) => strip(read(f))).join('\n')
    const noProviderText = (s: string) => !/\.message\b/.test(s)
    check('C7: no page or helper reads a provider message (only codes)', noProviderText(pages))
    check('MUTATION CONTROL: setError(error.message) is caught', !noProviderText(pages + '\nsetError(error.message)'))
  }

  console.log('\nD) the pages, in both languages, and the way in from sign-in')
  {
    const { AuthLocaleProvider } = require(join(ROOT, 'components/auth/AuthLocaleProvider.tsx'))
    const render = (Page: any, locale: 'he' | 'en', pathname: string, search = '') => {
      PATHNAME = pathname
      SEARCH = new URLSearchParams(search)
      return renderToStaticMarkup(createElement(AuthLocaleProvider as never, { locale, children: createElement(Page as never) } as never) as never)
    }
    const FORGOT = require(join(ROOT, 'app/(auth)/forgot-password/page.tsx'))
    const RESET = require(join(ROOT, 'app/(auth)/reset-password/page.tsx'))
    const LOGIN = require(join(ROOT, 'app/(auth)/login/page.tsx'))
    const EN_FORGOT = require(join(ROOT, 'app/(auth)/en/forgot-password/page.tsx'))
    const EN_RESET = require(join(ROOT, 'app/(auth)/en/reset-password/page.tsx'))

    const heForgot = render(FORGOT.default, 'he', '/forgot-password', 'lang=he')
    const enForgot = render(EN_FORGOT.default, 'he', '/en/forgot-password')
    check('D1: the Hebrew request form is Hebrew, right to left, and leads back to /login?lang=he',
      heForgot.includes('שכחתם את הסיסמה?') && heForgot.includes('dir="rtl"') && heForgot.includes('href="/login?lang=he"'))
    check('D2: /en/forgot-password is English whatever the server guessed, with no Hebrew at all', enForgot.includes('Forgot your password?') && !HEBREW.test(enForgot) && enForgot.includes('href="/en/login"'))
    const dead = render(FORGOT.default, 'he', '/forgot-password', 'lang=he&error=link')
    check('D3: a dead link is explained on the form', /role="alert"/.test(dead) && dead.includes('הקישור לאיפוס הסיסמה אינו תקין'))
    check('D4: …and nothing is shown without ?error', !/role="alert"/.test(heForgot))
    const heReset = render(RESET.default, 'he', '/reset-password', 'lang=he')
    const enReset = render(EN_RESET.default, 'en', '/en/reset-password')
    check('D5: the new-password form in Hebrew and in English (no Hebrew)', heReset.includes('בחירת סיסמה חדשה') && heReset.includes('dir="rtl"') && (heReset.match(/new-password/g) ?? []).length === 2 &&enReset.includes('Choose a new password') && !HEBREW.test(enReset))
    const heLogin = render(LOGIN.default, 'he', '/login', 'lang=he')
    const enLogin = render(LOGIN.default, 'en', '/en/login')
    check('D6: the sign-in page links to the request form in its own language',
      heLogin.includes('href="/forgot-password?lang=he"') && heLogin.includes('שכחתם את הסיסמה?') && enLogin.includes('href="/en/forgot-password"') && enLogin.includes('Forgot your password?'))
    const hasLink = (s: string) => /authHref\('forgot-password', lang\)/.test(s)
    check('MUTATION CONTROL: a sign-in page without the link is caught', hasLink(strip(read('app/(auth)/login/page.tsx'))) && !hasLink(strip(read('app/(auth)/login/page.tsx')).replace("authHref('forgot-password', lang)", "'/login'")))

    const { PASSWORD_UI } = require(join(ROOT, 'lib/i18n/auth-password.ts'))
    const keysDeep = (o: any, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keysDeep(v, `${p}${k}.`) : [`${p}${k}`])).sort()
    check('D7: the two dictionaries carry the same keys', JSON.stringify(keysDeep(PASSWORD_UI.he)) === JSON.stringify(keysDeep(PASSWORD_UI.en)))
    const sentHe = PASSWORD_UI.he.forgot.sent('a@b.co'), sentEn = PASSWORD_UI.en.forgot.sent('a@b.co')
    check('D8: the "sent" line is conditional ("if an account exists"), in both languages', /אם קיים חשבון/.test(sentHe) && /If an account exists/.test(sentEn))
  }

  Mod._load = origLoad
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
