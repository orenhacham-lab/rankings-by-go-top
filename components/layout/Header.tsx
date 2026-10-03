'use client'

/**
 * The screen's own header: the title, one line of what the screen is for, and
 * the actions that belong to the whole screen. It is the top of the hierarchy
 * (title → section → metric), so it is the only place `text-title` is used, and
 * it keeps a generous gap to the first section below it.
 *
 * `eyebrow` is an optional short label above the title (the area of the app, a
 * step). `children` renders under the subtitle, for a line of meta or chips.
 *
 * `data-tour` marks the header and its actions for the screen tours (lib/guide/tours.ts).
 */
interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  eyebrow?: string
  children?: React.ReactNode
}

export default function Header({ title, subtitle, actions, eyebrow, children }: HeaderProps) {
  return (
    <div className="mb-8" data-tour="screen-header">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1.5 text-overline font-semibold text-action">{eyebrow}</p>}
          <h1 className="text-title font-bold text-ink text-balance">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-lead text-muted text-pretty">{subtitle}</p>}
          {children && <div className="mt-3">{children}</div>}
        </div>
        {actions && <div data-tour="screen-actions" className="flex flex-wrap items-center gap-2 md:gap-3 shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
