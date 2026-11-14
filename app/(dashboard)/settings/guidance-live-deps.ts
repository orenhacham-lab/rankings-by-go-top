/**
 * The live session and service-role wiring the settings' server actions share.
 *
 * It is a plain module, not a 'use server' one, so that an action file can take
 * only what it needs: a component importing one action from a 'use server'
 * module pulls that WHOLE module into its server bundle, which is how the
 * article page came to carry the author photo's encoder, and with it sharp's
 * ~19 MB libvips (lib/__qa__/function-storage.qa.ts).
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GuidanceDeps } from '@/lib/content/writing-guidance/data'

export function liveDeps(): GuidanceDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    // The service role for the author photo's storage object only, after the owner check (author-photo.ts).
    storage: () => createAdminClient(),
  }
}

export const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)
