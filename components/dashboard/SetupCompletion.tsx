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
      action={<span className="shrink-0 text-copy font-semibold tabular-nums text-ink">{setup.percent}%</span>}>
      <div
        role="progressbar"
        aria-label={s.progress(setup.done, setup.tasks.length)}
        aria-valuemin={0}
        aria-valuemax={setup.tasks.length}
        aria-valuenow={setup.done}
        className="h-1.5 w-full overflow-hidden rounded-pill bg-action-soft"
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
              className={cn('flex items-center gap-3 rounded-control border p-3', task.done ? 'border-ok/20 bg-ok-soft' : 'border-line')}
            >
              <span
                aria-hidden="true"
                className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border',
                  task.done ? 'border-ok bg-ok text-surface' : 'border-line-strong')}
              >
                {task.done && <Check size={14} strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-copy font-medium text-ink">{copy.title}</p>
                <p className="text-caption text-muted">{copy.sub}</p>
              </div>
              {task.done
                ? <span className="shrink-0 text-caption font-medium text-ok">{s.done}</span>
                : <Link href={hrefs[task.key]} className={linkButtonClass('secondary', 'sm')}>{copy.cta}</Link>}
            </li>
          )
        })}
      </ul>
    </Widget>
  )
}
