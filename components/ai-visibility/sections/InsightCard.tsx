'use client'

/**
 * One insight on the insights tab: a neutral panel with a single accent (the
 * icon squircle), a title, and at most three sentences in view. Anything past
 * three sits behind "N more", so a card never becomes a wall of text. A card
 * that needs to stand out says so with a small badge, never with a tinted fill.
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { T } from './types'

export const INSIGHT_MAX_LINES = 3

export type InsightLine = { text: string; isFirst?: boolean }

export function InsightBullets({ lines, t, className }: { lines: InsightLine[]; t: T; className?: string }) {
  const [open, setOpen] = useState(false)
  const shown = open ? lines : lines.slice(0, INSIGHT_MAX_LINES)
  const hidden = lines.length - INSIGHT_MAX_LINES
  return (
    <div className={className}>
      <ul className="space-y-2 text-copy text-body">
        {shown.map((line, i) => (
          <li key={i} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-2.5 size-1 shrink-0 rounded-pill bg-line-strong" />
            <span className={cn('min-w-0', line.isFirst && 'font-medium text-ink')}>{line.text}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-2 inline-flex items-center gap-1 rounded-control text-caption font-semibold text-action transition-colors duration-150 ease-snappy hover:text-action-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
        >
          {open ? t('show_less') : t('more_items').replace('{count}', String(hidden))}
          <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform duration-150 ease-snappy', open && 'rotate-180')} />
        </button>
      )}
    </div>
  )
}

export function InsightCard({
  title,
  icon,
  lines,
  emptyText,
  badge,
  footer,
  t,
}: {
  title: string
  icon: ReactNode
  lines: InsightLine[]
  emptyText?: string
  /** A small danger badge for the one card that needs attention. */
  badge?: string
  footer?: ReactNode
  t: T
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-inset border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action [&_svg]:size-5">
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 pt-2">
          <h4 className="text-copy font-semibold text-ink">{title}</h4>
          {badge && <Badge variant="danger">{badge}</Badge>}
        </div>
      </div>
      {lines.length > 0 ? (
        <InsightBullets lines={lines} t={t} />
      ) : (
        emptyText ? <p className="text-copy text-muted">{emptyText}</p> : null
      )}
      {footer && <div className="mt-3 border-t border-line pt-3">{footer}</div>}
    </div>
  )
}
