'use client'

/**
 * Widget 5, the publishing schedule (what is up next, and what went live), and
 * widget 9, the latest articles with their status. Both read the dashboard
 * route's content sections; with the content module off on the server they are
 * not rendered, because there would be no screen for their one action to open.
 *
 * The one article action is "Write the first article" (plan §16 decision 6): it
 * opens the topics screen, where an article is written through the existing
 * flow and counted in the existing allowance. Nothing here writes an article.
 */
import { CalendarClock, FileText, Newspaper } from 'lucide-react'
import type { ArticleLine, ArticleStatus, BoardData, BoardStatus, Section } from '@/lib/dashboard/overview'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { CONTENT_ROOT_PATH, CONTENT_TOPICS_PATH } from '@/lib/content/content-workspace-nav'
import { HeaderLink, LinkButton, StatusPill, Widget, WidgetEmpty, WidgetError, WidgetLoading } from './ui'

type Copy = DashboardDictionary['dashboardHome']

function formatDay(iso: string, language: 'he' | 'en'): string {
  return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

const BOARD_TONE: Record<BoardStatus, 'ok' | 'info' | 'warn' | 'neutral'> = {
  queued: 'neutral', scheduled: 'info', generating: 'info', generated: 'info', publishing: 'warn', published: 'ok',
}
const ARTICLE_TONE: Record<ArticleStatus, 'ok' | 'info' | 'warn' | 'bad' | 'neutral'> = {
  draft: 'neutral', ready: 'info', scheduled: 'info', publishing: 'warn', published: 'ok', failed: 'bad',
}

export function PublishingBoard({ t, language, section, retry }: {
  t: Copy
  language: 'he' | 'en'
  section: Section<BoardData> | null
  retry: () => void
}) {
  const b = t.board
  const empty = section?.state === 'ready' && section.data.upcoming.length === 0 && section.data.published.length === 0
  const state = !section ? 'loading' : empty ? 'empty' : section.state
  return (
    <Widget id="board" state={state} title={b.title} subtitle={b.subtitle} icon={<CalendarClock size={16} strokeWidth={2} />}
      action={section?.state === 'ready' && !empty ? <HeaderLink href={CONTENT_TOPICS_PATH}>{t.actions.viewAll}</HeaderLink> : undefined}>
      {!section && <WidgetLoading lines={3} label={b.title} />}
      {section?.state === 'error' && <WidgetError message={t.loadError} retryLabel={t.actions.retry} onRetry={retry} />}
      {empty && (
        <WidgetEmpty icon={<CalendarClock size={18} strokeWidth={2} />} title={b.emptyTitle} body={b.empty}
          action={<LinkButton href={CONTENT_TOPICS_PATH} variant="secondary" size="sm">{b.emptyCta}</LinkButton>} />
      )}
      {section?.state === 'ready' && !empty && (
        <div className="space-y-4">
          {([['upcoming', b.upcoming], ['published', b.published]] as const).map(([key, label]) => {
            const lines = section.data[key]
            if (lines.length === 0) return null
            return (
              <div key={key}>
                <h3 className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</h3>
                <ul className="mt-1 divide-y divide-line">
                  {lines.map((l) => (
                    <li key={l.id} data-board={key} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-copy text-ink">{l.title}</span>
                        <span className="text-caption tabular-nums text-muted">{l.at ? formatDay(l.at, language) : b.noDate}</span>
                      </span>
                      <StatusPill tone={BOARD_TONE[l.status]}>{b.status[l.status]}</StatusPill>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </Widget>
  )
}

export function RecentArticles({ t, language, section, retry, firstArticleHref }: {
  t: Copy
  language: 'he' | 'en'
  section: Section<{ recent: ArticleLine[] }> | null
  retry: () => void
  /**
   * Where "Write the first article" goes, or null when the opening card already
   * carries that button: the screen has ONE such button (plan §16 decision 6),
   * so the empty list then points to the topics instead.
   */
  firstArticleHref: string | null
}) {
  const a = t.articles
  const empty = section?.state === 'ready' && section.data.recent.length === 0
  const state = !section ? 'loading' : empty ? 'empty' : section.state
  return (
    <Widget id="articles" state={state} title={a.title} icon={<Newspaper size={16} strokeWidth={2} />}
      action={section?.state === 'ready' && !empty ? <HeaderLink href={CONTENT_ROOT_PATH}>{t.actions.viewAll}</HeaderLink> : undefined}>
      {!section && <WidgetLoading lines={3} label={a.title} />}
      {section?.state === 'error' && <WidgetError message={t.loadError} retryLabel={t.actions.retry} onRetry={retry} />}
      {empty && (
        <WidgetEmpty icon={<FileText size={18} strokeWidth={2} />} title={a.emptyTitle} body={a.empty}
          action={firstArticleHref ? (
            <div className="flex flex-col items-start gap-1">
              <LinkButton href={firstArticleHref} variant="commit" size="sm">{t.actions.writeFirstArticle}</LinkButton>
              <span className="text-caption text-muted">{t.actions.articleQuota}</span>
            </div>
          ) : (
            <LinkButton href={CONTENT_TOPICS_PATH} variant="secondary" size="sm">{t.board.emptyCta}</LinkButton>
          )} />
      )}
      {section?.state === 'ready' && !empty && (
        <ul className="divide-y divide-line">
          {section.data.recent.map((l) => (
            <li key={l.id} data-article={l.status} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="min-w-0">
                <span className="block truncate text-copy text-ink">{l.title}</span>
                <span className="text-caption tabular-nums text-muted">{formatDay(l.at, language)}</span>
              </span>
              <StatusPill tone={ARTICLE_TONE[l.status]}>{a.status[l.status]}</StatusPill>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}
