'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { LanguageSwitcher } from './LanguageSwitcher'

export function PublicNav({ locale = 'he' }: { locale?: Locale } = {}) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [featuresOpen, setFeaturesOpen] = useState(false)

  const dict = getPublicDictionary(locale)
  const prefix = locale === 'en' ? '/en' : ''
  const signupHref = locale === 'en' ? '/en/signup' : '/signup'
  const loginHref = locale === 'en' ? '/en/login' : '/login'

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
    { href: `${prefix}/` === '/en/' ? '/en' : `${prefix}/`, label: dict.nav.home },
    { href: `${prefix}/pricing`, label: dict.nav.pricing },
    { href: `${prefix}/articles`, label: dict.nav.articles },
    { href: `${prefix}/about`, label: dict.nav.about },
  ]

  const featureItems = [
    {
      id: 'googleOrganic',
      href: `${prefix}/features/google-organic-rank-tracking`,
      label: dict.nav.featuresMenu.googleOrganic.label,
      description: dict.nav.featuresMenu.googleOrganic.description,
    },
    {
      id: 'googleMaps',
      href: `${prefix}/features/google-maps-rank-tracking`,
      label: dict.nav.featuresMenu.googleMaps.label,
      description: dict.nav.featuresMenu.googleMaps.description,
    },
    {
      id: 'aiVisibility',
      href: `${prefix}/features/ai-visibility-tracking`,
      label: dict.nav.featuresMenu.aiVisibility.label,
      description: dict.nav.featuresMenu.aiVisibility.description,
    },
    {
      id: 'reports',
      href: `${prefix}/features/seo-geo-reports`,
      label: dict.nav.featuresMenu.reports.label,
      description: dict.nav.featuresMenu.reports.description,
    },
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
        <div className="flex items-center justify-between h-20 lg:h-28">
          {/* Logo */}
          <Link href={prefix === '/en' ? '/en' : '/'} className="flex items-center shrink-0 group">
            <Image
              src="/gotop-primary.png"
              alt="Go Top"
              width={270}
              height={108}
              className="h-[72px] lg:h-24 w-auto group-hover:opacity-80 transition-opacity"
              priority
            />
          </Link>

          {/* Desktop Menu */}
          <nav className="hidden lg:flex items-center gap-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-lg font-medium text-slate-700 hover:text-blue-600 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {/* Features Dropdown */}
            <div className="relative group">
              <button
                className="text-lg font-medium text-slate-700 hover:text-blue-600 transition-colors flex items-center gap-1.5"
                aria-haspopup="true"
              >
                {dict.nav.features}
                <svg
                  className="w-4 h-4 transition-transform group-hover:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
              <div className="absolute top-full left-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 py-2 z-50">
                {featureItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block px-4 py-3 hover:bg-blue-50 transition-colors"
                  >
                    <div className="font-medium text-slate-900">{item.label}</div>
                    <div className="text-sm text-slate-600 mt-1">{item.description}</div>
                  </Link>
                ))}
              </div>
            </div>
          </nav>

          {/* CTA Buttons + Language Switcher */}
          <div className="hidden lg:flex items-center gap-4">
            <LanguageSwitcher locale={locale} />
            {!authChecked ? (
              <div className="w-32 h-10" />
            ) : isAuthed ? (
              <Link
                href="/dashboard"
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-semibold shadow-sm hover:shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all"
              >
                {dict.nav.toDashboard}
              </Link>
            ) : (
              <>
                <Link
                  href={loginHref}
                  className="px-4 py-2 text-lg font-medium text-slate-700 hover:text-blue-600 transition-colors"
                >
                  {dict.nav.login}
                </Link>
                <Link
                  href={signupHref}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-semibold shadow-sm hover:shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all"
                >
                  {dict.nav.startFree}
                </Link>
              </>
            )}
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label={dict.nav.menu}
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
              {/* Features Dropdown Mobile */}
              <div className="px-3 py-3">
                <button
                  onClick={() => setFeaturesOpen(!featuresOpen)}
                  className="w-full text-left text-base font-medium text-slate-700 hover:text-blue-600 transition-colors flex items-center justify-between"
                >
                  {dict.nav.features}
                  <svg
                    className={`w-4 h-4 transition-transform ${featuresOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
                {featuresOpen && (
                  <div className="mt-2 space-y-2 border-l-2 border-slate-200 pl-2">
                    {featureItems.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={() => {
                          setMobileOpen(false)
                          setFeaturesOpen(false)
                        }}
                        className="block px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <div className="text-sm font-medium text-slate-900">{item.label}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{item.description}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </nav>
            <div className="border-t border-slate-200 mt-4 pt-4 flex flex-col gap-2">
              <div className="px-3 py-2">
                <LanguageSwitcher locale={locale} />
              </div>
              {isAuthed ? (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-center text-sm font-semibold"
                >
                  {dict.nav.toDashboard}
                </Link>
              ) : (
                <>
                  <Link
                    href={loginHref}
                    onClick={() => setMobileOpen(false)}
                    className="px-4 py-3 rounded-lg border border-slate-200 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {dict.nav.login}
                  </Link>
                  <Link
                    href={signupHref}
                    onClick={() => setMobileOpen(false)}
                    className="px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-center text-sm font-semibold"
                  >
                    {dict.nav.startFree}
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
