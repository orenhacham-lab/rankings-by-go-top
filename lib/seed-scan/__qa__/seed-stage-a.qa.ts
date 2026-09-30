/**
 * Stage A of the seeding scan, end to end over whole fixture sites.
 *
 * The engine's real fetchers, parsers, findings and sitemap discovery run
 * against a fake network (only sockets and DNS are fake), so what is asserted
 * here is what production does: which requests leave, how many model calls
 * and searches a run spends, what lands in the snapshot and in the settings,
 * and what a resumed run does after its worker died.
 *
 * Fixtures: a Hebrew WordPress services site, an English Shopify store, a
 * password-locked Shopify store (401 and 200 variants), a site with no
 * sitemap, sites whose model call or search fails with provider text that
 * must never surface, and claimed free checks with and without their seed.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-stage-a.qa.ts
 */
import { buildFindings, domainKey, extractSiteSignals, fetchSiteHtml, MAX_INTERNAL_LINK_URLS, splitFindings, type FreeCheckSeed } from '@/lib/free-check'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { claimSnapshot, readClaimSnapshot } from '../claim'
import { resumeSeedRun, runStageA, type StageAResult } from '../runner'
import type { SearchFn } from '../serper'
import { MAX_SEARCHES, type StageADepsInput } from '../steps'
import { createSeedRun, LEASE_MS } from '../store'
import { initialSummary, readSummary } from '../summary'
import type { SeedRunTrigger, SeedScope, SeedSummary } from '../types'
import {
  captureConsole,
  claimedScan,
  claimSeed,
  clock,
  dnsOverrides,
  EN_SHOP,
  EN_SHOP_INSIGHT,
  enShopifySite,
  FakeNetwork,
  fakeModel,
  fakeSearch,
  HE_WP,
  HE_WP_INSIGHT,
  HE_WP_RESULTS,
  heWordPressSite,
  installFakeDns,
  lockedShopifySite200,
  lockedShopifySite401,
  makeChecker,
  NO_SITEMAP,
  noSitemapSite,
  NOW,
  PROJECT,
  projectRow,
  SECRET,
  USER,
  world,
  type FakeRoute,
  type Tables,
} from './_fixtures'

const { check, finish } = makeChecker()
const SCOPE: SeedScope = { projectId: PROJECT, userId: USER }

type Row = Record<string, unknown>
const runRow = (t: Tables) => t.project_seed_runs[0] as Row
const stepRow = (t: Tables, step: string) => t.project_seed_steps.find((s) => s.step === step) as Row
const summaryOf = (t: Tables) => readSummary(runRow(t).summary) as SeedSummary
const statusLine = (t: Tables) =>
  ['a1', 'a2', 'a3', 'a4'].map((s) => `${s}:${stepRow(t, s)?.status}${stepRow(t, s)?.error_code ? `(${stepRow(t, s).error_code})` : ''}`).join(' ')

async function startRun(
  admin: ServiceRoleClient,
  opts: { trigger?: SeedRunTrigger; domain: string; url: string; locale?: 'he' | 'en'; claim?: ReturnType<typeof claimedScan> | null; now?: Date },
) {
  const snapshot = opts.claim ? claimSnapshot(opts.claim) : null
  const created = await createSeedRun(admin, SCOPE, {
    trigger: opts.trigger ?? 'create',
    stage: 'a',
    summary: initialSummary({ source: snapshot ? 'claim' : 'scan', domain: opts.domain, url: opts.url, locale: opts.locale ?? 'he' }),
    stepDetail: snapshot ? { a1: { claim: snapshot } } : undefined,
    now: opts.now ?? NOW,
  })
  if (!created.ok) throw new Error(`createSeedRun: ${created.reason}`)
  return created
}

async function run(admin: ServiceRoleClient, created: { run: { id: string }; lease: string }, deps: StageADepsInput) {
  return captureConsole(() => runStageA({ admin, scope: SCOPE, runId: created.run.id, lease: created.lease, deps }))
}

async function main() {
  installFakeDns()

  // ── 1. Hebrew WordPress services site ─────────────────────────────────────
  console.log('1) Hebrew WordPress services site — a full first scan')
  {
    const { tables, admin } = world(projectRow())
    const net = new FakeNetwork(heWordPressSite())
    const model = fakeModel({ ok: true, insight: HE_WP_INSIGHT })
    const search = fakeSearch(HE_WP_RESULTS)
    const created = await startRun(admin, { domain: HE_WP.key, url: 'https://plumber-tlv.co.il/' })
    const { value: result, output } = await run(admin, created, { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: () => NOW })

    check('the run finishes done', result.outcome === 'finished' && result.status === 'done', JSON.stringify(result))
    check('every step is done', statusLine(tables) === 'a1:done a2:done a3:done a4:done', statusLine(tables))
    check('the run row is done, its lease dropped', runRow(tables).status === 'done' && runRow(tables).lease_expires_at === null && !!runRow(tables).finished_at)
    check('ONE model call', model.calls.length === 1, String(model.calls.length))
    check('the model is asked in the run locale, told the site itself', model.calls[0]?.locale === 'he' && model.calls[0]?.selfDomain === HE_WP.key)
    check(`at most ${MAX_SEARCHES} searches — the first three seed keywords, one each`,
      search.calls.length === 3 && search.calls.every((c, i) => c.query === HE_WP_INSIGHT.keywords[i]), JSON.stringify(search.calls.map((c) => c.query)))
    check('searches run in the project market (IL / he)', search.calls.every((c) => c.gl === 'il' && c.hl === 'he'), JSON.stringify(search.calls[0]))
    check('no request left the project host', net.requests.length > 0 && net.requests.every((u) => domainKey(new URL(u)) === HE_WP.key), net.hosts().join(','))

    const s = summaryOf(tables)
    check('snapshot: the business as understood', s.business?.companyName === 'אינסטלציה מהירה' && s.business?.commerceType === 'service' && s.business?.isLocal === true)
    check('snapshot: platform and language are the page\'s own', s.business?.platform === 'WordPress' && s.business?.language === 'he', JSON.stringify(s.business))
    check('snapshot: five seed keywords and five topics', s.seedKeywords.length === 5 && s.topics.length === 5)
    check('snapshot: the final URL and a scan time', s.url === HE_WP.home && s.scannedAt === NOW.toISOString(), s.url)
    check('snapshot: sitemap URLs counted through the index (5 + 7)', s.sitemapUrlCount === 12 && s.sitemapTruncated === false, String(s.sitemapUrlCount))
    check('a1 item count is the sitemap count', stepRow(tables, 'a1').item_count === 12)

    const robots = `User-agent: *\nDisallow: /wp-admin/\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: ${HE_WP.home}wp-sitemap.xml\n`
    const all = buildFindings(extractSiteSignals(HE_WP.html, HE_WP.home, { robotsTxt: robots, llmsTxt: false }), 'he')
    check('snapshot: ALL findings, blockers first', JSON.stringify(s.findings.map((f) => f.id)) === JSON.stringify(all.map((f) => f.id)) && s.findings[0]?.severity === 'blocker',
      `${s.findings.map((f) => f.id)} vs ${all.map((f) => f.id)}`)
    check('…which the free check\'s gate would have cut (so this really is ungated)', splitFindings(all).locked > 0 && s.findingsOmitted === 0)
    check('snapshot: four AI-readiness checks, measured (GPTBot blocked, no llms.txt)',
      s.geo.state === 'measured' && s.geo.total === 4 && s.geo.passed === 2 && !s.geo.signals.find((g) => g.id === 'robots')?.ok, JSON.stringify(s.geo))
    check('counters are derived from the lists', s.counters.fixes === s.findings.length && s.counters.keywords === 5 && s.counters.geoTotal === 4)

    const comp = s.competitors.map((c) => `${c.domain}:${c.source}:${c.seenIn}`).join(' ')
    check('competitors: validated suggestions first, then discoveries seen in 2+ searches',
      comp === 'rival-plumber.co.il:model:2 pipes-pro.co.il:model:1 easy.co.il:search:3 zap.co.il:search:2', comp)
    check('a suggestion no search showed is dropped', !s.competitors.some((c) => c.domain === 'never-seen.co.il'))
    check('social, video, encyclopedias and the site itself (and its subdomains) are never competitors',
      !s.competitors.some((c) => /facebook|wikipedia|youtube|instagram|plumber-tlv/.test(c.domain)))
    const saved = tables.ai_visibility_competitors
    // Wave 9: the cap is five active (was three): all four validated rivals are added.
    check('validated competitors are ADDED to the project, within the five-active cap',
      saved.length === 4 && saved.map((r) => r.domain).join(',') === 'rival-plumber.co.il,pipes-pro.co.il,easy.co.il,zap.co.il', saved.map((r) => r.domain).join(','))
    check('…each row owned by this user and project, active', saved.every((r) => r.user_id === USER && r.project_id === PROJECT && r.is_active === true))

    const profile = tables.project_profiles[0]
    check('settings: the profile is written and every field marked scan',
      profile?.commerce_type === 'service' && profile?.niche === 'אינסטלציה ביתית' && profile?.is_local === true && profile?.detected_platform === 'WordPress'
      && Object.values(profile?.field_sources as Record<string, string>).every((v) => v === 'scan'), JSON.stringify(profile?.field_sources))
    check('settings: audiences inserted as scan rows', tables.project_audiences.length === 4 && tables.project_audiences.every((a) => a.source === 'scan' && a.user_id === USER))
    const p = tables.projects[0]
    check('settings: business name, country and language filled; city left alone',
      p.business_name === 'אינסטלציה מהירה' && p.country === 'IL' && p.language === 'he' && p.city === null, JSON.stringify(p))
    check('nothing else on the project is touched',
      JSON.stringify(p.keywords) === '["kept keyword"]' && p.description === 'kept project description' && p.name === 'My site' && p.target_domain === HE_WP.target)
    check('each step saved its own result (resume-ready)', ['a1', 'a2', 'a3', 'a4'].every((st) => !!stepRow(tables, st).finished_at && typeof stepRow(tables, st).detail === 'object'))
    check('log lines carry ids and codes only — no page text, no model text',
      output.includes('[seed-scan]') && !/אינסטלטור|אינסטלציה|rival-plumber/.test(output), output.slice(0, 300))
  }

  // ── 2. English Shopify store ──────────────────────────────────────────────
  console.log('\n2) English Shopify store — index sitemaps, an off-host child, market from a2')
  {
    const { tables, admin } = world(projectRow({ target_domain: EN_SHOP.target }))
    const net = new FakeNetwork(enShopifySite())
    const model = fakeModel({ ok: true, insight: EN_SHOP_INSIGHT })
    const search = fakeSearch({ 'soy candles': ['boysmells.com', 'etsy.com', 'amazon.com'], 'hand poured candles': ['etsy.com', 'amazon.com', 'reddit.com'] })
    const created = await startRun(admin, { domain: EN_SHOP.key, url: 'https://northwind-candles.com/', locale: 'en' })
    const { value: result } = await run(admin, created, { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: () => NOW })
    const s = summaryOf(tables)

    check('the run finishes done', result.outcome === 'finished' && result.status === 'done', statusLine(tables))
    check('the platform is read off the markup: Shopify', s.business?.platform === 'Shopify' && s.business?.language === 'en')
    check('llms.txt is found, so its readiness check passes', s.geo.signals.find((g) => g.id === 'llms')?.ok === true)
    check('sitemap: the index children on this host are counted (8+3+2+1)', s.sitemapUrlCount === 14, String(s.sitemapUrlCount))
    check('sitemap: the child on another domain is never requested', !net.requests.some((u) => u.includes('evil-sitemaps')), net.hosts().join(','))
    check('no request left the project host', net.requests.every((u) => domainKey(new URL(u)) === EN_SHOP.key), net.hosts().join(','))
    check('a2 fills country and language on the first seed…', tables.projects[0].country === 'US' && tables.projects[0].language === 'en')
    check('…so a4 searches that market (us / en)', search.calls.length === 3 && search.calls.every((c) => c.gl === 'us' && c.hl === 'en'), JSON.stringify(search.calls[0]))
    const comp = s.competitors.map((c) => `${c.domain}:${c.source}`).join(' ')
    check('a suggestion seen once stays; marketplaces seen twice are discovered', comp === 'boysmells.com:model etsy.com:search amazon.com:search', comp)
    check('reddit (seen once, and a forum) is not a competitor', !comp.includes('reddit'))
  }

  // ── 3. Password-locked Shopify stores ─────────────────────────────────────
  for (const variant of [
    { name: 'myshopify.com, password page answers 401', site: lockedShopifySite401(), target: 'dev-store-42.myshopify.com', key: 'dev-store-42.myshopify.com' },
    { name: 'own domain, password page answers 200', site: lockedShopifySite200(), target: 'locked-candles.com', key: 'locked-candles.com' },
  ]) {
    console.log(`\n3) Password-locked Shopify store (${variant.name})`)
    const { tables, admin } = world(projectRow({ target_domain: variant.target }))
    const net = new FakeNetwork(variant.site)
    const model = fakeModel({ ok: true, insight: EN_SHOP_INSIGHT })
    const search = fakeSearch()
    const created = await startRun(admin, { domain: variant.key, url: `https://${variant.target}/`, locale: 'en' })
    const { value: result } = await run(admin, created, { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: () => NOW })
    const s = summaryOf(tables)

    check('the run is done, not failed', result.outcome === 'finished' && result.status === 'done', statusLine(tables))
    check('a1 is done and marks the store locked', stepRow(tables, 'a1').status === 'done' && s.storefrontLocked === true)
    check('a2 is skipped with storefront_locked (no model call)', stepRow(tables, 'a2').status === 'skipped' && stepRow(tables, 'a2').error_code === 'storefront_locked' && model.calls.length === 0)
    check('AI readiness is "unavailable", not four failures', s.geo.state === 'unavailable' && s.geo.unavailableReason === 'storefront_locked' && s.geo.total === 0)
    check('no password-page "findings" are reported', s.findings.length === 0 && stepRow(tables, 'a3').error_code === 'storefront_locked')
    check('a4 has nothing to search for (no search spent)', stepRow(tables, 'a4').error_code === 'no_seed_keywords' && search.calls.length === 0)
    check('only the home page and the password page were requested', net.requests.length === 2 && net.requests[1].endsWith('/password'), net.requests.join(','))
    check('settings are left alone', tables.project_profiles.length === 0 && tables.projects[0].business_name === null)
  }

  // ── 1b. robots.txt, whole or not at all ───────────────────────────────────
  console.log('\n1b) robots.txt: a1 uses a file read whole; one it could not read is "no rules", as before')
  {
    const ROBOTS = 'https://www.plumber-tlv.co.il/robots.txt'
    // GPTBot is kept out in the first half; the rest is padding.
    const gptFirst = `User-agent: GPTBot\nDisallow: /\n${'# padding so the file arrives in parts\n'.repeat(20)}`
    const plain = { 'content-type': 'text/plain' }
    const cases: { name: string; route: FakeRoute; state: string; gptBlocked: boolean }[] = [
      { name: 'read whole', route: { status: 200, headers: plain, body: gptFirst }, state: 'rules', gptBlocked: true },
      { name: 'cut half way (the connection drops)', route: { status: 200, headers: plain, body: gptFirst, cut: 'break' }, state: 'unreadable', gptBlocked: false },
      { name: 'a 503', route: { status: 503, headers: plain, body: gptFirst }, state: 'unreadable', gptBlocked: false },
      { name: 'a 404', route: { status: 404, headers: { 'content-type': 'text/html' }, body: '<h1>Not found</h1>' }, state: 'absent', gptBlocked: false },
    ]
    for (const c of cases) {
      const { tables, admin } = world(projectRow())
      const net = new FakeNetwork({ ...heWordPressSite(), [ROBOTS]: c.route })
      const created = await startRun(admin, { domain: HE_WP.key, url: 'https://plumber-tlv.co.il/' })
      await run(admin, created, { fetchImpl: net.fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: fakeSearch(HE_WP_RESULTS).fn, now: () => NOW })
      const detail = (stepRow(tables, 'a1').detail ?? {}) as Row
      const robotsSignal = summaryOf(tables).geo.signals.find((g) => g.id === 'robots')
      check(`robots.txt ${c.name}: a1 done, recorded ${c.state}; GPTBot ${c.gptBlocked ? 'blocked (its rules are used)' : 'not blocked (no rules are used)'}`,
        stepRow(tables, 'a1').status === 'done' && detail.robots === c.state && robotsSignal?.ok === !c.gptBlocked,
        `${String(stepRow(tables, 'a1').status)} ${String(detail.robots)} ${JSON.stringify(robotsSignal)}`)
    }
  }

  // ── 4. A site with no sitemap ─────────────────────────────────────────────
  console.log('\n4) A site with no sitemap')
  {
    const { tables, admin } = world(projectRow({ target_domain: NO_SITEMAP.target }))
    const net = new FakeNetwork(noSitemapSite())
    const insight = { ...EN_SHOP_INSIGHT, competitors: [] }
    const created = await startRun(admin, { domain: NO_SITEMAP.key, url: 'https://tiny-bakery.com/', locale: 'en' })
    const { value: result } = await run(admin, created, { fetchImpl: net.fetch, insight: fakeModel({ ok: true, insight }).fn, search: fakeSearch().fn, now: () => NOW })
    const s = summaryOf(tables)
    check('the run is done', result.outcome === 'finished' && result.status === 'done', statusLine(tables))
    check('the sitemap count is 0 — measured, and empty', s.sitemapUrlCount === 0 && s.sitemapTruncated === false && stepRow(tables, 'a1').item_count === 0)
    check('robots.txt and llms.txt absent read as absent, not as a failure', stepRow(tables, 'a1').status === 'done' && s.geo.signals.find((g) => g.id === 'llms')?.ok === false)
    check('searches that show nobody leave an empty, valid competitor list', s.competitors.length === 0 && stepRow(tables, 'a4').status === 'done')
  }

  // ── 5. The model call fails ───────────────────────────────────────────────
  console.log('\n5) The model call fails — the technical result survives, provider text does not')
  {
    const { tables, admin } = world(projectRow())
    const net = new FakeNetwork(heWordPressSite())
    const model = fakeModel(async () => {
      throw new Error(`${SECRET}: quota exceeded for key AIzaSyFAKE`)
    })
    const search = fakeSearch(HE_WP_RESULTS)
    const created = await startRun(admin, { domain: HE_WP.key, url: 'https://plumber-tlv.co.il/' })
    const { value: result, output } = await run(admin, created, { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: () => NOW })
    check('the run is partial (a later step failed)', result.outcome === 'finished' && result.status === 'partial' && runRow(tables).error_code === 'model_failed', JSON.stringify(result))
    check('a2 failed with model_failed', stepRow(tables, 'a2').status === 'failed' && stepRow(tables, 'a2').error_code === 'model_failed')
    check('a3 still measured everything', stepRow(tables, 'a3').status === 'done' && summaryOf(tables).findings.length > 0)
    check('a4 skipped: no keywords, no search spent', stepRow(tables, 'a4').error_code === 'no_seed_keywords' && search.calls.length === 0)
    check('the one model call was not retried', model.calls.length === 1)
    check(`${SECRET} is in no stored row`, !JSON.stringify(tables).includes(SECRET))
    check(`${SECRET} is in no log line`, !output.includes(SECRET), output.slice(0, 300))
  }
  for (const c of [
    { name: 'no API key', answer: { ok: false as const, reason: 'missing_gemini_api_key' }, code: 'model_unavailable' },
    { name: 'a reason carrying provider text', answer: { ok: false as const, reason: `${SECRET} 429` }, code: 'model_failed' },
  ]) {
    const { tables, admin } = world(projectRow())
    const created = await startRun(admin, { domain: HE_WP.key, url: 'https://plumber-tlv.co.il/' })
    const { output } = await run(admin, created, { fetchImpl: new FakeNetwork(heWordPressSite()).fetch, insight: fakeModel(c.answer).fn, search: fakeSearch().fn, now: () => NOW })
    check(`model answers "${c.name}" → ${c.code}, and its words go nowhere`,
      stepRow(tables, 'a2').error_code === c.code && !JSON.stringify(tables).includes(SECRET) && !output.includes(SECRET), stepRow(tables, 'a2').error_code as string)
  }
  {
    const { tables, admin } = world(projectRow())
    const created = await startRun(admin, { domain: HE_WP.key, url: 'https://plumber-tlv.co.il/' })
    const slow = fakeModel(() => new Promise((resolve) => setTimeout(() => resolve({ ok: true, insight: HE_WP_INSIGHT }), 3_000)))
    const t0 = Date.now()
    await run(admin, created, { fetchImpl: new FakeNetwork(heWordPressSite()).fetch, insight: slow.fn, search: fakeSearch().fn, now: () => NOW, budgets: { modelMs: 150 } })
    const ms = Date.now() - t0
    check('a model slower than its budget → model_timeout, and the run moves on', stepRow(tables, 'a2').error_code === 'model_timeout' && stepRow(tables, 'a3').status === 'done' && ms < 2_000, `${ms}ms`)
    check('…its late answer is never written into the settings', tables.project_profiles.length === 0)
  }

  // ── 6. a1 refusals ────────────────────────────────────────────────────────
  console.log('\n6) Reading the site fails — the run fails, nothing downstream runs')
  {
    const cases: { name: string; target: string; routes: Record<string, import('./_fixtures').FakeRoute>; dns?: [string, 'fail' | { address: string; family: number }[]]; code: string; budgets?: StageADepsInput['budgets']; searched?: number }[] = [
      { name: 'a redirect to another domain', target: 'moved-away.com', routes: { 'https://moved-away.com/': { status: 301, headers: { location: 'https://elsewhere.net/' } }, 'https://elsewhere.net/': { status: 200, headers: { 'content-type': 'text/html' }, body: '<html><title>x</title></html>' } }, code: 'site_offsite_redirect' },
      { name: 'a host resolving to a private address', target: 'intranet-site.com', routes: {}, dns: ['intranet-site.com', [{ address: '10.0.0.7', family: 4 }]], code: 'site_blocked' },
      { name: 'a host that does not resolve', target: 'no-such-host.com', routes: {}, dns: ['no-such-host.com', 'fail'], code: 'site_unreachable' },
      { name: 'an address that is not a public site', target: 'localhost', routes: {}, code: 'invalid_site_url' },
      { name: 'a PDF instead of a page', target: 'pdf-only.com', routes: { 'https://pdf-only.com/': { status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF-1.4' } }, code: 'site_not_html' },
      { name: 'a server error', target: 'broken-site.com', routes: { 'https://broken-site.com/': { status: 500, headers: { 'content-type': 'text/html' }, body: `<h1>${SECRET}</h1>` } }, code: 'site_unreachable' },
      { name: 'a page slower than its budget', target: 'slow-site.com', routes: { 'https://slow-site.com/': { status: 200, delayMs: 5_000, headers: { 'content-type': 'text/html' }, body: '<html></html>' } }, code: 'site_unreachable', budgets: { pageMs: 150 }, searched: 2 },
      { name: 'a body that never finishes', target: 'drip-site.com', routes: { 'https://drip-site.com/': { status: 200, stallBody: true, headers: { 'content-type': 'text/html' } } }, code: 'site_unreachable', budgets: { pageMs: 150 }, searched: 2 },
    ]
    for (const c of cases) {
      if (c.dns) dnsOverrides.set(c.dns[0], c.dns[1])
      const { tables, admin } = world(projectRow({ target_domain: c.target }))
      const net = new FakeNetwork(c.routes)
      const model = fakeModel({ ok: true, insight: HE_WP_INSIGHT })
      const search = fakeSearch()
      // The engine's page reader, counted: admission must refuse before it.
      let reads = 0
      const fetchHtml: typeof fetchSiteHtml = (...args) => {
        reads++
        return fetchSiteHtml(...args)
      }
      const created = await startRun(admin, { domain: c.target, url: `https://${c.target}/` })
      const t0 = Date.now()
      const { value: result, output } = await run(admin, created, { fetchImpl: net.fetch, fetchHtml, insight: model.fn, search: search.fn, now: () => NOW, budgets: c.budgets })
      const ms = Date.now() - t0
      const ok = result.outcome === 'finished' && result.status === 'failed'
        && stepRow(tables, 'a1').error_code === c.code
        && ['a2', 'a3', 'a4'].every((st) => stepRow(tables, st).status === 'skipped' && stepRow(tables, st).error_code === 'site_unreadable')
        && model.calls.length === 0 && search.calls.length === (c.searched ?? 0)
        && (c.searched ? search.calls.every((q) => q.query === `site:${c.target}` || q.query === c.target) : true)
        && runRow(tables).error_code === c.code
      // A host that never answered in time exists (DNS resolved): a1 looks for it in Google's
      // index first (seed-blocked-site.qa.ts), and with nothing indexed it stays unreachable.
      check(`${c.name} → ${c.code}; a2-a4 skipped; no model, ${c.searched ? `only the ${c.searched} index searches` : 'no search'}`, ok, `${statusLine(tables)} ${JSON.stringify(result)} ${search.calls.length}`)
      if (c.code === 'site_offsite_redirect') check('…and the other domain was never requested', !net.requests.some((u) => u.includes('elsewhere.net')), net.requests.join(','))
      if (c.code === 'site_blocked' || c.code === 'invalid_site_url') check('…and nothing was requested at all', net.requests.length === 0, net.requests.join(','))
      if (c.dns || c.code === 'invalid_site_url') check('…refused at admission, before a read was even attempted', reads === 0, `${reads} read(s)`)
      if (c.budgets) check('…inside its budget, body included', ms < 1_500, `${ms}ms`)
      if (c.name === 'a server error') check('…and the page\'s text went nowhere', !JSON.stringify(tables).includes(SECRET) && !output.includes(SECRET))
      if (c.dns) dnsOverrides.delete(c.dns[0])
    }
  }

  // ── 7. Resume ─────────────────────────────────────────────────────────────
  console.log('\n7) Resume — each step saved on its own; spend is per run, not per attempt')
  {
    // A worker dies right after a1: the write that starts a2 fails.
    let stepUpdates = 0
    let failOn = 3 // a1 running, a1 done, a2 running ← here
    const hooks = { project_seed_steps: { update: () => (++stepUpdates === failOn ? { code: 'XX000', message: SECRET } : null) } }
    const { tables, admin } = world(projectRow(), {}, hooks)
    const net = new FakeNetwork(heWordPressSite())
    const model = fakeModel({ ok: true, insight: HE_WP_INSIGHT })
    const search = fakeSearch(HE_WP_RESULTS)
    const clk = clock()
    const created = await startRun(admin, { domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', now: clk.now() })
    const first = await run(admin, created, { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: clk.now })
    const requestsAfterA1 = net.requests.length
    check('the first worker stops at a write failure', first.value.outcome === 'stopped' && (first.value as { reason: string }).reason === 'write_failed', JSON.stringify(first.value))
    check('…a1 is saved as done, the rest still pending', statusLine(tables) === 'a1:done a2:pending a3:pending a4:pending', statusLine(tables))
    check('…the lease was handed back at once (resumable now)', runRow(tables).status === 'running' && runRow(tables).lease_expires_at === null)
    check('…no model call was made', model.calls.length === 0)
    failOn = -1
    const resumed = await captureConsole(() => resumeSeedRun({ admin, scope: SCOPE, runId: created.run.id, deps: { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: clk.now } }))
    check('a resumed run continues at a2 and finishes', resumed.value.outcome === 'finished' && statusLine(tables) === 'a1:done a2:done a3:done a4:done', statusLine(tables))
    check('…without reading the site again', net.requests.length === requestsAfterA1, `${requestsAfterA1} → ${net.requests.length}`)
    check('…with one model call and three searches in the whole run', model.calls.length === 1 && search.calls.length === 3)
    check(`…and the failed write's text is nowhere`, !JSON.stringify(tables).includes(SECRET) && !first.output.includes(SECRET) && !resumed.output.includes(SECRET))

    const rewind = (patch: Record<string, Row>) => {
      runRow(tables).status = 'running'
      runRow(tables).lease_expires_at = null
      runRow(tables).finished_at = null
      runRow(tables).error_code = null
      for (const [step, p] of Object.entries(patch)) Object.assign(stepRow(tables, step), { error_code: null, finished_at: null, item_count: null, ...p })
    }
    const insightDetail = stepRow(tables, 'a2').detail as Row
    const a4Detail = stepRow(tables, 'a4').detail as Row

    // Died after asking the model, before its answer was saved.
    rewind({ a2: { status: 'running', detail: { attempted: true } }, a3: { status: 'pending', detail: {} }, a4: { status: 'pending', detail: {} } })
    let calls = model.calls.length
    let searches = search.calls.length
    const r2 = await captureConsole(() => resumeSeedRun({ admin, scope: SCOPE, runId: created.run.id, deps: { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: clk.now } }))
    check('model asked, answer lost → a2 fails model_interrupted; the model is NOT asked again',
      stepRow(tables, 'a2').error_code === 'model_interrupted' && model.calls.length === calls, statusLine(tables))
    check('…a3 still runs, a4 has no keywords, the run is partial',
      stepRow(tables, 'a3').status === 'done' && stepRow(tables, 'a4').error_code === 'no_seed_keywords' && search.calls.length === searches && (r2.value as StageAResult & { status: string }).status === 'partial')

    // Died after the answer was saved, before the settings were written.
    rewind({ a2: { status: 'running', detail: { attempted: true, insight: insightDetail.insight } }, a3: { status: 'pending', detail: {} }, a4: { status: 'pending', detail: {} } })
    tables.project_profiles.length = 0
    calls = model.calls.length
    searches = search.calls.length
    await captureConsole(() => resumeSeedRun({ admin, scope: SCOPE, runId: created.run.id, deps: { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: clk.now } }))
    check('answer saved, settings not written → resumed from the saved answer, no model call',
      stepRow(tables, 'a2').status === 'done' && model.calls.length === calls && tables.project_profiles.length === 1, statusLine(tables))
    check('…and a4 searches normally', search.calls.length === searches + 3)

    // Died after sending the searches, before their answers were saved.
    rewind({ a4: { status: 'running', detail: { attempted: true, queries: a4Detail.queries, market: a4Detail.market } } })
    searches = search.calls.length
    await captureConsole(() => resumeSeedRun({ admin, scope: SCOPE, runId: created.run.id, deps: { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: clk.now } }))
    check('searches sent, answers lost → a4 fails search_interrupted; nothing is searched again',
      stepRow(tables, 'a4').error_code === 'search_interrupted' && search.calls.length === searches, statusLine(tables))

    // Died after the answers were saved.
    rewind({ a4: { status: 'running', detail: { attempted: true, queries: a4Detail.queries, market: a4Detail.market, results: a4Detail.results } } })
    searches = search.calls.length
    await captureConsole(() => resumeSeedRun({ admin, scope: SCOPE, runId: created.run.id, deps: { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: clk.now } }))
    check('answers saved → a4 finishes from them, nothing searched again, competitors not duplicated',
      stepRow(tables, 'a4').status === 'done' && search.calls.length === searches && tables.ai_visibility_competitors.length === 4, `${statusLine(tables)} ${tables.ai_visibility_competitors.length}`)
  }
  {
    // A worker killed while it waits on the model, or on the searches, leaves
    // behind exactly what the rows held at that instant. The spend marks must
    // already be there, or the resumed run pays for the call a second time.
    const { tables, admin } = world(projectRow())
    const clk = clock()
    const net = new FakeNetwork(heWordPressSite())
    let atModel: Tables | null = null
    let atSearch: Tables | null = null
    const model = fakeModel(async () => {
      atModel = structuredClone(tables)
      return { ok: true, insight: HE_WP_INSIGHT }
    })
    const searched = fakeSearch(HE_WP_RESULTS)
    const search: SearchFn = async (query, market) => {
      atSearch ??= structuredClone(tables)
      return searched.fn(query, market)
    }
    const deps: StageADepsInput = { fetchImpl: net.fetch, insight: model.fn, search, now: clk.now }
    const created = await startRun(admin, { domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', now: clk.now() })
    await run(admin, created, deps)
    const detailIn = (t: Tables | null, step: string) => (t?.project_seed_steps.find((s) => s.step === step)?.detail ?? {}) as Row
    check("a2's mark is on its row before the model is asked", detailIn(atModel, 'a2').attempted === true, JSON.stringify(detailIn(atModel, 'a2')))
    check("a4's mark, with its queries, is on its row before the first search",
      detailIn(atSearch, 'a4').attempted === true && Array.isArray(detailIn(atSearch, 'a4').queries), JSON.stringify(detailIn(atSearch, 'a4')))

    // The database as the dead worker left it; its lease then lapses.
    const killedAt = (state: Tables | null) => {
      for (const name of Object.keys(tables)) tables[name].splice(0, tables[name].length, ...structuredClone(state?.[name] ?? []))
      clk.advance(LEASE_MS + 1_000)
    }
    killedAt(atModel)
    const modelCalls = model.calls.length
    await captureConsole(() => resumeSeedRun({ admin, scope: SCOPE, runId: created.run.id, deps }))
    check('killed while the model answers → the resumed run records model_interrupted and does not ask again',
      stepRow(tables, 'a2').error_code === 'model_interrupted' && model.calls.length === modelCalls, `${statusLine(tables)}; model calls ${modelCalls} → ${model.calls.length}`)
    killedAt(atSearch)
    const searchCalls = searched.calls.length
    await captureConsole(() => resumeSeedRun({ admin, scope: SCOPE, runId: created.run.id, deps }))
    check('killed while the searches run → the resumed run records search_interrupted and searches nothing',
      stepRow(tables, 'a4').error_code === 'search_interrupted' && searched.calls.length === searchCalls, `${statusLine(tables)}; searches ${searchCalls} → ${searched.calls.length}`)
  }

  // ── 8. The lease ──────────────────────────────────────────────────────────
  console.log('\n8) The lease — two workers can never work one run')
  {
    const { tables, admin } = world(projectRow())
    const clk = clock()
    const created = await startRun(admin, { domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', now: clk.now() })
    const deps: StageADepsInput = { fetchImpl: new FakeNetwork(heWordPressSite()).fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: fakeSearch(HE_WP_RESULTS).fn, now: clk.now }
    const wrong = await runStageA({ admin, scope: SCOPE, runId: created.run.id, lease: '2000-01-01T00:00:00.000Z', deps })
    check('a worker without the current lease does nothing', wrong.outcome === 'stopped' && statusLine(tables) === 'a1:pending a2:pending a3:pending a4:pending')
    const takeover = await resumeSeedRun({ admin, scope: SCOPE, runId: created.run.id, deps })
    check('a live lease cannot be taken over', takeover.outcome === 'stopped' && (takeover as { reason: string }).reason === 'not_running' && statusLine(tables) === 'a1:pending a2:pending a3:pending a4:pending')
    clk.advance(LEASE_MS + 1_000)
    const [x, y] = await captureConsole(() => Promise.all([
      resumeSeedRun({ admin, scope: SCOPE, runId: created.run.id, deps }),
      resumeSeedRun({ admin, scope: SCOPE, runId: created.run.id, deps }),
    ])).then((r) => r.value)
    const winners = [x, y].filter((r) => r.outcome === 'finished').length
    check('after it lapses, of two simultaneous takeovers exactly one works the run', winners === 1 && statusLine(tables) === 'a1:done a2:done a3:done a4:done', `${JSON.stringify([x, y])}`)
  }
  {
    const { tables, admin } = world(projectRow())
    const created = await startRun(admin, { domain: HE_WP.key, url: 'https://plumber-tlv.co.il/' })
    // While a2 waits on the model, another worker takes the run over.
    const model = fakeModel(async () => {
      runRow(tables).lease_expires_at = '2099-01-01T00:00:00.000Z'
      return { ok: true, insight: HE_WP_INSIGHT }
    })
    const { value: result } = await run(admin, created, { fetchImpl: new FakeNetwork(heWordPressSite()).fetch, insight: model.fn, search: fakeSearch().fn, now: () => NOW })
    check('a worker that lost its lease mid-step stops at its next write', result.outcome === 'stopped' && (result as { reason: string }).reason === 'lease_lost', JSON.stringify(result))
    check('…and writes nothing more: a2 stays unfinished, no settings written', stepRow(tables, 'a2').status === 'running' && tables.project_profiles.length === 0 && runRow(tables).status === 'running')
  }

  // ── 9. Claimed runs ───────────────────────────────────────────────────────
  console.log('\n9) A claimed free check seeds a1-a3 with no fetch and no model call')
  {
    const { tables, admin } = world(projectRow())
    const net = new FakeNetwork(heWordPressSite())
    const model = fakeModel({ ok: true, insight: HE_WP_INSIGHT })
    const search = fakeSearch(HE_WP_RESULTS)
    const created = await startRun(admin, { trigger: 'claim', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', claim: claimedScan() })
    const { value: result } = await run(admin, created, { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: () => NOW })
    const s = summaryOf(tables)
    check('the run is done', result.outcome === 'finished' && result.status === 'done', statusLine(tables))
    check('NO request to the site and NO model call', net.requests.length === 0 && model.calls.length === 0)
    check('a4 still validates competitors: three searches', search.calls.length === 3)
    check('snapshot: source claim, the scan\'s time and URL', s.source === 'claim' && s.scannedAt === '2026-09-27T09:00:00.000Z' && s.url === HE_WP.home)
    check('snapshot: the listed findings plus the count the teaser withheld', s.findings.length === 3 && s.findingsOmitted === 2 && s.counters.fixes === 5)
    check('snapshot: readiness as measured by the free check', s.geo.state === 'measured' && s.geo.passed === 2 && s.geo.total === 4)
    check('settings seeded from the claim (first seed)', tables.projects[0].business_name === 'אינסטלציה מהירה' && tables.project_profiles.length === 1)
    check('competitors: the claim\'s two suggestions validated, plus discoveries',
      s.competitors.map((c) => c.domain).join(',') === 'rival-plumber.co.il,pipes-pro.co.il,easy.co.il,zap.co.il', s.competitors.map((c) => c.domain).join(','))
    // A row recorded before free_site_checks.seed: its public teaser, nothing more.
    const snap = (stepRow(tables, 'a1').detail as Row).claim as Row
    const a2 = stepRow(tables, 'a2').detail as Row
    const a3 = stepRow(tables, 'a3').detail as Row
    check('no seed on the row: the snapshot is the teaser (basis teaser), with no links',
      snap.basis === 'teaser' && Array.isArray(snap.internalLinkUrls) && (snap.internalLinkUrls as unknown[]).length === 0, JSON.stringify({ b: snap.basis, l: snap.internalLinkUrls }))
    check('…a2 has the two competitors shown, a3 the three findings shown and two by count',
      a2.basis === 'teaser' && ((a2.insight as Row).competitors as string[]).join(',') === 'rival-plumber.co.il,pipes-pro.co.il'
      && a3.basis === 'teaser' && a3.findings === 3 && a3.omitted === 2 && stepRow(tables, 'a3').item_count === 5, JSON.stringify({ a2: a2.basis, a3 }))
  }
  {
    const { tables, admin } = world(projectRow())
    const search = fakeSearch(HE_WP_RESULTS)
    const created = await startRun(admin, { trigger: 'claim', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', claim: claimedScan({ business: false }) })
    await run(admin, created, { fetchImpl: new FakeNetwork({}).fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: search.fn, now: () => NOW })
    check('a claim whose free check had no model answer: a2 skipped claim_without_insight, a4 has nothing to search',
      stepRow(tables, 'a2').error_code === 'claim_without_insight' && stepRow(tables, 'a4').error_code === 'no_seed_keywords' && search.calls.length === 0 && runRow(tables).status === 'done', statusLine(tables))
  }
  {
    const { tables, admin } = world(projectRow())
    const created = await startRun(admin, { trigger: 'claim', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/' })
    await run(admin, created, { fetchImpl: new FakeNetwork(heWordPressSite()).fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: fakeSearch().fn, now: () => NOW })
    check('a claim run without its stored scan fails at a1 (claim_payload_missing), fetching nothing', stepRow(tables, 'a1').error_code === 'claim_payload_missing' && runRow(tables).status === 'failed')
  }

  // ── 10. A claim that carries its seed ─────────────────────────────────────
  console.log("\n10) A claimed check that kept its seed (09ee926): every finding, every competitor, the home page's links — still no fetch, no model call")
  // One search shows the leak-detection firm only the seed names (the teaser
  // locks it). a4 keeps a model suggestion seen in one list, but discovers a
  // domain on its own only from two, so the firm is there only from the seed.
  const LEAK_RESULTS: Record<string, string[]> = { ...HE_WP_RESULTS, 'איתור נזילות': [...HE_WP_RESULTS['איתור נזילות'], 'leak-finders.co.il'] }
  const SITE = `https://www.${HE_WP.key}`
  // Longer than the 300 characters the engine's URL admission takes: kept all the same.
  const longSlug = `${SITE}/${encodeURIComponent('מדריך מלא לאיתור נזילות ללא הרס בתל אביב רמת גן גבעתיים וחולון')}`
  {
    const links = [
      `${SITE}/services`,
      `${SITE}/services#faq`,
      'https://plumber-tlv.co.il/contact',
      'https://evil.example.com/steal',
      'https://shop.plumber-tlv.co.il/cart',
      `https://www.${HE_WP.key}:8443/admin`,
      `https://user:pw@www.${HE_WP.key}/x`,
      'javascript:alert(1)',
      'not a url',
      `${SITE}/${'%D7%90'.repeat(400)}`,
      42,
      longSlug,
      `${SITE}/about`,
    ] as unknown as string[]
    const seed = claimSeed({
      internalLinkUrls: links,
      findings: [...claimSeed().findings, { id: 'bogus', severity: 'critical', title: 'x', detail: 'y' } as unknown as FreeCheckSeed['findings'][number]],
    })
    const { tables, admin } = world(projectRow())
    const net = new FakeNetwork(heWordPressSite())
    const model = fakeModel({ ok: true, insight: HE_WP_INSIGHT })
    const search = fakeSearch(LEAK_RESULTS)
    const created = await startRun(admin, { trigger: 'claim', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', claim: claimedScan({ seed }) })
    const { value: result } = await run(admin, created, { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: () => NOW })
    const s = summaryOf(tables)
    const snap = (stepRow(tables, 'a1').detail as Row).claim as Row
    const a2 = stepRow(tables, 'a2').detail as Row
    const a3 = stepRow(tables, 'a3').detail as Row
    const leak = s.competitors.find((c) => c.domain === 'leak-finders.co.il')
    check('the run is done', result.outcome === 'finished' && result.status === 'done', statusLine(tables))
    check('still NO request to the site and NO model call; a4 searches three times', net.requests.length === 0 && model.calls.length === 0 && search.calls.length === 3,
      JSON.stringify({ r: net.requests.length, m: model.calls.length, s: search.calls.length }))
    check('a1 keeps the snapshot of the seed (basis seed)', snap.basis === 'seed', String(snap.basis))
    check('snapshot: EVERY finding, none withheld: the two the teaser locked included, a malformed one dropped',
      s.findings.length === 5 && s.findingsOmitted === 0 && s.counters.fixes === 5 && ['no_canonical', 'no_open_graph'].every((id) => s.findings.some((f) => f.id === id)) && !s.findings.some((f) => f.id === 'bogus'),
      s.findings.map((f) => f.id).join(','))
    check('…in severity order', s.findings.map((f) => f.severity).join(',') === 'blocker,warning,warning,info,info', s.findings.map((f) => f.severity).join(','))
    check('a3 says so: basis seed, five findings, none omitted', a3.basis === 'seed' && a3.findings === 5 && a3.omitted === 0 && stepRow(tables, 'a3').item_count === 5, JSON.stringify(a3))
    check('a2: every competitor the model named, the one the teaser locked included',
      a2.basis === 'seed' && ((a2.insight as Row).competitors as string[]).join(',') === 'rival-plumber.co.il,pipes-pro.co.il,leak-finders.co.il', JSON.stringify((a2.insight as Row).competitors))
    check('a4 validated it against the searches: it stays, as the model\'s, ahead of the discoveries',
      s.competitors.map((c) => c.domain).join(',') === 'rival-plumber.co.il,pipes-pro.co.il,leak-finders.co.il,easy.co.il,zap.co.il' && leak?.source === 'model' && leak?.validated === true,
      s.competitors.map((c) => c.domain).join(','))
    check("the home page's links: this site's pages only (www or not), no fragment, each once, a long Hebrew slug kept",
      JSON.stringify(snap.internalLinkUrls) === JSON.stringify([`${SITE}/services`, 'https://plumber-tlv.co.il/contact', longSlug, `${SITE}/about`]),
      JSON.stringify(snap.internalLinkUrls))
  }
  {
    // The same searches, from a row without its seed: the locked firm is never known.
    const { tables, admin } = world(projectRow())
    const created = await startRun(admin, { trigger: 'claim', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', claim: claimedScan() })
    await run(admin, created, { fetchImpl: new FakeNetwork(heWordPressSite()).fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: fakeSearch(LEAK_RESULTS).fn, now: () => NOW })
    const s = summaryOf(tables)
    check('the same searches from a teaser: the locked competitor never checked, three findings listed and two by count',
      s.competitors.map((c) => c.domain).join(',') === 'rival-plumber.co.il,pipes-pro.co.il,easy.co.il,zap.co.il' && s.findings.length === 3 && s.findingsOmitted === 2,
      s.competitors.map((c) => c.domain).join(','))
  }
  {
    const many = Array.from({ length: MAX_INTERNAL_LINK_URLS + 30 }, (_, i) => `${SITE}/page-${i + 1}`)
    const capped = claimSnapshot(claimedScan({ seed: claimSeed({ internalLinkUrls: many }) }))
    check(`at most ${MAX_INTERNAL_LINK_URLS} links are kept, the first ones`,
      capped.internalLinkUrls.length === MAX_INTERNAL_LINK_URLS && capped.internalLinkUrls[MAX_INTERNAL_LINK_URLS - 1] === `${SITE}/page-${MAX_INTERNAL_LINK_URLS}`, String(capped.internalLinkUrls.length))
    const empty = claimSnapshot(claimedScan({ seed: claimSeed({ findings: [], internalLinkUrls: [] }) }))
    check('a seed with no findings is a clean result, not a teaser: nothing listed, nothing withheld',
      empty.basis === 'seed' && empty.findings.length === 0 && empty.findingsOmitted === 0, JSON.stringify({ b: empty.basis, f: empty.findings.length, o: empty.findingsOmitted }))
    const malformed: unknown[] = [
      { findings: 'all of them', competitors: [], internalLinkUrls: [] },
      { findings: [], competitors: [] },
      { findings: [], competitors: 'x', internalLinkUrls: [] },
      [],
      'seed',
      7,
    ]
    const asTeaser = malformed.map((m) => claimSnapshot(claimedScan({ seed: m as FreeCheckSeed })))
    check('a seed that is not three lists is no seed: the teaser, as before',
      asTeaser.every((x) => x.basis === 'teaser' && x.findings.length === 3 && x.findingsOmitted === 2 && x.competitors.length === 2 && x.internalLinkUrls.length === 0),
      JSON.stringify(asTeaser.map((x) => [x.basis, x.findings.length, x.findingsOmitted])))
    const tampered = readClaimSnapshot({
      claim: { ...claimSnapshot(claimedScan({ seed: claimSeed() })), internalLinkUrls: ['https://evil.example.com/x', `${SITE}/services`, 'javascript:alert(1)'] },
    })
    check('a stored snapshot is read back defensively: its links checked against its site again',
      JSON.stringify(tampered?.internalLinkUrls) === JSON.stringify([`${SITE}/services`]), JSON.stringify(tampered?.internalLinkUrls))
  }
  {
    // A snapshot stored before the seed was read (no basis, no links): a run
    // created before this change and resumed after it reads as the teaser it was.
    const { tables, admin } = world(projectRow())
    const old: Record<string, unknown> = { ...claimSnapshot(claimedScan()) }
    delete old.basis
    delete old.internalLinkUrls
    const created = await createSeedRun(admin, SCOPE, {
      trigger: 'claim',
      stage: 'a',
      summary: initialSummary({ source: 'claim', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', locale: 'he' }),
      stepDetail: { a1: { claim: old } },
      now: NOW,
    })
    if (!created.ok) throw new Error(`createSeedRun: ${created.reason}`)
    await run(admin, created, { fetchImpl: new FakeNetwork({}).fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: fakeSearch(HE_WP_RESULTS).fn, now: () => NOW })
    const snap = (stepRow(tables, 'a1').detail as Row).claim as Row
    const a3 = stepRow(tables, 'a3').detail as Row
    check('a snapshot stored before the seed existed reads as a teaser: no links, two findings by count',
      runRow(tables).status === 'done' && snap.basis === 'teaser' && Array.isArray(snap.internalLinkUrls) && snap.internalLinkUrls.length === 0 && a3.basis === 'teaser' && a3.omitted === 2,
      JSON.stringify({ st: runRow(tables).status, b: snap.basis, a3 }))
  }

  finish()
}

main().catch((err) => {
  console.error('suite crashed', err)
  process.exit(1)
})
export {}
