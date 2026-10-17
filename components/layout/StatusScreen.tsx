import Image from 'next/image'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The one frame for "this page is missing" and "this screen broke" (design
 * contract §7): app/not-found.tsx, app/(dashboard)/error.tsx and
 * app/global-error.tsx. One surface card on the canvas, an icon squircle, an
 * overline, one H1, one sentence, at most two actions. No hooks, so a server
 * page and a client error boundary can both draw it. It never receives an
 * error's own text: the callers pass our words (lib/i18n/error-pages.ts).
 *
 * `page` draws the whole screen with the logo (404, global error); without it
 * the card sits inside the dashboard shell (a screen's error boundary).
 */
export default function StatusScreen({
  dir,
  icon: Icon,
  overline,
  title,
  body,
  actions,
  footnote,
  page = false,
  logoAlt,
}: {
  dir: 'rtl' | 'ltr'
  icon: LucideIcon
  overline?: string
  title: string
  body: string
  actions: ReactNode
  footnote?: ReactNode
  page?: boolean
  logoAlt?: string
}) {
  const card = (
    <div data-status-screen className="w-full max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
      <div className="mx-auto flex size-10 items-center justify-center rounded-inset bg-action-soft text-action">
        <Icon aria-hidden="true" className="size-5" />
      </div>
      {overline && <p className="mt-5 text-overline font-semibold uppercase tracking-wide text-muted">{overline}</p>}
      <h1 className={cn('text-title font-bold tracking-tight text-ink', overline ? 'mt-1' : 'mt-5')}>{title}</h1>
      <p className="mx-auto mt-3 max-w-prose text-copy text-body">{body}</p>
      <div className="mt-8 flex flex-col-reverse items-stretch justify-center gap-3 sm:flex-row sm:items-center">{actions}</div>
      {footnote && <p className="mt-6 text-caption text-muted">{footnote}</p>}
    </div>
  )

  if (!page) {
    return <div dir={dir} className="flex justify-center px-4 py-16 sm:py-24">{card}</div>
  }
  return (
    <main dir={dir} className="flex min-h-screen flex-col items-center justify-center gap-10 bg-canvas px-4 py-16">
      {logoAlt && (
        <Image src="/gotop-primary.png" alt={logoAlt} width={160} height={64} className="h-12 w-auto object-contain" sizes="120px" priority />
      )}
      {card}
    </main>
  )
}
