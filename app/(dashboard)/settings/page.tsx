'use client'

/**
 * Project settings — everything that is true about ONE workspace.
 *
 * These lived on a project page that also carried the project's data: its stats,
 * its AI visibility, its keywords, its content. So "change the WordPress
 * connection" and "look at last week's positions" were the same screen, and the
 * sidebar needed a Projects tab to reach it. The data went to the screens that own
 * it; what stays here is the setup: who the business is, and what it is connected to.
 *
 * Scoped to the workspace the top bar names — there is no project picker on this
 * page, because the app has exactly one.
 */
import { useEffect, useRef, useState } from 'react'
import { Plug, Building2 } from 'lucide-react'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import { Card } from '@/components/ui/Card'
import SectionHeading from '@/components/ui/SectionHeading'
import ProjectForm from '@/components/projects/ProjectForm'
import ContentSection from '@/components/content/ContentSection'
import GscPanel from '@/components/content/GscPanel'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { createClient } from '@/lib/supabase/client'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { PROJECT_CONNECTION_ANCHOR, SETTINGS_GSC_ANCHOR } from '@/lib/content/content-hub-setup'
import type { Project, Client } from '@/lib/supabase/types'

export default function ProjectSettingsPage() {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).projectSettings

  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />
      <WorkspaceGate>
        {(project, reload) => <ProjectSettings key={project.id} project={project} reload={reload} />}
      </WorkspaceGate>
    </div>
  )
}

function ProjectSettings({ project, reload }: { project: Project; reload: () => void }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).projectSettings
  const [clients, setClients] = useState<Client[]>([])
  const [savedAt, setSavedAt] = useState<number | null>(null)
  // A rename shows in the top bar's switcher too, so a save reloads its list.
  const { reloadProjects } = useActiveProject()

  // Links from elsewhere open a section of this screen (#platform, #search-console).
  // The sections exist only once the project has loaded, after the browser's own
  // jump to the anchor, so the jump happens here. The panels then finish loading
  // and grow, which moves the section, so the jump follows the screen's size
  // until it settles or the user scrolls, whichever comes first.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = window.location.hash.slice(1)
    const root = rootRef.current
    if (!root || (id !== PROJECT_CONNECTION_ANCHOR && id !== SETTINGS_GSC_ANCHOR)) return
    const jump = () => document.getElementById(id)?.scrollIntoView({ block: 'start' })
    const follow = new ResizeObserver(jump)
    const userEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    const stop = () => {
      follow.disconnect()
      for (const e of userEvents) window.removeEventListener(e, stop)
    }
    follow.observe(root)
    for (const e of userEvents) window.addEventListener(e, stop, { passive: true })
    const settle = window.setTimeout(stop, 3000)
    return () => { window.clearTimeout(settle); stop() }
  }, [])

  // The form's client list. RLS scopes the read to the signed-in owner.
  useEffect(() => {
    let cancelled = false
    void withDeadline(createClient().from('clients').select('*').order('name'))
      .then((res) => { if (!cancelled) setClients((res?.data ?? []) as Client[]) })
    return () => { cancelled = true }
  }, [])

  return (
    <div ref={rootRef} className="space-y-8">
      <section>
        <SectionHeading
          title={t.businessTitle}
          description={t.businessBody}
          action={savedAt ? <span className="text-xs text-ok">{t.saved}</span> : undefined}
        />
        <Card>
          <div className="flex items-center gap-2 mb-4 text-muted">
            <Building2 size={16} />
            <span className="text-xs font-medium">{t.businessHint}</span>
          </div>
          <ProjectForm
            project={project}
            clients={clients}
            onSuccess={() => { setSavedAt(Date.now()); reload(); reloadProjects() }}
            onCancel={reload}
          />
        </Card>
      </section>

      <section>
        <SectionHeading title={t.connectionsTitle} description={t.connectionsBody} />
        <div className="space-y-4">
          {/* The publishing platform: WordPress or Shopify, one at a time. It owns
              its own connect/disconnect flow; this page only gives it a home. */}
          <div id={PROJECT_CONNECTION_ANCHOR} className="scroll-mt-20">
            <ContentSection projectId={project.id} />
          </div>

          {/* Search Console: optional evidence, the same panel the content screens link to. */}
          <div id={SETTINGS_GSC_ANCHOR} className="scroll-mt-20">
            <GscPanel projectId={project.id} />
          </div>

          <Card tone="sunk" className="flex items-start gap-3">
            <Plug size={16} className="mt-0.5 shrink-0 text-muted" />
            <p className="text-sm text-muted">{t.moreConnectionsSoon}</p>
          </Card>
        </div>
      </section>
    </div>
  )
}
