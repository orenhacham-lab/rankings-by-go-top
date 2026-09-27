'use client'

/**
 * The research form, folded into one line once there is research on screen (the
 * scan's, or one the merchant ran). One button opens the form as it always was.
 */
import { ChevronDown, Search } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function ResearchFormBar({ onOpen }: { onOpen: () => void }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan.form
  return (
    <div data-research-form="collapsed" className="mb-8 flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2.5 shadow-card transition-colors hover:border-line-strong sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-action-soft text-action" aria-hidden="true">
          <Search size={16} strokeWidth={2} />
        </span>
        <p className="min-w-0 truncate text-sm">
          <span className="font-semibold text-ink">{t.title}</span>
          <span className="text-muted"> · {t.hint}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={false}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-action px-3.5 text-xs font-semibold text-action-ink shadow-sm transition-colors hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
      >
        {t.open}
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}

/** The line above the open form, to fold it again. */
export function ResearchFormClose({ onClose }: { onClose: () => void }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan.form
  return (
    <div data-research-form="open" className="mb-2 flex justify-end">
      <button
        type="button"
        onClick={onClose}
        aria-expanded={true}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-ink"
      >
        {t.close}
        <ChevronDown size={14} strokeWidth={2} className="rotate-180" aria-hidden="true" />
      </button>
    </div>
  )
}
