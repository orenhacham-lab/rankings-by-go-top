/**
 * The content workspace's frame — /content and everything under it.
 *
 * The flag gate, the shared workspace state and the shell (project selector, setup
 * cards, tab bar, brief modal, toasts) live here, so each screen below is only its
 * own subject and switching screens does not refetch the overview.
 *
 * Gated by NEXT_PUBLIC_ENABLE_CONTENT (build-time). When off, every content route
 * renders the same minimal not-available state and the sidebar item is hidden.
 */

import { Suspense, type ReactNode } from 'react'
import { ContentWorkspaceProvider } from '@/components/content/workspace/ContentWorkspaceProvider'
import ContentWorkspaceShell from '@/components/content/workspace/ContentWorkspaceShell'
import ContentNotAvailable from '@/components/content/ContentNotAvailable'

export default function ContentLayout({ children }: { children: ReactNode }) {
  if (process.env.NEXT_PUBLIC_ENABLE_CONTENT !== 'true') {
    return <ContentNotAvailable />
  }

  return (
    <Suspense fallback={<div className="py-20 text-center text-muted text-sm">…</div>}>
      <ContentWorkspaceProvider>
        <ContentWorkspaceShell>{children}</ContentWorkspaceShell>
      </ContentWorkspaceProvider>
    </Suspense>
  )
}
