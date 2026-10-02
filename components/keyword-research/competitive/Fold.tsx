'use client'

/**
 * One part of the competitor section that opens on demand: its title and a one-line
 * gist of what is inside ("14 keywords · 1 without a page") stay on screen, the long
 * table waits behind them. This is what keeps the section, and the phone page, short:
 * the merchant reads the headline figures first and opens a table when they want it.
 *
 * A real button with aria-expanded / aria-controls; the body's content is not rendered
 * while closed (its empty, hidden box keeps aria-controls pointing at something), so a
 * closed part costs nothing. It opens with the app's own short entrance
 * (motion-safe only), never an animated height.
 */
import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Fold({ title, gist, icon, defaultOpen = false, children, id, ...rest }: {
  title: string
  /** One line of what the part holds, shown open or closed. */
  gist?: ReactNode
  icon?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  id?: string
} & Record<`data-${string}`, string | undefined>) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  return (
    <div id={id} data-fold={open ? 'open' : 'closed'} className="scroll-mt-20" {...rest}>
      <h3 className="text-section font-semibold text-ink">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-control px-2 py-1.5 text-start transition-colors duration-150 ease-snappy hover:bg-sunk/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
        >
          {icon && <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-inset bg-sunk text-body">{icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-pretty">{title}</span>
            {gist && <span className="mt-0.5 block text-caption font-normal text-muted tabular-nums">{gist}</span>}
          </span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={cn('mt-1 shrink-0 text-muted transition-transform duration-200 ease-snappy motion-reduce:transition-none', open && 'rotate-180')}
          />
        </button>
      </h3>
      <div id={bodyId} hidden={!open} className="mt-4 motion-safe:animate-pop-in">
        {open && children}
      </div>
    </div>
  )
}
