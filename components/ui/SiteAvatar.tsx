'use client'

/**
 * THE picture of a site, the owner's or a competitor's, everywhere the app
 * shows one: its favicon when the browser can load it (components/ui/SiteIcon
 * owns the loading and lib/site-icon.ts what is accepted), and otherwise one
 * letter on a tile, the same letter by the same rule on every screen.
 *
 * Before, each screen drew its own: the switcher took the project name's first
 * character ("א"), the dashboard hero the domain's ("B"), competitor lists a
 * third style, and no screen but three showed a favicon at all.
 *
 * The letter is the site's own: the first letter of its address (www. aside),
 * and only without an address the first character of its name.
 */
import SiteIcon from '@/components/ui/SiteIcon'
import { cn } from '@/lib/utils'

/** The one letter a site is shown by when it has no icon. */
export function siteInitial(domain: string | null | undefined, name?: string | null): string {
  const host = String(domain ?? '')
    .replace(/\s+/g, '')
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
  const first = host.match(/[\p{L}\p{N}]/u)?.[0] ?? String(name ?? '').trim().match(/[\p{L}\p{N}]/u)?.[0]
  return first ? first.toLocaleUpperCase('en-US') : '·'
}

export type SiteAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE: Record<SiteAvatarSize, { box: string; letter: string; pad: string }> = {
  xs: { box: 'size-5 rounded', letter: 'text-[0.625rem]', pad: 'p-px' },
  sm: { box: 'size-6 rounded-md', letter: 'text-[0.6875rem]', pad: 'p-0.5' },
  md: { box: 'size-9 rounded-lg', letter: 'text-copy', pad: 'p-1.5' },
  lg: { box: 'size-11 rounded-xl', letter: 'text-lg', pad: 'p-2' },
  xl: { box: 'size-14 rounded-2xl', letter: 'text-2xl', pad: 'p-2.5' },
}

type Props = {
  domain: string | null | undefined
  /** The icon the site's scan found, when known (own projects); competitors have none. */
  icon?: string | null
  /** Used for the letter only when there is no address. */
  name?: string | null
  size?: SiteAvatarSize
  /** 'dark' on the dark bands (hero, scan band); 'light' everywhere else. */
  tone?: 'light' | 'dark'
  /** A site not confirmed yet (a competitor the scan only guessed): a dashed outline. */
  tentative?: boolean
  className?: string
}

export default function SiteAvatar({ domain, icon, name, size = 'md', tone = 'light', tentative = false, className }: Props) {
  const s = SIZE[size]
  const base = cn('grid shrink-0 place-items-center font-bold uppercase leading-none', s.box, className)
  const letterTone = tentative
    ? 'border border-dashed border-line-strong bg-surface text-muted'
    : tone === 'dark'
      ? 'bg-white/10 text-contrast-ink ring-1 ring-white/15'
      : 'bg-action-soft text-action'
  const plateTone = tone === 'dark' ? 'bg-white ring-1 ring-white/15' : 'bg-white ring-1 ring-line'
  return (
    <SiteIcon
      domain={domain}
      icon={icon}
      fallback={siteInitial(domain, name)}
      className={cn(base, s.letter, letterTone)}
      iconClassName={cn(base, s.pad, plateTone)}
    />
  )
}
