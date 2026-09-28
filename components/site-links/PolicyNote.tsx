/**
 * Why the app does not trade links between its customers, in two sentences and
 * a link to Google's own policy. Quiet on purpose: a note, not a sermon.
 */
import { ShieldCheck } from 'lucide-react'
import ExternalLink from './ExternalLink'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Copy = ReturnType<typeof getDashboardDictionary>['siteLinks']['policy']

export const GOOGLE_LINK_SPAM_POLICY = 'https://developers.google.com/search/docs/essentials/spam-policies#link-spam'

export default function PolicyNote({ copy, newTabLabel }: { copy: Copy; newTabLabel: string }) {
  return (
    <aside aria-labelledby="site-links-policy-title" data-site-links="policy" className="rounded-card border border-line bg-sunk/70 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-inset bg-surface text-ok ring-1 ring-line">
          <ShieldCheck size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 id="site-links-policy-title" className="text-copy font-semibold text-ink">{copy.title}</h2>
          <p className="mt-1.5 max-w-[72ch] text-copy text-body text-pretty">{copy.body}</p>
          <p className="mt-2.5 text-caption">
            <ExternalLink href={GOOGLE_LINK_SPAM_POLICY} newTabLabel={newTabLabel}>{copy.link}</ExternalLink>
          </p>
        </div>
      </div>
    </aside>
  )
}
