/**
 * /api/content/existing/map — the full-site mapping of the existing-content
 * screen: POST starts a run in the background, GET reads its progress.
 * The contract (auth, ownership, codes, one run at a time) lives in
 * lib/content/existing-content/map-http.ts and is exercised by
 * lib/content/existing-content/__qa__/site-map.qa.ts; this file wires the
 * real dependencies in.
 */
import { after } from 'next/server'
import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { handleMapGet, handleMapPost, type MapRouteDeps } from '@/lib/content/existing-content/map-http'
import { liveWalk, liveWordPress } from '@/lib/content/existing-content/site-map-run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The run's work window (WORK_MS) plus the final write; the platform clamps this to the plan's maximum.
export const maxDuration = 120

function liveDeps(): MapRouteDeps {
  return {
    enabled: () => isContentModuleEnabled(),
    auth: (projectId) => authContentProject(projectId),
    schedule: (task) => after(task),
    now: () => Date.now(),
    runDeps: (admin, scope) => ({
      now: () => Date.now(),
      walk: liveWalk,
      platform: liveWordPress(admin, scope.projectId, () => Date.now()),
    }),
  }
}

export async function POST(request: Request) {
  return handleMapPost(request, liveDeps())
}

export async function GET(request: Request) {
  return handleMapGet(request, liveDeps())
}
