'use client'

/**
 * The top bar's two icons at its end (wave 9, owner's ask):
 *
 *   - settings: a link to the current project's settings (the same address the
 *     sidebar's entry and every "edit" link use, lib/onboarding/links.ts);
 *   - the notifications bell: everything that waits for the owner of the current
 *     project, with a count badge. It is the dashboard's "waiting for you" card and
 *     the sidebar's pills, from the same read (useWaiting, one shared request) and
 *     the same rule (lib/nudges/rows.ts allWaitingRows), without the card's cap of
 *     three: a lost connection, articles and topics that wait for approval, safe
 *     fixes ready. Each row says it in one sentence and opens the one screen that
 *     moves it. A failed read is "nothing waiting": never an error or a toast.
 *
 * The menu is GuideMenu's / ContactMenu's popover pattern: a button with
 * aria-expanded, Arrow keys between the rows, Escape and Tab close it and return
 * focus. Both icons are 36px targets and fit the bar at 390px.
 */
import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, Bell, FileCheck2, Lightbulb, LineChart, Plug, Settings2, Wrench, type LucideIcon } from 'lucide-react'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDate } from '@/lib/i18n/format-date'
import { settingsHref } from '@/lib/onboarding/links'
import { allWaitingRows, bellCount, pillText, type WaitingRowKind } from '@/lib/nudges/rows'
import { waitingAction, waitingSentence } from '@/components/dashboard/WaitingCard'
import { useWaiting } from '@/components/nudges/useWaiting'
import { followSectionLink } from '@/components/layout/section-link'
import { cn } from '@/lib/utils'

const ICONS: Record<WaitingRowKind, LucideIcon> = { connection: AlertTriangle, site: Plug, gsc: LineChart, articles: FileCheck2, topics: Lightbulb, fixes: Wrench }

const ICON_BUTTON = cn(
  'relative inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-muted',
  'transition-colors duration-150 hover:bg-sunk hover:text-ink',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
)

export default function TopBarActions() {
  const { language, uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)
  const t = dict.topBarActions
  const { activeProjectId } = useActiveProject()
  const pathname = usePathname() ?? ''
  const { waiting, safeFixes } = useWaiting(activeProjectId, pathname)
  const rows = activeProjectId ? allWaitingRows(activeProjectId, waiting, safeFixes) : []
  const count = bellCount(rows)

  // Open on the screen it was opened on: a change of screen closes it (no effect needed).
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next
    setOpenOn(value ? pathname : null)
  }
  const boxRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const titleId = useId()

  // Close on an outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenOn(null) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Opening moves focus to the first row (or the panel itself when nothing waits).
  useEffect(() => {
    if (!open) return
    const first = panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    ;(first ?? panelRef.current)?.focus({ preventScroll: true })
  }, [open])

  const closeToBell = () => { setOpen(false); bellRef.current?.focus({ preventScroll: true }) }
  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeToBell(); return }
    if (e.key === 'Tab') { e.preventDefault(); closeToBell(); return }
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    if (!items.length) return
    const at = items.indexOf(document.activeElement as HTMLElement)
    const move = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus() }
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(items.length - 1)
  }

  const settings = activeProjectId ? settingsHref(activeProjectId) : '/settings'
  const date = formatDate(language).date

  return (
    <div className="ms-auto flex shrink-0 items-center gap-1" data-top-bar-actions="">
      <Link href={settings as `/${string}`} aria-label={t.settings} title={t.settings} data-top-bar-settings="" className={ICON_BUTTON}>
        <Settings2 size={18} strokeWidth={2} aria-hidden="true" />
      </Link>

      <div ref={boxRef} className="sm:relative">
        <button
          ref={bellRef}
          type="button"
          data-top-bar-bell=""
          data-count={count}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true) } }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={t.notificationsCount(count)}
          title={t.notifications}
          className={cn(ICON_BUTTON, open && 'bg-sunk text-ink')}
        >
          <Bell size={18} strokeWidth={2} aria-hidden="true" />
          {count > 0 && (
            <span
              aria-hidden="true"
              data-top-bar-badge=""
              className="absolute -top-1 -end-1 grid h-5 min-w-5 place-items-center rounded-pill bg-bad px-1 text-overline font-semibold leading-none text-bad-ink tabular-nums ring-2 ring-canvas"
            >
              {pillText(count)}
            </span>
          )}
        </button>

        {open && (
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-labelledby={titleId}
            onKeyDown={onPanelKey}
            data-top-bar-menu=""
            className={cn(
              'absolute inset-x-4 top-full z-50 mt-1 origin-top overflow-hidden rounded-card border border-line bg-surface shadow-pop focus:outline-none motion-safe:animate-pop-in',
              'sm:inset-x-auto sm:end-0 sm:mt-2 sm:w-[340px]',
            )}
          >
            <p id={titleId} className="border-b border-line px-4 py-3 text-copy font-semibold text-ink">{t.title}</p>
            {rows.length === 0 ? (
              <div className="px-4 py-5" data-top-bar-empty="">
                <p className="text-copy font-medium text-ink">{t.empty}</p>
                <p className="mt-1 text-caption text-muted text-pretty">{t.emptyBody}</p>
              </div>
            ) : (
              <div className="p-1">
                {rows.map((row) => {
                  const Icon = ICONS[row.kind]
                  const down = row.kind === 'connection' || row.kind === 'site'
                  return (
                    <Link
                      key={row.kind}
                      role="menuitem"
                      href={row.href as `/${string}`}
                      data-top-bar-row={row.kind}
                      // A row for a section of THIS screen (the settings' #platform, opened from
                      // the settings) scrolls there in place: the router would do nothing.
                      onClick={(e) => { followSectionLink(e, row.href); setOpen(false) }}
                      className="flex w-full items-start gap-3 rounded-control px-3 py-2.5 text-start transition-colors duration-150 hover:bg-sunk focus-visible:bg-sunk focus-visible:outline-none"
                    >
                      <span
                        aria-hidden="true"
                        className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-inset ring-1', down ? 'bg-warn-soft text-warn ring-warn/15' : 'bg-action-soft text-action ring-action/10')}
                      >
                        <Icon size={15} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-copy font-medium text-ink text-pretty">{waitingSentence(dict.waitingCard, row)}</span>
                        {row.dryOn && <span className="mt-0.5 block text-caption text-muted">{dict.waitingCard.queueDry(date(row.dryOn))}</span>}
                        <span className="mt-0.5 block text-caption font-semibold text-action">{waitingAction(dict.waitingCard, row.kind)}</span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
