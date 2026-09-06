'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'
import { DashboardLanguageSwitcher } from '@/components/DashboardLanguageSwitcher'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import {
  BarChart3,
  Users,
  Folder,
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
} from 'lucide-react'

const navItemKeys = [
  { href: '/dashboard', labelKey: 'dashboard' as const, icon: BarChart3 },
  { href: '/clients', labelKey: 'clients' as const, icon: Users, onboarding: 'clients' },
  { href: '/projects', labelKey: 'projects' as const, icon: Folder, onboarding: 'projects' },
  // Content Hub ("מרכז תוכן") sits immediately after Projects. Gated by the
  // build-time content flag (same pattern as the content section in the project
  // page); hidden entirely when off.
  ...(process.env.NEXT_PUBLIC_ENABLE_CONTENT === 'true'
    ? [{ href: '/content', labelKey: 'content' as const, icon: Newspaper }]
    : []),
  { href: '/keyword-research', labelKey: 'keywordResearch' as const, icon: Lightbulb, onboarding: 'keyword-research' },
  { href: '/keywords', labelKey: 'keywords' as const, icon: KeyRound },
  { href: '/ai-visibility', labelKey: 'aiVisibility' as const, icon: Sparkles },
  { href: '/scans', labelKey: 'scans' as const, icon: Search },
  { href: '/reports', labelKey: 'reports' as const, icon: FileText, onboarding: 'reports' },
  { href: '/billing', labelKey: 'billing' as const, icon: CreditCard },
]

const adminItemKeys = [
  { href: '/admin/articles', labelKey: 'articleManagement' as const, icon: FileText },
  { href: '/setup', labelKey: 'connectionStatus' as const, icon: Plug },
  { href: '/admin/logs', labelKey: 'errorLogs' as const, icon: ClipboardList },
]

interface SidebarProps {
  isAdmin?: boolean
}

export default function Sidebar({ isAdmin = false }: SidebarProps) {
  const pathname = usePathname()
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)

  return (
    <aside className="w-full md:w-64 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col md:h-full h-auto md:fixed md:top-0 md:right-0 z-40 shadow-sm">
      {/* Logo */}
      <div className="p-3 md:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-col items-center md:items-center justify-center gap-2 md:gap-1.5">
        {/* Mobile: logo on left of text */}
        <div className="flex md:flex-col items-center justify-center gap-2 md:gap-1.5 w-full">
          <div className="flex items-center justify-center flex-shrink-0">
            <Image
              src="/gotop-primary.png"
              alt="Go Top logo"
              width={140}
              height={56}
              className="block dark:hidden w-[51px] md:w-[93px] h-auto object-contain"
              sizes="(max-width: 768px) 51px, 93px"
              priority
            />
            <Image
              src="/gotop-dark-transparent.png"
              alt="Go Top logo"
              width={140}
              height={56}
              className="hidden dark:block w-[51px] md:w-[93px] h-auto object-contain"
              sizes="(max-width: 768px) 51px, 93px"
              priority
            />
          </div>

          <div className="text-center md:text-center">
            <div className="font-semibold text-slate-800 dark:text-slate-100 text-xs md:text-sm leading-tight">Rankings by</div>
            <div className="font-bold text-blue-600 dark:text-blue-300 text-sm md:text-base leading-tight">Go Top</div>
          </div>
        </div>
      </div>

      {/* Language Switcher - Desktop */}
      <div className="hidden md:block border-b border-slate-200 dark:border-slate-800">
        <DashboardLanguageSwitcher />
      </div>

      {/* Language Switcher - Mobile (uses same DashboardLanguageProvider state) */}
      <div className="block md:hidden border-b border-slate-200 dark:border-slate-800">
        <DashboardLanguageSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-hidden md:overflow-y-auto">
        <ul className="grid grid-cols-2 gap-2 md:block md:space-y-1 w-full">
          {navItemKeys.map((item) => {
            const IconComponent = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const label = dict.sidebar[item.labelKey]
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-onboarding={item.onboarding}
                  className={cn(
                    'group w-full min-w-0 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-3 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-medium transition-all duration-150 text-center md:text-right leading-tight break-words',
                    isActive
                      ? 'bg-indigo-600 dark:bg-indigo-600 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  )}
                >
                  <IconComponent size={18} className={cn('shrink-0 transition-colors', isActive ? 'text-white' : 'text-slate-600 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400')} strokeWidth={2} />
                  <span>{label}</span>
                </Link>
              </li>
            )
          })}

          {/* Mobile logout button - appears in grid next to Billing on mobile */}
          <li className="md:hidden">
            <form action="/api/auth/signout" method="post" className="w-full h-full">
              <button
                type="submit"
                className={cn(
                  'group w-full min-w-0 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-3 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-medium transition-all duration-150 text-center md:text-right leading-tight break-words',
                  'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                <LogOut size={18} className="text-slate-600 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0 transition-colors" strokeWidth={2} />
                <span>{dict.common.logout}</span>
              </button>
            </form>
          </li>
        </ul>
      </nav>

      {/* Admin section — only shown to admins */}
      {isAdmin && (
        <div className="px-3 pb-3 hidden md:block">
          <p className="text-xs font-medium text-slate-400 dark:text-slate-400 px-3 mb-1">{dict.sidebar.system}</p>
          <ul className="space-y-1">
            {adminItemKeys.map((item) => {
              const IconComponent = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              const label = dict.sidebar[item.labelKey]
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'bg-indigo-600 dark:bg-indigo-600 text-white shadow-md'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300'
                    )}
                  >
                    <IconComponent size={18} className={cn('shrink-0 transition-colors', isActive ? 'text-white' : 'text-slate-600 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400')} strokeWidth={2} />
                    <span>{label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Support link — shown to non-admins */}
      {!isAdmin && (
        <div className="px-3 pb-3 hidden md:block">
          <a
            href="https://wa.me/972549489377?text=%D7%94%D7%99%D7%99%2C%20%D7%90%D7%A0%D7%99%20%D7%A6%D7%A8%D7%99%D7%9A%20%D7%AA%D7%9E%D7%99%D7%9B%D7%94"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <MessageCircle size={18} className="text-slate-500 dark:text-slate-400" strokeWidth={2} />
            <span>{dict.sidebar.support}</span>
          </a>
        </div>
      )}

      {/* Footer - Mobile only */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 block md:hidden">
        <ThemeToggle />
      </div>

      {/* Footer - Desktop only */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 hidden md:block space-y-2">
        <ThemeToggle />
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="w-full text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-start gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <LogOut size={18} className="text-slate-500 dark:text-slate-400" strokeWidth={2} />
            <span>{dict.common.logout}</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
