import { AlertCircle, CheckCircle2, Clock, Info } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export type NoticeTone = 'info' | 'wait' | 'ok' | 'bad'

/**
 * ONE message, and at most one thing to do about it. Every answer the scan or
 * the AI route can give becomes one of these (lib/project-settings/view.ts
 * decides which), never the route's own words.
 */
export default function Notice({
  tone,
  children,
  action,
  onDismiss,
  className,
}: {
  tone: NoticeTone
  children: React.ReactNode
  action?: { label: string; onClick: () => void } | null
  onDismiss?: () => void
  className?: string
}) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'bad' ? AlertCircle : tone === 'wait' ? Clock : Info
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border px-3 py-2.5 animate-pop-in',
        tone === 'ok' && 'border-ok/20 bg-ok-soft text-ok',
        tone === 'bad' && 'border-bad/20 bg-bad-soft text-bad',
        tone === 'wait' && 'border-warn/20 bg-warn-soft text-warn',
        tone === 'info' && 'border-info/20 bg-info-soft text-info',
        className,
      )}
    >
      <p className="flex min-w-0 flex-1 basis-56 items-start gap-2 text-copy">
        <Icon size={16} className="mt-1 shrink-0" aria-hidden />
        <span className="min-w-0">{children}</span>
      </p>
      {action && (
        <Button size="sm" variant="secondary" onClick={action.onClick} className="shrink-0">
          {action.label}
        </Button>
      )}
      {!action && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-control px-2 py-1 text-caption font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          ✕<span className="sr-only">close</span>
        </button>
      )}
    </div>
  )
}
