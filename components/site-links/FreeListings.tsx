'use client'

/**
 * Free directories and business profiles (wave 9): the sites where the owner adds
 * the business HIMSELF, for free (lib/site-links/free-listings.ts, each entry
 * checked by hand). Every business first (Google, Bing, Apple, the local
 * directories, reviews), then by field, each with who it is for and one button to
 * the site's own sign-up page. A site that already shows up in the project's
 * searches says so. Nothing here asks anyone for a link, and nothing is paid for.
 */
import { Eye } from 'lucide-react'
import SectionHeading from '@/components/ui/SectionHeading'
import SiteAvatar from '@/components/ui/SiteAvatar'
import { cn } from '@/lib/utils'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { FreeListing } from '@/lib/site-links/free-listings'
import ExternalLink from './ExternalLink'

type Copy = ReturnType<typeof getDashboardDictionary>['siteLinks']

export default function FreeListings({ copy, listings, seen }: {
  copy: Copy
  listings: readonly FreeListing[]
  /** Ids of the listings that already show up in the project's searches. */
  seen: ReadonlySet<string>
}) {
  const l = copy.listings
  const everyone = listings.filter((x) => x.fit === 'any' || x.fit === 'local')
  const byField = listings.filter((x) => x.fit !== 'any' && x.fit !== 'local')
  const groups = [
    { key: 'any', title: l.groups.any, items: everyone },
    { key: 'field', title: l.groups.field, items: byField },
  ].filter((g) => g.items.length > 0)

  return (
    <section aria-label={l.title} data-site-links="listings">
      <SectionHeading title={l.title} description={l.description} className="mb-4" />
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.key} data-listings-group={g.key}>
            <h3 className="mb-2.5 text-overline font-semibold text-muted">{g.title}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((listing) => {
                const isSeen = seen.has(listing.id)
                const name = (l.names as Record<string, string>)[listing.id] ?? listing.name
                return (
                  <li
                    key={listing.id}
                    data-listing={listing.id}
                    className={cn(
                      'flex min-w-0 flex-col rounded-card border bg-surface p-4 shadow-card sm:p-5',
                      isSeen ? 'border-action/30' : 'border-line',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <SiteAvatar domain={listing.domain} name={name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-copy font-semibold text-ink"><bdi>{name}</bdi></p>
                        <p className="mt-0.5 text-caption text-muted">{l.fit[listing.fit]}</p>
                      </div>
                    </div>
                    <p className="mt-3 flex-1 text-copy text-body text-pretty">{l.items[listing.id as keyof typeof l.items]}</p>
                    {isSeen && (
                      <p className="mt-3 inline-flex items-center gap-1.5 self-start rounded-pill bg-action-soft px-2.5 py-1 text-caption font-medium text-action" title={l.seenHint} data-listing-seen="">
                        <Eye size={13} aria-hidden="true" />
                        {l.seen}
                        <span className="sr-only">{`: ${l.seenHint}`}</span>
                      </p>
                    )}
                    <ExternalLink href={listing.url} newTabLabel={copy.opensNewTab} className="mt-4 self-start text-copy font-semibold">
                      {l.open}
                    </ExternalLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 max-w-prose text-caption text-muted text-pretty">{l.tip}</p>
    </section>
  )
}
