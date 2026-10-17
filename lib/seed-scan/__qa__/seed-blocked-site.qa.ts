/**
 * A site whose host refuses our reader: the seeding scan's search-index mode.
 *
 * The failure it reproduces (deby-electric.co.il on the preview): every path
 * of the host answers HTTP 403 from nginx to a data-centre address ("403
 * Forbidden / You are not authorized… Your IP address is"), whatever the user
 * agent, while the site opens fine in the owner's browser. The engine returns
 * `{ ok: false, reason: 'http_error', status: 403 }` and a1 used to map that to
 * `site_unreachable`: onboarding said "we couldn't reach the site, make sure
 * it opens in a browser".
 *
 * Now a refusal (401/403/406/429/503), or a host that resolved but never
 * answered, sends a1 to Google's index of the site instead: a `site:` search
 * (and the bare domain when that shows too little, two searches at most), the
 * indexed titles and snippets handed to the one model call, a3 and b1 reporting
 * what needs the site itself as unavailable for the firewall's reason. Only
 * when Google shows nothing either does a1 fail, with `site_forbidden` for a
 * refusal and `site_unreachable` for a host that never answered; a name that
 * does not resolve is still `site_unreachable`, and a readable site is read as
 * before.
 *
 * This suite imports nothing the fix added (only the runner, the engine, the
 * onboarding view and fakes), so it runs unchanged against the commit before
 * the fix and shows the old answer there: a1 failed(site_unreachable).
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-blocked-site.qa.ts
 */
import { fetchSiteHtml, fetchSiteText, type SiteSignals } from '@/lib/free-check'
import { dashboardEn } from '@/lib/i18n/dashboard/en'
import { dashboardHe } from '@/lib/i18n/dashboard/he'
import { stageFailureNotice } from '@/lib/onboarding/notices'
import { findingsView, geoView, tilesView } from '@/lib/onboarding/summary-view'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { resumeSeedRun, runStageA } from '../runner'
import type { SeedProject } from '../settings'
import type { SearchFn, SearchOutcome } from '../serper'
import { STAGE_B_EXECUTORS, stageBDeps } from '../steps-b'
import type { StageADepsInput, StepResult } from '../steps'
import { createSeedRun } from '../store'
import { initialSummary, readSummary } from '../summary'
import type { SeedRunView, SeedScope, SeedStepStatus, SeedSummary } from '../types'
import {
  captureConsole,
  dnsOverrides,
  FakeNetwork,
  fakeModel,
  HE_WP,
  HE_WP_INSIGHT,
  HE_WP_RESULTS,
  heWordPressSite,
  installFakeDns,
  makeChecker,
  NOW,
  PROJECT,
  projectRow,
  SECRET,
  USER,
  world,
  type Tables,
} from './_fixtures'
import type { BusinessInsight, InsightResult } from '@/lib/free-check'

const { check, finish } = makeChecker()
const SCOPE: SeedScope = { projectId: PROJECT, userId: USER }

type Row = Record<string, unknown>
const runRow = (t: Tables) => t.project_seed_runs[0] as Row
const stepRow = (t: Tables, step: string) => t.project_seed_steps.find((s) => s.step === step) as Row
const detailOf = (t: Tables, step: string) => (stepRow(t, step)?.detail ?? {}) as Row
const summaryOf = (t: Tables) => readSummary(runRow(t).summary) as SeedSummary
const statusLine = (t: Tables) =>
  ['a1', 'a2', 'a3', 'a4'].map((s) => `${s}:${stepRow(t, s)?.status}${stepRow(t, s)?.error_code ? `(${stepRow(t, s).error_code})` : ''}`).join(' ')

// ── The blocked site ────────────────────────────────────────────────────────

const SITE = { target: 'https://www.deby-electric.co.il/', key: 'deby-electric.co.il', home: 'https://www.deby-electric.co.il/' }
const PATHS = ['/', '/robots.txt', '/sitemap.xml', '/llms.txt', '/wp-json/']

/** nginx's refusal, as the sandbox in iad1 saw it on every path (with a marker that must go nowhere). */
const REFUSAL_BODY = `<html><head><title>403 Forbidden</title></head><body><h1>403 Forbidden</h1><p>You are not authorized to view this page. ${SECRET} Your IP address is 3.216.1.1</p><hr><center>nginx</center></body></html>`

/** Every URL answers `status` (the firewall), and every request is recorded. */
function refusingHost(status = 403) {
  const requests: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    requests.push(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    return new Response(REFUSAL_BODY, { status, headers: { 'content-type': 'text/html', server: 'nginx', 'x-cached-engine-header': 'SeoEdge' } })
  }
  return { fetchImpl, requests }
}

/** A host that resolves but drops every connection. */
function droppingHost() {
  const requests: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    requests.push(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    throw Object.assign(new TypeError(`fetch failed ${SECRET}`), { cause: { code: 'ECONNRESET' } })
  }
  return { fetchImpl, requests }
}

const OFFSITE_URL = 'https://www.easy.co.il/deby-electric-listing'

/** What Google's index shows of the site: three of its pages, and one listing on another site. */
const INDEXED: SearchOutcome = {
  ok: true,
  domains: ['deby-electric.co.il', 'easy.co.il'],
  pages: [
    { url: 'https://www.deby-electric.co.il/', title: 'דבי חשמל | חשמלאי מוסמך בשרון', snippet: 'חשמלאי מוסמך בהוד השרון ורעננה: תיקוני חשמל, התקנת גופי תאורה ובדיקות תקינות. זמינים גם בערבים.' },
    { url: 'https://www.deby-electric.co.il/services/', title: 'שירותי חשמל לבית ולעסק | דבי חשמל', snippet: 'הגדלת חיבור חשמל, החלפת לוח חשמל והתקנת עמדות טעינה לרכב חשמלי.' },
    { url: OFFSITE_URL, title: 'דבי חשמל - חשמלאים | איזי', snippet: `${SECRET} ביקורות ודירוגים` },
    { url: 'https://www.deby-electric.co.il/contact/', title: 'צור קשר | דבי חשמל', snippet: 'התקשרו לתיאום ביקור של חשמלאי.' },
  ],
}

const DEBY_INSIGHT: BusinessInsight = {
  business: {
    summary: 'חשמלאי מוסמך בשרון: תיקוני חשמל, התקנת תאורה, החלפת לוחות והתקנת עמדות טעינה.',
    audiences: ['בעלי בתים בשרון', 'עסקים קטנים', 'בעלי רכב חשמלי'],
    niche: 'חשמלאי ביתי',
    platform: null,
    companyName: 'דבי חשמל',
    commerceType: 'service',
    isLocal: true,
    country: 'IL',
    language: null,
    address: null,
    phone: null,
  },
  keywords: ['חשמלאי בהוד השרון', 'חשמלאי ברעננה', 'החלפת לוח חשמל', 'התקנת עמדת טעינה', 'חשמלאי מוסמך'],
  articles: ['מתי צריך להחליף לוח חשמל', 'כמה עולה עמדת טעינה', 'בדיקת תקינות חשמל', 'קצר חשמלי בבית', 'הגדלת חיבור חשמל'],
  competitors: ['sharon-electric.co.il', 'never-seen.co.il'],
}

const DEBY_RESULTS: Record<string, string[]> = {
  'חשמלאי בהוד השרון': ['sharon-electric.co.il', 'easy.co.il', 'facebook.com', 'deby-electric.co.il'],
  'חשמלאי ברעננה': ['easy.co.il', 'sharon-electric.co.il', 'zap.co.il'],
  'החלפת לוח חשמל': ['zap.co.il', 'easy.co.il'],
}

/** A search that answers the index queries and a4's keywords, and counts every call. */
function search(index: Record<string, SearchOutcome> = { [`site:${SITE.key}`]: INDEXED }, results: Record<string, string[]> = DEBY_RESULTS) {
  const calls: string[] = []
  const fn: SearchFn = async (query) => {
    calls.push(query)
    if (index[query]) return index[query]
    if (results[query]) return { ok: true, domains: results[query] }
    return { ok: true, domains: [], pages: [] }
  }
  return { fn, calls }
}

/** The model, keeping the signals it was handed. */
function model(answer: InsightResult = { ok: true, insight: DEBY_INSIGHT }) {
  const signals: SiteSignals[] = []
  const fn = (async (s: SiteSignals) => {
    signals.push(s)
    return answer
  }) as unknown as typeof import('@/lib/free-check').fetchBusinessInsight
  return { fn, signals }
}

async function startRun(admin: ServiceRoleClient, domain: string, url: string) {
  const created = await createSeedRun(admin, SCOPE, {
    trigger: 'create',
    stage: 'a',
    summary: initialSummary({ source: 'scan', domain, url, locale: 'he' }),
    now: NOW,
  })
  if (!created.ok) throw new Error(`createSeedRun: ${created.reason}`)
  return created
}

async function scan(target: string, deps: StageADepsInput, domain = SITE.key) {
  const { tables, admin } = world(projectRow({ target_domain: target }))
  const created = await startRun(admin, domain, target)
  const { value, output } = await captureConsole(() => runStageA({ admin, scope: SCOPE, runId: created.run.id, lease: created.lease, deps: { now: () => NOW, ...deps } }))
  return { tables, admin, created, result: value, output }
}

/** The run as the summary screen receives it, for the view functions. */
function viewOf(t: Tables): SeedRunView {
  return {
    id: String(runRow(t).id),
    trigger: 'create',
    stage: 'a',
    status: runRow(t).status as SeedRunView['status'],
    errorCode: (runRow(t).error_code as string | null) ?? null,
    startedAt: NOW.toISOString(),
    finishedAt: NOW.toISOString(),
    stalled: false,
    steps: (['a1', 'a2', 'a3', 'a4'] as const).map((step) => ({
      step,
      status: stepRow(t, step).status as SeedStepStatus,
      itemCount: null,
      errorCode: (stepRow(t, step).error_code as string | null) ?? null,
      startedAt: null,
      finishedAt: null,
    })),
    summary: summaryOf(t),
  }
}

async function main() {
  installFakeDns()

  // ── 0. The root cause, as the engine sees it ──────────────────────────────
  console.log('0) The host refuses every path with 403: what the engine returns')
  {
    const host = refusingHost(403)
    const answers = await Promise.all(
      PATHS.map((p) => (p === '/' ? fetchSiteHtml(new URL(p, SITE.home), { fetchImpl: host.fetchImpl }) : fetchSiteText(new URL(p, SITE.home), { fetchImpl: host.fetchImpl }))),
    )
    const home = answers[0]
    check('the home page: { ok: false, reason: http_error, status: 403 }', !home.ok && home.reason === 'http_error' && home.status === 403, JSON.stringify(home))
    check('robots.txt, sitemap.xml, llms.txt and wp-json/ answer 403 too', answers.slice(1).every((a) => a.ok && a.status === 403), JSON.stringify(answers.slice(1).map((a) => (a.ok ? a.status : a.reason))))
  }

  // ── 1. The exact failure, and the run that now completes ──────────────────
  console.log('\n1) deby-electric.co.il behind its firewall: the research is built from Google\'s index')
  {
    const host = refusingHost(403)
    const s = search()
    const m = model()
    const { tables, result, output } = await scan(SITE.target, { fetchImpl: host.fetchImpl, insight: m.fn, search: s.fn })

    // Before the fix this run ended here: a1 failed(site_unreachable), a2-a4 skipped.
    check('the run is NOT site_unreachable: it finishes done', result.outcome === 'finished' && result.status === 'done' && runRow(tables).error_code === null, `${statusLine(tables)} ${JSON.stringify(result)}`)
    check('a1 done, a2 done, a3 skipped (not measured), a4 done', statusLine(tables) === 'a1:done a2:done a3:skipped(site_forbidden) a4:done', statusLine(tables))

    const a1 = detailOf(tables, 'a1')
    check('a1 detail: mode search_index, the coarse reason and status (diagnosable from the DB)',
      a1.mode === 'search_index' && a1.blockedReason === 'http_status' && a1.blockedStatus === 403, JSON.stringify({ mode: a1.mode, r: a1.blockedReason, s: a1.blockedStatus }))
    check('a1 detail: which searches ran and how many of the site\'s pages each showed',
      JSON.stringify(a1.searches) === JSON.stringify([{ query: `site:${SITE.key}`, ok: true, code: null, pages: 3 }]), JSON.stringify(a1.searches))
    const stored = ((a1.searchIndex as Row | undefined)?.pages ?? []) as { url: string }[]
    check('a1 keeps the site\'s own indexed pages only (the off-site listing is dropped)',
      stored.length === 3 && stored.every((p) => p.url.startsWith(SITE.home)) && !JSON.stringify(a1).includes(OFFSITE_URL), JSON.stringify(stored.map((p) => p.url)))
    check('a1 stores no page signals (nothing downstream mistakes the index for a read page)', a1.signals === null)

    check('one index search was enough (three pages): the bare-domain search was not sent', s.calls.filter((q) => q === SITE.key).length === 0)
    check('searches: 1 index + 3 competitor searches, nothing else', s.calls.length === 4 && s.calls[0] === `site:${SITE.key}`, JSON.stringify(s.calls))
    check('the network saw the home page request only: no robots, llms, sitemap, and no search-result URL',
      host.requests.length === 1 && host.requests[0] === SITE.home, JSON.stringify(host.requests))

    check('ONE model call', m.signals.length === 1)
    const sig = m.signals[0]
    check('the model reads Google\'s view: the home page\'s title and snippet, the other titles, every snippet',
      !!sig && sig.title === 'דבי חשמל | חשמלאי מוסמך בשרון' && sig.metaDescription?.startsWith('חשמלאי מוסמך בהוד השרון') === true
        && sig.h2.includes('שירותי חשמל לבית ולעסק | דבי חשמל') && sig.text.includes('עמדות טעינה') && sig.text.includes('/contact/'), JSON.stringify(sig?.title))
    check('…and nothing measured is claimed: no links, no schema, no robots, no llms.txt, no language guessed',
      !!sig && sig.internalLinkUrls.length === 0 && sig.schemaTypes.length === 0 && sig.robotsTxt === null && sig.llmsTxt === false && sig.htmlLang === null && sig.finalUrl === SITE.home)
    check('…and not the off-site listing', !!sig && !sig.text.includes(OFFSITE_URL) && !sig.text.includes(SECRET))

    const sum = summaryOf(tables)
    check('snapshot: siteAccess search_index', sum.siteAccess === 'search_index')
    check('snapshot: business, audiences, five keywords, five topics',
      sum.business?.companyName === 'דבי חשמל' && sum.business?.commerceType === 'service' && sum.audiences.length === 3 && sum.seedKeywords.length === 5 && sum.topics.length === 5)
    check('snapshot: competitors validated in real searches', sum.competitors.some((c) => c.domain === 'sharon-electric.co.il' && c.validated) && !sum.competitors.some((c) => c.domain === SITE.key), JSON.stringify(sum.competitors))
    check('snapshot: AI readiness unavailable for the firewall\'s reason, never 0/4',
      sum.geo.state === 'unavailable' && sum.geo.unavailableReason === 'site_firewall' && sum.geo.total === 0, JSON.stringify(sum.geo))
    check('snapshot: no findings, and no sitemap count claimed', sum.findings.length === 0 && sum.findingsOmitted === 0 && sum.sitemapUrlCount === null)
    const a3 = detailOf(tables, 'a3')
    check('a3 detail: mode search_index and the status', a3.mode === 'search_index' && a3.blockedStatus === 403, JSON.stringify(a3))
    check('the settings took the business', tables.project_profiles.length === 1)

    const step = output.split('\n').find((l) => l.includes('[seed-scan] step') && l.includes('"step":"a1"')) ?? ''
    check('the [seed-scan] step log line for a1 names the mode and the status', step.includes('"mode":"search_index"') && step.includes('"blockedStatus":403') && step.includes('"blockedReason":"http_status"'), step)
    check(`${SECRET} (the refusal page, a search snippet) is in no stored row`, !JSON.stringify(tables).includes(SECRET))
    check(`${SECRET} is in no log line`, !output.includes(SECRET))

    // What the merchant sees.
    const run = viewOf(tables)
    const tiles = tilesView(sum, run)
    check('summary: "what\'s holding you back" is firewall, not "clean" and not failed', findingsView(sum, 'skipped').kind === 'firewall')
    check('summary: AI readiness is firewall, not 0/4', geoView(sum, 'skipped').kind === 'firewall')
    check('summary: the fixes and AI tiles read "not checked", the keywords and articles tiles have values',
      tiles.find((x) => x.id === 'fixes')?.state === 'notChecked' && tiles.find((x) => x.id === 'geo')?.state === 'notChecked'
        && tiles.find((x) => x.id === 'keywords')?.value === '5' && tiles.find((x) => x.id === 'articles')?.value === '5', JSON.stringify(tiles))
    const he = dashboardHe.seedOnboarding.summary as unknown as Record<string, Record<string, string>>
    const en = dashboardEn.seedOnboarding.summary as unknown as Record<string, Record<string, string>>
    check('copy: the firewall notice exists in Hebrew and English and says Google + connect',
      /גוגל/.test(he.firewall?.body ?? '') && /וורדפרס|שופיפיי/.test(he.firewall?.body ?? '') && /Google/.test(en.firewall?.body ?? '') && /WordPress|Shopify/.test(en.firewall?.body ?? ''))
  }

  // ── 2. The bare-domain search, only when the site: search shows too little ─
  console.log('\n2) site: shows one page: the bare domain is searched too, and nothing more')
  {
    const host = refusingHost(403)
    const one: SearchOutcome = { ok: true, domains: [SITE.key], pages: [INDEXED.ok ? INDEXED.pages![0] : { url: '', title: '', snippet: '' }] }
    const more: SearchOutcome = { ok: true, domains: [SITE.key], pages: INDEXED.ok ? INDEXED.pages!.slice(1) : [] }
    const s = search({ [`site:${SITE.key}`]: one, [SITE.key]: more })
    const { tables } = await scan(SITE.target, { fetchImpl: host.fetchImpl, insight: model().fn, search: s.fn })
    const a1 = detailOf(tables, 'a1')
    check('two index searches, in order: site: then the bare domain', s.calls[0] === `site:${SITE.key}` && s.calls[1] === SITE.key && s.calls.filter((q) => q.includes(SITE.key)).length === 2, JSON.stringify(s.calls))
    check('the pages of both are kept, the site\'s own only', ((a1.searchIndex as Row)?.pages as unknown[])?.length === 3, JSON.stringify(a1.searchIndex))
    check('the run finishes done in search-index mode', runRow(tables).status === 'done' && summaryOf(tables).siteAccess === 'search_index')
  }

  // ── 3. Google shows nothing either: a distinct code ───────────────────────
  console.log('\n3) The firewall refuses us and Google shows no page: site_forbidden, not "check your browser"')
  for (const c of [
    { name: 'no indexed page', index: {} as Record<string, SearchOutcome>, codes: [null, null] },
    { name: 'the search is unavailable (no key)', index: { [`site:${SITE.key}`]: { ok: false, code: 'search_unavailable' }, [SITE.key]: { ok: false, code: 'search_unavailable' } } as Record<string, SearchOutcome>, codes: ['search_unavailable', 'search_unavailable'] },
    { name: 'only off-site results', index: { [`site:${SITE.key}`]: { ok: true, domains: ['easy.co.il'], pages: [{ url: OFFSITE_URL, title: 'x', snippet: 'y' }] } } as Record<string, SearchOutcome>, codes: [null, null] },
  ]) {
    const host = refusingHost(403)
    const s = search(c.index)
    const m = model()
    const { tables, result } = await scan(SITE.target, { fetchImpl: host.fetchImpl, insight: m.fn, search: s.fn })
    check(`${c.name} → a1 failed(site_forbidden); a2-a4 skipped; no model call`,
      result.outcome === 'finished' && result.status === 'failed' && runRow(tables).error_code === 'site_forbidden'
        && statusLine(tables) === 'a1:failed(site_forbidden) a2:skipped(site_unreadable) a3:skipped(site_unreadable) a4:skipped(site_unreadable)' && m.signals.length === 0,
      statusLine(tables))
    const a1 = detailOf(tables, 'a1')
    check('…at most two searches, both index searches, recorded with their codes',
      s.calls.length === 2 && a1.mode === 'search_index' && a1.blockedStatus === 403 && JSON.stringify((a1.searches as Row[]).map((r) => r.code)) === JSON.stringify(c.codes), JSON.stringify(a1.searches))
  }
  {
    const notice = stageFailureNotice('site_forbidden')
    const he = (dashboardHe.seedOnboarding.notices as unknown as Record<string, { title: string; body: string }>)[notice.key]
    const en = (dashboardEn.seedOnboarding.notices as unknown as Record<string, { title: string; body: string }>)[notice.key]
    check('the notice for site_forbidden is its own, not siteUnreachable', notice.key !== 'siteUnreachable' && notice.key === 'siteForbidden', notice.key)
    check('…it says the firewall blocks automated reads, not "make sure it opens in a browser"',
      !!he && !!en && /חוסמ/.test(he.title + he.body) && !/דפדפן/.test(he.body) && /block/i.test(en.title + en.body) && !/browser/i.test(en.body), JSON.stringify({ he, en }))
    check('site_unreachable keeps its own notice', stageFailureNotice('site_unreachable').key === 'siteUnreachable')
  }

  // ── 4. Which answers count as a refusal ───────────────────────────────────
  console.log('\n4) 401/406/429/503 are refusals too; 404 and 500 are not')
  for (const status of [401, 406, 429, 503]) {
    const host = refusingHost(status)
    const { tables } = await scan(SITE.target, { fetchImpl: host.fetchImpl, insight: model().fn, search: search().fn })
    check(`${status} → search-index mode, the status recorded`, runRow(tables).status === 'done' && detailOf(tables, 'a1').blockedStatus === status, statusLine(tables))
  }
  for (const status of [404, 500]) {
    const host = refusingHost(status)
    const s = search()
    const { tables } = await scan(SITE.target, { fetchImpl: host.fetchImpl, insight: model().fn, search: s.fn })
    check(`${status} → site_unreachable as before, no search`, stepRow(tables, 'a1').error_code === 'site_unreachable' && s.calls.length === 0, `${statusLine(tables)} ${s.calls.length}`)
  }

  // ── 5. A host that resolves but drops the connection ──────────────────────
  console.log('\n5) The host resolves but drops every connection')
  {
    const host = droppingHost()
    const { tables, output } = await scan(SITE.target, { fetchImpl: host.fetchImpl, insight: model().fn, search: search().fn })
    const a1 = detailOf(tables, 'a1')
    check('indexed → search-index mode, reason network, no status', runRow(tables).status === 'done' && a1.mode === 'search_index' && a1.blockedReason === 'network' && a1.blockedStatus === null, JSON.stringify(a1.blockedReason))
    check('…the exception\'s text goes nowhere', !JSON.stringify(tables).includes(SECRET) && !output.includes(SECRET))
  }
  {
    const host = droppingHost()
    const { tables } = await scan(SITE.target, { fetchImpl: host.fetchImpl, insight: model().fn, search: search({}).fn })
    check('nothing indexed → site_unreachable (it may just be down), not site_forbidden', stepRow(tables, 'a1').error_code === 'site_unreachable', statusLine(tables))
  }

  // ── 6. DNS failure: unchanged ─────────────────────────────────────────────
  console.log('\n6) A name that does not resolve: site_unreachable, nothing fetched, nothing searched')
  {
    dnsOverrides.set('www.no-such-electric.co.il', 'fail')
    const host = refusingHost(403)
    const s = search()
    const { tables } = await scan('https://www.no-such-electric.co.il/', { fetchImpl: host.fetchImpl, insight: model().fn, search: s.fn }, 'no-such-electric.co.il')
    check('a1 failed(site_unreachable), a2-a4 skipped', statusLine(tables) === 'a1:failed(site_unreachable) a2:skipped(site_unreadable) a3:skipped(site_unreadable) a4:skipped(site_unreadable)', statusLine(tables))
    check('…no request and no search', host.requests.length === 0 && s.calls.length === 0, `${host.requests.length} / ${s.calls.length}`)
    check('…a1 detail says live mode', detailOf(tables, 'a1').mode === 'live')
  }

  // ── 7. A readable site: unchanged ─────────────────────────────────────────
  console.log('\n7) A site that answers: read directly, exactly as before')
  {
    const net = new FakeNetwork(heWordPressSite())
    const calls: string[] = []
    const s: SearchFn = async (query) => {
      calls.push(query)
      return { ok: true, domains: HE_WP_RESULTS[query] ?? [] }
    }
    const { tables } = await scan(HE_WP.target, { fetchImpl: net.fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: s }, HE_WP.key)
    const sum = summaryOf(tables)
    check('every step done, a1 live', statusLine(tables) === 'a1:done a2:done a3:done a4:done' && detailOf(tables, 'a1').mode === 'live', statusLine(tables))
    check('siteAccess direct, AI readiness measured, sitemap counted', sum.siteAccess === 'direct' && sum.geo.state === 'measured' && sum.sitemapUrlCount === 12)
    check('only a4\'s three searches, no index search', calls.length === 3 && !calls.some((q) => q.startsWith('site:')), JSON.stringify(calls))
    check('findings are the page\'s, the view lists them', findingsView(sum, 'done').kind === 'list')
  }

  // ── 8. A resumed a1 does not search again ─────────────────────────────────
  console.log('\n8) a1 resumed after its index searches were sent: they are spent')
  {
    const host = refusingHost(403)
    const s = search()
    const { tables, admin } = world(projectRow({ target_domain: SITE.target }))
    const created = await startRun(admin, SITE.key, SITE.target)
    // The worker died after saving the mark: the step row is running, with the mark, and the lease lapsed.
    const row = tables.project_seed_steps.find((r) => r.step === 'a1') as Row
    Object.assign(row, { status: 'running', detail: { mode: 'search_index', blockedReason: 'http_status', blockedStatus: 403, searchAttempted: true } })
    Object.assign(runRow(tables), { lease_expires_at: new Date(NOW.getTime() - 1_000).toISOString() })
    void created
    await captureConsole(() => resumeSeedRun({ admin, scope: SCOPE, runId: String(runRow(tables).id), deps: { fetchImpl: host.fetchImpl, insight: model().fn, search: s.fn, now: () => NOW } }))
    check('a1 failed(search_interrupted), no search sent', stepRow(tables, 'a1').error_code === 'search_interrupted' && s.calls.length === 0, `${statusLine(tables)} ${s.calls.length}`)
  }

  // ── 9. Stage B: the crawl is not attempted against the firewall ───────────
  console.log('\n9) b1 in search-index mode: skipped for the firewall\'s reason, nothing requested')
  {
    const host = refusingHost(403)
    const { admin } = world(projectRow({ target_domain: SITE.target }))
    const out = (await STAGE_B_EXECUTORS.b1({
      admin,
      scope: SCOPE,
      runId: 'run-1',
      trigger: 'create',
      project: projectRow({ target_domain: SITE.target }) as unknown as SeedProject,
      summary: { ...initialSummary({ source: 'scan', domain: SITE.key, url: SITE.home, locale: 'he' }), siteAccess: 'search_index' } as SeedSummary,
      details: { a1: { mode: 'search_index', blockedReason: 'http_status', blockedStatus: 403, signals: null } },
      deps: stageBDeps({ fetchImpl: host.fetchImpl, now: () => NOW }),
      save: async () => true,
      deadlineAt: null,
    })) as StepResult
    check('b1 skipped(site_forbidden), not failed(crawl_no_pages)', out.kind === 'finished' && out.status === 'skipped' && out.errorCode === 'site_forbidden', `${out.status} ${out.errorCode}`)
    check('…and no request left', host.requests.length === 0, JSON.stringify(host.requests))
  }

  // ── 10. The snapshot reads back ───────────────────────────────────────────
  console.log('\n10) The snapshot round-trips, and unknown values fall back')
  {
    const base = initialSummary({ source: 'scan', domain: SITE.key, url: SITE.home, locale: 'he' })
    const back = readSummary(JSON.parse(JSON.stringify({ ...base, siteAccess: 'search_index', geo: { state: 'unavailable', unavailableReason: 'site_firewall', passed: 0, total: 0, signals: [] } })))
    check('siteAccess and the firewall reason are kept', back?.siteAccess === 'search_index' && back?.geo.unavailableReason === 'site_firewall')
    const odd = readSummary({ ...base, siteAccess: 'scrape', geo: { state: 'unavailable', unavailableReason: 'whatever' } })
    check('anything else reads as direct / no reason', odd?.siteAccess === 'direct' && odd?.geo.unavailableReason === null)
    check('an older snapshot (no field) reads as direct', readSummary({ ...base, siteAccess: undefined })?.siteAccess === 'direct')
  }

  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
