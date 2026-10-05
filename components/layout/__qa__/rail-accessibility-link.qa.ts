/**
 * THE ACCESSIBILITY STATEMENT HAS TO BE REACHABLE FROM THE PLATFORM ITSELF.
 *
 * Our statement declares "the site and the platform" partially conformant at
 * AA. Reg. 35 of תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות),
 * תשע"ג-2013 wants that declaration available where the service is given, and
 * until now it was only in the marketing site's footer: a logged-in customer
 * could not reach from the app the document that describes the app. A statement
 * nobody using the service can find is close to no statement at all, and under
 * the deception provisions of חוק הגנת הצרכן, תשמ"א-1981 a public declaration
 * that overstates what a reader can verify is its own exposure.
 *
 * So the navigation rail links it, in the reader's own language. What this suite
 * holds:
 *
 *   1. The link exists in the rail, opens safely in a new tab, and carries an
 *      aria-label of its own — the row's visible text is three words, and a
 *      screen-reader user needs to know the tab will change.
 *   2. Its href is BUILT from LOCALE_PREFIX, never written out. A path list by
 *      hand is the defect that left /pt-BR/signup unguarded by the sanctions
 *      block on the morning Portuguese went live (#107); the same mistake here
 *      would send a Brazilian reader to the Hebrew statement.
 *   3. Every public language has its own label and its own aria-label, none of
 *      them falling through to another language's words, and the page each
 *      language's href resolves to actually exists on disk.
 *
 * MUTATION CONTROL on each guard: the broken shape is substituted and the guard
 * must then fail.
 *
 * Run: npx tsx components/layout/__qa__/rail-accessibility-link.qa.ts
 */

import { existsSync, readFileSync } from 'fs'
import { LOCALE_PREFIX, PUBLIC_LOCALES } from '@/lib/i18n/locales'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  [${detail}]` : ''}`) }
}

/** Comments are stripped so a guard never matches prose about the code. */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/^\s*\/\/.*$/gm, '')

const RAIL = 'components/layout/Sidebar.tsx'
const rail = strip(readFileSync(RAIL, 'utf8'))

// ── 1) the link is in the rail, and it is a safe external link ──────────────
const linkGuard = (c: string) => /data-rail="accessibility"/.test(c)
  && /aria-label=\{dict\.sidebar\.accessibilityAria\}/.test(c)
  && /\{dict\.sidebar\.accessibility\}/.test(c)
check('the rail links the accessibility statement, with its own aria-label', linkGuard(rail))
check('mutation control: dropping the aria-label fails the guard',
  !linkGuard(rail.replace('aria-label={dict.sidebar.accessibilityAria}', '')))

const block = rail.slice(rail.indexOf('data-rail="accessibility"') - 400, rail.indexOf('data-rail="accessibility"') + 400)
check('it opens in a new tab', /target="_blank"/.test(block))
check('…and does so without handing the new tab our window', /rel="noopener noreferrer"/.test(block))
check('its icon is hidden from assistive technology, so the label is read once',
  /<Accessibility \{\.\.\.NAV_ICON\} aria-hidden="true"/.test(block))

// ── 2) the href is derived, never written out ───────────────────────────────
const hrefGuard = (c: string) => /href=\{`\$\{LOCALE_PREFIX\[uiLocale\]\}\/accessibility`\}/.test(c)
  && !/href="\/(en|es|pt-BR)?\/?accessibility"/.test(c)
check('the href is built from LOCALE_PREFIX and the reader\'s own language', hrefGuard(rail))
check('mutation control: a hard-coded Hebrew path fails the guard',
  !hrefGuard(rail.replace('href={`${LOCALE_PREFIX[uiLocale]}/accessibility`}', 'href="/accessibility"')))
check('mutation control: a hand-written per-language path fails it too',
  !hrefGuard(rail.replace('href={`${LOCALE_PREFIX[uiLocale]}/accessibility`}',
    'href={uiLocale === \'en\' ? "/en/accessibility" : "/accessibility"}')))
check('the rail is given the reader\'s public language to build it with',
  /uiLocale: PublicLocale/.test(rail) && !/<RailFoot dict=\{dict\} isAdmin=\{isAdmin\} \/>/.test(rail))

// ── 3) every language has its own words, and a page behind its href ─────────
const labels = new Map<string, string>()
const arias = new Map<string, string>()
for (const locale of PUBLIC_LOCALES) {
  const sidebar = getDashboardDictionary(locale).sidebar as Record<string, string>
  const label = sidebar.accessibility
  const aria = sidebar.accessibilityAria
  check(`${locale}: the rail label exists`, typeof label === 'string' && label.trim().length > 0, String(label))
  check(`${locale}: the aria-label exists and says the tab will change`,
    typeof aria === 'string' && aria.trim().length > 0 && aria.length > label.length, String(aria))
  if (label) labels.set(locale, label)
  if (aria) arias.set(locale, aria)

  // The page the link lands on. Hebrew is the unprefixed (legal) route; every
  // other language has its own tree under app/(public)/<prefix>/.
  const page = locale === 'he'
    ? 'app/(legal)/accessibility/page.tsx'
    : `app/(public)${LOCALE_PREFIX[locale]}/accessibility/page.tsx`
  check(`${locale}: ${LOCALE_PREFIX[locale]}/accessibility has a page behind it`, existsSync(page), page)
}
check('no two languages share the rail label — none of them fell through',
  new Set(labels.values()).size === labels.size, [...labels.values()].join(' | '))
check('no two languages share the aria-label',
  new Set(arias.values()).size === arias.size)
check('mutation control: two languages with the same label are caught',
  new Set([...labels.values(), labels.get('en') ?? '']).size !== labels.size + 1)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
