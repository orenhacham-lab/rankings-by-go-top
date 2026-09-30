'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { BarChart3, ChevronDown, FileText, MapPin, Menu, Search, Sparkles, Telescope, X, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import GoTopMark from '@/components/brand/GoTopMark'
import { buttonClasses } from '@/components/public/marketing'
import { cn } from '@/lib/utils'
import { LanguageSwitcher } from './LanguageSwitcher'
import { authHref } from '@/lib/i18n/auth-href'
import { ContactMenu, ContactRows } from '@/components/public/ContactMenu'

/**
 * The public site's top bar, in the app's own vocabulary: the Go Top mark and
 * the "Go Top SEO" lockup from the rail, copy-sized links, one primary
 * button. Transparent over the hero's paper, a hairline and a blur once the page
 * scrolls. The features menu opens on hover AND on keyboard focus.
 *
 * `tone="inverse"` (wave 8, UX decision D) is for a page whose hero is navy
 * (home, About): transparent with white ink over the hero, and the usual canvas
 * with a blur once the page has scrolled 80px. The last text item, "צרו קשר",
 * opens the contact menu (UX decision C).
 */
export function PublicNav({ locale = 'he', tone = 'default' }: { locale?: Locale; tone?: 'default' | 'inverse' } = {}) {
  const pathname = usePathname() ?? '/'
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [featuresOpen, setFeaturesOpen] = useState(false)

  const dict = getPublicDictionary(locale)
  const prefix = locale === 'en' ? '/en' : ''
  // The auth pages in THIS page's language (lib/i18n/auth-href.ts).
  const signupHref = authHref('signup', locale)
  const loginHref = authHref('login', locale)

  const scrollThreshold = tone === 'inverse' ? 80 : 8
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > scrollThreshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [scrollThreshold])
  // White ink while the bar is still over a navy hero.
  const onDark = tone === 'inverse' && !scrolled && !mobileOpen

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthed(!!data.user)
      setAuthChecked(true)
    })
  }, [])

  const links = [
    { href: `${prefix}/` === '/en/' ? '/en' : `${prefix}/`, label: dict.nav.home },
    { href: `${prefix}/free-check`, label: dict.nav.freeCheck },
    { href: `${prefix}/pricing`, label: dict.nav.pricing },
    { href: `${prefix}/articles`, label: dict.nav.articles },
    { href: `${prefix}/about`, label: dict.nav.about },
  ]

  const homeLink = links[0]
  const restLinks = links.slice(1)
  const isActive = (href: string) => (href === '/' || href === '/en' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`))

  const featureItems: { id: string; href: string; label: string; description: string; icon: LucideIcon }[] = [
    {
      id: 'contentPublishing',
      href: `${prefix}/features/seo-geo-content-publishing`,
      label: dict.nav.featuresMenu.contentPublishing.label,
      description: dict.nav.featuresMenu.contentPublishing.description,
      icon: FileText,
    },
    {
      id: 'googleOrganic',
      href: `${prefix}/features/google-organic-rank-tracking`,
      label: dict.nav.featuresMenu.googleOrganic.label,
      description: dict.nav.featuresMenu.googleOrganic.description,
      icon: Search,
    },
    {
      id: 'googleMaps',
      href: `${prefix}/features/google-maps-rank-tracking`,
      label: dict.nav.featuresMenu.googleMaps.label,
      description: dict.nav.featuresMenu.googleMaps.description,
      icon: MapPin,
    },
    {
      id: 'aiVisibility',
      href: `${prefix}/features/ai-visibility-tracking`,
      label: dict.nav.featuresMenu.aiVisibility.label,
      description: dict.nav.featuresMenu.aiVisibility.description,
      icon: Sparkles,
    },
    {
      id: 'reports',
      href: `${prefix}/features/seo-geo-reports`,
      label: dict.nav.featuresMenu.reports.label,
      description: dict.nav.featuresMenu.reports.description,
      icon: BarChart3,
    },
    {
      id: 'keywordResearch',
      href: `${prefix}/features/keyword-research`,
      label: dict.nav.featuresMenu.keywordResearch.label,
      description: dict.nav.featuresMenu.keywordResearch.description,
      icon: Telescope,
    },
  ]
  const featuresActive = pathname.includes('/features/')

  const linkClass = (active: boolean) =>
    cn(
      'inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-copy font-medium transition-[background-color,color] duration-150 ease-snappy',
      'focus-visible:outline-none focus-visible:ring-4',
      onDark
        ? cn('focus-visible:ring-white/40', active ? 'bg-white/15 text-contrast-ink' : 'text-contrast-ink/85 hover:bg-white/10 hover:text-contrast-ink')
        : cn('focus-visible:ring-action/20', active ? 'bg-sunk text-ink' : 'text-body hover:bg-sunk hover:text-ink'),
    )

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-150 ease-snappy',
        scrolled || mobileOpen ? 'border-line bg-canvas/90 backdrop-blur-md' : 'border-transparent bg-transparent',
      )}
    >
      {/* max-w-7xl: seven links, the language switch and two buttons need the room from xl */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4 lg:h-[4.5rem]">
          {/* The lockup, as on the rail */}
          <Link
            href={prefix === '/en' ? '/en' : '/'}
            className="flex shrink-0 items-center gap-2.5 rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
            aria-label={dict.nav.homeAria}
          >
            <GoTopMark size={32} className="shrink-0" />
            <span className="flex flex-col" dir="ltr">
              <span className={cn('text-section font-semibold leading-5', onDark ? 'text-contrast-ink' : 'text-ink')}>Go Top</span>
              <span className={cn('text-overline font-semibold', onDark ? 'text-rail-tagline' : 'text-action')}>SEO</span>
            </span>
          </Link>

          {/* Desktop Menu */}
          <nav className="hidden items-center gap-0.5 whitespace-nowrap xl:flex" aria-label={dict.nav.primaryAria}>
            <Link key={homeLink.href} href={homeLink.href} className={linkClass(isActive(homeLink.href))}>
              {homeLink.label}
            </Link>
            {/* Features Dropdown */}
            <div className="group relative">
              <button type="button" className={linkClass(featuresActive)} aria-haspopup="true">
                {dict.nav.features}
                <ChevronDown className="size-4 transition-transform duration-150 ease-snappy group-focus-within:rotate-180 group-hover:rotate-180" aria-hidden="true" />
              </button>
              <div className="invisible absolute start-0 top-full z-50 pt-2 opacity-0 transition-[opacity,visibility] duration-150 ease-snappy group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="grid w-[30rem] grid-cols-1 gap-0.5 rounded-card border border-line bg-surface p-2 shadow-pop">
                  {featureItems.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="flex items-start gap-3 rounded-inset p-3 transition-[background-color] duration-150 ease-snappy hover:bg-sunk focus-visible:bg-sunk focus-visible:outline-none"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action" aria-hidden="true">
                        <item.icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-copy font-semibold text-ink">{item.label}</span>
                        <span className="mt-0.5 block text-caption text-muted">{item.description}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            {restLinks.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(isActive(link.href))}>
                {link.label}
              </Link>
            ))}
            <ContactMenu locale={locale} linkClassName={linkClass(false)} />
          </nav>

          {/* CTA Buttons + Language Switcher */}
          <div className="hidden items-center gap-1 lg:ms-auto lg:flex xl:ms-0">
            <LanguageSwitcher locale={locale} inverse={onDark} />
            {!authChecked ? (
              <div className="h-10 w-40" />
            ) : isAuthed ? (
              <Link href="/dashboard" className={buttonClasses('primary', 'md', 'ms-2')}>
                {dict.nav.toDashboard}
              </Link>
            ) : (
              <>
                <Link href={loginHref} className={buttonClasses(onDark ? 'ghost-inverse' : 'ghost', 'md')}>
                  {dict.nav.login}
                </Link>
                <Link href={signupHref} className={buttonClasses('primary', 'md', 'ms-1')}>
                  {dict.nav.startFree}
                </Link>
              </>
            )}
          </div>

          {/* Mobile Hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className={cn(
              'flex size-10 items-center justify-center rounded-control transition-[background-color] duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4 xl:hidden',
              onDark ? 'text-contrast-ink hover:bg-white/10 focus-visible:ring-white/40' : 'text-ink hover:bg-sunk focus-visible:ring-action/20',
            )}
            aria-label={mobileOpen ? dict.nav.closeMenu : dict.nav.menu}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="max-h-[calc(100dvh-4rem)] animate-pop-in overflow-y-auto border-t border-line bg-surface shadow-pop xl:hidden">
          <div className="px-4 py-4 sm:px-6">
            <nav className="flex flex-col gap-0.5" aria-label={dict.nav.primaryAria}>
              <Link
                key={homeLink.href}
                href={homeLink.href}
                onClick={() => setMobileOpen(false)}
                className={cn(linkClass(isActive(homeLink.href)), 'h-11')}
              >
                {homeLink.label}
              </Link>
              {/* Features Dropdown Mobile */}
              <button
                type="button"
                onClick={() => setFeaturesOpen(!featuresOpen)}
                aria-expanded={featuresOpen}
                className={cn(linkClass(featuresActive), 'h-11 w-full justify-between')}
              >
                {dict.nav.features}
                <ChevronDown className={cn('size-4 transition-transform duration-150 ease-snappy', featuresOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {featuresOpen && (
                <div className="mb-1 ms-3 space-y-0.5 border-s border-line ps-2">
                  {featureItems.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => {
                        setMobileOpen(false)
                        setFeaturesOpen(false)
                      }}
                      className="flex items-center gap-3 rounded-inset px-2 py-2 hover:bg-sunk"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action" aria-hidden="true">
                        <item.icon className="size-4" />
                      </span>
                      <span className="text-copy font-medium text-ink">{item.label}</span>
                    </Link>
                  ))}
                </div>
              )}
              {restLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(linkClass(isActive(link.href)), 'h-11')}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            {/* Contact: the same three rows as the desktop menu */}
            <div className="mt-3 border-t border-line pt-3" data-mobile-contact>
              <p className="px-3 pb-1 text-caption font-semibold text-muted">{dict.nav.contact}</p>
              <ContactRows locale={locale} onPick={() => setMobileOpen(false)} />
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              <LanguageSwitcher locale={locale} className="self-start" />
              {isAuthed ? (
                <Link href="/dashboard" onClick={() => setMobileOpen(false)} className={buttonClasses('primary', 'lg', 'w-full')}>
                  {dict.nav.toDashboard}
                </Link>
              ) : (
                <>
                  <Link href={loginHref} onClick={() => setMobileOpen(false)} className={buttonClasses('secondary', 'lg', 'w-full')}>
                    {dict.nav.login}
                  </Link>
                  <Link href={signupHref} onClick={() => setMobileOpen(false)} className={buttonClasses('primary', 'lg', 'w-full')}>
                    {dict.nav.startFree}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
