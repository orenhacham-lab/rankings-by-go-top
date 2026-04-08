'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'לוח בקרה', icon: '📊' },
  { href: '/clients', label: 'לקוחות', icon: '👥' },
  { href: '/projects', label: 'פרויקטים', icon: '📁' },
  { href: '/keywords', label: 'מילות מפתח', icon: '🔑' },
  { href: '/scans', label: 'סריקות', icon: '🔍' },
  { href: '/reports', label: 'דוחות', icon: '📄' },
]

const adminItems = [
  { href: '/setup', label: 'סטטוס חיבור', icon: '🔌' },
  { href: '/admin/logs', label: 'לוג שגיאות', icon: '📋' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-full md:w-64 bg-white border-l border-slate-200 flex flex-col md:h-full h-auto md:fixed md:top-0 md:right-0 z-40 shadow-sm">
      {/* Logo */}
      <div className="p-4 md:p-5 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-right">
          <div className="font-bold text-slate-800 text-lg leading-tight">Rankings by</div>
          <div className="font-bold text-blue-600 text-lg leading-tight">Go Top</div>
        </div>
        <Image
          src="/gotop-primary.png"
          alt="Go Top logo"
          width={140}
          height={140}
          className="h-auto w-24 md:w-28"
          priority
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-hidden md:overflow-y-auto">
        <ul className="grid grid-cols-4 gap-2 md:block md:space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center justify-center md:justify-start gap-1.5 md:gap-3 px-2 md:px-3 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-medium transition-all duration-150 md:whitespace-nowrap',
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Admin */}
      <div className="px-3 pb-3 hidden md:block">
        <p className="text-xs font-medium text-slate-400 px-3 mb-1">מערכת</p>
        <ul className="space-y-1">
          {adminItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 hidden md:block">
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="w-full text-sm text-slate-500 hover:text-slate-700 flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <span>🚪</span>
            <span>יציאה</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
