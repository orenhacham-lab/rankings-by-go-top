/**
 * GET /api/gsc/export?projectId=...&window=28|90&format=xlsx|csv&language=he|en|es
 *
 * The Search Console positions report as a downloadable file. Read-only over the
 * latest succeeded sync of the window — the same rows the screens show, in a
 * file. The live rank report's export (lib/export/*) is not touched by this: see
 * lib/gsc/export/sheets.ts for why the two reports stay apart.
 *
 * The route authenticates itself (proxy.ts excludes /api/*); every decision lives
 * in handleGscExport, which is driven by injected dependencies so a QA suite can
 * exercise it without a database.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { latestSucceededRun } from '@/lib/gsc/service'
import { GSC_WINDOWS, type GscWindowDays } from '@/lib/gsc/sync'
import { handleGscExport, type GscExportRun } from '@/lib/gsc/export/http'
import { sheetsToXlsx } from '@/lib/gsc/export/workbook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleGscExport(request, {
    enabled: isGscReadOnlyEnabled,
    windows: GSC_WINDOWS,
    auth: async (projectId) => {
      const auth = await authContentProject(projectId)
      if ('error' in auth) return { ok: false, status: auth.status, error: auth.error }
      return { ok: true, admin: auth.admin, projectId: auth.project.id, userId: auth.user.id }
    },
    latestRun: async (admin, projectId, windowDays) => {
      const run = await latestSucceededRun(admin, projectId, windowDays as GscWindowDays)
      return (run ?? null) as GscExportRun | null
    },
    workbook: async (sheets) => sheetsToXlsx(sheets),
  })
}
