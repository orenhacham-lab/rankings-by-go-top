/**
 * The real dependencies of the monthly report's owner routes: the Supabase
 * session for who is asking, the service-role client for the reads (every one
 * filtered by the project and its owner, see store.ts), and the wall clock.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { renderPdfFromHtml } from '@/lib/export/pdfshift'
import type { MonthlyRouteDeps } from './http'

export function liveMonthlyDeps(): MonthlyRouteDeps {
  return {
    userId: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return !error && data?.user ? data.user.id : null
    },
    admin: () => createAdminClient(),
    now: () => new Date(),
    renderPdf: renderPdfFromHtml,
  }
}
