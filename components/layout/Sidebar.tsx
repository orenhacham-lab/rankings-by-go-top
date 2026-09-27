'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { DashboardLanguageSwitcher } from '@/components/DashboardLanguageSwitcher'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  KeyRound,
  Sparkles,
  Search,
  FileText,
  CreditCard,
  Plug,
  ClipboardList,
  LogOut,
  MessageCircle,
  Lightbulb,
  Newspaper,
  Settings,
  CalendarRange,
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

/** Read as literal member expressions, which is what lets Next inline them. */
const CONTENT_FLAGS = {
  NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION: process.env.NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION,
}

const CONTENT_SCREEN_ICONS: Record<ContentScreenKey, LucideIcon> = {
  strategy: CalendarRange,
  articles: Newspaper,
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
 * Desktop renders the group headings. Mobile deliberately does not: the nav
 * there is a two-column grid of tiles, where four headings would cost more
 * vertical space than the tiles they label. The order is identical in both,
 * so the grouping still governs what sits next to what.
 */
const navGroupKeys: readonly NavGroup[] = [
  {
    groupKey: 'groupMain',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: BarChart3 },
    ],
  },
  {
    groupKey: 'groupResearch',
    items: [
      { href: '/keyword-research', labelKey: 'keywordResearch', icon: Lightbulb, onboarding: 'keyword-research' },
      { href: '/keywords', labelKey: 'keywords', icon: KeyRound },
      ...contentNavItems,
    ],
  },
  {
    groupKey: 'groupMonitoring',
    items: [
      ...aiVisibilityNavItems,
      { href: '/scans', labelKey: 'scans', icon: Search },
      { href: '/reports', labelKey: 'reports', icon: FileText, onboarding: 'reports' },
    ],
  },
  {
    groupKey: 'groupAccount',
    items: [
      { href: '/settings', labelKey: 'projectSettings', icon: Settings },
      { href: '/billing', labelKey: 'billing', icon: CreditCard },
    ],
  },
]

/** Flattened in group order — what the mobile grid renders, and what a guard can
 *  assert the active-entry resolution against. */
export const navItemKeys = navGroupKeys.flatMap((g) => g.items)

const adminItemKeys = [
  { href: '/admin/articles', labelKey: 'articleManagement' as const, icon: FileText },
  { href: '/setup', labelKey: 'connectionStatus' as const, icon: Plug },
  { href: '/admin/logs', labelKey: 'errorLogs' as const, icon: ClipboardList },
]

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

/**
 * One nav entry, shared by the mobile menu and the desktop groups so the two
 * cannot drift apart. The tile shape (stacked icon over label) is the mobile
 * presentation; `md:` restores the row shape used in the sidebar proper.
 *
 * The active entry is a translucent cobalt fill on the ink rail, with a short
 * glowing bar on the sidebar's outer edge — the logical START, so it sits on the right in Hebrew and on the left in
 * English. A filled accent block would outshout every button on the screen.
 */
function NavLink({ item, isActive, label }: { item: NavItem; isActive: boolean; label: string }) {
  const IconComponent = item.icon
  return (
    <Link
      href={item.href}
      data-onboarding={item.onboarding}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative w-full min-w-0 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1.5 md:gap-3 px-2 md:px-3 py-3 md:py-0 md:h-9 rounded-control text-caption md:text-copy font-medium text-center md:text-start leading-tight break-words',
        'transition-[background-color,color] duration-150 ease-snappy',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-accent focus-visible:ring-inset',
        isActive
          ? 'bg-rail-active text-rail-ink font-semibold'
          : 'text-rail-muted hover:bg-rail-hover hover:text-rail-ink'
      )}
    >
      {isActive && (
        <span aria-hidden="true" className="absolute hidden md:block inset-y-1.5 -start-3 w-[3px] rounded-e-full bg-rail-accent shadow-[0_0_12px_rgb(157_180_255/0.7)]" />
      )}
      <IconComponent
        size={18}
        className={cn(
          'shrink-0 transition-colors duration-150',
          isActive ? 'text-rail-accent' : 'text-rail-label group-hover:text-rail-ink'
        )}
        strokeWidth={isActive ? 2.2 : 1.8}
      />
      <span className="min-w-0 truncate md:whitespace-nowrap">{label}</span>
    </Link>
  )
}

/** The mark and the product name. The name is the brand, in Latin, in both languages. */
function Brand({ logoAlt }: { logoAlt: string }) {
  return (
    <Link
      href="/dashboard"
      className="flex min-w-0 items-center gap-1 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-accent"
    >
      {/* The rail is ink in both themes, so the mark is always the one drawn for a dark ground. */}
      <Image
        src="/gotop-dark-transparent.png"
        alt={logoAlt}
        width={500}
        height={500}
        className="size-14 shrink-0 object-contain"
        sizes="56px"
        priority
      />
      <span className="flex min-w-0 flex-col" dir="ltr">
        <span className="text-[1.0625rem] font-bold leading-tight tracking-tight text-rail-ink">Rankings</span>
        <span className="text-overline font-medium text-rail-muted">by Go Top</span>
      </span>
    </Link>
  )
}

interface SidebarProps {
  isAdmin?: boolean
}

const WHATSAPP_SUPPORT =
  'https://wa.me/972549489377?text=%D7%94%D7%99%D7%99%2C%20%D7%90%D7%A0%D7%99%20%D7%A6%D7%A8%D7%99%D7%9A%20%D7%AA%D7%9E%D7%99%D7%9B%D7%94'

const QUIET_ROW =
  'flex w-full items-center gap-3 px-3 h-9 rounded-control text-copy font-medium text-rail-muted hover:bg-rail-hover hover:text-rail-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-accent focus-visible:ring-inset'

export default function Sidebar({ isAdmin = false }: SidebarProps) {
  const pathname = usePathname()
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const activeHref = activeNavHref(pathname ?? '', navItemKeys)
  // Phones: the nav is a menu behind one button instead of a wall of tiles above
  // every screen. It closes itself when the page changes.
  // The phone menu is open AT a pathname: navigating anywhere closes it without an effect,
  // because the pathname it was opened at is no longer the current one.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null)
  const menuOpen = menuOpenAt !== null && menuOpenAt === pathname

  return (
    <aside className="relative z-40 w-full md:w-64 md:shrink-0 bg-rail text-rail-ink border-b md:border-b-0 md:border-e border-rail-line">
      <div className="flex flex-col md:sticky md:top-0 md:h-dvh">
        {/* Brand — the same height as the top bar, so the two share one line. */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-3 md:px-4">
          <Brand logoAlt={dict.sidebar.logoAlt} />
          <button
            type="button"
            onClick={() => setMenuOpenAt(menuOpen ? null : pathname)}
            aria-expanded={menuOpen}
            aria-controls="app-nav-mobile"
            aria-label={dict.common.menu}
            className="md:hidden inline-flex size-10 items-center justify-center rounded-control border border-rail-line bg-rail-hover text-rail-ink transition-colors hover:bg-rail-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-accent"
          >
            {menuOpen ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
          </button>
        </div>

        {/* Mobile: one flat grid of tiles, then the language, the theme and logout. */}
        <div
          id="app-nav-mobile"
          className={cn(
            'md:hidden absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-rail-line bg-rail p-3 shadow-pop origin-top animate-pop-in',
            !menuOpen && 'hidden'
          )}
        >
          <nav>
            <ul className="grid grid-cols-3 gap-1.5 w-full">
              {navItemKeys.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} isActive={item.href === activeHref} label={navLabel(dict, item)} />
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-3 grid grid-cols-2 items-center gap-2 border-t border-rail-line pt-3">
            <DashboardLanguageSwitcher />
            <ThemeToggle />
          </div>
          <form action="/api/auth/signout" method="post" className="mt-1">
            <button type="submit" className={QUIET_ROW}>
              <LogOut size={18} className="shrink-0" strokeWidth={1.8} />
              <span>{dict.common.logout}</span>
            </button>
          </form>
        </div>

        {/* Desktop: the same order, split under its group headings. */}
        <nav className="hidden md:block flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-5">
            {navGroupKeys.map((group) => (
              group.items.length === 0 ? null : (
                <div key={group.groupKey}>
                  <p className="px-3 mb-1.5 text-overline font-semibold text-rail-label">
                    {dict.sidebar[group.groupKey]}
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

            {/* Admin section — only shown to admins */}
            {isAdmin && (
              <div>
                <p className="px-3 mb-1.5 text-overline font-semibold text-rail-label">{dict.sidebar.system}</p>
                <ul className="space-y-0.5">
                  {adminItemKeys.map((item) => {
                    const IconComponent = item.icon
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    const label = dict.sidebar[item.labelKey]
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'group flex items-center gap-3 px-3 h-9 rounded-control text-copy font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-accent focus-visible:ring-inset',
                            isActive ? 'bg-rail-active text-rail-ink font-semibold' : 'text-rail-muted hover:bg-rail-hover hover:text-rail-ink'
                          )}
                        >
                          <IconComponent size={18} className={cn('shrink-0 transition-colors', isActive ? 'text-rail-accent' : 'text-rail-label group-hover:text-rail-ink')} strokeWidth={1.8} />
                          <span>{label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </nav>

        {/* Footer - Desktop only: help, then the two preferences, then logout. */}
        <div className="hidden md:block shrink-0 border-t border-rail-line px-3 py-3 space-y-1">
          {!isAdmin && (
            <a href={WHATSAPP_SUPPORT} target="_blank" rel="noopener noreferrer" className={QUIET_ROW}>
              <MessageCircle size={18} className="shrink-0" strokeWidth={1.8} />
              <span>{dict.sidebar.support}</span>
            </a>
          )}
          <ThemeToggle />
          <div className="px-1 py-1">
            <DashboardLanguageSwitcher />
          </div>
          <form action="/api/auth/signout" method="post">
            <button type="submit" className={QUIET_ROW}>
              <LogOut size={18} className="shrink-0" strokeWidth={1.8} />
              <span>{dict.common.logout}</span>
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
