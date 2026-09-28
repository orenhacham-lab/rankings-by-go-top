'use client'

import { useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Clock, Info, TriangleAlert, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n/locales'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export type NoticeTone = 'info' | 'wait' | 'ok' | 'warn' | 'bad'

/** How many bullets show before the rest fold behind "N more". */
export const NOTICE_MAX_ITEMS = 3

export interface NoticeProps {
  tone: NoticeTone
  children: ReactNode
  /** At most ONE thing to do about it. */
  action?: { label: string; onClick: () => void } | null
  onDismiss?: () => void
  className?: string
  /** Bullets under the message: the first three show, the rest behind "N more". */
  items?: readonly ReactNode[]
}

const TONE_CLASSES: Record<NoticeTone, string> = {
  ok: 'border-ok/20 bg-ok-soft text-ok',
  bad: 'border-bad/20 bg-bad-soft text-bad',
  warn: 'border-warn/20 bg-warn-soft text-warn',
  wait: 'border-warn/20 bg-warn-soft text-warn',
  info: 'border-info/20 bg-info-soft text-info',
}

const TONE_ICON = { ok: CheckCircle2, bad: AlertCircle, warn: TriangleAlert, wait: Clock, info: Info } as const

/**
 * ONE message, and at most one thing to do about it (design contract §8): the
 * notice every screen uses instead of a hand-made tinted box or an orange
 * warning sentence. Promoted from components/settings/Notice.tsx with the same
 * API, plus the `warn` tone and up to three bullets.
 *
 * Never pass a provider's own error text as `children`: map it to our words
 * first (lib/i18n/user-facing-error.ts).
 *
 * The default export reads the dashboard language; outside the dashboard
 * (sign-in pages, the public site) use `NoticeBox` and pass `language`.
 */
export default function Notice(props: NoticeProps) {
  const { language } = useDashboardLanguage()
  return <NoticeBox {...props} language={language} />
}

export function NoticeBox({ tone, children, action, onDismiss, className, items, language }: NoticeProps & { language: Locale }) {
  const t = getDashboardDictionary(language)
  const [open, setOpen] = useState(false)
  const Icon = TONE_ICON[tone]
  const list = items ?? []
  const shown = open ? list : list.slice(0, NOTICE_MAX_ITEMS)
  const hidden = list.length - shown.length

  return (
    <div
      // A failure interrupts (alert); everything else is announced politely.
      role={tone === 'bad' ? 'alert' : 'status'}
      data-notice={tone}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-inset border px-4 py-3 motion-safe:animate-pop-in',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-56 items-start gap-2 text-copy">
        <Icon aria-hidden="true" className="mt-1 size-4 shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <div className="min-w-0">{children}</div>
          {shown.length > 0 && (
            <ul className="list-disc space-y-0.5 ps-4 text-body marker:text-current">
              {shown.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          )}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-control text-caption font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
            >
              {t.uiKit.noticeMore.replace('{n}', String(hidden))}
            </button>
          )}
        </div>
      </div>
      {action && (
        <Button size="sm" variant="secondary" onClick={action.onClick} className="shrink-0">
          {action.label}
        </Button>
      )}
      {!action && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-control transition-colors duration-150 ease-snappy hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
        >
          <X aria-hidden="true" className="size-4" />
          <span className="sr-only">{t.common.close}</span>
        </button>
      )}
    </div>
  )
}
