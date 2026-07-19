/**
 * Content Hub route — /content (Phase 1.5).
 * Gated by NEXT_PUBLIC_ENABLE_CONTENT (build-time). When off, the page renders
 * a minimal not-available state and the sidebar item is hidden.
 *
 * Server component: the SINGLE authoritative Stage-D flag (RECO_PRO_FIRST_CONTROLLER,
 * via isProFirstControllerEnabled) is resolved server-side and passed down as a prop,
 * so the UI and the route can never disagree on whether Pro-first is active.
 */

import { Suspense } from 'react'
import ContentHub from '@/components/content/ContentHub'
import { isProFirstControllerEnabled } from '@/lib/content/api-auth'

export default function ContentPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_CONTENT !== 'true') {
    return (
      <div className="py-20 text-center text-slate-400 dark:text-slate-500 text-sm">
        Not available.
      </div>
    )
  }

  const proFirst = isProFirstControllerEnabled()

  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400 text-sm">…</div>}>
      <ContentHub proFirst={proFirst} />
    </Suspense>
  )
}
