/**
 * THE LANGUAGE A CUSTOMER'S EMAIL IS WRITTEN IN, end to end.
 *
 *   A) the account's language is recorded by EVERY sign-in door, not only the
 *      signup form — a Google sign-up used to record none
 *   B) a recorded language is never overwritten by a later sign-in, and the
 *      switcher's own write is the one that may replace it
 *   C) the route: signed-in owner only, a published language only, failures said
 *      out loud rather than swallowed
 *   D) the switcher writes the account too, not just a cookie and localStorage
 *      (a cron can read neither)
 *   E) the approval reminder carries ALL eleven published languages, like the
 *      setup emails and the weekly summary — it used to narrow to 'he' | 'en'
 *      and mail a Korean account in Hebrew
 *   F) the fallback, when nothing is recorded: the English channels, then the
 *      stored signup country, then Hebrew, and silence when provenance is
 *      unreadable
 *
 * Every source guard runs again against a deliberately broken copy (-MUT).
 * Nothing here talks to Supabase or Resend.
 * Run: npx tsx lib/i18n/__qa__/customer-email-language.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { handleAccountLanguagePut, recordAccountLocale, setAccountLocale, type AccountLocaleAdmin } from '../account-locale'
import { buildReminderEmail } from '@/lib/reminders/email'
import { fallbackEmailLocale } from '@/lib/reminders/recipient'
import { PUBLIC_LOCALES } from '../locales'

/**
 * A source guard that cannot fail tests nothing, and these guards read SOURCE,
 * so the broken copy is made in memory: mutate the text, run the same guard over
 * it, and require it to fail. No file is written and no module is loaded.
 */
function mutated(rel: string, from: string, to: string): string {
  const src = code(rel)
  const next = src.replace(from, to)
  if (next === src) throw new Error(`mutation did not apply: ${from}`)
  return strip(next)
}

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const USER = '11111111-1111-4111-8111-111111111111'

/** An auth admin that records what it was asked to write, and can refuse. */
function fakeAdmin(opts: { fails?: boolean } = {}) {
  const writes: Array<{ userId: string; metadata: Record<string, unknown> }> = []
  const admin: AccountLocaleAdmin = {
    auth: {
      admin: {
        updateUserById: async (userId, attrs) => {
          if (opts.fails) return { error: { message: 'refused' } }
          writes.push({ userId, metadata: attrs.user_metadata })
          return { error: null }
        },
      },
    },
  }
  return { admin, writes }
}

const ORIGIN = 'https://app.example.com'
const TOKEN = 'tok'

/**
 * EVERY PUBLISHED LANGUAGE IS ON for this run. `normalizeStoredLocale` asks
 * `publicLocaleEnabled`, which reads the per-locale flags at CALL time and fails
 * closed, so a bare test environment would answer "not a language" for Spanish
 * and Korean and the suite would be testing the flags instead of the rule. All
 * eleven are live in Production (lib/i18n/locales.ts).
 */
function enableEveryLanguage() {
  for (const flag of ['SPANISH', 'PORTUGUESE', 'FRENCH', 'ITALIAN', 'JAPANESE', 'GERMAN', 'DUTCH', 'POLISH', 'KOREAN']) {
    process.env[`NEXT_PUBLIC_${flag}_SITE_ENABLED`] = 'true'
  }
}

async function main() {
  enableEveryLanguage()
  console.log('A) every sign-in door records the account’s language')
  {
    const a = fakeAdmin()
    const wrote = await recordAccountLocale({ admin: a.admin, userId: USER, currentLocale: null, lang: 'ko' })
    check('A1: an account with no language records the one it signed in with',
      wrote === 'written' && a.writes.length === 1 && a.writes[0].metadata.locale === 'ko', a.writes)

    const b = fakeAdmin()
    const skipped = await recordAccountLocale({ admin: b.admin, userId: USER, currentLocale: 'es', lang: 'he' })
    check('A2: a recorded language is never overwritten by a later sign-in',
      skipped === 'already_recorded' && b.writes.length === 0)

    const c = fakeAdmin()
    const none = await recordAccountLocale({ admin: c.admin, userId: USER, currentLocale: null, lang: 'klingon' })
    check('A3: a language this product does not publish is not recorded',
      none === 'no_language' && c.writes.length === 0)

    const d = fakeAdmin({ fails: true })
    check('A4: a refused write says so rather than claiming success',
      (await recordAccountLocale({ admin: d.admin, userId: USER, currentLocale: null, lang: 'fr' })) === 'failed')

    // THE PRODUCTION BUG: the callback is the one funnel every door reaches, and
    // before this it wrote the signup country but never the language, so a Google
    // account carried none at all.
    const callback = strip(code('app/api/auth/callback/route.ts'))
    check('A5: the auth callback records the language, with the request’s own lang',
      /recordAccountLocale\(\{[\s\S]{0,320}lang,/.test(callback), callback.match(/recordAccountLocale\([\s\S]{0,200}/)?.[0])
    check('A6: it passes the account’s CURRENT language, so it can tell "none" from "recorded"',
      /currentLocale: \(user\.user_metadata \?\? \{\}\)\.locale/.test(callback))
    check('A7: the write never fails the sign-in', /catch \(localeError\)/.test(callback))

    const noLang = mutated('app/api/auth/callback/route.ts', '        lang,\n      })', '      })')
    check('A-MUT: a callback that stopped passing the language is caught (A5 would fail)',
      !/recordAccountLocale\(\{[\s\S]{0,320}lang,/.test(noLang))
    const noCurrent = mutated('app/api/auth/callback/route.ts', 'currentLocale: (user.user_metadata ?? {}).locale', 'currentLocale: null')
    check('A-MUT2: a callback that overwrote a recorded language is caught (A6 would fail)',
      !/currentLocale: \(user\.user_metadata \?\? \{\}\)\.locale/.test(noCurrent))
  }

  console.log('\nB) the switcher’s write is the one that may replace a choice')
  {
    const a = fakeAdmin()
    check('B1: the owner’s own choice is written whatever was there before',
      (await setAccountLocale({ admin: a.admin, userId: USER, locale: 'es' })) === 'written' && a.writes[0].metadata.locale === 'es')
    const b = fakeAdmin({ fails: true })
    check('B2: a refused write is reported, not swallowed',
      (await setAccountLocale({ admin: b.admin, userId: USER, locale: 'es' })) === 'failed')
  }

  console.log('\nC) PUT /api/account/language')
  {
    const put = (body: unknown, userId: string | null, fails = false) => {
      const a = fakeAdmin({ fails })
      return handleAccountLanguagePut(
        new Request('https://app.example.com/api/account/language', { method: 'PUT', body: JSON.stringify(body) }),
        { userId: async () => userId, admin: () => a.admin },
      ).then((res) => ({ res, writes: a.writes }))
    }
    const stranger = await put({ locale: 'es' }, null)
    check('C1: a signed-out visitor writes nothing', stranger.res.status === 401 && stranger.writes.length === 0)
    const bad = await put({ locale: 'xx' }, USER)
    check('C2: an unpublished language is refused, not stored', bad.res.status === 400 && bad.writes.length === 0)
    const ok = await put({ locale: 'ja' }, USER)
    check('C3: a published language is stored for the signed-in owner',
      ok.res.status === 200 && ok.writes.length === 1 && ok.writes[0].userId === USER && ok.writes[0].metadata.locale === 'ja')
    const broken = await put({ locale: 'ja' }, USER, true)
    check('C4: a refused write answers 503 rather than pretending to have saved', broken.res.status === 503)

    // CLAUDE.md: proxy.ts excludes /api/*, so the route authenticates itself.
    const route = strip(code('app/api/account/language/route.ts'))
    check('C5: the route reads the session itself and does not trust the request',
      /auth\.getUser\(\)/.test(route) && !/searchParams/.test(route))
  }

  console.log('\nD) the switcher records the ACCOUNT, not only this browser')
  {
    const provider = strip(code('lib/i18n/dashboard/useDashboardLanguage.tsx'))
    check('D1: setDashboardLanguage writes the cookie, the storage AND the account',
      /const setDashboardLanguage[\s\S]{0,700}recordAccountLanguage\(lang\)/.test(provider))
    check('D2: the account write goes to the language route, as a PUT',
      /'\/api\/account\/language'/.test(provider) && /method: 'PUT'/.test(provider))
    check('D3: it is fire-and-forget, so a signed-out visitor is not shown an error',
      /\.catch\(\(\) => undefined\)/.test(provider))

    const cookieOnly = mutated('lib/i18n/dashboard/useDashboardLanguage.tsx', '    recordAccountLanguage(lang)\n', '')
    check('D-MUT: a switcher that only wrote the cookie is caught (D1 would fail)',
      !/const setDashboardLanguage[\s\S]{0,700}recordAccountLanguage\(lang\)/.test(cookieOnly))
  }

  console.log('\nE) the approval reminder speaks every published language')
  {
    const subjects = PUBLIC_LOCALES.map((locale) => buildReminderEmail({
      locale, firstName: null, domain: 'example.com', titles: ['t'], total: 1, origin: ORIGIN, token: TOKEN,
    }))
    check('E1: all eleven languages build a subject', subjects.every((e) => e.subject.length > 0))
    const ko = subjects[PUBLIC_LOCALES.indexOf('ko')]
    check('E2: a Korean account gets Korean words, not Hebrew',
      /[가-힣]/.test(ko.subject) && !/[֐-׿]/.test(ko.subject), ko.subject)
    const he = subjects[PUBLIC_LOCALES.indexOf('he')]
    check('E3: Hebrew is still Hebrew and still right-to-left',
      /[֐-׿]/.test(he.subject) && /dir="rtl"/.test(he.html))
    check('E4: the link opens the app in the email’s own language',
      ko.reviewUrl.includes('&lang=ko') && !he.reviewUrl.includes('lang='), [ko.reviewUrl, he.reviewUrl])
    check('E5: the unsubscribe page is bilingual, so the link narrows to en, never to ko',
      ko.unsubscribeUrl.includes('lang=en') && he.unsubscribeUrl.includes('lang=he'), ko.unsubscribeUrl)

    // The narrowing that caused it lived in the live dependency, not the builder.
    const lives = ['lib/reminders/live.ts', 'lib/onboarding-emails/live.ts', 'lib/reports/weekly/live.ts']
    check('E6: no live sender narrows the recorded language to the bilingual pair',
      lives.every((f) => { const src = strip(code(f)); return /normalizeDashboardUiLocale\(meta\.locale\)/.test(src) && !/normalizeLocale\(meta\.locale\)/.test(src) }))

    const narrowed = mutated('lib/reminders/live.ts', 'normalizeDashboardUiLocale(meta.locale)', 'normalizeLocale(meta.locale)')
    check('E-MUT: a sender that went back to he|en is caught (E6 would fail)',
      /normalizeLocale\(meta\.locale\)/.test(narrowed) && !/normalizeDashboardUiLocale\(meta\.locale\)/.test(narrowed))
  }

  console.log('\nF) and when the account has no language at all')
  {
    const f = (origin: Parameters<typeof fallbackEmailLocale>[0]['origin'], signupCountry: string | null = null) =>
      fallbackEmailLocale({ origin, signupCountry })
    check('F1: the English-only channels are English', f('shopify_app_store') === 'en' && f('marketplace') === 'en')
    check('F2: the stored signup country decides the rest, Israel apart',
      f('website', 'IL') === 'he' && f('website', 'PH') === 'en' && f('unknown', 'KR') === 'en')
    check('F3: a country is never read as a third language', f('website', 'ES') === 'en' && f('website', 'JP') === 'en')
    check('F4: a website account with nothing on file is Hebrew, as before', f('website') === 'he' && f('unknown') === 'he')
    check('F5: unreadable provenance with nothing else on file still sends nothing', f(null) === null)
    check('F6: but a stored country answers even then, because it is a fact about the reader', f(null, 'PH') === 'en')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })

export {}
