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
    <div data-research-form="collapsed" className="mb-6 flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-control bg-sunk text-muted" aria-hidden="true">
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
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-body transition-colors hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
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
