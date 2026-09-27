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
  else if (never) status = fillRich(t.scan.never, { domain: <Ltr className="font-semibold text-contrast-ink">{domain}</Ltr> })
  else {
    const last =
      latest.status === 'failed'
        ? t.scan.lastFailed
        : fill(t.scan.last, { ago: formatAgo(latest.finishedAt ?? latest.createdAt, now, locale) })
    status = wait ? `${last} ${fill(t.scan.nextAt, { wait: formatWait(wait, locale) })}` : last
  }

  const notice = scan.notice ? rescanCopy(scan.notice, t, locale) : null
  const blocked = running || stalled || wait !== null
  const initial = domain.replace(/^www\./, '').slice(0, 1).toUpperCase()
  return (
    <section id={SITE_SCAN_ANCHOR} aria-labelledby={`${SITE_SCAN_ANCHOR}-title`} className="scroll-mt-20" data-scan-band>
      <div className="overflow-hidden rounded-card bg-contrast text-contrast-ink shadow-pop ring-1 ring-black/5">
        <div className="relative isolate">
          {/* Two soft glows and a faint grid: the band is the one dark surface on the screen, the site itself. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(36rem_14rem_at_85%_-20%,rgb(99_130_246/0.35),transparent_70%),radial-gradient(24rem_12rem_at_0%_120%,rgb(240_176_63/0.16),transparent_70%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
          />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5 sm:px-7 sm:py-6">
            <span aria-hidden className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-2xl font-bold ring-1 ring-white/15">
              {initial || <ScanSearch size={22} />}
              <span
                className={cn(
                  'absolute -bottom-1.5 -end-1.5 grid size-6 place-items-center rounded-full ring-2 ring-contrast transition-colors',
                  running ? 'bg-info-soft text-info' : 'bg-white text-contrast',
                )}
              >
                <ScanSearch size={13} />
                {running && <span className="absolute inset-0 rounded-full bg-info-soft opacity-70 motion-safe:animate-ping" />}
              </span>
            </span>
            <div className="min-w-0 flex-1 basis-60">
              <h2 id={`${SITE_SCAN_ANCHOR}-title`} className="text-caption font-semibold uppercase tracking-wide text-contrast-ink/70">
                {t.scan.title}
              </h2>
              {!never && <Ltr className="mt-0.5 block truncate text-xl font-bold leading-7 text-contrast-ink">{domain}</Ltr>}
              <p className="mt-1 text-copy text-contrast-ink/80" aria-live="polite">{status}</p>
              {!never && <p className="mt-1 text-caption text-contrast-ink/60">{t.scan.fieldsNote}</p>}
            </div>
            <Button
              variant={never ? 'primary' : 'secondary'}
              onClick={() => void scan.start()}
              loading={scan.phase === 'starting'}
              disabled={blocked}
              className={cn('w-full sm:w-auto', !never && 'border-transparent bg-contrast-ink text-contrast hover:bg-contrast-ink/90')}
              data-rescan
            >
              {scan.phase !== 'starting' && <RefreshCw size={15} aria-hidden className={cn(running && 'animate-spin')} />}
              {scan.phase === 'starting' ? t.scan.starting : never ? t.scan.start : t.scan.again}
            </Button>
          </div>
          {running && (
            <div aria-hidden className="h-1 w-full bg-white/10">
              <div className="h-full w-1/3 rounded-e-full bg-info-soft motion-safe:animate-pulse" />
            </div>
          )}
        </div>
        {notice && scan.notice && (
          <div className="bg-surface px-5 py-3 text-body sm:px-7">
            <Notice tone={notice.tone} action={actionFor(rescanNoticeAction(scan.notice))} onDismiss={scan.dismiss}>
              {notice.text}
            </Notice>
          </div>
        )}
      </div>
    </section>
  )
}
