/**
 * GET /api/content/strategy?projectId= — the rows the content strategy tab's board is
 * built from. Read-only; the whole contract (gate, auth, owner filters, codes) lives in
 * lib/content/strategy/http.ts and is exercised by
 * lib/content/strategy/__qa__/content-strategy-route.qa.ts. This file only wires the
 * real dependencies in.
 */
import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { handleStrategyGet } from '@/lib/content/strategy/http'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleStrategyGet(request, {
    enabled: () => isContentModuleEnabled(),
    auth: (projectId) => authContentProject(projectId),
  })
}
