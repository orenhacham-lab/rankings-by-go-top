/**
 * GET|PUT /api/reminders/preferences — the settings switch for the reminder email
 * ("Email me when something is waiting for me"). Signed-in owner only; the contract lives in
 * lib/reminders/http.ts. Storing the switch sends nothing.
 */
import { handlePreferencesGet, handlePreferencesPut, type ReminderRouteDeps } from '@/lib/reminders/http'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function deps(): ReminderRouteDeps {
  return {
    userId: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return !error && data?.user ? data.user.id : null
    },
    admin: () => createAdminClient(),
    now: () => new Date(),
    env: process.env,
  }
}

export async function GET(request: Request) { return handlePreferencesGet(request, deps()) }
export async function PUT(request: Request) { return handlePreferencesPut(request, deps()) }
