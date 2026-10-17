'use client'

/**
 * Widget 3's container: it adds what Search Console says to the facts the
 * dashboard route reported (business described, platform connected) and the
 * keywords the page counted, and renders the checklist only while something is
 * still open.
 *
 * Search Console's part is read through the same status hook its own widgets
 * use, so the checklist and the clicks tile can never disagree. While that state
 * is not known yet the checklist waits, rather than showing "connect Search
 * Console" to a merchant who already did; when it is switched off on the server
 * or cannot be read, the task is left out (setupTasks treats null as unknown).
 */
import { useGscStatus } from '@/components/gsc/gsc-data'
import type { GscStatusView } from '@/lib/gsc/widget-state'
import { platformSetupHref, settingsGscHref } from '@/lib/content/content-hub-setup'
import { setupTasks, type SetupTaskKey } from '@/lib/dashboard/activity'
import type { Section, SetupData } from '@/lib/dashboard/overview'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import SetupCompletion from './SetupCompletion'

/** Connected (with or without a first sync) is done; set-up states are open; the rest is unknown. */
export function gscSetupDone(view: GscStatusView): boolean | null {
  switch (view.state) {
    case 'ready':
    case 'never_synced':
      return true
    case 'not_connected':
    case 'reauth_required':
    case 'no_property':
      return false
    default:
      return null
  }
}

export function setupHrefs(projectId: string): Record<SetupTaskKey, string> {
  return {
    business: `/settings?projectId=${encodeURIComponent(projectId)}#business`,
    platform: platformSetupHref(projectId),
    gsc: settingsGscHref(projectId),
    keywords: '/keyword-research',
  }
}

export default function DashboardSetup({ t, projectId, facts, hasKeywords }: {
  t: DashboardDictionary['dashboardHome']
  projectId: string
  /** The dashboard route's setup section; null while it loads. */
  facts: Section<SetupData> | null
  hasKeywords: boolean
}) {
  const { view } = useGscStatus(projectId)
  if (!facts || view.state === 'loading') return null
  const known = facts.state === 'ready' ? facts.data : null
  const setup = setupTasks({
    business: known ? known.business : null,
    platform: known ? known.platform : null,
    gsc: gscSetupDone(view),
    keywords: hasKeywords,
  })
  if (!setup) return null
  return <SetupCompletion t={t} setup={setup} hrefs={setupHrefs(projectId)} />
}
