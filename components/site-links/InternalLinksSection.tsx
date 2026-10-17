'use client'

/**
 * The links between the site's own pages: four figures, our articles one per
 * row (which pages each links to, which articles link to it, the approved links
 * not in its text yet), and the site's pages nothing links to.
 *
 * The one action is "open the article": the article editor already adds each
 * waiting link in one click (app/(dashboard)/content/articles/[id]). Nothing
 * here writes to an article or to the site.
 */
import { ArrowDownLeft, ArrowUpRight, Clock3, FileText, FileWarning, Link2Off, PenLine, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import SiteAvatar from '@/components/ui/SiteAvatar'
import StatTile from '@/components/ui/StatTile'
import { Reveal } from '@/components/ui/motion'
import ExternalLink from './ExternalLink'
import LinkButton from './LinkButton'
import type { InternalLinksView } from '@/lib/site-links/model'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Copy = ReturnType<typeof getDashboardDictionary>['siteLinks']['internal']

/** The page's path, for display: "/services/ac-repair". */
function pathOf(url: string): string {
  try {
    const u = new URL(url)
    const path = decodeURIComponent(u.pathname)
    return path === '/' ? u.hostname.replace(/^www\./, '') : path
  } catch {
    return url
  }
}

export default function InternalLinksSection({ copy, view, domain, newTabLabel }: {
  copy: Copy
  view: InternalLinksView
  domain: string | null
  newTabLabel: string
}) {
  const t = view.totals
  if (t.articles === 0 && t.indexedPages === 0) {
    return (
      <div className="rounded-card border border-line bg-surface shadow-card" data-site-links-internal="empty">
        <EmptyState
          icon={<PenLine />}
          title={copy.empty.title}
          body={copy.empty.body}
          action={<LinkButton href="/content/strategy" variant="secondary">{copy.empty.cta}</LinkButton>}
        />
      </div>
    )
  }

  const tiles = [
    { key: 'between', label: copy.linksBetween, value: t.linksBetween, icon: <ArrowUpRight />, source: copy.fromArticles },
    { key: 'noIncoming', label: copy.noIncoming, value: t.noIncoming, icon: <Unlink />, source: copy.fromArticles },
    { key: 'pending', label: copy.pending, value: t.pending, icon: <Clock3 />, source: copy.fromArticles },
    { key: 'orphans', label: copy.orphanPages, value: t.orphanPages, icon: <FileWarning />, source: t.indexedPages > 0 ? copy.fromScan : copy.notScanned },
  ]

  return (
    <div className="space-y-5" data-site-links-internal="ok">
      <Reveal className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatTile key={tile.key} className="min-w-0" label={tile.label} value={tile.value} icon={tile.icon} source={tile.source} />
        ))}
      </Reveal>

      {view.articles.length > 0 && (
        <section aria-labelledby="site-links-articles-title" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3.5 sm:px-5">
            <h3 id="site-links-articles-title" className="text-copy font-semibold text-ink">{copy.listTitle}</h3>
            <p className="text-caption text-muted">{copy.openArticleHint}</p>
          </header>
          <ul className="divide-y divide-line">
            {view.articles.map((a) => (
              <li key={a.id} data-site-links-article={a.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-center md:gap-6">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-sunk text-muted">
                    <FileText size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 text-copy font-semibold text-ink line-clamp-2">{a.title}</p>
                      <Badge variant={a.liveUrl ? 'success' : 'neutral'} dot>{a.liveUrl ? copy.published : copy.draft}</Badge>
                    </div>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted">
                      <span className="inline-flex items-center gap-1"><ArrowUpRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />{copy.linksOut(a.linksOut)}</span>
                      <span className={cn('inline-flex items-center gap-1', a.linksIn === 0 && 'font-medium text-warn')}>
                        {a.linksIn === 0 ? <Link2Off size={14} aria-hidden="true" /> : <ArrowDownLeft size={14} aria-hidden="true" className="rtl:-scale-x-100" />}
                        {a.linksIn === null ? copy.notPublished : copy.linksIn(a.linksIn)}
                      </span>
                    </p>
                    {a.pending.length > 0 && (
                      <div className="mt-2.5 rounded-inset border border-line bg-canvas/60 px-3 py-2.5">
                        <p className="inline-flex items-center gap-1.5 text-caption font-semibold text-action">
                          <Clock3 size={14} aria-hidden="true" />
                          {copy.pendingCount(a.pending.length)}
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {a.pending.slice(0, 3).map((p, i) => (
                            <li key={i} className="text-caption text-body line-clamp-1">{copy.pendingItem(p.targetTitle, p.anchorText)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
                <div className="md:shrink-0">
                  <LinkButton href={`/content/articles/${encodeURIComponent(a.id)}`} size="sm" variant={a.pending.length > 0 ? 'primary' : 'secondary'}>
                    <PenLine size={14} aria-hidden="true" />
                    {copy.openArticle}
                  </LinkButton>
                </div>
              </li>
            ))}
          </ul>
          {t.articles > view.articles.length && (
            <p className="border-t border-line px-5 py-3 text-caption text-muted">{copy.moreArticles(view.articles.length)}</p>
          )}
        </section>
      )}

      {view.orphanPages.length > 0 && (
        <section aria-labelledby="site-links-orphans-title" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
          <div className="flex items-start gap-3">
            <SiteAvatar domain={domain} size="sm" className="mt-0.5" />
            <div className="min-w-0">
              <h3 id="site-links-orphans-title" className="text-copy font-semibold text-ink">{copy.orphanTitle}</h3>
              <p className="mt-1 max-w-[62ch] text-caption text-muted text-pretty">{copy.orphanBody}</p>
            </div>
          </div>
          <ul className="mt-5 grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
            {view.orphanPages.map((p) => (
              <li key={p.url} className="min-w-0 text-copy">
                <ExternalLink href={p.url} newTabLabel={newTabLabel} className="max-w-full font-medium">
                  {p.title || pathOf(p.url)}
                </ExternalLink>
                <span dir="ltr" className="mt-0.5 block truncate text-caption text-muted rtl:text-right">{pathOf(p.url)}</span>
              </li>
            ))}
          </ul>
          {t.orphanPages > view.orphanPages.length && (
            <p className="mt-3 text-caption text-muted">{copy.orphanMore(t.orphanPages - view.orphanPages.length)}</p>
          )}
        </section>
      )}
    </div>
  )
}
