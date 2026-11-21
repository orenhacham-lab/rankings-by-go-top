/**
 * PUT /api/account/language — where the dashboard's language switcher is recorded
 * on the ACCOUNT, so that the emails a cron sends follow it. The contract and the
 * reasons live in lib/i18n/account-locale.ts; signed-in owner only.
 */
import { handleAccountLanguagePut, type AccountLanguageRouteDeps } from '@/lib/i18n/account-locale'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function deps(): AccountLanguageRouteDeps {
  return {
    userId: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return !error && data?.user ? data.user.id : null
    },
    admin: () => createAdminClient(),
  }
}

export async function PUT(request: Request) { return handleAccountLanguagePut(request, deps()) }
