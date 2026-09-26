'use client'

/**
 * Search Console — the evidence screen: what Google already sees.
 *
 * The client-facing recommendations, the underlying Search Console data, the
 * connection panel that owns the OAuth round-trip, and (behind its own development
 * flag) the raw opportunity browser. These were three separate in-page tabs of the
 * old content page; they are one screen with its own route now, and the connection
 * sits with the data it produces instead of at the bottom of the articles page.
 */

import { useState } from 'react'
import GscRecommendations from '@/components/content/GscRecommendations'
import GscMetricsTable from '@/components/content/GscMetricsTable'
import GscOpportunities from '@/components/content/GscOpportunities'
import GscPanel from '@/components/content/GscPanel'
import { GSC_SETUP_ANCHOR } from '@/lib/content/content-hub-setup'
import { useContentWorkspace } from './ContentWorkspaceProvider'

export default function SearchConsoleScreen() {
  const { t, projectId, projects, toast, loadTopics } = useContentWorkspace()
  // L2 — within the Search Console area: client recommendations vs the underlying SC data.
  const [gscView, setGscView] = useState<'recommendations' | 'data'>('recommendations')

  return (
    <>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700">
                {([['recommendations', t.gscSubTabs.recommendations], ['data', t.gscSubTabs.data]] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setGscView(key)}
                    className={`text-sm px-3 py-2 -mb-px border-b-2 transition ${gscView === key ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-medium' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {gscView === 'recommendations' ? (
                <GscRecommendations
                  projectId={projectId}
                  onToast={(kind, text) => (kind === 'success' ? toast.success(text) : toast.error(text))}
                />
              ) : (
                <GscMetricsTable projectId={projectId} />
              )}
            </div>

      {/* Internal/dev-only raw opportunity browser (Stage E2A/E2B) — behind
          NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED. It is a diagnostic, never the
          merchant-facing recommendations above. */}
      {process.env.NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED === 'true' && (
        <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-6">
            <GscOpportunities
              projectId={projectId}
              projects={projects}
              onToast={(kind, text) => (kind === 'success' ? toast.success(text) : toast.error(text))}
              onTopicsChanged={loadTopics}
            />
        </div>
      )}

      {/* K4 — Search Console: connect, assign a property, reconnect on
          reauth_required — reusing the self-contained panel (no duplicated
          OAuth/token logic). connectOrigin="hub" returns the OAuth flow to the
          content workspace via the K4 callback cookie. GSC is an OPTIONAL
          evidence source; it is never required for topic generation. */}
      <div id={GSC_SETUP_ANCHOR} className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-6">
        <GscPanel projectId={projectId} connectOrigin="hub" />
      </div>
    </>
  )
}
