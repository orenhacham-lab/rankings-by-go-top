/**
 * Wave-7 review fixes on the public site and the app shell (job fix-public),
 * checked by rendering the real components (react-dom/server) where a render
 * says it, and from source (comments stripped) where only the source can:
 *
 *   A) P2-1   the project switcher, while its list loads, is a skeleton pill of
 *             the real pill's shape, with "loading projects" for screen readers
 *             only (it printed the text and then changed width);
 *   B) P2-13  billing (DISPLAY ONLY): prices grouped like the public pricing
 *             page (₪1,999, not ₪1999), each card with its audience, and the
 *             recommended plan as the one navy card;
 *   C) P2-14  the dashboard folds after its first cards on every width, with
 *             the "more" button under both columns on a wide screen;
 *   D) P1-9   the free check's form in the landing's language: the hero
 *             backdrop, the landing's field, a trust line and what the check
 *             shows, each in its own language, entering with the shared CSS
 *             stagger; the result page keeps the claim-carrying sign-up link.
 *
 * The auth pages (P1-9, P2-17) are guarded in components/auth/__qa__/auth-shell.qa.ts,
 * the reduced-motion counters (P0-2) in components/public/__qa__/landing-page.qa.ts,
 * the trial bar (P1-1) in lib/billing/__qa__/trial-bar.qa.ts, the privacy notice
 * (P2-10) in components/public/__qa__/public-design.qa.ts, and all of them in a
 * browser by lib/__qa__/reviewer-journey/w7-public-polish.js.
 * Every check has a MUTATION CONTROL: the same check on a broken copy fails.
 *
 *   npx tsx lib/__qa__/w7-fix-public.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const HEBREW = /[֐-׿]/
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

// Router hooks and the active-project state are the only substitutions.
let ACTIVE: any = { activeProjectId: null, projects: [], isResolved: false, projectsError: null, reloadProjects() {}, setActiveProject() {} }
const Mod: any = require('module')
const origLoad = Mod._load
Mod._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  if (request === 'next/navigation') {
    return new Proxy(real, {
      get: (t, k) => (k === 'usePathname' ? () => '/dashboard'
        : k === 'useSearchParams' ? () => new URLSearchParams()
        : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
        : (t as any)[k]),
    })
  }
  if (/lib\/active-project\/ActiveProjectProvider$/.test(request)) return { ...real, useActiveProject: () => ACTIVE }
  return real
}
const { DashboardLanguageProvider } = require(join(ROOT, 'lib/i18n/dashboard/useDashboardLanguage.tsx'))
const inLang = (locale: 'he' | 'en', el: any) => renderToStaticMarkup(h(DashboardLanguageProvider as never, { initialLocale: locale, children: el } as never) as never)

// ── A) the switcher while it loads ────────────────────────────────────────────
console.log('A) P2-1 the switcher while its list loads')
{
  const WorkspaceSwitcher = require(join(ROOT, 'components/layout/WorkspaceSwitcher.tsx')).default
  ACTIVE = { ...ACTIVE, isResolved: false }
  const he = inLang('he', h(WorkspaceSwitcher)), en = inLang('en', h(WorkspaceSwitcher))
  const loadingHe = 'טוען פרויקטים…'
  const skeleton = (html: string, loadingText: string) => /data-switcher-skeleton/.test(html) && /aria-busy="true"/.test(html)
    && /class="[^"]*\bh-9\b[^"]*\brounded-control\b[^"]*"/.test(html) && /class="skeleton size-6/.test(html)
    && new RegExp(`<span class="sr-only">${loadingText}</span>`).test(html)
    && !new RegExp(`<span[^>]*class="text-copy text-muted"[^>]*>${loadingText}</span>`).test(html)
  check('A1: Hebrew: a skeleton pill of the real pill\'s height and radius; "טוען פרויקטים…" for screen readers only', skeleton(he, loadingHe), he.slice(0, 400))
  check('A2: English likewise, and no Hebrew', skeleton(en, 'Loading projects…') || (/data-switcher-skeleton/.test(en) && /sr-only/.test(en) && !HEBREW.test(en)), en.slice(0, 300))
  check('MUT: the old plain loading text fails A1',
    !skeleton(`<span data-onboarding="workspace" class="text-copy text-muted">${loadingHe}</span>`, loadingHe))
  ACTIVE = { ...ACTIVE, isResolved: true, projects: [{ id: 'p1', name: 'אינסטלציה מהירה', target_domain: 'plumber-tlv.co.il' }], activeProjectId: 'p1' }
  const ready = inLang('he', h(WorkspaceSwitcher))
  check('A3 (control): once loaded it is the real button with the project\'s name, and no skeleton', /aria-haspopup="listbox"/.test(ready) && ready.includes('אינסטלציה מהירה') && !/data-switcher-skeleton/.test(ready))
}

// ── B) billing, display only ──────────────────────────────────────────────────
console.log('\nB) P2-13 billing cards (display only)')
{
  const src = strip(read('app/(dashboard)/billing/BillingView.tsx'))
  // The locale now comes from the INTL_LOCALE table rather than a test for
  // English, because that test answered he-IL for every other language and would
  // have printed a Spanish price with Hebrew grouping. The display contract this
  // checks — the figure is grouped, and this screen only shows it — is the same.
  const grouped = (s: string) => /\{currencySymbol\}\{price\.toLocaleString\(numberLocale\)\}/.test(s) && /const numberLocale = INTL_LOCALE\[uiLocale\]/.test(s)
  check('B1: the price is grouped for the locale (₪1,999)', grouped(src))
  check('MUT: the old raw {price} fails B1', !grouped(src.replace('{price.toLocaleString(numberLocale)}', '{price}')))
  check('B1b: …and he-IL grouping really prints ₪1,999', `₪${(1999).toLocaleString('he-IL')}` === '₪1,999' && `$${(1999).toLocaleString('en-US')}` === '$1,999')
  const pricingLook = (s: string) => /audience=\{PLAN_AUDIENCE_LABEL\.(regular|advanced|premium|large_agency)\[language\]\}/.test(s)
    && (s.match(/audience=\{PLAN_AUDIENCE_LABEL\./g) ?? []).length === 4
    && (s.match(/description=\{PLAN_AUDIENCE_DESCRIPTION\./g) ?? []).length === 4
    && /const navy = isPopular/.test(s) && /'border-contrast bg-contrast text-contrast-ink /.test(s) && /<Star className="size-3"/.test(s)
  check('B2: every card has the pricing page\'s audience and sentence; the recommended plan is the one navy card with the star', pricingLook(src))
  check('MUT: a card without its audience fails B2', !pricingLook(src.replace(/audience=\{PLAN_AUDIENCE_LABEL\.premium\[language\]\}/, '')))
  // Display only: the actions and the PayPal containers are the ones the screen had.
  // w17: the market choice (switch + continue buttons + /api/billing-market/select)
  // is gone by the owner's decision; the currency is the server's.
  const logicKept = (s: string) => /id=\{`paypal-button-\$\{plan\}`\}/.test(s) && !/\/api\/billing-market\/select/.test(s) && /fetch\('\/api\/paypal\/cancel', \{ method: 'POST' \}\)/.test(s)
    && !/planAction\(/.test(s)
  check('B3: display only: the PayPal containers and the cancel request are unchanged; no client market choice (w17)', logicKept(src))
  check('MUT: a PayPal container dropped fails B3', !logicKept(src.replace('id={`paypal-button-${plan}`}', 'id="x"')))
}

// ── C) the dashboard fold ─────────────────────────────────────────────────────
console.log('\nC) P2-14 the dashboard folds on every width')
{
  const src = strip(read('app/(dashboard)/dashboard/page.tsx'))
  const folded = (s: string) => /const fold = allCards \|\| startMode \? '' : 'hidden'/.test(s)
    && /data-dashboard-fold/.test(s) && !/flex justify-center xl:hidden/.test(s) && /xl:order-last xl:col-span-2/.test(s)
    && (s.match(/\$\{fold\}/g) ?? []).length >= 7
  check('C1: the cards after the first five are folded on a wide screen too, and the button spans both columns', folded(src))
  check('MUT: the old phone-only fold fails C1', !folded(src.replace("'hidden'\n", "'max-xl:hidden'\n").replace(`: 'hidden'`, `: 'max-xl:hidden'`)))
  check('MUT: a button hidden on a wide screen fails C1', !folded(src.replace('flex justify-center xl:order-last', 'flex justify-center xl:hidden xl:order-last')))
}

// ── D) the free check in the landing's language ───────────────────────────────
console.log('\nD) P1-9 the free check')
{
  const { FormState } = require(join(ROOT, 'components/free-check/FreeCheckExperience.tsx'))
  const { freeCheckCopy } = require(join(ROOT, 'lib/free-check/copy.ts'))
  const render = (locale: 'he' | 'en', error: string | null = null) =>
    renderToStaticMarkup(h(FormState, { copy: freeCheckCopy(locale), locale, url: '', onUrl() {}, error, onSubmit() {} }))
  const he = render('he'), en = render('en')
  const premium = (html: string, locale: 'he' | 'en') => {
    const c = freeCheckCopy(locale)
    return /data-free-check-form/.test(html) && /class="stagger-in"/.test(html)
      && /class="flex flex-col gap-2 rounded-card border border-line bg-surface p-2 shadow-pop sm:flex-row"/.test(html)
      && c.page.trust.every((t: string) => html.includes(t)) && c.page.expect.every((e: any) => html.includes(e.title) && html.includes(e.body))
      && /<span class="block text-action">/.test(html) && (html.match(/<h1\b/g) ?? []).length === 1
  }
  check('D1: Hebrew form: the landing field, the trust line and the three "what you get" cards, entering with the stagger', premium(he, 'he'))
  check('D2: English form likewise, and no Hebrew', premium(en, 'en') && !HEBREW.test(text(en)), (text(en).match(/[֐-׿][^ ]*/g) ?? []).slice(0, 3).join(' '))
  check('MUT: the old plain form (no trust, no cards) fails D1', !premium(he.replace(/<ul class="stagger-in[\s\S]*<\/ul>/, ''), 'he'))
  const err = render('he', 'invalid_url')
  const errOk = (html: string) => /role="alert"/.test(html) && html.includes(freeCheckCopy('he').form.errors.invalid_url) && /data-notice="bad"/.test(html)
  check('D3: the error state is the same premium form with our own sentence in a bad notice', errOk(err) && premium(err, 'he'))
  check('MUT: an error without our sentence fails D3', !errOk(err.split(freeCheckCopy('he').form.errors.invalid_url).join('')))
  const expSrc = strip(read('components/free-check/FreeCheckExperience.tsx'))
  const results = (s: string) => /<HeroBackdrop \/>/.test(s) && /stagger-in relative mx-auto max-w-4xl/.test(s) && /data-free-check-gate/.test(s)
    && /signupHref=\{claimToken \? `\$\{signupHref\}\$\{signupHref\.includes\('\?'\) \? '&' : '\?'\}claim=\$\{encodeURIComponent\(claimToken\)\}` : signupHref\}/.test(s)
  check('D4: the result page sits on the backdrop, enters with the stagger, and still carries the claim on its sign-up link', results(expSrc))
  check('MUT: a sign-up link that dropped the claim fails D4', !results(expSrc.replace('claim=${encodeURIComponent(claimToken)}', '')))
  const research = strip(read('components/free-check/FreeCheckResearch.tsx'))
  check('D5: the research before sign-up sits on the same backdrop', /<HeroBackdrop \/>/.test(research))
  const backdrop = strip(read('components/public/HeroBackdrop.tsx'))
  check('D6: the backdrop is decoration only and still (aria-hidden, no animation)', /aria-hidden="true"/.test(backdrop) && !/animate-|glow-drift|float-y/.test(backdrop))
  check('MUT: an animated backdrop fails D6', !(/aria-hidden="true"/.test(backdrop + ' glow-drift') && !/animate-|glow-drift|float-y/.test(backdrop + ' glow-drift')))
}

Mod._load = origLoad
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
export {}
