/**
 * Wave 10 (owner asks, 2026-09-30), the UI items:
 *   A) Keywords tab, Search Console list: sort by impressions / clicks / average position,
 *      an accessible radiogroup, Hebrew and English words
 *   B) Content strategy ideas: "approve" is the site's primary (dark blue) button
 *   C) Notifications: a missing site connection and a missing Search Console connection are
 *      always rows (site first), each with its own settings link; old answers make none
 *   D) Public site: the privacy notice never hides WhatsApp; the About close's second button is
 *      visible on its light ground; the features menu wraps; the open menu hides the floating
 *      widgets; the credit's anchor is "GO TOP" only
 * Every guard also runs against a deliberately broken copy (MUT).
 * Run: npx tsx lib/__qa__/w10-ui.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { dashboardHe } from '@/lib/i18n/dashboard/he'
import { dashboardEn } from '@/lib/i18n/dashboard/en'
import { handleWaitingGet, type WaitingAnswer } from '@/lib/nudges/waiting'
import { allWaitingRows, waitingRows, bellCount } from '@/lib/nudges/rows'
import { platformSetupHref, settingsGscHref } from '@/lib/content/content-hub-setup'
import { sortUntrackedRows } from '@/components/gsc/GscUntrackedQueries'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'

let pass = 0, fail = 0
const check = (name: string, cond: boolean, detail?: unknown) => { if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) } }
const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const code = (p: string) => strip(read(p))
const HEBREW = /[֐-׿]/

const Q = (query: string, impressions: number, clicks: number, position: number | null) => ({ query, impressions, clicks, position })

async function main() {
  console.log('\nA) sorting the Search Console list')
  const rows = [Q('a', 1000, 5, 9.4), Q('b', 500, 40, 3.2), Q('c', 2000, 12, null), Q('d', 500, 40, 1.1)]
  const order = (fn: typeof sortUntrackedRows, s: 'impressions' | 'clicks' | 'position') => fn(rows as never, s).map((r) => r.query).join('')
  const rulesA = (fn: typeof sortUntrackedRows) => ({
    'A1: impressions: most first (the old order)': order(fn, 'impressions') === 'cabd',
    'A2: clicks: most first, a tie by impressions then the query': order(fn, 'clicks') === 'bdca',
    'A3: position: best (smallest) first, no position last': order(fn, 'position') === 'dbac',
    'A4: the input is not mutated': (() => { const copy = JSON.stringify(rows); fn(rows as never, 'clicks'); return JSON.stringify(rows) === copy })(),
  })
  for (const [k, v] of Object.entries(rulesA(sortUntrackedRows))) check(k, v)
  check('A-MUT: a sort that ignores the chosen order is caught',
    await withMutant<{ sortUntrackedRows: typeof sortUntrackedRows }, boolean>('components/gsc/GscUntrackedQueries.tsx',
      [["if (sort === 'clicks') return b.clicks - a.clicks || tie(a, b)", '']], (m) => Object.values(rulesA(m.sortUntrackedRows)).some((x) => !x)))
  check('A-MUT: position with no-position rows first is caught',
    await withMutant<{ sortUntrackedRows: typeof sortUntrackedRows }, boolean>('components/gsc/GscUntrackedQueries.tsx',
      [['a.position == null ? Infinity : a.position', 'a.position == null ? -1 : a.position']], (m) => Object.values(rulesA(m.sortUntrackedRows)).some((x) => !x)))
  const view = code('components/gsc/GscUntrackedQueries.tsx')
  const viewOk = (src: string) => /<Segmented[\s\S]*?ariaLabel=\{t\.sortLabel\}/.test(src) && /role="status" aria-live="polite"/.test(src) && /sortUntrackedRows\(\[/.test(src)
  check('A5: the list has the accessible sort control (a radiogroup with a label) and announces the order politely', viewOk(view))
  check('A-MUT: a list without the announcement is caught', !viewOk(view.replace('aria-live="polite"', '')))
  for (const [lang, d] of [['he', dashboardHe], ['en', dashboardEn]] as const) {
    const u = d.gscWidgets.untracked
    const words = [u.sortLabel, u.sortImpressions, u.sortClicks, u.sortPosition, u.sortedBy(u.sortClicks)]
    check(`A6 (${lang}): the sort words exist${lang === 'he' ? ' and are Hebrew' : ' and are English'}`,
      words.every((w) => w.length > 0) && words.every((w) => lang === 'he' ? HEBREW.test(w) : !HEBREW.test(w)))
  }

  console.log('\nB) the approve button')
  const board = code('components/content-strategy/StrategyBoard.tsx')
  const approveOk = (src: string) => /<Button size="sm" variant="primary" onClick=\{\(\) => void act\.actions\.approve\(target\)\}/.test(src)
  check('B1: approving an idea on the board and the list is the primary (dark blue) button', approveOk(board))
  check('B-MUT: the white bordered button back is caught', !approveOk(board.replace('size="sm" variant="primary" onClick={() => void act.actions.approve', 'size="sm" variant="secondary" onClick={() => void act.actions.approve')))

  console.log('\nC) notifications: a missing site and a missing Search Console connection')
  const P = 'aaaaaaaa-0000-4000-8000-000000000001'
  const base: WaitingAnswer = { ok: true, connectionDown: null, articles: 0, topics: 0, queued: 0, queueEndsAt: null, pluginConnected: false }
  const kinds = (fn: typeof allWaitingRows, w: Partial<WaitingAnswer>) => fn(P, { ...base, ...w }, 0).map((r) => r.kind).join(',')
  const rulesC = (fn: typeof allWaitingRows, cap: typeof waitingRows) => ({
    'C1: no site and no Search Console: two rows, the site first': kinds(fn, { siteConnected: false, gscConnected: false }) === 'site,gsc',
    'C2: the site connected: the Search Console row stays until it is connected': kinds(fn, { siteConnected: true, gscConnected: false }) === 'gsc',
    'C3: both connected: no setup row': kinds(fn, { siteConnected: true, gscConnected: true }) === '',
    'C4: unknown (null) or an answer from before wave 10 makes no row, never a guess': kinds(fn, { siteConnected: null, gscConnected: null }) === '' && kinds(fn, {}) === '',
    'C5: the site row goes to the project connection settings, Search Console to its own section': (() => { const r = fn(P, { ...base, siteConnected: false, gscConnected: false }, 0); return r[0].href === platformSetupHref(P) && r[1].href === settingsGscHref(P) && r[0].href !== r[1].href })(),
    'C6: the existing rows keep their order after the setup rows': kinds(fn, { siteConnected: false, gscConnected: false, articles: 2, topics: 3 }) === 'site,gsc,articles,topics',
    'C7: the dashboard card always shows the setup rows, its cap of three is for the rest': cap(P, { ...base, siteConnected: false, gscConnected: false, articles: 1, topics: 1, pluginConnected: true }, 2).map((r) => r.kind).join(',') === 'site,gsc,articles,topics,fixes',
    'C8: each setup row counts one on the bell': bellCount(fn(P, { ...base, siteConnected: false, gscConnected: false }, 0)) === 2,
  })
  for (const [k, v] of Object.entries(rulesC(allWaitingRows, waitingRows))) check(k, v)
  check('C-MUT: rows that make a row for an unknown answer, or hide the site row, are caught',
    await withMutant<{ allWaitingRows: typeof allWaitingRows; waitingRows: typeof waitingRows }, boolean>('lib/nudges/rows.ts',
      [['w.siteConnected === false', 'w.siteConnected !== true'], ["if (w.gscConnected === false)", 'if (false)']], (m) => { try { return Object.values(rulesC(m.allWaitingRows, m.waitingRows)).some((x) => !x) } catch { return true } }))
  check('C-MUT: a card that caps the setup rows too is caught',
    await withMutant<{ allWaitingRows: typeof allWaitingRows; waitingRows: typeof waitingRows }, boolean>('lib/nudges/rows.ts',
      [['return [...setup, ...rows.filter((r) => !SETUP_ROWS.has(r.kind)).slice(0, MAX_WAITING_ROWS)]', 'return rows.slice(0, MAX_WAITING_ROWS)']], (m) => { try { return Object.values(rulesC(m.allWaitingRows, m.waitingRows)).some((x) => !x) } catch { return true } }))

  // The route: what it reads, and only for the owner.
  const OWNER = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222'
  const ask = async (tables: Record<string, Record<string, unknown>[]>, env: Record<string, string | undefined> = { ENABLE_CONTENT: 'true', GSC_READ_ONLY_ENABLED: 'true' }) => {
    const fake = new FakeAdmin({ projects: [{ id: P, user_id: OWNER }], ...tables }) as unknown as SupabaseClient & ServiceRoleClient
    const res = await handleWaitingGet(P, { session: async () => ({ userId: OWNER, db: fake }), admin: () => fake, env })
    return await res.json() as WaitingAnswer
  }
  const none = await ask({})
  check('C9: a project with no connection at all: no site, no Search Console', none.siteConnected === false && none.gscConnected === false, none)
  const foreign = await ask({ wordpress_connections: [{ project_id: P, user_id: OTHER, connection_status: 'connected' }], gsc_connections: [{ id: 'c', user_id: OTHER, status: 'connected' }], project_gsc_properties: [{ project_id: P, connection_id: 'c' }] })
  check('C10: another owner\'s connection rows never count', foreign.siteConnected === false && foreign.gscConnected === false, foreign)
  const mine = await ask({ wordpress_connections: [{ project_id: P, user_id: OWNER, connection_status: 'untested' }], gsc_connections: [{ id: 'c', user_id: OWNER, status: 'connected' }], project_gsc_properties: [{ project_id: P, connection_id: 'c' }] })
  check('C11: a site row (even untested) and a live Google connection with a property: both connected', mine.siteConnected === true && mine.gscConnected === true, mine)
  const noProp = await ask({ gsc_connections: [{ id: 'c', user_id: OWNER, status: 'connected' }] })
  const reauth = await ask({ gsc_connections: [{ id: 'c', user_id: OWNER, status: 'reauth_required' }], project_gsc_properties: [{ project_id: P, connection_id: 'c' }] })
  check('C12: a connection without a property for this project, or needing approval again, is not connected', noProp.gscConnected === false && reauth.gscConnected === false)
  const off = await ask({}, { ENABLE_CONTENT: 'true' })
  check('C13: Search Console switched off on the server: no claim (null), so no row', off.gscConnected === null)
  const wsrc = code('lib/nudges/waiting.ts')
  check('C14: the Search Console read is by project AND owner', /from\('project_gsc_properties'\)[^\n]*eq\('project_id', projectId\)/.test(wsrc) && /from\('gsc_connections'\)[^\n]*eq\('user_id', userId\)/.test(wsrc))
  for (const [lang, d] of [['he', dashboardHe], ['en', dashboardEn]] as const) {
    const t = d.waitingCard
    const words = [t.site, t.siteAction, t.gsc, t.gscAction]
    check(`C15 (${lang}): the site row says it is needed for the first article; the words are in ${lang}`,
      words.every((w) => w.length > 0) && words.every((w) => lang === 'he' ? HEBREW.test(w) : !HEBREW.test(w)) && (lang === 'he' ? /המאמר הראשון/.test(t.site) : /first article/.test(t.site)))
  }

  console.log('\nD) the public site')
  const cookie = code('components/CookieConsent.tsx'), wa = code('components/public/WhatsAppFloat.tsx'), widgets = code('components/public/PublicSiteWidgets.tsx')
  const waOk = (c: string, w: string, ws: string) => !/hidden\?: boolean|if \(hidden\) return null/.test(w) && /<WhatsAppFloat \/>/.test(ws) && /fixed bottom-6 left-24 z-\[58\] hidden w-\[340px\]/.test(c)
  check('D1: WhatsApp is never hidden, and the desktop privacy card sits beside its slot (left-24, past the 6rem corner)', waOk(cookie, wa, widgets))
  check('D-MUT: WhatsApp stepping aside for the notice again is caught', !waOk(cookie, wa.replace('export function WhatsAppFloat() {', 'export function WhatsAppFloat({ hidden = false }: { hidden?: boolean } = {}) { if (hidden) return null'), widgets))
  check('D-MUT: the card back over the corner (left-6) is caught', !waOk(cookie.replace('fixed bottom-6 left-24', 'fixed bottom-6 left-6'), wa, widgets))
  const about = code('components/public/AboutPage.tsx')
  const closeSection = (s: string) => s.slice(s.indexOf('data-final-cta'), s.indexOf('data-about-contact'))
  const aboutOk = (s: string) => /href=\{c\.trial\.href\} variant="secondary"/.test(closeSection(s)) && !/variant="inverse"/.test(closeSection(s))
  check('D2: the About close (light ground): the second button is the bordered one, never white on paper', aboutOk(about))
  check('D-MUT: the white-ink "inverse" button back on the light ground is caught', !aboutOk(about.replace(/(data-final-cta[\s\S]*?href=\{c\.trial\.href\} )variant="secondary"/, '$1variant="inverse"')))
  const nav = code('components/PublicNav.tsx')
  const navOk = (s: string) => /data-features-panel className="[^"]*whitespace-normal/.test(s) && /setAttribute\('data-public-menu', 'open'\)/.test(s)
  check('D3: the features menu wraps its text (the nav is nowrap) and an open menu flags the page', navOk(nav))
  check('D-MUT: a panel that inherits nowrap again is caught', !navOk(nav.replace('whitespace-normal ', '')))
  const css = read('app/globals.css')
  const floats = ['components/public/MobileContactBar.tsx', 'components/public/AccessibilityWidget.tsx', 'components/public/WhatsAppFloat.tsx', 'components/CookieConsent.tsx']
  const floatOk = (c: string, srcs: string[]) => /html\[data-public-menu='open'\] \[data-public-float\] \{ display: none !important; \}/.test(c) && srcs.every((s) => s.includes('data-public-float'))
  check('D4: with the menu open, the contact bar, WhatsApp, accessibility button and privacy card step aside (no cover over "start free")', floatOk(css, floats.map(read)))
  check('D-MUT: a contact bar that is not marked is caught', !floatOk(css, floats.map(read).map((s, i) => i === 0 ? s.replace('data-public-float', 'data-x') : s)))
  const footer = code('components/Footer.tsx')
  const creditOk = (s: string) => /const \[creditBefore, creditAfter = ''\] = dict\.footer\.credit\.split\(CREDIT_ANCHOR\)/.test(s) && /CREDIT_ANCHOR = 'GO TOP'/.test(s) && /\{creditBefore\}\s*<a\s+href="https:\/\/gotop\.co\.il"/.test(s) && /\{CREDIT_ANCHOR\}\s*<\/a>/.test(s)
  check('D5: the footer credit links only the words "GO TOP" (he and en), the rest is plain text', creditOk(footer))
  check('D-MUT: the whole line as the anchor is caught', !creditOk(footer.replace('{CREDIT_ANCHOR}', '{dict.footer.credit}')))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
