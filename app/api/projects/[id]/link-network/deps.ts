/**
 * The live dependencies of the link network's routes (lib/link-network/http.ts
 * holds the whole contract; the route files only wire these in).
 */
import type { NetworkDeps } from '@/lib/link-network/http'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export function liveNetworkDeps(): NetworkDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null }
    },
    admin: () => createAdminClient(),
    now: () => new Date(),
  }
}
