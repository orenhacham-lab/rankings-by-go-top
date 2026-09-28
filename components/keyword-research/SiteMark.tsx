'use client'

/**
 * A site's mark: its own icon, loaded by the browser from the site itself
 * (components/ui/SiteIcon.tsx, lib/site-icon.ts: never a third-party favicon
 * service, never fetched by our server), over its first letter, which stays when no
 * icon loads. Used for the project's site and for every competitor on the research tab.
 */
import SiteIcon from '@/components/ui/SiteIcon'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: { tile: 'size-5 rounded-[0.3rem] text-[0.625rem]', plate: 'size-5 rounded-[0.3rem] p-0.5' },
  md: { tile: 'size-9 rounded-lg text-sm', plate: 'size-9 rounded-lg p-1.5' },
  lg: { tile: 'size-11 rounded-xl text-lg', plate: 'size-11 rounded-xl p-2' },
} as const

/** The letter a site shows without its icon: its first letter or digit, as the owner reads it. */
export function siteInitial(domain: string): string {
  const bare = domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  const ch = [...bare].find((c) => /[\p{L}\p{N}]/u.test(c))
  return (ch ?? '?').toUpperCase()
}

export default function SiteMark({ domain, icon = null, size = 'md', tone = 'default', className }: {
  domain: string
  icon?: string | null
  size?: keyof typeof SIZES
  /** `own`: the project's site (the action colour), `default`: another site. */
  tone?: 'own' | 'default'
  className?: string
}) {
  const s = SIZES[size]
  return (
    <SiteIcon
      domain={domain}
      icon={icon}
      fallback={siteInitial(domain)}
      className={cn('grid shrink-0 place-items-center font-bold', s.tile, tone === 'own' ? 'bg-action text-action-ink' : 'bg-sunk text-body ring-1 ring-line', className)}
      iconClassName={cn('grid shrink-0 place-items-center bg-surface ring-1 ring-line', s.plate, className)}
    />
  )
}
