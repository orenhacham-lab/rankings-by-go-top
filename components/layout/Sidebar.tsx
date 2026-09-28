'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { DashboardLanguageSwitcher } from '@/components/DashboardLanguageSwitcher'
import GoTopMark from '@/components/brand/GoTopMark'
import WhatsAppGlyph from '@/components/brand/WhatsAppGlyph'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { NAV_DRAWER_EVENT, type NavDrawerRequest } from '@/lib/shell/nav-drawer'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutGrid,
  Telescope,
  TrendingUp,
  CalendarRange,
  FileText,
  Sparkles,
  FileChartColumn,
  Gauge,
  Settings2,
  CreditCard,
  Newspaper,
  Plug,
  ClipboardList,
  LogOut,
  Library,
  Menu,
  X,
} from 'lucide-react'
import {
  CONTENT_SCREENS,
  isContentScreenEnabled,
  type ContentScreenKey,
} from '@/lib/content/content-workspace-nav'

type SidebarLabelKey = keyof ReturnType<typeof getDashboardDictionary>['sidebar']

/**
 * A nav entry takes its label from ONE dictionary block: `sidebar` for its own
 * label, or `contentHub.screens` for a content-workspace screen, which is the same
 * block the screen's own heading reads. The union is deliberate: a content screen
 * must not also get a label in `sidebar`, because two labels for one screen drift.
 */
type NavItem = {
  href: string
  icon: LucideIcon
  onboarding?: string
} & (
  | { labelKey: SidebarLabelKey; screenKey?: never }
  | { screenKey: ContentScreenKey; labelKey?: never }
)

type NavGroup = {
  groupKey: SidebarLabelKey
  items: readonly NavItem[]
}

/**
 * Every nav icon is drawn the same way (UX review, decision 3): 20px, a 1.75
 * stroke that scales with the icon. Inline icons elsewhere are 16px at 2.
 */
export const NAV_ICON = { size: 20, strokeWidth: 1.75, absoluteStrokeWidth: false } as const

/** Read as literal member expressions, which is what lets Next inline them. */
const CONTENT_FLAGS = {
  NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION: process.env.NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION,
}

const CONTENT_SCREEN_ICONS: Record<ContentScreenKey, LucideIcon> = {
  strategy: CalendarRange,
  articles: FileText,
  existing: Library,
}

/**
 * The content screens, each as its own sidebar entry.
 *
 * They were four tabs behind a single "Content Hub" entry, which is one level of
 * nesting more than the work needs: a merchant looking for "articles" scanned the
 * sidebar, found a hub, and had to open it to learn what was inside. The entries are
 * DERIVED from the same CONTENT_SCREENS declaration the routes and the guards read,
 * so the sidebar cannot list a screen that has no page, or miss one that does.
 *
 * "Topics" and "automation" were two entries; they are one now, "content strategy",
 * first, because what will be written comes before what was.
 *
 * Gated by the build-time content flag, exactly as the one hub entry was; each screen
 * is additionally subject to its own flag, so a screen hidden on its route is hidden
 * here from the same decision.
 */
const contentNavItems: readonly NavItem[] =
  process.env.NEXT_PUBLIC_ENABLE_CONTENT === 'true'
    ? CONTENT_SCREENS.filter((s) => isContentScreenEnabled(s, CONTENT_FLAGS))
        .map((s) => ({ href: s.href, screenKey: s.key, icon: CONTENT_SCREEN_ICONS[s.key] }))
    : []

/**
 * AI visibility is the tool itself now, for the current project, behind the same
 * build-time flag as its page. Without the flag the page has nothing to show, so
 * there is no entry leading to it.
 */
const aiVisibilityNavItems: readonly NavItem[] =
  process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'
    ? [{ href: '/ai-visibility', labelKey: 'aiVisibility', icon: Sparkles }]
    : []

/**
 * The nav is declared as GROUPS, not as one flat list.
 *
 * Ten undifferentiated entries gave no clue which screen answers which
 * question, so every group here is named for the question it answers:
 * "what am I working on", "what should I write", "how is it doing",
 * "what am I paying". A new screen joins the group that matches its
 * question — it does not get appended to the end.
 *
 * The desktop rail and the phone drawer render the same groups, with the same
 * headings, in the same order.
 *
 * There is no Scans entry: its history is a section of Keywords and of Reports
 * (UX review, decision 5), and /scans redirects there.
 */
const navGroupKeys: readonly NavGroup[] = [
  {
    groupKey: 'groupMain',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: LayoutGrid },
    ],
  },
  {
    groupKey: 'groupResearch',
    items: [
      { href: '/keyword-research', labelKey: 'keywordResearch', icon: Telescope, onboarding: 'keyword-research' },
      { href: '/keywords', labelKey: 'keywords', icon: TrendingUp },
      ...contentNavItems,
    ],
  },
  {
    groupKey: 'groupMonitoring',
    items: [
      ...aiVisibilityNavItems,
      // Site health: the site's own technical state (lib/site-health). A gauge, for
      // the score it leads with.
      { href: '/site-health', labelKey: 'siteHealth', icon: Gauge },
      { href: '/reports', labelKey: 'reports', icon: FileChartColumn, onboarding: 'reports' },
    ],
  },
  {
    groupKey: 'groupAccount',
    items: [
      { href: '/settings', labelKey: 'projectSettings', icon: Settings2 },
      { href: '/billing', labelKey: 'billing', icon: CreditCard },
    ],
  },
]

/** Flattened in group order — what a guard can assert the active-entry resolution against. */
export const navItemKeys = navGroupKeys.flatMap((g) => g.items)

const adminItemKeys: readonly NavItem[] = [
  { href: '/admin/articles', labelKey: 'articleManagement', icon: Newspaper },
  { href: '/setup', labelKey: 'connectionStatus', icon: Plug },
  { href: '/admin/logs', labelKey: 'errorLogs', icon: ClipboardList },
]

/** The administrator's entries, for the tab title (components/layout/DocumentTitle.tsx). */
export const adminNavItems = adminItemKeys

/**
 * The entry that owns a pathname: the LONGEST matching href wins.
 *
 * With the content screens promoted to entries of their own, /content is a prefix of
 * /content/strategy — a plain prefix test would light up two entries at once. The
 * article editor at /content/articles/<id> has no entry, and correctly lights up the
 * articles entry it was opened from.
 */
export function activeNavHref(pathname: string, items: readonly NavItem[]): string | null {
  let best: string | null = null
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (best === null || item.href.length > best.length) best = item.href
    }
  }
  return best
}

function navLabel(dict: ReturnType<typeof getDashboardDictionary>, item: NavItem): string {
  if (item.screenKey) return dict.contentHub.screens[item.screenKey]
  return dict.sidebar[item.labelKey]
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-focus focus-visible:ring-offset-2 focus-visible:ring-offset-rail'

/**
 * One nav entry, shared by the desktop rail and the phone drawer so the two
 * cannot drift apart.
 *
 * The active entry is FILLED with the action blue, white icon and text (UX
 * review, decision 2). On the desktop rail the fill is one element that slides
 * between entries (the pill below); until it has measured itself, and in the
 * drawer, the entry carries the fill itself. Inactive entries: muted icon, text
 * white at 86%.
 */
function NavLink({ item, isActive, label }: { item: NavItem; isActive: boolean; label: string }) {
  const IconComponent = item.icon
  return (
    <Link
      href={item.href}
      data-onboarding={item.onboarding}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex h-9 w-full min-w-0 items-center gap-3 rounded-control px-3 text-copy',
        'transition-[background-color,color] duration-150 ease-snappy',
        FOCUS_RING,
        isActive
          ? 'bg-rail-active font-semibold text-rail-active-ink group-data-[pill=on]/nav:bg-transparent'
          : 'font-medium text-rail-ink/86 hover:bg-rail-hover hover:text-rail-ink'
      )}
    >
      <IconComponent
        {...NAV_ICON}
        aria-hidden="true"
        className={cn(
          'shrink-0 transition-colors duration-150',
          isActive ? 'text-rail-active-ink' : 'text-rail-muted group-hover:text-rail-ink'
        )}
      />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  )
}

/** The groups under their headings: the same list for the rail and the drawer. */
function NavGroups({ dict, activeHref, isAdmin }: {
  dict: ReturnType<typeof getDashboardDictionary>
  activeHref: string | null
  isAdmin: boolean
}) {
  const groups: { key: SidebarLabelKey; items: readonly NavItem[] }[] = [
    ...navGroupKeys.map((g) => ({ key: g.groupKey, items: g.items })),
    ...(isAdmin ? [{ key: 'system' as SidebarLabelKey, items: adminItemKeys }] : []),
  ]
  return (
    <>
      {groups.map((group) => (
        group.items.length === 0 ? null : (
          <div key={group.key}>
            <p className="mb-1.5 px-3 text-overline font-semibold text-rail-section ltr:uppercase ltr:tracking-wider">
              {dict.sidebar[group.key]}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} isActive={item.href === activeHref} label={navLabel(dict, item)} />
                </li>
              ))}
            </ul>
          </div>
        )
      ))}
    </>
  )
}

/**
 * The mark and the product name (UX review, decision 1): the light-blue Go Top
 * mark as inline SVG at 28px, 10px from a two-line wordmark. The name is the
 * brand, in Latin, in both languages.
 */
function Brand({ logoAlt }: { logoAlt: string }) {
  return (
    <Link
      href="/dashboard"
      className={cn('flex min-w-0 items-center gap-2.5 rounded-control', FOCUS_RING)}
    >
      <GoTopMark size={28} label={logoAlt} className="shrink-0" />
      <span className="flex min-w-0 flex-col" dir="ltr">
        <span className="text-[0.9375rem] font-semibold leading-5 text-rail-ink">Rankings</span>
        <span className="text-overline font-medium text-rail-tagline">by Go Top</span>
      </span>
    </Link>
  )
}

interface SidebarProps {
  isAdmin?: boolean
}

const WHATSAPP_SUPPORT =
  'https://wa.me/972549489377?text=%D7%94%D7%99%D7%99%2C%20%D7%90%D7%A0%D7%99%20%D7%A6%D7%A8%D7%99%D7%9A%20%D7%AA%D7%9E%D7%99%D7%9B%D7%94'

const QUIET_ROW = cn(
  'group flex h-9 w-full items-center gap-3 rounded-control px-3 text-copy font-medium text-rail-ink/86 transition-colors duration-150 hover:bg-rail-hover hover:text-rail-ink',
  FOCUS_RING
)

/** Support, the two preferences and logout: the same foot on the rail and in the drawer. */
function RailFoot({ dict, isAdmin }: { dict: ReturnType<typeof getDashboardDictionary>; isAdmin: boolean }) {
  return (
    <div className="space-y-2">
      {!isAdmin && (
        <a
          href={WHATSAPP_SUPPORT}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={dict.sidebar.supportAria}
          data-support="whatsapp"
          className={QUIET_ROW}
        >
          <WhatsAppGlyph size={NAV_ICON.size} className="shrink-0 text-rail-muted transition-colors duration-150 group-hover:text-whatsapp" />
          <span>{dict.sidebar.support}</span>
        </a>
      )}
      <div className="grid grid-cols-2 gap-2 px-1">
        <DashboardLanguageSwitcher />
        <ThemeToggle />
      </div>
      <form action="/api/auth/signout" method="post">
        <button type="submit" className={QUIET_ROW}>
          <LogOut {...NAV_ICON} aria-hidden="true" className="shrink-0 text-rail-muted group-hover:text-rail-ink" />
          <span>{dict.common.logout}</span>
        </button>
      </form>
    </div>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Sidebar({ isAdmin = false }: SidebarProps) {
  const pathname = usePathname() ?? ''
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const activeHref = activeNavHref(pathname, isAdmin ? [...navItemKeys, ...adminItemKeys] : navItemKeys)

  // Phones: the nav is a drawer behind one button. It is open AT a pathname:
  // navigating anywhere closes it without an effect, because the pathname it was
  // opened at is no longer the current one.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null)
  const menuOpen = menuOpenAt !== null && menuOpenAt === pathname
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)
  // Opened or closed by the guided tour (lib/shell/nav-drawer.ts): focus stays in
  // the tour's bubble instead of moving into the drawer and back to the button.
  const tourDrivenRef = useRef(false)

  useEffect(() => {
    const onRequest = (e: Event) => {
      const { open, restoreFocus } = (e as CustomEvent<NavDrawerRequest>).detail ?? { open: false, restoreFocus: true }
      tourDrivenRef.current = !restoreFocus
      setMenuOpenAt(open ? pathname : null)
    }
    window.addEventListener(NAV_DRAWER_EVENT, onRequest)
    return () => window.removeEventListener(NAV_DRAWER_EVENT, onRequest)
  }, [pathname])

  // The drawer is modal: focus moves into it, the page behind does not scroll,
  // and when it closes focus returns to the button that opened it.
  useEffect(() => {
    if (menuOpen) {
      if (!tourDrivenRef.current) drawerRef.current?.querySelector<HTMLElement>('[data-drawer-close]')?.focus()
      const root = document.documentElement
      const previous = root.style.overflow
      root.style.overflow = 'hidden'
      wasOpenRef.current = true
      return () => { root.style.overflow = previous }
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false
      if (!tourDrivenRef.current) menuButtonRef.current?.focus()
    }
  }, [menuOpen])

  /** Escape closes; Tab and Shift+Tab stay inside the drawer. */
  function onDrawerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setMenuOpenAt(null)
      return
    }
    if (e.key !== 'Tab' || !drawerRef.current) return
    const items = [...drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  // The desktop rail's active fill is ONE element that slides between entries
  // (200ms). It is placed from the DOM, not from state: no re-render, and the
  // first placement jumps instead of sliding in from the top.
  const railRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const rail = railRef.current
    const pill = pillRef.current
    if (!rail || !pill) return
    const active = rail.querySelector<HTMLElement>('a[aria-current="page"]')
    if (!active || active.offsetHeight === 0) {
      rail.dataset.pill = 'off'
      return
    }
    pill.style.height = `${active.offsetHeight}px`
    pill.style.transform = `translateY(${active.offsetTop}px)`
    rail.dataset.pill = 'on'
    const frame = requestAnimationFrame(() => { pill.dataset.slide = 'on' })
    return () => cancelAnimationFrame(frame)
  }, [activeHref, isAdmin, language])

  return (
    // On a phone the rail takes no height of its own: it is a zero-height strip
    // that sticks to the top, and its one visible control, the menu button, sits
    // at the start of the top bar's row (which leaves room for it), so the phone
    // has ONE 56px bar instead of a navy brand bar above the top bar.
    <aside className="sticky top-0 z-40 h-0 w-full text-rail-ink md:relative md:h-auto md:w-64 md:shrink-0 md:border-e md:border-rail-line md:bg-rail">
      <div className="flex flex-col md:sticky md:top-0 md:h-dvh">
        {/* Brand — 64px on the rail. On a phone only the menu button, in the top bar's row. */}
        <div className="absolute start-0 top-0 flex h-14 shrink-0 items-center ps-3 md:static md:h-16 md:justify-between md:gap-3 md:px-4">
          <span className="hidden md:contents"><Brand logoAlt={dict.sidebar.logoAlt} /></span>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpenAt(pathname)}
            aria-expanded={menuOpen}
            aria-controls="app-nav-drawer"
            aria-haspopup="dialog"
            aria-label={dict.sidebar.openMenu}
            data-nav-menu-button=""
            className="inline-flex size-10 items-center justify-center rounded-control border border-line bg-surface text-ink shadow-card transition-colors hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action md:hidden"
          >
            <Menu size={NAV_ICON.size} strokeWidth={NAV_ICON.strokeWidth} aria-hidden="true" />
          </button>
        </div>

        {/* Phones: a drawer from the logical start (the right in Hebrew), over a
            navy scrim, with the rail's groups, support, the preferences and logout. */}
        {menuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div aria-hidden="true" data-drawer-scrim="" onClick={() => setMenuOpenAt(null)} className="scrim-in absolute inset-0 bg-scrim" />
            <div
              ref={drawerRef}
              id="app-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label={dict.sidebar.navLabel}
              onKeyDown={onDrawerKeyDown}
              className="drawer-start absolute inset-y-0 start-0 flex w-[85vw] max-w-[22rem] flex-col bg-rail text-rail-ink shadow-pop"
            >
              <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-rail-line px-4">
                <Brand logoAlt={dict.sidebar.logoAlt} />
                <button
                  type="button"
                  data-drawer-close=""
                  onClick={() => setMenuOpenAt(null)}
                  aria-label={dict.sidebar.closeMenu}
                  className={cn('inline-flex size-10 items-center justify-center rounded-control text-rail-ink transition-colors hover:bg-rail-hover', FOCUS_RING)}
                >
                  <X size={NAV_ICON.size} strokeWidth={NAV_ICON.strokeWidth} aria-hidden="true" />
                </button>
              </div>
              <nav aria-label={dict.sidebar.navLabel} className="flex-1 overflow-y-auto px-3 py-4">
                <div className="space-y-5">
                  <NavGroups dict={dict} activeHref={activeHref} isAdmin={isAdmin} />
                </div>
              </nav>
              <div className="shrink-0 border-t border-rail-line px-3 py-3">
                <RailFoot dict={dict} isAdmin={isAdmin} />
              </div>
            </div>
          </div>
        )}

        {/* Desktop: the same groups, with the sliding active fill behind them. */}
        <nav aria-label={dict.sidebar.navLabel} className="hidden flex-1 overflow-y-auto px-3 py-4 md:block">
          <div ref={railRef} data-pill="off" className="group/nav relative space-y-5">
            <span
              ref={pillRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 hidden rounded-control bg-rail-active group-data-[pill=on]/nav:block data-[slide=on]:transition-transform data-[slide=on]:duration-200 data-[slide=on]:ease-snappy"
            />
            <NavGroups dict={dict} activeHref={activeHref} isAdmin={isAdmin} />
          </div>
        </nav>

        {/* Desktop foot: support, then the two preferences, then logout. */}
        <div className="hidden shrink-0 border-t border-rail-line px-3 py-3 md:block">
          <RailFoot dict={dict} isAdmin={isAdmin} />
        </div>
      </div>
    </aside>
  )
}
