'use client'

/**
 * Widget 3, finishing the setup: business details, the site's platform, Search
 * Console and the first keywords. A percentage, a bar, and a button on every
 * open task. It is not rendered at all once every task is done (setupTasks
 * returns null), so a finished project never carries a finished checklist.
 */
import Link from 'next/link'
import { Check, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SetupTask, SetupTaskKey } from '@/lib/dashboard/activity'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { linkButtonClass, Widget } from './ui'

export default function SetupCompletion({ t, setup, hrefs }: {
  t: DashboardDictionary['dashboardHome']
  setup: { tasks: SetupTask[]; done: number; percent: number }
  hrefs: Record<SetupTaskKey, string>
}) {
  const s = t.setup
  return (
    <Widget id="setup" state="open" title={s.title} subtitle={s.subtitle} icon={<ListChecks size={16} strokeWidth={2} />}
      action={<span className="shrink-0 text-title font-bold tabular-nums text-action">{setup.percent}%</span>}>
      <div
        role="progressbar"
        aria-label={s.progress(setup.done, setup.tasks.length)}
        aria-valuemin={0}
        aria-valuemax={setup.tasks.length}
        aria-valuenow={setup.done}
        className="h-2 w-full overflow-hidden rounded-pill bg-action-soft"
      >
        <div className="h-full rounded-pill bg-action transition-[width] duration-500" style={{ width: `${setup.percent}%` }} />
      </div>
      <p className="mt-2 text-caption text-muted tabular-nums">{s.progress(setup.done, setup.tasks.length)}</p>
      <ul className="mt-3 space-y-2">
        {setup.tasks.map((task) => {
          const copy = s.tasks[task.key]
          return (
            <li
              key={task.key}
              data-setup-task={task.key}
              data-done={task.done ? 'true' : 'false'}
              className="flex items-center gap-3 rounded-control border border-line bg-surface p-3"
            >
              {/* A done row is the same neutral row: a check in the ok tone and muted
                  words, never a green-tinted card (the tone lives on the icon only). */}
              <span
                aria-hidden="true"
                className={cn('flex size-6 shrink-0 items-center justify-center rounded-pill',
                  task.done ? 'bg-ok-soft text-ok' : 'border border-line-strong')}
              >
                {task.done && <Check size={14} strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-copy font-medium', task.done ? 'text-muted' : 'text-ink')}>{copy.title}</p>
                {!task.done && <p className="text-caption text-muted">{copy.sub}</p>}
              </div>
              {task.done
                ? <span className="shrink-0 text-caption text-muted">{s.done}</span>
                : <Link href={hrefs[task.key]} className={linkButtonClass('secondary', 'sm')}>{copy.cta}</Link>}
            </li>
          )
        })}
      </ul>
    </Widget>
  )
}
