'use client'

import { RefreshCw, ScanSearch } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Locale } from '@/lib/i18n/locales'
import type { RescanView } from '@/lib/project-settings/types'
import { fill, formatAgo, formatWait, rescanNoticeAction, secondsUntil, type RescanNotice } from '@/lib/project-settings/view'
import { cn } from '@/lib/utils'
import { useNoticeAction } from './AiControls'
import Notice, { type NoticeTone } from './Notice'
import { SECTION } from './anchors'
import { Ltr, fillRich } from './copy'
import type { SiteScan } from './useSiteScan'

type Copy = DashboardDictionary['projectSettings']

const SITE_SCAN_ANCHOR = SECTION.scan

/** Every answer of the seed route, and what the band saw while following a run, as one sentence. */
export function rescanCopy(notice: RescanNotice, t: Copy, locale: Locale): { tone: NoticeTone; text: string } {
  const n = t.scan.notices
  switch (notice.kind) {
    case 'started':
      return { tone: 'info', text: n.started }
    case 'in_progress':
      return { tone: 'info', text: n.in_progress }
    case 'too_soon':
      return { tone: 'wait', text: fill(n.too_soon, { wait: formatWait(notice.wait, locale) }) }
    case 'user_cap':
      return { tone: 'wait', text: fill(n.user_cap, { wait: formatWait(notice.wait, locale) }) }
    case 'global_cap':
      return { tone: 'wait', text: fill(n.global_cap, { wait: formatWait(notice.wait, locale) }) }
    case 'entitlement':
      return { tone: 'info', text: n.entitlement }
    case 'entitlement_unavailable':
      return { tone: 'bad', text: n.entitlement_unavailable }
    case 'signed_out':
      return { tone: 'bad', text: n.signed_out }
    case 'unavailable':
      return { tone: 'bad', text: n.unavailable }
    case 'finished':
      return { tone: 'ok', text: n.finished }
    case 'slow':
      return { tone: 'info', text: n.slow }
    default:
      return { tone: 'bad', text: n.failed }
  }
}

/**
 * "Scan the site again", at the top of the screen: when the site was last
 * read, when it may be read again (the seed route's 24-hour rule, known ahead
 * from the runs themselves), and the one button. While a run is going the band
 * says so and the rest of the screen waits for it; when it ends, the cards
 * reload with what it filled.
 */
export default function ScanBand({
  rescan,
  scan,
  domain,
  now,
  t,
  locale,
}: {
  rescan: RescanView
  scan: SiteScan
  domain: string
  now: Date
  t: Copy
  locale: Locale
}) {
  const actionFor = useNoticeAction(t, { retry: () => void scan.start() })
  const latest = rescan.latest
  const never = latest === null
  const running = scan.following
  const stalled = !running && latest?.status === 'running' && !latest.live
  const wait = secondsUntil(rescan.availableAt, now)

  let status: React.ReactNode
  if (running) status = t.scan.running
  else if (stalled) status = t.scan.stalled
  else if (never) status = fillRich(t.scan.never, { domain: <Ltr className="font-medium text-body">{domain}</Ltr> })
  else {
    const last =
      latest.status === 'failed'
        ? t.scan.lastFailed
        : fill(t.scan.last, { ago: formatAgo(latest.finishedAt ?? latest.createdAt, now, locale) })
    status = wait ? `${last} ${fill(t.scan.nextAt, { wait: formatWait(wait, locale) })}` : last
  }

  const notice = scan.notice ? rescanCopy(scan.notice, t, locale) : null
  const blocked = running || stalled || wait !== null
  return (
    <section id={SITE_SCAN_ANCHOR} aria-labelledby={`${SITE_SCAN_ANCHOR}-title`} className="scroll-mt-20" data-scan-band>
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 sm:px-6">
          <span
            aria-hidden
            className={cn(
              'relative grid h-10 w-10 shrink-0 place-items-center rounded-control transition-colors',
              running ? 'bg-info text-white' : 'bg-info-soft text-info',
            )}
          >
            <ScanSearch size={19} />
            {running && (
              <span className="absolute -end-0.5 -top-0.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-surface bg-info" />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1 basis-60">
            <h2 id={`${SITE_SCAN_ANCHOR}-title`} className="text-section font-semibold text-ink">{t.scan.title}</h2>
            <p className="mt-0.5 text-copy text-muted" aria-live="polite">{status}</p>
            {!never && <p className="mt-1 text-caption text-muted">{t.scan.fieldsNote}</p>}
          </div>
          <Button
            variant={never ? 'primary' : 'secondary'}
            onClick={() => void scan.start()}
            loading={scan.phase === 'starting'}
            disabled={blocked}
            className="w-full sm:w-auto"
            data-rescan
          >
            {scan.phase !== 'starting' && <RefreshCw size={15} aria-hidden className={cn(running && 'animate-spin')} />}
            {scan.phase === 'starting' ? t.scan.starting : never ? t.scan.start : t.scan.again}
          </Button>
        </div>
        {notice && scan.notice && (
          <div className="border-t border-line px-5 py-3 sm:px-6">
            <Notice tone={notice.tone} action={actionFor(rescanNoticeAction(scan.notice))} onDismiss={scan.dismiss}>
              {notice.text}
            </Notice>
          </div>
        )}
      </div>
    </section>
  )
}
