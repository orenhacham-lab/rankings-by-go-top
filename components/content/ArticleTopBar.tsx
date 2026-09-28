'use client'

/**
 * The article viewer's sticky top bar (content review C1).
 *
 * One primary action, always phrased as an invitation (lib/content/publish-cta.ts):
 * "connect your site to publish" with no platform, "publish" with one, the
 * existing Shopify scope-upgrade flow when the store is connected without
 * write_content, "view on your site" once published. Beside it, two actions that
 * are useful with no site connected at all: copy the article, download the
 * featured image. Under it, the viewer's tabs (article / schema).
 *
 * It sits under the dashboard's own sticky bar (h-14), in the page's tokens.
 */
import Link from 'next/link'
import { ArrowLeft, Copy, Download, ExternalLink, Plug, Send, ShieldCheck, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { resolvePublishCta } from '@/lib/content/publish-cta'
import type { PublishPlatformState } from './ArticleEditorPublishGate'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

export type ArticleViewerTab = 'article' | 'schema'

type TopBarDict = DashboardDictionary['contentHub']['editor']['topBar']

/** A link that looks like the Button primitive (a link is the right element for navigation). */
const linkButton = (variant: 'primary' | 'secondary') => cn(
  'inline-flex h-9 select-none items-center justify-center gap-2 rounded-control px-4 text-copy font-semibold whitespace-nowrap',
  'transition-[background-color,border-color,color,box-shadow] duration-150 ease-snappy',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  variant === 'primary'
    ? 'bg-action text-action-ink hover:bg-action-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(20_24_60/0.18)]'
    : 'bg-surface text-ink border border-line shadow-control hover:border-line-strong hover:bg-sunk/60',
)

export default function ArticleTopBar({
  t, title, statusLabel, statusTone, backHref, projectId, detected,
  isPublished, publishedUrl, featuredImageUrl, citedBadge,
  onPublish, onCopy, copying, onDownloadImage, downloading, tab, onTabChange,
}: {
  t: TopBarDict
  title: string
  statusLabel: string
  statusTone: 'neutral' | 'info' | 'success'
  backHref: string
  projectId: string | null
  detected: PublishPlatformState
  isPublished: boolean
  publishedUrl: string | null
  featuredImageUrl: string | null
  citedBadge?: React.ReactNode
  onPublish: () => void
  onCopy: () => void
  copying?: boolean
  onDownloadImage: () => void
  downloading?: boolean
  tab: ArticleViewerTab
  onTabChange: (tab: ArticleViewerTab) => void
}) {
  const cta = resolvePublishCta({
    projectId,
    loading: detected.loading,
    platform: detected.platform,
    shopifyNeedsScope: detected.shopifyNeedsScope,
    shopDomain: detected.shopDomain,
    isPublished,
    publishedUrl,
  })

  const tabs: { id: ArticleViewerTab; label: string }[] = [
    { id: 'article', label: t.tabArticle },
    { id: 'schema', label: t.tabSchema },
  ]
  function onTabKey(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const rtl = (e.currentTarget.closest('[dir]') as HTMLElement | null)?.dir === 'rtl'
    const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1
    const next = tabs[(i + step + tabs.length) % tabs.length]
    onTabChange(next.id)
    document.getElementById(`article-tab-${next.id}`)?.focus()
  }

  return (
    <div
      data-testid="article-top-bar"
      className="sticky top-14 z-20 -mx-4 -mt-6 mb-6 border-b border-line bg-canvas/90 px-4 pt-3 backdrop-blur-md backdrop-saturate-150 md:-mx-8 md:-mt-8 md:px-8"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href={backHref}
          aria-label={t.back}
          title={t.back}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-body hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          <ArrowLeft size={18} aria-hidden className="rtl:rotate-180" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-section font-semibold text-ink" title={title}>{title || '—'}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Badge variant={statusTone}>{statusLabel}</Badge>
            {citedBadge}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="md" variant="secondary" onClick={onCopy} loading={copying} disabled={copying}>
            {!copying && <Copy size={15} aria-hidden />} {t.copyArticle}
          </Button>
          {featuredImageUrl && (
            <Button size="md" variant="secondary" onClick={onDownloadImage} loading={downloading} disabled={downloading}>
              {!downloading && <Download size={15} aria-hidden />} {t.downloadImage}
            </Button>
          )}
          {cta.kind === 'loading' && (
            <Button size="md" disabled aria-live="polite">{t.checking}</Button>
          )}
          {cta.kind === 'connect' && (
            <Link href={cta.href} className={linkButton('primary')} data-cta="connect">
              <Plug size={15} aria-hidden /> {t.connectToPublish}
            </Link>
          )}
          {cta.kind === 'conflict' && (
            <Link href={cta.href} className={linkButton('primary')} data-cta="conflict">
              <AlertTriangle size={15} aria-hidden /> {t.fixConflict}
            </Link>
          )}
          {cta.kind === 'grant_scope' && (
            <a href={cta.href} className={linkButton('primary')} data-cta="grant_scope">
              <ShieldCheck size={15} aria-hidden /> {t.grantScope}
            </a>
          )}
          {cta.kind === 'publish' && (
            <Button size="md" onClick={onPublish} data-cta="publish">
              <Send size={15} aria-hidden /> {t.publish}
            </Button>
          )}
          {cta.kind === 'published' && (cta.href ? (
            <a href={cta.href} target="_blank" rel="noopener noreferrer" className={linkButton('secondary')} data-cta="published">
              {t.viewLive} <ExternalLink size={14} aria-hidden />
            </a>
          ) : (
            <Badge variant="success">{t.published}</Badge>
          ))}
        </div>
      </div>

      <div role="tablist" aria-label={t.tabsLabel} className="mt-2 flex gap-1">
        {tabs.map((x, i) => {
          const selected = tab === x.id
          return (
            <button
              key={x.id}
              id={`article-tab-${x.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`article-panel-${x.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTabChange(x.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn(
                '-mb-px border-b-2 px-3 pb-2 pt-1 text-copy font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-t-control',
                selected ? 'border-action text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {x.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
