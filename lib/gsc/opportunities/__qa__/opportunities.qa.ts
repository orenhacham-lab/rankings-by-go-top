/**
 * Stage E2A — deterministic opportunity-intelligence QA (offline, no network/DB).
 * Covers the 20 mandated cases: run selection, run isolation, 28/90 isolation, page
 * classification, utility exclusion, HE/EN intent, non-destructive commercial handling,
 * conservative clustering, one-token/​modifier separation, content matching, project-relative
 * scoring, stable ordering, reason completeness, multi-page-signal labeling, and static
 * route ownership / read-only / zero-recommendation-import / zero-write guards.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildOpportunities } from '../engine'
import { classifyPage, isUtilityUrl } from '../page-classify'
import { classifyIntent } from '../query-intent'
import { clusterQueries } from '../cluster'
import { matchExistingContent } from '../content-match'
import { scoreOpportunity } from '../score'
import { loadOpportunityInputs } from '../load'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import type { GscMetricRow } from '../../summary'
import type { ContentEvidence, OpportunityRunMeta } from '../types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const row = (query: string, page: string, clicks: number, impressions: number, position: number): GscMetricRow =>
  ({ query, page, clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position })
const EMPTY_EVIDENCE: ContentEvidence = { topics: [], articles: [], indexedUrls: [] }
const META: OpportunityRunMeta = { projectId: 'proj-x', windowDays: 28, syncRunId: 'run-1', dateStart: '2026-06-13', dateEnd: '2026-07-10' }

async function main() {
  console.log('GSC Stage E2A — opportunity intelligence')

  // ── (4) page classification ────────────────────────────────────────────────
  check('(4) homepage', classifyPage('https://x.co/') === 'homepage')
  check('(4) product (woo/shopify)', classifyPage('https://x.co/product/abc') === 'product' && classifyPage('https://x.co/products/abc') === 'product')
  check('(4) category/collection', classifyPage('https://x.co/product-category/shoes') === 'category' && classifyPage('https://x.co/collections/all') === 'category')
  check('(4) article/blog (+he)', classifyPage('https://x.co/blog/post') === 'article' && classifyPage('https://x.co/מאמר/נעליים') === 'article')
  check('(4) service (+he)', classifyPage('https://x.co/services/seo') === 'service' && classifyPage('https://x.co/שירות/ייעוץ') === 'service')
  check('(4) unknown', classifyPage('https://x.co/some/deep/thing') === 'unknown')

  // ── (5) utility URL exclusion ───────────────────────────────────────────────
  for (const u of ['/cart', '/checkout', '/my-account', '/login', '/privacy', '/terms', '/thank-you', '/order-received', '/wp-admin/x', '/wp-content/y', '/author/john', '/tag/news', '/?s=shoes'])
    check(`(5) utility: ${u}`, isUtilityUrl(`https://x.co${u}`))
  check('(5) a normal product URL is NOT utility', !isUtilityUrl('https://x.co/product/red-shoes'))
  {
    // A query on a utility page is excluded; a query on an article page is kept.
    const rows = [row('login help', 'https://x.co/login', 2, 400, 5), row('running guide', 'https://x.co/blog/running', 3, 500, 6)]
    const opps = buildOpportunities(rows, EMPTY_EVIDENCE, META)
    check('(5) utility-page cluster excluded from actionable output', opps.some((o) => o.primaryQuery === 'running guide') && !opps.some((o) => o.page.includes('/login')))
  }

  // ── (6)(7)(8) query intent ─────────────────────────────────────────────────
  check('(6) HE informational', classifyIntent('איך לבחור נעליים') === 'informational')
  check('(6) HE product', classifyIntent('לקנות נעליים') === 'product')
  check('(6) HE commercial', classifyIntent('נעליים מחיר') === 'commercial')
  check('(6) HE support', classifyIntent('תמיכה נעליים') === 'support')
  check('(7) EN informational', classifyIntent('how to choose shoes') === 'informational')
  check('(7) EN product', classifyIntent('buy running shoes') === 'product')
  check('(7) EN commercial', classifyIntent('best running shoes review') === 'commercial')
  check('(7) EN support', classifyIntent('shoes warranty repair') === 'support')
  {
    // (8) commercial/product queries are classified but NOT destructively removed.
    const rows = [row('buy running shoes', 'https://x.co/product/shoes', 1, 300, 7)]
    const opps = buildOpportunities(rows, EMPTY_EVIDENCE, META)
    check('(8) product query is classified and retained (not removed)', opps.length === 1 && opps[0].queryIntent === 'product')
  }

  // ── (9)(10)(11) clustering ─────────────────────────────────────────────────
  {
    // (9) word-order / niqqud / punctuation variants merge; primary = highest impressions.
    const c = clusterQueries([{ query: 'מדריך נעליים', impressions: 10 }, { query: 'נעליים, מדריך', impressions: 5 }, { query: 'נעֵלַיים מדריך', impressions: 1 }])
    check('(9) HE variants form ONE cluster', c.length === 1)
    check('(9) primaryQuery is the highest-impression variant', c[0].primaryQuery === 'מדריך נעליים')
    const ce = clusterQueries([{ query: 'running shoes', impressions: 8 }, { query: 'shoes running', impressions: 3 }])
    check('(9) EN reorder merges', ce.length === 1 && ce[0].relatedQueries.length === 1)
  }
  {
    // (10) one shared generic token never merges.
    const c = clusterQueries([{ query: 'coffee maker', impressions: 5 }, { query: 'coffee beans', impressions: 4 }])
    check('(10) one-token overlap does NOT merge', c.length === 2)
  }
  {
    // (11) audience / location / product modifiers stay distinct.
    const audience = clusterQueries([{ query: 'יוגה לנשים', impressions: 5 }, { query: 'יוגה לגברים', impressions: 4 }])
    check('(11) audience modifier keeps clusters distinct (he)', audience.length === 2)
    const location = clusterQueries([{ query: 'plumber tel aviv', impressions: 5 }, { query: 'plumber haifa', impressions: 4 }])
    check('(11) location modifier keeps clusters distinct (en)', location.length === 2)
    const product = clusterQueries([{ query: 'red running shoes', impressions: 5 }, { query: 'blue running shoes', impressions: 4 }])
    check('(11) product modifier keeps clusters distinct', product.length === 2)
    check('(11) order-independent: reversed input → same clusters', clusterQueries([{ query: 'יוגה לגברים', impressions: 4 }, { query: 'יוגה לנשים', impressions: 5 }]).length === 2)
  }

  // ── (12)(13) existing-content matching ─────────────────────────────────────
  {
    const evidence: ContentEvidence = { topics: [{ topic: 'Running shoes guide', primaryKeyword: 'running shoes', secondaryKeywords: [] }], articles: [{ title: 'Best running shoes', slug: 'best-running-shoes', url: 'https://x.co/blog/best-running-shoes' }], indexedUrls: ['https://x.co/blog/running'] }
    // (12) exact normalized URL match → confidence 1.
    const urlMatch = matchExistingContent('https://x.co/blog/best-running-shoes/', 'running shoes', evidence)
    check('(12) exact normalized URL match (trailing slash tolerant)', urlMatch?.matchType === 'url' && urlMatch.confidence === 1)
    const idxMatch = matchExistingContent('http://x.co/blog/running', 'anything here', evidence)
    check('(12) indexed URL match ignores protocol/www', idxMatch?.source === 'indexed_url' && idxMatch.confidence === 1)
    // (13) one generic shared token must NOT produce a match.
    const noMatch = matchExistingContent('https://x.co/other', 'running marathon', { topics: [{ topic: 'Cycling', primaryKeyword: 'road cycling', secondaryKeywords: [] }], articles: [], indexedUrls: [] })
    check('(13) single generic token overlap → no match', noMatch === null)
    // strong (≥2 token) keyword match is accepted.
    const kwMatch = matchExistingContent('https://x.co/other', 'running shoes', { topics: [{ topic: 'T', primaryKeyword: 'running shoes', secondaryKeywords: [] }], articles: [], indexedUrls: [] })
    check('(13b) ≥2 shared meaningful tokens → keyword match', kwMatch?.matchType === 'keyword' && (kwMatch.confidence ?? 0) >= 0.5)
  }

  // ── (14) project-relative scoring ───────────────────────────────────────────
  {
    const input = { impressions: 100, ctr: 0.02, averagePosition: 8, distinctPageCount: 1, contentMatchConfidence: 0 }
    const smallProject = scoreOpportunity(input, { maxImpressions: 100, bandMedianCtr: { none: 0, p1_3: 0, p4_10: 0.05, p11_20: 0, p21_plus: 0 } })
    const bigProject = scoreOpportunity(input, { maxImpressions: 100000, bandMedianCtr: { none: 0, p1_3: 0, p4_10: 0.05, p11_20: 0, p21_plus: 0 } })
    check('(14) same impressions → higher demand in a smaller project', smallProject.components.demandStrength > bigProject.components.demandStrength)
    check('(14) demand is not a fixed global threshold (both non-zero, scaled)', smallProject.components.demandStrength <= 1 && bigProject.components.demandStrength > 0)
    check('(14) score is 0..100', smallProject.score >= 0 && smallProject.score <= 100)
  }

  // ── (15) stable, deterministic ordering ─────────────────────────────────────
  {
    const rows = [
      row('running shoes', 'https://x.co/blog/a', 5, 900, 6),
      row('trail shoes', 'https://x.co/blog/b', 1, 100, 15),
      row('marathon shoes', 'https://x.co/blog/c', 2, 500, 9),
    ]
    const a = buildOpportunities(rows, EMPTY_EVIDENCE, META)
    const b = buildOpportunities(rows.slice().reverse(), EMPTY_EVIDENCE, META)
    check('(15) ordering is input-order-independent', JSON.stringify(a.map((o) => o.id)) === JSON.stringify(b.map((o) => o.id)))
    const sorted = a.every((o, i) => i === 0 || a[i - 1].opportunityScore > o.opportunityScore || (a[i - 1].opportunityScore === o.opportunityScore && (a[i - 1].impressions > o.impressions || (a[i - 1].impressions === o.impressions && a[i - 1].id <= o.id))))
    check('(15) sorted by score DESC, impressions DESC, id ASC', sorted)
    check('(15) ids are stable/deterministic across rebuilds', a[0].id === buildOpportunities(rows, EMPTY_EVIDENCE, META)[0].id)
  }

  // ── (16) reason-code completeness ───────────────────────────────────────────
  {
    const opps = buildOpportunities([row('running shoes', 'https://x.co/blog/a', 2, 800, 8)], EMPTY_EVIDENCE, META)
    const o = opps[0]
    const codes = o.reasons.map((r) => r.code)
    check('(16) every opportunity carries reasons', o.reasons.length >= 2)
    check('(16) demand reason present', codes.includes('high_demand') || codes.includes('low_demand'))
    check('(16) position reason present', codes.some((c) => ['striking_distance_position', 'already_ranking_well', 'far_position'].includes(c)))
    check('(16) content-match reason present', codes.includes('has_existing_content_match') || codes.includes('no_close_content_match'))
    check('(16) each reason has code + non-empty detail', o.reasons.every((r) => !!r.code && !!r.detail))
    check('(16) score components are exposed', typeof o.scoreComponents.demandStrength === 'number' && typeof o.scoreComponents.positionOpportunity === 'number')
  }

  // ── (17) multi-page signal is a signal, never confirmed cannibalization ─────
  {
    const rows = [row('running shoes', 'https://x.co/blog/a', 3, 600, 7), row('running shoes', 'https://x.co/blog/b', 1, 400, 12)]
    const opps = buildOpportunities(rows, EMPTY_EVIDENCE, META)
    const mp = opps.find((o) => o.distinctPageCount > 1)
    const PRIMARY = ['improve_existing_page', 'improve_title_meta_ctr', 'supporting_content_candidate', 'internal_link_support_candidate']
    check('(17) a query on 2 pages → multi_page is a SIGNAL with a PRIMARY actionable type', !!mp && mp.signals.includes('multi_page_signal') && PRIMARY.includes(mp.opportunityType) && mp.distinctPageCount === 2)
    // Any mention of cannibalization must be NEGATED ("not confirmed cannibalization"); never asserted as confirmed.
    const unnegated = opps.some((o) => /confirmed cannibaliz/i.test(JSON.stringify(o.reasons).replace(/not confirmed cannibaliz/gi, 'X')))
    const typeMentionsCannibalization = opps.some((o) => /cannibaliz/i.test(o.opportunityType))
    check('(17) never labeled "confirmed cannibalization"', !unnegated && !typeMentionsCannibalization)
    check('(17) multi-page reason states signal-only', !!mp && mp.reasons.some((r) => r.code === 'multi_page_signal' && /not confirmed cannibalization/i.test(r.detail)))
  }

  // ── (1)(2)(3) run selection / no mixing / 28-90 isolation (loader) ──────────
  {
    const tables = {
      gsc_sync_runs: [
        { id: 'run-old', project_id: 'p', window_days: 28, status: 'succeeded', started_at: '2026-07-01T00:00:00Z', start_date: '2026-06-04', end_date: '2026-07-01' },
        { id: 'run-new', project_id: 'p', window_days: 28, status: 'succeeded', started_at: '2026-07-10T00:00:00Z', start_date: '2026-06-13', end_date: '2026-07-10' },
        { id: 'run-fail', project_id: 'p', window_days: 28, status: 'failed', started_at: '2026-07-11T00:00:00Z', start_date: null, end_date: null },
        { id: 'run-running', project_id: 'p', window_days: 28, status: 'running', started_at: '2026-07-12T00:00:00Z', start_date: null, end_date: null },
        { id: 'run-90', project_id: 'p', window_days: 90, status: 'succeeded', started_at: '2026-07-09T00:00:00Z', start_date: '2026-04-11', end_date: '2026-07-09' },
      ],
      gsc_query_page_metrics: [
        { sync_run_id: 'run-new', project_id: 'p', query: 'new q', page: 'https://x.co/blog/n', clicks: 1, impressions: 100, ctr: 0.01, position: 8 },
        { sync_run_id: 'run-old', project_id: 'p', query: 'old q', page: 'https://x.co/blog/o', clicks: 9, impressions: 999, ctr: 0.009, position: 5 },
        { sync_run_id: 'run-90', project_id: 'p', query: 'ninety q', page: 'https://x.co/blog/ninety', clicks: 2, impressions: 200, ctr: 0.01, position: 6 },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = new FakeAdmin(tables) as any
    const r28 = await loadOpportunityInputs(admin, 'p', 28)
    check('(1) latest SUCCEEDED run selected (not failed/running, not older)', r28.state === 'ok' && r28.runMeta.syncRunId === 'run-new')
    check('(2) rows come ONLY from the selected run (no mixing)', r28.state === 'ok' && r28.rows.every((x) => x.query === 'new q') && r28.rows.length === 1)
    const r90 = await loadOpportunityInputs(admin, 'p', 90)
    check('(3) 28/90 isolation — 90 selects its own run + rows', r90.state === 'ok' && r90.runMeta.syncRunId === 'run-90' && r90.rows.every((x) => x.query === 'ninety q'))
    // never_synced when no succeeded run exists for a window.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emptyAdmin = new FakeAdmin({ gsc_sync_runs: [{ id: 'r', project_id: 'p', window_days: 28, status: 'failed', started_at: '2026-07-01T00:00:00Z' }] }) as any
    const ns = await loadOpportunityInputs(emptyAdmin, 'p', 28)
    check('(1b) no succeeded run → never_synced', ns.state === 'never_synced')
  }

  // ── (18)(19)(20) route ownership / read-only / isolation (static guards) ────
  {
    const route = read('app/api/gsc/opportunities/route.ts')
    check('(18) route authorizes the project owner (authContentProject)', /authContentProject\(/.test(route))
    check('(18) route is gated by the authoritative GSC flag (404 when off)', /isGscReadOnlyEnabled\(\)/.test(route) && /status: 404/.test(route))
    check('(18) route validates window 28|90', /windowDays !== 28 && windowDays !== 90/.test(route))
    check('(20) route performs NO writes', !/\.(insert|update|upsert|delete|rpc)\(/.test(route))
    const load = read('lib/gsc/opportunities/load.ts')
    check('(20) loader performs NO writes', !/\.(insert|update|upsert|delete|rpc)\(/.test(load))

    // (19) zero IMPORTS from the recommendation engine anywhere in the module (import lines only,
    // not prose in comments). Match actual `import … from '…'` / `from '…'` statements.
    const importLines = (src: string) => src.split('\n').filter((l) => /^\s*(import\b|export\b.*\bfrom\b)/.test(l) || /\bfrom ['"]/.test(l))
    const moduleFiles = ['engine', 'score', 'cluster', 'content-match', 'page-classify', 'query-intent', 'normalize', 'types', 'load', 'index']
      .map((f) => read(`lib/gsc/opportunities/${f}.ts`))
    check('(19) no import of the recommendation engine', moduleFiles.every((s) => importLines(s).every((l) => !/recommendation/i.test(l))))
    check('(19) engine core does not import lib/content', ['engine', 'score', 'cluster', 'content-match', 'page-classify', 'query-intent', 'normalize', 'types'].map((f) => read(`lib/gsc/opportunities/${f}.ts`)).every((s) => importLines(s).every((l) => !/@\/lib\/content/.test(l))))
  }

  // ── FIX 1: intent guides opportunity type (no match) ───────────────────────
  {
    const onePage = (query: string, page: string) => buildOpportunities([row(query, page, 1, 500, 8)], EMPTY_EVIDENCE, META)[0]
    check('F1(1) informational + no match → supporting_content_candidate', onePage('how to choose shoes', 'https://x.co/blog/a').opportunityType === 'supporting_content_candidate')
    check('F1(2) product + no match → NOT supporting_content_candidate', onePage('buy running shoes', 'https://x.co/product/s').opportunityType !== 'supporting_content_candidate')
    check('F1(3) commercial + no match → NOT supporting_content_candidate', onePage('best running shoes review', 'https://x.co/blog/a').opportunityType !== 'supporting_content_candidate')
    check('F1(4) branded_or_service + no match → NOT supporting_content_candidate', onePage('plumber near me', 'https://x.co/blog/a').opportunityType !== 'supporting_content_candidate')
    check('F1(5) support + no match → NOT supporting_content_candidate', onePage('shoes warranty repair', 'https://x.co/blog/a').opportunityType !== 'supporting_content_candidate')
    // non-supporting intents get improve_existing_page + an explainable reason.
    const prod = onePage('buy running shoes', 'https://x.co/product/s')
    check('F1 product → improve_existing_page + intent_prefers_existing_page reason', prod.opportunityType === 'improve_existing_page' && prod.reasons.some((r) => r.code === 'intent_prefers_existing_page'))
    check('F1 informational reason is intent_supports_new_content', onePage('how to choose shoes', 'https://x.co/blog/a').reasons.some((r) => r.code === 'intent_supports_new_content'))
    // (6) CTR opportunity works with NO separate content evidence (ranking page IS existing).
    const ctrRows = [row('alpha widget', 'https://x.co/blog/a', 1, 1000, 8), row('beta gadget', 'https://x.co/blog/b', 100, 1000, 8)]
    const ctrOpps = buildOpportunities(ctrRows, EMPTY_EVIDENCE, META)
    const low = ctrOpps.find((o) => o.primaryQuery === 'alpha widget')!
    check('F1(6) CTR gap on ranking page → improve_title_meta_ctr without content evidence', low.opportunityType === 'improve_title_meta_ctr' && low.existingContentMatch === null && low.reasons.some((r) => r.code === 'ctr_opportunity_on_ranking_page'))
    // (7) intent never removes an opportunity — every intent still yields exactly one.
    const intents = ['how to run', 'buy shoes', 'best shoes review', 'plumber near me', 'shoes warranty', 'zzqq unknownterm']
    check('F1(7) intent never removes an opportunity', intents.every((q) => buildOpportunities([row(q, 'https://x.co/blog/a', 1, 300, 9)], EMPTY_EVIDENCE, META).length === 1))
  }

  // ── FIX 2: content-evidence reads fail closed ──────────────────────────────
  {
    const base = () => ({
      gsc_sync_runs: [{ id: 'r1', project_id: 'p', window_days: 28, status: 'succeeded', started_at: '2026-07-10T00:00:00Z', start_date: '2026-06-13', end_date: '2026-07-10' }],
      gsc_query_page_metrics: [{ sync_run_id: 'r1', project_id: 'p', query: 'q', page: 'https://x.co/blog/a', clicks: 1, impressions: 100, ctr: 0.01, position: 8 }],
    })
    const expectLoadCode = async (hooks: Record<string, { select?: () => { message: string } }>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = new FakeAdmin(base(), hooks) as any
      try { await loadOpportunityInputs(admin, 'p', 28); return null } catch (e) { return (e as { code?: string }).code ?? null }
    }
    check('F2(8) topics read failure → topics_read_failed', (await expectLoadCode({ article_topics: { select: () => ({ message: 'db down' }) } })) === 'topics_read_failed')
    check('F2(8) articles read failure → articles_read_failed', (await expectLoadCode({ generated_articles: { select: () => ({ message: 'db down' }) } })) === 'articles_read_failed')
    check('F2(8) content index read failure → content_index_read_failed', (await expectLoadCode({ wordpress_content_index: { select: () => ({ message: 'db down' }) } })) === 'content_index_read_failed')
    // (9) an evidence read failure THROWS (never returns a fabricated no-match result).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = new FakeAdmin(base(), { article_topics: { select: () => ({ message: 'db down' }) } }) as any
    let threw = false
    try { await loadOpportunityInputs(admin, 'p', 28) } catch { threw = true }
    check('F2(9) evidence failure never becomes no_close_content_match', threw)
  }

  // ── FIX 3: opportunity id is stable across re-syncs, isolated by project/window ─
  {
    const rows = [row('running shoes', 'https://x.co/blog/a', 2, 500, 8)]
    const idFor = (m: Partial<OpportunityRunMeta>) => buildOpportunities(rows, EMPTY_EVIDENCE, { ...META, ...m })[0].id
    const base = idFor({ syncRunId: 'run-1' })
    check('F3(10) same project/window/cluster/page, different syncRunId → SAME id', base === idFor({ syncRunId: 'run-2' }))
    check('F3(10) syncRunId still returned for traceability', buildOpportunities(rows, EMPTY_EVIDENCE, { ...META, syncRunId: 'run-9' })[0].syncRunId === 'run-9')
    check('F3(11) different project → different id', base !== idFor({ projectId: 'other-project' }))
    check('F3(11) different window → different id', base !== idFor({ windowDays: 90 }))
    const diffPage = buildOpportunities([row('running shoes', 'https://x.co/blog/OTHER', 2, 500, 8)], EMPTY_EVIDENCE, META)[0].id
    check('F3(11) different page → different id', base !== diffPage)
    const diffCluster = buildOpportunities([row('trail sandals', 'https://x.co/blog/a', 2, 500, 8)], EMPTY_EVIDENCE, META)[0].id
    check('F3(11) different cluster → different id', base !== diffCluster)
  }

  // ── FIX 4: mounted inside ContentHub, not the project page; still read-only ─
  {
    const hub = read('components/content/ContentHub.tsx')
    check('F4(12) GscOpportunities imported into ContentHub', /import GscOpportunities from '@\/components\/content\/GscOpportunities'/.test(hub))
    check('F4(12) rendered under the gscIdeas tab', /activeTab === 'gscIdeas'/.test(hub) && /<GscOpportunities projectId=\{projectId\}/.test(hub))
    check('F4(12) tab gated by the GSC client flag', /NEXT_PUBLIC_GSC_READ_ONLY_ENABLED === 'true'[\s\S]{0,400}setActiveTab\('gscIdeas'\)/.test(hub))
    const projectPage = read('app/(dashboard)/projects/[id]/page.tsx')
    check('F4(13) NOT mounted on the project page anymore', !/GscOpportunities/.test(projectPage))
    check('F4(13) Stage E1 GscPanel is untouched on the project page', /<GscPanel projectId=\{id\}/.test(projectPage))
    // (14) no Stage E2B actions / no writes in the UI. Strip comments first so descriptive
    // prose (e.g. "never creates/approves/publishes") doesn't trip the guard.
    const ui = read('components/content/GscOpportunities.tsx')
    const uiCode = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    check('F4(14) UI performs no mutating fetches', !/method:\s*'(POST|PUT|DELETE|PATCH)'/.test(uiCode))
    check('F4(14) UI has no create/approve/reject/queue/generate/publish actions', !/(createTopic|handleApprove|handleReject|addToQueue|generateArticle|handlePublish|markIrrelevant)/i.test(uiCode))
  }

  // ── LIVE FIX 1: multi-page is a secondary SIGNAL, never the primary type ────
  {
    const PRIMARY = ['improve_existing_page', 'improve_title_meta_ctr', 'supporting_content_candidate', 'internal_link_support_candidate']
    // informational + no match + 6 pages → supporting_content_candidate + signal.
    const infoRows = Array.from({ length: 6 }, (_, i) => row('how to choose running shoes', `https://x.co/blog/p${i}`, 1, 100, 8))
    const info = buildOpportunities(infoRows, EMPTY_EVIDENCE, META).find((o) => o.distinctPageCount > 1)!
    check('LF1(1) multi-page never becomes the primary type', PRIMARY.includes(info.opportunityType))
    check('LF1(2) informational + multi-page → supporting_content_candidate', info.opportunityType === 'supporting_content_candidate' && info.signals.includes('multi_page_signal') && info.distinctPageCount === 6)
    // commercial + no match + 5 pages → improve_existing_page + signal.
    const commRows = Array.from({ length: 5 }, (_, i) => row('best running shoes review', `https://x.co/blog/c${i}`, 1, 100, 8))
    const comm = buildOpportunities(commRows, EMPTY_EVIDENCE, META).find((o) => o.distinctPageCount > 1)!
    check('LF1(3) commercial + multi-page → improve_existing_page', comm.opportunityType === 'improve_existing_page' && comm.signals.includes('multi_page_signal'))
    // CTR opportunity + 2 pages → improve_title_meta_ctr + signal (two clusters give a band median).
    const ctrRows = [row('gamma widget', 'https://x.co/blog/g1', 1, 1000, 8), row('gamma widget', 'https://x.co/blog/g2', 0, 800, 8), row('delta gadget', 'https://x.co/blog/d', 300, 1000, 8)]
    const ctr = buildOpportunities(ctrRows, EMPTY_EVIDENCE, META).find((o) => o.primaryQuery === 'gamma widget')!
    check('LF1(4) CTR + multi-page → improve_title_meta_ctr', ctr.opportunityType === 'improve_title_meta_ctr' && ctr.signals.includes('multi_page_signal') && ctr.distinctPageCount === 2)
    check('LF1(5) multi-page signal present in signals[]', info.signals.includes('multi_page_signal') && comm.signals.includes('multi_page_signal') && ctr.signals.includes('multi_page_signal'))
    check('LF1(5b) multi_page_signal reason retained (not confirmed cannibalization)', info.reasons.some((r) => r.code === 'multi_page_signal' && /not confirmed cannibalization/i.test(r.detail)))
    check('LF1(5c) distinctPageSignal score component retained', typeof info.scoreComponents.distinctPageSignal === 'number' && info.scoreComponents.distinctPageSignal > 0)
  }

  // ── LIVE FIX 1: route filtering + counting by signal (static contract) ─────
  {
    const route = read('app/api/gsc/opportunities/route.ts')
    check('LF1(6) route filters type=multi_page_signal by signals[]', /typeFilter === 'multi_page_signal'[\s\S]{0,120}signals\.includes\('multi_page_signal'\)/.test(route))
    check('LF1(7) route counts multi_page_signal over signal-bearing opportunities', /for \(const s of o\.signals\) typeCounts\[s\]/.test(route))
    check('LF1(6b) multi_page_signal remains a valid filter value', /VALID_FILTERS[\s\S]{0,160}'multi_page_signal'/.test(route))
    const ui = read('components/content/GscOpportunities.tsx')
    check('LF1(8) card renders primary type badge AND secondary multi-page badge', /typeLabel\(o\.opportunityType\)/.test(ui) && /o\.signals\.includes\('multi_page_signal'\)[\s\S]{0,160}typeLabel\('multi_page_signal'\)/.test(ui))
    check('LF1 the multi-page chip is preserved', /allTypes[\s\S]{0,200}'multi_page_signal'/.test(ui))
  }

  // ── LIVE FIX 2: actionable empty-state CTAs (project page only) ─────────────
  {
    const ui = read('components/content/GscOpportunities.tsx')
    check('LF2(9) not_connected shows a project-page CTA', /not_connected[\s\S]{0,120}ctaFor\('not_connected'\)/.test(ui) && /t\.ctaConnect/.test(ui))
    check('LF2(10) no_property shows a project-page CTA', /no_property[\s\S]{0,120}ctaFor\('no_property'\)/.test(ui) && /t\.ctaSelectProperty/.test(ui))
    check('LF2(11) never_synced shows a project-page CTA', /never_synced[\s\S]{0,120}ctaFor\('never_synced'\)/.test(ui) && /t\.ctaSync/.test(ui))
    check('LF2 CTA links to the project GSC section preserving project', /\/projects\/\$\{projectId\}#gsc-section/.test(ui))
    check('LF2(12) NO OAuth/connect implementation duplicated in Content Hub', !/api\/gsc\/connect|buildAuthUrl|oauth|access_type|listSites/i.test(ui) && !/api\/gsc\/property/.test(ui))
  }

  // ── LIVE FIX 3: URL display + hidden unknown badges (static contract) ───────
  {
    const ui = read('components/content/GscOpportunities.tsx')
    check('LF3(13) encoded URLs decoded for display (decodeURI in try/catch)', /function safeDecodeUrl[\s\S]{0,120}decodeURI\(u\)[\s\S]{0,60}catch/.test(ui))
    check('LF3(13b) page rendered as an external link with decoded text', /<a href=\{o\.page\}[\s\S]{0,140}safeDecodeUrl\(o\.page\)/.test(ui))
    check('LF3(14) raw URL remains the href (o.page, not decoded)', /href=\{o\.page\}/.test(ui) && /target="_blank" rel="noopener noreferrer"/.test(ui))
    check('LF3(15) unknown intent badge hidden', /o\.queryIntent !== 'unknown' &&/.test(ui))
    check('LF3(15) unknown pageType badge hidden', /o\.pageType !== 'unknown' &&/.test(ui))
    check('LF3(16) no action/create/queue/generate/publish control added', (() => { const c = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); return !/method:\s*'(POST|PUT|DELETE|PATCH)'/.test(c) && !/(createTopic|handleApprove|handleReject|addToQueue|generateArticle|handlePublish|markIrrelevant)/i.test(c) })())
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
