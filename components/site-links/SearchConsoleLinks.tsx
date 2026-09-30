'use client'

/**
 * "Links Google already found" (wave 9), for a project with Search Console connected.
 *
 * The Search Console API has no links report (lib/site-links/search-console-links.ts
 * says what was checked), so there is no number to show and none is made up: one
 * honest line, and a button that opens the Links report in Search Console on the
 * project's own property. The property comes from the Search Console status the
 * other widgets already read (components/gsc/gsc-data.ts, shared and cached); a
 * project without a property, or with Search Console off, shows nothing here.
 */
import { Search } from 'lucide-react'
import SectionHeading from '@/components/ui/SectionHeading'
import { useGscEnabled } from '@/components/gsc/GscFeature'
import { gscStatusUrl, useGscResponse } from '@/components/gsc/gsc-data'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { searchConsoleLinksUrl } from '@/lib/site-links/search-console-links'
import ExternalLink from './ExternalLink'

type Copy = ReturnType<typeof getDashboardDictionary>['siteLinks']

/** The connected property's address from the status answer, or null. */
export function connectedProperty(body: unknown): string | null {
  const b = (body ?? {}) as { ok?: unknown; connection?: { status?: unknown } | null; property?: { siteUrl?: unknown } | null }
  if (b.ok !== true || !b.connection || b.connection.status === 'revoked') return null
  const site = b.property?.siteUrl
  return typeof site === 'string' && site.trim() ? site.trim() : null
}

export default function SearchConsoleLinks({ projectId, copy }: { projectId: string; copy: Copy }) {
  const off = useGscEnabled() === false
  const { response } = useGscResponse(off ? null : gscStatusUrl(projectId))
  const property = response && response.status === 200 ? connectedProperty(response.body) : null
  const reportUrl = searchConsoleLinksUrl(property)
  if (!property || !reportUrl) return null
  const g = copy.gscLinks
  return (
    <section aria-label={g.title} data-site-links="gsc-links">
      <SectionHeading title={g.title} className="mb-3" />
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action ring-1 ring-action/10">
          <Search size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="max-w-prose text-copy text-body text-pretty">{g.body}</p>
          <p className="mt-1.5 text-caption text-muted">{g.propertyLabel} <bdi dir="ltr">{property}</bdi></p>
        </div>
        <ExternalLink href={reportUrl} newTabLabel={copy.opensNewTab} className="shrink-0 self-start text-copy font-semibold sm:self-center">
          {g.open}
        </ExternalLink>
      </div>
    </section>
  )
}
