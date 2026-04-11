'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'לוח בקרה', icon: '📊' },
  { href: '/clients', label: 'לקוחות', icon: '👥' },
  { href: '/projects', label: 'פרויקטים', icon: '📁' },
  { href: '/keywords', label: 'מילות מפתח', icon: '🔑' },
  { href: '/scans', label: 'סריקות', icon: '🔍' },
  { href: '/reports', label: 'דוחות', icon: '📄' },
  { href: '/billing', label: 'מנוי ותשלום', icon: '💳' },
]

const adminItems = [
  { href: '/setup', label: 'סטטוס חיבור', icon: '🔌' },
  { href: '/admin/logs', label: 'לוג שגיאות', icon: '📋' },
]

interface SidebarProps {
  isAdmin?: boolean
}

export default function Sidebar({ isAdmin = false }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-white border-l border-slate-200 flex flex-col h-full fixed top-0 right-0 z-40 shadow-sm">
      {/* Logo */}
      <div className="p-5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            GT
          </div>
          <div>
            <div className="font-bold text-slate-800 text-sm leading-tight">Rankings by</div>
            <div className="font-bold text-blue-600 text-sm leading-tight">Go Top</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
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

      {/* Admin section — only shown to admins */}
      {isAdmin && (
        <div className="px-3 pb-3">
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
      )}

      {/* Support link — shown to non-admins */}
      {!isAdmin && (
        <div className="px-3 pb-3">
          <a
            href="mailto:oren@gotop.co.il"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <span className="text-base">💬</span>
            <span>תמיכה</span>
          </a>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-slate-200">
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
