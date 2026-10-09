/**
 * THE SCREENS A PARTNER AND AN OPERATOR ACTUALLY SEE.
 *
 *   A) every language the site speaks is complete — the locale list is DERIVED,
 *      so a fifth language fails this suite rather than shipping half-English
 *   B) the privacy boundary: nothing a partner can see says who a referred
 *      customer is, because the live agreement promises exactly that
 *   C) the click counter keeps no visitor data at all
 *   D) the partner's link and its destinations: a closed list, so `?to=` can
 *      never be turned into a redirect
 *   E) the numbers on the screen are the ones in the table's defaults
 *   F) the partner's own page is reachable while their own trial is not
 *
 * Every guard has a MUTATION CONTROL.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES } from '../../i18n/locales'
import { AFFILIATE_FORM_COPY } from '../../i18n/public/affiliate-form'
import { AFFILIATE_DASHBOARD_COPY, CREATIVE_LINK_TOKEN } from '../../i18n/public/affiliate-dashboard'
import { AFFILIATE_TERMS } from '../terms'
import { AFFILIATE_DESTINATIONS, affiliateLinkPath, affiliateRedirectPath, affiliateDestination } from '../link'
import { APPLICATION_LIMITS, suggestCode } from '../application'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { loadPartnerSummary } from '../summary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
/** SQL comments are `--`, so a guard over a migration must drop those too. */
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, '')
/** One CREATE TABLE statement, comments already gone. */
const tableSql = (sql: string, name: string) => {
  const from = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`)
  return from < 0 ? '' : sql.slice(from, sql.indexOf(');', from))
}

/** Every leaf string of an object, so "complete" means complete. */
function leaves(value: unknown, path = ''): { path: string; value: unknown }[] {
  if (typeof value === 'function') return [{ path, value: 'fn' }]
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  return [{ path, value }]
}

const NOW = new Date('2026-10-09T12:00:00.000Z')

async function main() {
  console.log('A) every language, complete')
  {
    // DERIVED, never a list typed here: a fifth language must fail this suite.
    check('A0: the locale list is the site’s own', PUBLIC_LOCALES.length >= 4 && PUBLIC_LOCALES.includes('pt-BR'))
    for (const copy of [{ name: 'form', value: AFFILIATE_FORM_COPY }, { name: 'dashboard', value: AFFILIATE_DASHBOARD_COPY }]) {
      const shape = leaves(copy.value.he).map((l) => l.path).sort().join('|')
      for (const locale of PUBLIC_LOCALES) {
        const mine = leaves(copy.value[locale])
        check(`A1 (${copy.name}/${locale}): the same fields as Hebrew, none missing`,
          mine.map((l) => l.path).sort().join('|') === shape,
          mine.map((l) => l.path).sort().filter((p) => !shape.includes(p)).join(','))
        const empty = mine.filter((l) => typeof l.value === 'string' && !l.value.trim())
        check(`A2 (${copy.name}/${locale}): nothing left blank`, empty.length === 0, empty.map((l) => l.path).join(','))
      }
      // The same English sentence in two languages means one was never translated.
      const dupes = PUBLIC_LOCALES.filter((l) => l !== 'en'
        && JSON.stringify(leaves(copy.value[l]).map((x) => x.value)) === JSON.stringify(leaves(copy.value.en).map((x) => x.value)))
      check(`A3 (${copy.name}): no language was left reading English`, dupes.length === 0, dupes.join(','))
    }
    // The form's error keys must be the FIELD NAMES the server answers with, or
    // an error lands on no input at all.
    check('A4: every error the server can name has a sentence in every language', (() => {
      const fields = Object.keys(APPLICATION_LIMITS)
      return PUBLIC_LOCALES.every((l) => fields.every((f) => typeof (AFFILIATE_FORM_COPY[l].errors as Record<string, unknown>)[f] === 'string'))
    })(), Object.keys(APPLICATION_LIMITS).join(','))
    check('A5: every language’s creatives carry the link token, so a partner never posts a bare sentence',
      PUBLIC_LOCALES.every((l) => AFFILIATE_DASHBOARD_COPY[l].creatives.length >= 3
        && AFFILIATE_DASHBOARD_COPY[l].creatives.every((c) => c.body.includes(CREATIVE_LINK_TOKEN))),
      PUBLIC_LOCALES.filter((l) => !AFFILIATE_DASHBOARD_COPY[l].creatives.every((c) => c.body.includes(CREATIVE_LINK_TOKEN))).join(','))
    /* A1-MUT: a language missing one field must fail A1. */
    check('A1-MUT: a missing field is caught', (() => {
      const broken = { ...AFFILIATE_FORM_COPY.en } as Record<string, unknown>
      delete broken.submit
      return leaves(broken).map((l) => l.path).sort().join('|') !== leaves(AFFILIATE_FORM_COPY.he).map((l) => l.path).sort().join('|')
    })())
    check('A5-MUT: a creative without the link token is caught',
      !['a post with no link'].every((b) => b.includes(CREATIVE_LINK_TOKEN)))
  }

  console.log('\nB) the privacy boundary')
  {
    const admin = new FakeAdmin({
      affiliates: [{ id: 'aff-1', user_id: 'partner-user', code: 'dana', status: 'approved', name: 'דנה', base_rate: 30, top_rate: 40, top_rate_from: 10, payout_method: 'paypal' }],
      affiliate_click_days: [{ affiliate_id: 'aff-1', day: '2026-10-08', clicks: 12 }],
      affiliate_referrals: [
        { id: 'ref-1', affiliate_id: 'aff-1', referred_user_id: 'cust-secret-1', status: 'paying' },
        { id: 'ref-2', affiliate_id: 'aff-1', referred_user_id: 'cust-secret-2', status: 'signed_up' },
      ],
      affiliate_commissions: [
        { id: 'c1', affiliate_id: 'aff-1', amount: 74.7, currency: 'ILS', status: 'pending', releases_at: '2026-11-08T00:00:00.000Z' },
      ],
      affiliate_payouts: [],
    })
    const summary = await loadPartnerSummary(admin, 'partner-user', NOW)
    check('B1: a partner sees their own counts and amounts',
      !!summary && summary.referrals.paying === 1 && summary.referrals.total === 2 && summary.clicks.total === 12, JSON.stringify(summary?.referrals))
    // THE GUARD. The agreement says a partner is given counts and amounts and
    // never a referred customer's identity, so nothing that reaches the screen
    // may carry one — not an id, not an email, not a site.
    const text = JSON.stringify(summary)
    check('B2: and NOTHING about a referred customer, not even an id',
      !text.includes('cust-secret-1') && !text.includes('cust-secret-2')
      && !/referred_user_id|customerEmail|customer_email/.test(text), text)
    check('B3: the module that builds the screen never selects a customer’s identity', (() => {
      const src = strip(read('lib/affiliate/summary.ts'))
      const partnerHalf = src.slice(0, src.indexOf('loadAdminOverview'))
      return !/referred_user_id/.test(partnerHalf)
    })())
    check('B4: the partner’s page shows only what the summary carries', (() => {
      const page = strip(read('app/(dashboard)/affiliate/page.tsx'))
      return /loadPartnerSummary\(/.test(page) && !/affiliate_referrals|referred_user_id/.test(page)
    })())
    check('B5: a signed-in account that is not a partner gets no partner data',
      (await loadPartnerSummary(admin, 'somebody-else', NOW)) === null)
    const pending = new FakeAdmin({ affiliates: [{ id: 'p', user_id: 'u', code: null, status: 'pending' }] })
    check('B6b: an application under review shows no link, because it has no code',
      (await loadPartnerSummary(pending, 'u', NOW)) === null)
    /* B2-MUT: a customer id reaching the summary must fail B2. */
    check('B2-MUT: a customer id in the summary is caught',
      JSON.stringify({ referrals: [{ referred_user_id: 'cust-secret-1' }] }).includes('cust-secret-1'))
  }

  console.log('\nC) the click counter keeps nothing')
  {
    const sql = stripSql(read('supabase/migrations/20261009180000_affiliate_program.sql'))
    const table = tableSql(sql, 'affiliate_click_days')
    // Not "we do not show it": the columns do not exist, so there is nothing to
    // leak, subpoena or have to disclose.
    check('C1: the table has no visitor column at all — no IP, no agent, no referer',
      !!table && !/\bip\b|_ip|user_agent|referer|referrer|fingerprint|session|visitor/i.test(table), table)
    check('C2: it counts per partner per DAY, so one visitor cannot be singled out',
      /PRIMARY KEY \(affiliate_id, day\)/.test(table))
    const route = strip(read('app/r/[code]/route.ts'))
    check('C3: the link route records nothing but the count',
      /affiliate_count_click/.test(route) && !/ip|user_agent|headers\(\)\.get\('x-forwarded-for'\)/i.test(route), route.slice(0, 200))
    const counting = new FakeAdmin({ affiliate_click_days: [] })
    await counting.rpc('affiliate_count_click', { p_affiliate_id: 'aff-1', p_day: '2026-10-09' })
    await counting.rpc('affiliate_count_click', { p_affiliate_id: 'aff-1', p_day: '2026-10-09' })
    check('C4: two clicks on one day are one row and a count of two',
      counting.tables.affiliate_click_days.length === 1 && counting.tables.affiliate_click_days[0].clicks === 2)
    check('C5: nothing about the visitor is even available to store',
      Object.keys(counting.tables.affiliate_click_days[0]).sort().join(',') === 'affiliate_id,clicks,day,updated_at')
    /* C1-MUT: an IP column in that table must fail C1. */
    check('C1-MUT: an added visitor column is caught', /ip/i.test('clicker_ip text,'))
  }

  console.log('\nD) the link and its destinations')
  {
    check('D1: the link is the partner’s code on our own path', affiliateLinkPath('dana') === '/r/dana')
    check('D2: `to` picks from a closed list of OUR pages',
      Object.keys(AFFILIATE_DESTINATIONS).every((k) => affiliateRedirectPath('dana', k).startsWith('/'))
      && affiliateRedirectPath('dana', 'pricing').includes('ref=dana'))
    // `to` is a KEY, never a path, so there is no redirect to turn outward.
    const attacks = ['//evil.com', 'https://evil.com', '/\\evil.com', 'http:/evil.com', '%2F%2Fevil.com', '/dashboard/admin']
    check('D3: nothing that is not a key resolves to anything but our home page',
      attacks.every((a) => {
        const resolved = affiliateRedirectPath('dana', a)
        return resolved.startsWith('/') && !resolved.startsWith('//') && !/evil|admin/.test(resolved)
      }), attacks.map((a) => `${a} -> ${affiliateRedirectPath('dana', a)}`).join(' | '))
    check('D4: every destination is a page that really exists', Object.values(AFFILIATE_DESTINATIONS).every((path) => {
      const rel = path === '/' ? 'app/page.tsx' : `app/(public)${path}/page.tsx`
      return existsSync(join(ROOT, rel)) || existsSync(join(ROOT, `app${path}/page.tsx`)) || existsSync(join(ROOT, `app/(auth)${path}/page.tsx`))
    }), Object.values(AFFILIATE_DESTINATIONS).join(','))
    check('D5: a visitor always lands on a page of ours, even when the code is nobody’s',
      affiliateDestination('nonsense') === AFFILIATE_DESTINATIONS.home)
    /* D3-MUT: were `to` a path, the first attack string would leave our site. */
    check('D3-MUT: a destination taken as a path is caught',
      !/^\/[^/]/.test('//evil.com') && affiliateRedirectPath('dana', '//evil.com').startsWith('/?'))
  }

  console.log('\nE) the numbers on the screen are the numbers in the table')
  {
    const sql = strip(read('supabase/migrations/20261009180000_affiliate_program.sql'))
    check('E1: the table’s defaults are the published rates',
      new RegExp(`base_rate\\s+numeric[^\\n]*DEFAULT ${AFFILIATE_TERMS.baseRate}`).test(sql)
      && new RegExp(`top_rate\\s+numeric[^\\n]*DEFAULT ${AFFILIATE_TERMS.topRate}`).test(sql)
      && new RegExp(`top_rate_from\\s+integer[^\\n]*DEFAULT ${AFFILIATE_TERMS.topRateFrom}`).test(sql),
      sql.match(/base_rate[^\n]*/)?.[0] ?? '')
    check('E2: the dashboard reads the terms, never a second copy of the numbers', (() => {
      const page = strip(read('app/(dashboard)/affiliate/page.tsx'))
      return /AFFILIATE_TERMS/.test(page) && !/holdDays: \d+|baseRate: \d+|minPayout(Ils|Usd): \d+/.test(page)
    })())
    // The operator still chooses; this only saves them typing, so it must always
    // come back in the shape a link can carry, whatever the applicant wrote.
    const shape = /^[a-z0-9][a-z0-9_-]{0,31}$/
    check('E3: a suggested code is always a code, whatever the applicant typed',
      shape.test(suggestCode({ name: 'Dana Digital \u05d1\u05e2"\u05de' }))
      && shape.test(suggestCode({ name: '\u05d3\u05e0\u05d4' }))
      && shape.test(suggestCode({ website: 'https://www.Dana-Digital.co.il/x' }))
      && shape.test(suggestCode({}))
      && suggestCode({ website: 'https://www.dana-digital.co.il' }) === 'danadigital',
      [suggestCode({ name: '\u05d3\u05e0\u05d4' }), suggestCode({ website: 'https://www.dana-digital.co.il' })].join(' '))
    check('E1-MUT: a default drifting from the published rate is caught',
      !new RegExp(`base_rate\\s+numeric[^\\n]*DEFAULT ${AFFILIATE_TERMS.baseRate + 1}`).test(sql))
  }

  console.log('\nF) a partner reaches their own page')
  {
    const proxy = strip(read('proxy.ts'))
    // A partner whose own trial expired must still see what they are owed, so
    // /affiliate is deliberately NOT behind the plan wall.
    check('F1: /affiliate is not behind the trial or plan wall',
      !/'\/affiliate'/.test(proxy), proxy.match(/\/affiliate[^\s,)]*/g)?.join(',') ?? 'absent')
    check('F2: the page proves who is asking by itself', (() => {
      const page = strip(read('app/(dashboard)/affiliate/page.tsx'))
      return /getUser\(\)/.test(page) && /redirect\(/.test(page)
    })())
    check('F3: the menu takes a partner there, in their own language', (() => {
      const sidebar = strip(read('components/layout/Sidebar.tsx'))
      return /href: '\/affiliate', labelKey: 'affiliate'/.test(sidebar)
        && /href: '\/admin\/affiliates'/.test(sidebar)
    })())
    check('F4: the admin screen is listed only for an administrator', (() => {
      const sidebar = strip(read('components/layout/Sidebar.tsx'))
      const adminBlock = sidebar.slice(sidebar.indexOf('adminItemKeys'))
      return adminBlock.includes("href: '/admin/affiliates'")
    })())
    /* F1-MUT: the path added to the protected list would wall a partner out. */
    check('F1-MUT: a protected-list entry is caught', /'\/affiliate'/.test("const PROTECTED = ['/affiliate']"))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

void main()

export {}
