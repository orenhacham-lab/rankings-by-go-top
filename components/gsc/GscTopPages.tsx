'use client'

/**
 * The five pages Google sends the most clicks to, over the last 28 days.
 *
 * Summed per page from the latest 28-day sync's rows. A bar per page shows how the
 * clicks split between them, and every bar carries its number in words, so nothing is
 * read from the bar alone. Without Search Console the card keeps its title and says
 * what it will show, with the one step that is missing. With Search Console switched
 * off on the server there is no step to offer, and no card.
 */
import { Card } from '@/components/ui/Card'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { isGscSetupState } from '@/lib/gsc/widget-state'
import type { TopPage } from '@/lib/gsc/tab-metrics'
import { useGscMetrics, useGscStatus } from './gsc-data'
import GscSetupPrompt, { GscLoadError, GscLoading } from './GscSetupPrompt'
import { formatCount } from './format'
import { CHECKLIST_STEPS } from './GscClicksTile'

function pickPages(body: Record<string, unknown>): TopPage[] {
  return Array.isArray(body.pages) ? (body.pages as TopPage[]) : []
}

/** What a page is called on the card: its path, decoded; the home page by name. Only an
 *  http(s) address becomes a link. */
function describePage(url: string, homePage: string): { label: string; isPath: boolean; href: string | null; full: string } {
  const decode = (s: string) => { try { return decodeURI(s) } catch { return s } }
  try {
    const u = new URL(url)
    const href = u.protocol === 'http:' || u.protocol === 'https:' ? url : null
    const path = decode(u.pathname + u.search)
    return path === '/' || path === '' ? { label: homePage, isPath: false, href, full: decode(url) } : { label: path, isPath: true, href, full: decode(url) }
  } catch {
    return { label: decode(url), isPath: true, href: null, full: decode(url) }
  }
}

/** `hideSetup`: as GscClicksTile, says nothing where the dashboard's checklist already asks for the step. */
export default function GscTopPages({ projectId, className, hideSetup = false }: { projectId: string | null | undefined; className?: string; hideSetup?: boolean }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  const status = useGscStatus(projectId)
  const pages = useGscMetrics(projectId, status.view, 'pages', pickPages)
  const data = pages.data
  if (data.state === 'disabled') return null
  if (hideSetup && CHECKLIST_STEPS.has(data.state)) return null
  const retry = () => { status.reload(); pages.reload() }
  const max = data.state === 'ready' ? Math.max(1, ...data.data.map((p) => p.clicks)) : 1

  return (
    <section data-gsc-widget="top-pages" data-gsc-state={data.state} className={className}>
      <Card padding={false}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line p-4">
          <h2 className="text-base font-semibold text-ink">{t.topPages.title}</h2>
          {data.state === 'ready' && <span className="text-[11px] text-muted">{t.source28}</span>}
        </div>
        <div className="p-4">
          {data.state === 'ready' ? (
            data.data.length === 0 ? (
              <p className="text-sm text-muted">{t.topPages.none}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {data.data.map((p) => {
                  const page = describePage(p.page, t.topPages.homePage)
                  const text = page.isPath ? <bdi dir="ltr">{page.label}</bdi> : page.label
                  return (
                    <li key={p.page}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-ink" title={page.full}>
                          {page.href ? (
                            <a href={page.href} target="_blank" rel="noopener noreferrer" className="hover:text-action hover:underline">{text}</a>
                          ) : text}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                          {t.topPages.clicks(formatCount(p.clicks, language))}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-2 rounded-e-[4px] bg-action"
                        style={{ width: `${Math.max(2, Math.round((p.clicks / max) * 100))}%` }}
                        aria-hidden="true"
                      />
                    </li>
                  )
                })}
              </ol>
            )
          ) : isGscSetupState(data.state) ? (
            <GscSetupPrompt state={data.state} about={t.topPages.about} projectId={projectId} />
          ) : data.state === 'error' ? (
            <GscLoadError onRetry={retry} />
          ) : (
            <GscLoading lines={3} />
          )}
        </div>
      </Card>
    </section>
  )
}
