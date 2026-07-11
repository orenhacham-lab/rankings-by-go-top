'use client'

/**
 * Content Hub route — /content (Phase 1.5).
 * Gated by NEXT_PUBLIC_ENABLE_CONTENT (build-time). When off, the page renders
 * a minimal not-available state and the sidebar item is hidden.
 */

import { Suspense } from 'react'
import ContentHub from '@/components/content/ContentHub'

export default function ContentPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_CONTENT !== 'true') {
    return (
      <div className="py-20 text-center text-slate-400 dark:text-slate-500 text-sm">
        Not available.
      </div>
    )
  }

  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400 text-sm">…</div>}>
      <ContentHub />
    </Suspense>
  )
}
