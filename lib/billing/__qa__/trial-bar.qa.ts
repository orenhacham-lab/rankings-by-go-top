/**
 * The trial bar: who sees it, what it says, and that it is display only.
 *
 *   A) the decision (trialBarState) over every kind of account: a website trial
 *      sees it; an administrator, an account from Shopify or billed by Shopify,
 *      a paying or cancelled-in-period account, and an unreadable state do not.
 *      The last day and an ended trial have their own wording.
 *   B) the loader over the REAL getUserEntitlement and billing_governance reads,
 *      on FakeAdmin: each account resolves as in A, another user's trial never
 *      leaks, a failed read hides the bar, and nothing at all is written.
 *   C) the component renders the answer in the dashboard's language, links to
 *      the billing screen, and leaves the link out on the billing screen. Its
 *      look is the UX review's P1-1: navy strip, the day count in the warm
 *      badge, "Upgrade now" in the action colour (never amber), urgent dark red
 *      in the last three days, hideable for 24 hours unless the trial ended.
 *   D) source guards: the layout reads the bar for the session's own user, the
 *      bar module writes nothing and names no plan price or quota, and the bar
 *      uses the design tokens (logical sides, token colours).
 * Every guard has a MUTATION CONTROL: the same check run on a broken copy fails.
 *
 * Run: npx tsx lib/billing/__qa__/trial-bar.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { loadTrialBar, trialBarState, type TrialBarFacts, type TrialBarState } from '../trial-bar'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const NOW = new Date('2026-09-27T10:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()
const WEB = { authority: 'website' as const, signupOrigin: 'website' as const }
const trial = (endsInMs: number) => ({ isAdmin: false, plan: 'trial' as const, trialActive: endsInMs > 0, trialEndsAt: at(endsInMs), hasActiveSubscription: false })

type Decide = (facts: TrialBarFacts, now: Date) => TrialBarState
const show = (s: TrialBarState) => (s.kind === 'active' ? `active:${s.daysLeft}` : s.kind)

/** The whole "who sees it" table. Each row: facts, and the answer the owner asked for. */
const MATRIX: [string, TrialBarFacts, string][] = [
  ['a website trial with 7 days left', { governance: WEB, entitlement: trial(7 * 24 * HOUR) }, 'active:7'],
  ['…with 6 days and an hour left (whole days, rounded up)', { governance: WEB, entitlement: trial(6 * 24 * HOUR + HOUR) }, 'active:7'],
  ['…with 2 days left', { governance: WEB, entitlement: trial(2 * 24 * HOUR) }, 'active:2'],
  ['…with 25 hours left', { governance: WEB, entitlement: trial(25 * HOUR) }, 'active:2'],
  ['…with 23 hours left: the last day', { governance: WEB, entitlement: trial(23 * HOUR) }, 'last_day'],
  ['…with exactly 24 hours left: the last day', { governance: WEB, entitlement: trial(24 * HOUR) }, 'last_day'],
  ['a trial that ended an hour ago: expired', { governance: WEB, entitlement: trial(-HOUR) }, 'expired'],
  ['a trial that ends this very instant: expired', { governance: WEB, entitlement: { ...trial(0), trialActive: false } }, 'expired'],
  ['a website account with no governance row (the website default)', { governance: { authority: 'website', signupOrigin: null }, entitlement: trial(3 * 24 * HOUR) }, 'active:3'],
  ['an administrator', { governance: WEB, entitlement: { ...trial(3 * 24 * HOUR), isAdmin: true, plan: 'large_agency', trialActive: false, trialEndsAt: null, hasActiveSubscription: true } }, 'hidden'],
  ['an administrator whose own old trial row is still there', { governance: WEB, entitlement: { ...trial(3 * 24 * HOUR), isAdmin: true } }, 'hidden'],
  ['an account Shopify bills', { governance: { authority: 'shopify', signupOrigin: 'shopify_app_store' }, entitlement: { ...trial(3 * 24 * HOUR), plan: 'shopify_billing_required', trialActive: false, trialEndsAt: null } }, 'hidden'],
  ['an account from the Shopify App Store, even with a website trial on record', { governance: { authority: 'website', signupOrigin: 'shopify_app_store' }, entitlement: trial(3 * 24 * HOUR) }, 'hidden'],
  ['a website account migrated to Shopify billing', { governance: { authority: 'shopify', signupOrigin: 'website' }, entitlement: trial(3 * 24 * HOUR) }, 'hidden'],
  ['a paying account', { governance: WEB, entitlement: { isAdmin: false, plan: 'regular', trialActive: false, trialEndsAt: null, hasActiveSubscription: true } }, 'hidden'],
  ['a cancelled account still inside its paid period', { governance: WEB, entitlement: { isAdmin: false, plan: 'advanced', trialActive: false, trialEndsAt: null, hasActiveSubscription: true } }, 'hidden'],
  ['an account with no trial on record', { governance: WEB, entitlement: { isAdmin: false, plan: 'trial', trialActive: false, trialEndsAt: null, hasActiveSubscription: false } }, 'hidden'],
  ['an entitlement that could not be read', { governance: WEB, entitlement: { isAdmin: false, plan: 'entitlement_unavailable', trialActive: false, trialEndsAt: null, hasActiveSubscription: false } }, 'hidden'],
  ['governance that could not be read', { governance: null, entitlement: trial(3 * 24 * HOUR) }, 'hidden'],
  ['no entitlement at all', { governance: WEB, entitlement: null }, 'hidden'],
  ['a trial date that is not a date', { governance: WEB, entitlement: { ...trial(3 * 24 * HOUR), trialEndsAt: 'soon' } }, 'hidden'],
]
const wrongRows = (decide: Decide) => MATRIX.filter(([, facts, want]) => show(decide(facts, NOW)) !== want).map(([name, facts]) => `${name} → ${show(decide(facts, NOW))}`)

// ── Fakes for the loader ────────────────────────────────────────────────────

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
type Tables = Record<string, Record<string, unknown>[]>
function world(extra: Tables = {}, hooks: Record<string, unknown> = {}) {
  const tables: Tables = { profiles: [{ id: USER, role: 'user' }], billing_governance: [], subscriptions: [], ...extra }
  const fake = new FakeAdmin(tables, hooks as never)
  const writes: string[] = []
  const from = fake.from.bind(fake)
  ;(fake as any).from = (name: string) => {
    const q = from(name) as any
    for (const op of ['insert', 'update', 'upsert', 'delete']) {
      const orig = q[op].bind(q)
      q[op] = (...args: unknown[]) => { writes.push(`${op} ${name}`); return orig(...args) }
    }
    return q
  }
  return { tables, admin: fake as any, writes }
}
const sub = (over: Record<string, unknown>) => ({ id: 's1', user_id: USER, plan_code: 'trial', status: 'trial', trial_ends_at: at(5 * 24 * HOUR), current_period_end: null, created_at: '2026-09-22T10:00:00.000Z', ...over })

async function main() {
  console.log('A) who sees the bar, and what it says')
  {
    const wrong = wrongRows(trialBarState)
    check(`A1: all ${MATRIX.length} kinds of account get the answer asked for`, wrong.length === 0, wrong.join(' | '))
    check('MUTATION CONTROL: a decision that forgets administrators is caught',
      wrongRows((f, n) => trialBarState({ ...f, entitlement: f.entitlement && { ...f.entitlement, isAdmin: false } }, n)).some((r) => r.startsWith('an administrator whose')))
    check('MUTATION CONTROL: a decision that only looks at who bills, not where the account came from, is caught',
      wrongRows((f, n) => trialBarState({ ...f, governance: f.governance && { ...f.governance, signupOrigin: null } }, n)).some((r) => r.startsWith('an account from the Shopify App Store')))
    check('MUTATION CONTROL: a decision that shows a paying account the bar is caught',
      wrongRows((f, n) => trialBarState({ ...f, entitlement: f.entitlement && { ...f.entitlement, plan: 'trial', hasActiveSubscription: false, trialEndsAt: f.entitlement.trialEndsAt ?? at(3 * 24 * HOUR), trialActive: true } }, n)).some((r) => r.startsWith('a paying account')))
    check('MUTATION CONTROL: whole days rounded down instead of up is caught',
      wrongRows((f, n) => { const s = trialBarState(f, n); return s.kind === 'active' ? { kind: 'active', daysLeft: s.daysLeft - 1 } : s }).length > 0)
  }

  console.log('\nB) the loader, over the real entitlement and governance reads')
  {
    const run = async (extra: Tables, hooks: Record<string, unknown> = {}) => {
      const w = world(extra, hooks)
      return { state: show(await loadTrialBar(w.admin, USER, NOW)), writes: w.writes }
    }
    const web = await run({ subscriptions: [sub({})] })
    check('B1: a website trial with 5 days left → the bar with 5', web.state === 'active:5', web.state)
    check('B2: …and the loader wrote nothing', web.writes.length === 0, web.writes.join(','))
    const last = await run({ subscriptions: [sub({ trial_ends_at: at(3 * HOUR) })] })
    check('B3: three hours left → the last day', last.state === 'last_day', last.state)
    const ended = await run({ subscriptions: [sub({ trial_ends_at: at(-2 * HOUR) })] })
    check('B4: an ended trial → expired', ended.state === 'expired', ended.state)
    const admin = await run({ profiles: [{ id: USER, role: 'admin' }], subscriptions: [sub({})] })
    check('B5: an administrator with a trial row → nothing', admin.state === 'hidden', admin.state)
    const shopify = await run({ subscriptions: [sub({})], billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }] })
    check('B6: a Shopify-governed account with a website trial row → nothing', shopify.state === 'hidden', shopify.state)
    const origin = await run({ subscriptions: [sub({})], billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'website', authority_reason: null }] })
    check('B7: an account that came from the Shopify App Store → nothing', origin.state === 'hidden', origin.state)
    const paid = await run({ subscriptions: [sub({ plan_code: 'regular', status: 'active', trial_ends_at: null, current_period_end: at(20 * 24 * HOUR) })] })
    check('B8: a paying account → nothing', paid.state === 'hidden', paid.state)
    const cancelled = await run({ subscriptions: [sub({ plan_code: 'advanced', status: 'cancelled', trial_ends_at: null, current_period_end: at(10 * 24 * HOUR) })] })
    check('B9: a cancelled account inside its period → nothing', cancelled.state === 'hidden', cancelled.state)
    const leak = await run({ subscriptions: [sub({ user_id: OTHER })] })
    check("B10: another user's trial never shows here (every read filtered by the owner)", leak.state === 'hidden', leak.state)
    const govDown = await run({ subscriptions: [sub({})] }, { billing_governance: { select: () => ({ code: '42501', message: 'permission denied' }) } })
    check('B11: governance unreadable → nothing, not a guess', govDown.state === 'hidden', govDown.state)
    const subDown = await run({ subscriptions: [sub({})] }, { subscriptions: { select: () => ({ code: '500', message: 'down' }) } })
    check('B12: subscriptions unreadable → nothing', subDown.state === 'hidden', subDown.state)
    // MUTATION CONTROL: the same world, with the subscriptions read's owner filter dropped.
    const unfiltered = world({ subscriptions: [sub({ user_id: OTHER })] })
    const inner = unfiltered.admin.from.bind(unfiltered.admin)
    unfiltered.admin.from = (name: string) => {
      const q = inner(name)
      if (name !== 'subscriptions') return q
      const eq = q.eq.bind(q)
      q.eq = (col: string, val: unknown) => (col === 'user_id' ? q : eq(col, val))
      return q
    }
    check("MUTATION CONTROL: without the owner filter the other user's trial WOULD show, so B10 is a real test",
      show(await loadTrialBar(unfiltered.admin, USER, NOW)) === 'active:5')
  }

  console.log('\nC) the component, in both languages')
  {
    let PATHNAME = '/dashboard'
    const Mod: any = require('module')
    const origLoad = Mod._load
    Mod._load = function (request: string, parent: any, isMain: boolean) {
      const real = origLoad.call(this, request, parent, isMain)
      if (request !== 'next/navigation') return real
      return new Proxy(real, { get: (t, k) => (k === 'usePathname' ? () => PATHNAME : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {} }) : (t as any)[k]) })
    }
    const { DashboardLanguageProvider } = require(join(ROOT, 'lib/i18n/dashboard/useDashboardLanguage.tsx'))
    const TrialBar = require(join(ROOT, 'components/layout/TrialBar.tsx')).default
    const render = (state: TrialBarState, locale: 'he' | 'en') =>
      renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale }, createElement(TrialBar, { state })))

    const he = render({ kind: 'active', daysLeft: 5 }, 'he')
    const text = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    check('C1: Hebrew — "נותרו 5 ימים לתקופת הניסיון" (the number in the badge) and "שדרגו עכשיו"',
      text(he).includes('נותרו 5 ימים לתקופת הניסיון') && /data-trial-days=""[^>]*>5<\/span>/.test(he) && he.includes('שדרגו עכשיו'), text(he))
    check('C1-MUT: the old singular "שדרג עכשיו" / "שלך" wording fails C1',
      !(text(he.replace('שדרגו עכשיו', 'שדרג עכשיו')).includes('שדרגו עכשיו')))
    check('C2: the button links to the existing billing screen', /<a [^>]*href="\/billing"[^>]*data-trial-upgrade/.test(he) || /<a [^>]*data-trial-upgrade[^>]*href="\/billing"/.test(he), he)
    const en = render({ kind: 'active', daysLeft: 5 }, 'en')
    check('C3: English — "5 days left in your free trial" and "Upgrade now", and no Hebrew', text(en).includes('5 days left in your free trial') && en.includes('Upgrade now') && !/[֐-׿]/.test(en), text(en))
    check('C4: no singular form of address and no em-dash in the Hebrew bar, in any state',
      (['active', 'last_day', 'expired'] as const).every((k) => { const h = text(render(k === 'active' ? { kind: k, daysLeft: 5 } : { kind: k }, 'he')); return !/שלך|שדרג |—/.test(h) }))
    check('C5: the last day has its own wording in both languages',
      render({ kind: 'last_day' }, 'he').includes('זה היום האחרון של תקופת הניסיון') && render({ kind: 'last_day' }, 'en').includes('This is the last day of your free trial'))
    check('C6: an ended trial has its own wording in both languages, still with the way to upgrade',
      render({ kind: 'expired' }, 'he').includes('תקופת הניסיון הסתיימה') && render({ kind: 'expired' }, 'en').includes('Your free trial has ended') && render({ kind: 'expired' }, 'en').includes('href="/billing"'))
    check('C7: hidden renders nothing at all', render({ kind: 'hidden' }, 'he') === '' && render({ kind: 'hidden' }, 'en') === '')
    const cls = (h: string) => /data-trial-bar="[^"]*"[^>]*class="([^"]*)"/.exec(h)?.[1] ?? /class="([^"]*)"[^>]*data-trial-bar=/.exec(h)?.[1] ?? ''
    const calm = cls(he), urgent3 = cls(render({ kind: 'active', daysLeft: 3 }, 'he')), last = cls(render({ kind: 'last_day' }, 'he')), ended = cls(render({ kind: 'expired' }, 'he'))
    const stateColours = (c: string, u: string, l: string, e: string) =>
      /(^| )bg-contrast( |$)/.test(c) && [u, l, e].every((x) => /(^| )bg-contrast-urgent( |$)/.test(x)) && [c, u, l, e].every((x) => x.includes('text-contrast-ink'))
    check('C8: navy (contrast) with more than 3 days left; the urgent dark red for 3 days or less, the last day and an ended trial',
      stateColours(calm, urgent3, last, ended), JSON.stringify({ calm, urgent3, last, ended }))
    check('C8-MUT: an urgent state still in navy fails C8', !stateColours(calm, calm, last, ended))
    const cta = /<a [^>]*data-trial-upgrade[^>]*>/.exec(he)?.[0] ?? ''
    const ctaOk = (a: string) => /bg-action /.test(a) && /text-action-ink/.test(a) && /h-7/.test(a) && !/commit/.test(a)
    check('C8b: "Upgrade now" is white on the action colour, 28px, never the amber commit colour (UX review P1-1)', ctaOk(cta), cta)
    check('C8b-MUT: the old amber button fails C8b', !ctaOk(cta.replace('bg-action ', 'bg-commit ')))
    check('C8c: the day count sits in the warm trial badge', /data-trial-days=""[^>]*class="[^"]*bg-commit[^"]*text-commit-ink/.test(he))
    const hideOk = (active: string, expired: string) => /data-trial-hide/.test(active) && !/data-trial-hide/.test(expired)
    check('C8d: days left can be hidden for 24 hours; an ended trial cannot', hideOk(he, render({ kind: 'expired' }, 'he')))
    check('C8d-MUT: a hide button on the ended trial fails C8d', !hideOk(he, he))
    PATHNAME = '/billing'
    const onBilling = render({ kind: 'active', daysLeft: 5 }, 'he')
    check('C9: on the billing screen the sentence stays and the link goes', text(onBilling).includes('נותרו 5 ימים') && !onBilling.includes('data-trial-upgrade'))
    PATHNAME = '/dashboard'
    Mod._load = origLoad
  }

  console.log('\nD) source guards')
  {
    const layout = strip(read('app/(dashboard)/layout.tsx'))
    const layoutOk = (src: string) =>
      /<TrialBarSlot userId=\{user\.id\} \/>/.test(src) && /loadTrialBar\(admin, userId\)/.test(src) && /<Suspense fallback=\{null\}>\s*<TrialBarSlot/.test(src)
    check('D1: the layout reads the bar for the session user (user.id from auth.getUser), in its own Suspense', layoutOk(layout))
    check('MUTATION CONTROL: a layout that passes any other id is caught', !layoutOk(layout.replace('<TrialBarSlot userId={user.id} />', '<TrialBarSlot userId={searchParams.user} />')))

    const mod = strip(read('lib/billing/trial-bar.ts'))
    const WRITES = /\.(insert|update|upsert|delete|rpc)\(|PLAN_CATALOG|PLAN_LIMITS|priceILS|priceUSD|maxKeyword|maxProjects/
    check('D2: the bar module writes nothing and names no price, plan limit or quota', !WRITES.test(mod), WRITES.exec(mod)?.[0])
    check('MUTATION CONTROL: a module that writes the subscription is caught', WRITES.test(mod + "\nadmin.from('subscriptions').update({ status: 'active' })"))

    const bar = strip(read('components/layout/TrialBar.tsx'))
    const PHYSICAL = /(?<![\w-])(?:-?m[lr]|p[lr]|-?left|-?right|border-[lr]|rounded-[lr])-[\w[]|(?<![\w-])text-(?:left|right)\b/
    const RAW_COLOUR = /(?<![\w-])(?:bg|text|border)-(?:red|blue|green|yellow|amber|orange|slate|gray|indigo)-\d{2,3}\b|#[0-9a-fA-F]{3,6}\b/
    check('D3: the bar uses logical sides and design tokens only (no raw palette or hex colours)', !PHYSICAL.test(bar) && !RAW_COLOUR.test(bar), PHYSICAL.exec(bar)?.[0] ?? RAW_COLOUR.exec(bar)?.[0])
    check('MUTATION CONTROL: a raw amber background is caught', RAW_COLOUR.test(bar.replace("'bg-contrast'", "'bg-amber-50'")))
    check('MUTATION CONTROL: a physical margin is caught', PHYSICAL.test(bar.replace('me-0.5', 'ml-0.5')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
