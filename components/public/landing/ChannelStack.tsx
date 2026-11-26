/**
 * The "one system" hero's right-hand side: three channel cards (website, Google
 * Maps, Facebook and Instagram) stacked over one content calendar. Static: no
 * client JS, no animation clock, so it adds nothing to the page's load.
 * Shown only while ONE_SYSTEM_HERO_LIVE is on (lib/marketing/one-system-hero.ts).
 */
import { CalendarClock, Check, Globe, MapPin, Share2 } from 'lucide-react'
import type { OneSystemHeroCopy } from '@/lib/marketing/one-system-hero'

const ICONS = [Globe, MapPin, Share2]

export function ChannelStack({ copy }: { copy: OneSystemHeroCopy }) {
  return (
    <div className="mx-auto w-full max-w-md text-start" data-hero-channels>
      <ul className="space-y-3">
        {copy.channels.map((c, i) => {
          const Icon = ICONS[i] ?? Globe
          return (
            <li key={c.name} className="flex items-center gap-3 rounded-card bg-surface px-4 py-3.5 shadow-pop ring-1 ring-white/10">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-copy font-semibold text-ink">{c.name}</span>
                <span className="flex items-center gap-1.5 text-caption text-muted">
                  <Check className="size-3.5 text-ok" aria-hidden="true" strokeWidth={3} />
                  {c.status}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 flex items-center justify-center gap-2 text-copy font-semibold text-contrast-ink">
        <CalendarClock className="size-4 text-rail-tagline" aria-hidden="true" />
        {copy.calendar}
      </p>
      <p className="mt-1 text-center text-caption text-contrast-ink/65">{copy.caption}</p>
    </div>
  )
}
