import { ScanSearch, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Where a value came from, beside the field that holds it:
 *   scan  filled in by the site scan, not touched by the owner since. It goes
 *         away the moment the owner edits the field, because the edit makes it
 *         theirs and the scan will never change it again.
 *   ai    put into the form from "detect again with AI" and not saved yet.
 * The owner's own values carry no chip: they are the normal case.
 */
export default function SourceChip({
  kind,
  label,
  title,
  compact = false,
  className,
}: {
  kind: 'scan' | 'ai'
  label: string
  /** The longer explanation, on hover and for screen readers. */
  title: string
  /** Icon only below the `sm` width, for a chip that sits inside a narrow field. */
  compact?: boolean
  className?: string
}) {
  const Icon = kind === 'scan' ? ScanSearch : Sparkles
  return (
    <span
      title={title}
      data-source-chip={kind}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-2 py-0.5 text-caption font-medium animate-pop-in',
        kind === 'scan' ? 'border-info/20 bg-info-soft text-info' : 'border-action/25 bg-action-soft text-action',
        className,
      )}
    >
      <Icon size={12} aria-hidden />
      <span className={cn(compact && 'sr-only sm:not-sr-only')}>{label}</span>
      <span className="sr-only">. {title}</span>
    </span>
  )
}
