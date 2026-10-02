/**
 * POST /api/content/topics/overlap — the cannibalization check before a manual topic
 * is saved. The contract lives in lib/content/cannibalization/http.ts and is exercised
 * by lib/content/cannibalization/__qa__/cannibalization.qa.ts; this file only wires
 * the real dependencies in.
 */
import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { handleOverlapCheck } from '@/lib/content/cannibalization/http'
import { loadOverlapIndex } from '@/lib/content/cannibalization/load'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleOverlapCheck(request, {
    enabled: () => isContentModuleEnabled(),
    auth: (projectId) => authContentProject(projectId),
    load: (admin, scope) => loadOverlapIndex(admin, scope, { gsc: isGscReadOnlyEnabled() }),
  })
}
