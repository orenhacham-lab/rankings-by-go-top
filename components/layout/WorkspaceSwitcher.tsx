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
 *
 * It is a real listbox for the keyboard: Arrow Up / Down (and Home / End) move
 * between the projects — from the button too, which opens the list — Enter
 * picks the focused one, Escape closes and returns to the button. Only the
 * focused option is in the tab order (a roving tabindex).
 *
 * "New project" knows the plan's project limit before anyone fills in a form
 * (GET /api/projects/quota, lib/projects/project-quota.ts): at the limit it stays
 * in the menu, switched off, says why, and links to the plan. It never turns off
 * on an answer it could not read — the create route still decides.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Plus, Search, Settings2 } from 'lucide-react'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import SiteAvatar from '@/components/ui/SiteAvatar'
import { cn } from '@/lib/utils'
import { newProjectBlocked, parseProjectQuota, type ProjectQuota } from '@/lib/projects/project-quota'

/** Above this many workspaces, scanning a list stops working and search starts. */
const SEARCH_THRESHOLD = 8

export default function WorkspaceSwitcher() {
  const { activeProjectId, projects, isResolved, projectsError, reloadProjects, setActiveProject } = useActiveProject()
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).workspace
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The option that holds focus (roving tabindex), as an index into `filtered`.
  const [focusIndex, setFocusIndex] = useState(0)
  const [quota, setQuota] = useState<ProjectQuota | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const listId = useId()
  const limitId = useId()

  const current = projects.find((p) => p.id === activeProjectId) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => (p.name ?? '').toLowerCase().includes(q))
  }, [projects, query])

  // Close on an outside click or Escape — a dropdown that traps the page is worse
  // than no dropdown. Escape hands focus back to the button it was opened from.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  // The project limit, read once the list is known and again when its size
  // changes. A failed read leaves the entry on.
  const projectCount = projects.length
  useEffect(() => {
    if (!isResolved || projectsError || projectCount === 0) return
    let cancelled = false
    fetch('/api/projects/quota')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (!cancelled) setQuota(parseProjectQuota(body)) })
      .catch(() => { if (!cancelled) setQuota({ state: 'unknown' }) })
    return () => { cancelled = true }
  }, [isResolved, projectsError, projectCount])

  // Opening moves focus into the list: to the search box when there is one,
  // otherwise to the current project (or the first).
  useEffect(() => {
    if (!open) return
    if (searchRef.current) { searchRef.current.focus({ preventScroll: true }); return }
    optionRefs.current[focusIndex]?.focus({ preventScroll: true })
    // Only on opening: every later move focuses its option itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const openList = (at: 'current' | 'last') => {
    const currentIndex = Math.max(0, projects.findIndex((p) => p.id === activeProjectId))
    setQuery('')
    setFocusIndex(at === 'last' ? Math.max(0, projects.length - 1) : currentIndex)
    setOpen(true)
  }

  const focusOption = (i: number) => {
    if (filtered.length === 0) return
    const next = (i + filtered.length) % filtered.length
    setFocusIndex(next)
    optionRefs.current[next]?.focus({ preventScroll: true })
  }

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (open) focusOption(focusIndex); else openList('current') }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (open) focusOption(focusIndex); else openList('last') }
  }

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusOption(focusIndex + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusOption(focusIndex - 1) }
    else if (e.key === 'Home') { e.preventDefault(); focusOption(0) }
    else if (e.key === 'End') { e.preventDefault(); focusOption(filtered.length - 1) }
    // Enter and Space press the focused option's own button, which picks it.
  }

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusOption(0) }
  }

  const blocked = newProjectBlocked(quota) ? quota : null

  // The list FAILED to load — never rendered as "you have no workspaces", which is
  // a different fact and offers no way forward.
  if (isResolved && projectsError) {
    return (
      <button type="button" data-onboarding="workspace" onClick={reloadProjects} className="text-copy text-muted hover:text-ink">
        {t.loadError}
      </button>
    )
  }

  if (!isResolved) {
    return <span data-onboarding="workspace" className="text-copy text-muted">{t.loading}</span>
  }

  if (projects.length === 0) {
    return (
      <Link
        href="/projects/new"
        data-onboarding="workspace"
        className="inline-flex items-center gap-1.5 rounded-control bg-action px-3 py-1.5 text-copy font-semibold text-action-ink hover:bg-action-hover"
      >
        <Plus size={15} strokeWidth={2.5} />
        {t.createFirst}
      </Link>
    )
  }

  const focusable = Math.min(focusIndex, Math.max(0, filtered.length - 1))

  return (
    <div className="relative" ref={boxRef} data-onboarding="workspace">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (open) setOpen(false); else openList('current') }}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="group inline-flex h-9 max-w-[min(70vw,22rem)] items-center gap-2.5 rounded-control border border-line bg-surface ps-1.5 pe-2.5 text-copy shadow-control transition-[border-color,background-color] duration-150 hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
      >
        {/* The site's own icon, or the project's initial on a small accent tile: the
            one thing on the bar that says "this site", readable before the name is. */}
        <SiteAvatar domain={current?.target_domain} icon={current?.site_icon} name={current?.name ?? t.unnamed} size="sm" />
        <span className="hidden sm:inline text-caption text-muted shrink-0">{t.label}</span>
        <span className="truncate font-semibold text-ink">{current?.name ?? t.unnamed}</span>
        <ChevronDown size={15} className={cn('shrink-0 text-muted transition-transform duration-200 ease-snappy', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute start-0 z-50 mt-2 w-72 max-w-[85vw] origin-top overflow-hidden rounded-card border border-line bg-surface shadow-pop animate-pop-in"
        >
          {projects.length > SEARCH_THRESHOLD && (
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search size={15} className="text-muted shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setFocusIndex(0) }}
                onKeyDown={onSearchKey}
                aria-controls={listId}
                aria-label={t.searchPlaceholder}
                placeholder={t.searchPlaceholder}
                className="w-full bg-transparent text-copy text-ink placeholder-muted focus:outline-none"
              />
            </div>
          )}

          {filtered.length === 0 && (
            <p className="px-4 py-3 text-copy text-muted">{t.noMatches}</p>
          )}
          <ul id={listId} role="listbox" aria-label={t.listLabel} onKeyDown={onListKey} className="max-h-72 overflow-y-auto p-1 empty:hidden">
            {filtered.map((p, i) => {
              const isCurrent = p.id === activeProjectId
              return (
                <li key={p.id} role="none">
                  <button
                    ref={(el) => { optionRefs.current[i] = el }}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    tabIndex={i === focusable ? 0 : -1}
                    onFocus={() => setFocusIndex(i)}
                    onClick={() => { setActiveProject(p.id); setOpen(false) }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-inset px-3 py-2 text-start text-copy transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action',
                      isCurrent ? 'bg-action-soft font-semibold text-action' : 'text-body hover:bg-sunk hover:text-ink focus-visible:bg-sunk focus-visible:text-ink'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <SiteAvatar domain={p.target_domain} icon={p.site_icon} name={p.name ?? t.unnamed} size="xs" />
                      <span className="truncate">{p.name ?? t.unnamed}</span>
                    </span>
                    {isCurrent && <Check size={15} className="shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>

          {/* At the plan's limit "New project" stays where it is, switched off, and
              the reason and the way to more projects sit right under it. */}
          {blocked && (
            <div className="border-t border-line px-4 py-2.5" data-new-project="blocked">
              <span
                role="link"
                tabIndex={0}
                aria-disabled="true"
                aria-describedby={limitId}
                className="flex cursor-not-allowed items-center gap-2 text-copy font-semibold text-muted"
              >
                <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
                {t.create}
                <span className="ms-auto rounded-pill bg-sunk px-2 py-0.5 text-caption font-medium tabular-nums">
                  {t.createLimitCount(blocked.used, blocked.limit)}
                </span>
              </span>
              <p id={limitId} className="mt-1 text-caption text-muted">
                {t.createLimitReached(blocked.used, blocked.limit)}{' '}
                <Link
                  href="/billing"
                  onClick={() => setOpen(false)}
                  className="rounded-control font-semibold text-action underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                >
                  {t.upgrade}
                </Link>
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-1 border-t border-line p-1">
            {blocked ? <span /> : (
              <Link
                href="/projects/new"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-control px-3 py-2 text-copy font-semibold text-action hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
              >
                <Plus size={15} strokeWidth={2.5} />
                {t.create}
              </Link>
            )}
            {/* Deactivating, reactivating and deleting a project live on the
                project list. An inactive project is not in this menu, so this is
                the only way back to it. */}
            <Link
              href="/projects"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 rounded-control px-3 py-2 text-caption text-muted hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
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
