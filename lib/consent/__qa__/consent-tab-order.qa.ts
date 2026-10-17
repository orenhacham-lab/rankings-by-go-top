/**
 * THE COOKIE NOTICE MUST BE THE FIRST THING THE KEYBOARD REACHES.
 *
 * Measured on a production build before this guard existed: the notice was tab
 * stop 47. It rendered after `{children}`, so a visitor who cannot use a mouse
 * had to pass the skip link, the header, the language switcher, the whole
 * marketing page and the footer before reaching "דחיית הכל", while "אישור הכל"
 * was one click away for everybody else.
 *
 * That gap is not a styling detail. GDPR Art. 7(1) and the EDPB's guidelines on
 * deceptive design patterns (03/2022) both treat an acceptance that is markedly
 * easier than a refusal as consent that was not freely given, and WCAG 2.4.3
 * (Focus Order) is about exactly this: a tab order that does not match what the
 * page is asking of the visitor. The notice is fixed-positioned, so rendering it
 * first changes nothing visually and everything about the tab order.
 *
 * `lib/__qa__/reviewer-journey/public-a11y.js` measures the real tab order in
 * Chromium and fails if the notice is not among the first ten stops. This suite
 * is the cheap half: it holds the source arrangement that makes that true, so a
 * refactor that moves the notice back down fails without a browser.
 *
 * Run: npx tsx lib/consent/__qa__/consent-tab-order.qa.ts
 */

import { readFileSync } from 'fs'

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  [${detail}]` : ''}`) }
}

const LAYOUT = 'app/layout.tsx'
const WIDGETS = 'components/public/PublicSiteWidgets.tsx'

/** Comments are stripped so a guard never matches prose about the code. */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/^\s*\/\/.*$/gm, '')

const layout = strip(readFileSync(LAYOUT, 'utf8'))
const widgets = strip(readFileSync(WIDGETS, 'utf8'))

const noticeAt = layout.indexOf('<PublicConsentNotice')
const childrenAt = layout.indexOf('{children}')
const widgetsAt = layout.indexOf('<PublicSiteWidgets')

check('the layout renders the consent notice', noticeAt >= 0)
check('the layout renders {children}', childrenAt >= 0)
check(
  'the notice is rendered BEFORE {children}',
  noticeAt >= 0 && childrenAt >= 0 && noticeAt < childrenAt,
  `notice at ${noticeAt}, children at ${childrenAt}`,
)
check(
  'the other floating widgets stay after {children}',
  widgetsAt > childrenAt,
  `widgets at ${widgetsAt}, children at ${childrenAt}`,
)
check(
  'the notice is passed the server-resolved auth state',
  /<PublicConsentNotice\s+isAuthenticated=\{isAuthenticated\}\s*\/>/.test(layout),
)

// The notice must be a component of its own, gated exactly like the widgets it
// was split out of: a split that drops the gate would put the banner on the
// signed-in application and on the login form.
check('PublicConsentNotice is exported', /export function PublicConsentNotice/.test(widgets))
const noticeBody = widgets.slice(widgets.indexOf('export function PublicConsentNotice'))
const bodyToNext = noticeBody.slice(0, noticeBody.indexOf('export function PublicSiteWidgets'))
check('the notice keeps the public-area gate', /shouldRenderPublicWidgets\(isAuthenticated, pathname\)/.test(bodyToNext))
check('the notice renders CookieConsent', /<CookieConsent onOpenChange=\{setCookieOpen\}\s*\/>/.test(bodyToNext))
check(
  'PublicSiteWidgets no longer renders the notice itself',
  !/<CookieConsent/.test(widgets.slice(widgets.indexOf('export function PublicSiteWidgets'))),
)

// ── mutation controls: break each rule on purpose and show the check fails ──
{
  const moved = layout.replace('<PublicConsentNotice isAuthenticated={isAuthenticated} />', '')
  const movedBack = `${moved.slice(0, moved.indexOf('{children}') + 10)}\n<PublicConsentNotice isAuthenticated={isAuthenticated} />${moved.slice(moved.indexOf('{children}') + 10)}`
  const n = movedBack.indexOf('<PublicConsentNotice')
  const c = movedBack.indexOf('{children}')
  check('MUTATION: the notice after {children} fails the order check', !(n >= 0 && c >= 0 && n < c))
}
{
  const ungated = bodyToNext.replace('shouldRenderPublicWidgets(isAuthenticated, pathname)', 'true')
  check(
    'MUTATION: dropping the public-area gate fails',
    !/shouldRenderPublicWidgets\(isAuthenticated, pathname\)/.test(ungated),
  )
}
{
  const emptied = bodyToNext.replace('<CookieConsent onOpenChange={setCookieOpen} />', 'null')
  check('MUTATION: a notice that renders nothing fails', !/<CookieConsent/.test(emptied))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
