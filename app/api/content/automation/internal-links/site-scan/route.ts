/**
 * Content automation — GET /api/content/automation/internal-links/site-scan
 *
 * READ-ONLY WordPress site content/anchor scan (Phase 1, REPORT ONLY). Uses the
 * connected project's saved WordPress credentials + the existing SSRF-guarded
 * client to fetch PUBLISHED posts/pages, extract INTERNAL links/anchors, and
 * return an in-memory report. It writes NOTHING — no article_topics,
 * article_pool_items, generated_articles, brief_notes, anchors_json, or any
 * WordPress content is modified. Purely a diagnostic to review anchor/target
 * quality before we decide to persist or wire it into the planner.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING (default off) + content automation +
 * project ownership. Query params:
 *   - projectId (required)
 *   - includePages = '0' to skip pages (default: include)
 *   - maxItems = combined posts+pages cap (default 200, max 500)
 *   - modifiedAfter = ISO date (incremental)
 *   - format = 'html' for a debug table; pretty = '1' for indented JSON
 */

import { authContentProject, isInternalLinkPlanningEnabled, loadWordPressCredentials } from '@/lib/content/api-auth'
import { scanWordPressSite, type SiteScanReport } from '@/lib/content/wordpress-content-scan'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const includePages = url.searchParams.get('includePages') !== '0'
  const maxItems = Math.min(Math.max(Number(url.searchParams.get('maxItems')) || 200, 1), 500)
  const modifiedAfter = url.searchParams.get('modifiedAfter') || undefined
  const format = url.searchParams.get('format')
  const pretty = url.searchParams.get('pretty') === '1'

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project } = auth

  // Load the saved WordPress credentials (decrypted at call time; never returned).
  const wp = await loadWordPressCredentials(admin, project.id)
  if ('error' in wp) return Response.json({ error: wp.error }, { status: wp.status })

  // Read-only: our own published articles, for target↔generated_article matching.
  const { data: articleRows } = await admin
    .from('generated_articles')
    .select('id, title, wp_post_url')
    .eq('project_id', project.id)
    .not('wp_post_url', 'is', null)
    .limit(500)
  const generatedArticles = ((articleRows ?? []) as { id: string; title: string | null; wp_post_url: string | null }[])
    .filter((r) => r.wp_post_url)
    .map((r) => ({ url: r.wp_post_url as string, id: r.id, title: r.title ?? '' }))

  let report: SiteScanReport
  try {
    report = await scanWordPressSite(wp.creds, { includePages, maxItems, modifiedAfter, generatedArticles })
  } catch (e) {
    console.error('[wp-site-scan] scan failed', { message: e instanceof Error ? e.message : String(e) })
    return Response.json({ error: 'scan_failed' }, { status: 502 })
  }

  const payload = { dryRun: true, projectId: project.id, ...report }

  if (format === 'html') {
    return new Response(renderHtml(payload), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  if (pretty) {
    return new Response(JSON.stringify(payload, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }
  return Response.json(payload)
}

// ── Minimal, safe HTML debug view (all dynamic values escaped) ──
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function renderHtml(r: SiteScanReport & { projectId: string }): string {
  const rj = r.rejectedReasons
  const targetRows = r.targets.map((t) => `
    <tr>
      <td>${esc(t.inboundLinkCount)}</td>
      <td>${esc(t.targetType)}</td>
      <td><a href="${esc(t.targetUrl)}" target="_blank" rel="noopener">${esc(t.targetTitle || t.targetUrl)}</a>${t.matchedGeneratedArticleId ? ' <b>[ours]</b>' : ''}</td>
      <td>${t.anchors.map((a) => `${esc(a.text)} <i>(${a.count})</i>`).join('<br>')}</td>
      <td>${t.exampleSources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>`).join('<br>')}</td>
    </tr>`).join('')
  const sampleRows = r.sampleLinks.map((s) => `
    <tr>
      <td>${esc(s.sourceTitle)}</td>
      <td>${esc(s.anchor)}</td>
      <td><a href="${esc(s.targetUrl)}" target="_blank" rel="noopener">${esc(s.targetUrl)}</a></td>
      <td>${esc(s.context)}</td>
    </tr>`).join('')
  return `<!doctype html><meta charset="utf-8"><title>WP site scan (read-only)</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:start;vertical-align:top;font-size:12px}th{background:#f5f5f5}
.k{display:inline-block;margin:2px 10px 2px 0}.note{color:#a15c00}.err{color:#b00020}code{background:#f2f2f2;padding:1px 4px}</style>
<h2>WordPress site scan — read-only report</h2>
<p><b>Site:</b> <code>${esc(r.siteUrl)}</code> · <b>hosts:</b> ${esc(r.hosts.join(', '))} · <b>truncated:</b> ${esc(r.truncated)} · <b>${esc(r.timingMs)}ms</b></p>
<p>
  <span class="k"><b>posts:</b> ${esc(r.postsFetched)}</span>
  <span class="k"><b>pages:</b> ${esc(r.pagesFetched)}</span>
  <span class="k"><b>items scanned:</b> ${esc(r.itemsScanned)}</span>
  <span class="k"><b>internal links:</b> ${esc(r.internalLinksExtracted)}</span>
  <span class="k"><b>external/rejected:</b> ${esc(r.externalOrRejected)}</span>
  <span class="k"><b>unique targets:</b> ${esc(r.uniqueTargets)}</span>
</p>
<p><b>rejected:</b>
  <span class="k">external ${esc(rj.external)}</span><span class="k">mailto ${esc(rj.mailto)}</span>
  <span class="k">tel ${esc(rj.tel)}</span><span class="k">hash ${esc(rj.hash)}</span>
  <span class="k">javascript ${esc(rj.javascript)}</span><span class="k">empty ${esc(rj.empty)}</span><span class="k">other ${esc(rj.other)}</span>
</p>
${r.notes.map((n) => `<p class="note">ℹ ${esc(n)}</p>`).join('')}
${r.errors.map((e) => `<p class="err">⚠ ${esc(e)}</p>`).join('')}
<h3>Top internal-link targets (${esc(r.targets.length)})</h3>
<table><tr><th>inbound</th><th>type</th><th>target</th><th>top anchors (count)</th><th>example sources</th></tr>${targetRows}</table>
<h3>Sample extracted internal links (${esc(r.sampleLinks.length)})</h3>
<table><tr><th>source</th><th>anchor</th><th>target</th><th>context</th></tr>${sampleRows}</table>`
}
