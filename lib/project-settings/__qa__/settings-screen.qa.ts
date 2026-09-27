/**
 * The settings screen as it renders (components/settings, the settings page):
 *   - with the seed scan on: "from the scan" chips on the fields the scan
 *     filled, "detect again with AI" on each section it serves, the rescan
 *     band with its wait in words;
 *   - with the flag off: the same sections, editable, with none of those;
 *   - a table unreadable: the page does not mount the sections that need it;
 *   - what the screen may send and show: only its own routes, only codes,
 *     the delete and deactivate flows the projects list already uses.
 *
 * renderToStaticMarkup runs the REAL components with NO effects, the first
 * paint the owner sees. The server actions module and Next's router are
 * stubbed (nothing is called while rendering); everything else is real.
 *
 * Run: npx tsx lib/project-settings/__qa__/settings-screen.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { dashboardEn } from '@/lib/i18n/dashboard/en'
import { dashboardHe } from '@/lib/i18n/dashboard/he'
import type { Locale } from '@/lib/i18n/locales'
import type { AudienceView, ProfileView, RescanView, SettingsData } from '../types'
import { makeChecker, NOW } from './_settings-fixtures'

const { check, finish } = makeChecker()
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
// Next's router and the server-action modules, the only substitutions: rendering calls none of them.
const Mod: any = require('module')
const origLoad = Mod._load
const noop = async () => ({ ok: false, code: 'unavailable' })
Mod._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'next/navigation') {
    return { useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }), usePathname: () => '/settings', useSearchParams: () => new URLSearchParams() }
  }
  if (/settings\/actions$/.test(request)) {
    return { loadProjectSettingsAction: noop, saveProjectSettingsAction: noop, markBusinessFieldsAction: noop, prepareSiteScanAction: noop }
  }
  if (/app\/actions\/projects$/.test(request)) {
    return new Proxy({}, { get: (_t, k) => (k === '__esModule' ? true : noop) })
  }
  return origLoad.call(this, request, parent, isMain)
}
const load = (p: string) => require(join(ROOT, p)) as any
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

const { DashboardLanguageProvider } = load('lib/i18n/dashboard/useDashboardLanguage.tsx')
const ScanBand = load('components/settings/ScanBand.tsx').default as ComponentType<Record<string, unknown>>
const ProfileCard = load('components/settings/ProfileCard.tsx').default as ComponentType<Record<string, unknown>>
const AudienceCard = load('components/settings/AudienceCard.tsx').default as ComponentType<Record<string, unknown>>
const BusinessCard = load('components/settings/BusinessCard.tsx').default as ComponentType<Record<string, unknown>>
const DangerZone = load('components/settings/DangerZone.tsx').default as ComponentType<Record<string, unknown>>
const CompetitorsCard = load('components/settings/CompetitorsCard.tsx').default as ComponentType<Record<string, unknown>>
const { LINKED_SECTIONS } = load('components/settings/anchors.ts') as { LINKED_SECTIONS: readonly string[] }
const GoogleAdsCard = load('components/settings/GoogleAdsCard.tsx').default as ComponentType<Record<string, unknown>>

function render(locale: Locale, C: ComponentType<Record<string, unknown>>, props: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale }, createElement(C, props)))
}
const count = (html: string, attr: string) => html.split(attr).length - 1
/** Whether the rescan button renders disabled; null when there is no rescan button. */
const rescanDisabled = (html: string) => {
  const tag = html.match(/<button\b[^>]*\bdata-rescan\b[^>]*>/)?.[0]
  return tag ? /\sdisabled=""/.test(tag) : null
}
const copy = (l: Locale) => (l === 'he' ? dashboardHe : dashboardEn).projectSettings

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const scanned: ProfileView = {
  description: 'צוות אינסטלטורים מוסמכים בתל אביב.',
  commerce_type: 'service',
  niche: 'אינסטלציה ביתית',
  is_local: true,
  detected_platform: 'WordPress',
  sources: { description: 'scan', commerce_type: 'scan', niche: 'scan', is_local: 'scan', business_name: 'scan', country: 'scan', language: 'scan' },
}
const manual: ProfileView = { ...scanned, sources: { description: 'user', commerce_type: 'user', niche: 'user', is_local: 'user' } }
const audiences: AudienceView[] = ['בעלי דירות', 'ועדי בתים', 'בעלי עסקים', 'משכירי דירות'].map((label, i) => ({ id: `a${i}`, label, source: 'scan' }))
const project = {
  id: PROJECT_ID, user_id: 'u', name: 'My site', target_domain: 'plumber-tlv.co.il', business_name: 'אינסטלציה מהירה', country: 'IL', language: 'he', city: null,
  client_id: null, is_active: true, keywords: [], description: null, created_at: NOW.toISOString(),
}
const rescanDone: RescanView = {
  latest: { status: 'done', stage: 'a', live: false, createdAt: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(), finishedAt: new Date(NOW.getTime() - 2 * 3_600_000 + 60_000).toISOString() },
  availableAt: new Date(NOW.getTime() + 22 * 3_600_000).toISOString(),
}
const settingsData = (profile: ProfileView, seedScan: boolean): SettingsData => ({
  seedScan,
  profile: { state: 'ok', value: profile },
  audiences: { state: 'ok', value: audiences },
  scanCompetitors: [],
  rescan: seedScan ? rescanDone : null,
})
const idleScan = (notice: unknown = null) => ({ phase: 'idle', following: false, busy: false, notice, start: async () => {}, dismiss: () => {} })
const cardProps = (locale: Locale, seedFeatures: boolean) => ({
  projectId: PROJECT_ID, seedFeatures, scanBusy: false, neverScanned: false, onRescan: () => {}, onData: () => {}, t: copy(locale), locale,
})

function main() {
  for (const locale of ['he', 'en'] as const) {
    const t = copy(locale)
    console.log(`\n${locale}) the seed scan on / off`)
    {
      const on = render(locale, ProfileCard, { ...cardProps(locale, true), profile: scanned })
      const off = render(locale, ProfileCard, { ...cardProps(locale, false), profile: scanned })
      const mine = render(locale, ProfileCard, { ...cardProps(locale, true), profile: manual })
      check(`profile card, scan on: a chip on each field the scan filled (${count(on, 'data-source-chip')}), and the AI button`,
        count(on, 'data-source-chip="scan"') === 2 && count(on, 'data-redetect') === 1 && on.includes(t.source.scan))
      check('profile card, the owner\'s own values: no chip', count(mine, 'data-source-chip') === 0 && count(mine, 'data-redetect') === 1)
      check('profile card, flag off: editable, no chip, no AI button', count(off, 'data-source-chip') === 0 && count(off, 'data-redetect') === 0 &&
        off.includes('<textarea') && count(off, 'data-commerce') === 4)
      check(`profile card: the ${locale === 'he' ? 'rtl' : 'ltr'} copy in its own language`, on.includes(t.profile.title) && on.includes(t.profile.commerce.service.label))
    }
    {
      const on = render(locale, AudienceCard, { ...cardProps(locale, true), profile: scanned, audiences })
      const off = render(locale, AudienceCard, { ...cardProps(locale, false), profile: scanned, audiences })
      check('audience card, scan on: a chip on the niche, the local flag and each of the 4 audiences, and the AI button',
        count(on, 'data-source-chip="scan"') === 6 && count(on, 'data-redetect') === 1 && count(on, 'data-audience-row') === 4, String(count(on, 'data-source-chip="scan"')))
      check('audience card, flag off: the same rows, editable, no chip, no AI button',
        count(off, 'data-audience-row') === 4 && count(off, 'data-source-chip') === 0 && count(off, 'data-redetect') === 0 && count(off, 'data-local') === 2)
      check('audience card: room for one more, so "add" is offered', on.includes(t.audience.add))
      const five = [...audiences, { id: 'a5', label: 'חמישי', source: 'user' as const }]
      const full = render(locale, AudienceCard, { ...cardProps(locale, true), profile: scanned, audiences: five })
      check('audience card: at five, no "add", and the owner is told the list is full', !full.includes(`>${t.audience.add}<`) && full.includes(t.audience.full) && count(full, 'data-audience-row') === 5)
    }
    {
      const on = render(locale, BusinessCard, { ...cardProps(locale, true), project, clients: [], data: settingsData(scanned, true), onSaved: () => {} })
      const off = render(locale, BusinessCard, { ...cardProps(locale, false), project, clients: [], data: settingsData(scanned, false), onSaved: () => {} })
      check('business card, scan on: chips on the business name, country and language, and the AI button',
        count(on, 'data-source-chip="scan"') === 3 && count(on, 'data-redetect') === 1, String(count(on, 'data-source-chip')))
      check('business card, flag off: the same form, no chip, no AI button', count(off, 'data-source-chip') === 0 && count(off, 'data-redetect') === 0 && off.includes('value="אינסטלציה מהירה"'))
    }
    console.log(`\n${locale}) the rescan band`)
    {
      const band = render(locale, ScanBand, { rescan: rescanDone, scan: idleScan(), domain: 'plumber-tlv.co.il', now: NOW, t, locale })
      const wait = locale === 'he' ? 'בעוד 22 שעות' : 'in 22 hours'
      check(`scanned 2 hours ago: the button is off and says when it opens ("${wait}")`,
        band.includes('data-scan-band') && rescanDisabled(band) === true && band.includes(wait) && band.includes(t.scan.again))
      const never = render(locale, ScanBand, { rescan: { latest: null, availableAt: null }, scan: idleScan(), domain: 'plumber-tlv.co.il', now: NOW, t, locale })
      check('never scanned: "scan the site" is offered, the domain set left-to-right', never.includes(t.scan.start) && /<bdi dir="ltr"[^>]*>plumber-tlv\.co\.il<\/bdi>/.test(never) &&
        rescanDisabled(never) === false)
      const tooSoon = render(locale, ScanBand, { rescan: { latest: rescanDone.latest, availableAt: null }, scan: idleScan({ kind: 'too_soon', wait: 50_400 }), domain: 'x.co.il', now: NOW, t, locale })
      const inWords = locale === 'he' ? 'בעוד 14 שעות' : 'in 14 hours'
      check(`the route said too soon: one message, "${inWords}", and no action button in it`, tooSoon.includes(inWords) && count(tooSoon, 'role="status"') + count(tooSoon, 'role="alert"') === 1 &&
        count(tooSoon, '<button') === 2, String(count(tooSoon, '<button')))
      const entitlement = render(locale, ScanBand, { rescan: rescanDone, scan: idleScan({ kind: 'entitlement' }), domain: 'x.co.il', now: NOW, t, locale })
      check('not entitled: one message with one action (the plans)', entitlement.includes(t.scan.notices.entitlement) && entitlement.includes(t.scan.actions.plans))
    }
    {
      const html = render(locale, DangerZone, { project, deleteLabels: (locale === 'he' ? dashboardHe : dashboardEn).projects.deleteDialog, t })
      check('the danger zone: deactivate and delete, each behind its confirmation (closed at first)', html.includes(t.danger.deactivate) && html.includes(t.danger.delete) && !html.includes('role="dialog"'))
    }
  }

  console.log('\nthe onboarding summary\'s links: #business, #audiences, #competitors')
  {
    const locale = 'he' as const
    const biz = render(locale, BusinessCard, { ...cardProps(locale, true), project, clients: [], data: settingsData(scanned, true), onSaved: () => {} })
    const aud = render(locale, AudienceCard, { ...cardProps(locale, true), profile: scanned, audiences })
    const comp = render(locale, CompetitorsCard, { projectId: PROJECT_ID, projectDomain: 'x.co.il', scanCompetitors: [], seedFeatures: true, onScanLink: () => {}, t: copy(locale) })
    check('the three sections carry exactly those ids, from the first paint',
      /<section id="business"/.test(biz) && /<section id="audiences"/.test(aud) && /<section id="competitors"/.test(comp))
    check('…and they are the screen\'s linked sections', JSON.stringify(LINKED_SECTIONS) === JSON.stringify(['business', 'audiences', 'competitors']))
    const page = strip(read('app/(dashboard)/settings/page.tsx'))
    const scrolls = (src: string) =>
      /const id = window\.location\.hash\.slice\(1\)/.test(src) &&
      /id !== PROJECT_CONNECTION_ANCHOR && id !== SETTINGS_GSC_ANCHOR && !LINKED_SECTIONS\.includes\(id\)\)\) return/.test(src) &&
      /document\.getElementById\(id\)\?\.scrollIntoView\(/.test(src) && /new ResizeObserver\(jump\)/.test(src)
    check('the page scrolls to them on load, the way it scrolls to #platform and #search-console', scrolls(page))
    check('MUT: a page that scrolls only to the connection anchors fails it',
      !scrolls(page.replace(' && !LINKED_SECTIONS.includes(id)', '')))
  }

  console.log('\nthe page mounts only what it can serve (source)')
  {
    const page = strip(read('app/(dashboard)/settings/page.tsx'))
    const gated = (src: string) =>
      /const rescan = visibility\.seedFeatures \? data\?\.rescan \?\? null : null/.test(src) &&
      /\{rescan && \(\s*<ScanBand/.test(src) &&
      /\{visibility\.profileCard && <ProfileCard/.test(src) &&
      /\{visibility\.audienceCard && <AudienceCard/.test(src) &&
      /const detected = visibility\.seedFeatures \? platformHint\(/.test(src) &&
      /seedFeatures: visibility\.seedFeatures,/.test(src) && /seedFeatures=\{visibility\.seedFeatures\}/.test(src) &&
      /const visibility = settingsVisibility\(data\)/.test(src)
    check('the rescan band, the platform hint, the chips and AI buttons follow settingsVisibility; the profile and audience cards need their tables', gated(page))
    check('MUT: a rescan band shown with the flag off fails it', !gated(page.replace('const rescan = visibility.seedFeatures ? data?.rescan ?? null : null', 'const rescan = data?.rescan ?? null')))
    check('MUT: an audience card mounted with its table unreadable fails it', !gated(page.replace('{visibility.audienceCard && <AudienceCard', '{<AudienceCard')))
    check('MUT: chips always on fails it', !gated(page.replace('seedFeatures: visibility.seedFeatures,', 'seedFeatures: true,')))
  }

  console.log('\nGoogle Ads is never this project\'s connected account')
  {
    // Google Ads is an app-level key for search volumes (lib/google-ads), not a
    // project connection. The owner saw it marked "active" on a project with no
    // Ads account: the card rendered a success badge, unconditionally.
    const CONNECTED_WORDS = /פעיל|מחובר|\b(active|connected)\b/i
    const text = (html: string) => html.replace(/<[^>]*>/g, ' ')
    const claimsNothing = (html: string) => !CONNECTED_WORDS.test(text(html)) && !/\b(bg-ok-soft|text-ok|badge)\b/.test(html)
    const stateless = (src: string) =>
      /export default function GoogleAdsCard\(\{ t \}: \{ t: DashboardDictionary\['projectSettings'\] \}\)/.test(src) &&
      !/<Badge\b|variant="success"|\bstatus\b|connected|isConnected|useEffect|fetch\(/.test(src)
    for (const locale of ['he', 'en'] as const) {
      const t = copy(locale)
      const html = render(locale, GoogleAdsCard, { t })
      check(`${locale}: the Google Ads row says it is not a project connection, and why none is needed`,
        html.includes(t.googleAds.body) && html.includes(t.googleAds.note) && html.includes('id="google-ads"'))
      check(`${locale}: …and claims no connection: no "active", no "connected", no success badge`, claimsNothing(html), html)
      check(`${locale}: its copy has no status to show`, !('status' in t.googleAds) && Object.values(t.googleAds).every((v) => !CONNECTED_WORDS.test(String(v))))
      check(`MUT (${locale}): the old success badge put back into the row fails it`,
        !claimsNothing(html.replace('</p>', `</p><span class="bg-ok-soft text-ok border-ok/20">${locale === 'he' ? 'פעיל' : 'Active'}</span>`)))
    }
    const card = strip(read('components/settings/GoogleAdsCard.tsx'))
    check('the card takes only its copy: no connection state it could show as connected, whatever the project', stateless(card))
    check('MUT: an unconditional badge in the card fails it', !stateless(card.replace('<Card tone="sunk"', '<Badge variant="success">{t.googleAds.title}</Badge><Card tone="sunk"')))
    check('MUT: a card that takes a connection flag fails it', !stateless(card.replace('{ t }: { t: DashboardDictionary', '{ t, connected }: { connected?: boolean; t: DashboardDictionary')))
    const page = strip(read('app/(dashboard)/settings/page.tsx'))
    const mountedPlain = (src: string) => /<GoogleAdsCard t=\{t\} \/>/.test(src) && !/<GoogleAdsCard [^>]*(connected|status)/.test(src)
    check('the settings page mounts it with its copy only', mountedPlain(page))
    check('MUT: a page that passes a status fails it', !mountedPlain(page.replace('<GoogleAdsCard t={t} />', '<GoogleAdsCard t={t} status="connected" />')))
  }

  console.log('\nwhat the screen sends and shows (source)')
  {
    const files = ['AiControls.tsx', 'AudienceCard.tsx', 'BusinessCard.tsx', 'CompetitorsCard.tsx', 'DangerZone.tsx', 'ProfileCard.tsx', 'ScanBand.tsx', 'useRedetect.ts', 'useSiteScan.ts', 'useProjectSettings.ts']
    const all = files.map((f) => strip(read(`components/settings/${f}`))).join('\n')
    const ownRoutes = (src: string) => {
      const targets = [...src.matchAll(/fetch\(\s*(base\(\w+\)|`[^`]*`|[^,)]+)/g)].map((m) => m[1].trim())
      return targets.length >= 5 && targets.every((a) =>
        /^base\(projectId\)$/.test(a) || /^`\$\{base\(projectId\)\}\/\$\{encodeURIComponent\(\w+(\.id)?\)\}`$/.test(a) ||
        /^`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/(seed|redetect)`$/.test(a)) &&
        /const base = \(projectId: string\) => `\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/ai-visibility\/competitors`/.test(src)
    }
    check('the components call only this project\'s own routes (seed, redetect, competitors)', ownRoutes(all))
    check('MUT: a fetch to anywhere else fails it', !ownRoutes(`${all}\nawait fetch(\`https://generativelanguage.googleapis.com/v1\`)`))
    const codesOnly = (src: string) => !/\b(body|json|data|res|result|payload)\??\.(error|message|details|hint)\b/.test(src) && !/\berr(or)?\??\.message\b/.test(src)
    check('no route or database text is ever read for display: only codes', codesOnly(all))
    check('MUT: rendering a route\'s error text fails it', !codesOnly(`${all}\n<p>{body?.error}</p>`))
    const danger = strip(read('components/settings/DangerZone.tsx'))
    const reuses = (src: string) =>
      /import \{ deleteProjectAction, toggleProjectActiveAction \} from '@\/app\/actions\/projects'/.test(src) &&
      /<DeleteConfirmDialog/.test(src) && /toggleProjectActiveAction\(project\.id, true\)/.test(src) &&
      !/\.from\(|fetch\(|createClient|createAdminClient/.test(src)
    check('deactivate and delete reuse the projects list\'s actions and its delete confirmation; no delete logic of their own', reuses(danger))
    check('MUT: a delete of its own fails it', !reuses(`${danger}\nawait createClient().from('projects').delete()`))
    check('MUT: a deactivate that could switch a project ON fails it', !reuses(danger.replace('toggleProjectActiveAction(project.id, true)', 'toggleProjectActiveAction(project.id, project.is_active)')))
    const route = strip(read('app/api/projects/[id]/redetect/route.ts'))
    check('the redetect route is only POST and builds its session from the request cookies', /export async function POST\(/.test(route) && /createClient\(\)/.test(route) && /\.auth\.getUser\(\)/.test(route))
  }

  finish()
}

main()

export {}
