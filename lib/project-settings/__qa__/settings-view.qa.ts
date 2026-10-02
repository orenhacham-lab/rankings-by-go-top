/**
 * The settings screen's pure view rules (lib/project-settings/view.ts) and its
 * copy (projectSettings in lib/i18n/dashboard/{he,en}.ts):
 *   - which sections show, from the data: the flag off, a table unreadable;
 *   - every answer of the seed route and of the redetect route is ONE notice
 *     with at most one action and a message in both languages, and waits read
 *     as "in 14 hours", never understated;
 *   - the small parsers (competitor domain, platform hint, Retry-After);
 *   - the copy: the same keys and placeholders in Hebrew and English, no
 *     Hebrew in the English, no em-dashes.
 *
 * Run: npx tsx lib/project-settings/__qa__/settings-view.qa.ts
 */
import { dashboardEn } from '@/lib/i18n/dashboard/en'
import { dashboardHe } from '@/lib/i18n/dashboard/he'
import { SEED_API_ERROR_CODES } from '@/lib/seed-scan/types'
import { REDETECT_ERROR_CODES, type SettingsData } from '../types'
import {
  businessSuggestionItems,
  competitorDomainInput,
  formatAgo,
  formatWait,
  newAudienceSuggestions,
  platformHint,
  redetectNotice,
  redetectNoticeAction,
  rescanNotice,
  rescanNoticeAction,
  retryAfterFrom,
  secondsUntil,
  settingsVisibility,
  withCurrentOption,
  type RedetectNotice,
  type RescanNotice,
} from '../view'
import { makeChecker, NOW } from './_settings-fixtures'

const { check, finish } = makeChecker()
type Tree = { [k: string]: string | Tree }

const HEBREW = /[֐-׿]/
const EM_DASH = /—/

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)))
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

/** Same keys, same placeholders per key. Returns the keys that differ. */
function parity(he: Tree, en: Tree): string[] {
  const h = new Map(leaves(he))
  const e = new Map(leaves(en))
  const out: string[] = []
  for (const k of new Set([...h.keys(), ...e.keys()])) {
    if (!h.has(k) || !e.has(k)) out.push(`${k} (missing)`)
    else if (placeholders(h.get(k)!) !== placeholders(e.get(k)!)) out.push(`${k} (placeholders)`)
  }
  return out
}
const hebrewIn = (en: Tree) => leaves(en).filter(([, v]) => HEBREW.test(v)).map(([k]) => k)
const emDashIn = (...trees: Tree[]) => trees.flatMap((t) => leaves(t).filter(([, v]) => EM_DASH.test(v)).map(([k]) => k))

const data = (over: Partial<SettingsData> = {}): SettingsData => ({
  seedScan: true,
  profile: { state: 'ok', value: null },
  audiences: { state: 'ok', value: [] },
  scanCompetitors: [],
  rescan: { latest: null, availableAt: null },
  ...over,
})

function main() {
  const he = dashboardHe.projectSettings as unknown as Tree
  const en = dashboardEn.projectSettings as unknown as Tree

  console.log('\n1) which sections show')
  {
    const all = settingsVisibility(data())
    check('everything readable and the scan on: every section and every scan feature', all.profileCard && all.audienceCard && all.seedFeatures)
    const off = settingsVisibility(data({ seedScan: false, rescan: null }))
    check('the flag off: the profile and audience sections stay, no chips / AI / rescan', off.profileCard && off.audienceCard && !off.seedFeatures)
    const offButRead = settingsVisibility(data({ seedScan: false }))
    check('the flag off, even with scan state read: no scan features', offButRead.profileCard && !offButRead.seedFeatures)
    const noProfile = settingsVisibility(data({ profile: { state: 'unavailable' } }))
    check('project_profiles unreadable: both sections that store in it hide, and the scan features', !noProfile.profileCard && !noProfile.audienceCard && !noProfile.seedFeatures)
    const noAudiences = settingsVisibility(data({ audiences: { state: 'unavailable' } }))
    check('project_audiences unreadable: the profile section stays, the audience section and the scan features hide',
      noAudiences.profileCard && !noAudiences.audienceCard && !noAudiences.seedFeatures)
    const noRuns = settingsVisibility(data({ rescan: null }))
    check('the runs unreadable: the sections stay, the scan features hide', noRuns.profileCard && noRuns.audienceCard && !noRuns.seedFeatures)
    const none = settingsVisibility(null)
    check('no data at all (the load failed): only what needs nothing', !none.profileCard && !none.audienceCard && !none.seedFeatures)
  }

  console.log('\n2) waits, never understated')
  {
    const cases: [number, string, string][] = [
      [50_400, 'בעוד 14 שעות', 'in 14 hours'],
      [50_401, 'בעוד 15 שעות', 'in 15 hours'],
      [3_600, 'בעוד שעה', 'in 1 hour'],
      [3_601, 'בעוד שעתיים', 'in 2 hours'],
      [7_200, 'בעוד שעתיים', 'in 2 hours'],
      [90, 'בעוד שתי דקות', 'in 2 minutes'],
      [30, 'בעוד דקה', 'in 1 minute'],
      [Number.NaN, 'בעוד דקה', 'in 1 minute'],
    ]
    const bad = cases.filter(([s, h, e]) => formatWait(s, 'he') !== h || formatWait(s, 'en') !== e)
    check('formatWait rounds up, in words people write', bad.length === 0, JSON.stringify(bad.map(([s]) => [s, formatWait(s, 'he'), formatWait(s, 'en')])))
    const ago = (ms: number, l: 'he' | 'en') => formatAgo(new Date(NOW.getTime() - ms).toISOString(), NOW, l)
    check('formatAgo', ago(10_000, 'he') === 'לפני רגע' && ago(2 * 3_600_000, 'he') === 'לפני שעתיים' && ago(26 * 3_600_000, 'en') === 'yesterday' && ago(5 * 60_000, 'en') === '5 minutes ago')
    check('secondsUntil: the future in whole seconds, the past as null',
      secondsUntil(new Date(NOW.getTime() + 1_500).toISOString(), NOW) === 2 && secondsUntil(new Date(NOW.getTime() - 1).toISOString(), NOW) === null && secondsUntil(null, NOW) === null)
    check('Retry-After: the header first, then the body, junk as null',
      retryAfterFrom('120', { retryAfterSeconds: 5 }) === 120 && retryAfterFrom(null, { retryAfterSeconds: 5.2 }) === 6 &&
      retryAfterFrom('soon', { retryAfterSeconds: 'x' }) === null && retryAfterFrom('-3', null) === null)
  }

  console.log('\n3) every route answer: one notice, at most one action, copy in both languages')
  {
    const t = { he: dashboardHe.projectSettings, en: dashboardEn.projectSettings }
    const kinds: RescanNotice[] = [
      rescanNotice(202, null, null),
      ...SEED_API_ERROR_CODES.map((c) => rescanNotice(429, c, 50_400)),
      rescanNotice(500, 'whatever', null),
      rescanNotice(0, undefined, null),
      { kind: 'finished' },
      { kind: 'slow' },
    ]
    const missing = kinds.filter((n) => !t.he.scan.notices[n.kind] || !t.en.scan.notices[n.kind]).map((n) => n.kind)
    check('every seed-route answer (each code of SEED_API_ERROR_CODES, 5xx, network) has a message in he and en', missing.length === 0, missing.join())
    check('rescan_too_soon carries the Retry-After wait; a missing one reads as an hour',
      JSON.stringify(rescanNotice(429, 'rescan_too_soon', 50_400)) === JSON.stringify({ kind: 'too_soon', wait: 50_400 }) &&
      JSON.stringify(rescanNotice(429, 'rescan_too_soon', null)) === JSON.stringify({ kind: 'too_soon', wait: 3_600 }))
    check('the route\'s own codes each have their own message: in progress, too soon, both caps, entitlement',
      rescanNotice(409, 'run_in_progress', null).kind === 'in_progress' && rescanNotice(429, 'user_daily_cap', 1).kind === 'user_cap' &&
      rescanNotice(429, 'global_daily_cap', 1).kind === 'global_cap' && rescanNotice(403, 'entitlement_required', null).kind === 'entitlement' &&
      rescanNotice(503, 'entitlement_unavailable', null).kind === 'entitlement_unavailable')
    check('an unknown code, a 5xx and no answer all read as "could not start"', rescanNotice(500, 'x', null).kind === 'failed' && rescanNotice(0, undefined, null).kind === 'failed')
    const waits = (['too_soon', 'user_cap', 'global_cap'] as const).every((k) => t.he.scan.notices[k].includes('{wait}') && t.en.scan.notices[k].includes('{wait}'))
    check('the waiting messages say when ({wait}) in both languages', waits)
    check('actions: plans for entitlement, retry for a failure, refresh when signed out, none otherwise',
      rescanNoticeAction({ kind: 'entitlement' }) === 'plans' && rescanNoticeAction({ kind: 'failed' }) === 'retry' &&
      rescanNoticeAction({ kind: 'signed_out' }) === 'refresh' && rescanNoticeAction({ kind: 'too_soon', wait: 1 }) === null)

    const rd: RedetectNotice[] = [...REDETECT_ERROR_CODES.map((c) => redetectNotice(c, 50_400)), redetectNotice(null, null)]
    const rdMissing = rd.filter((n) => !t.he.ai.notices[n.kind] || !t.en.ai.notices[n.kind]).map((n) => n.kind)
    check('every redetect-route code has a message in he and en', rdMissing.length === 0, rdMissing.join())
    check('the daily cap says when, from Retry-After', JSON.stringify(redetectNotice('redetect_daily_cap', 50_400)) === JSON.stringify({ kind: 'daily_cap', wait: 50_400 }) &&
      t.he.ai.notices.daily_cap.includes('{wait}') && t.en.ai.notices.daily_cap.includes('{wait}'))
    check('scan_required explains a scan is needed and offers to start one; nothing else starts a scan',
      redetectNoticeAction({ kind: 'scan_required' }) === 'rescan' && rd.filter((n) => redetectNoticeAction(n) === 'rescan').every((n) => n.kind === 'scan_required'))
  }

  console.log('\n4) small parsers')
  {
    const domains: [string, string | null][] = [
      ['https://www.Rival-Plumber.co.il/services?x=1', 'rival-plumber.co.il'],
      ['pipes-pro.co.il.', 'pipes-pro.co.il'],
      ['localhost', null],
      ['-bad.com', null],
      ['javascript:alert(1)', null],
      ['a b.com', null],
    ]
    const wrong = domains.filter(([raw, want]) => competitorDomainInput(raw) !== want)
    check('competitor domains: a URL or a host becomes a bare domain; anything else is refused', wrong.length === 0, JSON.stringify(wrong))
    check('platform hint: WordPress and WooCommerce offer WordPress, Shopify offers Shopify, Wix offers Wix, others only name it, nothing is nothing',
      platformHint('WordPress')?.connect === 'wordpress' && platformHint('woocommerce')?.connect === 'wordpress' && platformHint(' Shopify ')?.connect === 'shopify' &&
      platformHint('Wix')?.connect === 'wix' && platformHint('Wix')?.name === 'Wix' && platformHint('Squarespace')?.connect === null && platformHint('  ') === null && platformHint(null) === null)
    const opts = [{ value: 'US', label: 'US' }]
    check('a stored market the form does not list is kept as an option, not silently replaced',
      withCurrentOption(opts, 'IL', (c) => `name ${c}`).at(-1)?.label === 'name IL' && withCurrentOption(opts, 'US', String).length === 1 && withCurrentOption(opts, null, String).length === 1)
    check('business suggestions list only what differs',
      JSON.stringify(businessSuggestionItems({ business_name: 'Go Top', country: 'il', language: 'he' }, { business_name: ' go  top ', country: 'IL', language: 'en' }).map((i) => i.key)) === '["language"]')
    check('new audience suggestions skip what the list has and repeats',
      JSON.stringify(newAudienceSuggestions([{ label: 'Home owners' }], ['home  owners', 'Landlords', 'landlords', ' '])) === '["Landlords"]')
  }

  console.log('\n5) the copy')
  {
    check('Hebrew and English projectSettings have the same keys and the same placeholders', parity(he, en).length === 0, parity(he, en).join())
    const enCopy = structuredClone(en) as Tree
    delete (enCopy.scan as Tree).title
    check('MUT: a key missing in English fails it', parity(he, enCopy).length === 1)
    const enBadPh = structuredClone(en) as Tree
    ;((enBadPh.scan as Tree).notices as Tree).too_soon = 'Try again later'
    check('MUT: a placeholder dropped in English fails it', parity(he, enBadPh).some((k) => k.includes('too_soon')))
    check('no Hebrew in the English copy', hebrewIn(en).length === 0, hebrewIn(en).join())
    check('MUT: a Hebrew string in the English copy fails it', hebrewIn({ ...en, x: 'סרוק' }).length === 1)
    const heHebrew = leaves(he).filter(([, v]) => HEBREW.test(v)).length / leaves(he).length
    check('the Hebrew copy is Hebrew (brand names and units aside)', heHebrew > 0.9, heHebrew.toFixed(2))
    check('no em-dashes in the settings copy', emDashIn(he, en).length === 0, emDashIn(he, en).join())
    check('MUT: an em-dash fails it', emDashIn({ ...he, x: 'a — b' }).length === 1)
  }

  finish()
}

main()

export {}
