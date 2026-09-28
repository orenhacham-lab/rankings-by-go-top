/**
 * The one layout behind the long-form documents: terms, privacy and the
 * accessibility statement, Hebrew and English. A page hands over its title, its
 * breadcrumb and its sections as plain semantic markup (section, h2, p, ul,
 * strong, a); the reading styles live here, once, on tokens, so the six
 * documents cannot drift apart and none of them carries a colour of its own.
 *
 * The sitemap pages reuse the same frame through `LegalFrame`.
 */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import type { Locale } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'
import { CONTAINER } from './marketing'

type Crumb = { label: string; href: string }

/** Reading styles for the document body, applied to plain descendants. */
export const LEGAL_PROSE = cn(
  'space-y-8 text-copy leading-7 text-body',
  '[&_h2]:mb-3 [&_h2]:text-section [&_h2]:font-semibold [&_h2]:text-ink',
  '[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-copy [&_h3]:font-semibold [&_h3]:text-ink',
  '[&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:ps-6 [&_ul]:marker:text-muted',
  '[&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:ps-6',
  '[&_strong]:font-semibold [&_strong]:text-ink',
  '[&_a]:rounded-control [&_a]:font-medium [&_a]:text-action [&_a]:underline-offset-4 [&_a:hover]:underline',
  '[&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-4 [&_a]:focus-visible:ring-action/20',
)

/** The page frame: nav, breadcrumb, one surface card, footer. */
export function LegalFrame({
  locale, breadcrumbs, children,
}: {
  locale: Locale
  breadcrumbs: Crumb[]
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale={locale} />
      <main className="flex-1">
        <div className={cn(CONTAINER, 'max-w-3xl pt-28 pb-16 lg:pt-32 lg:pb-20')}>
          <Breadcrumbs items={breadcrumbs} locale={locale} />
          <div className="mt-6 rounded-card border border-line bg-surface p-6 shadow-card sm:p-10">
            {children}
          </div>
        </div>
      </main>
      <Footer locale={locale} />
    </div>
  )
}

export function LegalHeader({ title, subtitle }: { title: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <header className="mb-8 border-b border-line pb-6">
      <h1 className="text-title font-bold tracking-tight text-ink text-balance sm:text-display">{title}</h1>
      {subtitle && <p className="mt-2 text-copy text-muted">{subtitle}</p>}
    </header>
  )
}

export function LegalDoc({
  locale, breadcrumbs, title, subtitle, children,
}: {
  locale: Locale
  breadcrumbs: Crumb[]
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <LegalFrame locale={locale} breadcrumbs={breadcrumbs}>
      <article>
        <LegalHeader title={title} subtitle={subtitle} />
        <div className={LEGAL_PROSE}>{children}</div>
      </article>
    </LegalFrame>
  )
}

/** The "last updated" line at the end of a document. */
export const LEGAL_FOOTNOTE = 'border-t border-line pt-6 text-caption text-muted'

export type SitemapGroup = { title: string; description?: string; links: Array<{ label: string; href: string }> }

/** The sitemap's link groups: two columns from the small breakpoint up. */
export function SitemapGroups({ groups }: { groups: SitemapGroup[] }) {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-x-10">
      {groups.map((group) => (
        <section key={group.title}>
          <h2 className="mb-3 text-section font-semibold text-ink">{group.title}</h2>
          {group.description && <p className="mb-3 text-copy text-muted">{group.description}</p>}
          <ul className="space-y-1">
            {group.links.map((link) => (
              <li key={`${group.title}-${link.href}-${link.label}`}>
                <Link
                  href={link.href}
                  className="group -mx-2 flex min-h-9 items-center gap-2 rounded-control px-2 text-copy text-body transition-colors duration-150 ease-snappy hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                >
                  <ChevronRight className="size-4 shrink-0 text-muted transition-colors duration-150 ease-snappy group-hover:text-action rtl:-scale-x-100" aria-hidden="true" />
                  <span>{link.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Inline links inside a document's closing note. */
export const LEGAL_LINK = 'rounded-control font-medium text-action underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20'
