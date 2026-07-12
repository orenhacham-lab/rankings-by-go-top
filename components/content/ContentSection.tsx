'use client'

/**
 * Content & Articles section — project page module (Phase 1).
 *
 * Phase 1 scope: dashboard skeleton (zero counters) + WordPress connection.
 * Topic/article generation, publishing, scheduling and pools arrive in later
 * phases. Deliberately lean — do not grow this into a monolith.
 */

import { useMemo } from 'react'
import { Newspaper } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import WordPressConnectionPanel from './WordPressConnectionPanel'
import ShopifyConnectionPanel from './ShopifyConnectionPanel'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function ContentSection({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection, [language])

  // Phase 1: no articles exist yet — static zero counters.
  const stats = [
    { label: t.statsDrafts, value: 0 },
    { label: t.statsReady, value: 0 },
    { label: t.statsScheduled, value: 0 },
    { label: t.statsPublished, value: 0 },
  ]

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Newspaper size={20} strokeWidth={2} className="text-indigo-600 dark:text-indigo-400" />
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t.title}</h2>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t.subtitle}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="hover:translate-y-0" padding={false}>
            <div className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{s.label}</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{s.value}</div>
            </div>
          </Card>
        ))}
      </div>

      <WordPressConnectionPanel projectId={projectId} />
      <ShopifyConnectionPanel projectId={projectId} />
    </section>
  )
}
