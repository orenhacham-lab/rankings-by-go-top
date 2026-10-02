'use client'

/**
 * The cannibalization check's warning on a manual path: "you already have a page on
 * this: …, improving it is the better move", with the way to improve it and, when the
 * caller allows it, "create it anyway". It never blocks: it only offers the better
 * move first. The link is always a path on this app (readOverlap refuses anything else).
 */

import Link from 'next/link'
import { NoticeBox } from '@/components/ui/Notice'
import Button, { buttonClasses } from '@/components/ui/Button'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { overlapMessage, type OverlapPayload } from '@/lib/content/cannibalization/client'
import type { Locale } from '@/lib/i18n/locales'

export default function OverlapHint({ overlap, language, onCreateAnyway, busy = false, className }: {
  overlap: OverlapPayload
  language: Locale
  onCreateAnyway?: () => void
  busy?: boolean
  className?: string
}) {
  const c = getDashboardDictionary(language).topicOverlap
  const planned = overlap.kind === 'topic' || overlap.kind === 'idea'
  return (
    <NoticeBox tone="warn" language={language} className={className}>
      <div data-overlap={overlap.kind} className="space-y-2">
        <p className="font-semibold text-ink">{overlapMessage(c, overlap)}</p>
        {!planned && <p className="max-w-prose text-caption text-body">{c.why}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={overlap.improveHref}
            className={buttonClasses({ variant: 'primary', size: 'sm' })}
          >
            {planned ? c.openPlanned : c.improve}
          </Link>
          {onCreateAnyway && (
            <Button size="sm" variant="ghost" onClick={onCreateAnyway} loading={busy} disabled={busy}>
              {c.createAnyway}
            </Button>
          )}
        </div>
      </div>
    </NoticeBox>
  )
}
