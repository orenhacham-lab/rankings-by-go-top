/**
 * The report in words: the one-line headline under the month, and the plain-text
 * summary the "copy summary" button puts on the clipboard (to paste into an email
 * or a message to a client). Pure, from the stored report only.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { MonthlyReportData } from '@/lib/reports/monthly/types'
import { count, dayMonth, monthName, monthlyCopy } from './copy'

export function headline(data: MonthlyReportData, l: PublicLocale): string {
  const c = monthlyCopy(l).headlineParts
  const r = data.rankings
  const parts: string[] = []
  if (r.state === 'ready') {
    parts.push(c.firstPage(count(r.firstPageEnd, l)))
    if (r.improvedCount) parts.push(c.improved(count(r.improvedCount, l)))
    if (r.droppedCount) parts.push(c.dropped(count(r.droppedCount, l)))
  }
  if (data.articles.published) parts.push(c.published(count(data.articles.published, l)))
  if (data.gsc.state === 'ready' && data.gsc.current) parts.push(c.clicks(count(data.gsc.current.clicks, l)))
  const moving = r.improvedCount + r.droppedCount + data.articles.published
  if (moving === 0 && !(data.gsc.state === 'ready')) return c.quiet
  return parts.join(' · ')
}

export function plainTextSummary(data: MonthlyReportData, projectLabel: string, l: PublicLocale): string {
  const t = monthlyCopy(l)
  const lines: string[] = [`${projectLabel} · ${monthName(data.month, l)}`, headline(data, l), '']
  const pos = (p: number | null) => (p === null ? t.outside : String(p))
  if (data.rankings.improved.length) {
    lines.push(`${t.improvedTitle}:`)
    for (const m of data.rankings.improved) lines.push(`  ${m.keyword}: ${pos(m.from)} → ${pos(m.to)}`)
    lines.push('')
  }
  if (data.rankings.dropped.length) {
    lines.push(`${t.droppedTitle}:`)
    for (const m of data.rankings.dropped) lines.push(`  ${m.keyword}: ${pos(m.from)} → ${pos(m.to)}`)
    lines.push('')
  }
  if (data.articles.items.length) {
    lines.push(`${t.publishedTitle}:`)
    for (const a of data.articles.items) lines.push(`  ${a.title} (${dayMonth(a.publishedAt, l)})${a.url ? ` ${a.url}` : ''}`)
    lines.push('')
  }
  if (data.ai.state === 'ready') {
    lines.push(`${t.aiTitle}: ${t.aiAnswers} ${count(data.ai.answers, l)} · ${t.aiMentions} ${count(data.ai.mentions, l)} · ${t.aiCitations} ${count(data.ai.citations, l)}`, '')
  }
  const plan = [...data.plan.scheduled, ...data.plan.approvedTopics]
  if (plan.length) {
    lines.push(`${t.planTitle(monthName(data.plan.month, l))}:`)
    for (const p of plan) lines.push(`  ${p.title}${p.at ? ` (${dayMonth(p.at, l)})` : ''}`)
  }
  return lines.join('\n').trim()
}
