'use client'

/**
 * The workspace switcher — the one control that answers "which site am I looking at?"
 *
 * The app used to answer that question differently on every screen: a dropdown
 * inside the content page, a project list on AI visibility, a selector of its own
 * on keyword research, and a Projects tab that was really a fifth way to pick one.
 * There is one switcher now, in the top bar, on every screen. It writes to the
 * global active-project state, so switching here re-scopes the screen you are
 * already on instead of navigating away from it.
 *
 * It scales to an agency: the list is searchable once it is long enough that
 * scanning it stops working.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Plus, Search, Settings2 } from 'lucide-react'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import SiteIcon from '@/components/ui/SiteIcon'
import { cn } from '@/lib/utils'

/** Above this many workspaces, scanning a list stops working and search starts. */
const SEARCH_THRESHOLD = 8

export default function WorkspaceSwitcher() {
  const { activeProjectId, projects, isResolved, projectsError, reloadProjects, setActiveProject } = useActiveProject()
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).workspace
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  const current = projects.find((p) => p.id === activeProjectId) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => (p.name ?? '').toLowerCase().includes(q))
  }, [projects, query])

  // Close on an outside click or Escape — a dropdown that traps the page is worse
  // than no dropdown.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  // The list FAILED to load — never rendered as "you have no workspaces", which is
  // a different fact and offers no way forward.
  if (isResolved && projectsError) {
    return (
      <button type="button" data-onboarding="workspace" onClick={reloadProjects} className="text-sm text-muted hover:text-ink">
        {t.loadError}
      </button>
    )
  }

  if (!isResolved) {
    return <span data-onboarding="workspace" className="text-sm text-muted">{t.loading}</span>
  }

  if (projects.length === 0) {
    return (
      <Link
        href="/projects/new"
        data-onboarding="workspace"
        className="inline-flex items-center gap-1.5 rounded-control bg-action px-3 py-1.5 text-sm font-semibold text-action-ink hover:bg-action-hover"
      >
        <Plus size={15} strokeWidth={2.5} />
        {t.createFirst}
      </Link>
    )
  }

  return (
    <div className="relative" ref={boxRef} data-onboarding="workspace">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setQuery('') }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="group inline-flex h-9 max-w-[min(70vw,22rem)] items-center gap-2.5 rounded-control border border-line bg-surface ps-1.5 pe-2.5 text-copy shadow-control transition-[border-color,background-color] duration-150 hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
      >
        {/* The site's own icon, or the project's initial on a small accent tile: the
            one thing on the bar that says "this site", readable before the name is. */}
        <SiteIcon
          domain={current?.target_domain}
          icon={current?.site_icon}
          fallback={(current?.name ?? t.unnamed).trim().charAt(0) || '·'}
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-action text-[0.6875rem] font-bold uppercase text-action-ink"
          iconClassName="flex size-6 shrink-0 items-center justify-center rounded-md bg-white p-0.5 ring-1 ring-line"
        />
        <span className="hidden sm:inline text-caption text-muted shrink-0">{t.label}</span>
        <span className="truncate font-semibold text-ink">{current?.name ?? t.unnamed}</span>
        <ChevronDown size={15} className={cn('shrink-0 text-muted transition-transform duration-200 ease-snappy', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute start-0 z-50 mt-2 w-72 max-w-[85vw] origin-top overflow-hidden rounded-card border border-line bg-surface shadow-pop animate-pop-in"
        >
          {projects.length > SEARCH_THRESHOLD && (
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search size={15} className="text-muted shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full bg-transparent text-sm text-ink placeholder-muted focus:outline-none"
              />
            </div>
          )}

          <ul className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-sm text-muted">{t.noMatches}</li>
            )}
            {filtered.map((p) => {
              const isCurrent = p.id === activeProjectId
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onClick={() => { setActiveProject(p.id); setOpen(false) }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-copy transition-colors duration-150',
                      isCurrent ? 'bg-action-soft font-semibold text-action' : 'text-body hover:bg-sunk hover:text-ink'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <SiteIcon
                        domain={p.target_domain}
                        icon={p.site_icon}
                        fallback={(p.name ?? t.unnamed).trim().charAt(0) || '·'}
                        className="flex size-5 shrink-0 items-center justify-center rounded bg-sunk text-[0.625rem] font-bold uppercase text-muted ring-1 ring-line"
                        iconClassName="flex size-5 shrink-0 items-center justify-center rounded bg-white p-px ring-1 ring-line"
                      />
                      <span className="truncate">{p.name ?? t.unnamed}</span>
                    </span>
                    {isCurrent && <Check size={15} className="shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="flex items-center justify-between gap-1 border-t border-line p-1">
            <Link
              href="/projects/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold text-action hover:bg-sunk"
            >
              <Plus size={15} strokeWidth={2.5} />
              {t.create}
            </Link>
            {/* Deactivating, reactivating and deleting a project live on the
                project list. An inactive project is not in this menu, so this is
                the only way back to it. */}
            <Link
              href="/projects"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 rounded-control px-3 py-2 text-xs text-muted hover:bg-sunk hover:text-ink"
            >
              <Settings2 size={14} />
              {t.manage}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
