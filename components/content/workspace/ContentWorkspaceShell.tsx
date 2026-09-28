'use client'

/**
 * The frame every content screen renders inside: the screen's own heading, the
 * missing-connection onboarding, the shared "new article topic" modal and the
 * toast host. The project comes from the top bar's switcher, like every screen's.
 *
 * Everything here used to be inlined at the top of the one big ContentHub, which
 * is why a screen could not exist without it. It is a layout now, so each screen
 * is only its own subject.
 *
 * There is no tab bar: every screen is its own sidebar entry, so a second row of
 * tabs would be the same navigation twice. That is why the heading is per screen —
 * without it nothing on the page would say which screen you are on.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Header from '@/components/layout/Header'
import ArticleBriefModal from '@/components/content/ArticleBriefModal'
import ContentHubSetup from '@/components/content/ContentHubSetup'
import { ToastHost } from '@/components/content/Toast'
import { activeContentScreen } from '@/lib/content/content-workspace-nav'
import { useContentWorkspace } from './ContentWorkspaceProvider'
import type { ReactNode } from 'react'

export default function ContentWorkspaceShell({ children }: { children: ReactNode }) {
  const {
    t, isHebrew, toast, projectId, projects, data, loading,
    projectsResolved, projectsError, reloadProjects,
    briefOpen, closeBrief, briefPrefill, editingTopic, setNewTopics, setNewTopicsUnchecked, setNewTopicsSelected, loadTopics,
  } = useContentWorkspace()
  const screen = activeContentScreen(usePathname() ?? '')
  // The content strategy tab opens with its plan (it works without a site connection),
  // so there the connection cards follow the screen instead of preceding it.
  const setupAfterScreen = screen === 'strategy'

  // K5 — missing-connections onboarding (two independent setup cards, each hidden when
  // its dimension is ready; whole block hidden when both are). Its buttons LINK to the
  // screen that owns each connection.
  const setup = projectId && data ? (
    <ContentHubSetup
      projectId={projectId}
      platform={data.platform?.platform ?? 'none'}
      platformFailed={data.wordpress?.status === 'failed' || data.shopify?.status === 'failed' || ((data.platform?.platform === 'wix' || data.platform?.platform === 'webhook') && data.platform?.siteActive === false)}
      shopifyNeedsScope={!!data.platform?.shopifyNeedsScope}
    />
  ) : null

  return (
    <div dir={isHebrew ? 'rtl' : 'ltr'}>
      <Header title={t.screens[screen]} subtitle={t.screenSubtitles[screen]} />

      {/* The accessible-project list FAILED to load — never rendered as "you have
          no projects", which is a different fact and offers no way forward. */}
      {projectsResolved && projectsError ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-body mb-4">{t.projectsLoadError}</p>
          <Button onClick={reloadProjects}>{t.projectsLoadRetry}</Button>
        </Card>
      ) : !projectsResolved ? (
        /* Still resolving — do NOT flash an empty state at a user who has projects. */
        <Card className="p-10 text-center">
          <p className="text-sm text-muted">{t.projectsLoading}</p>
        </Card>
      ) : /* No projects → empty state */
      !loading && projects.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-body mb-4">{t.noProjectsTitle}</p>
          <Link href="/projects/new"><Button>{t.noProjectsCta}</Button></Link>
        </Card>
      ) : (
        <>
          {/* No project selector here: the top bar's switcher is the one control
              that picks the project, on this screen as on every other. */}

          {!setupAfterScreen && setup}

          {/* No project selected yet (multi-project) */}
          {!projectId ? (
            <Card className="p-10 text-center text-muted">
              {t.selectProjectMessage}
            </Card>
          ) : (
            children
          )}

          {setupAfterScreen && <div className="mt-8">{setup}</div>}
        </>
      )}

      <ArticleBriefModal
        open={briefOpen}
        onClose={closeBrief}
        projects={projects}
        defaultProjectId={projectId}
        editing={editingTopic}
        prefill={briefPrefill}
        onSaved={loadTopics}
        onToast={(kind, text) => (kind === 'success' ? toast.success(text) : toast.error(text))}
        onTopicsCreated={(created) => { if (created.length) { setNewTopicsUnchecked({}); setNewTopicsSelected({}); setNewTopics(created) } }}
      />

      <ToastHost toasts={toast.toasts} dismiss={toast.dismiss} dir={isHebrew ? 'rtl' : 'ltr'} />
    </div>
  )
}
