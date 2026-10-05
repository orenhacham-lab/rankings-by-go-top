/**
 * THE MONTHLY REPORT AS A PAGE A CUSTOMER CAN DOWNLOAD.
 *
 * Asked for by the owner (4 October 2026: "can the monthly report be
 * downloadable?"), who also asked whether it carries the Search Console
 * figures. The screen's report does; the older downloadable report
 * (/api/reports/export-pdf, lib/export/pdf.ts) is the ranking report and has no
 * Search Console section at all. So this renders THE MONTHLY REPORT, Search
 * Console included.
 *
 * It is built from the SAME stored snapshot and the SAME dictionary the screen
 * renders (components/reports/monthly/copy.ts), so the download cannot say
 * something the screen does not: no second set of words, no recomputed figures.
 * Pure — the snapshot in, HTML out — so the QA suite renders it without a
 * browser or a provider.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { MonthlyReportData, KeywordMove, PublishedArticle, PlannedItem } from './types'
import { count, dayMonth, decimal, monthName, monthlyCopy, monthOnly } from '@/components/reports/monthly/copy'
import { REPORT_SITE_ICON_CSS, reportSiteIconImg } from '@/lib/reports/report-site-icon'

export interface MonthlyReportPdfInput {
  data: MonthlyReportData
  projectLabel: string
  generatedAt: string
  generatedBy: 'cron' | 'owner'
  language: PublicLocale
  /** The site's icon from the scan, already checked (lib/reports/report-site-icon.ts). */
  siteIcon?: string | null
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** The file name the browser saves it as. ASCII only: a header is not UTF-8. */
export function monthlyReportFileName(month: string): string {
  return `monthly-report-${month.replace(/[^0-9-]/g, '')}.pdf`
}

const esc = escapeHtml

function moveRow(m: KeywordMove, outside: string, mapsTag: string): string {
  const pos = (n: number | null) => (n === null ? esc(outside) : String(n))
  const engine = m.engine && m.engine !== 'google' ? ` <span class="tag">${esc(mapsTag)}</span>` : ''
  const sign = m.change > 0 ? '+' : ''
  return `<tr><td dir="ltr" class="kw">${esc(m.keyword)}${engine}</td><td>${pos(m.from)}</td><td>${pos(m.to)}</td>`
    + `<td class="${m.change > 0 ? 'up' : m.change < 0 ? 'down' : ''}">${sign}${m.change}</td></tr>`
}

export function generateMonthlyReportHTML(input: MonthlyReportPdfInput): string {
  const { data, projectLabel, generatedAt, generatedBy, language: l } = input
  const t = monthlyCopy(l)
  const rtl = l === 'he'
  const r = data.rankings
  const month = monthName(data.month, l)
  const gsc = data.gsc.state === 'ready' && data.gsc.current ? data.gsc : null

  const section = (title: string, body: string, sub?: string) =>
    `<section><h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}${body}</section>`

  const note = (s: string) => `<p class="note">${esc(s)}</p>`

  const figure = (label: string, value: string, src: string) =>
    `<div class="fig"><span class="label">${esc(label)}</span><strong>${esc(value)}</strong><span class="src">${esc(src)}</span></div>`

  const movesTable = (moves: KeywordMove[]) => moves.length === 0 ? '' : `<table>
    <thead><tr><th>${esc(t.movesSub)}</th><th>&larr;</th><th>&rarr;</th><th>+/−</th></tr></thead>
    <tbody>${moves.map((m) => moveRow(m, t.outside, t.mapsTag)).join('')}</tbody></table>`

  const articleList = (items: PublishedArticle[]) => `<ul>${items.map((a) =>
    `<li>${esc(a.title)} <span class="src">${esc(t.channel[a.channel])} · ${esc(dayMonth(a.publishedAt, l))}</span></li>`).join('')}</ul>`

  const plannedList = (items: PlannedItem[]) => `<ul>${items.map((p) =>
    `<li>${esc(p.title)}${p.at ? ` <span class="src">${esc(dayMonth(p.at, l))}</span>` : ''}</li>`).join('')}</ul>`

  const rankings = r.state === 'no_keywords' ? note(t.noKeywords)
    : r.state === 'no_checks' ? note(t.noChecks)
      : `${r.improved.length ? section(t.improvedTitle, movesTable(r.improved)) : note(t.noneImproved(count(r.steadyCount, l)))}
         ${r.dropped.length ? section(t.droppedTitle, movesTable(r.dropped)) : note(t.noneDropped)}`

  const ai = data.ai.state === 'no_checks' ? note(t.aiNone) : `<div class="figs">
      ${figure(t.aiAnswers, count(data.ai.answers, l), '')}
      ${figure(t.aiMentions, count(data.ai.mentions, l), data.ai.mentionRate !== null ? `${decimal(data.ai.mentionRate, l)}%` : '')}
      ${figure(t.aiCitations, count(data.ai.citations, l), '')}
    </div>`

  const gscBody = data.gsc.state === 'not_connected' ? note(t.gscNotConnected)
    : !gsc ? note(t.gscNoData)
      : `<div class="figs">
          ${figure(t.gscClicks, count(gsc.current!.clicks, l), t.gscWindow(dayMonth(gsc.current!.startDate, l), dayMonth(gsc.current!.endDate, l)))}
          ${figure(t.gscImpressions, count(gsc.current!.impressions, l), '')}
        </div>${gsc.previous
  ? `<p class="sub">${esc(t.gscVsPrevious(dayMonth(gsc.previous.startDate, l), dayMonth(gsc.previous.endDate, l)))}: `
          + `${esc(t.gscClicks)} ${esc(count(gsc.previous.clicks, l))}, ${esc(t.gscImpressions)} ${esc(count(gsc.previous.impressions, l))}</p>`
  : ''}`

  const plan = data.plan.state === 'empty' ? note(t.planEmpty) : [
    data.plan.scheduled.length ? section(t.planScheduled, plannedList(data.plan.scheduled)) : '',
    data.plan.queuedCount ? note(t.planQueued(count(data.plan.queuedCount, l))) : '',
    data.plan.readyCount ? note(t.planReady(count(data.plan.readyCount, l))) : '',
    data.plan.approvedTopics.length ? section(t.planApproved, plannedList(data.plan.approvedTopics)) : '',
    data.plan.ideas.length ? section(t.planIdeas, plannedList(data.plan.ideas)) : '',
  ].join('')

  return `<!DOCTYPE html>
<html dir="${rtl ? 'rtl' : 'ltr'}" lang="${esc(l)}">
<head>
<meta charset="UTF-8">
<title>${esc(`${t.teaser.title} · ${projectLabel} · ${month}`)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${rtl ? "'Segoe UI', Arial" : "'Segoe UI', Helvetica, Arial"}, sans-serif; color: #111827; font-size: 12px; line-height: 1.55; padding: 28px 32px; }
  header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-size: 22px; }
  .meta { color: #6b7280; font-size: 11px; margin-top: 4px; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  section { break-inside: avoid; }
  .sub, .src { color: #6b7280; font-size: 10.5px; }
  .note { color: #374151; max-width: 60em; margin: 4px 0 8px; }
  .figs { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0 4px; }
  .fig { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; min-width: 120px; }
  .fig .label { display: block; color: #6b7280; font-size: 10.5px; }
  .fig strong { display: block; font-size: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 5px 6px; text-align: ${rtl ? 'right' : 'left'}; }
  th { color: #6b7280; font-size: 10.5px; font-weight: 600; }
  td.kw { width: 55%; }
  .up { color: #16a34a; font-weight: 700; }
  .down { color: #dc2626; font-weight: 700; }
  .tag { color: #6b7280; font-size: 10px; }
  ul { margin: 4px 0 10px; padding-${rtl ? 'right' : 'left'}: 16px; }
  li { margin-bottom: 3px; }
  ${REPORT_SITE_ICON_CSS}
</style>
</head>
<body>
<header>
  <h1>${reportSiteIconImg(input.siteIcon, esc)}${esc(`${projectLabel} · ${month}`)}</h1>
  <p class="meta">${esc(generatedBy === 'owner' ? t.generatedOwner(dayMonth(generatedAt, l)) : t.generatedAuto(dayMonth(generatedAt, l)))}${
  data.coversFrom ? ` · ${esc(t.coversFrom(dayMonth(data.coversFrom, l)))}` : ''}</p>
</header>
<div class="figs">
  ${figure(t.tiles.firstPage, r.state === 'ready' ? count(r.firstPageEnd, l) : '—', r.state === 'ready' ? t.tiles.firstPageSource : t.tiles.noChecks)}
  ${figure(t.tiles.improved, r.state === 'ready' ? count(r.improvedCount, l) : '—', r.state === 'ready' ? t.tiles.improvedSource(count(r.steadyCount, l)) : t.tiles.noChecks)}
  ${figure(t.tiles.published, count(data.articles.published, l), t.tiles.publishedSource)}
  ${figure(t.tiles.clicks, gsc ? count(gsc.current!.clicks, l) : '—', gsc ? t.tiles.clicksSource(dayMonth(gsc.current!.startDate, l), dayMonth(gsc.current!.endDate, l)) : t.tiles.clicksMissing)}
</div>
${rankings}
${section(t.publishedTitle, data.articles.state === 'none' ? note(t.publishedNone(monthOnly(data.month, l))) : articleList(data.articles.items))}
${section(t.aiTitle, ai)}
${section(t.gscTitle, gscBody)}
${section(t.planTitle(monthOnly(data.plan.month, l)), plan, t.planSub)}
</body>
</html>`
}
