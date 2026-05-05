'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function PublicNav() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthed(!!data.user)
      setAuthChecked(true)
    })
  }, [])

  const links = [
    { href: '/', label: 'עמוד הבית' },
    { href: '/pricing', label: 'מחירים' },
    { href: '/articles', label: 'מאמרים' },
    { href: '/about', label: 'אודות' },
  ]

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/85 backdrop-blur-md shadow-sm border-b border-slate-200/80'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 group">
            <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-lg shadow-md group-hover:shadow-lg transition-shadow">
              GT
            </div>
            <div className="leading-tight">
              <div className="font-bold text-slate-900 text-base lg:text-lg">Rankings</div>
              <div className="text-[11px] lg:text-xs text-slate-500 -mt-0.5">by Go Top</div>
            </div>
          </Link>

          {/* Desktop Menu */}
          <nav className="hidden lg:flex items-center gap-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-base font-medium text-slate-700 hover:text-blue-600 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* CTA Buttons and Logo */}
          <div className="hidden lg:flex items-center gap-6">
            <div className="flex items-center gap-3">
              {!authChecked ? (
                <div className="w-32 h-10" />
              ) : isAuthed ? (
                <Link
                  href="/dashboard"
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-base font-semibold shadow-sm hover:shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all"
                >
                  לדאשבורד
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-4 py-2 text-base font-medium text-slate-700 hover:text-blue-600 transition-colors"
                  >
                    התחברות
                  </Link>
                  <Link
                    href="/login"
                    className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-base font-semibold shadow-sm hover:shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all"
                  >
                    התחל חינם
                  </Link>
                </>
              )}
            </div>

            {/* Go Top Logo */}
            <div className="pl-6 border-l border-slate-200">
              <Image
                src="/gotop-primary.png"
                alt="Go Top"
                width={80}
                height={40}
                className="h-auto"
              />
            </div>
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="תפריט"
          >
            <svg
              className="w-6 h-6 text-slate-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white py-4 -mx-4 sm:-mx-6 px-4 sm:px-6">
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="px-3 py-3 rounded-lg text-base font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-slate-200 mt-4 pt-4 flex flex-col gap-2">
              {isAuthed ? (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-center text-sm font-semibold"
                >
                  לדאשבורד
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="px-4 py-3 rounded-lg border border-slate-200 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    התחברות
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-center text-sm font-semibold"
                  >
                    התחל חינם
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
