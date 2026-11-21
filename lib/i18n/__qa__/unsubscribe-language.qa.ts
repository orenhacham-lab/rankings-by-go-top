/**
 * THE UNSUBSCRIBE LINK KEEPS THE LANGUAGE THE EMAIL WAS WRITTEN IN.
 *
 * The defect, measured on main 213c91dc. All three customer emails — the weekly
 * summary, the approval reminder and the setup series — are written from the
 * dictionary in the customer's own language, and all eleven languages are
 * translated. Their unsubscribe link was then built through
 * `toBilingualLocale`, which narrows eleven languages to two, so the URL
 * carried `lang=en` and `handleUnsubscribe` parsed it with a normalizer that
 * accepted nothing but 'he' and 'en'.
 *
 * An Italian customer therefore read an Italian email and landed on an ENGLISH
 * page — on the one screen where a customer is already unhappy enough to be
 * leaving. The page's own copy (reminders.unsubscribePage) had existed in
 * Italian the whole time. Only the link threw the language away.
 *
 * What is checked:
 *   A. All three emails put the real language in the link and in the RFC 8058
 *      header, and no builder narrows any more.
 *   B. The page renders in that language, with the right direction, and an
 *      unknown or not-live language still falls back to Hebrew.
 *   C. MUTATION CONTROLS for each source guard.
 *
 * Run: npx tsx lib/i18n/__qa__/unsubscribe-language.qa.ts
 */
import { readFileSync } from 'fs'
import { buildWeeklyEmail } from '../../reports/weekly/email'
import { buildReminderEmail } from '../../reminders/email'
import { buildOnboardingEmail } from '../../onboarding-emails/email'
import { unsubscribePage } from '../../reminders/http'
import { getDashboardDictionary } from '../dashboard/getDashboardDictionary'
import { escapeEmailHtml } from '../../notifications/email-escape'
import { PUBLIC_LOCALES, normalizeStoredLocale, type PublicLocale } from '../locales'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
}

const WEEKLY_SRC = stripComments(readFileSync('lib/reports/weekly/email.ts', 'utf8'))
const REMINDER_SRC = stripComments(readFileSync('lib/reminders/email.ts', 'utf8'))
const SETUP_SRC = stripComments(readFileSync('lib/onboarding-emails/email.ts', 'utf8'))
const PAGE_SRC = stripComments(readFileSync('lib/reminders/http.ts', 'utf8'))

const ORIGIN = 'https://app.example.com'
const TOKEN = 'tok-123'

// ------------------------------------------------------------- A. the links
console.log('\nA) every email\'s link carries its own language')
/**
 * Every published language, not only the ones this environment's build flags
 * happen to switch on: the email builders take the language as an argument, so
 * what is checked here is the code, not the flags. Whether a language may be
 * SELECTED is normalizeStoredLocale's job, checked at the end.
 */
const live = [...PUBLIC_LOCALES] as PublicLocale[]
check('all eleven published languages are covered', live.length === 11, String(live.length))

for (const locale of live) {
  const weekly = buildWeeklyEmail({
    locale, firstName: 'Mario', domain: 'example.com', projectId: 'p1', origin: ORIGIN, token: TOKEN,
    summary: { published: [], publishedCount: 0, waiting: 2, rank: null, gsc: null, nextScheduled: null, worthSending: true },
  })
  const reminder = buildReminderEmail({
    locale, firstName: 'Mario', domain: 'example.com', titles: ['Articolo'], total: 1, origin: ORIGIN, token: TOKEN,
  })
  const setup = buildOnboardingEmail({
    stage: 'connect', locale, firstName: 'Mario', domain: 'example.com', projectId: 'p1', origin: ORIGIN, token: TOKEN,
  })
  const want = `lang=${locale}`
  check(`${locale}: the weekly summary's link says ${want}`, weekly.unsubscribeUrl.includes(want), weekly.unsubscribeUrl)
  check(`${locale}: the reminder's link says ${want}`, reminder.unsubscribeUrl.includes(want), reminder.unsubscribeUrl)
  check(`${locale}: the setup email's link says ${want}`, setup.unsubscribeUrl.includes(want), setup.unsubscribeUrl)
  check(`${locale}: the setup link keeps its narrow scope as well`, setup.unsubscribeUrl.includes('&s=setup'))
  check(`${locale}: the one-click header is the same URL`,
    String(weekly.headers['List-Unsubscribe'] || '').includes(want) &&
    String(reminder.headers['List-Unsubscribe'] || '').includes(want))
}

const guardNoNarrowing = (src: string) => !/toBilingualLocale\(input\.locale\)/.test(src)
const guardPageTakesEveryLanguage = (src: string) => /export function unsubscribePage\(locale: PublicLocale/.test(src)
const guardRouteReadsEveryLanguage = (src: string) =>
  /normalizeStoredLocale\(url\.searchParams\.get\('lang'\)\) \?\? 'he'/.test(src) && !/normalizeLocale\(/.test(src)

check('no email builder narrows the language any more',
  guardNoNarrowing(WEEKLY_SRC) && guardNoNarrowing(REMINDER_SRC) && guardNoNarrowing(SETUP_SRC))
check('the page accepts every public language', guardPageTakesEveryLanguage(PAGE_SRC))
check('the route reads every public language, and refuses one that is not live', guardRouteReadsEveryLanguage(PAGE_SRC))
check('a language that is not a language at all is refused, so the page falls back to Hebrew',
  normalizeStoredLocale('zz') === null && normalizeStoredLocale('') === null && normalizeStoredLocale(7) === null)
check('Hebrew and English are always selectable',
  normalizeStoredLocale('he') === 'he' && normalizeStoredLocale('en') === 'en')

// -------------------------------------------------------------- B. the page
console.log('\nB) the page itself')
for (const locale of live) {
  const dict = getDashboardDictionary(locale).reminders.unsubscribePage
  const html = unsubscribePage(locale, true)
  check(`${locale}: the page is marked as that language`, html.includes(`<html lang="${locale}"`), html.slice(0, 80))
  // The page escapes its own copy, so an apostrophe ("You're unsubscribed")
  // reaches the HTML as an entity. The comparison escapes too.
  check(`${locale}: the words are that language's own`, html.includes(escapeEmailHtml(dict.title)), dict.title)
  check(`${locale}: the direction is ${locale === 'he' ? 'rtl' : 'ltr'}`,
    html.includes(`dir="${locale === 'he' ? 'rtl' : 'ltr'}"`))
}
{
  const it = unsubscribePage('it', true)
  const en = getDashboardDictionary('en').reminders.unsubscribePage
  check('the Italian page is not the English one',
    !it.includes(escapeEmailHtml(en.title)) || getDashboardDictionary('it').reminders.unsubscribePage.title === en.title)
  const invalid = unsubscribePage('it', false)
  check('an invalid token still answers in Italian',
    invalid.includes(escapeEmailHtml(getDashboardDictionary('it').reminders.unsubscribePage.invalidTitle)))
  const setupScope = unsubscribePage('it', true, { scope: 'setup', stopAllHref: '/x' })
  check('the narrow "setup" page says so in Italian, with the link to stop the rest',
    setupScope.includes(escapeEmailHtml(getDashboardDictionary('it').reminders.unsubscribePage.setupTitle)) && setupScope.includes('/x'))
}

// ------------------------------------------------------- C. mutation controls
console.log('\nC) mutation controls')
check('the narrowing guard fails on the old line',
  !guardNoNarrowing("const unsubscribeUrl = unsubscribeUrlFor(input.origin, input.token, toBilingualLocale(input.locale))"))
check('the page guard fails on the old signature',
  !guardPageTakesEveryLanguage('export function unsubscribePage(locale: Locale, ok: boolean) {'))
check('the route guard fails on the old parser',
  !guardRouteReadsEveryLanguage("const locale: Locale = normalizeLocale(url.searchParams.get('lang')) ?? 'he'"))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
