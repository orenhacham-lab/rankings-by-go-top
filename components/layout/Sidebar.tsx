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
    <aside className="w-64 bg-white border-l border-slate-200 flex flex-col h-full fixed top-0 right-0 z-40 shadow-sm">
      {/* Logo */}
      <div className="p-5 border-b border-slate-200">
        <Image
          src="/gotop-primary.svg"
          alt="Go Top logo"
          width={150}
          height={150}
          className="h-auto w-28"
          priority
        />
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

      {/* Admin */}
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
