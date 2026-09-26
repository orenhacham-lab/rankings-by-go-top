/**
 * One free site check, end to end. The route is a thin shell over this so the
 * whole flow can be exercised without a server: pass injected fetch/insight
 * functions and the run is fully deterministic.
 *
 * Order matters. The deterministic crawl comes first and decides whether there
 * is anything to interpret; the model call is last and optional, so its
 * failure or a spend ceiling never costs the merchant the technical result.
 */
import { fetchBusinessInsight, PUBLIC_COMPETITORS, type InsightResult } from './business-insight'
import { buildFindings, buildGeoSignals, splitFindings } from './findings'
import { extractSiteSignals } from './html-signals'
import { fetchSiteHtml, fetchSiteText } from './site-fetch'
import { domainKey } from './url-guard'
import type { FreeCheckErrorCode, FreeCheckResult } from './types'
import type { Locale } from '@/lib/i18n/locales'

export type RunDeps = {
  fetchHtml?: typeof fetchSiteHtml
  fetchText?: typeof fetchSiteText
  insight?: typeof fetchBusinessInsight
  now?: () => Date
}

export type RunOutcome = { ok: true; result: FreeCheckResult } | { ok: false; code: FreeCheckErrorCode }

export async function runFreeCheck(
  url: URL,
  locale: Locale,
  options: { allowAi: boolean },
  deps: RunDeps = {},
): Promise<RunOutcome> {
  const fetchHtml = deps.fetchHtml ?? fetchSiteHtml
  const fetchText = deps.fetchText ?? fetchSiteText
  const insightFn = deps.insight ?? fetchBusinessInsight
  const now = deps.now ?? (() => new Date())

  const page = await fetchHtml(url)
  if (!page.ok) {
    if (page.reason === 'blocked') return { ok: false, code: 'blocked_url' }
    if (page.reason === 'not_html') return { ok: false, code: 'not_html' }
    return { ok: false, code: 'unreachable' }
  }

  // robots.txt and llms.txt are companions, not prerequisites: a failure to
  // fetch them is reported as "absent", which is what a crawler would conclude.
  const origin = new URL(page.url)
  const [robots, llms] = await Promise.all([
    fetchText(new URL('/robots.txt', origin)),
    fetchText(new URL('/llms.txt', origin)),
  ])
  const robotsTxt = robots.ok && robots.status === 200 ? robots.text : null
  const llmsTxt = llms.ok && llms.status === 200 && llms.text.trim().length > 0

  const signals = extractSiteSignals(page.html, page.url, { robotsTxt, llmsTxt })
  const domain = domainKey(origin)

  const findingsAll = buildFindings(signals, locale)
  const { shown, locked } = splitFindings(findingsAll)
  const geoSignals = buildGeoSignals(signals, locale)
  const geoPassed = geoSignals.filter((s) => s.ok).length

  let insight: InsightResult = { ok: false, reason: 'skipped_cap' }
  if (options.allowAi) insight = await insightFn(signals, locale, domain)

  const competitors = insight.ok ? insight.insight.competitors : []
  const keywords = insight.ok ? insight.insight.keywords : []
  const articles = insight.ok ? insight.insight.articles : []

  return {
    ok: true,
    result: {
      url: page.url,
      domain,
      scannedAt: now().toISOString(),
      locale,
      business: insight.ok ? insight.insight.business : null,
      keywords,
      articles,
      competitors: competitors.slice(0, PUBLIC_COMPETITORS),
      lockedCompetitors: Math.max(0, competitors.length - PUBLIC_COMPETITORS),
      findings: shown,
      lockedFindings: locked,
      geo: { passed: geoPassed, total: geoSignals.length, signals: geoSignals },
      counters: {
        keywords: keywords.length,
        fixes: findingsAll.length,
        geoPassed,
        geoTotal: geoSignals.length,
        articles: articles.length,
      },
      aiUsed: insight.ok,
      cached: false,
    },
  }
}
