'use client'

/**
 * THE ONLY <a> on the Links tab that leaves the app. The address is checked
 * again here (lib/site-links/model.ts safeExternalUrl: http or https, a real
 * host, no credentials), whatever the caller passed: anything else is drawn as
 * plain text. It opens in a new tab without handing the page a reference back
 * (noopener noreferrer), and says so to a screen reader.
 */
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { safeExternalUrl } from '@/lib/site-links/model'

export default function ExternalLink({ href, children, newTabLabel, className, icon = true }: {
  href: string | null | undefined
  children: React.ReactNode
  /** "opens in a new tab", from the dictionary. */
  newTabLabel: string
  className?: string
  icon?: boolean
}) {
  const safe = safeExternalUrl(href)
  if (!safe) return <span className={className}>{children}</span>
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex min-w-0 items-center gap-1 rounded-sm text-action underline-offset-4 hover:underline',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        className,
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      {icon && <ArrowUpRight size={14} aria-hidden="true" className="shrink-0 rtl:-scale-x-100" />}
      <span className="sr-only">{` (${newTabLabel})`}</span>
    </a>
  )
}
