/**
 * Shared HTML renderer for the WordPress site-scan report (read-only debug view).
 *
 * Extracted verbatim from the live site-scan route so BOTH the live scan and the
 * CACHED index endpoint render identical tables — enabling a like-for-like
 * cached-vs-live visual comparison. Pure string builder, all values escaped.
 */

import type { SiteScanReport } from '@/lib/content/wordpress-content-scan'

export function escHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

/** Optional banner (used by the cached view to show status/staleness). */
export interface ScanReportBanner {
  cached: boolean
  scanStatus?: string
  scannerVersion?: string
  stale?: boolean
  versionStale?: boolean
  scanCompletedAt?: string | null
  expiresAt?: string | null
  errorMessage?: string | null
}

export function renderScanReportHtml(r: SiteScanReport & { projectId: string }, banner?: ScanReportBanner): string {
  const esc = escHtml
  const rj = r.rejectedReasons
  const anchorList = (list: SiteScanReport['targets'][number]['usableAnchors'], cls: string) =>
    list.length
      ? list.map((a) => `<span class="${cls}">${esc(a.text)} <i>(${a.count})</i> <small>${esc(a.reason)}</small></span>`).join('<br>')
      : '<i>—</i>'
  const eligCls = (e: string) => (e === 'yes' ? 'ok' : e === 'caution' ? 'caut' : 'bad')
  const targetRows = r.targets.map((t) => `
    <tr${t.eligibility === 'no' ? ' class="ineligible"' : t.eligibility === 'caution' ? ' class="caution-row"' : ''}>
      <td>${esc(t.inboundLinkCount)}</td>
      <td>${esc(t.targetType)}<br><small>${esc(t.targetRole)}</small></td>
      <td><small>${esc(t.targetPriority)}</small></td>
      <td class="${eligCls(t.eligibility)}"><b>${esc(t.eligibility)}</b><br><small>${esc(t.eligibilityReason)}</small></td>
      <td><a href="${esc(t.targetUrl)}" target="_blank" rel="noopener">${esc(t.targetTitle || t.targetUrl)}</a>${t.matchedGeneratedArticleId ? ' <b>[ours]</b>' : ''}${t.contentSkipped ? ` <b class="warn">[content skipped: ${esc(t.contentSkippedReason || '')}]</b>` : ''}<br><small>${esc(t.targetUrl)}</small></td>
      <td><b>${esc(t.primaryKeywordCandidate || '—')}</b><br><small>${esc(t.keywordSource)}${t.keywordAvailable ? ' (available)' : ' (inferred)'}</small></td>
      <td>${anchorList(t.usableAnchors, 'ok')}<br><small>usable: ${esc(t.usableAnchorsCount)}</small></td>
      <td>${anchorList(t.cautionAnchors, 'caut')}<br><small>caution: ${esc(t.cautionAnchorsCount)}</small></td>
      <td>${anchorList(t.rejectedAnchors, 'bad')}${t.onlyGenericAnchors ? '<br><b class="warn">no usable anchors</b>' : ''}<br><small>rejected: ${esc(t.rejectedAnchorsCount)}</small></td>
      <td>${t.exampleSources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>`).join('<br>')}</td>
    </tr>`).join('')
  const usyCls = (u: string) => (u === 'yes' ? 'ok' : u === 'caution' ? 'caut' : u === 'no' ? 'bad' : '')
  const sampleRows = r.sampleLinks.map((s) => `
    <tr>
      <td class="${s.linkClass === 'internal' ? 'ok' : 'bad'}">${esc(s.linkClass)}</td>
      <td>${esc(s.sourceTitle)}</td>
      <td>${esc(s.anchor)}</td>
      <td class="${usyCls(s.anchorUsability)}">${esc(s.anchorUsability)}${s.anchorReason ? `<br><small>${esc(s.anchorReason)}</small>` : ''}</td>
      <td><a href="${esc(s.targetUrl)}" target="_blank" rel="noopener">${esc(s.targetUrl)}</a></td>
      <td>${esc(s.context)}</td>
    </tr>`).join('')
  const bannerHtml = banner
    ? `<p style="padding:6px 10px;border-radius:6px;background:${banner.stale || banner.versionStale || banner.scanStatus === 'failed' ? '#fff3cd' : '#e7f5ea'}">
        <b>${banner.cached ? 'CACHED index' : 'LIVE scan'}</b>
        · status: <b>${esc(banner.scanStatus)}</b>
        · scanned: ${esc(banner.scanCompletedAt || '—')}
        · expires: ${esc(banner.expiresAt || '—')}
        ${banner.stale ? '· <b class="warn">STALE (past TTL)</b>' : ''}
        ${banner.versionStale ? `· <b class="warn">version mismatch (${esc(banner.scannerVersion)})</b>` : ''}
        ${banner.errorMessage ? `· <b class="err">last refresh failed: ${esc(banner.errorMessage)}</b>` : ''}
      </p>`
    : ''
  return `<!doctype html><meta charset="utf-8"><title>WP site scan (read-only)</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:start;vertical-align:top;font-size:12px}th{background:#f5f5f5}
.k{display:inline-block;margin:2px 10px 2px 0}.note{color:#a15c00}.err{color:#b00020}code{background:#f2f2f2;padding:1px 4px}
.ok{color:#0a7a2f}.caut{color:#8a5a00}.bad{color:#8a6d00}.warn{color:#b00020}small{color:#777}
tr.ineligible{background:#fdeeee}tr.caution-row{background:#fff8e6}</style>
<h2>WordPress site scan — read-only report</h2>
${bannerHtml}
<p><b>Site:</b> <code>${esc(r.siteUrl)}</code> · <b>hosts:</b> ${esc(r.hosts.join(', '))} · <b>truncated:</b> ${esc(r.truncated)} · <b>${esc(r.timingMs)}ms</b></p>
<p>
  <span class="k"><b>posts (meta):</b> ${esc(r.postsMetadataFetched)}</span>
  <span class="k"><b>pages (meta):</b> ${esc(r.pagesMetadataFetched)}</span>
  <span class="k"><b>items scanned:</b> ${esc(r.itemsScanned)}</span>
  <span class="k"><b>internal links:</b> ${esc(r.internalLinksExtracted)}</span>
  <span class="k"><b>external/rejected:</b> ${esc(r.externalOrRejected)}</span>
  <span class="k"><b>unique targets:</b> ${esc(r.uniqueTargets)}</span>
</p>
<p>
  <span class="k"><b>content fetched:</b> ${esc(r.contentItemsFetched)} (posts ${esc(r.postsContentFetched)} / pages ${esc(r.pagesContentFetched)})</span>
  <span class="k"><b>content skipped:</b> ${esc(r.contentItemsSkipped)}</span>
  <span class="k"><b>too-large items:</b> ${esc(r.contentTooLargeCount)}</span>
</p>
<p>
  <span class="k"><b>targets eligible:</b> ${esc(r.targetsEligible)}</span>
  <span class="k"><b>caution:</b> ${esc(r.targetsEligibilityCaution)}</span>
  <span class="k"><b>ineligible:</b> ${esc(r.targetsIneligible)}</span>
  <span class="k"><b>utility/system targets:</b> ${esc(r.utilityTargetsIneligible)}</span>
  <span class="k"><b>targets w/ usable anchors:</b> ${esc(r.targetsWithUsableAnchors)}</span>
  <span class="k"><b>generic-only targets:</b> ${esc(r.targetsGenericOnly)}</span>
  <span class="k"><b>SEO focus keywords found:</b> ${esc(r.seoFocusKeywordsFound)}</span>
</p>
<p><b>rejected links:</b>
  <span class="k">external ${esc(rj.external)}</span><span class="k">mailto ${esc(rj.mailto)}</span>
  <span class="k">tel ${esc(rj.tel)}</span><span class="k">hash ${esc(rj.hash)}</span>
  <span class="k">javascript ${esc(rj.javascript)}</span><span class="k">empty ${esc(rj.empty)}</span>
  <span class="k"><b>add-to-cart/action</b> ${esc(r.ecommerceActionLinksRejected)}</span>
  <span class="k"><b>wp-json/API</b> ${esc(r.wordpressApiUrlsRejected)}</span>
  <span class="k">other ${esc(rj.other)}</span>
</p>
<p><b>anchor noise:</b> <span class="k">product-card noise anchors rejected: ${esc(r.productCardNoiseAnchorsRejected)}</span></p>
${r.notes.map((n) => `<p class="note">ℹ ${esc(n)}</p>`).join('')}
${r.errors.map((e) => `<p class="err">⚠ ${esc(e)}</p>`).join('')}
<h3>Top internal-link targets (${esc(r.targets.length)})</h3>
<table><tr><th>inbound</th><th>type / role</th><th>priority</th><th>target eligible?</th><th>target URL</th><th>keyword candidate (source)</th><th>usable anchors</th><th>caution anchors</th><th>rejected anchors</th><th>example sources</th></tr>${targetRows}</table>
<h3>Sample extracted links (${esc(r.sampleLinks.length)}) — internal + rejected</h3>
<table><tr><th>link class</th><th>source</th><th>anchor</th><th>anchor usable?</th><th>target</th><th>context</th></tr>${sampleRows}</table>`
}
